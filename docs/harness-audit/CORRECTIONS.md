# Corrections de l'audit initial

L'audit initial (`C:\Users\jeanl\AppData\Local\Temp\opencodev2\audit-harnais-rapport.md`)
et la matrice `README.md` contiennent des erreurs. Elles ont été détectées pendant la phase
de remédiation, par les agents eux-mêmes et leurs validateurs. Chacune est corrigée ici
avec sa preuve, parce qu'une citation fausse dans un rapport d'audit est plus coûteuse
qu'une absence de citation : elle oriente l'implémentation vers le mauvais fichier.

| id | affirmation initiale | statut | réel | source |
|---|---|---|---|---|
| C-01 | la barrière de clôture est dans `src/session/goal-contract.ts` | **FAUX — chemin inexistant** | `packages/opencode/src/tool/goal-contract.ts:609-628` | glob + F06-F1 |
| C-02 | P05 coûte « ~240 tokens de duplication pure par tour » | **INFIRMÉ par mesure** | gain réel **−35 caractères** : le bloc **grossit**, 348 → 383 | P05 + verdict P05 |
| C-03 | les flags `experimental.qa_proof_advisory` / `risk_planner_advisory` pilotent l'advisory | **FAUX** | ces clés n'existent pas ; `runtime-flags.ts:4` utilise `bool()`, pas `enabledByExperimental()` → `OPENCODE_EXPERIMENTAL=1` ne les active pas, défaut OFF | P05 |
| C-04 | `registry.ts:256` renvoie la sortie non tronquée, c'est un défaut | **FAUX — no-op** | `registry.ts:256` est un no-op ; `:253` ne couvre que les outils plugin. Le point de passage unique est `truncate.output` | P17 |
| C-05 | le plafond de 4 000 caractères vient de `truncate.ts` | **FAUX** | il vient de `terminal-output.ts:5/224` ; `truncate.ts` est inatteignable pour bash via `tool.ts:188-190` (défaut 50 102 o) | P09 |
| C-06 | « le type d'objectif est choisi par le modèle » | **directionnel juste, mécaniquement imprécis** | le champ s'appelle `deliverable`, il est **optionnel**, déduit par regex du texte libre de la mission (`inferDeliverable`, `goal-state.ts:116-129`), écrit en un seul point (`prompt.ts:2739`) et **laissé `undefined` par le chemin outils** — donc absent par défaut, pas seulement reformulable | P11 |
| C-07 | — | ajout | 8 tests échouent **avant** toute implémentation (`BASELINE.md`) | ligne de base |
| C-08 | `plugin/index.ts:359` est un défaut de nullité actif | **INFIRMÉ par l'auteur** | le déréférencement est **inatteignable aujourd'hui** : la garde `:313` s'exécute avant tout armement de callback, `watchingStarted` mémorise la passe, et `bridge` n'est écrit qu'en `:280`/`:312`. C'est un **trou de type**, pas une panne. De plus `plugin/index.ts:366` **n'est pas le pont** (c'est la promesse de `parcelWatcher.subscribe`, dont le `.catch` couvre le rejet) : la prémisse de la matrice était fausse | P15 |
| C-09 | — | découverte | le **défaut jumeau de C-08** existe dans `packages/opencode/src/agent/agent.ts:445` et `:464` : même motif `null as any` puis `bridge!.promise(...)`. Non couvert par la matrice P01→P20. À traiter dans P15 ou dans une proposition jumelle | P15 |
| C-10 | P16 est de sévérité `medium` | **INFIRMÉ par le validateur** | sévérité réelle **`low`** : `references` n'atteint qu'un texte vu par le modèle (`truncate.ts:130`) et deux métadonnées **sans aucun consommateur applicatif** (`terminal-output.ts:252`/`:258`) — jamais un lien, un fichier ouvert ni une permission. C'est un défaut de fidélité de texte, pas un vecteur | P16 |
| C-11 | le remède P16 est sans effet de bord | **INFIRMÉ par le validateur** | supprimer l'extraction casse un **deuxième** test que P16 croyait incertain : `terminal-output.test.ts:160` échoue dans la branche `metadata = {}` de `for (const metadata of [{}, { outputPath: reference }])` (`:154`). Le remède P16 (ajouter `outputPath` au metadata) **effacerait la couverture même** du test. De plus la regex porte une capacité documentée (`docs/terminal-output.md:32`, « `upstreamOutputPaths` retains upstream references »), et un filtre de préfixe `TRUNCATION_DIR` (`truncate.ts:17`/`:69`) donnait le même gain sans `stat`, alternative que P16 n'a pas considérée | P16 |
| C-12 | le patch P13 est applicable en l'état | **INFIRMÉ par le validateur** | il ne l'est pas : `shell.ts:189` `function dynamic(...)` et `shell.ts:196` `function prefix(...)` ne sont **pas** `export`, alors que §4 impose « un seul site » et réutilise les deux ; `positionalWriteArgs` et `extractPathLiterals` sont **appelées sans définition**. Un patch qui ne compile pas n'est pas une proposition | P13 |
| C-13 | `always` limite la portée de la détection | **INFIRMÉ par le validateur** | `always` la **neutralise** : `shell.ts:421` + `permission/arity.ts:135` (`python: 2`) produisent la clé `"python -c *"`, que `permission/index.ts:304-310` pousse en règle `allow`, court-circuitée par `permission/index.ts:241`. P13 n'en faisait qu'une note de §9 | P13 |
| C-14 | — | découverte | contradiction de doctrine dans le même domaine : `agent/agent.ts:356-370` force `Truncate.GLOB` en `allow` sauf refus explicite, alors que `agent.ts:119-121` déclare `ask`. Deux politiques opposées pour la même permission | P13 |
| C-15 | le correctif P18 passe les tests existants | **INFIRMÉ par le validateur** | il casse le **seul** test qui couvre le chemin : `shell-launch-retry.test.ts:103` exige `starts.count >= LAUNCH_BUDGET` (constante `5` à `:20`) ; avec le retry externe retiré (`tool/shell.ts:498`), le compte passe de **8 à 1** → échec. Le test est lui-même un choix de conception à trancher, pas une|Non-régression contredite à faire passer par un ajustement de seuil | P18 |
| C-16 | le message d'erreur P18 est déterministe | **INFIRMÉ par le validateur** | `P18-eperm-spawn.md:170` fige « (EPERM at uv_spawn) » alors que la garde appelante `isTransientLaunchFailure` accepte six classes via `launch-retry.ts:8` (`EPERM\|EACCES\|EBUSY\|operation not permitted\|uv_spawn\|Access is denied`). Un `EBUSY` orienterait à tort vers les droits d'exécution | P18 |
| C-17 | **« un sous-agent coûte 84× plus cher par étape que son parent, donc déléguer est contre-productif »** | **CAUSALITÉ INFIRMÉE par le validateur** | le ratio compare des **`$/étape` non comparables**. L'enfant tourne sous l'agent du `subagent_type` (`task.ts:541` `agent: next.name`) avec un jeu d'outils réduit (`task.ts:543-545` `{ todowrite: false }`, `{ task: false }`) et exécute une boucle session complète prompt/outils/prompt (`task.ts:534-548`), pas un pas unitaire. Le contrat lean le conçoit explicitement comme **moins cher par pas** (`subagent-summary.ts:16-17`, « never return full terminal output to context »). Les 121 lancements vides (3,7 % de la cohorte) ne paient qu'un tour et sont **insuffisants pour produire un ratio de 84×**. La conclusion « déléguer est contre-productif » **tombe** ; le ratio ne prouve rien sur le coût de la délégation | P07 |
| C-18 | le correctif P15 compile sous `strict` | **INFIRMÉ par le validateur** | `proposal:172` `const b = bridge` conserve le type `EffectBridge.Shape \| null` (déclaré `plugin/index.ts:280`) : `b.promise(...)` (`proposal:178`) déclenche **TS18047**. Le narrowing provient d'un garde, pas d'une affectation — `proposal:184` et `:194` sont fausses | P15 |
| C-19 | supprimer `Effect.catchCause` est sans effet de bord | **INFIRMÉ par le validateur** | l'échec remonte à `bootstrap.ts:44` `yield* plugin.init()`, le **seul** `init()` du fichier sans le wrapper `Effect.catchCause(... Effect.logWarning ...)` de `bootstrap.ts:47-50` ; `src/index.ts:61/67` ne journalise pas en sortant. La sémantique d'échec doit être tranchée explicitement | P15 |
| C-20 | le test T3 de P07 prouve le correctif | **INFIRMÉ par le validateur** | `next.budgetMinutes ?? params.timeout_minutes ?? taskBudgetMinutes()` (`P07:359`) court-circute : avec `budget_minutes = 1` on obtient `minutes = 1` **avant comme après** `task.ts:694`. Le test passe dans les deux mondes et ne prouve rien | P07 |
| C-21 | les révisions de la vague 3 ont produit des propositions fiables | **DÉFAUT D'ORCHESTRATION, À MA FAUTE** | j'ai lancé les agents de révision alors que les auteurs de proposition étaient **encore en cours d'exécution** pour **P03, P04, P07, P13 et P16**. Deux agents écrivant le même fichier donnent un artefact dont ni le contenu ni le marqueur `> Révisé après verdict` ne sont fiables. Preuve : l'agent P04 rapporte que son fichier est passé de **496 à 711 lignes** et que les lignes 171-174 portent une correction à sa propre citation `processor.ts:945-959` qu'il n'a pas écrite ; il a été arrêté par ce conflit. **Ces 5 propositions sont à revalider depuis un fichier propre** avant toute implémentation | orchestrateur |
| C-22 | la menace justifiant la correction P01 vient des globs `instructions` acceptant des fichiers distants | **INVERSÉE par le validateur** | `instruction.ts:208-211` fait l'**inverse** : `if (raw.startsWith("https://") \|\| raw.startsWith("http://")) { … reason: "remote" … continue }` — les sources distantes sont **écartées**. La proposition (`§6` l.324-325) justifie sa menace par le code qui la neutralise. La menace réelle, plus grave et **jamais nommée** dans la proposition : un `AGENTS.md` **committé dans le dépôt**, trouvé par remontée de nom (`instruction.ts:305`) et rendu (`instruction.ts:322-323`) **sans aucun contrôle de provenance**. C'est cette menace-là qui justifie la correction, pas celle citée | P01 |
| C-23 | le test T2 de P01 prouve l'absence de réinjection sur le chemin de retenue | **INEXISTANT** | T2 lit *un autre* fichier du même dossier : digest différent, donc `ReadLedger.duplicateOf` (`read.ts:458-459`) ne s'active pas et le rendu part en chemin complet (`read.ts:466`). La branche `provenUnchanged` (`read.ts:408`, clé `(mtime,size)`), **soit la moitié du coût visée**, n'est exercée par aucun test. La proposition l.368 affirme pourtant le contraire | P01 |
| C-24 | le critère de succès de P13 (« le bloc de permissions passe sans modification de ses assertions ») est atteignable | **INATTEIGNABLE** | Le validateur a exécuté `bun test test/tool/shell.test.ts` **avant toute modification** : exit `1`, **68 pass / 27 fail / 3 errors**, 95 tests, dont **26 échecs** dans `describe("tool.shell permissions")` (`shell.test.ts:215`). Log : `%TEMP%/opencodev2/p13-shell-test.log`. La base est déjà rouge : aucune implémentation de P13 ne pourra rendre cette suite verte. Il faut soit un périmètre de test restreint et déclaré, soit une baseline de comparaison explicite | P13 |
| C-25 | les 30 citations de P07 sont vérifiées | **2 NON VÉRIFIÉES** | `task.ts:236` **n'a jamais été lue** (le validateur n'a ouvert aucune plage de `task.ts:170-300`) ; `session.ts:942-943` est **fausse** : `input.directory` est en réalité à `session.ts:936-937`. Une citation non relue n'est pas une preuve de code correct : l'absence d'objection sur `task.ts:236` est un angle mort, pas une validation | P07 |
| C-26 | C-11 : le correctif P16 casse **une** régression de test | **DEUX** | Le verdict P16 arbitre la sévérité réelle à **`low`** et compte **deux** régressions, la première nommée étant `test/tool/terminal-output.test.ts:85`. C-11 n'en avait compté qu'une : l'omission venait de ma part, le correctif de C-11 est donc incomplet | P16 |

## Conséquences sur la priorisation

**C-03 fait chuter P05.** Le défaut de duplication du DoD est réel dans le code, mais le
chemin d'activation (`risk_advisory`) est **éteint par défaut**. Ce n'est plus une correction
de premier rang : c'est une correction conditionnelle. Elle ne devient prioritaire que si
les flags sont activés, ce qui n'est le cas ni par défaut ni via `OPENCODE_EXPERIMENTAL`.

**C-06 aggrave P11.** Le problème est pire que décrit : non seulement le modèle peut
choisir un libellé favorable, mais le champ est **absent par défaut**. La règle qui ne
s'applique qu'aux « implementation objectives » ne protège donc presque jamais rien.

**C-02 invalide le chiffrage de P05.** Le correctif est plus rentable qu'annoncé pour une
mission longue (5 DoD longs : 836 → 383, soit −453 caractères), et **négatif** pour une
mission courte (1 DoD : 371 → 383). Le gain dépend donc de la longueur du DoD, pas du
nombre de tours : à chiffrer avant d'engager le correctif.

## Ce qui reste vrai de l'audit initial

Les mesures quantitatives sont inchangées et confirmées : `read.ts:357`, `read.ts:362`,
`repetition.ts:82-84`, le ratio sous-agent 84×, `cache_read` = 82 % du volume, 36 troncatures
sur 445 appels bash, 5 compactions, base de 5,2 Go. Les corrections ci-dessus portent sur
des **chemins** et des **chiffrages**, pas sur la **mécanique** des défauts.

## Méthode

Un validateur qui trouve une citation fausse dans une proposition doit la remonter comme
objection bloquante, et non comme une remarque. C'est ce qui a produit C-02 et C-03 : les
propositions P05 et P17 ont été mesurées avant d'être validées, pas après.