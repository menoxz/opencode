# P10 — Revalidation (indépendante) de la proposition révisée une seconde fois

Révalidateur indépendant. Je n'ai rédigé ni la proposition initiale, ni aucun verdict, ni aucune
révision. **Je ne corrige ni la proposition ni le code** (C-36) : ce rapport constate, classe et
rend la main.

Sources lues, dans l'ordre imposé : `proposals/P10-token-estimation.md` (**788 lignes**, version
validée ici), `verdicts/P10-revalidation.md` (revalidation c2, 193 lignes, `REVALIDATED-FAIL`),
`CORRECTIONS.md` (C-36, C-50, C-66, C-107), plus `REVALIDATION-BRIEFS.md` pour le gabarit et sa
règle d'implémentabilité.

## Proposal

`docs/harness-audit/proposals/P10-token-estimation.md`, **788 lignes** (contrôlé : `End of file -
total 788 lines`). Self-assessment `READY` (§9, `:694`), §9.1 (`:699-704`) déclare RC1, RC2, RC3, RC4
**appliqué**, `:708-713` déclare **N1 résolue par le correctif** et **N2 résolu**.

L'agent rapporte `RESIDUES_REMAINING=0`. **Contrôle sur disque (C-66) :** grep
`RESIDUES_REMAINING|Remaining objections|RESIDU` sur `proposals/P10-token-estimation.md` → **0 hit** ;
contrôle positif sur le **même chemin et le même `include`** avec le motif ASCII connu
`proportional` → **23 hits** (103, 104, 116, 122, 149, 150, 218, 249, 251, 258, 285, 346, 361, 501,
516, 517, 588, 604, 618, 627, 628, 644, 724). Le zéro est donc **réel**, pas un moteur de recherche
défaillant. La chaîne littérale `RESIDUES_REMAINING` n'apparaît nulle part : l'agent emploie
`### 9.5 Résidus assumés` (`:775-788`). Aucune régression de forme — la section
`## Remaining objections` du gabarit relève de mon rapport, pas de la proposition.

Corrections auditées :

- **C-36** appliquée — je n'écris rien sous `packages/**`, je ne lance aucun `git`, je n'édite pas la
  proposition. Le « après correctif » de `## Regressions introduced` est donc **calculé**, jamais
  exécuté, et signalé comme tel.
- **C-50** appliquée — existence vérifiée par `read` uniquement ; `glob` n'a servi à rien.
- **C-66** appliquée — tout zéro est adossé à un motif ASCII connu **et positif**.
- **C-107** appliquée — chaque objection de ce rapport porte son statut en tête de ligne.
- **C-62** appliquée — **aucun** test touchant `src/tool/shell.ts` n'a été lancé ; je n'ai donc pas
  rejoué la base `test/shell/shell.test.ts` de la c2 et je m'en prive volontairement comme base
  opposable.

## Revisions applied

| # | Required change (c2) | Statut après réexamen c3 | Preuve |
|---|---|---|---|
| RC1 | Re-scaler la preuve du point (a) | **RÉSOLU** | Inchangé et reconfirmé : `isDense` et ses branches XML sont retirés, ratio 2,8 confiné à §9.3 (`:744-765`) avec trois motifs cumulatifs et condition de réactivation chiffrée. `CHARS_PER_TOKEN = 4` intact (`overflow.ts:11`, `:63`) |
| RC2 | Couvrir la zone médiane de la rampe | **RÉSOLU** | R6.2 (`:504-510`) : `23 000 → 572 088`, `30 000 → 551 760` (+87 120, +18,75 %), `59 999 → 464 642`. **Recalculé depuis `overflow.ts:102` et `:256-258` : les trois tombent juste**, inversion de 2 tokens comprise (tableau de recalcul dans R2). Verrou désormais exécutable par T7.3 |
| RC3 | Corriger R6.1 et couvrir la frontière | **RÉSOLU** *(était `PARTIEL` en c2)* | Les deux pièces qui manquaient sont là. R6.1 (`:449-462`) admet **deux** assertions rouges (`:32`, `:44`) et nomme la vraie cause (`ramp > 0` à `tokens == start`, pas le diviseur) ; la frontière `19 999 / 20 000` est couverte par T7.4 (`:624-629`) **et** `inspected = 1 000` est couvert par la réécriture de `:113` (`:643-646`). E1 respecté : T7.4 passe par l'export du §4(d), pas par `Compaction.select` |
| RC4 | Énumérer la ligne 1851 et clore F1 | **RÉSOLU** | Inchangé et **entièrement purgé de R3** : les 10 occurrences (`:704`) tiennent, et les **deux** renvois de mécanisme sont exacts — `overflow.ts:107` (`input.cfg.compaction?.read_heavy_trigger ??`) et `compaction.ts:306` (`if (configured !== undefined) return configured`), ce dernier étant bien le **retour anticipé** de `preserveRecentBudget` (`compaction.ts:304`) |

Les deux `open` de la c2 restent **`accepted`**, à contenu strictement égal — la c3 n'y a rien
touché, et je ne les requalifie pas (règle 3 du gabarit) :

- **N1 → `accepted`.** Le défaut *nommé* — « R6.1 affirme à tort que `:32` et `:44` survivent » — a
  disparu du texte, remplacé par un tableau ligne à ligne (`:455-462`). Ce qui subsiste est un
  **choix assumé et tracé** : deux tests verts sont réécrits par T7.6 (`:652-664`), au même titre que
  A5.8 (`:440-445`) refuse l'alternative de les réécrire pour préserver `ramp > 0`. Traité quant au
  fond, réserve tracée : c'est la définition exacte de `accepted`.
- **N2 → `accepted`.** Le remède est adopté **et chiffré** : T7.4 (`:624-629`) est constructible, et
  son critère (`:632-635`) déclare qu'il « ne dépend d'aucun `select` ni d'aucun pipeline Effect ».

## Status

| # | Objet | Statut | Section |
|---|---|---|---|
| R1 | `:113` passe au rouge, la proposition affirmait l'inverse | **RÉSOLU** | `## Remaining objections` |
| R2 | T7.3 asserte une valeur inatteignable, test non discriminant | **RÉSOLU** | `## Remaining objections` |
| R3 | Citations `compaction.ts` fausses dans l'arbre | **RÉSOLU** (14/14) | `## Remaining objections` |
| N1 | Réécriture de deux tests verts | **`accepted`** | — |
| N2 | T7.4 non constructible | **`accepted`** | — |
| — | `READ_HEAVY_RAMP_SPAN` (multiplicateur 3× non mesuré) | **`out_of_scope`** (`:717-742`, trois temps + condition de réactivation vérifiable) | — |
| — | Ratio 2,8 appliqué au JSON | **`out_of_scope`** (`:744-765`, trois motifs cumulatifs + condition de réactivation) | — |
| — | Chiffres du §4 = arithmétique dérivée, pas des sorties d'exécution | **`out_of_scope`** (`:785-788` : chaque chiffre reconduit en assertion exécutable par T7.2/T7.3/T7.4) | — |

**Aucun résidu `open`.** Les `out_of_scope` sont justifiés par écrit et portent une condition de
réactivation vérifiable ; je ne les ai pas créés, je les ai constatés tels quels.

## Remaining objections

Les trois résidus de la c2 sont **instruits et soldés**.

### Le recalcul qui fonde tout — `proportional`, puis la borne de la rampe

| étape | source **sur disque**, pas sur la proposition | valeur |
|---|---|---|
| `reserved` | `overflow.ts:30` : `reserved = cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, maxOutput)` | `20 000` |
| `usable` | `overflow.ts:27-43` (`limit.input - reserved`) ; lu dans la proposition `:149` | `968 000` |
| `threshold` | `proportionalCfg = cfg({ threshold: 0.6 })` (`test/session/overflow.test.ts:75`), borné par `overflow.ts:21-25` | `0,6` |
| `proportional` | `overflow.ts:102` : `Math.floor(limit.usable * threshold(input.cfg))` | **`floor(968 000 × 0,6) = 580 800`** |

`proportional` est donc **exact et déjà entier** — l'argument de la c3 est fondé. Contrôle
indépendant : `test/session/overflow.test.ts:69` asserte déjà
`expect(trigger.proportional).toBe(580_800)` sur cette même `proportionalCfg`, et `:70` asserte
`value = 580 800`. Ces deux lignes sont vertes aujourd'hui.

La borne de la rampe est **vérifiée, pas supposée** : `overflow.ts:52-64` ne renvoie aucun compteur
de tours — `inspectionTokens` n'additionne que `part.state.output.length` (`:60`) et divise par
`CHARS_PER_TOKEN = 4` (`:63`). Les seuls seuils du fichier sont `READ_HEAVY_MIN_TOKENS = 20 000`
(`:10`) et `COMPACTION_BUFFER = 20 000` (`:7`). La zone médiane annoncée `:500`
(`20 000 < inspected < 60 000`) donne `ramp = (inspected − 20 000) / 40 000`, saturé à 0 comme à 1.
Les trois points de contrôle de la c3 (`:504` ramp 0,075 ; `:508` ramp 0,999975 ; `:516` ramp 0 à
1 000) sont **tous cohérents avec cette borne**, ce qui la confirme indépendamment du reste.

Application de la formule du §4(c) `:256-258`,
`early = floor(proportional × (0,8 + 0,2 × (1 − ramp)))` :

| `inspected` | `ramp` | `0,8 + 0,2 × (1 − ramp)` | `floor(580 800 × …)` | valeur c3 | valeur actuelle |
|---|---|---|---|---|---|
| 1 000 | 0 (clampé) | 1,0 | **580 800** | `580 800` ✓ | `464 640` |
| 23 000 | 0,075 | 0,985 | **572 088** | `572 088` ✓ | `464 640` |
| 30 000 | 0,25 | 0,95 | **551 760** | `551 760` ✓ | `464 640` |
| 59 999 | 0,999975 | 0,800005 | **464 642** | `464 642` ✓ | `464 640` |

**Les quatre valeurs de la c3 sont exactes**, y compris l'inversion de 2 tokens à `59 999`, qui
vient bien de l'arrondi plancher sur une multiplication flottante
(`580 800 × 0,800005 = 464 642,904`).

### R1 — `:643-646` et `:518-520`

À `inspected = 1 000`, `ramp = 0`, donc `early = floor(proportional × 1) = proportional = 580 800`.
La correction est présente **aux deux emplacements annoncés** :

- `:518-520` : l'autorefutation a disparu. Le texte porte désormais « **La ligne 113 change :
  `464_640` → `580_800`**, et son assertion doit être réécrite (voir T7.5) ; la ligne 115, elle, ne
  voit aucun changement. » C'est l'inversion exacte demandée, et `:115` reste bien inchangée
  (`value = min(proportional, absolute)`).
- `:643-646` : « **Réécriture de la ligne 113.** Elle sort de la liste ci-dessus : à
  `inspected = 1 000` la rampe vaut 0, donc `early = proportional = 580_800` et non `464_640`.
  L'assertion `:113` devient `expect(trigger.early).toBe(580_800)`. C'est le **seul** test vert du
  dossier que le correctif réécrit sans le casser ; aucun autre test de la proposition (T7.1 à T7.6)
  ne touche à `:113`. »

**Et la ligne visée est bien celle qu'il faut :** `test/session/overflow.test.ts:113` vaut
`expect(trigger.early).toBe(464_640)`, dans le test `inspected: 1 000` (`:111`), avec `:114`
`readHeavy = false` et `:115` `value = 580 800`. La correction vise donc l'assertion exacte qui
passe au rouge, et l'exclusion de `:115` est exacte elle aussi.

**Statut : `RÉSOLU`** — le défaut nommé par la c2 (« la proposition affirme que `:113` ne voit aucun
changement ») a disparu du texte, remplacé par la mention exacte du changement et la réécriture de
l'assertion cible.

### R2 — les deux valeurs de `30 000`, et la discrimination du test

À `inspected: 30 000`, `ramp = 0,25` :

- **`early = floor(580 800 × (0,8 + 0,2 × 0,75)) = floor(580 800 × 0,95) = 551 760`** ✓ — donc
  `:609` `expect(trigger.early).toBe(551_760)` est **juste** ;
- **`readHeavy = early !== undefined && ramp >= 1` = `false`** (`:259`) ⇒ `arm = undefined` (`:260`)
  ⇒ **`value = Math.min(proportional, absolute) = 580 800`** (`:114`, `:103`) — donc `:611`
  `expect(trigger.value).toBe(580_800)` est **juste**, et c'est exactement ce qu'annonce le critère
  réécrit `:615-619` : « la zone médiane est vérifiée par `early`, `value` ne vaudrait `551 760` que
  si l'arme y restait active ».

Les deux corrections annoncées sont donc présentes et exactes : `:611` porte `580 800`, `:609`
conserve `early = 551 760`, et le critère `:615-619` explique le désarmement au lieu d'exiger une
combinaison impossible. C'est bien la contradiction nommée par la c2 qui a disparu.

**Discrimination du test (C-20), testée assertion par assertion** — la formule actuelle
(`overflow.ts:108`, `Math.floor(proportional * READ_HEAVY_FRACTION)`) contre la formule corrigée
(`:256-258`). Un test qui passe dans les deux mondes ne prouve rien :

| assertion | formule actuelle (mesurée) | formule corrigée | discrimine ? |
|---|---|---|---|
| `:608` `cacheAware = false` (`cacheRead: 0`) | `false` | `false` | non |
| `:609` `early = 551 760` | `464 640` | `551 760` | **oui** |
| `:610` `readHeavy = false` | `false` (`20 000 ≤ 30 000`) | `false` (`0,25 < 1`) | non |
| `:611` `value = 580 800` | `580 800` | `580 800` | non |

**Une assertion sur quatre discrimine, `:609`** — mais c'est celle qui porte le point médian, et sa
valeur est exacte. Le test est donc **discriminant** : il échoue sur le code actuel (`:609` y vaut
`464 640` ≠ `551 760`) et ne passe que sur la formule corrigée. Les trois assertions stables ne sont
pas du bruit : `:611` verrouille le désarmement, `:610` verrouille le prédicat `ramp >= 1` de R6.1
bis, `:608` verrouille la branche sans cache. **C-20 est satisfait.**

**Statut : `RÉSOLU`** — l'inatteignabilité nommée par la c2 venait de ce que `:609` et `:611`
exigeaient contradictoirement `readHeavy = false` **et** `value = 551 760` ; la révision a séparé
les deux et corrigé `value` en `580 800`.

### R3 — les 14 ancres annoncées, vérifiées une à une sur disque

| ancrage c3 | ligne sur disque | contenu réel | verdict |
|---|---|---|---|
| `:21 → :22` | `compaction.ts:22` | `import { isOverflow as overflow, isReadHeavy, usable } from "./overflow"` | ✅ |
| `:46 → :47` | `compaction.ts:47` | `const DEFAULT_TAIL_TURNS = 2` | ✅ |
| `:47 → :48` | `compaction.ts:48` | `const MIN_PRESERVE_RECENT_TOKENS = 2_000` | ✅ |
| `:48 → :49` | `compaction.ts:49` | `const MAX_PRESERVE_RECENT_TOKENS = 8_000` | ✅ |
| `:54 → :55` | `compaction.ts:55` | `const MAX_READ_HEAVY_PRESERVE_RECENT_TOKENS = 24_000` | ✅ |
| `:199-206 → :304-310` | `compaction.ts:304-310` | `function preserveRecentBudget(...)` … `return Math.min(max, Math.max(MIN_…_TOKENS, Math.floor(usable(input) * 0.25)))` | ✅ |
| `:201 → :306` | `compaction.ts:306` | `if (configured !== undefined) return configured` — **le retour anticipé** | ✅ |
| `:405 → :510` | `compaction.ts:510` | `const msgs = yield* MessageV2.toModelMessagesEffect(input.messages, input.model, {` | ✅ |
| `:413 → :518` | `compaction.ts:518` | `return Token.estimate(JSON.stringify(msgs))` | ✅ |
| `:416 → :521` | `compaction.ts:521` | `const select = Effect.fn("SessionCompaction.select")(function* (input: {` | ✅ |
| `:422 → :527` | `compaction.ts:527` | `const limit = input.cfg.compaction?.tail_turns ?? DEFAULT_TAIL_TURNS` | ✅ |
| `:424 → :529` | `compaction.ts:529` | `const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model, readHeavy: isReadHeavy(input.messages, input.cfg) })` | ✅ |
| `:498 → :603` | `compaction.ts:603` | `const estimate = Token.estimate(part.state.output)` | ✅ |
| RC4 (`:702`) | `overflow.ts:107` | `input.cfg.compaction?.read_heavy_trigger ??` | ✅ |

**14 ancres sur 14 exactes.** Je n'ai pas « déclaré toutes correctes » : les 14 sont lues et
confrontées au contenu réel de la ligne. Le mécanisme de protection cité pour RC4 est bien le retour
anticipé de `preserveRecentBudget`, et `overflow.ts:107` est bien la ligne qui protège les deux
premières occurrences de `compaction.test.ts`.

**Statut : `RÉSOLU`** — les treize citations `compaction.ts` et le renvoi `overflow.ts:107` sont
réalignées et exactes.

### N1 et N2 — inchangés, traces

- **`accepted`** — N1. Deux tests verts réécrits par T7.6 (`:652-664`), choix documenté et tracé
  (§ R6.1 `:455-462`, A5.8 `:440-445`). Le défaut nommé par N1 a disparu du texte. Réserve : le
  correctif fait passer deux tests verts au rouge avant réécriture — c'est **déclaré**, ce n'est pas
  une perte sèche.
- **`accepted`** — N2. T7.4 (`:624-629`) passe par l'export du §4(d) et son critère (`:632-635`)
  déclare l'absence de dépendance à `select`. Réserve : l'export de `preserveRecentBudget`
  (`:711-713`) n'existe pas dans l'arbre ; il fait partie du correctif, donc rien à reprocher, mais
  il faut bien le dire.

### Ce que je ne requalifie pas

Les quatre `out_of_scope` de la c3 sont **constatés, pas créés** : `READ_HEAVY_RAMP_SPAN`
(`:717-742`), ratio 2,8 (`:744-765`), chiffres du §4 dérivés (`:785-788`), et l'item
`HAS_DENSITY`/`TOOL_OUTPUT_MAX_CHARS` du même §9.5. Tous portent une justification écrite et, pour
les deux premiers, une condition de réactivation vérifiable. Je les laisse tels quels : les
requalifier pour franchir la porte serait précisément l'interdit de C-22/C-42.

## Regressions introduced

**Base fournie, mesurée sur cette session, exit codes réels.** Aucun test touchant
`src/tool/shell.ts` n'a été lancé (C-62) ; la ligne « base verte opposable » de la c2 n'est donc pas
rejouée, et je ne la présente pas comme rejouée.

| Base | Commande | Exit code | Résultat |
|---|---|---|---|
| `test/session/overflow.test.ts` | `bun test test/session/overflow.test.ts` | **`SINGLE_EXIT=0`** | **8 pass / 0 fail**, 21 `expect()`, `Ran 8 tests across 1 file`, 3,20 s |
| paire de régression P10 | `bun test src/session/overflow.test.ts test/session/overflow.test.ts` | **`COMBINED_EXIT=0`** | **14 pass / 0 fail**, 27 `expect()`, `Ran 14 tests across 2 files`, 1,85 s |
| Typage | `bun typecheck` | **`TYPECHECK_EXIT=0`** | `ERR_COUNT=0`, journal 17 octets, queue `$ tsgo --noEmit` |

Le compte **8 pass / 0 fail** du fichier seul est le chiffre demandé, et il **concorde** avec la
décomposition de la c2 (6 + 2 = 8). La paire **14 pass / 0 fail** reproduit exactement la base c2.
Aucune des deux erreurs de typecheck transitoires signalées par la c2 dans `src/tool/shell.ts` n'a
été reproduite : `ERR_COUNT=0`.

**Introduit par le correctif — calculé, pas exécuté.** Le correctif n'existe pas dans l'arbre (je
n'écris rien sous `packages/**`), la colonne « après » est une **prédiction**, signalée comme telle.

| Fichier de test | Avant (mesuré) | Après (calculé) | Détail |
|---|---|---|---|
| `src/session/overflow.test.ts` | **6 pass / 0 fail** | **6 pass / 0 fail** | `:32` et `:44` passent au rouge sous `ramp >= 1`, puis sont **réécrits** par T7.6 (`:652-664`) → repassent verts. `:36`, `:40`, `:48`, `:52` restent verts |
| `test/session/overflow.test.ts` | **8 pass / 0 fail** | **8 pass / 0 fail**, +2 tests ajoutés | `:113` passe au rouge puis est **réécrit** par `:643-646` en `expect(trigger.early).toBe(580_800)` → repasse vert. Le test **ajouté** par T7.3 passe (`:609` vaut bien `551 760`, `:611` bien `580 800`) |
| **Total** | **14 pass / 0 fail**, `COMBINED_EXIT=0` | **14 pass / 0 fail** + 2 ajoutés, exit 0 (prédit) | **aucun test vert n'est laissé cassé** |

**Déclaration exigée par le gabarit : oui, explicitement.** Le correctif fait transiter **trois**
tests verts par le rouge — `:32` et `:44` (N1 `accepted`, réécrits par T7.6) et `:113` (R1, réécrit
par `:643-646`) — mais **les trois sont réécrits par la proposition elle-même**, avec la ligne et la
valeur exactes. Les deux tests ajoutés (T7.3, T7.4) passent : `:609` et `:611` portent des valeurs
que j'ai recalculées, et le critère `:632-635` annonce que T7.4 échoue sur le code actuel. Il ne
reste donc **aucun test vert cassé en silence**, et aucun test déjà rouge qui casse davantage.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Les trois résidus de la c2 sont **`RÉSOLU`**, chacun sur preuve, et j'ai refait les calculs plutôt
que de reprendre ceux de l'agent :

- **R1** — `proportional = floor(968 000 × 0,6) = 580 800`, donc à `inspected = 1 000`
  (`ramp = 0`) l'arme vaut **`580 800`** et non `464 640`. `:518-520` porte désormais l'inversion
  exacte et `:643-646` réécrit l'assertion `:113` en `expect(trigger.early).toBe(580_800)`, qui est
  bien l'assertion fautive — `:115` est, elle, légitimement inchangée.
- **R2** — à `inspected: 30 000`, `ramp = 0,25`, donc **`early = floor(580 800 × 0,95) = 551 760`**
  ✓ et **`readHeavy = false` ⇒ `value = 580 800`**. `:611` porte `580 800`, `:609` conserve
  `551 760`, le critère `:615-619` explique le désarmement. Le test est **discriminant** : `:609`
  vaut `464 640` sur le code actuel et `551 760` sur la formule corrigée (C-20 satisfait).
- **R3** — **14 ancres sur 14 exactes**, toutes lues sur disque, plus le renvoi `overflow.ts:107`.

**RC3** passe de `PARTIEL` à **`RÉSOLU`** (R6.1 admet les deux assertions rouges et nomme la bonne
cause ; T7.4 verrouille la frontière `19 999 / 20 000` ; la réécriture de `:113` ferme le second
trou). RC1, RC2 et RC4 tiennent toujours, RC4 désormais purgé de R3.

**Aucun résidu `open`.** Il ne reste que des `accepted` (N1, N2 — réserve tracée) et des
`out_of_scope` (span 3×, ratio 2,8, chiffres dérivés — trois d'entre eux portent une condition de
réactivation vérifiable). Je n'ai requalifié aucun `open` pour franchir la porte : il n'y en avait
plus à requalifier.

C'est `PASS_WITH_CHANGES` plutôt que `PASS` : la clause « aucune nouvelle objection » étant
abrogée par la règle d'implémentabilité du gabarit, `PASS` exigerait que **toutes** les objections,
y compris les `accepted` et les `out_of_scope`, eussent été liquidées, ce qui n'est pas le cas et ne
doit pas l'être — une réserve assumée et tracée reste une réserve.

### Handed back to

`docs/harness-audit/proposals/P10-token-estimation.md` : **rien à corriger**. La proposition est
implémentable en l'état. Pour la vague d'implémentation, l'ordre dicté par le tableau ci-dessous
suffit ; deux réserves `accepted` restent à garder visibles pendant le portage :

1. **N1** — ne pas « réparer » `:32` et `:44` en ajustant le helper `chars` ou `CHARS_PER_TOKEN` :
   la réécriture par T7.6 est le remède retenu, et `CHARS_PER_TOKEN = 4` ne bouge pas.
2. **N2** — l'export de `preserveRecentBudget` (`compaction.ts:304`) fait partie du correctif ; sans
   lui T7.4 n'est pas constructible.

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| §4(a) — ratios d'estimation (`CHARS_PER_TOKEN`, `HAS_DENSITY`) | `S` | `packages/opencode/src/session/overflow.ts` | aucun | aucun |
| §4(b) — `threshold()` / `usable()` | `XS` | `packages/opencode/src/session/overflow.ts` | aucun | aucun |
| §4(c) — `READ_HEAVY_FRACTION`, `readHeavyRamp`, `ramp >= 1` | `S` | `packages/opencode/src/session/overflow.ts` | T7.1, T7.2 | `test/session/overflow.test.ts:113` — **rouge attendu**, réécrit en `:643-646` |
| §4(d) — export de `preserveRecentBudget` | `XS` | `packages/opencode/src/session/compaction.ts` | aucun | aucun |
| R6.1 — `isReadHeavy` porte la rampe | `S` | `packages/opencode/src/session/overflow.ts` | T7.6 | `src/session/overflow.test.ts:32` et `:44` — rouges attendus, réécrits par T7.6 |
| R6.2 / T7.3 — `early` au point médian, `value` désarmée | `S` | `test/session/overflow.test.ts` | T7.3 | aucun (test ajouté) |
| T7.4 — frontière `19 999 / 20 000` | `S` | `test/session/overflow.test.ts` | T7.4 | aucun (test ajouté) |
| T7.5 — non-régression des seuils existants | `XS` | `test/session/overflow.test.ts` | T7.5 | aucun |
| F1 — occurrences protégées de `compaction.test.ts` | `S` | `test/session/compaction.test.ts` | aucun | aucun — couvert par `overflow.ts:107` et `compaction.ts:306` |