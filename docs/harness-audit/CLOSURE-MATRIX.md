# Rapport de clôture — matrice problème → proposition → verdict → implémentation

**Statut : document vivant, NON GELÉ.** Une ligne passe à `gelée` quand son statut ne peut
plus changer (verdict définitif + vague 4 tranchée). Le gel aura lieu après la dernière
revalidation. Toute valeur ci-dessous est un **état observé sur disque**, pas un rapport
d'agent : un statut n'est retenu que s'il est écrit dans le fichier correspondant.

**Règle de lecture** : la présence d'un fichier ne prouve pas sa conformité (**C-31**).
Une ligne n'est `implémentable` que si sa revalidation le dit et qu'aucun résidu n'est `open`
(règle d'implémentabilité de `REVALIDATION-BRIEFS.md`, **C-32**).

## Conventions

| Colonne | Signification |
| --- | --- |
| **RC** | revision cycles exécutés (plafond **3**, politique de convergence **C-37**) |
| **RV** | revalidation(s) sur disque |
| **Résidu `open`** | bloque l'implémentation — règle 3 de la règle d'implémentabilité |
| **Impl.** | état de la vague 4 |

## Matrice — lot 1 (P01 → P05)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P01** | `PASS_WITH_CHANGES` | 1 | — | **2** (`C-22`, `C-23`) | ⛔ | **C-22** : §6 justifie la menace par `instruction.ts:208-211`, qui **écarte** les URL distantes. La menace réelle — un `AGENTS.md` **committé** trouvé par remontée de nom (`:305`) et rendu (`:322-323`) — n'est **jamais nommée**. **C-23** : T2 lit un autre fichier, donc `duplicateOf` (`:458-459`) ne s'active pas ; la branche `provenUnchanged` (`:408`) n'est testée par **rien** |
| **P02** | `PASS_WITH_CHANGES` | 2 | `PASS_WITH_CHANGES` (c1) | **0 déclaré** (RC1→RC5 clos) | 🟡 **candidat n°1** | R1 `{ ok: false }` sans `digest` requis (`repetition.ts:48-52`) — **corrigé** (`{ ok: false, digest: "" }`) ; R2 `summary` est au **premier** niveau (`goal-contract.ts:435`/`:573`), soit **4** instances et non 3 — **corrigé**. **Revalidation cycle 2 en vol** : c'est le seul candidat |
| **P03** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | Réécriture complète livrée (fichier corrompu, **C-21**). Revalidation non encore demandée |
| **P04** | `FAIL` (contenu = `PASS_WITH_CHANGES`, divergence `P04-F3`) | 2 | — | à établir | ⛔ | Effort réel **M**, pas S ; borne désormais **en tentatives** (`RETRY_MAX_ATTEMPTS = 10`) → `attempt 10/10` vrai par construction ; `2 147 483 647 ms` = **24,855 j** dès la **22ᵉ** tentative. **Revalidation en vol** |
| **P05** | `PASS_WITH_CHANGES` | 1 | — | à établir | ⛔ | **C-02** : gain mesuré à **−35 caractères**, donc **négatif**. Un gain net négatif ne peut pas servir d'argument d'impact → l'argumentation doit disparaître. Revalidation non demandée |

## Matrice — lot 2 (P06 → P10)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P06** | `PASS_WITH_CHANGES` | 2 | `PASS_WITH_CHANGES` (c1) | à établir | ⛔ | **C-28** : le §8 du cycle 1 affirmait `effort M` et « deux fichiers » ; **réfuté** — `goal-contract.ts:576-577` + `compaction.ts:5`/`:372-374`/`:377`/`processCompaction:525` prouvent effort **S**, **1 fichier**, **0 appelant**. **C-38** : `P06-F1` **clos** (prémisse fausse). Cycle 2 : test `rg` abandonné (défaut **C-20**) → remplacé par **T4** ; divergence **T3 = 1 200** contre 1 100 recommandé (**C-49**, longueurs comptées à la main) |
| **P07** | `PASS_WITH_CHANGES` | 2 | **`PASS_WITH_CHANGES` (c2)** — R1/R2/R3 **traités** | **2** (`N1`, `N2`) → **0 en c4** *(corrigés dans le texte ; clos par la revalidation indépendante c4)* | ✅ **c4 : `PASS_WITH_CHANGES`, 0 résidu `open`** (revalidation `516e1b70`) | **c3 (384 l., commit `c11a1f95`)** : **N1** — `P07:192-195` remplace la clause d'unicité (« le seul endroit ») par le décompte exact, **six lectures sur quatre sites** `:553`, `:936-937`, `:942-943`, `:984` ; **N2** — bloc `### T3` **supprimé** (20 lignes), jonction `### T2` `:328` → `### T4` `:334`, la condition de suppression étant remplie puisque `P07:241` porte « §4(b) *écarté* ». **Vérifié sur disque par moi, pas rapporté** : lectures de `:188-199`, `:324-337`, `:238-245` ; renvoi résiduel à `P07:79` corrigé dans la même passe. Un `open` n'est clos que par la revalidation | : R1 `accepted` (`P07:245-248` garde conservée et motivée, `:250` seul `Schema.Union` du dossier) · R2 `accepted` (`:342-344` pose les trois conditions qui neutralisent le `??` de `task.ts:694`) · R3 `accepted` (`:255` écarte §4(c), contrôle **positif** : `registry.ts:245` seul `ctx.directory` en `src/tool`, 0 lecture de `session.directory`). Restent **N1** (`P07:192` « seul endroit » contredit par **6** lectures de `input.directory`) et **N2** (`:333-351` conservé alors que `:240` remplit sa propre condition de suppression). **C-36 tenu** : le revalidateur a refusé de toucher la proposition ; `budget_exceeded` mais livrable sur disque | **C-25** : `task.ts:236` **jamais lue** (angle mort), `session.ts:942-943` **fausse** (`input.directory` est à `:936-937`). **C-20** : T3 passait avant/après. **28 citations exactes sur 30**. Revalidation en vol |
| **P08** | `PASS_WITH_CHANGES` (**c4 : R1, R2, R3 résolus ; c5 : Option A, volumes re-mesurés**) | 1 | — | à établir | ⛔ | **A-1 appliqué** : opt-in + census read-only, effort **L abandonné**, aucune purge par défaut. Preuve à contrôler : census câblé hors `maintain()`/`schedule()`, donc jamais sur `checkpoint()` qui émet `PRAGMA wal_checkpoint(TRUNCATE)` (`maintenance.ts:44-48`). **C-50** : `maintenance.test.ts` est en `src/`, pas `test/`. **c4** : R1 SQL `pragma_freelist_count` exit 0, R2 recalculé 21,2 %, R3 env vide explicite ; **c5** : empreinte re-mesurée `4 093 726 224` o (`db`+`wal`+`shm`, `EXIT=0`), 1 000 sessions = `1 988 649 418` o / 383 487 parts, « 485 étapes / 6,1 Mo » supprimé, 530 lignes préservées. Revalidation finale en cours |
| **P09** | `PASS_WITH_CHANGES` | 0 | — | **1 ouvert** (`R3`) | ⛔ | **A-4 SATISFAIT PAR MESURE (**C-43**)** : `shell.ts:604` écrit **exactement** les octets attendus (35 129 et 140 129, **écart 0/0**, `firstDiffOffset=-1`). L'hypothèse « `terminal-output.ts:233` écrit un `raw` » est **INFIRMÉE** (35 129 o sur disque pour 1 148 o retournés, `outputPath=null`). **C-39** : `P09-OWNERSHIP-INVARIANT` **clos** (`shell.ts`, double source indépendante) ; contrepartie opposable : `collect()` (`shell.ts:390-426`) sur **chaque** tentative. **C-50** : nouvelle preuve — `truncate.ts:29-31` conserve `{{`/`}}` en **6/6** sondes. Reste **R3** (trois outils MCP d'environnement sans garantie de disponibilité) |
| **P10** | `PASS_WITH_CHANGES` | 2 | **`FAIL` (c2)** | **3** (`R1`, `R2`, `R3`) → **0 en c4** *(corrigés dans le texte ; clos par la revalidation indépendante c4)* | ✅ **c4 : `PASS_WITH_CHANGES`, 0 résidu `open`** (revalidation `f0faf75f`) | **c3 (788 l., commit `c11a1f95`)** : **R1** — `:518-520` retire l'autorefutation « la ligne 113 ne voit aucun changement » et établit que `proportional` est déjà entier (`overflow.ts:102`), donc `early = 580_800` à `inspected = 1 000` et non `464 640` ; `:643-646` spécifie la réécriture de `:113`. **R2** — `:611` passe `value` à `580_800` et `:609` verrouille `early = 551_760` seul, `:615-619` réécrit le critère : l'arme étant désarmée en zone médiane, l'ancien couple (`false` **et** `551_760`) était inatteignable. **R3** — 20 sites `compaction.ts` réalignés (`:22`, `:304`, `:306`, `:518`, `:521`, `:529`…), scan résiduel `:65` seul. **Vérifié sur disque par moi, pas rapporté**. `INFERE`=6 préservés, `Schema.Union`=0 ajouté. Statut clos = revalidation à venir | : le gabarit rend `PASS_WITH_CHANGES` implémentable, le revalidateur l'a donc **refusé**. **N1 levé** : l'affirmation fausse est **retirée**, `P10:457` déclare `:32`/`:44` rouges « causée par le correctif », réécrits par T7.6 ; **mesuré** `overflow.test.ts` **14/0 avant → 13 pass / 2 fail après** (`:113` casse en silence 464 640 → 580 800, T7.3 inatteignable). **N2 levé** : T7.4 lit `preserveRecentBudget` (`:304`) ; `compaction.ts` exporte **17** symbols énumérés, `preserveRecentBudget` **absent**. RC1/RC2/RC4 `RÉSOLU`, RC3 `PARTIEL`. Résidus **R1** `open` (haute) · **R2** `open` (haute) · **R3** `open` (moyenne) · R4 `out_of_scope` · R5 `refused` — **5 statuts explicites en tête de ligne** (**C-107**) | **N1** : `overflow.test.ts:32` et `:44` sont **verts aujourd'hui** et cassent — `readHeavy` est le prédicat `ramp > 0`, **faux** à `inspected = 20 000` (ramp = 0). **N2** : T7.4 lit via `Compaction.select`, **non exporté** (`compaction.ts:416`) → ne compile pas. **C-36** : le revalidateur a découvert N1/N2 **absents du verdict** et a refusé de les corriger pour préserver l'indépendance. `551 760` confirmé par recalcul indépendant `floor(580 800 × 0,95)` |

## Matrice — lot 3 (P11 → P15)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P11** | **`FAIL`** | 2 | **`PASS_WITH_CHANGES` (c2)** — **4/4 RC traités** | **2** (`O1`, `O2`) | ⛔ | **c2 (233 l.)** : le `FAIL` précédent est **levé**. RC#1 **par fermeture** (R3 `proposal:306-343` branche `proofIsSubstantive` sur `finding.evidence`, l'affirmation fausse du §6.4 a disparu) · RC#2 (`:448` impose l'extension de `goal-evidence.test.ts`, 3 tests nommés, critère `3 pass → 5 pass`, suppression du `test` `:35-38`) · RC#3 (`:453-467` remplace l'`INFERE` par **deux bases remesurées** : 5 tests/15 expect et 3 tests/7 expect, 0 fail) · RC#4 (R6 `:360-366` texte de remplacement littéral). **A-2 plafond `M` RESPECTÉ** (§5.1 `:370-375` rejette le schéma dédié **sur le fond** en citant `:54-56`, revérifié mot pour mot ; lot `L` `refused`). Restent **O1** (seuil « ≤ 6 » contre ses **9** sites énumérés) et **O2** (divergence `closed` non tranchée, son statut `residual` hors vocabulaire → `open` par **C-107**) | **C-34** : le revalidateur **refuse l'arbitrage A-2 sur le fond** — `dod = Schema.Array(Schema.String)` (`goal-contract.ts:54-56`), `normalizeGoalList` ne normalise que des chaînes (`:208`, `:216`), `nextGoalState` ne valide rien (`:199-222`) ; typer les items exige une autorité d'écriture **hors de `edit_objective`**. **Décision opérateur requise.** Le fond est juste : R1+R2 ferment bien l'évasion `residual` |
| **P12** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-30** → **C-48** : `redirectTargets` sans prédicat, `>` devenait un **chemin bidon**. Reprise : prédicat purement textuel `REDIRECT_OPERATORS` + `isRedirectOperator`, et **requalification de `shell.ts:413` en filtre d'espace de travail** — ma formulation « neutralisé par accident » lui prêtait une intention qu'il n'a pas. Cas 2 **retiré** après glob + grep exhaustif (107 occurrences, 2 types AST, 0 `file_redirect`). `collect()` **une fois** en `shell.ts:652`, **avant** `ask`/`run` → couverture par antériorité |
| **P13** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-24** : « la suite passe » **inatteignable** — `test/tool/shell.test.ts` déjà rouge (26-28 échecs `RepeatedCallError`). **C-41** : le volet B s'appuyait sur des chiffres **périmés** (`68/27/3`) et sur un `glob` **faux**. **C-47** : `test/shell/shell.test.ts` = **12/0 vert et stable** → c'est la bonne base. **C-13** : l'agent soutient que `always` **ne fait pas** monter la sévérité (`evaluate` apparie par nom de permission) |
| **P14** | `PASS_WITH_CHANGES` | 1 | `PASS_WITH_CHANGES` | **0** | ✅ **mergé** | **Implémenté et mesuré par moi, pas rapporté** : `shell.ts` — `previewWindow` exporté `:289`, câblé `:538`, `previewTruncated` `:703` ; `test/shell/preview-window.test.ts` créé (**7** tests). **`TEST_EXIT=0`, 19 pass / 0 fail** (7 + `shell.test.ts` 12), `FAIL_LINES=0`, **`TYPECHECK_EXIT=0`**, `markers=0`. Rouge réel constaté avant : `Export named 'preview' not found`. Distinction prouvée sur 4×45 000 : l'ancien `body !== (last \|\| output)` vaut `false`, le nouveau `truncated` vaut `true`, `omitted=150 000` ; total exact `seen=178 200` → `omitted=148 200`, basculement à `seen=30001`. **Prémisse du rédacteur réfutée** : `raw += chunk` sur un accumulateur `undefined` ; `markers === 1` sur 8 découpages, jamais 2 (**C-76**) | `shell.ts:512` `last = preview(last + chunk)` tronque **en flux** → `body !== (last \|\| output)` vaut `last !== last` → **`false`**. La détection ne se déclenche que dans le cas trivial et échoue là où elle servirait. « rend `truncated` honnête » est **faux en l'état**. Révision en vol |
| **P15** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-18** : patch non compilable (TS18047). Révision : `const b: EffectBridge.Shape = yield* EffectBridge.make()`, suppression de `:280`/`:313` → l'union `Shape \| null` n'est plus **construite**. Branche `catchCause` **supprimée** (filet sans consommateur ; hot reload éteint **muet**). Reste : compilation par raisonnement (**C-46** rend `bun typecheck` disponible), offsets de hunk indicatifs |

## Matrice — lot 4 (P16 → P20)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P16** | `PASS_WITH_CHANGES` (sévérité arbitrée **`low`**) | 2 | — | à établir | ⛔ | **C-26** / **C-51** : **deux** régressions, la seconde trouvée par le rédacteur — `terminal-output.test.ts:160` (`references` ne vient que de `Truncate.savedOutputPath`, `terminal-output.ts:145` → `referenceText` (`:225`) devient `""`). Remède : filtre de préfixe `TRUNCATION_DIR` dans `savedOutputPath` — **point faible à trancher** : un préfixe est-il ambigu sous Windows ? **C-50** : baseline déclarée absente par `glob`, **seconde occurrence** |
| **P17** | `FAIL` | 1 | — | à établir | ⛔ | Collision d'**unités octets/caractères** (`MAX_BYTES = 50 × 1024` en octets vs `lean-output-policy` en caractères) et **gain-token incohérent** avec la liste blanche. `registry.ts:256` substitue `out.content` quand `truncated` (**C-29**) — jamais « no-op ». **23 citations, 23 exactes**. c4 = **FAIL** : `expectCut` rend `ALL=false` aux 4 sites, donc le `0 fail` prescrit est inatteignable — **P17 non implémentable** ; 7 `open`, 2 `blocking` ; F-02 confirmé (`maxBytes` **présent** à `processor.ts:591`, garde `:587` sans `isLeanAgent`) ; verdict committé `3e5275a3` |
| **P18** | `PASS_WITH_CHANGES` | 2 | `PASS_WITH_CHANGES` | **3 non statutés → `open`** | ⛔ | Branche **`Busy` sans aucun test** — un refactor cassant `tagOf` laisserait les 3 tests verts **en restaurant l'objection de la vague 2**. Compteur `starts.count` **conditionnel** (`shell-launch-retry.test.ts:62`). `EBUSY_ANY=3` non audité alors que `launch-retry.ts:8` contient bien `EBUSY` (**C-42**). Cycle 2 **interrompu** par `budget_exceeded` |
| **P19** | `PASS_WITH_CHANGES` | 1 | — | à établir | ⛔ | Diagnostic confirmé (`prompt.ts:1872` seul chemin accordant `"execute"` non vérifié → `continuation.ts:77-78` continuation inconditionnelle). Deux `KO` bloquants. **Partie A non livrée** ; O1 (`0,628`) supprimé, O2 (« aucun risque ») retiré → **aucun gain annoncé**, la consigne ramenant le bilan à **zéro** (0,16 %). **`prompt.ts:1872` — l'objet même du finding — est déclaré hors périmètre par mandat** : à trancher. **22/22 citations exactes** |
| **P20** | **`FAIL`** (B1 seul livrable ; A1/A2 rejetés) | 2 | **`FAIL`** | **1 (`R2`)** | ⛔ | **Un seul** Required change intact : seconde moitié de **RC6** — le test qui mesure le vrai `packages/opencode/AGENTS.md` au lieu d'un `AGENTS.md` synthétique. Seule preuve existante : un `rg` manuel, **interdit en vague 4**. Remède **S** : `test/agents-md.test.ts` (nouveau), motif prouvé par `test/daemon/console-visibility.test.ts:17,51,60`. **10 des 11 RC résolus, 17 citations exactes, ligne 14 préservée**. `R3` = `accepted` mais **escalade opérateur** requise (politique de distribution du fork) |

## Décompte observé

| Mesure | Valeur | Preuve |
| --- | --- | --- |
| Propositions | **20 / 20** | `PROPOSALS=20`, `MISSING_PROPOSAL=` (vide) |
| Verdicts de base | **20 / 20** | `VERDICTS_BASE=20` |
| Revalidations sur disque | **20 / 20** | une revalidation par proposition, aucune sans `## Final verdict`. Extraites par lecture de fichier, **jamais** des rapports d'agents (C-67). Longueurs 161 à 451 lignes |
| Statuts de revalidation | **0** `PASS` · **11** `PASS_WITH_CHANGES` · **9** `FAIL` | **mesurés sur les 20 fichiers**, `NOHEADING=0`. Les deux propositions qui m avaient été rapportées avec un statut favorable (`P11`, `P12`) sont en réalité `FAIL` (C-67) |
| **Implémentables** | **6 / 20** — P02, P05, P06, P14, P15, P16 | attesté sur disque en prose : `P02:108` « Zéro résidu `open` » · `P05:107` « Aucun résidu `open` : le Lot 1 est implémentable » · `P06:144` « Aucun n'est `open` » · `P14:218` « **Aucun `open`.** → **P14 est implémentable.** » · `P15:194` · `P16:204`. **P14 implémenté en cours** (agent sur `shell.ts`). **Non implémentables malgré `PASS_WITH_CHANGES`** : `P10` (N1 `haute` + N2 `open`, `:120-121`, le correctif casse 2 tests verts) et `P18` (`COR-R18-3`, `COR-R18-4` `open`) — **C-107**. Avec 3 `open` lus sur disque : `P07:303`, `P09:6`, `P13:172` |
| Vague 4 | **démarrée** — 4 fichiers disjoints, **les 4 éditions visibles** | `repetition.ts` (P02, `DECORATIVE:82`,`88`), `compaction.ts` (P06), `plugin/index.ts` (P15), `terminal-output.ts` (P16). **Typecheck et tests non encore exécutables** : C-60/C-62 interdisent toute mesure sur un fichier dont un agent est propriétaire |
| **Au plafond C-37** (3 cycles) | **4** — P04, P07, P12, P13 | `NOT-IMPLEMENTABLE` par politique, finding et correctif conservés au rapport |
| Vague 4 | **démarrée** — 4 fichiers disjoints | `repetition.ts`, `compaction.ts`, `plugin/index.ts`, `truncate.ts` + `terminal-output.ts` |
| **Implémentations mergées** | **6 / 6 mesurées** — P02, P05, P06, P14, P15, P16 | **mesurées par moi, pas rapportées** : `P02` 22 pass / 0 fail · `P05` 10 pass / 0 fail · `P16` 39 pass / 0 fail · `P06` 6 pass / 0 fail, tous `EXIT=0`. P15 : `TYPECHECK` 0→0 + contrôles `TS18047`/`TS2322` + `test/plugin` 124/0. **P14** : `TEST_EXIT=0`, **19 pass / 0 fail**, `FAIL_LINES=0`, **`TYPECHECK_EXIT=0`**, `markers=0`, mesuré **derrière une porte de non-écriture** (4 échantillons / 160 s, `STABLE_ALL=True`) — **C-62** respectée, la mesure n'a jamais tourné sur un fichier en cours d'édition |
| Dépôt commité | ✅ **HEAD** = `f3181db72` + docs d'audit | **72 artefacts** dans `docs/harness-audit` (20 propositions, 40 verdicts, 12 registres), `TRACKED_AUDIT=72 ON_DISK_AUDIT=72`. **Aucun push.** Commits par plumbing `commit-tree` + `update-ref`, prouvés par `TREE != HEAD^{tree}` puis delta de comptage (**C-99**, **C-108**) ; `git commit` est inutilisable sur cette machine (**C-79**, **C-89**) |
| Typecheck (avant vague 4) | ✅ exit **0** | `TYPECHECK_EXIT=0`, 16 s, bun 1.4.2 (**C-46**) |
| Base de non-régression | `test/shell/shell.test.ts` **12 / 0** | verte et stable ; remplace `test/tool/shell.test.ts`, **instable** (**C-44**) |

### Deux artefacts à surveiller dans le worktree

- `packages/opencode/watchdog-run.log` — **non suivi**, produit par une exécution de test. Ne doit
  pas être commité ; à ignorer ou à supprimer après la vague 4.
- `packages/opencode/test/session/llm.test.ts` — **modifié, 1 953 / 1 871 lignes**, alors qu'aucun
  agent de la vague 4 n'avait cette cible. Ce n'est **pas** une dégât d'agent : c'est la
  modification préexistante consignée par `P09-WORKTREE-PREEXISTING`, non produite par cette
  session et volontairement non annulée. **À ne pas commiter sans décision explicite.**

## Arbitrages opérateur

| # | Sujet | État |
| --- | --- | --- |
| A-1 | P08 — opt-in + census seul | ✅ tranché, appliqué ; `P08-R2B` reste `residual` **assumé** |
| A-2 | P11 — typage des DoD d'effort | ✅ **tranché : plafond `M`**, pas de schéma dédié — **vérifié respecté** par la revalidation c2 (`P11-revalidation.md` §5.1 `:370-375` rejette le schéma dédié **sur le fond**, `goal-contract.ts:54-56` revérifié mot pour mot ; lot `L` `refused`). **C-34 n'est pas abrogé** : la décision porte sur le plafond, pas sur l'impossibilité de typer les items, et le revalidateur **refuse toujours** l'argument de faisabilité |
| A-3 | P09/P12 — propriétaire de l'invariant | ✅ `shell.ts`, confirmé par **double source** (**C-39**) |
| A-4 | P09 — fidélité de l'artefact | ✅ **satisfait par mesure** (**C-43**) → finding **clos** |
| **A-5** | **P19 — seuil de (Q) acceptable avant d'exécuter la Partie A** | ⛔ **requis** : la Partie A n'est livrée que si ce seuil est fixé |
| **A-6** | **P20 / R3 — le fork vise-t-il des checkouts hors contrat `opencodev2` ?** | ⛔ **requis** : sinon R3 reste `accepted` ; sinon il rouvre en `open` et le texte de `AGENTS.md:15-17` doit prévoir un repli neutre |
| **A-7** | **P02 — le frein de répétition doit-il rester atteignable quand seul `description` change ?** | ✅ **réponse de l'opérateur : le frein doit rester atteignable** — `DECORATIVE = new Set(["description"])` (`repetition.ts:82`) est **conservé**. ⚠️ **mais la seconde moitié de la décision est RÉFUTÉE par C-115** : les ~4 tests ne doivent **pas** être réécrits `DECORATIVE = new Set(["description"])` (`repetition.ts:82`) est **conservé** ; les ~4 tests de `test/tool/shell.test.ts` ils échouent par **contamination inter-tests** : `test/tool/shell.test.ts:65-66` fixe `sessionID: SessionID.make("ses_test")` dans un **const de module** qui est le `Tool.Context` par défaut de tous les tests (`:45`, `:55`), donc **un seul ledger** de répétition est partagé et `FAILURE_LIMIT = 3` (`repetition.ts:43`) déclenche sur l'appel d'un **autre** test. Mesuré : **68 pass / 27 fail** sous P02 contre **70 / 25** avec `DECORATIVE` vidé ; diff normalisé `ONLY_WITH_P02=4` contre `ONLY_WITHOUT_P02=2` (flaky) ; `src/tool/shell.ts` ne référence ni `repetition` ni `RepeatedCallError` (`IMPL_HITS=0`, contrôle positif `CONTROL_HITS=2`). **Remède appliqué et mesuré** : isolation de session par test — `test/tool/shell.test.ts:65-89` passe d'un `const ctx` fixe à `let ctx = makeCtx("ses_test_0")` réassigné par `beforeEach` (`makeCtx` factory en `:65-74`), le paramètre par défaut `next: Tool.Context = ctx` étant évalué **à l'appel**, donc chaque corps de test lit sa propre session ; le frein reste intact **à l'intérieur** d'un test. Résultat mesuré **par moi**, deux exécutions : **`BRAKE_MENTIONS` 54 → 0**, échecs **27 → 20**, `75 pass / 20 fail` **identiques** sur les deux passes, `TYPECHECK_EXIT=0`, `test/shell/shell.test.ts` **12 pass / 0 fail**, `markers=0`. Résiduel : les 20 échecs restants **ne sont pas** P02 — un **sous-ensemble disjoint** des 4 tests P02 bascule à chaque passe (RUN1 : `nested bash` + `preserves output when aborted` ; RUN2 : `Git Bash /tmp external workdir`), signe de l'**instabilité** de la suite (**C-44**), pas du frein ; `RepeatedCallError` n'apparaît plus (**C-115**) |

## Findings — état de clôture

| Finding | Sévérité / statut initial | État | Preuve |
| --- | --- | --- | --- |
| `P09-RESIDUAL-ARTIFACT-FIDELITY` | `medium/residual` | ✅ **clos — `FIDÈLE`** | **C-43** : écart **0/0** octets, `identical=true` ; hypothèse `terminal-output.ts:233` **infirmée** |
| `P09-OWNERSHIP-INVARIANT` | `medium/out_of_scope` | ✅ **clos — tranché** | **C-39** : `shell.ts`, opérateur **et** validateur P12, indépendamment |
| `P09-UNBOUNDED-ARTIFACT-SIZE` | `low/out_of_scope` | ⏸ **résidual assumé** | **C-43** : `trunc.write` n'applique aucune borne (140 129 o écrits) |
| `P06-F1` | `medium/residual` | ✅ **clos — prémisse fausse** | **C-27** / **C-38** : `README.md:28` = P06 (correct) ; `:33` = P11 portant déjà `goal-contract.ts:519` |
| `P06-F2` | `medium/residual` | ✅ **clos — réfuté par citation** | **C-28** : `goal-contract.ts:576-577`, `compaction.ts:5`/`:372-374`/`:377`/`525` |
| `P06-F3` | `low/residual` | ⏸ conservé `residual` | format pinné par `goal-context.test.ts:12-13` ; préservé **et dit** |
| `P08-TESTS-EXISTANTS-A-REECRIRE` | `low/residual` | ⏳ **ouvert** — vague 4 | chemin réel `src/`, pas `test/` (**C-40**) |
| `P08-VACUUM-COUT-NON-MESURE` | `low/residual` | ⏳ chiffres **supprimés**, méthode consignée | décision d'agent de révision, à revalider |
| `P08-R2B-REASONING-NON-BORNE` | `medium/residual` | ⏸ **résidual assumé** par A-1 | 3 045 134 car. = **50 %** d'une session |
| `P09-WORKTREE-PREEXISTING` | `info/out_of_scope` | ⏸ hors périmètre | modifications antérieures à ce tour, non annulées |
| `P13-OWNERSHIP-INVARIANT` | — | ⏸ `out_of_scope`,Arbitrage A-3 | `collect()` couvert par antériorité (**C-48**) |

## Corrections de l'audit — bilan

**51 corrections** consignées (`CORRECTIONS.md`, `C-01` → `C-51`), dont **6 mesureurs corrects** et
nombreux qui **mettent en cause l'audit initial** plutôt que les propositions :

- **C-02** gain P05 annoncé à −35 car. au lieu de +35 ; **C-17** ratio 84× non causal ; **C-24** critère P13 inatteignable ;
- **C-38** `P06-F1` clos sur prémisse fausse ; **C-40** chiffres de la baseline faux ; **C-44** suite shell **instable** ;
- **C-42** **C-16 abrogée** — `launch-retry.ts:8` est dans `packages/core/src/` et compte **huit** alternatives, pas six ;
- **C-43** hypothèse centrale du finding P09 **infirmée** par exécution ; **C-45** désaccord `errno` tranché contre le validateur ;
- **C-47** base de non-régression Found elsewhere : `test/shell/shell.test.ts` verte et stable ;
- **C-48** ma propre formulation « neutralisé par accident » **requalifiée** ; **C-50** `glob` a menti deux fois.

## Conclusion de l'étape 3

**20 propositions, 20 verdicts, 6 revalidations.** Le rendement des cycles est **positif mais non
épuisant** (**C-37**) : chaque revalidation trouve des objections légitimes absentes du verdict
précédent — N1/N2 pour P10, R1/R2 pour P02, 5 objections pour P18, O1→O5 pour P11. D'où la
politique de **3 cycles maximum** et la sortie `NOT-IMPLEMENTABLE`, qui est une issue légitime.

**Deux blocages exogènes sont levés par mesure** : le shell n'est pas indisponible (**C-46**,
`TYPECHECK_EXIT=0`), et l'arbitrage A-4 est satisfait (**C-43**).

**Deux blocages exogènes résistent** : **A-2 contesté** (C-34) et **A-5 / A-6 non tranchés**.
Aucun des trois n'est de mon ressort : ils engagent la politique de déploiement du fork et le
compromis effort/preuve du goal contract.
## État vérifié — census des verdicts définitifs

Source de vérité : la section `## Final verdict` de chaque `verdicts/P*-revalidation.md`, lue à partir de son ancre. Aucun verdict absent : `FINALSEC_MISSING=0`. Le comptage des findings `open` tolère la cellule en gras (`**open**`) comme la cellule nue ; un motif unique sur `open` nu rendait un zéro faux (ledger C-130).

| proposition | verdict définitif | findings `open` | implémenté | preuve `fichier:ligne` |
|---|---|---|---|---|
| **P01** | FAIL | 0 | non | `-` |
| **P02** | PASS_WITH_CHANGES | 0 | oui | `src/tool/repetition.ts:82,:88` |
| **P03** | FAIL | 0 | non | `-` |
| **P04** | FAIL | 0 | non | `-` |
| **P05** | PASS_WITH_CHANGES | 0 | oui | `src/session/lean-advisory.ts` |
| **P06** | PASS_WITH_CHANGES | 0 | oui | `src/session/goal-context.test.ts` |
| **P07** | PASS_WITH_CHANGES | 0 | non | `-` |
| **P08** | PASS_WITH_CHANGES | 1 | non | `-` |
| **P09** | PASS_WITH_CHANGES — **NOT_IMPLEMENTABLE** | 14 | non | `-` |
| **P10** | PASS_WITH_CHANGES | 0 | non | `-` |
| **P11** | PASS_WITH_CHANGES | 0 | non | `-` |
| **P12** | FAIL | 0 | non | `-` |
| **P13** | PASS_WITH_CHANGES — **NOT_IMPLEMENTABLE** | 6 | non | `-` |
| **P14** | PASS_WITH_CHANGES | 0 | oui | `src/tool/shell.ts:289,:538,:703` |
| **P15** | PASS_WITH_CHANGES | 1 | oui | `src/plugin/index.ts:319` |
| **P16** | PASS_WITH_CHANGES | 0 | oui | `src/tool/terminal-output.ts:155,:161` |
| **P17** | FAIL | 7 | non | `-` |
| **P18** | PASS_WITH_CHANGES | 0 | non | `-` |
| **P19** | FAIL | 0 | non | `-` |
| **P20** | FAIL | 0 | non | `-` |

Synthèse : **7 `FAIL`** (P01, P03, P04, P12, P17, P19, P20), **13 `PASS_WITH_CHANGES`**, 0 `PASS`. **6 des 13 propositions validées sont implémentées et mesurées** ; **7 validées ne sont pas implémentées** : P07, P08, P09, P10, P11, P13, P18. Findings `open` restants : P08 (1), P15 (1), P17 (7).

Le tableau de décisions ci-dessus est antérieur à ce census et conserve des libellés de cycle par obsolétude ; il est conservé comme trace de décision, ce census fait foi.

## Vague 5 - refutations par execution (code reverti)

| proposition | verdict | refutation par execution | preuve |
|---|---|---|---|
| **P10** | **REVALIDATED-FAIL** (execution) | implantation refutee : la porte `ramp >= 1` exige 60 000 tokens inspectes, donc `isReadHeavy` devient faux la ou HEAD etait vrai ; 2 assertions vertes de HEAD inversees (`src/session/overflow.test.ts:32` et `:44`) ; 2 tests proteges de `compaction.test.ts` casses (filtre `read-heavy fraction` 0 pass / 1 fail exit 1, filtre `uses configured automatic` 0 pass / 1 fail exit 1) | revert `git cat-file blob HEAD:<path>` sur 4 fichiers, `MATCH=True` (compaction.ts `want=got=50cd63a6`), `bun typecheck` EXIT 0 et 0 erreur TS, R1 1 pass / 0 fail, R2 1 pass / 0 fail, R3 14 pass / 0 fail, ledger C-141 |


## Disposition definitive des 20 problemes

Statuts lus par lecture directe, jamais par regexp (C-142).

| probleme | verdict | implementation | preuve |
|---|---|---|---|
| P01 | FAIL | aucune | revalidation :246 |
| P02 | PASS_WITH_CHANGES | fusionnee | 22 pass / 0 fail |
| P03 | FAIL | aucune | revalidation :130 |
| P04 | FAIL | aucune | revalidation :282 |
| P05 | PASS_WITH_CHANGES | fusionnee | 10 pass / 0 fail |
| P06 | PASS_WITH_CHANGES | fusionnee | 6 pass / 0 fail |
| P07 | PASS_WITH_CHANGES | fusionnee | commit fbc65658, 2 pass / 0 fail |
| P08 | PASS_WITH_CHANGES en c6 | bloque, 1 open residuel | C-32, revalidation c7 en cours |
| P09 | PASS_WITH_CHANGES | non implementable | 14 residus open :294 |
| P10 | falsifie par execution | reverti a HEAD | C-141, typecheck 0, 14 pass / 0 fail |
| P11 | PASS_WITH_CHANGES | fusionnee | commit 80aa6c31, 3 pass / 0 fail |
| P12 | FAIL | aucune | revalidation :409 |
| P13 | PASS_WITH_CHANGES | non implementable | 6 residus open :172 |
| P14 | PASS_WITH_CHANGES | fusionnee | 19 pass / 0 fail, typecheck 0 |
| P15 | PASS_WITH_CHANGES | fusionnee | 124 pass / 0 fail, typecheck 0 |
| P16 | PASS_WITH_CHANGES | fusionnee | 39 pass / 0 fail |
| P17 | FAIL | aucune | 9 residus open, terminal |
| P18 | PASS_WITH_CHANGES | non implementable | COR-R18-4 open, C-143 |
| P19 | FAIL | aucune | revalidation :246 |
| P20 | FAIL | aucune | revalidation :267 |
