# P04 — `Retry-After` non borné : un seul `setTimeout` de 24 j 20 h, et **aucune** borne sur le nombre d'appels

> Révisé après verdict FAIL du 2026-10-03 — réécriture complète (fichier corrompu, C-21)

**Note d'intégrité (C-21).** Le fichier précédent faisait 726 lignes et portait en ligne 3 le
marqueur d'un autre rédacteur, `> Révisé après verdict \`PASS_WITH_CHANGES\`. Corrections appliquées :
7/7.` — différent de celui demandé ici. Rien de l'existant n'est conservé ; tout est reconstruit
depuis `verdicts/P04-verdict.md` et relu dans le code.

**Écart de statut, signalé et non masqué.** Le verdict sur disque déclare `PASS_WITH_CHANGES`
(`P04-verdict.md:15`), le brief m'annonce `FAIL`. J'écris l'en-tête exigé par le DoD et je retiens
le contenu opératoire du verdict : **3 objections MAJEURES** (`P04-verdict.md:29`, `:31`, `:33`) et
**7 Required changes** (`:43-49`), tous appliqués et tracés en § 10.

**Ce qui change de fond par rapport à la version FAIL.** Le plafond à 5 min appliqué à toute attente
était la régression principale (objection 1). Ici : plafond **par classe de cause**, budget **en
nombre de tentatives** et non en millisecondes, quota journalier **explicitement excepté**, heure de
reset **conservée**. Le compteur `attempt n/N` devient **arithmétiquement vrai** parce qu'il n'y a
plus de budget en millisecondes qui puisse le tronquer (objection 2).

---

## 1. Problem

Quand un fournisseur renvoie un en-tête `Retry-After`, une seule attente peut durer **24 jours,
20 heures et 31 minutes**, pendant laquelle l'agent dort sans rien décider ; et le nombre d'appels
au fournisseur n'est borné par **aucune** borne, donc l'attente se répète à l'identique sans fin.
Quand l'étape abandonne enfin, le message remis au modèle ne dit ni à quelle tentative on en est,
ni quelle est la cause, ni quoi en faire : l'agent relit la même erreur déterministe et reboucle.

Les deux défauts sont distincts et exigent deux bornes distinctes : l'un est un défaut de **temps**,
l'autre un défaut d'**amplification**. Une seule constante ne peut pas traiter les deux.

## 2. Evidence

Toutes les citations ci-dessous ont été **relues par tranches pendant cette révision**
(`read`, aucun shell). Les citations que je n'ai pas pu relire sont **retirées** et listées en § 2.3.

### 2.1 La borne de temps : 2 147 483 647 ms, et elle est atteinte par trois entrées hostiles

`packages/opencode/src/session/retry.ts:25-29` :

```ts
export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MIN_DELAY = 1 // avoid zero-duration retry loops
```

`retry.ts:35-40` (`safeDelay`, **unique point de passage** de tous les chemins de `delay`) :

```ts
function safeDelay(ms: number) {
  if (Number.isNaN(ms)) return RETRY_INITIAL_DELAY
  if (ms === Infinity) return RETRY_MAX_DELAY
  if (ms === -Infinity) return RETRY_MIN_DELAY
  return Math.max(RETRY_MIN_DELAY, cap(ms))
}
```

avec `retry.ts:31-33` : `function cap(ms: number) { return Math.min(ms, RETRY_MAX_DELAY) }`.

**Arithmétique, recalculée et non intuitée.** `RETRY_MAX_DELAY = 2_147_483_647 ms` vaut
`2 147 483,647 s` = **24 j + 20 h + 31 min + 23,647 s = 24,855 jours**. Trois entrées distinctes
atteignent exactement ce plafond, toutes relues :

| entrée hostile | branche | résultat exact |
|---|---|---|
| `retry-after-ms: 999999999999` | `retry.ts:50` `return safeDelay(parsedMs)` | `2 147 483 647 ms` |
| `retry-after: 2147484` | `retry.ts:59` `return safeDelay(Math.ceil(parsedSeconds * 1000))` | `2 147 483 647 ms` |
| `retry-after: <date HTTP il y a 30 j>` | `retry.ts:62-64` `const parsed = Date.parse(retryAfter) - Date.now()` | `2 147 483 647 ms` |
| `retry-after-ms: "Infinity"` | `:48` `parseFloat` → `Infinity`, `:37` | `2 147_483_647 ms` |

`retry.test.ts:82-85` **fige déjà ce plafond comme comportement voulu** :

```ts
test("caps oversized header delays to the runtime timer limit", () => {
  const error = apiError({ "retry-after-ms": "999999999999" })
  expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)
})
```

### 2.2 La branche « en-têtes présents mais inutilisables » est **non bornée** — objection 5, corrigée

`retry.ts:42-73`, les **cinq** points de sortie (et non « trois », énoncé faux de la version FAIL) :

| ligne | chemin | plafond aujourd'hui |
|---|---|---|
| `:50` | `retry-after-ms` exploitable | `RETRY_MAX_DELAY` = 24,855 j |
| `:59` | `retry-after` numérique exploitable | `RETRY_MAX_DELAY` = 24,855 j |
| `:64` | `retry-after` en date HTTP | `RETRY_MAX_DELAY` = 24,855 j |
| **`:68`** | **en-têtes présents, aucun exploitable** | **`RETRY_MAX_DELAY` = 24,855 j — aucun plafond de 30 s** |
| `:72` | aucun en-tête | `Math.min(…, RETRY_MAX_DELAY_NO_HEADERS)` = **30 s** |

`retry.ts:68`, verbatim — c'est la branche que la version FAIL décritait à tort comme bornée :

```ts
      return safeDelay(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1))
```

**Croissance exponentielle recalculée sur cette branche.** `:68` vaut `2000 × 2^(attempt−1)` ms,
passé à `safeDelay` donc plafonné par `cap` :

- `attempt 21` → `2000 × 2^20` = `2_097_152_000 ms` — **sous** le plafond, passe **inchangé** (≈ 24,27 j) ;
- `attempt 22` → `2000 × 2^21` = `4_194_304_000 ms` = **48,54 j** — **dépassement**, `safeDelay` renvoie `2_147_483_647 ms` ;
- `attempt ≥ 22` → **épinglé à 2 147 483 647 ms = 24,855 j, indéfiniment**.

**Le nombre exact que demande le blocage 2 : `2_147_483_647 ms`, soit 24 j 20 h 31 min 23,647 s,
atteint dès la 22ᵉ tentative sur la branche `:68`, et dès la 1ʳᵉ tentative sur les branches d'en-tête
exploitable (`:50`, `:59`, `:64`).** La version FAIL annonçait « ≈ 24,8 jours » : l'ordre de grandeur
est bon, la valeur exacte est **24,855**, et surtout le multiplicateur est **infini** (§ 2.3). Le
mécanisme est donc inutilisable en l'état, et pas seulement inconfortable : c'est un fait de
conception, traité comme tel en § 4.

### 2.3 Le nombre d'appels n'est borné par rien — `policy()` ne teste jamais `meta.attempt`

`retry.ts:190-194` puis `:229` (relevé intégral, `policy()` complet en `:183-233`) :

```ts
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      const error = opts.parse(meta.input)
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
```

```ts
        return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
```

Il n'existe **aucune** comparaison à `meta.attempt` ni à un budget cumulé dans tout `policy()`.
La seule sortie est `Cause.done` quand l'erreur **cesse** d'être retryable. Donc, aujourd'hui :

- une `APIError` 429 refusée indéfiniment par le fournisseur ⇒ **boucle sans fin**, ~10 essais de
  24,855 j par jour, **sans plafond d'appels** ;
- une erreur de lancement Windows acceptée par `isTransientLaunchFailure`
  (`packages/core/src/launch-retry.ts:12`) ⇒ `delay()` reçoit `undefined`
  (`retry.ts:196` : `MessageV2.APIError.isInstance(error) ? error : undefined`) ⇒ branche `:72`,
  30 s par essai, **sans plafond d'appels** non plus.

**Le plafond de 24,855 j n'est donc pas le pire : il n'y a pas de pire, seulement une absence de
borne.** C'est l'invariant « non-amplification » que la version FAIL invoquait sans l'établir.

### 2.4 Le quota journalier : le cas nominal de ce dépôt, pas un cas exotique — objection 1

`retry.ts:96-100`, relu :

```ts
    if (error.data.responseBody?.includes("GoUsageLimitError")) {
      const body = parseJSON(error.data.responseBody)
      const workspace = str(body?.metadata?.workspace)
      const limitName = str(body?.metadata?.limitName)
      const retryAfter = num(error.data.responseHeaders?.["retry-after"])
```

`retry.ts:101-112` convertit ce `retry-after` en jours/heures/minutes (`:104` `Math.floor(seconds / 86_400)`),
`retry.ts:114` produit le message qui **expose l'heure de reset** :

```ts
      const message = `${limitName ? `${limitName} usage limit` : "Usage limit"} reached. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`
```

`retry.ts:117-127` renvoie en plus un `action` avec `retry.ts:120` `reason: "account_rate_limit"`,
`retry.ts:123` `message` (l'heure de reset) et `retry.ts:125` `link`.

**La régression, recalculée.** Quota de 6 h ⇒ `retry-after: 21600` ⇒ `retry.ts:59` ⇒
`21 600 000 ms`. Sous le plafond de 5 min + budget de 900 000 ms de la version FAIL : l'essai 1
calcule `0 + 300 000 ≤ 900 000` (admis), l'essai 2 `600 000 ≤ 900 000` (admis), l'essai 3
`900 000 > 900 000` (faux, admis), l'essai 4 `1 200 000 > 900 000` (**vrai**) ⇒ **échec terminal à
la 4ᵉ tentative**. Aujourd'hui, le même quota **aboutit** : l'attente de 6 h précède une tentative
qui réussit. Le plafond transformait un quota légitime qui aboutit en échec — c'est la régression
fonctionnelle principale, et elle est réelle.

### 2.5 Les formes de rate-limit les plus fréquentes ne sont pas des `APIError` — objection 4

`retry.ts:132-143`, relu :

```ts
  const msg = isRecord(error.data) ? error.data.message : undefined
  if (typeof msg === "string") {
    const lower = msg.toLowerCase()
    if (
      lower.includes("rate increased too quickly") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests")
    ) {
      return { message: msg }
    }
  }
```

`retry.ts:145-158`, relu : `:150` `return { message: "Too Many Requests" }`, `:153`
`return { message: "Provider is overloaded" }`, `:156` `return { message: "Rate Limited" }`,
`:158` `return undefined`.

Ces quatre formes n'ont **ni `statusCode` ni `action`**. Une cause dérivée de `statusCode` ou de
`retry.action.reason` y vaut `undefined` ⇒ repli sur `"tool"`, ce qui **inverse** l'action prescrite
sur un rate-limit avéré. C'est l'objection 4, et elle est exacte.

### 2.6 Un 429 n'a pas de branche dédiée dans `retryable()` — vérifié, et cela contraint § 4

`retry.ts:78-95` : `:79` `const status = error.data.statusCode`, `:82` le garde de retryabilité,
`:83` la branche `FreeUsageLimitError` (`reason: "free_tier_limit"`, `:87`). `:96` la branche
`GoUsageLimitError`, `:129` le repli :

```ts
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
```

Entre `:82` et `:129`, **aucune** branche ne teste `429`. Un `429` retryable atterrit donc sur `:129` :
`action` **absent**, message = celui du fournisseur. Toute cause ne peut donc pas être dérivée de
`action.reason` seul — il faut aussi lire la forme du message.

### 2.7 L'information de diagnostic ne sort que par le log — base de l'objection 6

`processor.ts:934-936`, relu :

```ts
      const halt = Effect.fn("SessionProcessor.halt")(function* (e: unknown) {
        slog.error("process", { error: errorMessage(e), stack: e instanceof Error ? e.stack : undefined })
        const error = parse(e)
```

La stack ne sort que par le log : un message terminal reconstruit n'a pas à la porter. Mais
`errorMessage(e)` est le **seul** porteur du diagnostic fournisseur (« Overloaded », corps d'un 5xx) :
un message reconstruit depuis `statusCode` seul le détruit. D'où l'assertion de non-régression du § 7.

### 2.8 Les classes d'échec de lancement : le site réel, et le compte exact

**Correction du brief.** La citation `retry.ts:8` est **fausse** : `retry.ts:8` vaut
`export type Err = ReturnType<NamedError["toObject"]>`. Le site réel est
**`packages/core/src/launch-retry.ts:8`** (chemin localisé par `glob`, fichier relu) :

```ts
const transientLaunch = /EPERM|EACCES|EBUSY|operation not permitted|uv_spawn|Access is denied|Accès refusé|error launching/i
```

relit `launch-retry.ts:9` `const transientTag = /^(PermissionDenied|Busy)$/` et `:10`
`const transientCode = /^(EPERM|EACCES|EBUSY)$/`.

**Le compte n'est pas « six » mais huit** alternatives sur `:8` — `EPERM`, `EACCES`, `EBUSY`,
`operation not permitted`, `uv_spawn`, `Access is denied`, `Accès refusé`, `error launching` — plus
deux tags et trois codes sur `:9-10`. Le verdict lui-même (`P04-verdict.md:26` pour C-16) en compte
six et omet `Accès refusé` et `error launching`. **La conclusion obligatoire est donc celle du brief,
et elle est même plus forte qu'énoncé** : un message terminal qui fige `EPERM` serait faux, puisque
`EBUSY`, `EACCES`, `Accès refusé` et le fourre-tout `error launching` sont acceptés au même titre.
Aucun texte de § 4 ne nomme un code d'erreur en particulier.

### 2.9 Citations retirées (non relues pendant cette révision)

Conformément à la règle « supprime celle que tu ne peux pas relire », sont **absentes** de ce
document : `processor.ts:945-955` et `processor.ts:945-959` (le bloc d'échec terminal — la ligne 29 du
verdict le corrige en `945-955`, mais je ne l'ai pas relu et je ne le cite donc pas, Required change 6
est traité en § 10 sans citation de code), `message-v2.ts:50-57`, `llm.ts:67`, `:188`, `:371`,
`:406`, `:441`, `prompt.test.ts:1277`, `retry.test.ts:188`, `retry.test.ts:200`.

### 2.10 `INFERE:` la chaîne entre échec de lancement et `SessionRetry.policy`

**INFERE :** une erreur de lancement refusée par `isTransientLaunchFailure` (`launch-retry.ts:12`)
atteint `SessionRetry.policy` et y est reclassée en `launch_denied`. **Ce que j'ai vérifié :** le
wrapper de retry est installé sur le `stream` uniquement — `processor.ts:1001-1031`
`Effect.retry(SessionRetry.policy({ provider: input.model.providerID, parse, set: (info) => … }))`,
avec `processor.ts:1020-1026` `status.set(ctx.sessionID, { type: "retry", attempt: info.attempt, message: info.message, action: info.action, next: info.next })`, et `:1032` `Effect.catch(halt)`. **Ce que je n'ai pas vérifié :** qu'un échec de lancement emprunte ce chemin. **Comment le vérifier :** `read` de `packages/core/src/launch-retry.ts:23-77` et du point d'appel de `isTransientLaunchFailure`. Tant que ce lien n'est pas relu, `launch_denied` est une **cause possible sansfassement** : le § 7 la teste par `policy()` directement, ce qui est valide quoi qu'il arrive du lien réel.

## 3. Mechanism

1. `processor.ts:976` `const stream = llm.stream(streamInput)` ; `:978-982` le `stream` est drainé.
2. Une APIError retryable remonte ; `processor.ts:1001` installe
   `Effect.retry(SessionRetry.policy({ provider: input.model.providerID, parse, set }))`.
3. `retry.ts:192` `const error = opts.parse(meta.input)` ; `:193` `const retry = retryable(error, opts.provider)`.
4. `retryable()` `:78-82` accepte toute `APIError` `isRetryable` ou `statusCode ≥ 500` ; `:83` et `:96`
   reconnaissent les deux classes de quota ; `:129` renvoie le message fournisseur ; `:141`/`:150`/`:153`/`:156`
   reconnaissent quatre formes de rate-limit en texte.
5. `:196` `const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined)`
   — **le `attempt` réel est déjà disponible ici**, et c'est le seul endroit où il l'est.
6. `delay()` `:42-73` choisit l'un des **cinq** chemins du tableau § 2.2 ; tous passent par
   `safeDelay` `:35-40`, seul point de passage, dont le seul plafond utile est `RETRY_MAX_DELAY`
   = 24,855 j.
7. `:197` `const now = yield* Clock.currentTimeMillis` ; `:211-222` journalise ; `:223-228`
   `opts.set({ attempt: meta.attempt, message: retry.message, action: retry.action, next: now + wait })`
   → `processor.ts:1020-1026` écrit le statut visible.
8. `:229` `return [meta.attempt, Duration.millis(wait)]` → l'étape **dort**.
9. Répétition : le chemin **7-8 est réarmé indéfiniment** (§ 2.3), la durée de 8 étant 24,855 j sur
   quatre des cinq chemins.
10. Abandon : `processor.ts:1032` `Effect.catch(halt)` → `:935` journalise, et le message qui remonte
    au modèle est `retry.message` — sans compteur, sans cause, sans action.

## 4. Proposal

### 4.1 Bornes, par classe de cause — objection 1 et objection 5

`retry.ts:25-29` est remplacé par :

```ts
export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MIN_DELAY = 1 // avoid zero-duration retry loops
export const RETRY_AFTER_MAX_DELAY = 300_000 // 5 min — rate limit non quota
export const RETRY_QUOTA_MAX_DELAY = 86_400_000 // 24 h — un quota journalier tient dans 24 h
export const RETRY_MAX_ATTEMPTS = 10 // plafond NON quota, en nombre d'appels
export const RETRY_QUOTA_MAX_ATTEMPTS = 1 // un quota se diffère une fois, il ne se boucle pas
```

`safeDelay` (`:35-40`) devient `safeDelay(ms: number, ceiling: number)` et **cesse d'être le seul
plafond** : `cap` prend le `ceiling` reçu au lieu de la constante. Les quatre chemins à en-tête
exploitable (`:50`, `:59`, `:64`) et la branche non bornée `:68` passent
`RETRY_AFTER_MAX_DELAY` ; `:72` garde `RETRY_MAX_DELAY_NO_HEADERS` et **reste inchangé**.

**`:68` passe de 24,855 j / 68 min à 5 min** — c'est exactement l'énoncé manquant de la version FAIL
(objection 5). La branche `:72` passe de 30 s à 30 s : **aucun changement de comportement**, et c'est
délibéré.

### 4.2 `describeFailure` : un ensemble **fermé** de causes — objections 4 et 6

Nouveau, dans `retry.ts` (pas de module séparé), sur les seules formes **produites par
`retryable()` lui-même** :

```ts
export type FailureCause =
  | "account_quota"      // action.reason === "account_rate_limit"  (retry.ts:120)
  | "free_tier_limit"    // action.reason === "free_tier_limit"     (retry.ts:87)
  | "provider_overloaded"// "Overloaded" / :129 / :153
  | "rate_limited_http"  // "Too Many Requests"                     (:150)
  | "rate_limited_code"  // "Rate Limited"                          (:156)
  | "rate_limited_text"  // motifs en texte plein                   (:141)
  | "server_5xx"         // statusCode >= 500                       (:82)
  | "launch_denied"      // INFERE, § 2.10 — jamais un code nommé
  | "transient_other"

export function describeFailure(input: { provider: string; cause: FailureCause; retry?: Retryable }) {
  const quota = input.cause === "account_quota" || input.cause === "free_tier_limit"
  const attempts = quota ? RETRY_QUOTA_MAX_ATTEMPTS : RETRY_MAX_ATTEMPTS
  // 1) l'heure de reset du fournisseur est CONSERVÉE en tête : retry.action.message la porte déjà
  //    (retry.ts:123). 2) le message fournisseur survit : c'est le seul diagnostic réel (objection 6).
  const detail = input.retry?.action?.message ?? input.retry?.message
  const hint = HINT[input.cause] // rate_limit: réessaie plus tard | quota: réessaie à la levée | ...
  return {
    message: `attempt ${n}/${attempts} · ${input.cause} · ${input.provider} — ${hint}${detail ? ` — ${detail}` : ""}`,
    cause: input.cause,
  }
}
```

Trois règles non négociables :

- **`action.message` passe avant `action.reason`** : l'heure de reset produite par `retry.ts:114`
  et portée par `retry.ts:123` **survit** dans le message terminal. C'est la régression d'information
  que le verdict nomme comme le péché aggravant de la version FAIL.
- **`retry.message` survit** : le diagnostic fournisseur n'est jamais reconstruit à partir du seul
  `statusCode` (objection 6).
- **aucune cause ne mentionne un code d'erreur de lancement** (§ 2.8, C-16).

Le message est plafonné à 240 caractères **après** la troncature du détail, et ne contient jamais
`"\n    at "` (`processor.ts:935` prouve que la stack ne sort que par le log).

### 4.3 Budget **en tentatives**, pas en millisecondes — objection 1 (dernier volet) et objection 2

Dans `policy()`, `waited` est déclaré **hors** de `Effect.succeed` (donc hors du `meta` capturé) et
l'arrêt est une comparaison de **compte** :

```ts
  let attemptsSpent = 0
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      attemptsSpent += 1
      const error = opts.parse(meta.input)
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
      const cause = classify(retry, error)
      const quota = cause === "account_quota" || cause === "free_tier_limit"
      const maxAttempts = quota ? RETRY_QUOTA_MAX_ATTEMPTS : RETRY_MAX_ATTEMPTS
      if (attemptsSpent >= maxAttempts) {
        return Cause.fail(describeFailure({ provider: opts.provider, cause, retry }))
      }
      const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined, cause)
      …
```

Trois conséquences, chacune vérifiable :

1. **`attempt n/N` est vrai par construction.** Il n'existe plus de budget en millisecondes : la
   seule raison d'arrêter est le compte. Pour un `429` répété, la 11ᵉ tentative n'est jamais émise
   et le message dit `attempt 10/10`. **C'est la réponse à l'objection 2** : la version FAIL affichait
   `attempt 10/10` alors qu'elle produisait `attempt 4/10` parce que le budget en ms mordait en premier.
2. **Le nombre d'appels est borné par un compte, pas par une durée** — c'est précisément ce que le
   verdict demandait (`P04-verdict.md:43`). Aucune constante en millisecondes ne peut_plus rendre le
   compteur faux.
3. **Le quota est préservé** : `retry-after: 21600` ⇒ `wait = 21 600 000 ms` sous
   `RETRY_QUOTA_MAX_DELAY = 86_400_000` ⇒ **une seule** attente de 6 h, puis re-tentative qui
   **aboutit** comme aujourd'hui. `RETRY_QUOTA_MAX_ATTEMPTS = 1` supprime seulement la
   ré-accumulation (aujourd'hui 6 h + 6 h + 6 h…), qui n'apporte rien.

### 4.4 Bornes dérivées, énoncées comme des produits — pas comme une constante magique

| classe | plafond d'attente | plafond d'appels | pire horloge murale |
|---|---|---|---|
| rate limit / 5xx / transitoire | `RETRY_AFTER_MAX_DELAY` = 300 000 ms | `RETRY_MAX_ATTEMPTS` = **10** | `10 × 300 000` = **3 000 000 ms = 50 min** |
| aucun en-tête (`:72`) | 30 000 ms | 10 | `10 × 30 000` = 300 000 ms = 5 min |
| quota / free tier | `RETRY_QUOTA_MAX_DELAY` = 86 400 000 ms | 1 | 24 h, **une fois** |

Aujourd'hui, la première ligne est **non bornée** (§ 2.3). L'invariant « non-amplification » passe
de « affirmé » à « établi par un compte ».

### 4.5 Périmètre des sites d'outil — objection 3

`prompt.ts:871` et `auto-execute.ts:98-99` **sortent du périmètre de P04**. Preuve :

```ts
// prompt.ts:871
            error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
```

```ts
// auto-execute.ts:98-100
              Effect.catch((err: unknown) =>
                Effect.succeed({ error: `Tool execution failed: ${err}` }),
              ),
```

`policy()` prend `provider: string` (`retry.ts:184`) et `parse: (error: unknown) => Err`
(`retry.ts:187`) comme **entrées** ; `auto-execute.ts:98` intercepte en `err: unknown` et n'a ni l'un
ni l'autre, et `prompt.ts:871` interpole déjà le `message` d'une erreur d'outil typée — il y faudrait
faire descendre un couple `provider` + `parse` depuis l'appelant. Ce n'est pas « deux appels d'une
ligne » : c'est un travail de plomberie dans deux modules distincts, qui justifie sa propre
proposition (P04-bis). Ici, `prompt.ts:871` est **volontairement inchangé** : le préfixe
`Tool execution failed:` est un contrat de rendu, pas un défaut de retry.

### 4.6 Ce qui reste inchangé, et pourquoi

- **`retry.ts:72`** (30 s sans en-tête) : déjà correct, et c'est le chemin des échecs de lancement.
- **`retryable()`** `:78-158` : aucune de ses formes n'est réécrite ; P04 ne fait qu'**observer** sa
  sortie pour la classer. C'est ce qui garantit que l'ensemble de causes reste fermé sur les formes
  que le code produit déjà (objection 4).
- **`processor.ts:1001-1031`** : le `set` reçoit déjà `attempt` et `action` (`:1020-1026`) ; aucun
  changement de contrat d'événement, donc aucun changement côté client.
- **`retry.ts:129`** : le message fournisseur reste le texte par défaut ; P04 n'y touche pas.
- **Aucun fichier sous `packages/**` n'est modifié par cette proposition** : c'est un document.

## 5. Alternatives considered

1. **Plafonner toute attente à 5 min, comme la version FAIL.** Rejeté : c'est la régression
   fonctionnelle démontrée au § 2.4 — un quota Go de 6 h qui **aboutit** devient un échec à la
   4ᵉ tentative. Le plafond est la bonne idée mal appliquée : il faut une exception nommée, pas une
   absence de plafond.
2. **Garder `RETRY_TOTAL_BUDGET_MS` en millisecondes et corriger l'exemple en `attempt 4/10`.**
   Rejeté : l'objection 1 a raison, `900 000 > 300 000` ne borne **ni le temps ni le nombre d'appels**
   de façon découplée, et un compteur qui affiche `4/10` indique au modèle qu'il reste 6 essais
   alors qu'il n'en restera aucun. Un compteur qui ment est pire qu'un compteur absent.
3. **Ne borner que le temps, sans plafond d'appels.** Rejeté : c'est l'état actuel (§ 2.3) ; un
   plafond de 24,855 j sans plafond de compte laisse la session en sommeil perpetuel.
4. **Supprimer la boucle de retry sur les formes déterministes (`account_quota` inclus).** Rejeté :
   un quota journalier est légitime etIW temporary ; on ne le supprime pas, on le diffère une fois.
5. **Classer par `statusCode` seul.** Rejeté : § 2.5 et § 2.6 — les formes les plus fréquentes
   n'ont pas de `statusCode`, et un 429 n'a pas de branche dédiée. Le repli sur `"tool"` inverse
   l'action prescrite.
6. **Élever `RETRY_AFTER_MAX_DELAY` à 24 h « pour ne rien casser ».** Rejeté : cela ne change rien au
   nombre d'appels (§ 2.3) et supprime la seule borne qui protège d'un `Retry-After` hostile.

## 6. Risks

- **Régression sur les tests existants — nommée et assumée.**
  `packages/opencode/test/session/retry.test.ts` : `:74-80`
  (`uses retry-after values even when exceeding 10 minutes with headers`) devient **rouge** sur
  `:79` (`expect(...).toBe(700000)` ⇒ `300000`) ; `:82-85`
  (`caps oversized header delays to the runtime timer limit`) devient **rouge** sur `:84`
  (`toBe(RETRY_MAX_DELAY)` ⇒ `300000`). Ces deux tests **encodent l'ancienne politique**, dont le
  changement est précisément le but ; ils sont à réécrire, pas à ajuster par seuil (cf. C-15 : un
  ajustement de seuil effacerait la couverture). `:87-117` (`it.live`, `retry-after-ms: "0"` ⇒
  `safeDelay(0)` = 1 ms, deux `step(error)` en `:107-108`, `attempt: 2` attendu en `:110-114`)
  **survit** : avec un plafond de 10 tentatives, deux appels ne l'atteignent pas. Ce test est le
  garde-fou de l'isolation par étape et il est conservé tel quel.
- **Coût en latence ajouté : nul.** Le correctif **diminue** le pire cas de « non borné » à
  50 min (non quota) et de « non borné » à 24 h (quota, une fois). Le coût en tokens est nul :
  `describeFailure` ajoute ~40 caractères à un message qui en porte déjà plusieurs centaines, une
  seule fois par abandon.
- **Risque de sécurité : aucun.** Aucun identifiant, aucune permission, aucune donnée de fichier
  n'est touché ; `describeFailure` n'est jamais émis ailleurs que dans le statut d'étape déjà publié
  (`processor.ts:1020-1026`). Pas d'injection possible : les seules valeurs interpolées proviennent
  de `retry.message` / `action.message`, déjà affichés aujourd'hui.
- **Risque résiduel assumé :** un `Retry-After` légitime de 6 h sur un 429 *non quota* verra désormais
  l'étape échouer après 50 min au lieu d'aboutir. C'est un choix : ces fenêtres ne sont pas
  documentées par les fournisseurs dans le dépôt, et l'objection 1 demande une **mesure** que je n'ai
  pas (§ 10,.Required change 1). Le correctif ne prétend pas l'avoir vérifié.

## 7. Tests

**Commande.** `cmd /d /c cd packages\opencode && bun test test\session\retry.test.ts test\session\retry-bounds.test.ts`
— forme `cmd /d /c` employée par les tâches déclarées de cet environnement. **Elle n'a pas été
exécutée** : l'interdiction shell de cette révision m'en empêche. Elle est donc **un critère de
succès à vérifier, pas un critère acquis** (Required change 7 inachevé, cf. § 10).

1. **Plafond d'attente hostile** — `packages/opencode/test/session/retry-bounds.test.ts`.
   `apiError({"retry-after-ms": "999999999999"})` puis `delay(1, e, "rate_limited_http")`
   ⇒ `RETRY_AFTER_MAX_DELAY` (**pas** `RETRY_MAX_DELAY`). Réutilise `apiError()` de
   `retry.test.ts:19-27`. Critère : l'assertion `toBe(300_000)` passe.
2. **Branche `:68` désormais bornée** — même fichier. `apiError({ "x-other": "1" })` (en-têtes
   présents, aucun exploitable) ⇒ `delay(22, e, "transient_other")` = `300_000`, et non `2 147 483 647`.
3. **Non-régression du quota** — même fichier, `TestClock`. `retry-after: 21600`, cause
   `account_quota` ⇒ **exactement une** attente de `21_600_000 ms` ; le `set` est appelé **1 fois** ;
   l'état final n'est pas un échec.
4. **Test non-amorçant du nombre d'appels (Required change 1)** — même fichier, `TestClock`, aucun
   sleep réel. On appelle `step(429)` en boucle jusqu'à `Cause.done`/`Cause.fail` et on **compte les
   appels `set`** : critère = `calls === 10` et `done === true` au 11ᵉ `step`. Ce test échoue dans le
   monde d'aujourd'hui (boucle infinie) : il distingue les deux mondes, contrairement à la forme
   du test C-20.
5. **Compteur arithmétiquement vrai (Required change 2)** — même test que 4, sur le message terminal :
   il doit contenir `attempt 10/10` et **ne doit contenir aucune** occurrence de `attempt 11/`.
6. **Quota > 24 h** — `retry-after: 90000` avec cause `account_quota` ⇒ attente `86_400_000 ms`,
   puis échec terminal **avec l'heure de reset dans le texte** (`assert` sur `It will reset in`).
   C'est l'objection 1 : l'information ne doit pas disparaître.
7. **Non-régression du message fournisseur (Required change 7, objection 6)** — `message` =
   `"Overloaded"` avec `statusCode` 503 ⇒ le message publié **contient** `Overloaded`. Sans cette
   assertion, un reconstructeur de message peut tout casser en restant vert.
8. **Les six… huit classes de lancement** — `describeFailure` avec `cause: "launch_denied"` doit
   produire un message qui ne contient **aucun** des codes `EPERM`, `EACCES`, `EBUSY`, `uv_spawn`
   (critère négatif, conforme à C-16 et à § 2.8).
9. **Survie de `retry.test.ts:87-117`** — critère : la suite sort avec le même `attempt: 2`.

`TestClock` exclusivement pour `policy()` ; **jamais** pour `delay()`, qui appelle `Date.now()`
(`retry.ts:62`). Aucun `it.live` avec le nouveau plafond — il dormirait 300 s.

## 8. Effort

**M** — et non `S`. `retry.ts` seul (`safeDelay` + 4 constantes + plafond de compte dans `policy()`)
serait `S` ; c'est le fait que **`delay()` doit apprendre la cause** (signature
`delay(attempt, error, cause)` chiamée depuis `:196`, donc `retryable()` doit exposer la cause) et la
table `describeFailure` à 9 entrées qui font passer l'ensemble en `M`. Le `S` annoncé était faux
(objection 3) et le resterait même après avoir sorti les deux sites d'outil du périmètre.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — sur **un seul** point, que le validateur doit trancher et que je ne peux pas
trancher sans shell :

> **Faut-il mesurer les `Retry-After` réels par fournisseur avant d'appliquer
> `RETRY_AFTER_MAX_DELAY = 300_000` sur la classe non quota ?** Le verdict
> (`P04-verdict.md:29`) demande cette mesure ; je ne l'ai pas faite et je ne prétends pas l'avoir
> faite. Si la mesure montre un `Retry-After` légitime > 300 s hors quota, alors
> `RETRY_AFTER_MAX_DELAY` doit être relevé **et** la borne de compte (`RETRY_MAX_ATTEMPTS = 10`)
> doit être abaissée pour que `10 × plafond ≤ 50 min` reste vrai — c'est le **produit** qui est la
> borne, jamais une constante isolée.

Second point, non bloquant : le statut écrit sur disque est `PASS_WITH_CHANGES` (`P04-verdict.md:15`)
alors que le brief m'annonce `FAIL`. Les 3 objections MAJEURES et les 7 Required changes sont
identiques dans les deux lectures, donc la révision est la même ; mais le validateur doit confirmer
que le statut attendu est bien `FAIL`.

## 10. Traçabilité des Required changes

| # | Exigence (`P04-verdict.md:43-49`) | Où | État |
|---|---|---|---|
| 1 | Mesurer les `Retry-After` réels **ou** exceptionner nommément `account_rate_limit` ; conserver l'heure de reset ; test non-amorçant du nombre d'appels | § 4.1 (plafond par classe), § 4.2 (« `action.message` passe avant `action.reason` »), § 4.3 (compte), § 7.4 et § 7.6 | **partiel** — l'exception nommée et le test sont faits ; **la mesure ne l'est pas** (§ 9) |
| 2 | Réconcilier `attempt 10/10` / « 10ᵉ erreur » / test 7 avec l'arithmétique réelle, ou borner en tentatives | § 4.3 — budget en tentatives, plus de budget en ms, `attempt 10/10` vrai par construction ; § 7.5 | **fait** |
| 3 | Reclasser en `M` ou sortir `auto-execute.ts:98-99` du périmètre | § 4.5 (sortie du périmètre, avec la preuve), § 8 (`M`, justifié par `delay()` qui doit apprendre la cause) | **fait** |
| 4 | Étendre l'ensemble fermé de causes à `retry.ts:141/150/153/156` | § 4.2 : `rate_limited_text` (`:141`), `rate_limited_http` (`:150`), `provider_overloaded` (`:153`), `rate_limited_code` (`:156`) | **fait** |
| 5 | Corriger « trois chemins » et décrire `:68` | § 2.2 (table à **cinq** chemins), § 4.1 (`:68` passe de 24,855 j / 68 min à 5 min) | **fait** |
| 6 | Corriger `processor.ts:945-959` → `945-955` | § 2.9 — **citation retirée** faute de relecture ; le bloc est nommé sans numéro de ligne, conformément à la règle de retrait | **fait par retrait** |
| 7 | Ajouter l'assertion de non-régression du message fournisseur ; vérifier la commande `bun test` | § 7.7 (assertion `Overloaded`) ; § 7 commande + § 9 | **partiel** — l'assertion est faite ; **la commande n'est pas vérifiée** (interdiction shell) |