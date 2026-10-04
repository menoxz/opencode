# Revalidation P07

## Proposal

`P07` — Contrat des sous-agents : schéma laxiste, contexte non hérité, budget de tokens absent, cwd implicite.
Fichier revalidé : `docs/harness-audit/proposals/P07-subagent-contract.md`, **638 lignes** (réécrit, avec
bandeau de révision et §2(f) « MESURE TERRAIN »).

Je suis le revalidateur indépendant : je n'ai rédigé ni la proposition initiale, ni
`docs/harness-audit/verdicts/P07-verdict.md`, ni cette révision. Je n'ai réutilisé aucune de leurs
conclusions ; **toutes les citations de ce document ont été rouvertes par lecture directe**, y compris
les 28 que le verdict d'origine déclarait exactes, et y compris `task.ts:170-300` que personne n'avait
ouverte.

État de mesure produit par cette revalidation (shell autorisé, règle 7 satisfaite) :

| mesure | commande | résultat |
|---|---|---|
| typecheck | `bun typecheck` (workdir `packages/opencode`) | **`TYPECHECK_EXIT=0`**, log `%TEMP%\opencodev2\p07-typecheck.log` |
| suite de référence | `bun test test/tool/task.test.ts` | **`TASK_TEST_EXIT=0`** — `34 pass / 0 fail / 126 expect() calls / 34 tests, 29.59 s`, bun `v1.4.2`, log `%TEMP%\opencodev2\p07-task-test.log` |
| forme de `Schema.Union` | `bun -e '… Schema.Union(A, B) …'` | `arity=2` / **`VARIADIC_FAIL TypeError: members.map is not a function. (In 'members.map(getAST)', 'members.map' is undefined)`** / **`ARRAY_OK`** |
| fichiers de test annoncés | glob `**/task-{timeout,parameters-union,context-ref,directory}.test.ts` | **No files found** |

**Écart avec l'état de mesure transmis, signalé** : le brief annonçait `test/tool/task.test.ts` en
exit 1 / 34 pass / 1 fail sur le hook `afterEach` (5000 ms). Mon exécution donne **exit 0, 34/0**, une
seule fois. Je n'ai pas de base pour dire laquelle des deux est la règle — une seule répétition ne
distingue pas « instable » de « vert ce jour-là ». Conséquence pratique : **je ne fonde aucun verdict sur
le statut de cette suite**, et je ne peux pas la déclarer inutilisable. La base opposable pour la
vague 4 est `test/shell/shell.test.ts` (C-47), pas celle-ci.

## Revisions applied

Traitement point par point des 6 `Required changes` du verdict d'origine.

| # | Required change | traitement constaté | statut |
|---|---|---|---|
| 1 | retirer la causalité « 84× ← échec de validation » | **Fait, et au-delà du demandé** : `proposal:274-281` porte une « Correction explicite d'une affirmation antérieure », qualifie le surcoût par enfant de **structurel** et **retire l'argument de coût de la justification de (a)** ; `:538-545` (« chiffreverse ») fait de même dans §6 | `RÉSOLU` |
| 2 | joindre la requête d'audit reproductible | **Traité par la transparence, pas par la reproductibilité** : `proposal:140-158` et `:249-261` donnent la requête (join `session c JOIN session p ON p.id = c.parent_id` sur `~/.local/share/opencode/opencode.db`) **et** avouent que les comptages divergent (1 915 contre 3 229 ; 54 contre 56 ; 51 contre 65) en avouant ne pas savoir pourquoi (`:258-260`). La conclusion économique demandée est retirée | `RÉSOLU quant au fond` / `résidu assumé` → voir **R4** |
| 3 | rendre T3 discriminant | **NON TRAITÉ.** `proposal:581-587` reproduit mot pour mot le scénario non discriminant : « `timeout_minutes: 1` **sur un agent dont `budget_minutes` vaut 1`** ». L'instance discriminante demandée (agent sans `budget_minutes`, `OPENCODE_TASK_BUDGET_MINUTES` non défini) n'apparaît nulle part dans le fichier | **`open`** → **R2** |
| 4 | réécrire (a) en `Schema.Union([LaunchParameters, FollowUpParameters])` + base nommée + garde conservé | **NON TRAITÉ, et aggravé.** `proposal:347` écrit toujours `export const Parameters = Schema.Union(LaunchParameters, FollowUpParameters)` (forme variadique) ; `proposal:341` reproduit la circularité `{ ...Parameters.fields, … }` ; `proposal:350` **ajoute** « supprimer le `Schema.decodeUnknownEffect(LaunchParameters)` de task.ts:391-399, devenu redondant ». Le §4(a) ne mentionne ni `BaseFields` ni la garde de décodage | **`open`** → **R1** |
| 5 | T5 doit asserter le cwd effectif d'un tool-call ; conditionner (d) à la preuve que le cwd vient de la colonne `directory` | **NON TRAITÉ, et la prémisse est fausse.** `proposal:596-601` : « `child.directory === parent.directory`, et un appelant de `Session.create` sans `directory` continue d'obtenir `ctx.directory` » — c'est bien une égalité de **colonnes**, exactement ce que le verdict demandait de proscrire. Rien dans le §4 ne conditionne (d) à la preuve du cwd effectif | **`open`** → **R3** |
| 6 | corriger `session.ts:942-943` → `936-937` ; vérifier ou supprimer `task.ts:236` | **La correction n'a pas été faite** (voir R5). `task.ts:236` en revanche **tient** à la lecture (voir R6) | `partiel` → **R5** |

Ce que la révision a ajouté et qui est **juste** (à créditer, sans réserve) :

- `proposal:140-158` : la mesure SQL qui **infirme en grande partie (d)** — 1 910/1 915 enfants ont le
  même `directory` que leur parent ; les 5 divergences (4 sur `…\auxiflow-frontend`, 1 fuite
  inter-projets `intellectLLM` → `DIGITALISATION_RESTAURANT`) sont réelles. C'est le seul apport
  réellement neuf du cycle, et il va **contre** l'intérêt du correctif (d).
- `proposal:358-367` : `Parameters.fields` n'a **qu'un** consommateur dans tout le dépôt, `task.ts:84`
  lui-même — donc l'objection « les consommateurs cassent » du §6 `:533` est **affaiblie à juste titre**
  (mais l'objection `Schema.Union` de la vague 2, elle, est de nature différente : voir R1).
- `proposal:266-272` : les 121 lancements vides coûtent **0,1199 $ au total**, dont **0,0000 $** pour
  les 54 à `input = 0`. Ce chiffre **affaiblit** la thèse du dossier, et la révision le conserve.

### Le fond confirmé, revérifié indépendamment

Le chemin de retour enfant → parent est **complet et exact** tel que redécrit :

```
child.runTask()                            task.ts:531-553
  └─ ops.prompt({ sessionID: child })       task.ts:534-548  (agent: next.name :541 ; outils réduits :542-546)
       └─ text = result.parts.findLast(...) task.ts:549       ← un seul bloc, le dernier
       └─ persistEvidence(stepLimit?…)      task.ts:485-521   (packet depuis le goalState de l'ENFANT :492-502)
            └─ fusion parent                task.ts:506-517   → if (!current.goalState || packet.findings.length === 0) return (:506)
                                                              → setGoalState({ ...goalState, findings }) :509-517
  retour foreground : output(...)           task.ts:722-726 → task.ts:94-108
  retour background : inject(...)           task.ts:559-590 → metadata.evidence_packet :579, noReply: true (:574)
```

La DoD **ne revient pas** structurée, vérifié à la ligne :

- `task-evidence.ts:39-43` : `allTests` est construit depuis `input.goalState?.completion?.evidence`, chaque
  item étant réduit à `{ command, outcome: "passed", summary }` ;
- il est écrit dans le packet (`task-evidence.ts:62`) puis transporté par
  `metadata.evidencePacket` (`task.ts:724`, foreground) et `metadata.evidence_packet` (`task.ts:579`, background) ;
- le seul `setGoalState` du fichier est `task.ts:509-517`, et il n'écrit que `findings` (`:513`) ;
- le texte rendu au parent (`task.ts:94-108`) n'émet que `<task id=… state="completed">`, `<task_result>`,
  et — si le fingerprint existe — `evidence_packet` avec `id`, `workspace_fingerprint`, `fresh` (`:102-103`).
  **`tests`, `residuals` et `summary` n'y figurent pas.**

Verdict : `## 2(e)` de la proposition est la section la mieux prouvée du dossier, et je la confirme à
l'identique. **C-17 (causalité du ratio 84×) est définitivement close** dans le texte révisé.

## Status

`REVALIDATED-PASS_WITH_CHANGES` — **non implémentable en l'état** : trois résidus `open`
(R1, R2, R3), dont deux sont des `Required changes` de la vague 2 laissés **intacts**.

État par `Required change` : 2 résolus, 1 partiellement résolu (avec un résidu assumé), **3 intacts**.

Le motif est **systémique et déjà nommé** : `CORRECTIONS.md` **C-21** (« deux agents écrivant le même
fichier donnent un artefact dont ni le contenu ni le marqueur ne sont fiables ») et **C-31** (« le
décompte "fichier présent" ne prouve jamais la conformité ») s'appliquent littéralement ici. Les
marqueurs de révision sont présents (`> Révisé après verdict` en tête, §2(f), « Correction explicite
d'une affirmation antérieure ») **et** le bloc des `Required changes` 3, 4 et 5 est resté à l'identique
du verdict d'origine. Le fichier a été retraité sans que les trois corrections qui demandaient une
**réécriture de patch** aient été réécrites. Je le constats comme un fait, sans en attribuer la cause.

## Remaining objections

Chaque ligne porte son statut en tête (règle 4 du gabarit ; sans statut = `open`).

---

**`open` — R1 — Le §4(a) est resté exactement dans la forme que la vague 2 a déclarée inapplicable, et
la révision y a ajouté la suppression de la garde de décodage.**

Preuve directe de la forme variadique, exécutée :
`bun -e 'Schema.Union(Schema.Struct({x: Schema.String}), Schema.Struct({y: Schema.String}))'`
→ **`TypeError: members.map is not a function. (In 'members.map(getAST)', 'members.map' is undefined)`** ;
la forme tableau `Schema.Union([A, B])` → `ARRAY_OK` ; `Schema.Union.length === 2`.

Conséquences, les deux ouvertes :

1. `proposal:347` **lève une exception au chargement du module**, pas seulement au typecheck. Le
   `TASK_TEST_EXIT=0` actuel (que la forme variadique romprait) est donc une preuve directe du risque.
2. `proposal:350` — « supprimer le `Schema.decodeUnknownEffect(LaunchParameters)` de task.ts:391-399,
   devenu redondant » — supprime **le seul producteur de `Tool.InvalidArgumentsError`** portant le message
   nommé `"Launch/resume requires description, prompt, and subagent_type strings"` (`task.ts:394-397`).
   Le verdict d'origine avait écrit l'inverse de cette consigne (« conserver `LaunchParameters` pour le
   garde de décodage … plutôt que de le supprimer »). La proposition ne fournit aucun relevé des tests
   qui pinnent ce message.

**`open` — R2 — C-20 : T3 est identique, au caractère près, au test non discriminant ; et le défaut de
structure se réplique sur les tests du §7.**

`proposal:581-587` (T3) reproduit l'agent « dont `budget_minutes` vaut 1 ». Trace de non-discrimination,
lue ligne à ligne :

- **avant correctif** : `task.ts:694` `const minutes = next.budgetMinutes ?? taskBudgetMinutes()` →
  `next.budgetMinutes === 1` → `minutes = 1` → `withBudget(runTask(), 1)` → `Effect.timeoutOption` (`:127`)
  → `Option.isNone(result)` → `:699-707` → `metadata.outcome === "partial"`, `metadata.reason === "wall_clock"` (:705),
  `budgetOutput(…, 1, …)` dont le texte porte `state="budget_exceeded"` (:132) ✔
- **après correctif** (`next.budgetMinutes ?? params.timeout_minutes ?? taskBudgetMinutes()`) → `1 ?? …`
  court-circuite → `minutes = 1` → **strictement le même chemin** ✔

Les trois assertions de T3 (`outcome`, `reason`, verrou libéré) sont donc vraies **dans les deux mondes**.
Aucune trace ne distingue « `timeout_minutes` est câblé » de « le plafond mural préexistant fonctionne ».
Le scénario discriminant exigé par la vague 2 — agent **sans** `budget_minutes` et
`OPENCODE_TASK_BUDGET_MINUTES` non défini (d'où `taskBudgetMinutes()` → `undefined` par `:119-122`,
`:125-126` `Effect.map(Option.some)`, aucun timeout) — **n'apparaît nulle part dans les 638 lignes**.
**C-20 est donc intact.**

**`open` — R3 — Le §2(d) conclut que le cwd de l'enfant vient de la ligne de session, alors que le
verdict l'a infirmé ; et T5 mesure exactement ce que le verdict avait interdit de mesurer.**

- `proposal:306-308` : « `sessions.create` (task.ts:451-467) crée l'enfant sans `directory`. Comme
  `Session.create` recopie `InstanceState.context.directory` (session.ts:682), **l'enfant travaille dans
  le répertoire du processus**, pas nécessairement celui du parent. »
- `proposal:421-445` : « (d) … l'enfant travaille dans le répertoire du parent au lieu de celui du
  processus », sans condition.
- Or la ligne lue à `session.ts:936-937` et `942-943` est un **filtre de requête**
  (`or(...conds, and(isNull(SessionTable.path), eq(SessionTable.directory, input.directory)))`), et le
  verdict a établi que les outils résolvent leur `cwd` depuis le **contexte d'instance**
  (`prompt.ts:731`, `system.ts:103`, `prompt.ts:979`). Un enfant créé dans la même instance partage
  donc `ctx.directory` : passer `directory: parent.directory` ne changerait **qu'une colonne**, sans
  effet observable sur les outils.
- `proposal:596-601` (T5) ne mesure que `child.directory === parent.directory` : c'est l'égalité de
  colonnes, **exactement** le critère explicitement écarté par la vague 2. T5 passerait donc si le
  correctif (d) était **inerte** — le même défaut de structure que R2.
- Aggravant, mesuré par la révision elle-même : 99,7 % des enfants partagent déjà le `directory` du
  parent (`proposal:143-145`). Le bénéfice de (d) n'est pas établi ; son coût (toucher `Session.create`,
  donc tous ses appelants) est, lui, certain.

**`open` — R4 — La divergence inter-projets observée peut être le symptôme d'un appelant de `create` hors
de `task.ts`, donc hors périmètre de (d).**

`proposal:148-152` identifie un cas réel — parent `C:/jeanluc/intellectLLM`, enfant
`C:/jeanluc/DIGITALISATION_RESTAURANT` — et l'explique par « la valeur propagée vient du contexte de
l'appelant ». Or `Session.create` (`session.ts:670-690`) est aussi appelé par `fork` (`:692-698`) et par
les autres voies de création de session, dont le TUI. Si la fuite vient d'une de ces autres voies, **le
correctif (d) ne la corrige pas** : il ajoute au contraire un second chemin d'écriture de `directory`.
La révision constate la fuite et ne désigne pas la voie qui la produit. Je n'ai pas pu la tracer
(`grep` non exécutable dans ce cadre) : je classe donc le mécanisme **non établi**, pas faux.

**`open` — R5 — Required change 6 n'a pas été appliqué : `session.ts:942-943` est toujours la citation
donnée pour « indexée ».**

Lecture à `session.ts:936-937` :
```
936:         input.directory
937:           ? or(...conds, and(isNull(SessionTable.path), eq(SessionTable.directory, input.directory)))!
```
Lecture à `session.ts:942-943` :
```
942:     if (input.directory) {
943:       conditions.push(eq(SessionTable.directory, input.directory))
```
Les deux emplacements existent et sont bien des **lectures de `input.directory`**. Donc « corriger
`942-943` → `936-937` » n'est pas un décalage de ligne à corriger : c'est le **choix d'un seul des deux
sites**, tous deux citant `input.directory`. Le verdict d'origine n'en a cité qu'un.

Et surtout, l'affirmation que ces citations étayent est **fausse** :

> `proposal:154` — « La colonne est requise et indexée (`session.ts:219`, `session.ts:942-943`), ce qui rend
> la divergence stockable et détectable. »

`packages/opencode/src/session/session.sql.ts` :
- `:35` `directory: text().notNull()` → **« requise » est VRAI** ;
- `:63-68` → `index("session_project_idx").on(table.project_id)`, `index("session_workspace_idx").on(table.workspace_id)`,
  `index("session_parent_idx").on(table.parent_id)` — **trois index, aucun sur `directory`**.

**« indexée » est faux.** `input.directory` est un prédicat de filtre, pas un index ; la requête de
mesure de `proposal:140-146` est un balayage de la table `session`, pas une recherche indexée. Le champ
`session.ts:219` (`directory: Schema.String` dans `Session.Info`) reste exact. La phrase conservée est
donc un fait faux sur le code, et c'est la justification de « aucune migration nécessaire » dans (d).

**`accepted` — R6 — `task.ts:236` : la citation a été recopiée, et elle tient. Je l'ai vérifiée ; je ne la
refuse pas.**

Plage `task.ts:170-300` ouverte par moi-même en deux tranches (`:168-242`, `:243-450`), donc l'angle mort
de C-25 est levé. Contenu réel de la ligne 236 :

```
222: function backgroundMessage(input: {
…
235:   return [
236:     `<task id="${input.sessionID}" state="${input.state}">`,
237:     `<summary>${escapeTaskMarkup(title)}</summary>`,
238:     `<${tag}>`,
239:     escapeTaskMarkup(input.text),
240:     `</${tag}>`,
```

`task.ts:236` **contient littéralement `<task id=…`**. La revendication de `proposal:169`
(« Identifiant de session enfant | `<task id=...>` | task.ts:96, task.ts:236 ») est donc **établie**.
C-25 est close sur ce point : la citation était juste, elle était simplement invérifiée.

Ce que la plage démontre **de plus** que la citation ne dit pas — deux faits nouveaux :

1. **La provenance n'est pas nommée.** `:236` est dans `backgroundMessage` (déclaré `:222-227`), c'est-à-dire
   le texte de la **notification de fond** injectée par `inject` (`task.ts:559-590`, appelé en `:580`) —
   et **pas** le retour foreground du §2(e). Citer `:96` (foreground) et `:236` (background) sur une même
   ligne de tableau sans le dire mélange deux chemins. `réserve assumée et tracée` — la ligne est exacte,
   seule la lecture est élidée.
2. **Le jeu de citations est incomplet, et la section (e) reste juste.** `:185` (`statusOutput`, pour
   `action=check/wait`), `:196` (`statusOutput`) et `:212` (`backgroundOutput`) contiennent la même balise
   `<task id=…>`. Le phénomène est donc **quatre** rendus distincts, pas deux — ce qui **renforce** (e)
   au lieu de l'affaiblir.

**`accepted` — R7 — Le test global de succès §7 (`grep "directory" src/tool/task.ts` ≥ 1 occurrence) est un
critère de forme, pas de comportement.**

`proposal:603-610` : « Critère global de succès : les cinq fichiers passent, et `grep "directory"`
src/tool/task.ts` renvoie au moins une occurrence ». Une occurrence peut être un commentaire, un import,
une chaîne — elle ne prouve ni que `parent.directory` est propagé, ni que l'enfant change de répertoire.
C'est un littéral dans un seul fichier, donc structurellement incapable de distinguer un monde où le
chemin passe par `Session.create` d'un monde où il n'existe pas. **Défaut de structure de la même famille
que C-20**, mais au niveau du critère de succès et non d'un test : réservé et tracé, à remplacer par une
assertion de comportement.

**`accepted` — R8 — Sept des neuf assertions du §7 ne sont pas discriminantes.** Le défaut de structure
cherché par la leçon-structure ne se limite pas à T3 ; il est générique.

| test | assertion proposée | monde avant | monde après | discriminant ? |
|---|---|---|---|---|
| T1 `:564-570` | `{ background: true }` rejeté **par le schéma**, `promptOps.prompt` jamais invoqué | si le test appelle `TaskTool.parameters` (`:743`) et valide, `Schema.Struct` tout-optionnel **accepte** → échoue ✔ ; après Union → rejeté ✔ | **oui** | ✔ |
| T2 `:572-577` | `{ description, prompt, subagent_type }` valide ; `{ task_id:"x" }` **invalide** | `Struct` tout-optionnel accepte `{ task_id:"x" }` → l'assertion « invalide » **échoue** ✔ | Union : invalide ✔ | **oui** |
| T2 | `{ prompt:"p" }` invalide | `Struct` l'accepte → échoue ✔ ; Union : invalide ✔ | | ✔ |
| T3 `:579-587` | `partial` / `wall_clock` / verrou libéré | **PÈSE 1** : `budget_minutes=1` → `minutes=1` → `partial` ✔ | `minutes=1` → `partial` ✔ | **NON** (R2) |
| T3 | « `budget_exceeded` (task.ts:130-146) » | la fonction est `budgetOutput` `:130-146` ✔ | idem | **NON** |
| T4 `:589-594` | `<context_ref>` capturé dans `resolvePromptParts`, `&` → `&amp;` | `resolvePromptParts` (`task.ts:533`) est appelé sur `params.prompt + contract` — **jamais sur un `context_ref`**, qui n'existe pas : la capture ne contient pas `<context_ref>` → échoue ✔ ; après : présent ✔ | | **oui** (mécanisme réel, `escapeTaskMarkup` `:90-91` existe déjà) |
| T5 `:596-601` | `child.directory === parent.directory` | sans (d), les deux valent `ctx.directory` — sauf le cas des 5 divergences sur 1 915, soit 0,26 % : le test **passe** ✘ | après (d) : passe ✔ | **NON** (R3) |
| T5 | `create` sans `directory` → `ctx.directory` | vrai | vrai (le correctif est « un champ optionnel qui retombe ») | **NON** par construction |
| §7 global `:609-610` | `grep "directory"` ≥ 1 | 0 occurrence → échoue | ≥ 1 → passe | forme, pas comportement (R7) |

Bilan : **2 tests sur 5 sont réellement discriminants** (T1, T2 — et ils suffisent à valider (a)), **T4
l'est par accident mais pour une bonne raison**, et **T3, T5 et le critère global ne le sont pas**.

## Regressions introduced

**Aucun test vert n'est cassé — parce qu'aucun correctif n'a été appliqué.** La proposition est un
document ; elle ne modifie rien (`proposal:3` : « Aucun fichier source n'a été modifié »).

Ce qui est en revanche établi, c'est que **le §4(a) casserait des tests verts et qu'aucun relevé ne le
dit** :

- `test/tool/task.test.ts` est **vert** à l'instant de cette revalidation (`TASK_TEST_EXIT=0`, 34/34) ;
- le §4(a) tel que écrit lève une **`TypeError` au chargement du module** (forme variadique, preuve
  `VARIADIC_FAIL`), ce qui fait échouer la suite entière, pas un test ;
- le §4(a) tel que écrit supprime le `Tool.InvalidArgumentsError` nommé (`task.ts:394-397`), ce qui casse
  tout test pinnant `"Launch/resume requires description, prompt, and subagent_type strings"`. Le verdict
  d'origine signalait `test/tool/tasks-description.test.ts` et
  `test/cli/tui/task-contract-compact.test.ts` comme pinnant les chaînes d'annotation que (a) et (c)
  modifient (`proposal:526-536` reprend cette liste) — **la proposition connaît le risque et ne fournit
  aucun relevé**.

Les cinq fichiers de test annoncés au §7 **n'existent pas** (glob → *No files found*) : aucun n'est
rouge avant diff, aucun ne peut servir de base.

**État de la base de non-régression, énoncé sans faux positif** : la suite de référence est **verte sur
une exécution** (`TASK_TEST_EXIT=0`, 34/34, 29,59 s) mais le brief la décrivait rouge sur une autre
(exit 1, 34/1, `afterEach` 5000 ms). Une base dont le statut change d'une exécution à l'autre n'est pas
une référence opposable au sens de C-44 : je ne peux pas affirmer « aucun test vert n'est cassé », je
constate « aucun correctif n'a été écrit, donc aucune régression n'a été introduite par cette
révision ». C'est la seule affirmation que les artefacts permettent.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

Non implémentable : **R1, R2 et R3 sont `open`**. R1 et R2 sont des `Required changes` de la vague 2
laissés **intacts** — `proposal:347`, `:350`, `:581-587`, `:596-601` sont les passages que le verdict
d'origine a désignés comme non applicables ou non discriminants, et ils sont toujours là.

Ce qui est acquis et réutilisable tel quel : `## 2(e)` (chemin de retour complet), la DoD qui ne revient
pas structurée, la requalification du surcoût par enfant en **structurel**, et le retrait de l'argument
de coût de (a). `task.ts:236` est exacte (`accepted`, R6) : C-25 est close.

La leçon-structure est confirmée et **plus large que C-20** : sur les cinq tests du §7, **deux seulement
(T1, T2) sont discriminants**, et le critère de succès global est un littéral dans un seul fichier.

**Contrat exact pour lever les trois `open`** (aucune reformulation ne suffit) :

1. **R1** → réécrire le §4(a) avec `const BaseFields = Schema.Struct({...})`,
   `LaunchParameters`/`FollowUpParameters` construits depuis `BaseFields.fields`,
   `export const Parameters = Schema.Union([LaunchParameters, FollowUpParameters])`, **et**
   conserver `Schema.decodeUnknownEffect(LaunchParameters)` (task.ts:391-399).
2. **R2** → réécrire T3 avec un agent **sans** `budget_minutes` et
   `OPENCODE_TASK_BUDGET_MINUTES` non défini ; la seule source de plafond est `timeout_minutes: 1`.
   Prouver le différentiel en énonçant les deux mondes, pas en décrivant un seul.
3. **R3** → soit conditionner (d) à la preuve que le `cwd` effectif d'un tool-call enfant change (T5
   réécrit sur le `cwd` observé, pas sur la colonne), soit le retirer de la proposition. Trancher, ne pas
   laisser les deux.

Deux scrutations à effet de bord, dues à R1 : le §7 exige « les cinq fichiers passent » alors que le
glob en trouve **zéro** ; et `test/tool/task.test.ts` est vert aujourd'hui, donc chaque assertion du §4
qui le touche est une **régression verte** à justifier nommément avant patch.

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| **R1** — (a) Union forme tableau + `BaseFields` nommé + **garde de décodage conservée** | XS | `packages/opencode/src/tool/task.ts` | `test/tool/task-parameters-union.test.ts` (T1/T2, déjà discriminants : ne pas les diluer) | **oui, deux** : `test/tool/task.test.ts` (vert aujourd'hui, `TypeError` de chargement avec la forme variadique) et tout test pinnant `"Launch/resume requires description, prompt, and subagent_type strings"` — `test/tool/tasks-description.test.ts`, `test/cli/tui/task-contract-compact.test.ts` à relire avant patch |
| **R2** — (c) câblage `timeout_minutes` sur le lancement foreground | XS | `packages/opencode/src/tool/task.ts` (`:694`) | `test/tool/task-timeout.test.ts` (T3 **réécrit** : agent sans `budget_minutes`, env non défini) | aucun test vert identifié ; base instable (verte ici, rouge dans l'état transmis) — ne pas l'utiliser comme critère opposable |
| **R3** — (d) `directory` explicite | S | `packages/opencode/src/session/session.ts` (`:670-690`) + `packages/opencode/src/tool/task.ts` (`:451-467`) | `test/tool/task-directory.test.ts` (T5 **réécrit** sur le `cwd` effectif d'un tool-call enfant) | aucun connu ; `Session.create` est partagé → relire `test/shell/shell.test.ts` (vert, 12/0 — seule base opposable, C-47) et `test/cli/tui/task-followup.test.ts` |
| **R4** — origine de la fuite inter-projets | S (diagnostic) | `packages/opencode/src/session/session.sql.ts` + appelants de `Session.create` | aucun test requis (constat) ; `grep "directory"` indisponible ici → à rejouer en vague 4 | aucun |
| **R5** — corriger `session.ts:942-943` → `936-937` et supprimer « indexée » | XS | `packages/opencode/src/session/session.sql.ts` (`:63-68` : aucun index sur `directory`) | aucun | aucun |
| **R7/R8** — remplacer les critères non comportementaux du §7 | XS | `docs/harness-audit/proposals/P07-subagent-contract.md` (§7 `:603-610`) | aucun (correction de spécification) | aucun |