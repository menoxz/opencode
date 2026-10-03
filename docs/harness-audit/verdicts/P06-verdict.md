# P06 — Le résumé de compaction ne porte ni DoD ni findings

## Proposal

`P06` — « Le résumé de compaction ne porte ni DoD ni findings, et le mécanisme de
secours qui les porte est tronqué en silence ».
Fichier validé : `docs/harness-audit/proposals/P06-compaction-dod-loss.md` (472 lignes).

## Validator

`validator-independent-P06` — `independent` : je n'ai pas rédigé la proposition.
Toutes les vérifications ci-dessous sont faites contre le code réel lu dans
`packages/opencode/src` et `packages/opencode/test`, pas contre le texte de la
proposition.

## Status

`PASS_WITH_CHANGES`

Le diagnostic de la cause racine est juste et vérifié : `stickyGoalContext` coupe
réellement à 10 éléments par liste (`compaction.ts:100`, `compaction.ts:103`) et le
gabarit ancré ne contient effectivement ni DoD ni findings (`compaction.ts:55-90`).
Mais deux défauts de la proposition sont bloquants en l'état : le correctif (c) n'est
**pas borné** alors qu'il est présenté comme borné (§4.3 ligne 254-257), et le
correctif (a) n'a **aucun test d'effet** — T4 vérifie le prompt, pas le résumé
produit. Les deux se corrigent localement, d'où `PASS_WITH_CHANGES` et non `FAIL`.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations `fichier:ligne` exactes et verbatim | ok | 24/24 vérifiées ligne à ligne : `compaction.ts:44` (`const TOOL_OUTPUT_MAX_CHARS = 2_000`), `:55` (ouverture `SUMMARY_TEMPLATE`), `:57/60/63/64/67/70/73/76/79/82` (les huit titres), `:90` (`- Do not mention the summary process or that context was compacted.\``), `:98-105` ( corps de `stickyGoalContext`, `slice(0, 10)` aux lignes 100 et 103, ligne 101 `FINDING ${finding.id} [${...}/${...}]: ${...slice(0, 240)}`, ligne 104 `UNVERIFIED: ${...slice(0, 160)} → ${...slice(0, 240)}`), `:112-125` (lignes 122-124 citées verbatim dans la preuve (4)), `:113` (court-circuit `skipped`), `:168`, `:186`, `:196`, `:327`/`:329` (`toSorted` déjà présent), `:416`, `:525`, `:655-660`, `:912` ; `tool/goal-contract.ts:21`, `:607`, `:609`, `:610`, `:621-628` dont `:624` = `"Completion refused: sticky findings remain OPEN.",` ; `prompt.ts:102`, `:2381`, `:2385` ; `util/token.ts:1`, `:3-5`, `:7` ; `goal-evidence.ts:1`, `:4-13` |
| le chemin de fichier de la preuve (3) | **KO** | §2 ligne 50 écrit `packages/opencode/src/**session**/goal-contract.ts:609-628`. Le fichier réel est `packages/opencode/src/**tool**/goal-contract.ts` (785 lignes) ; il n'existe pas de `src/session/goal-contract.ts`. La proposition s'auto-signale (§2 lignes 63-65) mais laisse l'erreur dans le titre de la preuve, qui est la partie que l'on relit |
| le correctif supprime vraiment la cause | **KO** | La cause «Findings perdus du prompt » est bien visée, mais la section §3 étape 4 affirme que « la DoD et les findings **ne sont pas écrits** — ils n'ont pas de case », sur le mode d'un défaut structurel. C'est faux : `SUMMARY_TEMPLATE` est une **consigne addressée à un modèle**, pas un rendu. Preuve : `compaction.ts:196` — `return [anchor, SUMMARY_TEMPLATE, ...input.context].join("\n\n")` — la chaîne unique est envoyée au résumeur, et la réponse du modèle devient le résumé. Aucune normalisation mécanique n'existe : grep `Progress\|ensureSection\|normalize\|replace(\|template` sur `compaction.ts` → 6 hits seulement (55, 56, 63, 67, 84, et 116 qui est `state.goal.replace` dans la branche `completed` de `formatGoalContext`). Donc aucune section n'a de « case » : toutes sont des requêtes. La proposition dit d'ailleurs l'inverse dans son alternative (iv) ligne 311-315. Le raisonnement de §3 est donc sur-interprété là où il est exact dans §5 |
| le correctif ne casse pas un comportement existant | **KO** | Trois surfaces réelles omises par la liste §6. (1) `packages/opencode/test/session/context-budget.test.ts:294` segmente explicitement le bloc `["taskContract", /<task-contract[\s\S]*?(?=<goal_reminder\|<task_context\|$)/]` et asserte des plafonds `expect(stats.systemTotal).toBeLessThan(20000)` (ligne 414) et `expect(stats.requestTotal).toBeLessThan(200000)` (ligne 415), `toBeLessThan(60000)`/`toBeLessThan(300000)` (lignes 450-451). Le bloc sticky vit **dans** `<task-contract>` (`compaction.ts:124`) donc il compte dans `systemTotal`, et ce fichier n'est ni nommé ni exécuté par la commande globale §7. (2) `packages/opencode/src/eval/eval.test.ts:914` — `expect(result.errors.join(" ")).toContain("UNVERIFIED:")`, avec la constante `UNVERIFIED_PREFIX` en `src/eval/scenario.ts:90` : un troisième consommateur du préfixe, hors de la liste §6. (3) `packages/opencode/src/session/goal-context.test.ts:11-13` est bien la seule assertion sur la forme des lignes sticky, et la citation est exacte : ligne 12 `expect(context).toContain("FINDING SEC-001 [high/residual]")` — le format est préservé, donc compatible |
| tests proposés sont exécutables dans ce dépôt | **KO** | Les chemins et commandes existent (`src/session/goal-context.test.ts:2` importe bien `formatGoalContext` ; `test/session/compaction.test.ts`, `test/session/working-state.test.ts`, `test/session/working-state-goal-dod.test.ts`, `test/tool/goal-contract.test.ts` existent tous). Mais T4 (§7) ne prouve pas l'objectif : il assert que le **prompt** contient `## DoD (unmet)` et `<task-contract`, ce qui passe intégralement si le résumeur ignore les deux sections et n'écrit rien. Aucun test proposé n'asserte le **résumé produit**. L'item DoD central de P06 (« le résumé ancré porte la DoD et les findings ») n'a donc aucune preuve proposée. T3 est par ailleurs auto-référentiel : il compare `Token.estimate` à « le rendu d'aujourd'hui », un rendu qui n'existera plus après le patch |
| effort et coût annoncés réalistes | **KO** | Effort `S` (§8) est faux pour le sous-chantier (a) : faire passer l'état vivant à `buildPrompt` depuis `processCompaction` (`compaction.ts:525`) n'est pas une modification locale de fonction pure, c'est un franchissement de la frontière d'entrée de `SessionCompaction.process`. La proposition le reconnaît (§9 point 2) mais chiffre quand même `S` et déclare `READY` en §9. Coût : le tableau §6 lignes 355-357 (« 26 findings ≈ −540 car. », « 45 findings ≈ −1 400 car. ») est calculé sur une distribution majoritairement non-`open`, alors que `tool/goal-contract.ts:609-610` refuse précisément la clôture **tant que des findings sont `open`** : la session bloquée, celle que ce correctif vise, est celle où le bloc sticky est le plus gros. Le pire cas `open` n'est jamais chiffré (voir objection 2) |

## Objections

### Objection 1 — le correctif (c) n'est pas borné, et l'affirmation « jamais tronqué » est fausse telle que spécifiée

La dégradation proposée (§4.3, code après le bullet 3) est écrite ainsi :

```ts
if (open.hidden.length) shown.push(...open.hidden.map((id) => `OPEN: ${id} [open] — résumé tronqué, lire via task-contract(edit)`))
```

Cette ligne est poussée dans `shown` **après** la boucle budgétaire, donc **hors de tout budget**. Aucun plafond, aucune limite de nombre, aucune condition de sortie. Or la ligne est plus longue que ce qu'annonce la proposition :

- littéral `"OPEN: "` = 6 caractères, `" [open] — résumé tronqué, lire via task-contract(edit)"` = 43 caractères, plus `id`. Total = **49 + len(id)**, pas « ~40 caractères » (§4.3 ligne 254). Avec des ids du type `SEC-001` (`tool/goal-contract.ts:603` construit les findings, `goal-evidence.ts:19-30` normalise les ids en majuscules), une ligne ≈ 56 caractères.

La taille du bloc devient donc `lignes_open_complètes + 56 × N_open_dégradés + marqueur`, et la dégradation démarre à 11 findings `open` (budget `OPEN_BUDGET_CHARS = 1 600` / 160 car. par ligne, §4.2). Pour `N_open = 100`, la seule bande dégradée pèse ≈ 5 000 caractères ≈ 1 250 tokens, réinjectés **à chaque tour** par `prompt.ts:2381-2386` — et ce dans une session que `tool/goal-contract.ts:610` interdit de clore. La proposition elle-même admet ce gabarit de session (« une session qui peut en compter des centaines », §5 (i) ligne 295).

En conséquence, la phrase de §4.3 ligne 255-257 — « Un finding `open` disparaît du prompt quand, et seulement quand, il disparaît aussi de l'état persisté » — est **fausse pour l'implémentation proposée** : avec un cap, il disparaît aussi quand il déborde. Et l'invariant que T2 prétend encoder (« la ligne `open` est présente ») ne tient pas non plus au-delà du cap.

Le correctif est borné **avec une constante supplémentaire**, pas sans. C'est un défaut de conception, pas de calibrage.

### Objection 2 — le tableau de coût §6 est faux pour la distribution qui compte, et il n'est pas testable comme écrit

Le tableau §6 (lignes 351-370) compare le pire cas observé à « 2 650 car. ≈ 660 tok » et conclut « +300 car. ≈ +75 tok par tour dans le pire cas observé ». Ce « pire cas » est défini par le nombre total de findings, pas par leur statut. Or la contrainte de `tool/goal-contract.ts:609` (`findings.filter((finding) => finding.status === "open")`) rend la répartition `open` / non-`open` non libre : plus la session est bloquée, plus `N_open` est grand, plus le bloc dépasse le plafond actuel de 660 tok. Aucune ligne du tableau ne donne le coût d'une session où tous les findings sont `open`, qui est précisément la configuration que la découverte de la proposition (un onzième finding invisible) décrit.

Aggravant : T3 (§7, « plafond mesuré ») est défini comme `Token.estimate(formatGoalContext(state))` ≤ `Token.estimate` « du rendu d'aujourd'hui » + 100 tokens. Le rendu « d'aujourd'hui » est le code que le patch remplace : le test ne peut pas s'auto-référencer à une implémentation supprimée sans la dupliquer dans le test, ce qui en fait une copie à maintenir. Et l'assertion `+ 100` est contredite par la projection de la section 6 elle-même (`+300 car. ≈ +75 tok` est dans la tolérance, mais la dégradation non plafonnée §4.3 l'est pas du tout).

### Objection 3 — la distinction modèle / template, décisive, n'est pas traitée là où elle décide

Le résumé est produit par un **modèle** à partir d'un template, et le template n'est appliqué mécaniquement à aucun endroit. Preuve directe : `compaction.ts:55` déclare `SUMMARY_TEMPLATE` comme une consigne, `compaction.ts:196` la concatène dans l'unique chaîne qui part au résumeur, `compaction.ts:655-660` en fait `nextPrompt`, et **rien** dans `compaction.ts` ne post-traite la réponse. La fixture `packages/opencode/test/server/httpapi-exercise/index.ts:1139-1167` le prouve par l'exemple : le faux LLM renvoie une chaîne écrite à la main qui **s'écarte déjà** du gabarit réel — `### Blocked` (ligne 1153) au lieu de `### Blocked & Difficultés` (`compaction.ts:70`), `## Key Decisions` (ligne 1156) au lieu de `## Decisions & Lessons` (`compaction.ts:73`). Le gabarit n'est pas un contrat, c'est une suggestion, et le harnais ne la fait pas respecter.

La proposition **ne nie pas** ce point : son alternative (iv) ligne 311-315 le formule correctement. Mais §3 étape 4 le nie dans le corps du diagnostic, et surtout **§7 n'en tire aucune conséquence pour l'acceptation**. T4 assert le prompt ; il ne peut pas distinguer « le modèle a rempli les deux sections » de « le modèle a écrit `(none)` dans les deux » de « le modèle a ignoré les deux titres », alors que ces trois issues ont des conséquences opposées — dont une explicitement nocive : un `## Findings\n- (none)` dans le résumé ancré contredit `tool/goal-contract.ts:624` et produit exactement la boucle de refus sans cause que la proposition prétend supprimer. Le levier correct est bien d'alimenter le résumeur (§4.1), mais un levier correct sans assertion sur l'effet n'est pas un correctif validé.

### Objection 4 — la priorité `open > residual > out_of_scope > closed` est implémentable, mais le joint entre §4.2 et §4.3 n'existe pas dans le pseudo-code

La réponse à la question 5 est **oui, sans changer de structure** : `GoalFindingStatus` a exactement quatre membres — `export type GoalFindingStatus = "open" | "closed" | "residual" | "out_of_scope"` (`goal-evidence.ts:1`) — donc le `Record<GoalFinding["status"], number>` de §4.3 est exhaustif et compile sans type nouveau. `GoalFinding` est une interface plate (`goal-evidence.ts:4-13`), le tri est un `toSorted` sur un tableau déjà présent, et `toSorted` est **déjà utilisé dans ce fichier** (`compaction.ts:327`, `compaction.ts:329`), donc aucune contrainte de lib/tsconfig.

Mais le pseudo-code de §4.2 déclare `type Sticky = { id: string; text: string }` : ce type ne porte **aucun statut ni aucune priorité**. `renderBudgeted` ne peut donc pas, tel qu'écrit, implémenter l'ordre de §4.3 — c'est le tableau `Sticky[]` qui doit être trié avant l'appel, au site de `stickyGoalContext`. Les deux pseudo-codes sont deux pipelines distincts recollés sans que le point de joint soit spécifié. T2 (§7) teste l'ordre en sortie, ce qui est bien, mais un test qui passe sur une implémentation qui viole le contrat interne du joint ne prouve rien sur la section 4.2.

Défaut secondaire à trancher : l'ordre de tri n'a pas de clé de départ. `toSorted` est stable, donc à statut égal l'ordre d'insertion est conservé — c'est ce dont T2 dépend (« le premier en insertion est `closed` »), mais c'est un accident de la stabilité, pas un invariant écrit. Une réécriture future du tri en `sort` non stable changerait silencieusement **quels** findings sont coupés au seuil.

### Objection 5 — la liste de régression §6 est incomplète sur trois fichiers réels

Voir la ligne « le correctif ne casse pas un comportement existant » du tableau. En résumé, `test/session/context-budget.test.ts:294/414/415/450/451` est une surface de casse réelle et non couverte : le bloc sticky est à l'intérieur de `<task-contract>` (`compaction.ts:124`), ce fichier segmente et plafonne ce bloc, et il n'est ni listé en §6 ni inclus dans la commande globale §7 ligne 444. `src/eval/eval.test.ts:914` et `src/eval/scenario.ts:90` forment un troisième consommateur du préfixe `UNVERIFIED:` que la recherche §6 ligne 344-346 n'a pas atteint (elle ne cherchait que `Constraints & Preferences|## Relevant Files|SUMMARY_TEMPLATE`). Conclusion « le rayon de casse est donc fermé et connu » (§6 ligne 345) n'est pas démontrée.

Point secondaire, dans le sens favorable : la fixture `httpapi-exercise/index.ts:1139-1167` n'assert rien sur `SUMMARY_TEMPLATE` (elle passe par `ctx.llmText`, ligne 1168), donc la mise à jour proposée est cosmétique et sans risque — mais la motivation donnée (« pour que la fixture reste un exemple fidèle ») est fausse : elle n'est déjà plus fidèle, §3 objection 3.

## Required changes

1. **Borner la dégradation `open` dans §4.3.** Ajouter une constante `OPEN_OVERFLOW_MAX_LINES` (proposition : 25) et plafonner la bande dégradée à ce nombre de lignes. Au-delà, émettre obligatoirement le marqueur avec le **nombre exact** d'`open` non affichés et l'instruction `task-contract(edit)` — donc corriger l'invariant de §4.3 ligne 255-257 en « jamais tronqué *silencieusement* : tout finding `open` non affiché est nommé par son id dans le marqueur, et le décompte exact est toujours présent ». C'est cohérent avec ce que la proposition accepte déjà pour les ids non-`open` (`ids.slice(0, 6)`, §4.2 ligne 226) mais qui n'était pas étendu aux `open`.

2. **Ajouter un test d'effet, pas seulement de prompt.** T4 doit être complété par un test qui observe le **résumé** : faire répondre le stub LLM de `test/session/compaction.test.ts` par un résumé contenant `## DoD (unmet)` et `## Findings` (extrait de la même fixture `captured` que 1725-1729), puis asserter que ce texte **entre dans le transcript filtré** après `SessionCompaction.use.process` — c'est-à-dire que la donnée survit à la compaction, ce qui est l'objectif. Sans ce test, l'item DoD central de P06 reste sans preuve.

3. **Rendre T3 auto-suffisant.** Remplacer « le rendu d'aujourd'hui » par un plafond chiffré absolu et gelé dans le test, dérivé du plafond actuel : `Token.estimate(formatGoalContext(state45open)) <= Token.estimate("x".repeat(3_000))`, soit 750 tokens. Le test ne doit référencer aucune implémentation qu'il est censé valider.

4. **Compléter la liste de régression de §6 et la commande globale de §7.** Ajouter `test/session/context-budget.test.ts` à la commande ligne 444 et documenter pourquoi `context-budget.test.ts:294` est une surface touchée (le bloc sticky est dans le segment `taskContract`, donc dans `stats.systemTotal`). Nommer `src/eval/eval.test.ts:914` et `src/eval/scenario.ts:90` comme consommateurs du préfixe `UNVERIFIED:`. Formuler §6 ligne 345 sur la recherche réellement élargie faite, pas sur une recherche de trois littéraux de titre.

5. **Spécifier le joint §4.2 / §4.3.** Donner à `Sticky` un champ de priorité (ou déclarer explicitement que `renderBudgeted` reçoit une liste **pré-triée** et que cette pré-condition est un invariant testé). Ajouter une clé de départ au tri (p. ex. `firstSeenAt` puis `id`) pour que T2 encode une règle et non la stabilité accidentelle de `toSorted`.

6. **Corriger §3 étape 4 et le titre de la preuve (3).** Remplacer « ils n'ont pas de case » par le constat exact et vérifié : `SUMMARY_TEMPLATE` est une consigne à un modèle, aucune section n'est structurellement garantie, et le risque réel est le `(none)` affirmatif que l'alternative (iv) identifie déjà. Corriger le chemin de §2 ligne 50 en `packages/opencode/src/tool/goal-contract.ts:609-628`. Requalifier l'effort §8 : `S` uniquement si l'accès à `GoalState` dans `processCompaction` existe déjà ; sinon `M` et hors périmètre du patch mono-fichier revendiqué en §4.

## Implementation guidance

Ordre de patches : (1) bornage de §4.3 + constante, (2) joint de tri §4.2/§4.3 et clé de départ, (3) T1/T2/T3 réécrits dans `packages/opencode/src/session/goal-context.test.ts` (fichier existant, `formatGoalContext` déjà importé ligne 2 — ne pas l'agrandir, la surface d'export n'a pas besoin de bouger), (4) seulement ensuite §4.1 : le `formatGoalContext` est déjà importable sans travail supplémentaire puisque `buildPrompt` et `formatGoalContext` sont dans le **même fichier**, `compaction.ts` — le seul vrai inconnu est l'origine runtime de `GoalState`, à trancher avant d'écrire la ligne. Piège connu : le site d'appel est `compaction.ts:655-660` et non `buildPrompt` directement — `compacting.prompt ?? buildPrompt(...)`, où `compacting` vient de `plugin.trigger("experimental.session.compacting", ...)` (`compaction.ts:584-585`) ; toute voie plugin qui force `compacting.prompt` contourne silencieusement l'injection du contrat, donc le test d'effet doit passer par le stub par défaut de `test/session/compaction.test.ts` et non par une surcharge de plugin. Ne pas eagerly exporter `stickyGoalContext` (§4.5) : les tests passent par `formatGoalContext` (`compaction.ts:112`), ce qui préserve la surface du module.
