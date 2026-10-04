# Verdict P10 — ratio unique et seuil binaire

## Proposal

`P10` — « Estimation de contexte : ratio unique et seuil binaire », validé dans
`docs/harness-audit/proposals/P10-token-estimation.md`.

## Validator

`lean_child` (session goalState version 2) — `independent` : ce validateur n'a pas rédigé la
proposition et ne l'a pas relue avant de la confronter au code. Aucune modification de fichier
source n'a été faite ; le seul fichier écrit par cette validation est celui-ci.

## Status

`PASS_WITH_CHANGES`

Le modèle de décision (b)(c)(d) est sain, borné et continu, et il supprime réellement le cliff ×3
que le booléen produit. Ce qui n'est pas validé en l'état, c'est **la preuve du changement (a)** :
le ratio 2,8 est mesuré sur une population que la fonction à corriger ne peut pas lire, et
l'incidence chiffrée annoncée est donc imputée à un chemin que le patch ne touche pas. S'ajoute une
changement de comportement non observé au milieu de la rampe. Quatre corrections obligatoires,
aucune ne remet en cause l'architecture.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `overflow.ts` exactes et verbatim | ok | `packages/opencode/src/session/overflow.ts:7-11` (les 5 constantes, dans l'ordre annoncé), `:12`, `:15-20` (commentaire, 6 lignes, mot pour mot), `:21-25`, `:30`, `:46-50`, `:52-64` (bloc `inspectionTokens` identique), `:58-61`, `:63`, `:76-78`, `:84-91`, `:95-122`, `:108`, `:112`, `:114`, `:151`, `:152`, `:167` |
| citations `compaction.ts` exactes et verbatim | ok | `packages/opencode/src/session/compaction.ts:21`, `:44-48`, `:49-53`, `:54`, `:119-124`, `:199-206`, `:201`, `:202-204`, `:205`, `:413`, `:422`, `:424`, `:498` |
| citations `prompt.ts` / `token.ts` exactes | ok | `prompt.ts:1984`, `:2438-2446`, `:2452-2469` ; `src/util/token.ts:1-5`, et les **deux seuls** appels de `Token.estimate` en `src` sont bien `compaction.ts:413` et `:498` |
| citations de tests exactes | ok | `src/session/overflow.test.ts:32,36,40,44,48,52` = les six assertions de `describe("isReadHeavy")` ; `test/session/overflow.test.ts:34-37` (commentaire du pivot audité), `:70,82,92,94,103,104,113` ; `test/session/compaction.test.ts:533-534,1239,1265,1290,1327,1378,1772,1816` |
| le diviseur unique est bien là où la proposition le dit | ok | `overflow.ts:11` (déclaration) et `:63` (seul usage) ; `src/util/token.ts:1` est une **constante distincte**, ce que la proposition dit |
| **Q2 — où `CHARS_PER_TOKEN` sert-il réellement** | ok, tracé complet | un seul site d'usage : `overflow.ts:63`, dans `inspectionTokens`. Deux appelants de `inspectionTokens` : `:77` (`isReadHeavy`) et `:152` (`isOverflow`). `isReadHeavy` n'a qu'un appelant en production : `compaction.ts:424`. `inspected` (`overflow.ts:152`) part dans `trigger` → `readHeavy` (`:109-111`) → `arm` (`:112`) → `value` (`:114`), comparé au total provider en `:159` |
| **Q2 — « l'overflow est détecté trop tard » est-il affirmable ?** | **non — et la proposition ne l'affirme pas** | le pivot de base `Math.min(proportional, absolute)` (`overflow.ts:114`) ne dépend d'aucun ratio : `proportional` vient de `threshold()` (`:102`), `absolute` de `:103`. Le ratio n'atteint la décision **que** par l'arme read-heavy, et celle-ci n'existe que si `cacheAware(model)` est faux (`overflow.ts:104`, `:89-91`, `model.cost.cache.read > 0`). La proposition dit exactement cela (§2 dernier paragraphe, Mechanism étape 3, A5.2) : la question est tranchée **contre** l'affirmation, et la proposition est correcte |
| **Q3 — `tokenCount` préfère-t-il le total provider ?** | ok | `overflow.ts:49` : `return tokens.total || tokens.input + tokens.output + tokens.cache.read + tokens.cache.write`. Total non nul ⇒ le ratio n'entre pas dans la décision de compacter |
| la proposition tient-elle compte de ce périmètre restreint ? | ok | §2 (« il ne reste que les estimations locales, c'est-à-dire le signal read-heavy et le dimensionnement de la queue »), Mechanism 3, A5.2, et « Inchangé volontairement » n°2 qui interdit explicitement d'introduire le ratio dans `tokenCount`. **Aucune surestimation de ce côté** |
| **Q4 — le correctif préserve-t-il le calibrage de `overflow.ts:15-20` ?** | ok, pas de saccade | les quatre patchs (a)-(d) touchent le diviseur de `inspectionTokens`, une rampe neuve, l'arme anticipée et le budget de verbatim. Ni `threshold()` (`:21-25`), ni `DEFAULT_THRESHOLD` (`:8`), ni `proportional` (`:102`), ni `absolute` (`:103`) ne bougent ; le commentaire économique est conservé « tel quel, commentaire compris » (§4) et verrouillé par T7.4. **Aucune régression de conception sur ce point** — un seuil justifié n'est remplacé par aucun booléen non justifié |
| **Q5 — la queue proportionnelle est-elle bornée ?** | ok, bornée deux fois | §4(d) : `volume = 8 000 + (ceiling − 8 000) × max(0, min(1, ramp))` ∈ [8 000, ceiling], `ceiling = cfg.read_heavy_preserve_recent_tokens ?? 24 000`, puis `Math.min(volume, max(2 000, floor(usable × 0.25)))`. Une session read-heavy **ne peut pas** conserver 100k tokens par défaut ; il faudrait que l'opérateur fixe lui-même `read_heavy_preserve_recent_tokens ≥ 100 000`, la molette déjà documentée (`src/config/config.ts:328-330`). En aval, l'assemblage de la queue respecte le budget tour par tour (`compaction.ts:441-461`) et dégrade en `tail fallback` (`:459`) plutôt que de sur-conserver |
| le correctif supprime vraiment la cause (le cliff) | ok | le cliff est `Math.max(0, min(1, ramp))` : `ramp = 0` en `19 999` comme en `20 000`, `ramp = 1` à `60 000`. Le budget passe de 24 000 (binaire) à 14 000 à 30 000 inspectés (table §4), donc continu |
| le correctif ne casse pas un comportement existant | **partiellement non-testé** | voir objection O2 : la zone intermédiaire de la rampe modifie `trigger().value` et aucun test, existant ou proposé, ne l'observe |
| tests proposés sont exécutables dans ce dépôt | ok | `packages/opencode/test/session/overflow.test.ts` (117 lignes, `describe("Overflow read-heavy trigger")` en `:74`) et `packages/opencode/src/session/overflow.test.ts` (54 lignes) existent tous deux ; `bun test test/session/overflow.test.ts`, `bun test src/session/overflow.test.ts`, `bun test test/session/compaction.test.ts`, `bun typecheck` sont des cibles valides depuis `packages/opencode` |
| le test T7.3 est-il cohérent avec le patch (a) ? | ok | `denseChars(56_000)` de JSON ⇒ 56 000 / 2,8 = 20 000 ⇒ `true` ; `chars(14_000)` = `"x".repeat(56_000)` (`src/session/overflow.test.ts:26`), non dense ⇒ 56 000 / 4 = 14 000 ⇒ `false`. Les deux assertions tiennent, et la démonstration « longueur identique, verdicts différents » est valide |
| effort et coût annoncés réalistes | ok | « **M** », deux fichiers, une dépendance nulle, un coût CPU d'une division et d'un `slice(0,64)` par part d'outil inspecté (R6.3) : cohérent avec ce que j'ai lu du chemin d'exécution |
| arithmétique de l'« erreur chiffrée » (§3) | ok comme calcul, **ko comme attribution** | `32 807 / 2,8 = 11 717`, `32 807 / 4 = 8 202`, écart 3 515 (30,0 %) et `0,107143 + 0,175 = 0,282143`, `(0,282143 − 0,25)/0,282143 = 11,4 %` : tous exacts. Voir O1 pour le fait que ces nombres portent sur une chaîne que `inspectionTokens` ne lit pas |

## Objections

### O1 — haute : la mesure du 2,8 porte sur une population que `inspectionTokens` ne peut pas lire, et le patch (a) lui attribue quand même 2,8

Ce que la proposition prend pour preuve (§2 : « ratio réel ≈ 2,8 caractères par token sur ces
blocs, et jusqu'à 32 807 caractères d'instructions réinjectés par tour ») est mesuré sur trois
blocs qui vivent dans le **prompt système**, jamais dans une sortie d'outil :

- `packages/opencode/src/session/prompt.ts:2438-2446` — `volatile.push(slots)` pour
  `<context_slots>` ;
- `packages/opencode/src/session/prompt.ts:2452-2472` — construction de `<goal_reminder>` ;
- `packages/opencode/src/session/compaction.ts:119-124` — `<task-contract>`.

Or la fonction à corriger n'additionne que des sorties d'outils d'inspection, et rien d'autre :

```ts
// packages/opencode/src/session/overflow.ts:59-60
if (part.type !== "tool" || !INSPECTION_TOOLS.has(part.tool) || part.state.status !== "completed") continue
chars += part.state.output.length
```

Trois conséquences, toutes vérifiables :

1. **Le chiffre d'impact ne décrit pas le correctif.** « Appliqué à la réinjection elle-même :
   `32 807 / 2,8 = 11 717` tokens réels contre `32 807 / 4 = 8 202` estimés, soit −3 515 tokens par
   tour » concerne une chaîne que `Token.estimate` n'appelle nulle part pour le prompt système
   (les deux seuls appels sont `compaction.ts:413`, `JSON.stringify(msgs)` — qui ne contient pas le
   prompt système — et `compaction.ts:498`, une sortie d'outil). Le patch ne change donc **zero
   octet** de ce chemin : annoncer ce nombre comme impact du correctif est une surestimation
   attribuée au mauvais périmètre.
2. **Trois des cinq branches de `isDense` sont mortes dans ce chemin.** `head.includes(
   "<task-contract")`, `"<context_slots>"`, `"<goal_reminder"` (proposition §4a) ne peuvent être
   atteints que si une *sortie d'outil* commence par ces balises, ce qui n'est pas la population
   mesurée. Elles ne sont justifiées par aucune observation.
3. **La généralisation au JSON n'est pas prouvée non plus.** §9.1 l'admet (« la mesure à 2,8 ne
   couvre que les premiers »), mais §4a applique 2,8 par défaut au JSON des sorties d'outils sans
   mesure dédiée : c'est rattacher une mesure à un texte non mesuré.

Ce qui reste solide, et qui suffit à justifier le reste de la proposition : le cliff ×3 du budget
(18 000 → 8 000 contre 23 000 → 24 000) est réel et mesuré, et il est indépendant du ratio.

**Quoi changer** : soit restreindre `isDense` à ce qui est mesuré etumentifiable, soit mesurer
d'abord. Concrètement — (i) retirer du §2 et du §3 les chiffres `32 807 / 2,8` et « −3 515 tokens
par tour » comme justification du correctif, ou les déplacer explicitement sous « hors périmètre :
prompt système, non mesuré » ; (ii) dans §4a, supprimer les trois branches XML (mortes dans ce
chemin) et, pour le JSON, exiger une mesure dédiée sur `inspect_batch`/`repo_overview` avant de
leur appliquer 2,8 — sinon laisser 4 et cantonner le correctif à (b)(c)(d), qui est le cœur du
défaut. Si l'auteur maintient (a) tel quel, ce point devient un `FAIL`.

### O2 — moyenne : la zone intermédiaire de la rampe déplace le pivot, et ni le risque ni les tests ne l'observent

Aujourd'hui l'arme est tout ou rien (`overflow.ts:106-112`) : `Math.floor(proportional *
0.8)` dès que `inspected >= min`. Le patch (c) la fait fondre en
`Math.floor(proportional * (READ_HEAVY_FRACTION + (1 - READ_HEAVY_FRACTION) * (1 - ramp)))`.
Pour `20 000 < inspected < 60 000` sur un provider **sans** cache lu, la valeur d'arme passe de
`proportional × 0,8` à une valeur strictement plus haute — donc `computed.value`
(`overflow.ts:114`) remonte et la compaction devient **plus tardive**. Exemple chiffré avec la
config auditée du dépôt (`proportional = 580_800`, `test/session/overflow.test.ts:53`) :
`inspected = 30 000` ⇒ `ramp = 0,25` ⇒ `early = 551 760` au lieu de `464 640` aujourd'hui.

R6.2 ne vérifie que les deux extrémités : `inspected: 500_000` (rampe 1, rien ne bouge) et
`inspected: 1_000` (rampe 0, rien ne bouge — ce que R6.2 dit bien). T7.1 teste `readHeavyRamp`, et
T7.2 le budget de verbatim, mais **aucun test proposé ni existant n'observe `trigger().early` ou
`trigger().value` à une valeur intermédiaire**. Un affaiblissement délibéré d'une politique
délibérée (commentaire `overflow.ts:84-91`) passe donc sous silence.

**Quoi changer** : quantifier ce delta dans R6.2 (au moins un point médian, ex. `30 000`), et
ajouter une assertion `Overflow.trigger({ cfg, model: model({ cacheRead: 0 }), inspected: 30_000 })`
qui verrouille `early` et `value` — dans `test/session/overflow.test.ts`, à côté de `:113`.

### O3 — moyenne : la régression annoncée en R6.1 sur `src/session/overflow.test.ts:32` est fausse et auto-contredictoire

R6.1 affirme : « `20 000` passe de read-heavy à non read-heavy, donc la ligne 32 casse. Le helper
`chars` (lignes 25-26) doit être ajusté en conséquence », puis, dans la même phrase : « les autres
assertions restent valides, leur sortie étant du texte `x` répété, qui n'est pas dense ».

Or la ligne 32 est précisément dans ce cas :

```ts
// packages/opencode/src/session/overflow.test.ts:25-26
/** `inspectionTokens` divides by four, so this yields exactly `tokens`. */
const chars = (tokens: number) => "x".repeat(tokens * 4)

// packages/opencode/src/session/overflow.test.ts:32
expect(isReadHeavy([inspection(chars(20_000))], cfg())).toBe(true)
```

`chars(20_000)` = 80 000 caractères de `x` : ni `{`, ni `[`, ni balise ⇒ **non dense** ⇒
`80 000 / 4 = 20 000` ⇒ toujours read-heavy ⇒ **la ligne 32 passe**. La proposition confirme elle-même
cette propriété dans T7.3, qui repose sur le même `'x'` répété. Suivre cette consigne casserait un
test vert pour rien, et le helper `chars` est en outre à la seule ligne 26 (la 25 est son
commentaire), pas « lignes 25-26 ».

Ce que R6.1 rate en revanche est un vrai changement de comportement non testé : le budget de
verbatim à **exactement** `20 000` inspectés passe de 24 000 (aujourd'hui, branche read-heavy) à
8 000 (après, `ramp = 0`) — un saut de 16 000 tokens, qui ne soit couvert par aucun test de
`test/session/compaction.test.ts` (aucun de ses cas ne configure `read_heavy_preserve_recent_tokens`
et tous ceux qui fixent `preserve_recent_tokens` sont protégés par l'early return de
`compaction.ts:201`).

**Quoi changer** : corriger R6.1 (ligne 32 ne casse pas, ne pas toucher `chars`), et ajouter un
cas de test qui verrouille le budget à la frontière `19 999 / 20 000` pour que le saut soit
observé et non subi.

### O4 — faible : « les 13 occurrences restantes » de `compaction.test.ts` sont dix, dont neuf déjà énumérées

Un grep sur `packages/opencode/test/session/compaction.test.ts` pour
`preserve_recent_tokens|read_heavy|readHeavy` rend **10** correspondances : lignes 533, 534, 1239,
1265, 1290, 1327, 1378, 1772, 1816 — les neuf citées par la proposition — et **1851**
(`compaction: { tail_turns: 1, preserve_recent_tokens: 500 }`), non citée. Le résidu est d'une
occurrence, pas treize, et elle est protégée par le même early return (`compaction.ts:201`).

**Quoi changer** : citer la ligne 1851 et **clore le finding F1** au lieu de le laisser ouvert
avec un compte faux ; le residu réel est vérifié et sans effet.

## Required changes

1. **Re-scaler la preuve du point (a)** (O1) : retirer `32 807 / 2,8` et « −3 515 tokens par tour »
   de la justification d'impact du §3, ou les marquer hors périmètre (prompt système, jamais lu
   par `inspectionTokens`, `overflow.ts:59-60`) ; supprimer de `isDense` les trois branches XML,
   mortes dans ce chemin ; ne pas appliquer 2,8 au JSON des sorties d'outils sans mesure dédiée
   mesurée sur `inspect_batch`/`repo_overview`. À défaut de mesure, livrer (b)(c)(d) seuls.
2. **Couvrir la zone médiane de la rampe** (O2) : chiffrer le déplacement du pivot non caché pour
   `20 000 < inspected < 60 000` dans R6.2 et ajouter une assertion `trigger().early` /
   `trigger().value` à `inspected: 30 000` dans `test/session/overflow.test.ts`.
3. **Corriger R6.1 et couvrir la frontière du budget** (O3) : `src/session/overflow.test.ts:32`
   ne casse pas, le helper `chars` (ligne 26) ne doit pas être ajusté ; ajouter le cas
   `19 999 / 20 000` sur le budget de verbatim.
4. **Énumérer la ligne 1851 et clore F1** (O4).

## Implementation guidance

Ordre de patch : **(c) d'abord, seul** — c'est le seul changement qui déplace une décision de
compaction, il se teste seul dans `test/session/overflow.test.ts` (bloc `:74`) sans toucher au reste ;
puis **(b)** (nouvelle `readHeavyRamp` + `inspectionProfile`, qui remplace le couple
`inspectionTokens`/`isReadHeavy` et supprime la divergence possible entre l'arme et le budget, en
gardant `isReadHeavy` exporté avec sa signature actuelle pour ne pas casser l'import de
`compaction.ts:21`) ; puis **(d)** (`preserveRecentBudget` prend `ramp: number` au lieu de
`readHeavy: boolean`, l'appelant `compaction.ts:424` change) ; **(a) seulement en dernier, et
seulement si la mesure demandée en Required changes 1 existe**. Piège connu : le commentaire
économique de `overflow.ts:15-20` et `threshold()` (`:21-25`) ne doivent apparaître dans aucun
diff — c'est le travail de calibrage, et T7.4 (`test/session/overflow.test.ts:70,82,92,94,103,104,113`)
est le garde-fou ; ne pas non plus transformer `trigger().readHeavy` (`:118`, journalisé en `:167`)
en variable dérivée sans le garder observable. Test à modifier en priorité :
`test/session/overflow.test.ts` (un seul fichier pour les seuils), puis
`src/session/overflow.test.ts` pour T7.3.
