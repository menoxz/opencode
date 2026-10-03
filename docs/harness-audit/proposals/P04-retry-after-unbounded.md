# P04 — `Retry-After` non borné (≈ 24,8 jours) et erreur de retry sans compteur d'essai

## 1. Problem

Quand le fournisseur renvoie un en-tête `Retry-After`, le délai d'attente n'est plafonné
que par la limite technique de `setTimeout` — jusqu'à ≈ 24,8 jours d'attente pendant
laquelle l'agent dort sans rien décider — et, quand le délai finit par expirer ou quand
l'étape abandonne, le message d'erreur remis au modèle ne dit ni à quelle tentative on
en est, ni quelle est la cause, ni quoi en faire : l'agent relit donc la même erreur
déterministe et reboucle.

## 2. Evidence

**Plafond de délai.** Constantes et seule borne de la branche « avec headers » :

`packages/opencode/src/session/retry.ts:25-29`
```ts
export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
export const RETRY_MIN_DELAY = 1 // avoid zero-duration retry loops
```

`packages/opencode/src/session/retry.ts:54-60` — la conversion seconde → milliseconde
passe par `safeDelay`, dont le seul plafond est `cap()` :

```ts
      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return safeDelay(Math.ceil(parsedSeconds * 1000))
        }
```

`packages/opencode/src/session/retry.ts:31-40` — `cap()` ne compare qu'à `RETRY_MAX_DELAY` :

```ts
function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

function safeDelay(ms: number) {
  if (Number.isNaN(ms)) return RETRY_INITIAL_DELAY
  if (ms === Infinity) return RETRY_MAX_DELAY
  if (ms === -Infinity) return RETRY_MIN_DELAY
  return Math.max(RETRY_MIN_DELAY, cap(ms))
}
```

`2_147_483_647 ms ÷ 86_400 = 24,855` jours. Aucune borne de temps, aucun budget
d'attente cumulée, aucun plafond de nombre de tentatives n'existe dans le chemin
« avec headers ».

**Contraste avec la branche « sans headers »**, qui est bornée à 30 s :

`packages/opencode/src/session/retry.ts:72`
```ts
  return safeDelay(Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS))
```

Donc un 429 **sans** en-tête dort 30 s maximum, et un 429 **avec** `Retry-After: 216000`
dort 2,5 jours. Le comportement est inversé par rapport à l'intention.

**Tests existants qui encodent le défaut** (ils devront être réécrits, cf. § 6) :

`packages/opencode/test/session/retry.test.ts:78-79`
```ts
    const longError = apiError({ "retry-after-ms": "700000" })
    expect(SessionRetry.delay(1, longError)).toBe(700000)
```
`packages/opencode/test/session/retry.test.ts:83-84`
```ts
    const error = apiError({ "retry-after-ms": "999999999999" })
    expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)
```

**Forme de l'erreur remise au modèle.**

`packages/opencode/src/session/prompt.ts:866-871` — la part d'outil en erreur ne reçoit
que le message brut, sans tentative, sans cause classée, sans action :

```ts
      if (!result) {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "error",
            error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
```

Même forme en `packages/opencode/src/session/auto-execute.ts:99` :
```ts
                Effect.succeed({ error: `Tool execution failed: ${err}` }),
```

**Le compteur de tentative existe pourtant déjà dans le chemin de retry** — il est
simplement écrit dans le statut, jamais dans l'erreur :

`packages/opencode/src/session/processor.ts:1020-1026`
```ts
                      status.set(ctx.sessionID, {
                        type: "retry",
                        attempt: info.attempt,
                        message: info.message,
                        action: info.action,
                        next: info.next,
                      }),
```

et le chemin d'échec terminal ne propage que le message fournisseur :

`packages/opencode/src/session/retry.ts:129`
```ts
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
```

`packages/opencode/src/session/retry.ts:223-229` — `opts.set` reçoit l'identifiant de
tentative, puis le schedule rend la durée d'attente ; `meta.attempt` est donc disponible
à chaque itération :

```ts
        yield* opts.set({
          attempt: meta.attempt,
          message: retry.message,
          action: retry.action,
          next: now + wait,
        })
        return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
```

**Blanchiment 5xx.** `retryable()` rejoue tous les 5xx, y compris ceux que le SDK ne
marque pas retryable — donc y compris un 501/505, permanent pour un client donné :

`packages/opencode/src/session/retry.ts:78-82`
```ts
  if (MessageV2.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly marks them as retryable.
    if (!error.data.isRetryable && !(status !== undefined && status >= 500)) return undefined
```

**Erreur terminale : ce que le modèle reçoit.** Après épuisement, le schedule rend
`Cause.done` → l'échec remonte vers `halt`, qui ne publie que `errorMessage(e)` :

`packages/opencode/src/session/processor.ts:945-959`
```ts
            yield* events.publish(SessionEvent.Step.Failed, {
              sessionID: ctx.sessionID,
              error: {
                type: "unknown",
                message: errorMessage(e),
              },
              timestamp: DateTime.makeUnsafe(Date.now()),
            })
          }
        }
        ctx.assistantMessage.error = error
        yield* bus.publish(Session.Event.Error, {
```

Aucun compteur, aucune cause classée, aucune action. Point positif à préserver : la stack
n'est écrite que dans le log (`processor.ts:935` `slog.error("process", { error: errorMessage(e), stack: … })`),
jamais dans le message publié.

**INFERE:** la forme exacte de `MessageV2.APIError` est `{ message, statusCode?,
isRetryable, responseHeaders?, responseBody? }` d'après `message-v2.ts:50-55`. Vérifier
par : `rg -n "class APIError|NamedError.create" packages/opencode/src/session/message-v2.ts`
puis lecture de `message-v2.ts:50-58`.

## 3. Mechanism

1. Le modèle émet un appel ; `llm.stream` échoue sur un 429 (quota épuisé) portant
   `Retry-After: 216000` dans `error.data.responseHeaders`.
2. L'échec remonte du `Stream.runDrain` (`processor.ts:978-982`) vers
   `Effect.retry(SessionRetry.policy({ … }))` (`processor.ts:1001-1031`).
3. `policy` itère : `retryable()` renvoie un objet (le 429 passe par
   `retry.ts:149-150` ou `:129`), donc `Cause.done` n'est pas rendu et la boucle continue.
4. `delay(meta.attempt, error)` (`retry.ts:196`) prend la branche « avec headers »,
   lit `retry-after`, et rend `safeDelay(216000 * 1000)` (`retry.ts:59`).
5. `safeDelay` → `cap()` → `Math.min(216_000_000, 2_147_483_647)` = 216 000 000 ms
   (2,5 jours). Aucune borne entre 2,5 jours et 24,8 jours n'existe.
6. Le schedule rend `Duration.millis(wait)` ; `setTimeout` est appelé avec 216 000 000
   (< 2^31-1, donc accepté par le runtime). La fibre dort. `opts.set` publie un statut
   `retry` avec `next: now + wait` (`processor.ts:1020-1026`), mais **le message de ce
   statut** est `retry.message` (`retry.ts:226`), c'est-à-dire le texte fournisseur ou
   « Provider is overloaded » (`retry.ts:129`) — sans compteur, sans cause, sans action.
7. Rien ne borne le nombre d'itérations : `Schedule.fromStepWithMetadata`
   (`retry.ts:190`) n'a ni `.whileInput` ni `.recurUntil`, donc le seul critère
   d'arrêt est `retryable() === undefined` (`retry.ts:194`).
8. Quand le délai finit par expirer (ou après épuisement du quota fournisseur), le
   schedule s'arrête, l'échec part dans `Effect.catch(halt)` (`processor.ts:1032`), et
   `halt` publie `errorMessage(e)` (`processor.ts:949`) — le message brut du fournisseur.
   Le modèle reçoit donc, à chaque tour, une phrase identique, sans compteur
   d'essai et sans cause actionnable : rien ne l'invite à changer de stratégie ni à
   s'arrêter. C'est la boucle sur erreur déterministe.
9. En parallèle, une part d'outil qui échoue reçoit
   `Tool execution failed: ${error.message}` (`prompt.ts:871`) : même défaut de
   forme, aucun `attempt` disponible à cet endroit (`prompt.ts:866-879` ne met en
   scène que `part`, `result`, `error` — il n'y a donc **pas** de compteur honnête à
   afficher ici, ce qui contraint la forme, voir § 4).

## 4. Proposal

### (a) Plafond de délai — borner l'attente, ne pas l'ignorer, ne pas suspendre

**Décision : borner (clamp) + deux bornes d'arrêt, échec terminal enrichi.**
Un `Retry-After` légitime mais long (quota épuisé) est **honoré jusqu'à un plafond de
5 minutes**, puis **borné** — jamais ignoré, jamais traité comme un zéro.

Justification du refus des deux autres postures :

- **L'ignorer** (retomber sur le backoff exponentiel 30 s) est pire que le défaut :
  le harnais martèle un quota toutes les 30 s pendant toute la fenêtre de reset
  (≈ 2 880 requêtes/jour), ce qui garantit le 429 pour toute la fenêtre, consomme le
  quota restant de l'utilisateur, et supprime le seul signal donné par le
  fournisseur. On convertirait une longue attente en milliers de rejets.
- **Suspendre la session** (parquer le message, réveiller à l'heure du reset) est la
  bonne réponse *produit* mais la mauvaise réponse *à ce correctif* : elle exige un
  nouveau statut persisté dans `SessionStatus` (la forme du statut est consommée par
  `processor.ts:1020-1026`, par le TUI et par le SDK), plus un ordonnanceur qui survit
  à la fin du processus. C'est une machine à états, pas une borne. Recommandé comme ADR
  de suivi (« reprise automatique après reset de quota »), pas comme patch P04.
- **Plafonner à 24 h / à `RETRY_MAX_DELAY`** ne fixe rien : la session dort un jour,
  aucun état terminal, la boucle persiste.

Trois constantes, chacune bornant une classe de défaillance distincte :

```ts
export const RETRY_AFTER_MAX_DELAY = 300_000 // 5 min — au-delà, ce n'est plus une attente mais un état de quota
export const RETRY_MAX_ATTEMPTS = 10 // 10 échecs transitoires maximum par étape
export const RETRY_TOTAL_BUDGET_MS = 900_000 // 15 min d'attente cumulée par étape
```

Dérivation (donc aucune valeur n'est arbitraire) :
- `RETRY_AFTER_MAX_DELAY` = borne **une** attente. Les `Retry-After` réels des
  fournisseurs (burst quota, RPM) sont ≤ 60 s ; 5 min couvre largement le cas légitime
  et transforme le cas quota long en « on réessaie toutes les 5 min, max 15 min au
  total, puis on dit au modèle d'arrêter ».
- `RETRY_MAX_ATTEMPTS` = borne **le nombre**. Backoff exponentiel sans headers,
  plafonné à 30 s (`retry.ts:72`) : 2+4+8+16+30×5 = 210 s pour 10 tentatives. C'est un
  ordre de grandeur correct pour une tempête de 5xx et cela rend `attempt N/limit`
  **exact** dans le message du modèle.
- `RETRY_TOTAL_BUDGET_MS` = borne **le cumul**, et n'est pas redondante avec les deux
  autres : avec des `Retry-After` de 5 min, 10 tentatives font 50 min, donc c'est le
  budget qui lie en premier et qui garantit qu'un état terminal enrichi est visible en
  ≤ 15 min. Avec des attentes de 2 s, c'est le compteur qui lie en premier.

Application — un point de passage unique, `safeDelay` (les trois chemins y convergent :
`retry.ts:50`, `:59`, `:64`, `:68`, `:72`) :

```ts
function safeDelay(ms: number) {
  if (Number.isNaN(ms)) return RETRY_INITIAL_DELAY
  if (ms === Infinity) return RETRY_AFTER_MAX_DELAY
  if (ms === -Infinity) return RETRY_MIN_DELAY
  return Math.max(RETRY_MIN_DELAY, Math.min(ms, RETRY_AFTER_MAX_DELAY))
}
```
et suppression de `cap()` (`retry.ts:31-33`), devenu inutile. `RETRY_MAX_DELAY` est
conservé exporté : il documente la limite plateforme et sert de invariant de test
(`RETRY_AFTER_MAX_DELAY < RETRY_MAX_DELAY`).

Application — l'arrêt terminal dans `policy()` (`retry.ts:183-233`), sans changer la
signature ni le type de retour du schedule :

```ts
export function policy(opts: { /* inchangé */ }) {
  let waited = 0 // réinitialisé à chaque appel de policy(), donc à chaque étape
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      // …
      const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined)
      const now = yield* Clock.currentTimeMillis
      if (meta.attempt >= RETRY_MAX_ATTEMPTS || waited + wait > RETRY_TOTAL_BUDGET_MS) {
        yield* opts.set({ attempt: meta.attempt, message: describe(…), next: now })
        return Cause.fail(new MessageV2.APIError({ message: describe(…), isRetryable: false, statusCode: … }))
      }
      waited += wait
      // … logs et set existants inchangés
```

Invariant à faire respecter par un test : `policy()` est appelé par `process()`
(`processor.ts:1001-1002`) à chaque étape, donc la closure `waited` est par étape et
non partagée entre étapes. Séquence obtenue : **l'étape échoue à la 10ᵉ erreur
transitoire, après au plus 9 attentes**, et l'échec est intercepté par
`Effect.catch(halt)` (`processor.ts:1032`), qui publie désormais un message enrichi.

**Volontairement inchangé :**
- le plafond de la branche « sans headers » reste 30 s (`retry.ts:72`) — il est déjà
  correct et borne la tempête de 5xx mieux que `RETRY_AFTER_MAX_DELAY` ;
- `RETRY_BACKOFF_FACTOR`, `RETRY_INITIAL_DELAY`, `RETRY_MIN_DELAY` (`retry.ts:25-29`) :
  inchangés, ce n'est pas le défaut ;
- les branches `retry-after-ms`, `retry-after` en secondes et en date HTTP
  (`retry.ts:46-65`) : elles sont correctes, elles sont seulement **bornées** en
  sortie, ce qui garde le format fournisseur lisible dans les logs.

### (b) Forme de l'erreur — deux formes, honnêtes chacune pour son chemin

Le compteur de tentative n'existe **que** dans le chemin de retry ; il ne faut donc pas
l'inventer là où il n'est pas. Deux formes distinctes :

**Forme 1 — chemin de retry (`retry.ts:policy`), compteur exact :**

```
API call failed (attempt 10/10, HTTP 429): rate limit. Action: quota épuisé, pas un défaut de code. Ne réessaie pas : indique à l'utilisateur l'heure de reset, puis arrête.
```

**Forme 2 — chemin d'outil (`prompt.ts:871`, `auto-execute.ts:99`), sans compteur :**

```
Tool execution failed: rate limit. Action: quota épuisé, pas un défaut de code. Ne réessaie pas : indique à l'utilisateur l'heure de reset, puis arrête.
```

Structure exacte, dans cet ordre : `(tentative) → (HTTP nnn) → cause → Action: → hint`.
Un helper unique, dans `retry.ts` (même module que les constantes et que le
classifieur — pas de nouveau fichier, pas de nouveau module) :

```ts
export function describeFailure(input: {
  provider: string
  error: Err
  attempt?: number      // absent sur le chemin d'outil : aucun compteur n'y est honnête
  limit?: number
}) {
  const retry = retryable(input.error, input.provider)
  const api = MessageV2.APIError.isInstance(input.error) ? input.error : undefined
  const status = api?.data.statusCode
  const cause = retry?.action?.reason ?? (status === 429 ? "rate_limit" : status && status >= 500 ? "server_error" : "tool")
  const counter = input.attempt !== undefined && input.limit !== undefined ? `attempt ${input.attempt}/${input.limit}` : undefined
  return clip(`${counter ? `${counter}, ` : ""}${status ? `HTTP ${status}: ` : ""}${cause}. Action: ${HINT[cause] ?? HINT.tool}`)
}
```

La cause est un **ensemble fermé** dérivé de données structurées déjà présentes
(`action.reason` produit par `retryable()` à `retry.ts:83-128`, `statusCode` à
`retry.ts:79`), jamais du texte fournisseur. Conséquence de sécurité : le texte
contrôlé par le fournisseur (`error.message`) **n'entre pas** dans la clause `Action:`,
donc aucune instruction injectée ne peut atteindre le modèle par ce chemin. `clip()`
normalise les retours à la ligne en `"; "` et tronque à `RETRY_MESSAGE_MAX_CHARS = 240`.

Non-régression des deux points positifs du harnais :
- **pas de stack trace** : le message reste une ligne plate ; la stack ne circule que
  par `slog.error` (`processor.ts:935`) ;
- **court et actionnable** : une seule phrase ≤ 240 caractères (≈ 60 tokens), qui
  commence par la cause et contient un verbe d'action — et le test § 7 vérifie
  explicitement l'absence de `"\n    at "` et la longueur ≤ 240.

### (c) OPTIONNEL — `retryable()` : sortir 501/505 du blanchiment 5xx

`retry.ts:78-82` rejoue tout 5xx. 501 (Not Implemented) et 505 (HTTP Version Not
Supported) sont permanents pour un build client donné : les rejouer est exactement la
boucle sur erreur déterministe. Correctif d'une ligne :

```ts
    const permanent = status === 501 || status === 505
    if (!error.data.isRetryable && !(status !== undefined && status >= 500 && !permanent)) return undefined
```

**Marqué OPTIONNEL** : il est indépendant de (a) et (b) et peut être rayé sans les
affecter. 502/503/500 restent rejoués, car un 502/503 de passerelle est réellement
transitoire (`retry.test.ts:188`, `:200` le vérifient explicitement).

## 5. Alternatives considered

1. **Ignorer `Retry-After` au-delà d'un seuil, retomber sur l'exponentiel 30 s.**
   Rejeté : transforme une attente en ≈ 2 880 rejets/jour contre le quota, garantit
   l'échec jusqu'au reset, brûle le quota de l'utilisateur et jette l'information la
   plus utile du fournisseur. Aggrave la panne au lieu de la borner.
2. **Suspendre la session et la réveiller à l'heure du reset.** Réponse produit
   correcte (c'est ce que fait un vrai client), mais elle exige un nouveau statut dans
   `SessionStatus` consommé par `processor.ts:1020-1026`, le TUI et le SDK, plus un
   ordonnanceur survivant au processus. Transformation d'une politique de retry en
   machine à états : hors périmètre d'un patch borné. À instruire comme ADR séparé.
3. **Plafonner à `RETRY_MAX_DELAY` (24,8 j) ou à 24 h.** Ne change rien de ce qui est
   observable : la session dort, aucun état terminal, la boucle persiste.
4. **Ne corriger que (b).** Le modèle apprend à s'arrêter mais il ne s'exécute jamais :
   il est endormi 2,5 jours par itération. Le correctif de forme ne produit aucun
   signal parce qu'aucun signal n'est émis.
5. **Ne corriger que (a).** L'agent se réveille après 15 min max et reçoit toujours
   « 429 Too Many Requests » sans compteur ni action : il reboucle sur la même erreur
   déterministe, qui est la moitié du problème annoncé.
6. **Supprimer le blanchiment 5xx en bloc (`retry.ts:75-82`).** Rejeté : les
   `retry.test.ts:188`/`:200` prouvent que 502/503 sont le cas transitoire principal à
   couvrir. Seul 501/505 est permanent (item (c), optionnel).

## 6. Risks

- **Régression sur les tests existants (nommés).**
  - `packages/opencode/test/session/retry.test.ts:74-79` — le test *« uses retry-after
    values even when exceeding 10 minutes with headers »* assert `700000` sur
    `retry-after-ms`. Il **encadre le défaut** : il doit devenir
    `toBe(RETRY_AFTER_MAX_DELAY)`. Le cas `retry-after: "50"` → `50000` de la même
    assertion (`:76`) reste valide (50 s < 5 min) et n'est pas touché.
  - `packages/opencode/test/session/retry.test.ts:82-85` — *« caps oversized header
    delays to the runtime timer limit »* assert `RETRY_MAX_DELAY`. Doit devenir
    `toBe(RETRY_AFTER_MAX_DELAY)`.
  - `packages/opencode/test/session/retry.test.ts:87-119` — `it.live("policy updates
    retry status and increments attempts")` pilote `policy()` avec un effet en échec :
    il vérifie l'horodatage `next`, donc l'ajout de l'arrêt terminal peut le faire
    échouer. **INFERE: corps du test non lu intégralement** (lecture arrêtée à la
    ligne 89) ; vérification attendue par le validateur : lire `retry.test.ts:87-119`
    et, si le test force 3 échecs identiques, confirmer que 3 < `RETRY_MAX_ATTEMPTS` et
    qu'il n'atteint pas `RETRY_TOTAL_BUDGET_MS`.
  - `packages/opencode/test/session/retry.test.ts:34-72` — non affectés : toutes les
    valeurs attendues sont ≤ 30 000 ms et passent sous le nouveau plafond.
  - `packages/opencode/test/session/prompt.test.ts:1277`
    (`expect(tool.state.error).toContain("Tool execution failed")`) — reste vert : le
    préfixe `Tool execution failed:` est conservé tel quel, l'enrichissement est
    **ajouté** après.
- **Coût en tokens / latence.** Ajout : ≤ 240 caractères (≈ 60 tokens) une seule fois
  par échec terminal d'étape, et ≈ 15 tokens par part d'outil en échec. Sur une session
  de 50 tours cela reste sous 100 tokens de surcoût additionnel, soit < 0,1 % d'un tour
  typique. Latence : **réduite** — pire attente par étape ramenée de ≈ 24,8 jours à
  ≤ 15 min (borne budget), soit 4 ordres de grandeur. Coût CPU : un appel supplémentaire
  à `retryable()` par échec terminal, négligeable (déjà appelé à `retry.ts:193`).
- **Sécurité.** Aucun nouveau point d'entrée ni aucune nouvelle permission. Le risque
  d'injection est traité par construction : la clause `Action:` est une **table de
  constantes** indexée par une cause d'un ensemble fermé (§ 4b), le texte fournisseur
  n'y entre jamais ; seule la structure `HTTP nnn` et le compteur, tous deux dérivés
  de champs entiers, y apparaissent. `clip()` interdit l'injection d'un retour ligne
  supplémentaire dans le contexte du modèle.
- **Comportement utilisateur.** Échec terminal plus fréquent qu'avant dans le cas d'un
  quota long : au lieu d'attendre 2,5 jours, la session s'arrête en ≤ 15 min avec un
  message actionnable. C'est le but ; le coût est qu'un rate-limit légitime de 10 min
  verra l'étape échouer au lieu d'aboutir. Acceptable et voulu : l'utilisateur peut
  renvoyer le message, ce qui repart avec un budget neuf.
- **Dérive de la fixture `it.live`.** `retry.test.ts:17` monte
  `SessionStatus.defaultLayer` ; le nouvel `opts.set` immédiat (sans `next` futur) doit
  rester compatible avec ce schéma — à confirmer à l'implémentation.

## 7. Tests

Fichier nouveau : **`packages/opencode/test/session/retry-bounds.test.ts`** (unitaire,
sans réseau ; `apiError()` à réutiliser depuis `retry.test.ts:19-27`).

1. `delay` borne un `retry-after` de 2,5 jours :
   `SessionRetry.delay(1, apiError({ "retry-after": "216000" })) === SessionRetry.RETRY_AFTER_MAX_DELAY`.
2. `delay` borne un `retry-after-ms` aberrant :
   `delay(1, apiError({ "retry-after-ms": "999999999999" })) === RETRY_AFTER_MAX_DELAY`
   **et** `RETRY_AFTER_MAX_DELAY < RETRY_MAX_DELAY` (la borne plateforme reste respectée).
3. `delay` borne une date HTTP à +3 jours : ≤ `RETRY_AFTER_MAX_DELAY`.
4. Non-régression branche « sans headers » : `delay(1..10, apiError())` toujours
   `[2000, 4000, 8000, 16000, 30000, …]` (identique à `retry.test.ts:37`).
5. `describeFailure` avec `{ attempt: 10, limit: 10, error: api429 }` :
   contient `"attempt 10/10"`, contient `"HTTP 429"`, contient `"Action:"`,
   `length <= 240`, **ne contient pas** `"\n    at "`, et **ne contient pas** le
   `responseBody` fournisseur dans la clause `Action:`.
6. `describeFailure` **sans** `attempt` ne contient ni `/` de compteur ni le mot
   `attempt` (forme 2 honnête).
7. `policy` avec un effet qui échoue toujours d'un 429 `retry-after: 600` : l'étape
   **échoue** avec une `MessageV2.APIError`, `attempts <= RETRY_MAX_ATTEMPTS`,
   somme des attentes ≤ `RETRY_TOTAL_BUDGET_MS`, et le message contient `attempt 10/10`.
   (Utiliser `TestClock` / `it.live` comme `retry.test.ts:87-119`.)
8. `policy` avec une erreur **non** retryable : une seule évaluation, aucune attente,
   l'erreur d'origine remonte (garantit qu'aucun chemin n'est cassé par le nouvel arrêt).

**Mise à jour obligatoire** (elles encodent le défaut) :
`packages/opencode/test/session/retry.test.ts:76-79` et `:82-85`, cf. § 6.

**Commande exacte :**

```powershell
cd packages\opencode
bun test test/session/retry.test.ts test/session/retry-bounds.test.ts test/session/prompt.test.ts
```

**Critère de succès observable :** code de sortie `0`, `0 fail`, et l'assertion
`delay(1, apiError({ "retry-after": "216000" })) === 300_000` verte dans
`retry-bounds.test.ts` alors que le comportement d'aujourd'hui renvoie `216_000_000`.
Types : `cd packages\opencode && bun typecheck` doit sortir en `0`.

## 8. Effort

**S** — un point de passage unique (`safeDelay`) et trois constantes pour (a), une
vérification d'arrêt et un helper de message pour (b), deux appels d'une ligne sur les
deux sites d'erreur, une ligne optionnelle dans `retryable()`, deux assertions de test à
réécrire et un fichier de test de 8 cas.

## 9. Verdict self-assessment

`READY` — les deux aspects sont traités séparément et complètement (plafond de délai +
forme de l'erreur), chaque affirmation porte une citation `fichier:ligne`, et le plan de
test est exécutable.

Un seul arbitrage de politique reste ouvert, sans bloquer la validation du reste :

- **Valeur de `RETRY_TOTAL_BUDGET_MS = 900_000` (15 min)** — c'est le choix qui décide
  si un quota légitime de 20 min voit son étape échouer (oui) ou aboutir (non). À
  trancher par le validateur contre l'usage réel des fournisseurs, avec la borne
 borne supérieure garantie par `RETRY_MAX_ATTEMPTS = 10`.
- **Item (c) (retirer 501/505 du blanchiment 5xx)** est marqué OPTIONNEL et peut être
  rayé sans toucher (a) ni (b).