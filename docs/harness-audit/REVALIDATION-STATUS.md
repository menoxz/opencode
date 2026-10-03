# Statut de la vague 3 — registre autoritaire

Ce fichier est l'état de référence pour ne plus redériver l'avancement. Dernière mise à jour : après la livraison des révisions P10 et P18 et la remontée du verdict P01.

**Règle de lecture** : une proposition n'est *revalidée* que si `verdicts/PXX-revalidation.md` existe sur disque avec un statut `REVALIDATED-*`. Le marqueur `> Révisé après verdict` dans `proposals/` **n'est pas une preuve** (cf. C-21).

## Décompte

| Mesure | Valeur |
| --- | --- |
| **DoD 1 — 20 propositions** | ✅ **PROUVÉ** : `PROPOSALS=20`, `MISSING_PROPOSAL=` (vide) |
| **DoD 2 — 20 verdicts** | ✅ **PROUVÉ** : `VERDICTS_BASE=20` |
| Propositions sur disque | 20 / 20 |
| Verdicts de base sur disque | 20 / 20 — P12 livré en dernier, remplace un fichier préexistant non conforme (C-31) |
| Revisions atterries | 7 (P02, P03, P04, P06, P10, P11, P18) |
| Revisions **corrompues** à refaire | 5 (P03, P04, P07, P13, P16) — règle C-21 |
| Revisions non encore livrées | P01, P05, P14 |
| Revalidations sur disque | **5** — P02, P06, P10, P18 = `REVALIDATED-PASS_WITH_CHANGES` ; **P11 = `REVALIDATED-FAIL`** |
| **Arbitrage A-4 (fidélité P09)** | ✅ **SATISFAIT PAR MESURE** — `shell.ts:604` écart **0/0** octets, `identical=true`. Finding `P09-RESIDUAL-ARTIFACT-FIDELITY` → **clos**. Deux nouveaux résidus `residual` : dérive texte→chemin (`truncate.ts:29-31`, 6/6 sondes) et perte d'info au retour. Cf. **C-43** |
| **Base de non-régression (shell)** | ✅ **`test/shell/shell.test.ts` = 12 pass / 0 fail, exit 0** — verte et stable. **C'est la base de la vague 4 pour les correctifs de permissions shell**, en remplacement de `test/tool/shell.test.ts` (instable, **C-44**). Cf. **C-47** |
| **Seuil « typecheck vert »** | ✅ **`bun typecheck` → `TYPECHECK_EXIT=0`** (16 s, bun 1.4.2). Lève `COR-R18-3`. Cf. **C-46** |

### Statuts réels des revalidations (extraits des fichiers, pas des rapports d'agents)

| P | Statut sur disque | Blocage restant |
| --- | --- | --- |
| P02 | `REVALIDATED-PASS_WITH_CHANGES` | — **cycle 2 déclare 0 résidu `open`** ⇒ **1ᵉʳ candidat vague 4**, sous réserve de revalidation cycle 2 |
| P06 | `REVALIDATED-PASS_WITH_CHANGES` | objection de périmètre (C-28), levée au cycle 2 ; divergence T3 1 200 vs 1 100 (C-49) |
| P10 | `REVALIDATED-PASS_WITH_CHANGES` | N1 casse 2 tests verts ; N2 `Compaction.select` non exporté |
| P11 | **`REVALIDATED-FAIL`** | 3 des 4 Required changes intacts ; arbitrage **A-2 contesté** (C-34) |
| P18 | `REVALIDATED-PASS_WITH_CHANGES` | branche `Busy` non testée ; `EBUSY_ANY` non audité ; `COR-R18-3` **levé par C-46** |
| P20 | **`REVALIDATED-FAIL`** | **un seul** Required change intact : seconde moitié de **RC6** — test qui mesure le vrai `packages/opencode/AGENTS.md` au lieu d'un `AGENTS.md` synthétique. Résidu **R2 `open`** : seule preuve existante = un `rg` manuel, **interdit en vague 4**. Remède **S** : `test/agents-md.test.ts` (nouveau), motif déjà prouvé par `test/daemon/console-visibility.test.ts:17,51,60`. 10 des 11 RC résolus, 17 citations exactes |

**Candidats vagues 4 (aucun résidu `open`) : 1 / 6 — P02.** Les deux `FAIL` (P11, P20) sont non implémentables
par définition de la règle d'implémentabilité, quel que soit le nombre de cycles.

**Livrables non encore revalidés** (ordre de priorité) : **P16** (livré, 7 RC, **C-50/C-51**), P11 (cycle 2),
P10 (cycle 2), P20 (R2 : test de contenu `test/agents-md.test.ts`), P18 (cycle 2 interrompu par `budget_exceeded`),
P01, P05, P14, P17, P03. Revalidations **en vol** : P02, P04, P06, P07, P08, P12, P13, P15, P19.
| Revalidations en vol | 0 |
| Propositions atteignant `REVALIDATED-PASS` | **0 / 20** — clause abrogée, voir C-32 et la règle d'implémentabilité de `REVALIDATION-BRIEFS.md` |
| **Revalidations implémentables (aucun résidu `open`)** | **0 / 5** — classement complet en C-33. P02 : R1 `ouvert` + R2 `BLOQUANTE`. P06 : objection de périmètre `BLOQUANTE`. P10 : N1 `haute`/`OPEN` + N2 `moyenne`/`OPEN`. P18 : 3 résidus non statutés donc `open`. **Aucun candidat pour la vague 4** |
| Cycles de révision engagements | 9 (P01, P03, P04, P06, P07, P10, P11, P12, P13, P15, P16, P17, P20) — second tour requis pour P02, P06, P10, P11, P18 |
| Dépôt commité | ✅ `267c4ce39` — contrat d'orchestration, via `GIT_INDEX_FILE` alternatif |

## Statut par proposition

| P | Verdict de base | Révision | Revalidation | Blocage |
| --- | --- | --- | --- | --- |
| P01 | `PASS_WITH_CHANGES` | à faire | non | **C-22** (la proposition inverse le code sur la menace) + **C-23** (T2 n'exerce pas le chemin visé) |
| P02 | `PASS_WITH_CHANGES` | atterrie | **en vol** | — |
| P03 | `PASS_WITH_CHANGES` | **corrompue** | non | C-21 — refaire depuis un fichier propre |
| P04 | `FAIL` | **corrompue** | non | C-21 + 3 blocages durs (quota journalier, compteur `attempt 10/10`, effort S) |
| P05 | `PASS_WITH_CHANGES` | à faire (relancée après `budget_exceeded`) | non | — |
| P06 | `PASS_WITH_CHANGES` | atterrie | **`REVALIDATED-PASS_WITH_CHANGES`** | **objection bloquante** : C-28 réfute le §8 (effort réel **S**, un seul fichier, 0 appelant touché) ; reste 2 `compacting.prompt` court-circuite `buildPrompt` (`:655-656`), `DETAIL_BUDGET_CHARS` non exprimable par `renderBudgeted`, plafond T3 à arbitrer (750 vs 1100) ; `P06-F1` **clos** (C-27) |
| P07 | `PASS_WITH_CHANGES` | **corrompue** | non | C-21 + **C-20** (T3 passe avant/après) |
| P08 | `PASS_WITH_CHANGES` | à faire | non | **arbitrage humain** : R1 renversé (opt-in + census), effort L |
| P09 | écrit (4 findings, `budget_exceeded` après écriture) | s.o. | s.o. | invariant de propriété délégué à P12 ; 3 findings `out_of_scope` |
| P10 | `PASS_WITH_CHANGES` | atterrie (548 l.) | **en vol** | point `NEEDS_REVIEW` sur `READ_HEAVY_RAMP_SPAN` |
| P11 | **`FAIL`** | atterrie (reprise complète) | **en vol** | arbitrage humain : typage des DoD d'effort L |
| P12 | `PASS_WITH_CHANGES` (livré, remplace un fichier préexistant non conforme — C-31) | à faire, **reprise complète** | non | **2 objections bloquantes** (C-30) : `redirectTargets` sans prédicat, `>` devient un chemin bidon neutralisé **par accident** (`shell.ts:413`) ; cas 2 fondé sur une affirmation non observée. 27 citations vérifiées, 0 fausse |
| P13 | `PASS_WITH_CHANGES` | **corrompue** | non | C-21 + **C-12** (patch non compilable) + **C-13** (`always` neutralise la détection) + **C-14** (contradiction `agent.ts:356-370` vs `:119-121`) |
| P14 | `PASS_WITH_CHANGES` | à faire (relancée après `budget_exceeded`) | non | **objection technique, pas un arbitrage humain** : `shell.ts:512` `last = preview(last + chunk)` tronque **en flux**, donc la détection proposée `body !== (last \|\| output)` vaut `last !== last` → `false` ; §4.3 « rend `truncated` honnête » échoue |
| P15 | `PASS_WITH_CHANGES` | à faire | non | **C-18** (patch → TS18047) |
| P16 | `PASS_WITH_CHANGES` | **corrompue** | non | C-21 + **C-10** (sévérité réelle `low`) + **C-11** (casse `terminal-output.test.ts:160`) |
| P17 | `PASS_WITH_CHANGES` | à faire | non | collision `truncate.ts` avec P16 |
| P18 | `PASS_WITH_CHANGES` | atterrie | **en vol** | prémisse du mandat fausse ; 8 autres sites escaladés (P18-bis) ; désaccord `cross-spawn-spawner.ts:86-93` |
| P19 | `PASS_WITH_CHANGES` | à faire | non | réemploi des logs SQL déjà écrits |
| P20 | **`FAIL`** | en cours (re-scope vers B1 seul) | non | **A1/A2 non livrés** (dénominateur faux, mesure non reproductible) ; B1 défendable ; 2 citations fausses (`AGENTS.md:110` inexistante, `tools.ts` sans chemin — réel : `src/session/tools.ts`) |

## Arbitrages tranchés par l'opérateur (2026-10-03)

| # | Sujet | Décision | Conséquence |
| --- | --- | --- | --- |
| A-1 | **P08** — R1 renversé par son propre verdict (effort L) | **Opt-in + census SQL read-only seul.** Aucune purge par défaut. | La proposition P08 se replie sur B : la croissance des parts reasoning reste **non bornée** (3 045 134 car. = 50 % d'une session) et le finding **P08-R2B-REASONING-NON-BORNE** reste `residual` **assumé**, pas corrigé. Le refus de purge est désormais une décision tracée, pas une omission. |
| A-2 | **P11** — typage des DoD d'effort | **Schéma dédié + plafond.** Un DoD d'effort doit porter un seuil chiffré falsifiable ; « L » seul est **refusé**. | Contredit `goal-contract.ts:609-628` qui refuse aujourd'hui tout goal dont une DoD n'est pas un artefact vérifiable. La révision de P11 doit implémenter le schéma, pas assouplir la barrière. |
| A-3 | **P09 / P12** — propriétaire de l'invariant « la sortie complète existe sur disque » | **`shell.ts`** (seule couche où la donnée est intacte avant troncature). | Confirme le choix du validateur P09 ; `P09-OWNERSHIP-INVARIANT` passe `out_of_scope` → **tranché**. Renforce la collision `shell.ts` (P09, P12, P13, P14, P18) : vague 4 **obligatoirement** séquentielle sur ce fichier. |
| A-4 | **P09-RESIDUAL** — fidélité de l'artefact | **Mesurer avant d'implémenter.** | `P09-RESIDUAL-ARTIFACT-FIDELITY` reste `open` jusqu'à une comparaison octet à octet entre la sortie réelle et ce que la troncature a écrit. Mesure lancée ; **P09 n'est pas implémentable avant son résultat**. |

### Cadre d'un arbitrage qui n'existait pas

`P14` figurait dans la liste des arbitrages humains sous « quel filtre de secrets ? ». **Cette question était fausse** : le verdict P14 ne contient aucune objection de filtre de secrets. Son objection est **technique** — `shell.ts:512` `last = preview(last + chunk)` tronque **en flux**, donc la détection proposée `body !== (last || output)` vaut `last !== last` → `false`, et §4.3 « rend `truncated` honnête » échoue. Aucune décision humaine n'est requise ; c'est une reprise de proposition.

## Collisions de fichiers connues (règle : un fichier source = un seul agent)

| Fichier | Propositions en conflit |
| --- | --- |
| `shell.ts` | P09, P12, P13, P14, P18 |
| `truncate.ts` | P16, P17 |
| `compaction.ts` | P06, P10 |
| `goal-contract.ts` | P11 |

## Rappel des contraintes d'orchestration

- Interdire `git` et le shell aux agents (EPERM sur `git.exe`, `pwsh.exe`, `cmd.exe`).
- Ne jamais commiter depuis un agent ; un commit unique par l'orchestrateur.
- Ne pas lancer un agent de révision tant que l'auteur de la proposition n'a pas terminé (C-21).
- Lectures par tranches `offset` / `limit` ; `grep` échoue en EPERM ; `glob` peut expirer (~30 s).

## Blocage du DoD « dépôt commité » (2026-10-03, mesuré)

Le commit des 10 fichiers du contrat d'orchestration est **impossible en l'état**. Deux défauts distincts, mesurés :

| Symptôme | Code | Sortie exacte |
| --- | --- | --- |
| `git add` échoue | `ADD_EXIT=1` | ``git: 'C:\Program Files\Git\cmd\git.exe' is not a git command. See 'git --help'.`` |
| `git commit` échoue | `COMMIT_EXIT=128` | ``fatal: Unable to create 'C:/jeanluc/opencode-fork/.git/index.lock': File exists.`` |

**Propriété du verrou, mesurée** : `GITPROCS=11` processus `git`/`git-lfs` vivants ; `.git/index.lock` âgé de **2 841 s** (47 min), taille **687 102 o**.

**Décision** : le verrou **n'est pas supprimé**. Avec 11 processus git en vie, l'obsolescence du verrou n'est pas prouvée ; le supprimer risquerait de corrompre l'index. Tuer ou relancer un processus git préexistant exigerait une demande explicite de l'opérateur, avec la liste des PID concernés. Le DoD « dépôt commité » reste donc **ouvert**, cause consignée ici.

**Cause unique : le verrou.** Mesure de contrôle : `git add --dry-run <chemin>` et `git add --dry-run -- <chemin>` échouent tous deux avec l'erreur **identique** `Unable to create '.../.git/index.lock': File exists` (`A_EXIT=128`, `B_EXIT=128`), et `git --version` répond `2.56.0.windows.1` — l'outil est sain. J'avais d'abord attribué à `git add` un second défaut d'argument (``git.exe`` reçu comme sous-commande, `ADD_EXIT=1`) : **cette attribution était fausse**, je la retire. Ce message reste inexpliqué mais **n'est pas** la cause bloquante.

**Voie retenue, non destructive** : committer via un index Git **alternatif** (`GIT_INDEX_FILE` pointant hors du dépôt), après `git read-tree HEAD`. Cette voie n'écrit jamais dans `.git/index.lock`, ne supprime aucun verrou et ne tue aucun processus. Elle est réversible : un commit mal formé reste un objet dangling, jamais une perte de travail.

HEAD au moment du premier échec : `9783daea6 docs(harness-audit): add independent P17 verdict (PASS_WITH_CHANGES)`.