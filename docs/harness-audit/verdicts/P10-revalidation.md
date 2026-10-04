# Revalidation P10 — ratio unique et seuil binaire

## Proposal

`P10` — « Estimation de contexte : ratio unique et seuil binaire », version révisée dans
`docs/harness-audit/proposals/P10-token-estimation.md` (547 lignes).

## Revisions applied

Contrôle conducted par relecture du code uniquement (`read`/`inspect_batch`, aucun shell, aucun
`git`). Le marqueur `> Révisé après verdict` (`P10:3`, « Corrections appliquées : 4/4 ») est traité
comme **zéro preuve** (C-21) : chaque required change est judged sur le code, jamais sur la
déclaration de l'agent de révision.

### RC1 — Re-scaler la preuve du point (a) — **RÉSOLU**

`P10:124-126` retire les chiffres, et le fait en nommant la faute plutôt qu'en la taisant :
« annonçait « `32 807 / 2,8 = 11 717` tokens réels contre `8 202` estimés, soit −3 515 tokens par
tour ». **Ces chiffres ne décrivent pas le correctif et sont retirés de la justification
d'impact.** » Puis `P10:146` : « **Décision : le changement de diviseur est retiré du périmètre.**
`CHARS_PER_TOKEN` reste `4`. » Aucune occurrence de `32 807 / 2,8` ou « −3 515 » ne subsiste comme
justification d'impact ; les seules occurrences sont dans le paragraphe de retrait et dans A5.6
(`P10:342-344`), qui rejette l'alternative.

Vérifié dans le code : `overflow.ts:11` = `const CHARS_PER_TOKEN = 4`, `:63` =
`return Math.ceil(chars / CHARS_PER_TOKEN)`. Le diviseur est bien toujours 4, et il n'a **qu'un**
seul usage (`:63`).

Point deméritoire supplémentaire : la révision affirme (`P10:139-143`) que les branches XML
d'`isDense` sont « trois branches mortes dans ce chemin ». J'ai relu `inspectionTokens`
(`overflow.ts:52-64`) : il n'existe **aucun** `isDense` dans le code actuel — c'est une
construction du brouillon précédent de la proposition, désormais retirée. L'affirmation est donc
plus forte que ce qu'elle énonce, et exacte. La citation de `overflow.ts:59-60` donnée en
justification est verbatim : `part.type !== "tool" || !INSPECTION_TOOLS.has(part.tool) ||
part.state.status !== "completed"` puis `chars += part.state.output.length`.

### RC2 — Couvrir la zone médiane de la rampe — **RÉSOLU**

Chiffré **et** asserté. Chiffré au tableau `P10:272` (`30 000 | 0,25 | 24 000 | **12 000** | 464
640 | 551 760 | 551 760`) et en R6.2 `P10:403`. Asserté par T7.3 (`P10:466-484`), qui exige
`trigger.early === 551_760` **et** `trigger.value === 551_760` à `inspected: 30 000`.

**Les deux corrections chiffrées de l'agent de révision sont confirmées par mon propre
recalcul**, indépendamment de ce qu'il affirme :

- `proportional = floor(968 000 × 0,6) = 580 800`. Ce n'est pas une hypothèse de la proposition :
  `test/session/overflow.test.ts:69` et `:82`/`:115` assertent déjà `580 800`.
- ramp à 30 000 = `(30 000 − 20 000) / 40 000 = 0,25` (`P10:218`, `:221`).
- `early = floor(580 800 × (0,8 + 0,2 × (1 − 0,25))) = floor(580 800 × 0,95) = 551 760`. **Exact.**
- `value = min(proportional, absolute, arm) = min(580 800, 580 800, 551 760) = 551 760`.
- budget = `min(round(8 000 + 16 000 × 0,25), max(2 000, floor(968 000 × 0,25) = 242 000))` =
  `min(12 000, 242 000)` = **`12 000`**. Le `14 000` de la version précédente était bien faux :
  `8 000 + 16 000 × 0,25 = 12 000`. La correction est juste.
- `Math.round` est bien nécessaire : à `inspected = 59 999`, ramp = `39 999 / 40 000 = 0,999975`,
  volume = `8 000 + 16 000 × 0,999975 = 23 999,6` — fractionnaire, et `preserveRecentBudget` doit
  renvoyer un entier. L'affirmation `P10:256-260` est exacte et le correctif est cosmétique-seulement
  dans le mauvais sens : sans lui, le type de sortie diverge.

J'ai également recalculé l'inversion de 2 tokens que la révision signale honnêtement
(`P10:405-407`) : `early = floor(580 800 × (0,8 + 0,2 × 0,000025)) = floor(464 642,90) = 464 642`
contre `464 640` à ramp 1. Confirmé, sans effet sur la décision, et correctement consigné.

### RC3 — Corriger R6.1 et couvrir la frontière `19 999 / 20 000` — **PARTIEL**

**La correction de R6.1 est juste** (`P10:371-372` : « la ligne 32 passe toujours » et « le helper
ne doit pas être ajusté »), et vérifiée : `overflow.test.ts:26` `chars = (tokens) => "x".repeat(tokens
* 4)` est intact, `:32` `isReadHeavy([inspection(chars(20_000))], cfg())` donne 80 000 caractères non
denses, `:63` divise par 4 ⇒ exactement 20 000 ⇒ `true`. Le diviseur n'ayant pas bougé, cette
assertion passe toujours.

**Mais R6.1 contient une affirmation fausse, et c'est une régression réelle.** `P10:373-376` vérifie
assertion par assertion et conclut pour la ligne 44 : « `10 000 + 10 000 = 20 000` → `true` ». Or le
§4(c) réécrit `isReadHeavy` en `inspectionProfile(...).ramp > 0` (`P10:238`) et pose
`readHeavy = early !== undefined && ramp > 0` (`P10:201`). À `inspected === 20 000`, ramp = 0, donc
`ramp > 0` est **faux**. `src/session/overflow.test.ts:32` **et** `:44` cassent sous le patch. Ces
deux tests sont verts aujourd'hui (`overflow.test.ts:32` et `:44` relus : `20 000 >= 20 000` → true).
Le tableau de vérification de R6.1 contredit donc le code du §4 dans le même document — et le
tableau de §4 comme T7.4 sont, eux, cohérents (`value === 580 800` à 20 000). C'est R6.1 qui a tort,
et cette contradiction existait déjà dans la version précédente, que le verdict n'a pas vue.

**La frontière est spécifiée mais pas constructible en l'état.** T7.4 (`P10:486-499`) est
arithmétiquement juste — `budget(19 999) === budget(20 000) === 8 000`, arme inerte des deux côtés,
`early === value === 580 800` — mais il lit le budget « via `Compaction.select` ». **Cette fonction
n'existe pas comme export** : `compaction.ts:416` déclare `const select = Effect.fn(
"SessionCompaction.select")(...)`, un `const` **local à une portée de fonction**, et les 8
occurrences de `select` dans le fichier (`:416`, `:577`, `:599`, `:637`, `:661`, `:751`, `:754`,
`:893`) n'en contiennent aucun. T7.4 exige donc soit un nouvel export, soit un accès au budget par un
autre chemin — ce qui contredit `P10:522` (« aucune dépendance », « un seul fichier de test à
étendre »).

### RC4 — Énumérer la ligne 1851 et clore F1 — **RÉSOLU**

Le compte est de **10, pas 13**, et la révision a raison. J'ai recompte indépendamment : mon grep de
`preserve_recent_tokens` sur `compaction.test.ts` rend **8** lignes (1239, 1265, 1290, 1327, 1378,
1772, 1816, 1851), soit exactement les 8 que `P10:382-383` attribue à l'early return de
`compaction.ts:201` ; les 2 restantes de la dizaine (533, 534) sont les clés `read_heavy_*` que
`P10:381` attribue au court-circuit de `overflow.ts:107`. Total 10, la répartition annoncée est
exacte.

Ligne 1851 citée verbatim, et j'en ai relu la source : `compaction.test.ts:1851` =
`compaction: { tail_turns: 1, preserve_recent_tokens: 500 },` — identique à `P10:383`. Le mécanisme
de protection est réel : `compaction.ts:200-201`
`const configured = input.cfg.compaction?.preserve_recent_tokens; if (configured !== undefined) return
configured` court-circuite avant tout calcul de rampe. F1 est clos sur preuve, pas sur déclaration.

## Status

`REVALIDATED-PASS_WITH_CHANGES`

3 required changes sur 4 sont réellement résolus, dont RC2 avec une arithmétique que j'ai recalculée
de façon indépendante et confirmée. RC3 est partiellement résolu : la correction de R6.1 est juste,
mais R6.1 conclut à tort « aucune régression » alors que le §4(c) casse deux tests verts, et T7.4
référence un export inexistant. La conception (b)(c)(d) n'est pas en cause et je ne lève aucune
objection d'architecture ; deux corrections restent obligatoires avant implémentation.

## Remaining objections

| id | sévérité | statut | objet | preuve |
|---|---|---|---|---|
| **N1** | haute | **OPEN** | R6.1 affirme à tort que `src/session/overflow.test.ts:32` et `:44` survivent. `P10:238` + `:201` font de `readHeavy` le prédicat `ramp > 0`, faux à `inspected === 20 000` (ramp = 0). Les deux tests sont verts aujourd'hui et cassent sous le patch. | `overflow.test.ts:32` et `:44` relus ; `P10:238`, `:201` ; ramp à 20 000 = `(20 000 − 20 000)/40 000 = 0` |
| **N2** | moyenne | **OPEN** | T7.4 lit le budget « via `Compaction.select` », qui n'est pas exporté. Le test ne compile pas sans ajouter un export, ce qui contredit le périmètre S annoncé. | `compaction.ts:416` = `const select` local ; grep `select` : 8 occurrences, 0 export ; `P10:495-496`, `:521-522` |

Aucune objection d'architecture. Les guards de T7.5 tiennent, vérifiés à la main : `inspected =
500 000` ⇒ ramp 1 ⇒ `early = floor(580 800 × 0,8) = 464 640`, donc les lignes 92, 94, 103, 104 sont
inchangées (`overflow.test.ts:92-94`, `:103-104`) ; `inspected = 1 000` ⇒ ramp 0 ⇒ `early =
proportional = 580 800`, `arm` non activé, `value = min(580 800, 580 800, 580 800) = 580 800`, donc
les lignes 113-115 sont inchangées (`overflow.test.ts:113-115`). Les deux extrémités de la rampe sont
épinglées par du code réel, pas par une hypothèse.

**C-05 et C-11 sont sans objet pour P10.** C-05 énonce que le plafond de 4 000 caractères vient de
`truncate.ts` et non de `terminal-output.ts` : confirmé (`terminal-output.ts:5` =
`const MAX_BYTES = 4_000`), mais P10 ne fait **aucune** affirmation sur un plafond de troncature. Mon
grep de P10 sur `truncate|terminal-output|4 000` ne rend que deux touches sans rapport :
`P10:74` cite `TOOL_OUTPUT_MAX_CHARS (ligne 44)` — vérifié exact (`compaction.ts:44`) et sans effet
sur l'estimation — et `P10:385` qui rapporte le test de `util/token.ts` figeant
`Token.estimate("x".repeat(4000)) === 1000`. Le remède C-11 (`outputPath` en metadata) ne touche pas
P10, qui ne lit aucun metadata d'outil. Non-applicable, donc non traité, et non traité à bon droit.

**Sur le point `NEEDS_REVIEW` (`P10:528-533`) : légitime, et c'est la bonne disposition.**
`READ_HEAVY_RAMP_SPAN = 2 × READ_HEAVY_MIN_TOKENS` (`P10:218`) est le seul paramètre libre du
correctif ; tous les autres chiffres du tableau dérivent par arithmétique de constantes de code que
j'ai lues (`overflow.ts:7-12`, `compaction.ts:47-48`, `:54`). Ce n'est pas une échappatoire pour trois
raisons : (i) le paramètre préserve **exactement** les deux extrémités, vérifié ci-dessus contre les
tests existants ; (ii) il rend la fonction continue, ce qui est le but du correctif ; (iii) le point
médian est épinglé par T7.3, donc un mauvais choix de span ne peut pas passer inaperçu — il se voit
dans un test. Un `NEEDS_REVIEW` portant sur un arbitrage de politique dont les bornes sont testées et
dont l'unique point libre est nommé, isolé, et assorti d'une condition de réactivation mesurable
(`P10:535-542`) est une sortie d'ingénieur, pas une fuite. Cela ne justifie pas un
`REVALIDATED-FAIL`, et la révision a fait preuve de rigueur en corrigeant au lieu de dissimuler les
deux erreurs de calcul que le verdict n'avait pas vues.

## Regressions introduced

**R1 — deux tests verts cassent, et la proposition affirme le contraire.** Décrit en N1. La
révision a **corrigé** R6.1 sur le fond (la ligne 32 passe, le helper ne doit pas être touché) tout en
laissant debout un tableau de vérification par assertion dont deux lignes sont fausses. La régression
est réelle et non couverte par le marqueur « 4/4 ».

Le reste de la chaîne de tests tient. Les 10 occurrences de `compaction.test.ts` sont correctement
classifiées et `P10:385` (± `Token.estimate`) reste vert sans modification, ce qui est cohérent avec
`CHARS_PER_TOKEN = 4`. Les assertions de `isReadHeavy` qui ne sont pas au seuil exact (`:36` à
19 000, `:40` sur `bash`, `:48` sur `read_heavy_min_tokens: 50_000`, `:52` sur la bordure de résumé)
survivent toutes : `:36` ram 0 ⇒ false ; `:40` 0 token inspecté ⇒ false ; `:48` start 50 000 ⇒ ram 0
⇒ false ; `:52` arrêt sur le résumé ⇒ 0 ⇒ false. Seules `:32` et `:44` sont à corriger, et la
correction doit être dans le test ou dans la formule — jamais dans le helper `chars`, que la
révision a eu raison de défendre.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

RC1 **RÉSOLU** · RC2 **RÉSOLU** · RC3 **PARTIEL** · RC4 **RÉSOLU**. Deux corrections obligatoires
avant implémentation : **(1)** corriger R6.1 — soit la formule du §4(c) préserve `readHeavy` à
`inspected >= start`, soit les lignes 32 et 44 du test sont mises à jour et le verdict de non-régression
est retiré ; **(2)** rendre T7.4 constructible, en exportant l'accesseur du budget depuis
`compaction.ts` ou en reformulant le test sur l'API réellement accessible, et répercuter ce coût dans
la section Effort. `REVALIDATED-PASS` est exclu : un correctif qui casse deux tests verts n'est pas
« sans régression », et l'affirmation contraire est l'objet même de N1. `REVALIDATED-FAIL` est exclu :
aucune objection d'architecture n'est levée, les deux erreurs chiffrées ajoutées par la révision sont
justes, et les bornes de la rampe sont vérifiées contre du code réel.

### Grille d'effort — vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| (c) arme en rampe | S | `packages/opencode/src/session/overflow.ts` (`:106-112`) | T7.3 — `describe("Overflow read-heavy trigger")`, `inspected: 30_000` ⇒ `early`/`value` `551_760` | **non** — `:70`, `:82`, `:92`, `:94`, `:103`, `:104`, `:113-115` vérifiés inchangés |
| (b) `readHeavyRamp` + `inspectionProfile` | S | `packages/opencode/src/session/overflow.ts` (`:76-77`, `:218-222`) | aucun nouveau ; T7.3 couvre la rampe | **oui** — `src/session/overflow.test.ts:32` et `:44` (voir N1) ; ne pas toucher au helper `:26` |
| (d) budget continu + `Math.round` | S | `packages/opencode/src/session/compaction.ts` (`:199-206`, appelant `:424`) | T7.4 — budget `19 999` / `20 000` à `8_000` | **non** — protégé par l'early return `:201` sur les 8 occurrences `preserve_recent_tokens` ; `read_heavy_trigger` protégé par `overflow.ts:107` |
| accesseur de budget pour T7.4 | XS | `packages/opencode/src/session/compaction.ts` (`:416`) | néant — déblocage de T7.4 | **non** — export interne, aucun appelant impacted |
