# Verdict de validation

## Proposal

`P07` — Contrat des sous-agents : schéma laxiste, contexte non hérité, budget de tokens absent, cwd implicite.
Fichier validé : `docs/harness-audit/proposals/P07-subagent-contract.md`.

## Validator

`validator-independant-01` — `independent` : n'a pas rédigé la proposition, n'a participé à aucun
des constats de la cohorte citée (22 parents / 3 229 enfants). Vérification par lecture directe du
code, sans reuse des conclusions de l'auteur.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | 30 citations contrôlées, 28 exactes : task.ts:52-59, 62-65, 66, 69-81, 78-80, 83-88, 90-92, 94-108, 110-118, 124-128, 148-161, 163-168, 303-305, 315, 326-330, 391-399, 404-410, 413-423, 430, 451-467, 456-460, 490-491, 505-507, 509-517, 549-552, 579, 593-597, 607, 676-677, 694-695, 699-707, 710-721, 722-726, 741-746 ; session.ts:219, 670-689 ; task-evidence.ts:39-48, 66-67 ; subagent-summary.ts:1-11, 26-30 |
| 2 citations non vérifiées | KO | `task.ts:236` (jamais lu : les plages 170-300 n'ont pas été ouvertes) et `session.ts:942-943` (le grep renvoie `input.directory` à **936-937**, pas 942-943) |
| chemin de retour enfant → parent | ok | task.ts:531-553 → 549 → 485-521 → 506-517 → 722-726 → 94-108. Tracé complet ci-dessous |
| la DoD ne revient pas structurée | ok | task-evidence.ts:39-43 (`allTests` ← `completion.evidence`) n'est transporté que dans le packet, écrit en `metadata.evidencePacket` (task.ts:724) et en `metadata.evidence_packet` (task.ts:579) — jamais fusionné dans le `goalState` du parent (task.ts:511-513 n'écrit que `findings`), jamais rendu dans le texte de sortie (task.ts:94-108 n'émet que `id` + `workspace_fingerprint`) |
| les décisions ne reviennent pas | ok | texte libre uniquement, et même cela conditionnel : `contract: ""` hors lean/expérimental (subagent-summary.ts:29), concaténé en task.ts:532 |
| aucun `directory` au `sessions.create` | ok | `grep "directory" src/tool` → 0 occurrence sur task.ts ; task.ts:451-467 passe `parentID`, `title`, `agent`, `permission` uniquement |
| l'enfant hérite-t-il le cwd autrement ? | ok (aucun mécanisme) | `Session.create` (session.ts:670-677) n'expose **pas** de champ `directory` ; session.ts:678 `InstanceState.context` puis session.ts:682-683 `directory: ctx.directory`, `path: sessionPath(ctx.worktree, ctx.directory)` en dur. Aucun env var, aucun cwd de process, aucune config d'instance neProvide le répertoire du parent |
| `Session.create` accepte-t-il `directory` ? | non-testé | signature session.ts:670-677 : absent. Le correctif (d) est donc bien un changement d'API, comme annoncé |
| ratio 84×Parent/enfant | **KO** | voir Objection 1 |
| T3 distingue-t-il le correctif qu'elle valide ? | **KO** | voir Objection 2 |
| `Schema.Union(A, B)` conforme à l'usage du dépôt | **KO** | voir Objection 3 |
| tests de régression existants exécutables | ok | les 6 fichiers existent : test/tool/task.test.ts, task.test.ts voisin tasks-description.test.ts, tasks-store.test.ts, test/permission-task.test.ts, test/cli/tui/task-followup.test.ts, test/cli/tui/task-contract-compact.test.ts |
| effort et coût annoncés réalistes | ok | XS/S/M cohérents avec les surfaces touchées ; le coût de (b) est honnêtement qualifié de « coût net positif, pas nul » (P07:493) et le plafond total non recalculé est marqué `INFERE` (P07:490) |

### Chemin de retour — tracé indépendant (question décisive)

```
child.runTask()                              task.ts:531-553
  └─ ops.prompt({ sessionID: child })         task.ts:534-548   → bloque jusqu'à la fin
       └─ text = parts.findLast(t => t.text)  task.ts:549       ← UN SEUL bloc, le dernier
       └─ persistEvidence(state, text)        task.ts:485-521
            ├─ packet.findings  ← goalState.findings         task-evidence.ts:36-38
            ├─ packet.tests     ← goalState.completion.evidence  task-evidence.ts:39-43
            ├─ packet.residuals ← goalState.completion.unverified task-evidence.ts:44-48
            └─ summary          ← goalState.completion.summary ?? text  task-evidence.ts:61
       └─ fusion parent :                     task.ts:506-517
            if (!current.goalState || packet.findings.length === 0) return   ← 506, silencieux
            mergeGoalFindings(...) ; setGoalState({ ...goalState, findings }) ← 507-517
                 ⚠ seul champ écrit = findings
retour foreground :  output(childID, text, packet)   task.ts:722-726 → 94-108
  <task id=...><task_result>texte</task_result>
  <evidence_packet id=... workspace_fingerprint=... fresh="true" />   ← task.ts:102
  ⚠ packet.tests / residuals / summary : ABSENTS du texte
retour background :  inject(...)               task.ts:559-590
  partie synthétique metadata.evidence_packet  task.ts:579, noReply: true (574)
  → aucune relance de modèle
```

**Ce qui revient réellement au parent :** (1) le dernier bloc de texte de l'enfant, (2) les
**findings seulement**, et seulement si le parent a un `goalState` **et** que l'enfant a produit
des findings, (3) l'id de session enfant, (4) une empreinte de workspace. **Ni la DoD structurée,
ni les décisions, ni les fichiers lus/modifiés.** Le fingerprint dit *où chercher*, jamais *quoi*.

La section (e) de P07 est **correcte et la mieux prouvée** du dossier. Elle est confirmée à
l'identique.

## Objections

### Objection 1 — Le ratio 84× compare des unités non comparables, et sa causalité est fausse (GRAVE)

P07:236-238 affirme : « Le ratio de coût Parent 0,00063 $/étape contre enfant 0,053 $/étape
(**84×**) est la conséquence directe du fait que l'échec d'un appel de lancement est découvert
après facturation, et qu'un appel vide reste reproductible. »

**Un enfant ne fait pas le même travail qu'un parent.** Le code le prouve :

- task.ts:541 `agent: next.name` — l'enfant tourne sous la définition d'un **autre agent**
  (un `subagent_type`), pas sous l'agent parent.
- task.ts:472-475 `const model = next.model ?? { modelID: msg.info.modelID, ... }` — le modèle est
  résolu indépendamment.
- task.ts:543-545 — `{ todowrite: false }` et `{ task: false }` sauf permission : l'enfant a un
  jeu d'outils **réduit**, sans todowrite et sans imbrication.
- task.ts:534-548 — la boucle de l'enfant est une **session complète** (prompt → outils → prompt),
  pas un pas.
- subagent-summary.ts:16-17 — le contrat lean impose explicitement « never return full terminal
  output to context », donc l'enfant est *conçu* pour être moins cher par pas que le parent.

Un « pas parent » = un pas d'agent avec le gros contexte système + AGENTS + transcript complet.
Un « pas enfant » = un pas dans un contexte restreint, avec une boucle d'outils. Le rapport des
coûts **par pas** mesure la forme de la boucle, pas l'efficacité de la validation du schéma.

**Et l'argument arithmétique ne tient pas.** Les 65 enfants « sans aucun tool-call » et les 56 à
`input = 0` (P07:234-235) paient **un seul tour**, pas une boucle d'agent. Ils représentent
121 / 3 229 ≈ 3,7 % de la cohorte. Ils ne peuvent pas produire un ratio de 84× : ce ratio est
porté par les 96 % d'enfants qui font du travail **légitime**. Attribuer le ratio à des lancements
vides est une causalité inversée.

**Corollaire** : la conclusion « déléguer est contre-productif » **tombe**. Le ratio ne la soutient
pas. Ce qui reste vrai et mesurable : 121 lancements vides sont un défaut de contrat réel, à
chiffrer sur la cohorte des 121, pas sur les 3 229.

**Aggravant — le chiffre n'est pas reproductible.** Ni `0,00063 $/étape`, ni `0,053 $/étape`, ni
`3 229` ne sont derivables d'un artefact contenu dans la proposition : la requête d'audit qui les
produit n'est ni jointe ni décrite. Une métrique qui porte la conclusion économique du dossier
sans requête reproductible n'est pas vérifiable.

**Ce qui change :** retirer la causalité « 84× ← échec de validation ». Remplacer par le chiffre
directement mesurable (coût cumulé sur les 121 sessions vides) et fournir la requête. Retirer
« reste négligeable devant le ratio 84× » (P07:493) ou le requalifier explicitement en
indicateur descriptif non causal.

### Objection 2 — T3 ne peut pas distinguer le correctif qu'elle valide (GRAVE)

T3 (P07:532-540) lance un sous-agent avec `timeout_minutes: 1` **« sur un agent dont
`budget_minutes` vaut 1 »**.

Or le correctif (c) propose (P07:359) :

```ts
// task.ts:694
const minutes = next.budgetMinutes ?? params.timeout_minutes ?? taskBudgetMinutes()
```

`??` est court-circuitant : si `next.budgetMinutes` vaut 1, `params.timeout_minutes` **n'est jamais
évalué**. Scénario T3 :

- **avant** le correctif : task.ts:694 `next.budgetMinutes ?? taskBudgetMinutes()` → `1` →
  `withBudget` expire → `Option.isNone(result)` → task.ts:699-707 → `partial` / `wall_clock`. ✔
- **après** le correctif : `1 ?? ...` → `1` → identique. ✔

T3 passe donc **avant comme après** le correctif. Les trois assertions (`outcome === "partial"`,
`reason === "wall_clock"`, verrou libéré) sont vraies dans les deux mondes. C'est un test non
discriminant : il prouve que le plafond mural existant fonctionne, pas que `timeout_minutes` est
câblé.

**Ce qui change :** le scénario discriminant exige `budgetMinutes` **absent** sur l'agent **et**
`OPENCODE_TASK_BUDGET_MINUTES` non défini (task.ts:119-122 renvoie `undefined`), avec
`timeout_minutes: 1` comme seule source. Avant correctif : `minutes === undefined` →
task.ts:125-126 `Effect.map(Option.some)`, aucun timeout, le `promptOps.prompt` qui ne termine
jamais suspend le test. Après : `partial` / `wall_clock`. C'est ce différentiel qui prouve le
câblage.

### Objection 3 — `Schema.Union(A, B)` n'est pas l'appel utilisé dans ce dépôt, et le code est auto-référentiel

P07:312 propose `export const Parameters = Schema.Union(LaunchParameters, FollowUpParameters)`.

**Forme de l'appel.** Les 64 occurrences de `Schema.Union(` dans `src/` utilisent la forme
**tableau** ou **collection**, jamais la forme variadique à deux arguments :

- `Schema.Union([OutputFormatText, OutputFormatJsonSchema])` — message-v2.ts:74
- `Schema.Union([NoulQuestion, ChoiceQuestion, ScoreQuestion])` — jev/schema.ts:77
- `Schema.Union([Begin, Match, End, Summary])` — file/ripgrep.ts:97
- `Schema.Union([Schema.String, Schema.Struct({...})])` — config/tasks.ts:69
- `Schema.Union([User, Assistant]).annotate({ discriminator: "role" })` — message-v2.ts:675
- `Schema.Union(BusEvent.effectPayloads())` — server/routes/instance/httpapi/api.ts:28

Le patch tel qu'écrit ne correspond à aucun usage du dépôt et ne typecheckera pas.

**Auto-référence.** P07:305-310 définit `LaunchParameters` par `{ ...Parameters.fields, ... }`
puis P07:312 **redéfinit** `Parameters` comme ce Union. `Parameters.fields` n'existe plus sur un
Union : la construction est circulaire. P07:481 reconnaît le risque (« `Parameters.fields`
disparaissant avec le `Union` ») mais ne le résout pas dans l'extrait.

**Ce qui change :** nommer la base (`const BaseFields = Schema.Struct({...})`), construire
`LaunchParameters` et `FollowUpParameters` à partir de `BaseFields.fields`, puis
`export const Parameters = Schema.Union([LaunchParameters, FollowUpParameters])`. Et conserver
`LaunchParameters` pour le garde de décodage (task.ts:391) plutôt que de le supprimer : c'est lui
qui produit le message d'erreur nommé, et le supprimer fait perdre `Tool.InvalidArgumentsError`
au profit d'une erreur de schéma opaque.

### Objection 4 — Le correctif (d) peut être inopérant : rien ne prouve que le cwd de l'enfant vienne de la colonne `directory`

P07:140-144 et P07:271-273 concluent que « l'enfant travaille dans le répertoire du processus, pas
nécessairement celui du parent ». Le mécanisme de substitution est **prouvé** (Objection :
`Session.create` ne prend pas `directory`, session.ts:682-683). Mais la **conséquence** ne l'est pas.

Les outils de la session résolvent leur `cwd` depuis le **contexte d'instance**, pas depuis la
ligne de session :

- `path: { cwd: ctx.directory, root: ctx.worktree }` — prompt.ts:731, 948, 2006
- `Working directory: ${ctx.directory}` — system.ts:103
- `return { msg, part, cwd: ctx.directory }` — prompt.ts:979

Si `ctx` y est bien le contexte d'instance, le parent et l'enfant — enfants de session created
dans la même instance — **partagent le même `ctx.directory`**, et passer `directory: parent.directory`
à `sessions.create` ne changerait qu'une **colonne en base**, sans effet observable sur les outils.
P07 qualifie cela d'`INFERE` avec une méthode de vérification, ce qui est honnête, mais le
correctif (d) est coté « risque moyen » et proposé en même temps que (a) et (c) qui sont solides.

**Ce qui change :** promoted la preuve de ce point **avant** d'implémenter (d). Le test T5
proposé (P07:549-551) doit asserter le **cwd effectif d'un tool-call de l'enfant**, pas seulement
l'égalité de deux valeurs de colonne — sans quoi T5 passerait même si le correctif est inerte.
Accessoirement, corriger la citation `session.ts:942-943` → `936-937`.

### Objection 5 — Deux citations invérifiables

- `task.ts:236` : la plage 170-300 n'a pas été ouverte par cette validation ; la revendication
  (« `<task id=...>` », task.ts:96) est confirmée par task.ts:96 et task.ts:667, mais la ligne 236
  elle-même reste non vérifiée.
- `session.ts:942-943` : le grep renvoie `input.directory` aux lignes **936-937**. Décalage à
  corriger.

## Required changes

1. **P07:236-238 et P07:493** — supprimer la causalité « 84× ← échec de validation » et
   l'inférence « déléguer est contre-productif ». Le ratio est un indicateur **descriptif** entre
   deux populations de boucle non comparables ; il ne démontre pas la causalité invoquée.
2. **P07:236-238** — joindre la requête d'audit reproductible qui produit `0,00063 $/étape`,
   `0,053 $/étape`, `3 229`, `65`, `56`, et remplacer le plafond de coût par le cumul sur les
   121 sessions vides (déjà annoncé comme non recalculé en P07:490).
3. **P07:532-540 (T3)** — rendre le test discriminant : agent **sans** `budget_minutes`,
   `OPENCODE_TASK_BUDGET_MINUTES` non défini, `timeout_minutes: 1` seule source. Sans ce
   changement, le test passe avant le correctif et ne prouve rien.
4. **P07:296-313 (fix a)** — réécrire avec la forme `Schema.Union([LaunchParameters,
   FollowUpParameters])`, introduire une base nommée pour casser la circularité
   `Parameters.fields`, et conserver le garde de décodage de task.ts:391.
5. **P07:549-551 (T5)** — asserter le **cwd effectif observé par un tool-call de l'enfant**, pas
   l'égalité de colonnes ; et conditionner l'implémentation de (d) à la preuve que le cwd provient
   de la colonne `directory` plutôt que du contexte d'instance (prompt.ts:731, system.ts:103).
6. **P07** — corriger `session.ts:942-943` → `936-937` et vérifier ou supprimer `task.ts:236`.

## Implementation guidance

Ordre de patch : **(c) seul d'abord** — il est monofichier, sans dépendance de schéma, et c'est le
seul correctif dont le mécanisme existe déjà (task.ts:124-128 + 694). Ensuite **(a)** avec la
réécriture du point 4, puis **T1/T2** (ils ne dépendent que de `Parameters`). **(b)** touche
`subagent-summary.ts:26-30` : attention, `contract: ""` hors lean/expérimental est un comportement
volontaire — ne pas le supprimer, seulement conditionner. **Laisser (d) de côté** jusqu'à la preuve
demandée au point 5.

Piège connu : supprimer `Schema.decodeUnknownEffect(LaunchParameters)` (task.ts:391-399) fait
disparaître le `Tool.InvalidArgumentsError` nommé ; les tests qui matchent sur ce message
(`"Launch/resume requires description, prompt, and subagent_type strings"`, task.ts:396) cassent.
Garder le decode en garde-fou même une fois le schéma durci.

Fichiers de test : créer `test/tool/task-timeout.test.ts` (T3, scénario discriminant),
`test/tool/task-parameters-union.test.ts` (T1/T2). Rejouer avant intégration les 6 fichiers
existants listés en P07:474-480, en portant une attention particulière à
`test/cli/tui/task-contract-compact.test.ts` et `test/tool/tasks-description.test.ts`, qui pinnent
les chaînes d'annotation que (a) et (c) modifient.