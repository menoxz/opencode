# P07 — Contrat des sous-agents : schéma laxiste, contexte non hérité, budget de tokens absent, cwd implicite

Statut : proposition. Aucun fichier source n'a été modifié.

## 1. Problem

Le `task` tool laisse le modèle lancer un sous-agent avec n'importe quel jeu de champs
partiel : le contrat d'appel n'est pas vérifié par le schéma, le sous-agent ne reçoit aucun
résumé du contexte du parent, aucun plafond de tokens ne peut arrêter une_session enfant,
et le répertoire de travail de l'enfant est déduit silencieusement du contexte d'instance
au lieu d'être déclaré.

## 2. Evidence

Toutes les citations sont dans `packages/opencode/src/tool/task.ts` sauf mention contraire.

**(a) Les cinq champs d'identité sont optionnels.** L'obligation ne vit que dans le texte
`description` d'annotation, pas dans le type :

```ts
// task.ts:52-59
const BaseParameterFields = {
  description: Schema.optional(Schema.String).annotate({
    description: "Required for launch/resume: a short (3-5 words) description",
  }),
  prompt: Schema.optional(Schema.String).annotate({
    description: "Required for launch/resume: the task for the agent to perform",
  }),
  subagent_type: Schema.optional(Schema.String).annotate({
```

`task_id` (task.ts:62-65) et `command` (task.ts:66) sont également `Schema.optional`.
Le schéma exposé est donc un `Struct` intégralement optionnel : `{ background: true }`
passe la validation JSON et n'échoue qu'ensuite, au runtime.

**(b) `LaunchParameters` existe mais n'est pas le schéma exposé.**

```ts
// task.ts:83-88
const LaunchParameters = Schema.Struct({
  ...Parameters.fields,
  description: Schema.String,
  prompt: Schema.String,
  subagent_type: Schema.String,
})
```

et le tool exporte bien `Parameters` :

```ts
// task.ts:741-746
return {
  description: DESCRIPTION + BACKGROUND_DESCRIPTION,
  parameters: Parameters,
  execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
```

`LaunchParameters` n'est utilisé que comme garde de décodage interne :

```ts
// task.ts:391-399
const params = yield* Schema.decodeUnknownEffect(LaunchParameters)(input).pipe(
  Effect.mapError(
    () =>
      new Tool.InvalidArgumentsError({
        tool: id,
        detail: "Launch/resume requires description, prompt, and subagent_type strings",
      }),
  ),
)
```

Conséquence : le contrat est correct mais **tardif**. Le modèle découvre la faute une fois
l'appel construit, donc dans le contexte déjà facturé d'un tour.

**(c) `timeout_minutes` n'est lu que sur la branche de suivi.**

```ts
// task.ts:78-80
timeout_minutes: Schema.optional(Schema.Number).annotate({
  description: "Only with action=wait: give up waiting after this many minutes and report the task as still running.",
}),
```

la seule lecture du champ est à task.ts:329, dans le bloc `action === "wait"` :

```ts
// task.ts:326-330
? yield* background
    .wait({
      id: target,
      ...(params.timeout_minutes ? { timeout: params.timeout_minutes * 60_000 } : {}),
    })
```

Un appel foreground avec `timeout_minutes: 5` est donc accepté silencieusement et n'a
**aucun effet**. La seule borne de temps qui s'applique au lancement est
`OPENCODE_TASK_BUDGET_MINUTES` / `agent.budget_minutes` :

```ts
// task.ts:694-695
const minutes = next.budgetMinutes ?? taskBudgetMinutes()
const result = yield* withBudget(runTask(), minutes)
```

et le commentaire task.ts:110-118 documente que ce plafond a été retiré sciemment.

**(d) Aucun `directory` au `sessions.create` de l'enfant.** La création est :

```ts
// task.ts:451-467
(yield* sessions.create({
  parentID: ctx.sessionID,
  title: params.description + ` (@${next.name} subagent)`,
  agent: next.name,
  permission: [ ... ],
}))
```

`grep "directory" src/tool/task.ts` ne renvoie **aucune occurrence**. Or
`Session.create` n'expose pas de `directory` dans son entrée et recopie le répertoire de
l'instance courante :

```ts
// src/session/session.ts:670-689
const create = Effect.fn("Session.create")(function* (input?: {
  parentID?: SessionID
  title?: string
  agent?: string
  model?: Schema.Schema.Type<typeof Model>
  permission?: Permission.Ruleset
  workspaceID?: WorkspaceID
}) {
  const ctx = yield* InstanceState.context
  ...
    directory: ctx.directory,
    path: sessionPath(ctx.worktree, ctx.directory),
```

**INFERE:** un sous-agent lancé depuis un parent multi-racine hérite donc du `directory` du
processus et non de celui du parent. *Méthode de vérification :* créer une session par
racine, lancer un sous-agent, puis lire `SessionTable.directory` des deux lignes et
comparer. La colonne existe et est requise (`session.ts:219`), et l'index de liste la
filtre (`session.ts:942-943`), donc la divergence est stockable et observable.

**(e) Ce qui revient au parent : findings seulement, plus le texte du dernier message.**

C'est le point le plus important du dossier. Inventaire complet du retour enfant → parent :

| Ce qui revient | Mécanisme | Preuve |
|---|---|---|
| Texte du **dernier** message de l'enfant | `result.parts.findLast(...)` | task.ts:549 |
| Findings structurés | `mergeGoalFindings` → `setGoalState` | task.ts:507, task.ts:509-517 |
| Findings + tests + residuals (metadata) | `evidence_packet` dans les metadata de la part synthétique | task.ts:579 |
| Identifiant de session enfant | `<task id=...>` | task.ts:96, task.ts:236 |

```ts
// task.ts:549-552
const text = result.parts.findLast((item) => item.type === "text")?.text ?? ""
const stepLimited = result.info.role === "assistant" && result.info.finish === "step-limit"
const packet = yield* persistEvidence(stepLimited ? "partial" : "completed", text)
return { text, state: packet.state, reason: stepLimited ? ("steps" as const) : undefined, packet }
```

`findLast` ne conserve qu'**un seul** bloc de texte : toute narration intermédiaire de
l'enfant est perdue pour le parent, alors que la transcription complète existe sur disque
(`childTranscriptText`, task.ts:163-168) et n'est lue que pour un salvage (task.ts:557).

La remontée de findings est **conditionnelle** et silencieuse sur le plan syntaxique :

```ts
// task.ts:505-507
const current = yield* sessions.get(ctx.sessionID)
if (!current.goalState || packet.findings.length === 0) return
const findings = mergeGoalFindings(current.goalState.findings ?? [], packet.findings)
```

Si le parent n'a pas de `goalState`, ou si l'enfant n'a rien trouvé, **rien** n'est écrit et
aucun avertissement n'est émis. `mergeGoalFindings` ne traite que le tableau `findings`.

**Ce qui ne revient pas :**

- **La DoD de l'enfant.** Le packet la reconstruit partiellement —
  `allTests` vient de `goalState.completion.evidence` et `allResiduals` de
  `completion.unverified` (task-evidence.ts:39-48) — mais ce tableau `tests` n'est écrit
  que dans les **metadata** de la partie de message (task.ts:579). Il n'est jamais fusionné
  dans le `goalState` du parent : le seul champ écrit est `findings`
  (task.ts:511-513).
- **Les décisions.** Aucun chemin de code ne les transporte. Elles n'existent que comme
  texte libre dans le bloc de task.ts:549, donc avec la même fragilité que `findLast`.
- **Les fichiers lus / modifiés.** Le packet porte `source.transcriptSessionID`
  (task-evidence.ts:66) et `workspace.fingerprint` (task-evidence.ts:67). Le parent reçoit
  donc *où aller chercher*, jamais *quoi*. Le `changes:` exigé par le contrat de rapport
  n'est pas un champ structuré du packet.
- **Le `state` de l'enfant** quand il est `blocked` : `persistEvidence` calcule
  `effectiveState` (task.ts:490-491) mais seule la branche `stepLimited` remonte en
  `partial` côté tâche ; un `blocked` reste absent du texte de sortie foreground
  (task.ts:722-726 n'a que `completed` et `partial`).

Aggravant : le contrat de rapport n'est injecté que sous condition :

```ts
// src/tool/subagent-summary.ts:26-30
export function subagentResultPolicy(parentIsLean: boolean, boundedExperiment: boolean) {
  if (parentIsLean) return { contract: LEAN_SUBAGENT_CONTRACT }
  if (boundedExperiment) return { contract: SUBAGENT_RESULT_CONTRACT }
  return { contract: "" }
}
```

En mode parent non-lean et sans le drapeau expérimental, `contract` est la chaîne vide :
l'enfant **n'est même pas invité** à rapporter décisions, changements et preuves. Les
sections exigées (subagent-summary.ts:1-11) sont donc absentes de la sortie dans le cas par
défaut, et leur absence n'est signalée nulle part.

**(f) Concurrence : `Semaphore` est importé mais ne borne pas les lancements.**

```ts
// task.ts:11
import { Cause, Duration, Effect, Exit, Option, Schema, Scope, Semaphore } from "effect"
```

Les trois usages réels sont un verrou de cycle de vie par session et un verrou de preuve —
**aucun compteur de lancements** :

- `lifecycleLock` → `Semaphore.makeUnsafe(1)` par session enfant (task.ts:281-289) ;
- `evidenceLock` → `Semaphore.make(1)` pour sérialiser l'écriture des findings
  (task.ts:301), utilisé en task.ts:503 ;
- le double-check « déjà en cours » avant lancement (task.ts:673-679) et avant `start`
  (task.ts:593-597) réutilise ce même verrou de 1 permis.

`Semaphore` ne borne donc pas le **nombre** d'enfants simultanés. Le débit de lancements est
borné par la seule boucle du modèle.

> **MESURE TERRAIN — provenance.** Les chiffres cités dans ce paragraphe et en §2(g) —
> 3 229 sessions enfants pour 22 parents, une session à 403 enfants, 65 enfants sans aucun
> tool-call, 56 à `input = 0`, une session enfant de 895 étapes, ratio 0,00063 $/étape contre
> 0,053 $/étape — proviennent de la requête d'audit fournie avec ce dossier. **Ils ne sont pas
> re-dérivés ici** : cette proposition n'a pas d'accès à la base. *Vérification :* rejouer la
> requête en lecture seule avant toute décision d'implémentation, et retrouver le ratio 84×.

C'est l'explication mécanique la plus simple du volume observé : 3 229 sessions enfants pour 22 parents, une session à 403 enfants,
65 enfants sans aucun tool-call et 56 à `input = 0` — des lancements vides, jamais refusés,
parce que rien ne l'exige. Le ratio de coût Parent 0,00063 $/étape contre enfant
0,053 $/étape (**84×**) est la conséquence directe du fait que l'échec d'un appel de
lancement est découvert après facturation, et qu'un appel vide reste reproductible.

**(g) Plafond de tokens : aucun.** `stepLimitOutput` (task.ts:148-161) gère une borne de
**pas**, déjà appliquée en amont par `finish === "step-limit"` (task.ts:550). Aucun champ
`token_budget` n'existe dans `BaseParameterFields`, et le mécanisme mural est un
`Effect.timeoutOption` (task.ts:124-128) qui n'a rien à voir avec le volume de tokens. Une
session enfant de 895 étapes est donc un résultat possible et non signalé comme anomalie.

## 3. Mechanism

 Chemin d'exécution d'un lancement foreground incomplet, de la sortie du modèle au retour :

1. Le modèle produit un appel `task`. Le.toolbox le valide contre le schéma exposé
   `Parameters` (task.ts:743), c'est-à-dire un `Struct` dont **tous** les champs sont
   optionnels (task.ts:69-81). **Étape 1 : la validation passe pour n'importe quel objet.**
2. `run` reçoit `input` typé par `Schema.Schema.Type<typeof Parameters>` (task.ts:303-305),
   donc le type statique ne distingue plus « lancement » de « suivi ».
3. Le test discriminant est `if (input.action)` (task.ts:315). C'est donc la **présence
   d'une clé `action`**, et non le schéma, qui décide de la branche. Un objet
   `{ background: true }` n'a pas `action` et tombe dans la branche de lancement.
4. La branche de lancement décode avec `LaunchParameters` (task.ts:391) : c'est **ici**, et
   seulement ici, que l'erreur d'arguments est produite (task.ts:394-397). Le contrat
   existe ; il est paid après coup.
5. Le garde-fou suivant vérifie l'élision de prompt (task.ts:404-410), puis
   `ctx.ask` réclame la permission (task.ts:413-420).
6. `sessions.create` (task.ts:451-467) crée l'enfant sans `directory`. Comme
   `Session.create` recopie `InstanceState.context.directory` (session.ts:682), l'enfant
   travaille dans le répertoire du processus, pas nécessairement celui du parent.
7. Le prompt de l'enfant est `params.prompt` **+** le contrat, si le contrat est non vide
   (task.ts:532, subagent-summary.ts:26-30). Il ne contient ni le `goalState` du parent, ni
   ses findings, ni les fichiers déjà lus : **le contexte n'est pas hérité**.
8. `ops.prompt` bloque jusqu'à la fin (task.ts:534-548). Aucune borne de tokens. La seule
   borne murale eventuelle est `next.budgetMinutes ?? taskBudgetMinutes()` (task.ts:694),
   non alimentée par défaut (task.ts:110-122).
9. Au retour, `findLast` ne garde que le dernier bloc de texte (task.ts:549). `stepLimit`
   est converti en `partial` (task.ts:550-552).
10. `persistEvidence` construit le packet depuis le `goalState` de l'**enfant**
    (task.ts:492-502) ; la remontée vers le parent n'écrit que `findings`, et seulement si
    le parent a un `goalState` **et** que le packet a des findings (task.ts:506-507).
11. Le texte rendu au parent est `output(sessionID, text, packet)` (task.ts:94-108, appelé
    à task.ts:725) : une balise `evidence_packet` avec l'identifiant et l'empreinte
    workspace, et **rien d'autre**.

Le parent repart donc avec : une phrase, un id, une empreinte, et zéro DoD, zéro décision,
 zéro chemin de fichier structuré.

## 4. Proposal

Quatre modifications, toutes dans `packages/opencode/src/tool/task.ts` sauf mention.

### (a) Exposer un `Schema.Union` de deux variantes — effort **XS**, risque **faible**

```ts
const FollowUpParameters = Schema.Struct({
  task_id: Schema.String,
  action: Schema.Literals(["check", "wait", "cancel"]),
  timeout_minutes: Schema.optional(Schema.Number),
})

const LaunchParameters = Schema.Struct({
  ...Parameters.fields,
  description: Schema.String,
  prompt: Schema.String,
  subagent_type: Schema.String,
})

export const Parameters = Schema.Union(LaunchParameters, FollowUpParameters)
```

et supprimer le `Schema.decodeUnknownEffect(LaunchParameters)` de task.ts:391-399, devenu
redondant. Le discriminant implicite reste `input.action` (task.ts:315), ce qui est correct :
la première variante matche les lancements, la seconde impose `task_id` **et** `action`.

*Effort* : ~15 lignes, aucune nouvelle dépendance. *Risque* : faible, mais réel — le
`snapshot` d'outil et la complétion TUI consomment `Parameters.fields`, qui n'existe plus
sur un `Union`. À vérifier : tout appelant de `Parameters.fields` hors task.ts.
*INFERE* : l'existence d'au moins un tel appelant. *Vérification :* `grep "Parameters.fields"`
sur `packages/opencode/src` et sur `packages/opencode/test`.

**Inchangé volontairement :** la garde d'élision de prompt (task.ts:404-410). Elle est
correcte et opère après décodage ; elle reste une défense de second rang contre un prompt
tronqué par le mécanisme d'élision du harnais.

### (b) `context_ref` compact attaché à l'enfant — effort **S**, risque **moyen**

Nouveau champ optionnel sur la variante de lancement, injecté dans le prompt de l'enfant :

```ts
context_ref: Schema.optional(Schema.String).annotate({
  description:
    "Compact brief of the parent's state the child cannot infer: goal, findings already known, files already read. Max ~800 chars.",
}),
```

et, dans `runTask` (task.ts:531-533), concaténé avant le contrat :

```ts
const brief = params.context_ref ? `<context_ref>\n${escapeTaskMarkup(params.context_ref)}\n</context_ref>\n` : ""
const prompt = brief + params.prompt + resultPolicy.contract
```

*Pourquoi pas un héritage automatique ?* Recopier le `goalState` du parent dans chaque
enfant coûterait du contexte sur chacun des 3 229 enfants observés, alors que seuls les
enfants qui héritent ont besoin de l'héritage. Le champ rend le transfert **explicite et
payé par l'appelant**.
*Risque* : `context_ref` est du texte libre injecté dans un prompt. Il est déjà du texte
libre (`prompt`), et il est échappé par `escapeTaskMarkup` (task.ts:90-92) avant concaténé.
Le risque d'injection est donc le même que celui de `prompt`, pas un risque nouveau — mais
il faut que la description du champ dise explicitement « état du parent, pas instruction ».

### (c) `timeout_minutes` sur le lancement foreground — effort **XS**, risque **faible**

Le mécanisme de borne et de libération de slot **existe déjà** et fonctionne : `withBudget`
(task.ts:124-128) enveloppe `runTask` (task.ts:695), le dépassement annule l'enfant puis
récupère le transcrit (task.ts:699-702), et le libérateur est garanti par
`Effect.acquireUseRelease` dont la release s'exécute à l'interruption (task.ts:728-737).

Le correctif est donc de **câbler le paramètre au lieu de le réimplémenter** :

- changer l'annotation de task.ts:78-80 en « Foreground : abandon après N minutes, l'enfant
  est annulé et son transcrit récupéré ; `action=wait` : idem sur le suivi. » ;
- à task.ts:694, passer à `next.budgetMinutes ?? params.timeout_minutes ?? taskBudgetMinutes()`.

Le `Semaphore` de `lifecycleLock` est libéré par la structure `withPermits`, et le job
background est annulé par le `onCancel` déjà enregistré (task.ts:607). **Aucun nouveau
verrou n'est requis** : c'est ce qui rend le risque faible.

*Risque* : un parent qui fixe 1 minute par défaut transforme chaque sous-agent en
`partial`. Le correctif est de ne pas donner de valeur par défaut et de documenter que la
valeur est un engagement du parent, pas un plafond de sécurité.

### (d) `directory` explicite — effort **S**, risque **moyen**

`Session.create` n'accepte pas `directory` aujourd'hui (session.ts:670-677). Le correctif
touche deux fichiers :

1. `src/session/session.ts` — ajouter `directory?: string` à l'entrée de `create` et
   substituer `input?.directory ?? ctx.directory` à `ctx.directory` (session.ts:682).
2. `src/tool/task.ts` — propager le répertoire du parent :

```ts
(yield* sessions.create({
  parentID: ctx.sessionID,
  directory: parent.directory,
  title: params.description + ` (@${next.name} subagent)`,
  agent: next.name,
  permission: [ ... ],
}))
```

`parent` est déjà chargé à task.ts:430. **Ce qui change :** l'enfant travaille dans le
répertoire du parent au lieu de celui du processus. `Session.Table.directory` est déjà
requis et indexé (session.ts:219, session.ts:942-943) ; aucune migration nécessaire.
*Risque* : modifier `Session.create` affecte tous ses appelants. Préférer un champ
optionnel qui retombe sur `ctx.directory`, et ne pas changer le comportement existant quand
le champ est absent.

### Risk majeur : un budget de tokens peut-il couper une édition multi-fichiers ?

**Oui, et c'est pourquoi je ne propose pas de budget de tokens dans cette proposition.**

`withBudget` est un `Effect.timeoutOption` (task.ts:127). Il **interrompt la fibre**, il
n'attend pas la fin de l'étape en cours. Un enfant en train d'écrire cinq fichiers serait
interrompu entre deux écritures : sur disque, un lot à moitié appliqué, sans transaction, et
le parent recevrait un `partial` qui décrit un état que personne n'a demandé. C'est
strictement pire que l'absence de plafond, qui produit au moins un état cohérent.

Les quatre stratégies, et mon arbitrage :

| Stratégie | Verdict |
|---|---|
| Budget de tokens dur, `interrupt` sur dépassement | **Rejetée.** Coupe au milieu d'une écriture multi-fichiers ; état disque incohérent, rapport faux. |
| Budget de tokens strict mais seulement entre deux tools | **Rejetée.** Le harnais ne garantit pas de point d'arrêt ; `step-limit` (task.ts:550) existe déjà et fait ce travail proprement, en fin de tour. |
| Budget de tokens **moll** : avertissement injecté à 80 %, arrêt propre à la frontière de tour suivante | **Retenue pour une itération ultérieure**, pas ici. Le bon endroit est `prompt.ts` (bornes de tour), pas `task.ts`. Elle n'est pas implémentable dans ce fichier sans toucher au runner. |
| **Plafond de pas / rapport structuré obligatoire, pas de plafond de tokens** | **Retenue maintenant.** Le mécanisme de fin existe déjà et est propre. |

La sortie propre, déjà présente dans le fichier, est donc **réutilisée telle quelle** : à un
dépassement, on annule proprement puis on récupère le transcrit et le fingerprint.

```ts
// task.ts:699-707 — le modèle à suivre
if (Option.isNone(result)) {
  yield* cancel.pipe(Effect.ignore)
  const partial = yield* partialText()
  const packet = yield* persistEvidence("partial", partial)
  return {
    title: params.description,
    metadata: { ...metadata, outcome: "partial", reason: "wall_clock", evidencePacket: packet },
    output: budgetOutput(nextSession.id, minutes ?? 0, partial),
  }
}
```

Le même schéma existe pour les pas (task.ts:550, task.ts:710-721) et pour l'annulation
(task.ts:633-650). **Invariant à faire respecter par tout plafond futur :** jamais
d'interruption au milieu d'un tool-call ; arrêter, récupérer, marquer `partial`, garder le
transcript complet, dire au parent que c'est partiel et non vérifié.

### Ce qui reste inchangé

- `stepLimitOutput` (task.ts:148-161) : c'est la sortie propre de référence.
- La remontée des findings (task.ts:503-519) : correcte, à **élargir** aux DoD plutôt
  qu'à remplacer. Extension naturelle, à traiter en P11 : écrire
  `completion.evidence` dans le `goalState` du parent au même endroit, sous le même verrou.
- `lifecycleLock` : un verrou par session, un permis. Il fait son travail.

## 5. Alternatives considered

**A1 — Ne rien changer sur le schéma, renforcer seulement les descriptions.** Rejeté : le
modèle lit une description, il ne le type-checke pas. Le défaut est structurel : à
task.ts:69-81 le schéma autorise `{ background: true }`. Un texte d'annotation plus
insistant ne réduit pas le taux d'échec, il ne fait que déplacer la faute.

**A2 — Exposer `LaunchParameters` directement comme `Parameters` et traiter le suivi par un
outil séparé (`task_followup`).** Rejeté, bien que le schéma devienne strict : cela scinde
l'API en deux outils, casse les scripts et les TUI existants
(`test/cli/tui/task-followup.test.ts`), et le suivi est aujourd'hui le mécanisme principal
du mode background (task.ts:315). Le coût de migration est disproportionné au bénéfice.

**A3 — Budget de tokens sur l'enfant.** Rejeté pour la section 4 : `Effect.timeoutOption`
interrompt la fibre et peut casser un lot d'écritures. Le plafond de pas existe déjà et est
propre.

**A4 — Héritage automatique du `goalState` du parent vers l'enfant.** Rejeté : avec 3 229
enfants observés, la duplication du contexte sur chaque lancement est un multiplicateur de
coût direct, alors que seuls les enfants qui en ont besoin l'utilisent. Le champ explicite
`context_ref` paie seulement le transfert utile.

**A5 — Ne poser que (a) et (d), les corrections à risque nul, et différer le reste.**
Retenu comme repli si le validateur juge (b) risqué : (a) et (d) sont les deux seules
corrections qui suppriment un défaut *silencieux* (rejet tardif, mauvais cwd). (b) et (c)
améliorent le contrat sans supprimer de silence. Le bloc (a)+(d) reste cohérent et
livrable seul.

## 6. Risks

**Régression sur les tests existants.** Fichiers concernés, à exécuter avant toute
intégration : `packages/opencode/test/tool/task.test.ts`,
`packages/opencode/test/tool/tasks-description.test.ts`,
`packages/opencode/test/tool/tasks-store.test.ts`,
`packages/opencode/test/permission-task.test.ts`,
`packages/opencode/test/cli/tui/task-followup.test.ts`,
`packages/opencode/test/cli/tui/task-contract-compact.test.ts`.
Les trois ruptures probables sont : (i) `Parameters.fields` disparaissant avec le `Union`,
(ii) les tests qui passent des arguments partiels aujourd'hui acceptés et désormais rejetés —
ce qui est **le but** mais casse des tests, (iii) les tests de description qui attendent les
chaînes « Only with action=wait » et « Required for launch/resume », modifiées par (a) et (c).

**Coût en tokens / latence ajouté, chiffré.** L'effet est **négatif**, donc favorable, mais il
ne faut pas le survendre : la réduction porte sur les appels **invalides et vides**, pas sur
le travail utile. Sur la cohorte observée, 65 enfants sans aucun tool-call et 56 à `input = 0`
sont des lancements qui n'auraient jamais dû exister. Ils payent au moins un tour chacun. La
plafond coût total que cela représente n'a pas été recalculé ici — **INFERE**. *Méthode :*
rejouer la requête d'audit avec `cost` cumulé sur ces 121 sessions. Le gain distributionnel
est réel mais borné. L'ajout de (b) coûte, lui, ~800 caractères maximum par enfant qui
l'utilise ; sur les 3 229 enfants cela reste négligeable devant le ratio 84×, mais c'est un
coût net positif, pas nul. (c) **n'ajoute aucune latence** : il rend adressable une borne
qui existe déjà et n'est pas branchée.

**Sécurité.** Aucun risque d'injection nouveau : `context_ref` est échappé par
`escapeTaskMarkup` (task.ts:90-92) avant concaténé, exactement comme `prompt`. Deux points
restent à surveiller. (1) `Schema.Union` durcit l'API : un appelant qui reposait sur des
arguments partiels pour obtenir un comportement implicite recevra désormais une erreur
explicite — c'est le but, mais une régression fonctionnelle possible en amont. (2) (d)
retourne la valeur `parent.directory` vers l'enfant : c'est une donnée d'instance déjà
connue du processus, elle ne franchit pas de frontière de confiance et ne contourne aucune
permission. `deriveSubagentSessionPermission` (task.ts:456-460) reste le seul chemin
d'octroi de droits et n'est pas touché.

## 7. Tests

**T1 — Le schéma rejette un lancement incomplet, sans exécuter de code.**
Chemin : `packages/opencode/test/tool/task-parameters-union.test.ts`.
Appeler `TaskTool.parameters` (task.ts:743) avec `{ background: true }` puis valider contre
le schéma ; appliquer aussi `{}` et `{ task_id: "x" }`.
*Critère de succès observable :* les trois cas sont rejetés par le schéma, avant tout appel à
`ops.prompt`. Assertion sur le fait que `promptOps.prompt` n'a jamais été invoqué — c'est ce
qui distingue un rejet de schéma d'un échec runtime.

**T2 — Le schéma accepte les deux variantes et rejette un mélange.**
Mêmes cas : `{ description, prompt, subagent_type }` valide ; `{ task_id, action: "wait" }`
valide ; `{ task_id: "x" }` **invalide** (action obligatoire dans la variante de suivi) ;
`{ prompt: "p" }` invalide.
*Critère :* aucune exception ; les verdicts de validation correspondent exactement aux quatre
cas.

**T3 — `timeout_minutes` fore ground produit un `partial` propre et libère le verrou.**
Chemin : `packages/opencode/test/tool/task-timeout.test.ts`.
Lancer un sous-agent en foreground avec un `promptOps.prompt` qui ne termine jamais, et
`timeout_minutes: 1` sur un agent dont `budget_minutes` vaut 1.
*Critère de succès observable :* l'appel retourne `metadata.outcome === "partial"` et
`metadata.reason === "wall_clock"` (task.ts:705), le texte contient `budget_exceeded`
(task.ts:130-146), **et** un second lancement du même `task_id` n'échoue pas sur
« already running » (task.ts:676-677) — cette troisième assertion est la preuve que le
verrou a bien été libéré.

**T4 — `context_ref` arrive chez l'enfant, échappé.**
Chemin : `packages/opencode/test/tool/task-context-ref.test.ts`.
Capturer les parts dans `promptOps.resolvePromptParts`.
*Critère :* le texte capturé contient `<context_ref>` avec la chaîne fournie, et le `&`
d'un `context_ref` en entrée apparaît sous forme `&amp;` — l'échappement est vérifié par
l'observation, pas par relecture du code.

**T5 — `directory` de l'enfant égale celui du parent.**
Chemin : `packages/opencode/test/tool/task-directory.test.ts`.
Créer un parent dans un répertoire distinct de `InstanceState.context.directory`, lancer
un sous-agent, lire la session enfant.
*Critère :* `child.directory === parent.directory`, et un appelant de `Session.create` sans
`directory` continue d'obtenir `ctx.directory` (non-régression de session.ts:682).

**Commande :**

```
cd packages/opencode && bun test test/tool/task
```

**Critère global de succès :** les cinq fichiers passent, et `grep "directory" src/tool/task.ts`
renvoie au moins une occurrence — la preuve mécanique que (d) a été appliquée.

## 8. Effort

**M** — les quatre correctifs sont individuellement XS à S, mais (d) touche
`Session.create` donc tous ses appelants, et (a) oblige à reprendre les six fichiers de test
qui consomment le schéma de l'outil.

## 9. Verdict self-assessment

**NEEDS_REVIEW**, sur une seule question : **l'union doit-elle rendre `action` obligatoire
dans la variante de suivi, ou faut-il conserver `Parameters` en `Struct` et compter sur le
décodage de task.ts:391 ?**

L'enjeu est la compatibilité du schéma d'outil avec ses consommateurs au-delà de
task.ts — complétion TUI, conversion vers un format OpenAI/Anthropic, tout appelant de
`Parameters.fields`. Un `Schema.Union` sérialise en `anyOf` ; un `Struct` fully-optional
sérialise en un objet à propriétés optionnelles. Les deux sont valides, mais le second est
déjà widely-supported par les adaptateurs de ce dépôt et le premier demande une
vérification que je n'ai pas faite. Si le validateur juge que l'`anyOf` doit être évité,
l'alternative **A5** livre (a') sous forme de validation explicite à task.ts:391 — déjà
présente, mais remontée au schéma — plus (d), et laisse (b) et (c) pour une itération
suivante. Le arbitrage A1 → A2 → A5 est alors à faire explicitement.

Second point, non bloquant mais à trancher : `context_ref` est du texte libre injecté dans
un prompt. Je le déclare non-nouveau-risque parce que `prompt` l'est déjà et que
l'échappement est partagé. Si la politique du dépôt exige que le contexte parent n'entre
**jamais** dans un prompt enfant, alors (b) doit être remplacé par un canal structuré hors
prompt, ce qui change son estimation de **S** à **M**.