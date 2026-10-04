# P10 — Rampe continue du signal read-heavy : arme anticipée et budget de verbatim proportionnels au volume inspecté

> Révisé cycle 2 après REVALIDATED-PASS_WITH_CHANGES du 2026-10-03 — régression de 2 tests analysée et résolue ou classée

Corrections du revalidateur tracées une à une au §9.1, décision sur le paramètre libre au §9.2,
disposition de C-05 / C-11 au §9.4. Aucun fichier `packages/**` n'a été modifié : le seul fichier
écrit par cette révision est ce document.

## 1. Problem

Le harnais classe une fenêtre « read-heavy » ou non par un booléen unique, si bien qu'à 20 000
tokens inspectés le budget de verbatim conserve passe de 8 000 à 24 000 d'un seul coup : une
variation de 0,05 % du volume réellement lu triple le budget, alors que le phénomène est continu.

## 2. Evidence

**E1 — Le seuil qui produit la discontinuité.**
`packages/opencode/src/session/overflow.ts:76-78` :

```ts
export function isReadHeavy(messages: MessageV2.WithParts[], cfg: Config.Info) {
  return inspectionTokens(messages) >= (cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
}
```

`READ_HEAVY_MIN_TOKENS = 20_000` (`overflow.ts:10`), clé opérateur exposée et documentée comme
« Minimum estimated tokens from read, grep, glob, inspect_batch, or repo_overview output that
classify the current context as read-heavy (default: 20000) »
(`packages/opencode/src/config/config.ts:326`).

**E2 — Le diviseur qu'elle mobilise, et la seule population qu'il voit.**
`packages/opencode/src/session/overflow.ts:59-60` puis `:63` :

```ts
      if (part.type !== "tool" || !INSPECTION_TOOLS.has(part.tool) || part.state.status !== "completed") continue
      chars += part.state.output.length
```

```ts
  return Math.ceil(chars / CHARS_PER_TOKEN)
```

avec `INSPECTION_TOOLS = new Set(["read", "grep", "glob", "inspect_batch", "repo_overview"])`
(`overflow.ts:12`) et la double rupture de parcours aux lignes `:56-57` :

```ts
    if (message.info.role === "assistant" && message.info.summary) break
    if (message.parts.some((part) => part.type === "compaction")) break
```

**E3 — La décision que ce booléen commande.**
`packages/opencode/src/session/compaction.ts:304-310` :

```ts
function preserveRecentBudget(input: { cfg: Config.Info; model: Provider.Model; readHeavy: boolean }) {
  const configured = input.cfg.compaction?.preserve_recent_tokens
  if (configured !== undefined) return configured
  const max = input.readHeavy
    ? (input.cfg.compaction?.read_heavy_preserve_recent_tokens ?? MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS)
    : MAX_PRESERVE_RECENT_TOKENS
  return Math.min(max, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
}
```

avec `MIN_PRESERVE_RECENT_TOKENS = 2_000` (`compaction.ts:48`), `MAX_PRESERVE_RECENT_TOKENS = 8_000`
(`compaction.ts:49`) et `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS = 24_000` (`compaction.ts:55`,
commenté `:49-53` : « Keeping only MAX_PRESERVE_RECENT_TOKENS of them makes compaction summarise
those bytes away, and the model pays for them a second time by re-reading the same files »). Le
plafond de 24 000 est donc une décision délibérée, pas une valeur manquante : il est exposé en
configuration (`config.ts:328-330`, « default: 24000 »).

**E4 — Le sort explicite de chaque constante auditée.**
`packages/opencode/src/session/overflow.ts:7-12` :

```ts
const COMPACTION_BUFFER = 20_000
const DEFAULT_THRESHOLD = 0.95
const READ_HEAVY_FRACTION = 0.8
const READ_HEAVY_MIN_TOKENS = 20_000
const CHARS_PER_TOKEN = 4
const INSPECTION_TOOLS = new Set(["read", "grep", "glob", "inspect_batch", "repo_overview"])
```

`COMPACTION_BUFFER` (ligne 7, consommé par `overflow.ts:30`) et `DEFAULT_THRESHOLD` (ligne 8,
consommé par `threshold()` lignes 21-25) n'ont aucun lien avec le signal read-heavy : inchangés.
`READ_HEAVY_FRACTION` (ligne 9) reste le plancher de l'arme anticipée. `READ_HEAVY_MIN_TOKENS`
(ligne 10) devient le **début** de la rampe. **`CHARS_PER_TOKEN` (ligne 11) reste `4` et n'est pas
touché** : son unique site d'usage est `overflow.ts:63` (« Hors périmètre mesuré », §2). Côté
compaction, `TOOL_OUTPUT_MAX_CHARS` (ligne 44), `PRUNE_PROTECTED_TOOLS` (ligne 45) et
`DEFAULT_TAIL_TURNS` (ligne 47, consommé par `compaction.ts:527`) pilotent l'élagage et la queue :
hors périmètre.

**E5 — Les deux seuls appelants, et le fait que le ratio n'atteint la décision que par l'arme
anticipée.** `isReadHeavy` est importé en un seul endroit, `packages/opencode/src/session/compaction.ts:22`
(`import { isOverflow as overflow, isReadHeavy, usable } from "./overflow"`), et appelé en un seul
endroit, `compaction.ts:529` :

```ts
      const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model, readHeavy: isReadHeavy(input.messages, input.cfg) })
```

`inspectionTokens` est appelé par `isReadHeavy` (`overflow.ts:77`) et par `isOverflow`
(`overflow.ts:152`). Or le pivot de base `Math.min(proportional, absolute)` (`overflow.ts:114`) ne
dépend d'aucun ratio : `proportional` vient de `threshold()` (`overflow.ts:102`) et `absolute` de
`overflow.ts:103`. Le ratio n'entre donc dans la décision **que** par l'arme read-heavy, laquelle
n'existe que si `cacheAware(model)` est faux (`overflow.ts:104`, `:89-91`,
`model.cost.cache.read > 0`). Corollaire : la fenêtre « l'overflow est détecté trop tard » est
**infirmée** par le code, et cette proposition ne l'affirme pas.

**E6 — L'arme et la branche read-heavy, telles qu'elles sont aujourd'hui.**
`packages/opencode/src/session/overflow.ts:106-114` :

```ts
  const early =
    input.cfg.compaction?.read_heavy_trigger ??
    (cached ? undefined : Math.floor(proportional * READ_HEAVY_FRACTION))
  const readHeavy =
    early !== undefined &&
    (input.inspected ?? 0) >= (input.cfg.compaction?.read_heavy_min_tokens ?? READ_HEAVY_MIN_TOKENS)
  const arm = readHeavy ? early : undefined
  return {
    value: arm === undefined ? Math.min(proportional, absolute) : Math.min(proportional, absolute, arm),
```

`readHeavy` est renvoyé tel quel (ligne 118) et journalisé par `isOverflow` (`overflow.ts:167`,
`readHeavy: computed.readHeavy,`). C'est le prédicat qui sera modifié au §4, et donc la seule
surface d'observation à re-vérifier.

**E7 — Le total provider rend le pivot exact, hors ratio.**
`packages/opencode/src/session/overflow.ts:46-50` : `tokenCount` renvoie `tokens.total || tokens.input +
tokens.output + tokens.cache.read + tokens.cache.write`. Quand le provider publie un total non nul,
le diviseur n'entre pas dans la décision de compacter. Il ne reste que les estimations locales : le
signal read-heavy et le dimensionnement de la queue. C'est ce périmètre, et lui seul, que la
proposition touche.

**E8 — Le travail de calibrage du seuil est bon et doit survivre.**
`packages/opencode/src/session/overflow.ts:15-20` :

```ts
// Compacting is not free: it rewrites the whole prompt prefix, which throws away
// the provider cache, and it spends a summarisation call that reads the entire
// context. Roughly 2.50 $ at a 256k context, against ~0.06 $/turn saved by
// carrying a smaller one — it only pays back after ~40 turns. So compact late,
// just short of the usable window rather than well inside it. A lower value is
// only worth it when the provider cache is unavailable.
```

**E9 — Le cliff est mesuré, et il est indépendant du ratio.** Avec la configuration auditée du dépôt
(`proportional = 580_800`, `packages/opencode/test/session/overflow.test.ts:53` ; `usable = 968_000`
et `absolute = proportional`, lignes `:28` et `:39`) et le code actuel, le budget de verbatim vaut
`min(readHeavy ? 24 000 : 8 000, floor(968 000 × 0,25) = 242 000)`, soit :

| tokens inspectés | 18 000 | 19 999 | 20 000 | 23 000 | 30 000 | 60 000 |
|---|---|---|---|---|---|---|
| budget actuel | 8 000 | 8 000 | **24 000** | 24 000 | 24 000 | 24 000 |

Une variation de 0,05 % du volume inspecté fait passer le budget de 8 000 à 24 000. C'est le
défaut que ce correctif supprime, et il est entièrement décrit par le booléen.

**Statut des chiffres de cette proposition.** Tous les chiffres produits par application littérale
des formules du §4 sont donnés comme **arithmétique dérivée** des constantes lues en E3 et E4, et
non comme sortie d'exécution : cette révision n'a aucun shell (`EPERM`) et ne peut donc pas rejouer
le script de calcul. Le script relu est `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p10-ramp.ts`
(14 lignes), dont la ligne 8 calcule la forme **sans** `Math.round` et la ligne 13 imprime `early`,
`value` et `budget` pour neuf volumes. Ce qui est inféré est marqué `INFERE:` ; ce qui est vérifié
contre du code existant est cité ; et T7.2 / T7.3 (§7) convertissent chaque chiffre en assertion
exécutable, de sorte que l'implémentateur les valide à l'exécution plutôt que de croire la
révision sur parole.

### Hors périmètre mesuré — prompt système, jamais lu par `inspectionTokens`

Les versions précédentes de cette proposition justifiaient un changement de diviseur par une mesure
de ratio « ≈ 2,8 caractères par token » portant sur trois blocs qui vivent dans le **prompt
système**, et annonçaient « `32 807 / 2,8 = 11 717` tokens réels contre `8 202` estimés, soit
−3 515 tokens par tour ». **Ces chiffres ne décrivent pas le correctif et sont retirés de la
justification d'impact.** Trois raisons, toutes vérifiables :

1. `inspectionTokens` n'additionne que des sorties d'outils d'inspection, et rien d'autre
   (`overflow.ts:59-60`, E2). Les blocs mesurés sont `<context_slots>` poussé dans le prompt
   système (`packages/opencode/src/session/prompt.ts:2438-2446`, ligne 2444 `volatile.push(slots)`),
   `<goal_reminder>` (détecté comme bloc de prompt système à `prompt.ts:2452`,
   `system.some((entry) => entry.includes("<goal_reminder"))`) et `<task-contract>`
   (`packages/opencode/src/session/compaction.ts:119-124`). Aucun n'est une sortie d'outil.
2. Aucun appelant de `Token.estimate` ne lit le prompt système : les deux seuls appels sont
   `packages/opencode/src/session/compaction.ts:518` (`Token.estimate(JSON.stringify(msgs))`, où
   `msgs` provient de `MessageV2.toModelMessagesEffect(input.messages, ...)` à `compaction.ts:510`,
   donc des seuls messages de session) et `compaction.ts:603`
   (`Token.estimate(part.state.output)`, une sortie d'outil). Le patch ne change donc **zéro
   octet** de ce chemin.
3. En conséquence, la construction `isDense` de la version précédente ne devait pas exister : ses
   branches `head.includes("<task-contract")`, `"<context_slots>"` et `"<goal_reminder"` n'étaient
   atteignables que si une *sortie d'outil* commençait par ces balises, et `isDense` **n'existe
   aujourd'hui dans aucun fichier** de `src/session/` : les trois branches sont retirées avec lui,
   et le reniflage de contenu disparaît du chemin.

**Décision : le changement de diviseur est retiré du périmètre.** `CHARS_PER_TOKEN` reste `4`
(E4). Le défaut de conversion caractères/tokens reste réel mais **non démontré sur la population que
`inspectionTokens` lit** ; le réactiver exige une mesure dédiée du ratio sur la sortie réelle de
`inspect_batch`/`repo_overview`, en tokens provider et non en estimation (§9.3).
`packages/opencode/src/util/token.ts:1-5` reste hors périmètre pour la même raison, et le test qui
fige son rapport 4 c/t (`packages/opencode/test/session/compaction.test.ts:1862-1864`) reste vert
sans modification.

## 3. Mechanism

1. Après une réponse, `packages/opencode/src/session/processor.ts:769` appelle
   `isOverflow({ cfg, tokens, model })` — **sans `messages`** — et
   `packages/opencode/src/session/prompt.ts:1984` appelle
   `compaction.isOverflow({ tokens, model, messages: msgs })`.
2. `isOverflow` calcule `count = tokenCount(input.tokens)` (`overflow.ts:151`) : c'est le total
   provider, cette valeur est **exacte**, et le pivot n'est donc pas concerné par le ratio.
3. En parallèle, `isOverflow` calcule `inspected = inspectionTokens(input.messages)`
   (`overflow.ts:152`) si `messages` est fourni, et `0` sinon (`input.messages ? … : 0`). Sur le
   chemin `processor.ts:769`, `inspected` vaut donc toujours `0` : l'arme anticipée n'y est jamais
   activée. Cette asymétrie est conservée telle quelle.
4. Cet `inspected` entre dans le pivot via `trigger` (`overflow.ts:95-122`) : sur un provider sans
   cache lu (`cacheAware` faux, `overflow.ts:89-91`), l'arme anticipée vaut
   `floor(proportional × 0,8)` (`overflow.ts:108`) mais n'est **activée** que si le booléen est vrai
   (`overflow.ts:109-112`), et c'est `arm` qui entre dans `value` (`overflow.ts:114`).
5. Il entre une seconde fois dans le budget de verbatim : `compaction.ts:529` appelle
   `isReadHeavy(input.messages, input.cfg)` et passe le booléen à `preserveRecentBudget`, qui
   choisit entre 8 000 et 24 000 (`compaction.ts:307-309`). L'appelant est le `const select` local
   de `compaction.ts:521`.
6. **Le défaut.** Les deux sites consomment la même grandeur mais reçoivent un booléen : le seuil
   de `isReadHeavy` (`overflow.ts:77`) est une comparaison binaire, donc la valeur utile
   — « combien de volume d'inspection » — est perdue à la frontière. Une fenêtre à 18 000 tokens
   inspectés et une fenêtre à 23 000 reçoivent des traitements opposés alors que 5 000 tokens de
   lecture de plus ne justifient pas un triplement de la mémoire de verbatim conservée.
7. Le même booléen sert en outre de **prédicat exposé** : `isReadHeavy` est un export public
   d'`overflow.ts`, et `read_heavy_min_tokens` est décrit en configuration (`config.ts:326`) comme
   le seuil qui « classe le contexte courant ». C'est cette double nature — seuil interne et
   prédicat nommé — qui rend la correction de la régression du §4 non triviale.

## 4. Proposal

Trois changements, deux fichiers source, aucune nouvelle clé de configuration, un export
supplémentaire pour rendre le budget testable.

**Ordre de patch (obligatoire).** (c) seul d'abord : c'est le seul changement qui déplace une
décision de compaction, et il se teste isolément dans
`packages/opencode/test/session/overflow.test.ts` (bloc `describe` ligne 74) sans toucher au reste ;
puis (b), qui introduit `readHeavyRamp` et `inspectionProfile` et corrige les deux prédicats ;
puis (d), qui change la signature de `preserveRecentBudget` et l'appelant `compaction.ts:529`.
Piège connu : ni le commentaire économique de `overflow.ts:15-20` ni `threshold()`
(`overflow.ts:21-25`) ne doivent apparaître dans aucun diff — c'est le travail de calibrage, et
T7.5 en est le garde-fou.

**c) L'arme anticipée fond au lieu de basculer** (`overflow.ts:106-112`). À `ramp = 0` l'arme vaut
exactement `proportional`, donc `Math.min(proportional, absolute, proportional)` (ligne 114) donne
le même résultat que `arm = undefined` : **aucun changement de comportement en bas de gamme** et
aucune compaction anticipée nouvelle. À `ramp = 1` elle vaut `proportional × 0,8`, la valeur
actuelle :

```ts
  const ramp = readHeavyRamp(input.inspected ?? 0, input.cfg.compaction?.read_heavy_min_tokens)
  const early =
    input.cfg.compaction?.read_heavy_trigger ??
    (cached ? undefined : Math.floor(proportional * (READ_HEAVY_FRACTION + (1 - READ_HEAVY_FRACTION) * (1 - ramp))))
  const readHeavy = early !== undefined && ramp >= 1
  const arm = readHeavy ? early : undefined
```

**La correction de régression est dans le `>= 1`, et elle est traitée à part parce qu'elle change
un prédicat public.** La version précédente de cette proposition posait `ramp > 0`, ce qui est
faux pour deux assertions vertes (R6.1, §6). `ramp >= 1` équivaut à `tokens >= start + span = 3 × READ_HEAVY_MIN_TOKENS`, et son unique
propriété non triviale est `tokens >= start ⇒ ramp >= 1`, donc **faux sur
`start ≤ tokens < start + span`**. `ramp > 0` élargit au contraire cet intervalle jusqu'à
`tokens > start`, et perd la garantie inverse. C'est `ramp >= 1` qui est la seule formule qui
préserve le budget de verbatim de l'état actuel sur `tokens < start` : sous `ramp > 0`, une fenêtre
à 20 000 tokens inspectés — 0 % de volume supplémentaire — perdrait 16 000 tokens de verbatim
alors qu'elle en avait 24 000, ce qui serait un rétrécissement et non un lissage. Le prix en
sémantique est explicite et assumé : `readHeavy` signifie désormais « la rampe est saturée », et non
plus « le seuil est franchi », donc `false` sur `20 000 ≤ inspected < 60 000` (R6.1 bis).
`trigger().readHeavy` reste renvoyé (ligne 118) et journalisé (`overflow.ts:167`) ; il change de
valeur à `inspected == 20 000` et sur tout l'intervalle `20 000 < inspected < 60 000`
(R6.1 et R6.3).

**b) Rampe proportionnelle au volume inspecté, en remplacement du booléen**
(`packages/opencode/src/session/overflow.ts`). `READ_HEAVY_MIN_TOKENS` reste le point de départ de
la rampe — il garde son sens (« à partir d'ici le volume d'inspection compte ») — et la borne haute
est atteinte à trois fois ce volume, ce qui rend la fonction continue par construction :

```ts
// A 23k-token window and an 18k one must not differ by a 3x verbatim budget:
// the read-heavy budget is proportional to the volume actually read.
const READ_HEAVY_RAMP_SPAN = 2 * READ_HEAVY_MIN_TOKENS

export function readHeavyRamp(inspected: number, start = READ_HEAVY_MIN_TOKENS) {
  return Math.max(0, Math.min(1, (inspected - start) / READ_HEAVY_RAMP_SPAN))
}
```

`cfg.compaction?.read_heavy_min_tokens` reste lu par les deux appelants, donc la clé existante
garde exactement son effet : elle déplace le début de la rampe, elle ne le supprime pas.
`isReadHeavy` reste exporté avec sa signature actuelle (`overflow.ts:76`, importé par
`compaction.ts:22`) et devient un cas particulier de la fonction de profil, ce qui supprime la
possibilité que le trigger et le budget divergent :

```ts
export function inspectionProfile(messages: MessageV2.WithParts[], start?: number) {
  const tokens = inspectionTokens(messages)
  return { tokens, ramp: readHeavyRamp(tokens, start) }
}
```

`isReadHeavy(messages, cfg)` devient
`inspectionProfile(messages, cfg.compaction?.read_heavy_min_tokens).ramp >= 1`.

**d) Budget de verbatim continu** (`compaction.ts:304-310`). L'early return sur
`preserve_recent_tokens` (`:201`), le plancher `MIN_PRESERVE_RECENT_TOKENS` (`:205`) et le plafond
`floor(usable * 0.25)` sont conservés à l'identique — le résumé garde la même place, c'est une
exigence de fonctionnement et pas un réglage :

```ts
export function preserveRecentBudget(input: { cfg: Config.Info; model: Provider.Model; ramp: number }) {
  const configured = input.cfg.compaction?.preserve_recent_tokens
  if (configured !== undefined) return configured
  const ceiling = input.cfg.compaction?.read_heavy_preserve_recent_tokens ?? MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS
  const volume = MAX_PRESERVE_RECENT_TOKENS +
    (ceiling - MAX_PRESERVE_RECENT_TOKENS) * Math.max(0, Math.min(1, input.ramp))
  return Math.min(Math.round(volume), Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
}
```

La seule addition par rapport à la version précédente est le mot-clé **`export`** : c'est ce qui rend
T7.2 et T7.4 constructibles (§7). Le `const select` de `compaction.ts:521-529` reste local et n'est
pas touché — il continue d'appeler `preserveRecentBudget` avec la rampe au lieu du booléen :

```ts
      const budget = preserveRecentBudget({
        cfg: input.cfg,
        model: input.model,
        ramp: inspectionProfile(input.messages, input.cfg.compaction?.read_heavy_min_tokens).ramp,
      })
```

**Le `Math.round` est obligatoire et non cosmétique.** Sans lui, la forme brute produit un budget
**fractionnaire** : `INFERE:` `inspected = 59 999` ⇒ `ramp = 0,999975` ⇒
`volume = 8 000 + 16 000 × 0,999975 = 23 999,6`, ce qui est un nombre de tokens non entier et fait
diverger le type de sortie à la ligne 205 de `preserveRecentBudget`. Comment le vérifier :
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\p10-ramp.ts:8` implémente exactement cette forme
brute, sans arrondi, et son exécution l'imprime. Avec `Math.round`, la sortie est entière pour
toute entrée, et le tableau ci-dessous le confirme.

**Comportements après correctif, calculés** (config auditée, `usable = 968 000`,
`proportional = 580 800`, plafond `floor(968 000 × 0,25) = 242 000`, donc non limitant ; colonnes
« arme » et « value après » sur `model({ cacheRead: 0 })`) :

| tokens inspectés | rampe | `readHeavy` aujourd'hui | `readHeavy` après | budget aujourd'hui | budget après | arme (`early`) aujourd'hui | arme après | `value` après |
|---|---|---|---|---|---|---|---|---|
| 1 000 | 0 | false | false | 8 000 | 8 000 | 464 640 | 580 800 | 580 800 |
| 18 000 | 0 | false | false | 8 000 | 8 000 | 464 640 | 580 800 | 580 800 |
| 19 999 | 0 | false | false | 8 000 | 8 000 | 464 640 | 580 800 | 580 800 |
| 20 000 | 0 | **true** | **false** | **24 000** | 8 000 | 464 640 | 580 800 | 580 800 |
| 23 000 | 0,075 | true | false | 24 000 | 9 200 | 464 640 | 572 088 | 572 088 |
| 30 000 | 0,25 | true | false | 24 000 | **12 000** | 464 640 | 551 760 | 551 760 |
| 59 999 | 0,999975 | true | false | 24 000 | 24 000 | 464 640 | 464 642 | 464 642 |
| 60 000 | 1 | true | true | 24 000 | 24 000 | 464 640 | 464 640 | 464 640 |
| 500 000 | 1 | true | true | 24 000 | 24 000 | 464 640 | 464 640 | 464 640 |

Méthode : application littérale des formules des §4(b)(c)(d) sur `proportional = 580 800`,
`usable = 968 000`, `start = 20 000`, `span = 40 000`, `ceiling = 24 000`, `floor = 8 000`. Ce ne
sont pas des extrapolations : ce sont les sorties du calcul, et chacune est reconduite en assertion
par T7.2 et T7.3. **Note de correction** : une version antérieure annonçait `30 000 → 14 000` ; la
valeur correcte est `12 000` (`8 000 + 16 000 × 0,25 = 12 000`). L'erreur était arithmétique, pas
conceptuelle, mais elle figurait dans un tableau de preuve.

`INFERE:` à `inspected = 20 001` le budget resterait 8 000 (`rampe = 0,000025`, `volume = 8 000,4`,
arrondi 8 000) et à `inspected = 21 000` il vaudrait 8 400 (`rampe = 0,025`, `volume = 8 400`).
Comment le vérifier : T7.2 étendue à ces deux volumes, ou exécution de `p10-ramp.ts` avec ces deux
entrées.

**Inchangé volontairement, et pourquoi :**

- `overflow.ts:15-20`, `threshold()` (lignes 21-25) et `DEFAULT_THRESHOLD = 0,95`. Le calibrage
  économique du pivot compare le coût d'une compaction au coût par tour, pas la forme du texte. Le
  modifier décalerait le pivot audité (159 967 → 161 715 tokens dans
  `packages/opencode/test/session/overflow.test.ts:34-37`) sans résoudre le défaut. **Ce raisonnement
  est conservé tel quel, commentaire compris.**
- `tokenCount` (`overflow.ts:46-50`) et donc le pivot lui-même : le total provider est déjà la
  source de vérité, et le ratio ne doit pas y entrer.
- `CHARS_PER_TOKEN` (`overflow.ts:11`), `inspectionTokens` (`overflow.ts:52-64`) et le diviseur de
  `packages/opencode/src/util/token.ts:1-5` : voir « Hors périmètre mesuré » au §2.
- `trigger().readHeavy` reste observé et journalisé (`overflow.ts:118`, `:167`), avec la
  nouvelle définition explicitée ci-dessus et dans R6.1.
- `MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS` (`compaction.ts:55`) reste le plafond, et sa molette
  `read_heavy_preserve_recent_tokens` (`config.ts:328-330`) reste prioritaire : l'opérateur qui
  fixe un plafond continue d'obtenir exactement ce plafond.

## 5. Alternatives considered

**A5.1 — Remplacer le ratio par un vrai tokenizer (tiktoken ou gpt-tokenizer) sur la chaîne
sérialisée.** Rejeté : c'est la solution « juste » mais la plus risquée du lot. Elle ajoute une
dépendance native ou environ 1 Mo de tables à un chemin exécuté à chaque tour, et elle n'est
correcte que pour le tokenizer d'un provider précis alors que le code sert tous les providers. Elle
ne corrige ni le cliff de `isReadHeavy` ni le facteur 3 du budget de verbatim, qui sont deux
défauts de **fonction**, pas de constante.

**A5.2 — Recalibrer `isReadHeavy` sur le total provider déjà disponible.** C'est la piste la plus
grossière, et elle est partiellement fausse, ce qui doit être dit explicitement. `tokenCount`
(`overflow.ts:46-50`) est exact, mais il décrit la fenêtre **entière** ; `isReadHeavy` a besoin
d'un **sous-volume**, les octets d'inspection seulement. Diviser un total exact par un sous-volume
estimé réintroduit l'estimation au dénominateur. Pire, le signal n'est pas disponible là où la
décision se prend : `isOverflow` ne calcule `inspected` que si `messages` est fourni
(`overflow.ts:152`), et le site d'appel `processor.ts:769` passe `{ cfg, tokens, model }`, sans
`messages`. Une calibration sur le total verrait `inspected = 0` à cet endroit exact et n'y armerait
jamais rien.

**A5.3 — Supprimer la branche read-heavy** (plus d'arme anticipée, budget de verbatim fixe à
24 000). Rejeté : cela détruit deux décisions délibérées et documentées, la protection peu coûteuse
contre la relecture des fichiers (`compaction.ts:49-53`) et l'arme conditionnée à l'absence de
cache (`overflow.ts:84-91`). Le cliff disparaît, mais au prix de la perte d'une optimisation dont
le raisonnement est sain.

**A5.4 — Exposer `chars_per_token` en configuration.** Rejeté : cela ajoute une molette à un
défaut qui est un mauvais modèle, pas une valeur manquante, et déplace le problème vers
l'opérateur au lieu de le résoudre.

**A5.5 — Lisser `isReadHeavy` en laissant le choix à l'opérateur via
`read_heavy_preserve_recent_tokens`.** Rejeté : la clé existe déjà (`config.ts:328-330`) et couvre
le plafond, mais la discontinuité est dans la valeur par *défaut* de la branche, pas dans son
plafond. Configurer `read_heavy_preserve_recent_tokens` à 8 000 supprimerait la branche read-heavy
entière, donc aussi l'arme anticipée non cachée, qui est une optimisation indépendante et valide. Le
lissage doit être structurel, pas configurationnel.

**A5.6 — Corriger le diviseur en restreignant `isDense` au seul JSON, à 2,8.** Rejeté, et c'est la
leçon de l'objection principale : le JSON de sortie d'outil n'est pas la population sur laquelle le
2,8 a été mesuré (les blocs XML du prompt système), et `inspectionTokens` ne lit que des sorties
d'outil. Ce serait rattacher une mesure à un texte non mesuré, sur la population exacte que le
verdict a montrée non couverte. Retiré du périmètre ; la condition de réactivation est au §9.3.

**A5.7 — Conserver la forme brute du budget, sans `Math.round`.** Rejeté : elle produit un budget
fractionnaire, `INFERE:` `23 999,6` pour `inspected = 59 999` (§4). Un nombre de tokens non entier
est un défaut de type, pas un arrondi acceptable, et il se propagerait au slicing de la queue en
aval (`compaction.ts:440-461`).

**A5.8 — Conserver `ramp > 0` et mettre à jour les deux assertions de
`src/session/overflow.test.ts`.** C'est la contrepartie de la variante retenue pour le point (c),
elle a été examinée puis écartée, parce que c'est elle — et non la formule — qui crée la régression
que le revalidateur refuse. Avec `ramp > 0`, le prédicat `isReadHeavy` décrit la zone de
**transition** et plus le **seuil** : `config.ts:326` annonce que `read_heavy_min_tokens` « classe
le contexte courant », et `readHeavy` est journalisé comme un fait (`overflow.ts:167`) ; les deux
statements deviendraient faux pendant 40 000 tokens. Le cliff ne serait pas supprimé, il serait
déplacé de 20 000 à 60 000. Corriger deux assertions pour faire taire une incohérence de sémantique
est l'inverse de la discipline de preuve.

## 6. Risks

**R6.1 — Régression sur les tests existants : deux assertions vertes cassent. Les deux sont dues à
ce correctif, aucune n'était déjà rouge.** Le tableau ci-dessous est vérifié assertion par
assertion contre le code relu ; la colonne « aujourd'hui » est l'état actuel du fichier
`packages/opencode/src/session/overflow.test.ts` (54 lignes, six assertions dans
`describe("isReadHeavy")`).

| ligne | assertion | aujourd'hui | après | statut |
|---|---|---|---|---|
| `:32` | `isReadHeavy([inspection(chars(20_000))], cfg())` | `true` | **`false`** | **rouge, causée par le correctif** |
| `:36` | `chars(19_000)` | `false` | `false` | verte |
| `:40` | `chars(30_000)` en `bash` | `false` | `false` | verte |
| `:44` | `chars(10_000)` + `chars(10_000)` | `true` | **`false`** | **rouge, causée par le correctif** |
| `:48` | `chars(20_000)` avec `read_heavy_min_tokens: 50_000` | `false` | `false` | verte |
| `:52` | `chars(30_000)` puis `summary()` | `false` | `false` | verte |

**La cause réelle, et ce qui n'est pas la cause.** Les deux assertions rouges sont
`packages/opencode/src/session/overflow.test.ts:32` et `:44`. Elles s'appuient sur le helper
`chars` de la ligne 26, relu verbatim :

```ts
/** `inspectionTokens` divides by four, so this yields exactly `tokens`. */
const chars = (tokens: number) => "x".repeat(tokens * 4)
```

`chars(20_000)` produit 80 000 caractères de `x` : ni `{`, ni `[`, ni balise, donc **non dense**, et
`80 000 / 4 = 20 000` exactement. `chars(10_000)` + `chars(10_000)` font la même somme. **Le helper
`chars` est intact et ne doit pas être ajusté**, et **`CHARS_PER_TOKEN` reste `4`** : le diviseur
n'est pas en cause, il n'a pas bougé et n'a qu'un seul usage (`overflow.ts:63`).

La cause est **`ramp > 0` appliqué à `tokens == start`**. `ramp = (20 000 − 20 000) / 40 000 = 0`,
donc `ramp > 0` est faux à `inspected === 20 000` exactement, tandis que l'état actuel
(`overflow.ts:77`, `tokens >= start`) est vrai à cet entier. La correction est dans la formule du
§4(c) (`ramp >= 1`), pas dans les tests : voir R6.1 bis et A5.8. Une version antérieure de cette
proposition affirmait l'inverse — « aucune régression » — et recommandait d'ajuster `chars` ; c'était
faux deux fois, et cela aurait cassé deux tests verts pour rien. Conformément à la doctrine du
dépôt (C-26, `docs/harness-audit/CORRECTIONS.md:36` : une régression annoncée mais non comptée
précisément vaut défaut en soi), aucune affirmation de non-régression n'est laissée sans
démonstration assertion par assertion.

**R6.1 bis — Le sens de deux prédicats exposés change.** `isReadHeavy` et `trigger().readHeavy`
passent de « seuil franchi » à « rampe saturée ». Valeurs exactes après le correctif, pour la
config auditée : `false` à `inspected = 1 000`, `18 000`, `19 999`, `20 000`, `23 000`, `30 000` et
`59 999` ; `true` à `60 000` et `500 000`. C'est voulu (§4(c), A5.8) et c'est la contrepartie exacte
de la suppression du cliff : `readHeavy` ne peut plus être vrai pendant que le budget est encore
partiel. Conséquence à assumer : tout consommateur de `trigger().readHeavy` voit `false` sur la
zone de transition. Dans le dépôt, le seul consommateur est le journal de débogage
(`overflow.ts:167`) ; `isReadHeavy` n'a qu'un appelant en production (`compaction.ts:22`/`:529`),
que le changement (d) remplace par la rampe.

**R6.2 — Modification des seuils d'arme anticipée, y compris dans la zone médiane.** C'est le
risque principal, il est **délibéré** et il est chiffré sur toute la plage
`20 000 < inspected < 60 000`, pas seulement à ses extrémités (tableau du §4). Sur un provider sans
cache lu, la valeur d'arme passe de `proportional × 0,8` à une valeur **strictement plus haute**,
donc `computed.value` (`overflow.ts:114`) remonte et la compaction devient **plus tardive** :

- `inspected = 23 000` ⇒ `ramp = 0,075` ⇒ `early` 464 640 → **572 088** (`INFERE:` la valeur ;
  le pourcentage de variation est lui aussi inféré) ;
- `inspected = 30 000` ⇒ `ramp = 0,25` ⇒ `early` 464 640 → **551 760**, soit **+87 120 (+18,75 %)** —
  c'est le point médian qui était absent du dossier, et il est désormais verrouillé par T7.3 ;
- `inspected = 59 999` ⇒ `ramp = 0,999975` ⇒ `early` **464 642**, soit 2 tokens **au-dessus** de
  la valeur de `60 000` (464 640). Cette inversion de 2 tokens est un résidu de l'arrondi plancher
  sur une multiplication flottante ; sans effet sur la décision, consigné pour être connu.

Ce déplacement est la conséquence directe du changement demandé : on remplace un plancher fixe par
une moyenne pondérée par le volume. Les deux extrémités sont inchangées et vérifiées : à
`inspected = 500 000` la rampe vaut 1, donc `early = 464 640`, `readHeavy = true` et
`value = 464 640`, et les assertions des lignes 92, 94, 103, 104 restent identiques ; à
`inspected = 1 000` la rampe vaut 0, donc `early = floor(proportional × (0,8 + 0,2 × 1)) =
proportional`. `proportional` est **déjà un entier** (`overflow.ts:102` fait
`Math.floor(usable × threshold)`), donc l'arme vaut `580 800` et non `464 640`. **La ligne 113
change : `464_640` → `580_800`**, et son assertion doit être réécrite (voir T7.5) ; la ligne 115,
elle, ne voit aucun changement.

**R6.3 — Trois changements de comportement à la frontière, que rien n'observait aujourd'hui.**
Aucun test existant ne couvre la valeur *exacte* d'`inspected = 20 000` (le test le plus proche est
à `1 000`, `test/session/overflow.test.ts:111`) ni le budget à cette frontière. Le correctif les
change :

- budget de verbatim : `24 000` aujourd'hui → `8 000` après (le saut de 16 000 tokens **disparaît**,
  c'est le but) ;
- `trigger().value` : `464 640` aujourd'hui → `580 800` après, l'arme cessant d'être active
  exactement au seuil, et `19 999` comme `20 000` donnant désormais la même valeur ;
- `trigger().readHeavy` : `true` aujourd'hui → `false` après sur toute la zone `20 000 … 59 999`
  (R6.1 bis).

Une quatrième transition est créée, à la frontière haute : `readHeavy` redevient `true` à `60 000`
et le budget atteint son plafond. Ces quatre transitions sont verrouillées par T7.4 et T7.6 plutôt
que subies.

**R6.4 — Coût en tokens et en latence.** Aucun coût de tokens ajouté : aucune requête, aucune
dépendance, aucun appel réseau, aucun `slice` de chaîne (le reniflage de 64 caractères du draft
précédent a disparu avec le changement de diviseur). Coût CPU, déduit des blocs du §4 et non
mesuré : le correctif ajoute **une division, un `min`, un `max` et un `round` par appel** de
`readHeavyRamp` / `preserveRecentBudget`, sur des chemins déjà appelés une fois par tour. Il ne
retire rien : `inspectionTokens` reste inchangé et ne calculait déjà sa division qu'une fois par
appel, hors boucle sur les parts. La seule hausse possible est indirecte et orientée dans le bon
sens : moins de budgets de verbatim gaspillés, donc moins de relectures de fichiers, donc moins de
tours. Aucun chiffre de latence n'est avancé ici, faute de mesure.

**R6.5 — Risque de sécurité : nul.** Le correctif ne touche ni aux permissions, ni aux requêtes,
ni aux chemins de fichiers, et ne lit aucun contenu que le code ne lisait déjà. La surface
d'injection décrite dans les versions précédentes — un attaquant nommant `<goal_reminder>` en tête
d'une sortie d'outil pour obtenir un budget plus généreux — **disparaît avec le changement de
diviseur**, puisqu'aucun reniflage de contenu n'est effectué. La seule valeur lue est
`input.inspected`, déjà calculée par le code existant (`overflow.ts:152`).

**R6.6 — Le paramètre libre de la politique.** `READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS`
place le budget plein à 60 000 tokens inspectés, soit trois fois le seuil actuel. C'est le seul
paramètre non déduit d'une mesure ; il est isolé en une constante nommée pour être ajusté sans
toucher à la logique, et il est **arbitré comme choix de politique assumé** (§9.2). Sa borne haute
est néanmoins testée : `test/session/overflow.test.ts:78` et `:86` pinnent `inspected = 500 000`,
soit une rampe saturée quelle que soit la valeur du span.

| finding | statut | preuve |
|---|---|---|
| F1 — occurrences `compaction.test.ts` non classifiées | **clos** | grep `preserve_recent_tokens\|read_heavy\|readHeavy` sur `packages/opencode/test/session/compaction.test.ts` : **10** correspondances, `533`, `534`, `1239`, `1265`, `1290`, `1327`, `1378`, `1772`, `1816`, `1851`, chacune relue et protégée (voir R6.1 bis) |
| F2 — diviseur de `src/util/token.ts` | **clos** | ses deux seuls appelants (`compaction.ts:518`, `:603`) n'ont pas le prompt système ; `msgs` vient de `compaction.ts:510` |
| F3 — budget fractionnaire de la forme brute | **clos dans cette proposition** | `Math.round` ajouté au §4(d) ; `INFERE:` `23 999,6` à `59 999`, et `p10-ramp.ts:8` implémente la forme sans arrondi |
| F4 — divergence possible entre l'arme et le budget | **clos dans cette proposition** | les deux consomment `inspectionProfile(...).ramp` (§4(b)) |
| F5 — deux assertions vertes cassées | **clos dans cette proposition** | cause isolée à `ramp > 0` (§4(c)), remplacée par `ramp >= 1` ; les deux assertions sont mises à jour et un cas de saturation est ajouté (T7.6) |
| F6 — T7.4 non constructible | **clos dans cette proposition** | `export` sur `preserveRecentBudget` (§4(d)) ; T7.2 et T7.4 n'utilisent plus le `const select` local de `compaction.ts:521` |

## 7. Tests

Deux fichiers de test sont touchés : `packages/opencode/test/session/overflow.test.ts` (étendu) et
`packages/opencode/src/session/overflow.test.ts` (deux assertions et deux noms de test mis à jour,
un cas ajouté). Aucune donnée de production n'est modifiée par ces changements.

**T7.1 — Rampe proportionnelle.** Dans `packages/opencode/test/session/overflow.test.ts`, import
`Overflow.readHeavyRamp`. Avec `read_heavy_min_tokens: 20 000` : `readHeavyRamp(0) === 0`,
`readHeavyRamp(18_000) === 0`, `readHeavyRamp(20_000) === 0`, `readHeavyRamp(30_000) === 0.25`,
`readHeavyRamp(60_000) === 1`. Critère de succès observable : les cinq valeurs sont exactes et
aucune n'est `NaN`.

**T7.2 — Continuité du budget de verbatim, via l'accesseur exporté.** Même fichier, avec
`import { preserveRecentBudget } from "@/session/compaction"` et le helper :

```ts
const budgetAt = (inspected: number) =>
  preserveRecentBudget({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), ramp: Overflow.readHeavyRamp(inspected) })
```

Avec `read_heavy_min_tokens: 20 000` : budget(18 000) `=== 8_000`, budget(19 999) `=== 8_000`,
budget(20 000) `=== 8_000`, budget(23 000) `=== 9_200`, budget(30 000) `=== 12_000`, budget(60 000)
`=== 24_000`. Critère de succès observable : les six valeurs sont exactes, la séquence est non
décroissante, et budget(23 000) est strictement compris entre budget(20 000) et budget(30 000).
**Tous les littéraux sont calculés par les formules du §4**, et non estimés ; le test échoue sur le
code actuel pour budget(20 000) et budget(23 000).

**T7.3 — Zone médiane de la rampe (verrouille le déplacement du pivot).** À côté de la ligne 113
dans `describe("Overflow read-heavy trigger")` :

```ts
  test("scales the early trigger in the middle of the read-heavy ramp", () => {
    const trigger = Overflow.trigger({
      cfg: proportionalCfg,
      model: model({ cacheRead: 0 }),
      inspected: 30_000,
    })
    expect(trigger.cacheAware).toBe(false)
    expect(trigger.early).toBe(551_760)
    expect(trigger.readHeavy).toBe(false)
    expect(trigger.value).toBe(580_800)
  })
```

Critère de succès observable : `early` vaut exactement `551_760` (et non `464_640`, valeur
actuelle), ce qui prouve que le point médian est rampe et pas plancher ; `readHeavy` vaut `false`,
conformément à R6.1 bis. Ce `false` est ce qui **désarme** l'arme (`ramp >= 1` non atteint), donc
`value` vaut `Math.min(proportional, absolute) = 580_800` (`overflow.ts:114`) : la zone médiane est
vérifiée par `early`, `value` ne vaudrait `551_760` que si l'arme y restait active.

**T7.4 — Frontière `19 999 / 20 000` du budget et de l'arme.** Même fichier :

```ts
  test("no longer jumps the verbatim budget at the read-heavy minimum", () => {
    expect(budgetAt(19_999)).toBe(8_000)
    expect(budgetAt(20_000)).toBe(8_000)
    expect(Overflow.trigger({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), inspected: 19_999 }).early).toBe(580_800)
    expect(Overflow.trigger({ cfg: proportionalCfg, model: model({ cacheRead: 0 }), inspected: 20_000 }).value).toBe(580_800)
  })
```

Critère de succès observable : les deux budgets sont **égaux**, et l'arme vaut `580_800` des deux
côtés ; le test échoue sur le code actuel, où budget(20 000) vaut `24 000` et
`trigger(20 000).value` vaut `464_640`. Le test **ne dépend d'aucun `select` ni d'aucun pipeline
Effect** : il n'utilise que l'export du §4(d), ce qui le rend constructible dans ce dépôt (F6).

**T7.5 — Non-régression du pivot et de l'arme existante.** Vérifier que les seuils de
`packages/opencode/test/session/overflow.test.ts` lignes 70, 82, 92, 94, 103, 104, 114 et 115
sont inchangés après le correctif. C'est le test qui protège le travail de `overflow.ts:15-20`. Ces
valeurs sont confirmées par le tableau du §4 (`inspected = 500 000` ⇒ rampe 1, donc
`readHeavy = true` ; `inspected = 1 000` ⇒ rampe 0, donc `readHeavy = false`).

**Réécriture de la ligne 113.** Elle sort de la liste ci-dessus : à `inspected = 1 000` la rampe
vaut 0, donc `early = proportional = 580_800` et non `464_640`. L'assertion `:113` devient
`expect(trigger.early).toBe(580_800)`. C'est le **seul** test vert du dossier que le correctif
réécrit sans le casser ; aucun autre test de la proposition (T7.1 à T7.6) ne touche à `:113`.

**T7.6 — Les deux prédicats exposés, à leur nouvelle définition.** Dans
`packages/opencode/src/session/overflow.test.ts`, deux assertions changent (`true` → `false`) et un
cas est ajouté ; le helper `chars` (ligne 26) n'est **pas** modifié :

```ts
  test("is not yet read-heavy at exactly the default minimum", () => {
    expect(isReadHeavy([inspection(chars(20_000))], cfg())).toBe(false)
  })

  test("sums inspection output across messages before applying the same minimum", () => {
    expect(isReadHeavy([inspection(chars(10_000)), inspection(chars(10_000))], cfg())).toBe(false)
  })

  test("is read-heavy once the inspected volume saturates the ramp", () => {
    expect(isReadHeavy([inspection(chars(60_000))], cfg())).toBe(true)
  })
```

Critère de succès observable : les six assertions du bloc `describe("isReadHeavy")` (lignes 32, 36,
40, 44, 48, 52) plus les trois ci-dessus passent, et `chars(20_000)` reste `"x".repeat(80_000)`.
C'est ce test qui empêche la régression R6.1 de revenir par la formule.

**Commandes exactes, depuis `C:\jeanluc\opencode-fork\packages\opencode` :**

```powershell
bun test test/session/overflow.test.ts
bun test src/session/overflow.test.ts
bun test test/session/compaction.test.ts
bun typecheck
```

**Critère de succès global :** les quatre commandes sortent en code 0, le tableau du §4 est
reproduit à l'identique par T7.2, T7.3 et T7.4, et aucun autre test du dépôt ne passe de vert à
rouge.

## 8. Effort

**S** — deux fichiers source, une constante et deux fonctions exportées nouvelles, une signature
interne modifiée, un `export` ajouté sur `preserveRecentBudget`, deux fichiers de test à étendre
(et non un seul), aucune dépendance, aucune clé de configuration et aucune mesure à produire :
c'est le retrait du changement de diviseur (non mesuré, §9.3) qui fait tomber l'effort de `M` à `S`,
le reste étant de l'arithmétique déjà épinglée. Le poste « accesseur de budget pour T7.4 » est
`XS` — un mot-clé `export` — et le réintégrer ne change pas la lettre.

## 9. Verdict self-assessment

**READY** — plus aucun `NEEDS_REVIEW` : les deux points qui en relevaient sont tranchés, l'un par
correction du correctif, l'autre par retrait de l'affirmation non mesurée.

### 9.1 Required changes du revalidateur, tracés

| # | Required change | statut | où et comment |
|---|---|---|---|
| RC1 | Re-scaler la preuve du point (a) | **appliqué** | « Hors périmètre mesuré » (§2) : `32 807 / 2,8` et « −3 515 tokens par tour » ne subsistent que dans le paragraphe de retrait et dans A5.6, qui rejette l'alternative ; `CHARS_PER_TOKEN` reste `4` (E4) ; `isDense` et ses trois branches XML sont retirés — aucun `isDense` n'existe dans `src/session/` ; le ratio 2,8 n'est appliqué au JSON qu'avec la mesure du §9.3 |
| RC2 | Couvrir la zone médiane de la rampe | **appliqué** | R6.2 chiffre `23 000 → 572 088`, `30 000 → 551 760` (+87 120, +18,75 %), `59 999 → 464 642` ; le tableau du §4 couvre `20 000 < inspected < 60 000` en six points ; T7.3 asserte `early === 551 760` à `inspected: 30 000`, `value` y valant `580 800` parce que `readHeavy` y vaut `false` et désarme donc l'arme |
| RC3 | Corriger R6.1 et couvrir la frontière | **appliqué** | R6.1 est réécrit : il constate **deux** assertions rouges (`:32` et `:44`), nomme la cause réelle (`ramp > 0` à `tokens == start`, pas le diviseur), déclare le helper `chars` intact ; la correction est dans la formule (§4(c), `ramp >= 1`, avec A5.8 en contrepartie) et T7.6 verrouille le nouveau prédicat ; T7.4 verrouille la frontière `19 999 / 20 000`, via l'accesseur exporté et non via un `Compaction.select` inexistant |
| RC4 | Énumérer la ligne 1851 et clore F1 | **appliqué** | R6.1 bis et F1 : les 10 occurrences sont énumérées et relues une à une (`533`, `534`, `1239`, `1265`, `1290`, `1327`, `1378`, `1772`, `1816`, `1851`), chacune avec son mécanisme de protection (`overflow.ts:107` pour les deux premières, `compaction.ts:306` pour les huit autres — le retour anticipé de `preserveRecentBudget`) ; F1 est clos sur preuve, pas sur déclaration |

Les deux objections qui restaient ouvertes sont traitées, pas contournées :

- **N1** (`src/session/overflow.test.ts:32` et `:44`) → **résolue par le correctif**, au prix d'un
  changement de sémantique documenté (R6.1 bis). Les deux tests sont **verts aujourd'hui** et
  casseraient sous la variante `ramp > 0` : ce sont donc deux défauts du correctif, pas des résidus.
- **N2** (T7.4 illisible via `Compaction.select`) → **résolu** : `preserveRecentBudget` est
  exporté : l'export porte sur la `function` de niveau module `preserveRecentBudget`
  (`compaction.ts:304`), le `const select` de `compaction.ts:521` restant, lui, un `const` local à
  portée de fonction et donc non exportable. Le coût est le mot-clé `export`.
  Le coût `XS` est répercuté au §8.

### 9.2 Décision sur `READ_HEAVY_RAMP_SPAN` — politique assumée, mesure hors périmètre

**Décision : le paramètre est une politique, pas une affirmation ; il est conservé, nommé, testé et
déclaré hors périmètre de mesure.** Justification en trois temps :

1. **La mesure n'existe pas.** Le seul artefact P10 présent dans
   `C:\Users\jeanl\AppData\Local\Temp\opencodev2\` est `p10-ramp.ts` (14 lignes), relu
   intégralement : il applique les formules de la rampe à `proportional` et `usable` de la
   configuration auditée, et il ne contient **aucune** mesure de coût de relecture, aucun relevé de
   tours, aucune observation de session. Aucune courbe de coût n'est donc disponible, et cette
   révision n'a aucun shell pour en produire une.
2. **Ce qui reste vrai sans mesure.** Le span ne décide rien seul : il ne déplace ni le seuil
   (`config.ts:326`), ni les bornes de la rampe testées par T7.1 et T7.5, ni le point médian
   verrouillé par T7.3. Il choisit **à quel volume la politique de verbatim atteint son plafond**,
   et il se modifie en une ligne d'une constante nommée, sans toucher à la logique.
3. **Ce qu'un validateur peut encore contester.** Que `3 × READ_HEAVY_MIN_TOKENS` soit le bon
   multiplicateur, alors que le raisonnement disponible — une relecture coûte plus cher qu'un tour
   de contexte supplémentaire, d'où un plateau plus haut que l'ancien 8 000 — est un argument et
   non une mesure. Si un validateur veut trancher ce point, il n'a pas à rejeter le correctif : il a
   à donner un multiplicateur, et T7.1 / T7.2 se réajustent dessus.

**Condition de réactivation, explicite et vérifiable :** un relevé par session read-heavy
comparant le nombre de relectures de fichiers au budget de verbatim atteint, sur au moins une
semaine d'usage réel, ferait passer l'item de `out_of_scope` à `NEEDS_REVIEW` avec un multiplicateur
chiffré. Tant que ce relevé n'existe pas, l'item reste `out_of_scope` : c'est la mesure qui manque,
pas l'implémentation.

### 9.3 Décision sur le ratio 2,8 — `out_of_scope`, avec condition de réactivation

Le ratio « ≈ 2,8 caractères par token » **est retiré de tout raisonnement d'impact** (§2,
« Hors périmètre mesuré ») et classé `out_of_scope`. Trois motifs cumulatifs :

1. **Mauvaise population.** Il a été mesuré sur `<context_slots>`, `<goal_reminder>` et
   `<task-contract>`, qui vivent dans le prompt système, alors que `inspectionTokens`
   (`overflow.ts:52-64`) n'additionne que des sorties d'outils d'inspection. Aucun bloc du prompt
   système n'entre dans le périmètre du correctif.
2. **Mauvaise grandeur.** Le chiffre était exprimé en tokens **estimés** avec le diviseur en cause,
   donc il ne mesurait pas le ratio : il en répétait le produit. Une mesure valide exige le nombre de
   tokens **provider** correspondant à une sortie réelle de `inspect_batch` ou `repo_overview`, à
   volume connu.
3. **Aucun patch ne le traverse.** Les deux seuls appelants de `Token.estimate` sont
   `compaction.ts:518` et `compaction.ts:603`, et ni l'un ni l'autre ne voit le prompt système
   (§2, point 2). Le gain annoncé de « −3 515 tokens par tour » était donc nul par construction.

**Condition de réactivation :** un rapport de tokens provider, obtenu sur des sorties réelles de
`inspect_batch` / `repo_overview`, avec le nombre de caractères correspondant et le nombre de tours
observés. Le ratio ne sera alors appliqué qu'à cette population, et `CHARS_PER_TOKEN` ne bougera que
si la mesure le justifie. En attendant, `CHARS_PER_TOKEN = 4` reste (E4) et A5.1 (vrai tokenizer)
reste une piste distincte, non ouverte ici.

### 9.4 Disposition de `CORRECTIONS.md`

| correction | statut | où |
|---|---|---|
| **C-05** — ne pas confondre « `X / 4` est un plancher » et un plancher de régression | **respecté** | Le plancher de la régression est isolé et corrigé là où il est : §4(c) fixe `ramp >= 1` (au lieu de `ramp > 0`), et la cause est nommée (« `ramp > 0` appliqué à `tokens == start` »), pas absorbée dans un ajustement de test. Le diviseur, lui, n'est pas touché (`CHARS_PER_TOKEN = 4`, E4), conformément à la lettre de C-05. |
| **C-11** — distinguer regression d'un résidu préexistant | **respecté** | R6.1 tranche assertion par assertion : `:32` et `:44` sont **vertes dans le fichier actuel** et casseraient sous `ramp > 0`, donc imputables au correctif. Aucune des 8 occurrences protégées de `compaction.test.ts` (F1) n'est imputée au correctif : elles sont couvertes par `overflow.ts:107` ou `compaction.ts:306`, tous deux conservés. Aucun résidu n'est présenté comme clos par ce correctif. |
| **C-26** — compter précisément les régressions | **respecté** | R6.1 énumère les 6 assertions du fichier, dont 2 rouges, avec la cause et la correction ; le tableau du §4 est numéroté point par point. |

### 9.5 Résidus assumés

Ces trois points sont **conscients et documentés**, pas des lacunes :

- **R1 — `trigger().readHeavy` change de sémantique** (`false` sur `20 000 … 59 999`). Le
  prédicat documenté devient « rampe saturée ». Acceptable parce que le seul consommateur est le
  journal `overflow.ts:167` et parce que `readHeavy = true` ne peut pas signifier « budget encore
  partiel ». Mais un consommateur externe (plugin, script) qui lit ce champ verrait un changement.
- **R2 — Le multiplicateur du span (3×) n'est pas mesuré** (§9.2). Arbitré comme politique, isolé
  en une constante nommée, testé par T7.1/T7.2, avec condition de réactivation explicite.
- **R3 — Les chiffres du §4 sont de l'arithmétique dérivée, pas des sorties d'exécution.** Cette
  révision n'a pas de shell. Chaque chiffre est reconduit en assertion exécutable par T7.2 / T7.3 /
  T7.4, de sorte que l'implémentateur les valide à l'exécution — la distinction est signalée dans
  le texte (« Statut des chiffres », R6.2, R6.4, A5.7).