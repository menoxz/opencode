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
| **P07** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-25** : `task.ts:236` **jamais lue** (angle mort), `session.ts:942-943` **fausse** (`input.directory` est à `:936-937`). **C-20** : T3 passait avant/après. **28 citations exactes sur 30**. Revalidation en vol |
| **P08** | `PASS_WITH_CHANGES` (**R1 renversé par son propre verdict**) | 1 | — | à établir | ⛔ | **A-1 appliqué** : opt-in + census read-only, effort **L abandonné**, aucune purge par défaut. Preuve à contrôler : census câblé hors `maintain()`/`schedule()`, donc jamais sur `checkpoint()` qui émet `PRAGMA wal_checkpoint(TRUNCATE)` (`maintenance.ts:44-48`). **C-50** : `maintenance.test.ts` est en `src/`, pas `test/` |
| **P09** | `PASS_WITH_CHANGES` | 0 | — | **1 ouvert** (`R3`) | ⛔ | **A-4 SATISFAIT PAR MESURE (**C-43**)** : `shell.ts:604` écrit **exactement** les octets attendus (35 129 et 140 129, **écart 0/0**, `firstDiffOffset=-1`). L'hypothèse « `terminal-output.ts:233` écrit un `raw` » est **INFIRMÉE** (35 129 o sur disque pour 1 148 o retournés, `outputPath=null`). **C-39** : `P09-OWNERSHIP-INVARIANT` **clos** (`shell.ts`, double source indépendante) ; contrepartie opposable : `collect()` (`shell.ts:390-426`) sur **chaque** tentative. **C-50** : nouvelle preuve — `truncate.ts:29-31` conserve `{{`/`}}` en **6/6** sondes. Reste **R3** (trois outils MCP d'environnement sans garantie de disponibilité) |
| **P10** | `PASS_WITH_CHANGES` | 2 | `PASS_WITH_CHANGES` (c1) | **2 (`N1`, `N2`)** | ⛔ | **N1** : `overflow.test.ts:32` et `:44` sont **verts aujourd'hui** et cassent — `readHeavy` est le prédicat `ramp > 0`, **faux** à `inspected = 20 000` (ramp = 0). **N2** : T7.4 lit via `Compaction.select`, **non exporté** (`compaction.ts:416`) → ne compile pas. **C-36** : le revalidateur a découvert N1/N2 **absents du verdict** et a refusé de les corriger pour préserver l'indépendance. `551 760` confirmé par recalcul indépendant `floor(580 800 × 0,95)` |

## Matrice — lot 3 (P11 → P15)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P11** | **`FAIL`** | 2 | **`FAIL`** | **4 Required changes intacts** | ⛔ | **C-34** : le revalidateur **refuse l'arbitrage A-2 sur le fond** — `dod = Schema.Array(Schema.String)` (`goal-contract.ts:54-56`), `normalizeGoalList` ne normalise que des chaînes (`:208`, `:216`), `nextGoalState` ne valide rien (`:199-222`) ; typer les items exige une autorité d'écriture **hors de `edit_objective`**. **Décision opérateur requise.** Le fond est juste : R1+R2 ferment bien l'évasion `residual` |
| **P12** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-30** → **C-48** : `redirectTargets` sans prédicat, `>` devenait un **chemin bidon**. Reprise : prédicat purement textuel `REDIRECT_OPERATORS` + `isRedirectOperator`, et **requalification de `shell.ts:413` en filtre d'espace de travail** — ma formulation « neutralisé par accident » lui prêtait une intention qu'il n'a pas. Cas 2 **retiré** après glob + grep exhaustif (107 occurrences, 2 types AST, 0 `file_redirect`). `collect()` **une fois** en `shell.ts:652`, **avant** `ask`/`run` → couverture par antériorité |
| **P13** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-24** : « la suite passe » **inatteignable** — `test/tool/shell.test.ts` déjà rouge (26-28 échecs `RepeatedCallError`). **C-41** : le volet B s'appuyait sur des chiffres **périmés** (`68/27/3`) et sur un `glob` **faux**. **C-47** : `test/shell/shell.test.ts` = **12/0 vert et stable** → c'est la bonne base. **C-13** : l'agent soutient que `always` **ne fait pas** monter la sévérité (`evaluate` apparie par nom de permission) |
| **P14** | `PASS_WITH_CHANGES` | 1 | — | **détection fausse** | ⛔ | `shell.ts:512` `last = preview(last + chunk)` tronque **en flux** → `body !== (last \|\| output)` vaut `last !== last` → **`false`**. La détection ne se déclenche que dans le cas trivial et échoue là où elle servirait. « rend `truncated` honnête » est **faux en l'état**. Révision en vol |
| **P15** | `PASS_WITH_CHANGES` | 2 | — | à établir | ⛔ | **C-18** : patch non compilable (TS18047). Révision : `const b: EffectBridge.Shape = yield* EffectBridge.make()`, suppression de `:280`/`:313` → l'union `Shape \| null` n'est plus **construite**. Branche `catchCause` **supprimée** (filet sans consommateur ; hot reload éteint **muet**). Reste : compilation par raisonnement (**C-46** rend `bun typecheck` disponible), offsets de hunk indicatifs |

## Matrice — lot 4 (P16 → P20)

| P | Verdict de base | RC | Revalidation sur disque | Résidu `open` | Impl. | Blocage dominant |
| --- | --- | --- | --- | --- | --- | --- |
| **P16** | `PASS_WITH_CHANGES` (sévérité arbitrée **`low`**) | 2 | — | à établir | ⛔ | **C-26** / **C-51** : **deux** régressions, la seconde trouvée par le rédacteur — `terminal-output.test.ts:160` (`references` ne vient que de `Truncate.savedOutputPath`, `terminal-output.ts:145` → `referenceText` (`:225`) devient `""`). Remède : filtre de préfixe `TRUNCATION_DIR` dans `savedOutputPath` — **point faible à trancher** : un préfixe est-il ambigu sous Windows ? **C-50** : baseline déclarée absente par `glob`, **seconde occurrence** |
| **P17** | `PASS_WITH_CHANGES` | 1 | — | à établir | ⛔ | Collision d'**unités octets/caractères** (`MAX_BYTES = 50 × 1024` en octets vs `lean-output-policy` en caractères) et **gain-token incohérent** avec la liste blanche. `registry.ts:256` substitue `out.content` quand `truncated` (**C-29**) — jamais « no-op ». **23 citations, 23 exactes**. Révision en vol |
| **P18** | `PASS_WITH_CHANGES` | 2 | `PASS_WITH_CHANGES` | **3 non statutés → `open`** | ⛔ | Branche **`Busy` sans aucun test** — un refactor cassant `tagOf` laisserait les 3 tests verts **en restaurant l'objection de la vague 2**. Compteur `starts.count` **conditionnel** (`shell-launch-retry.test.ts:62`). `EBUSY_ANY=3` non audité alors que `launch-retry.ts:8` contient bien `EBUSY` (**C-42**). Cycle 2 **interrompu** par `budget_exceeded` |
| **P19** | `PASS_WITH_CHANGES` | 1 | — | à établir | ⛔ | Diagnostic confirmé (`prompt.ts:1872` seul chemin accordant `"execute"` non vérifié → `continuation.ts:77-78` continuation inconditionnelle). Deux `KO` bloquants. **Partie A non livrée** ; O1 (`0,628`) supprimé, O2 (« aucun risque ») retiré → **aucun gain annoncé**, la consigne ramenant le bilan à **zéro** (0,16 %). **`prompt.ts:1872` — l'objet même du finding — est déclaré hors périmètre par mandat** : à trancher. **22/22 citations exactes** |
| **P20** | **`FAIL`** (B1 seul livrable ; A1/A2 rejetés) | 2 | **`FAIL`** | **1 (`R2`)** | ⛔ | **Un seul** Required change intact : seconde moitié de **RC6** — le test qui mesure le vrai `packages/opencode/AGENTS.md` au lieu d'un `AGENTS.md` synthétique. Seule preuve existante : un `rg` manuel, **interdit en vague 4**. Remède **S** : `test/agents-md.test.ts` (nouveau), motif prouvé par `test/daemon/console-visibility.test.ts:17,51,60`. **10 des 11 RC résolus, 17 citations exactes, ligne 14 préservée**. `R3` = `accepted` mais **escalade opérateur** requise (politique de distribution du fork) |

## Décompte observé

| Mesure | Valeur | Preuve |
| --- | --- | --- |
| Propositions | **20 / 20** | `PROPOSALS=20`, `MISSING_PROPOSAL=` (vide) |
| Verdicts de base | **20 / 20** | `VERDICTS_BASE=20` |
| Revalidations sur disque | **18** | P01, P02, P03, P04, P05, P06, P07, P08, P10, P11, P12, P13, P14, P15, P16, P18, P19, P20 — **P17 déblocable maintenant** (P16 livré, `truncate.ts` et `terminal-output.ts` quittes), **P09 révisée, à revalider** |
| Statuts de revalidation | **0** `PASS` · **10** `PASS_WITH_CHANGES` · **8** `FAIL** | **extraits des 18 fichiers sur disque**, `## Final verdict` suivi du statut lu ligne à ligne — **jamais des rapports d'agents** (C-67) |
| **Implémentables** | **5 / 20** — **P02, P05, P06, P15, P16** ; **P14** `PASS_WITH_CHANGES` 0 `open` mais **3 RC avant implémentation** (règle 10) | **attesté sur disque, en prose** : `P02:108` « Zéro résidu `open` » · `P05-revalidation.md` (177 l., aucun résidu `open`) · `P06:144` « Aucun n'est `open` » · `P15:194` « Aucun résidu n'est `open` » · `P16:204` « Aucun résidu `open` » — **pas** un décompte de rapport d'agent (C-67). Sections `## Regressions introduced` présentes : P06:237 (**« Aucun test vert n'est cassé »**), P15:173, P16:207 |
| Vague 4 | **démarrée** — 4 fichiers disjoints, **les 4 éditions visibles** | `repetition.ts` (P02, `DECORATIVE:82`,`88`), `compaction.ts` (P06), `plugin/index.ts` (P15), `terminal-output.ts` (P16). **Typecheck et tests non encore exécutables** : C-60/C-62 interdisent toute mesure sur un fichier dont un agent est propriétaire |
| **Au plafond C-37** (3 cycles) | **4** — P04, P07, P12, P13 | `NOT-IMPLEMENTABLE` par politique, finding et correctif conservés au rapport |
| Vague 4 | **démarrée** — 4 fichiers disjoints | `repetition.ts`, `compaction.ts`, `plugin/index.ts`, `truncate.ts` + `terminal-output.ts` |
| **Implémentations mergées** | **2 / 5** — `335586f7f` P02 · `d9c90ec92` P16 | P02 : `DECORATIVE:82`, garde `GUARD_HITS=0`, **22 pass / 0 fail**. P16 : `withinTruncationRoot` + câblage `:159`, test permanent **6/0**, **39/0** sur 3 fichiers, contrôle négatif `NAIVE_PREDICATE_ACCEPTS_SIBLING=true` (**C-78**). **P15 et P06 livrées, en cours de commit.** P15 : `TYPECHECK` 0→0, contrôles `TS18047`/`TS2322` discriminants, `test/plugin` **124/0**. P06 : `TYPECHECK_EXIT=0`, suite neuve **6/0**, **preuve par mutation** (les 5 échuent pré-correctif, arbre restauré octet pour octet) — mais 63/0 sur l'existant **seulement avec `--timeout 30000`**, **C-82 `open`**. **Vérification des commits par delta de `HEAD`, jamais par exit code** (**C-87**). **P15 et P06 : commit suspendu** (lot de 3 dans un seul shell, 300 s, aucun sha imprimé) — **un commit par invocation shell**, état à établir par delta, **C-88** |
| Dépôt commité | ✅ **5 commits** | `267c4ce39`, `01dda735a`, `0b443deb3`, `97f13eb96`, `0a5403b7f` |
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
| A-2 | P11 — typage des DoD d'effort | ⚠️ **contesté par le validateur (C-34)** → décision requise |
| A-3 | P09/P12 — propriétaire de l'invariant | ✅ `shell.ts`, confirmé par **double source** (**C-39**) |
| A-4 | P09 — fidélité de l'artefact | ✅ **satisfait par mesure** (**C-43**) → finding **clos** |
| **A-5** | **P19 — seuil de (Q) acceptable avant d'exécuter la Partie A** | ⛔ **requis** : la Partie A n'est livrée que si ce seuil est fixé |
| **A-6** | **P20 / R3 — le fork vise-t-il des checkouts hors contrat `opencodev2` ?** | ⛔ **requis** : sinon R3 reste `accepted` ; sinon il rouvre en `open` et le texte de `AGENTS.md:15-17` doit prévoir un repli neutre |

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
