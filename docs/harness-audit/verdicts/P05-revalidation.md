# P05 — revalidation indépendante (vague 4)

Révalidateur n'ayant rédigé ni la proposition initiale, ni le verdict, ni la révision.
Aucun fichier sous `packages/**` n'a été modifié ; la proposition n'a pas été éditée ;
aucune commande `git`. Seule écriture : le présent fichier, plus une sonde de mesure
hors dépôt (`%TEMP%\opencodev2\p05-probe.ts`) et son log.

## Proposal

`docs/harness-audit/proposals/P05-dod-duplicated.md` — 532 lignes, version révisée.
Bandeau `:3` « Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — gain mesuré en −35
caractères, argumentation d'impact supprimée (C-02) ». Neuf sections aux `:5` / `:15` /
`:180` / `:208` / `:316` / `:337` / `:393` / `:482` / `:488`.

## Revisions applied

Les six `Required changes` du verdict (`:185-209`) sont **traités**, chacun avec citation
du code qui le prouve.

| Required change | traitement | preuve |
|---|---|---|
| 1 — gain annoncé faux (Obj. 1) | l'argument d'impact est supprimé, pas adouci | `:12-13` « Ce n'est pas un problème d'économie de tokens, et cette proposition n'argumentera pas d'économie de tokens » ; `:163-165` formule ; `:167-168` « Aucun chiffre d'économie de tokens n'est donc annoncé » ; `:357-359` « Aucune économie de tokens n'est revendiquée » |
| 2 — test non discriminant (Obj. 2) | assertion de forme retenue, variante du verdict rejetée **par la mesure** | `:420` `expect(text.match(/^- mandatory requirement: /gm) ?? []).toHaveLength(0)` ; `:462-468` motif du rejet de `toBeLessThan(200)` |
| 3 — garde interrogeant le mauvais tableau (Obj. 3) | option « hors périmètre » choisie, avec les citations exigées | `:276` « Lot 2 — hors périmètre de P05, documenté explicitement » ; R2 `:510` cite `prompt.ts:2244` / `:2386` / `:2526` |
| 4 — défense 1 trop affirmative (Obj. 4) | reformulation + arbitrage rendu | `:367-372` « Aucune information de *contenu* n'est perdue… La forme énumérée par item, elle, disparaît » ; `:498-503` arbitrage « the N DoD item(s) » justifié par le décompte illisible ailleurs |
| 5 — citation imprécise `:145` (Obj. 5) | énoncé d'origine retiré, citation remise à ce qu'elle assert | `:146` « Ce qui reste réellement variable dans l'advisory, mesuré » ; `:524` « l'assertion sur la taille a été retirée du §7 » |
| 6 — priorité réelle non tirée (Obj. 6) | priorisation explicite écrite | `:525` inerte par défaut (`runtime-flags.ts:4`, `:55-56`), ne ferme aucun gate, à prioriser **après P03** (`README.md:25`) et **P04** (`README.md:26`) |

### C-02 — vérification indépendante du cœur (le point demandé)

**`348 → 383` est exact, et le signe est correct : 383 > 348.** La révision n'a pas inversé
la conclusion ; l'argument d'impact est bien mort, et le propos porte sur la fidélité seule.

Mesuré par import de la **fonction réelle** `buildRiskAdvisory`
(`packages/opencode/src/session/lean-advisory.ts:20-32`) et transcription verbatim de la
version §4 (`proposals/P05-dod-duplicated.md:230-243`) :

```
bun run %TEMP%\opencodev2\p05-probe.ts   →  PROBE_EXIT=0
sentinel  S=35 n=2 → current_len=348  proposed_len=383  raw_delta_proposed_minus_current=+35
series    n=1,2,3 (items de 1 char) → 288 / 315 / 342   (relevé affiné : L = 261 + 26n + S)
proposé                                    → 383 constant
long5     S=261 n=5 → current 652 → proposed 383, gain 269 = 261 + 26·5 − 122  ✓
lenB=110  lenC=117  ref_line_len_n1=121  ref_line_len_n2=121   (concordent avec `:156`)
```

La formule annoncée est donc **juste** : `gain = (S + 26n + 19m + F) − (383 + 19m + F) =
S + 26n − 122`. Deux contrôles indépendants la confirment — (a) sur le cas prescrit,
`35 + 52 − 122 = −35`, ce qui est exactement le delta mesuré ; (b) sur mon propre cas
5 DoD longs (S=261), la formule prédit `269` et la mesure donne `269`. La mention
`gain = S + 26n − 122` de `:164` est **exacte**, et le tableau `:152-155` est reproductible
(pour `c4`, la formule donne `408 + 130 − 122 = +416`, la valeur annoncée).

Aucune citation de la révision n'est fausse sur ce point. Une réserve mineure, sans effet :
`:163` omet les termes `+19m + F` (longueur des findings sticky) ; la formule est donc
restée valable pour `m = 0`, ce qui est le cas du test prescrit, et l'exclusion est
silencieuse. **Non bloquant** — l'invariant tient pour toute valeur de `m` par construction.

### Les 6 assertions discriminent-elles ?

**Oui, les six.** Mesurées sur la fonction réelle avant et après :

| assertion | AVANT (348) | APRÈS (383) | discrimine |
|---|---|---|---|
| `not.toContain("DOD_SENTINEL_ALPHA")` | FAIL | PASS | oui |
| `not.toContain("DOD_SENTINEL_BETA")` | FAIL | PASS | oui |
| `toHaveLength(0)` sur `/^- mandatory requirement: /gm` | FAIL | PASS | oui |
| `toContain("<task-contract>")` | FAIL | PASS | oui |
| `toContain("2 DoD item(s)")` | FAIL | PASS | oui |
| `toContain("its own verifiable proof")` | FAIL | PASS | oui |

Les deux gardes `SEC-001 HIGH OPEN` et `dod: [] → ""` passent **dans les deux mondes**,
comme le déclare `:455-460` : ce sont des gardes d'invariant, pas des preuves (règle
`C-20` respectée — aucune assertion du fichier ne passe dans les deux mondes en étant
candidate à la preuve du défaut).

Et le rejet de la variante du verdict est **justifié par la mesure**, pas par préférence :
`toBeLessThan(200)` → `before_pass=false, after_pass=false` (383), donc inutilisable ;
`toBeLessThan(400)` → vraie avant (348) *et* après (383), donc non discriminante. La
révision a fait mieux que le verdict : sur les deux variantes que celui-ci proposait, une
était fausse, et elle a gardé la seule correcte en la prouvant.

### Base rouge et base opposable

`wave4-baseline.md` **existe** et les chiffres annoncés sont exacts. Il est sous
`%TEMP%\opencodev2\`, pas sous `docs/` — la proposition le cite correctement au chemin
temp (`:396`), donc aucune citation fausse. `:11-20` = 10 lignes de suite, `:22` = « 10
suites, 4 rouges (shell, compaction, read, task), 6 vertes, 39 tests en échec ». `:11` =
shell 63 pass / 32 fail / 1 error, conforme.

**Aucun critère du §7 ne dépend de `test/tool/shell.test.ts`.** `grep "shell.test"` sur la
proposition = **1 seul résultat**, `:397`, à l'intérieur de la *description* de la baseline —
c'est un fait de contexte, pas un critère. Les trois critères du §7 sont : le fichier neuf
`:402-437`, puis `:470-480` sur trois suites nommées (`src/session/lean-advisory.test.ts`,
`test/session/context-budget.test.ts`, `test/session/prompt.test.ts`) avec critère d'**écart
nul**, et l'affirmation `:399-400` « Aucun critère de cette proposition ne consiste en « la
suite passe » » est donc **exacte**. La suite instable n'est jamais opposée.

La base `C-47` est vérifiée et saine : `bun test test/shell/shell.test.ts` →
**12 pass / 0 fail / 26 expect() calls, `SHELL_TEST_EXIT=0`** (4,49 s). Elle est de toute
façon étrangère à P05, qui ne touche ni `shell.ts` ni les permissions.

## Status

`PASS_WITH_CHANGES` (vague 4). Les six Required changes sont traités, le cœur chiffré est
reproduit exactement, aucune régression verte, et deux points non bloquants sont ajoutés
(N1, N2). Aucun résidu `open` : le Lot 1 est implémentable.

## Remaining objections

| id | objection | statut |
|---|---|---|
| R1 | La forme énumérée par item disparaît ; ni le nombre d'items ni leur frontière ne restent lisibles dans le porteur canonique sans segmenter `goal-state.ts:79` sur `\|` | `accepted` — inhérent à l'objectif (ne plus produire deux rendus du même objet). Vérifié : `goal-state.ts:76-79` joint bien par `\|`, `:87` émet `DOD: ${dod}` ; l'instruction par item survit à `prompt.ts:2468` (« A required DoD item with no verifiable evidence leaves the objective open ») et le décompte survit par le renvoi. Perte réelle et assumée |
| R2 | La garde `prompt.ts:2381` teste `system` au lieu de `volatile` ; clause morte, et un `AGENTS.md` mentionnant `<task-contract` supprimerait l'injection du contrat réel. Même défaut en `:2452` | `out_of_scope` — porte sur `prompt.ts`, donc sur le seul Lot 2. Signalé avec les citations exigées par la Required change 3. **Ne bloque pas le Lot 1**, qui ne modifie aucune ligne de `prompt.ts` |
| R3 | `INFERE:` aucun `volatile.push` avant `prompt.ts:2381`, donc Lot 2 = no-op. Non vérifié (`grep` en `EPERM` chez l'agent) | `out_of_scope` — **la prémisse est en outre fausse, voir N2**. Porte sur le seul Lot 2 |
| R4 | Aucune clé de configuration `experimental.risk_planner_advisory` / `qa_proof_advisory`, contrairement à `README.md:27` | `out_of_scope` — nouvelle surface de configuration, à router dans une proposition séparée (C-03). Sans effet sur le contenu de l'advisory |
| R5 | Paramètre `hasContract` pour n'émettre le renvoi que si le contrat est présent | `out_of_scope` — branche prouvablement inatteignable (`goal-state.ts:47` `TERMINAL_STATUSES` ∋ `skipped` → `prompt.ts:2451` `goalActive` → la garde `:2381` est toujours franchie). À réactiver si `TERMINAL_STATUSES` ou la garde changent |
| R6 | Base de tests rouge par construction : 4 suites, 39 échecs | `accepted` — antérieur et indépendant de P05 (C-07). Baseline vérifiée (ci-dessus) ; les critères sont des écarts nuls |
| **N1** (nouveau) | Le critère `:474-476` exige « aucune nouvelle assertion en échec **par rapport à la baseline** » pour `test/session/context-budget.test.ts` et `test/session/prompt.test.ts` — or **aucune de ces deux suites n'a de ligne dans `wave4-baseline.md:11-20`** (les 10 lignes sont shell, repetition, working-state-goal-dod, lean-advisory, retry, overflow, compaction, read, task, inspect-batch). « L'écart nul » y est donc **indéfini** : le critère, tel qu'écrit, n'est pas calculable pour 2 des 3 suites nommées | `accepted` — réserve traçable, non bloquante. Fermable en une mesure avant patch : relever le compte de ces deux suites une fois. Le risque réel est nul : les seules assertions que Lot 1 pourrait déplacer sont **bornes supérieures** (`context-budget.test.ts:414` `toBeLessThan(20000)` et `:450` `toBeLessThan(60000)`, relues au caractère près), et `prompt.test.ts:910` compte `<task-contract` que Lot 1 ne touche pas |
| **N2** (nouveau) | **Le prémisse de R3 est fausse.** `grep "volatile.push"` sur `prompt.ts` donne **7 sites** : `:2299` (`if (plan) volatile.push(plan)`), `:2306` (`if (holdings) volatile.push(holdings)`), `:2386`, `:2422`, `:2444`, `:2476`, `:2525`. Il y a donc **deux `volatile.push` avant `:2381`**. Corriger la garde pour tester `volatile` (Lot 2) introduit des entrées que `system` ne voyait pas : ce n'est plus un no-op démontrable, c'est un changement de comportement à tester | `out_of_scope` — porte sur le seul Lot 2, et **renforce** la décision de la révision de le sortir du périmètre : le Lot 2 exige de vrais tests, pas une ligne neutre. Ne bloque pas le Lot 1, qui ne touche pas `prompt.ts`. Je ne lève pas R3 moi-même (C-36 : le juge constate, il n'édite pas) |

Statut final des six objections du verdict (`:520-525`) : les six sont `accepted`, et je
concorde avec ce classement. Aucune n'est **`refused`** : l'objection 2 contenait une
variante d'assertion fausse, mais la révision ne l'a pas reprise à son compte, elle l'a
remplacée — il n'y a donc rien à refuser.

## Regressions introduced

**Aucun test vert n'est cassé par le Lot 1.** Preuves :

1. **Aucun test n'assert l'énumération.** `grep "mandatory requirement"` sur
   `packages/opencode` → **1 seul résultat** : `lean-advisory.ts:21`, la ligne source
   elle-même. **Zéro** fichier de test. La seule occurrence à supprimer est donc bien
   unique.
2. `src/session/lean-advisory.test.ts:20-28` (mesuré `3 pass / 0 fail`, donné à l'état)
   n'asserte que `SEC-001 HIGH OPEN`, `advisory only` et l'absence de `score`. Les trois
   survivent : `SEC-001` est préservé par la ligne `- sticky finding: …`, et `advisory only`
   / l'absence de `score` sont dans les deux phrases conservées **mot pour mot**
   (`lean-advisory.ts:26` et `:29`).
3. Les seules assertions de taille que Lot 1 pourrait déplacer sont des **bornes
   supérieures** : `context-budget.test.ts:414` `expect(stats.systemTotal).toBeLessThan(20000)`
   et `:450` `expect(stats.systemTotal).toBeLessThan(60000)`. Lot 1 **augmente** le bloc
   (`+35` sur le cas prescrit, `+269` sur mon cas 5 DoD longs), donc il ne peut que les
   rapprocher du seuil.
4. `prompt.test.ts:910` `system.match(/<task-contract/g)` et `:1193` comptent le contrat,
   que Lot 1 ne touche pas ; l'ordre des blocs reste `<task-contract>` avant
   `<goal_reminder>`, ce qui préserve le découpage `context-budget.test.ts:294-295`.
5. `working-state-runtime.test.ts` lit le `<task-contract>`, également intact.

Les deux tests de la base mesurés ce jour sont verts et le resteront :
`src/session/lean-advisory.test.ts` → 3 pass / 0 fail ; `test/shell/shell.test.ts` → 12 pass
/ 0 fail. **Aucun test déjà rouge ne s'aggrave** : Lot 1 ne touche que `lean-advisory.ts`,
hors du périmètre des 4 suites rouges de la baseline.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Implémentable : aucun résidu `open`, et la section ci-dessus déclare explicitement qu'aucun
test vert n'est cassé (règle 1 du gabarit). Le « WITH_CHANGES » ne tient qu'à **N1** :
avant le patch, relever le compte de `test/session/context-budget.test.ts` et
`test/session/prompt.test.ts`, faute de quoi le critère d'écart nul de `:474-476` est
inapplicable. **Lot 1 seulement** — le Lot 2 reste non implémentable tant que N2/R3 n'ont
pas été instruits.

## Grille d'effort (vague 4)

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| **Lot 1** — suppression de l'énumération, renvoi portant le décompte | `S` — 13 lignes, 1 fichier | `packages/opencode/src/session/lean-advisory.ts` (l. 20-32) | `packages/opencode/test/session/lean-advisory-dod-fidelity.test.ts` (neuf, 3 tests / 6 assertions) | `aucun` — relire `src/session/lean-advisory.test.ts` (3/0 ; n'asserte pas l'énumération) et `test/session/context-budget.test.ts` (bornes `:414` / `:450`) |
| **N1** — établir le compte pré-patch des 2 suites sans ligne de baseline | `S` — une mesure | aucun | aucun | `aucun` — mesure seulement ; conditionne la validité du critère `:474-476` |
| **Lot 2 / R2** — garde `system` → `volatile` (`:2381`, `:2452`) | `M` — 2 lignes + tests | `packages/opencode/src/session/prompt.ts` | tests propres au lot 2 (**nécessaires**, cf. N2) | `test/session/context-budget.test.ts` — relire le découpage des sections `:294-295` |
| **Lot 2 / N2+R3** — précondition : instruire les 7 sites `volatile.push` | `S` — une recherche | aucun | aucun | `aucun` — résultat déjà relevé ici (`:2299`, `:2306` avant `:2381`) |
| **R1** — perte de la forme énumérée | aucun | aucun | aucun | `aucun` — risque assumé, tracé |
| **R4** — clé de configuration manquante | `M` | config / `runtime-flags.ts` | à définir | proposition séparée (C-03) |
| **R5** — paramètre `hasContract` | aucun | aucun | aucun | `aucun` — branche prouvablement inatteignable |
| **R6** — base de tests rouge préexistante | aucun | aucun | aucun | `aucun` — 4 suites rouges, 39 échecs, antérieur à P05 |