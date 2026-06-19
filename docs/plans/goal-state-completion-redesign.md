# Plan d'implémentation — Cycle de vie des objectifs (GoalState) par statut

> **Statut** : implémenté (F1/F2/F3/F4 intégrés) — build 1.18.44, typecheck OK, tests ciblés OK
> **Cible** : `packages/opencode` (fork)
> **Auteur** : analyse code-sourcée (prompt.ts, compaction.ts, goal-contract.ts, goal-state.ts, reminders.ts, registry.ts)
> **Branche** : `dev` (jamais `main`)

---

## 1. Problème (sourcé dans le code)

La fonctionnalité « contrat de tâche » (Objectif / DoD / Out-of-Scope) souffre de **deux défauts structurels**, pas d'un problème d'injection dans le compact.

### 1.1 Le contrat est **gelé à vie**
`packages/opencode/src/session/prompt.ts:2048-2089` — `ensureGoalState()` :

```ts
if (isValidGoalState(existing)) return existing   // ligne 2056
```

Dès qu'un `goalState` valide existe, il est renvoyé tel quel **à chaque step**, sans jamais être ré-évalué. Aucune mise à jour automatique quand l'utilisateur change de cap.

### 1.2 Le contrat est **réinjecté à chaque turn**, sans notion de « fait »
`packages/opencode/src/session/prompt.ts:1908-1912` :

```ts
if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
  const goalCtx = formatGoalContext(goalState)
  if (goalCtx) system.push(goalCtx)
}
```

L'enum de statut (`packages/opencode/src/session/goal-state.ts:4`) :

```ts
status: Schema.Literals(["draft", "pending_user", "approved", "edited", "skipped"])
```

**Il n'existe aucun statut « terminé / atteint ».** L'agent voit donc à chaque turn `<task-contract status="draft">GOAL: …ancien…</task-contract>` et **croit l'objectif non atteint** alors qu'il l'est. C'est l'observation terrain à corriger.

### 1.3 Démenti : ce n'est PAS injecté dans le compact
Le call de compaction (`packages/opencode/src/session/compaction.ts:520`) utilise `system: []`. Le task-contract n'est **pas** transmis au résumeur. Seule la section `## Goal` du `SUMMARY_TEMPLATE` (`compaction.ts:46`) reporte l'objectif, régénérée depuis la conversation. Les fonctions `compressGoalState` / `formatGoalContext` *vivent* dans `compaction.ts` (nom de module trompeur) mais sont **importées par `prompt.ts:74`** et utilisées pour l'injection live par-turn.

> **Conséquence** : retirer quoi que ce soit du compact ne corrige rien. Les deux leviers réels sont `ensureGoalState:2056` et la garde d'injection `prompt.ts:1909`.

---

## 2. Décision de conception

On **abandonne** la détection automatique « objectif changé à chaque prompt » (non fiable : jugement LLM subjectif, thrashing). On adopte un **cycle de vie par statut piloté par complétion** :

1. L'agent travaille sur l'objectif courant (`draft` / `edited`).
2. Quand il pense avoir fini → il appelle un nouveau tool **`complete_objectif`**.
3. Ce tool **demande confirmation à l'utilisateur** (tool `question`, en anglais).
   - **Oui** → statut passe à `completed`. L'objectif cesse d'être injecté comme « à faire ».
   - **Non + feedback** → statut inchangé, le feedback revient à l'agent qui continue.
4. Le **prochain prompt utilisateur après complétion** déclenche la **re-dérivation** de l'objectif à partir de ce nouveau prompt (sortie du gel `return existing`).

### 2.1 Limite assumée (périmètre)
Un **pivot en cours d'objectif** (l'utilisateur change d'avis *avant* que l'agent ait marqué `completed`) **n'est pas auto-détecté**. C'est accepté par conception (cf. décision utilisateur). Mitigation : un **reminder** instruit l'agent — si le nouveau prompt diverge de l'objectif courant, il doit appeler `edit_objectif` (pivot) ou `complete_objectif` (fini). Le levier humain/agent remplace l'auto-détection.

---

## 3. Modèle de données

### 3.1 Enum de statut — `packages/opencode/src/session/goal-state.ts:4`
Ajouter `"completed"` :

```ts
status: Schema.Literals(["draft", "pending_user", "approved", "edited", "completed", "skipped"]),
```

### 3.2 Champ d'ancrage (anti-régénération intra-turn)
Ajouter un champ optionnel pour savoir **de quel message utilisateur** l'objectif a été dérivé. Permet de distinguer « même turn, je viens de finir » de « nouveau prompt après complétion ».

```ts
anchorUserID: Schema.optional(Schema.String),   // id du message user source de l'objectif
```

> **Aucune migration DB.** La colonne `goal_state` est `text({ mode: "json" }).$type<GoalState>()` (`packages/opencode/src/session/session.sql.ts:51`). Un champ JSON optionnel se sérialise sans schéma SQL à régénérer.

---

## 4. Changements de comportement

### 4.1 `ensureGoalState()` — `prompt.ts:2048-2089` (le cœur)
Nouvelle logique **avant** le `isValidGoalState` :

```
existing = session.goalState
lastUserID = input.lastUserID

if existing && existing.status === "completed":
    if existing.anchorUserID === lastUserID:
        return existing            // même turn : objectif fini, pas de nouveau prompt → on NE régénère PAS
    // F2 : ne régénérer que sur un VRAI nouveau prompt substantiel.
    currentUserText = getUserPromptText(currentUserMsg(lastUserID)).trim()
    isSubstantial = currentUserText.length >= 40 && !isContinuationPrompt(currentUserText)
    if !isSubstantial:
        return existing            // "ok"/"continue" → garder completed (pas de résurrection)
    // sinon : fall-through vers la régénération ci-dessous
else if isValidGoalState(existing):
    return existing                // comportement sticky inchangé pour draft/edited/approved

// régénération depuis le prompt courant :
nextState = { ...draft from buildGoalSourceText..., status: "draft", source: "auto",
              anchorUserID: lastUserID, version: previousVersion + 1 }
setGoalState(nextState)
```

Points d'attention :
- `anchorUserID` doit être posé **à chaque création/régénération** (ici) **et** par les tools `create/edit/apply/complete` (cf. §5).
- `isValidGoalState` (`prompt.ts:280-286`) renvoie `false` pour `skipped`. Vérifier qu'on ne casse rien : `completed` est traité **avant** cet appel, donc pas besoin de modifier `isValidGoalState`. (Optionnel : ajouter `if (goalState.status === "completed") return false` par sécurité défensive.)

### 4.2 Garde d'injection — `prompt.ts:1909`
Aujourd'hui : `goalState.status !== "skipped"`. Nouveau : ne pas injecter le contrat « à faire » si `completed`. Deux options :

- **Option minimale** : `&& goalState.status !== "skipped" && goalState.status !== "completed"` → rien n'est injecté quand fini.
- **Option recommandée** : injecter une **bannière courte** « objectif terminé, en attente de nouvelles instructions » (cf. §4.3) pour éviter que l'agent recommence le travail. Implémentée dans `formatGoalContext`.

### 4.3 `formatGoalContext()` — `compaction.ts:112-117`
Gérer le cas `completed` :

```ts
export function formatGoalContext(state: GoalState): string {
  if (state.status === "skipped") return ""
  if (state.status === "completed") {
    return `<task-contract status="completed">\nGOAL (DONE): ${oneLine(state.goal)}\nAwaiting a new objective from the user.\n</task-contract>\n`
  }
  const body = state.compressed ?? compressGoalState(state)
  return `<task-contract status="${state.status}">\n${body}</task-contract>\n`
}
```

### 4.4 Badge de statut — `compaction.ts:120-128` (CASSE LA COMPILATION si oublié)
`formatGoalStatusBadge` utilise `Record<GoalState["status"], string>` → **exhaustivité TypeScript obligatoire**. Ajouter la clé :

```ts
const labels: Record<GoalState["status"], string> = {
  approved: "approuvé",
  draft: "brouillon",
  skipped: "ignoré",
  edited: "édité",
  pending_user: "en attente",
  completed: "terminé",   // ← AJOUT obligatoire sinon erreur TS2741
}
```

---

## 5. Nouveau tool `complete_objectif` / `complete_objective`

### 5.1 Emplacement
Ajouter dans `packages/opencode/src/tool/goal-contract.ts` (à côté de `create`/`edit`/`apply`).

### 5.2 Signature & flux (Option A — recommandée : confirmation intégrée)

```ts
export const CompleteObjectifTool = Tool.define<typeof CompleteParams, Metadata, Question.Service>(
  "complete_objectif",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const question = yield* Question.Service
    return {
      description: "Mark the current task objective as achieved. Triggers a user confirmation prompt before finalizing.",
      parameters: CompleteParams,   // { summary?: string } — résumé de ce qui a été fait
      execute: (params, ctx) => Effect.gen(function* () {
        const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
        const previous = session.goalState ?? null
        if (!previous || !previous.goal?.trim())
          return responseResult({ status: "error", action: "complete", warnings: ["No objective to complete."] })
        if (previous.status === "completed")
          return responseResult({ status: "ok", action: "complete", warnings: ["Already completed."], goalState: previous })

        // 1) Confirmation utilisateur (anglais)
        const answers = yield* question.ask({
          sessionID: ctx.sessionID,
          questions: [{
            question: `Is this objective achieved?\n\nObjective: ${previous.goal}\n${params.summary ? `\nWhat was done: ${params.summary}` : ""}`,
            header: "Objective reached?",
            options: [
              { label: "Yes, objective reached", description: "Mark the objective as completed." },
              { label: "No — something is missing", description: "Tell the agent what still needs to be done." },
            ],
          }],
          tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
        })
        const reply = answers[0]?.[0] ?? ""
        const confirmed = /^yes/i.test(reply)

        // 2a) Refusé → on garde le statut, on remonte le feedback
        if (!confirmed) {
          return responseResult({
            status: "ok", action: "complete", warnings: [],
            // le feedback "ce qui n'a pas été bien fait" est dans `reply`
            // l'agent doit continuer le travail
            goalState: previous,
          }) // output = `User says not done: ${reply}. Continue working.`
        }

        // 2b) Confirmé → statut completed
        const lastUserID = lastUserMessageID(ctx.messages)
        const next = { ...previous, status: "completed", anchorUserID: lastUserID,
                       version: previous.version + 1, updatedAt: Date.now() }
        yield* sessions.setGoalState({ sessionID: ctx.sessionID, goalState: next })
        return responseResult({ status: "ok", action: "complete", warnings: [], goalState: next })
      }),
    }
  }),
)
export const CompleteObjectiveTool = Tool.define("complete_objective", /* idem */)
```

> `responseResult` et le type `ContractToolResponse` (`goal-contract.ts:17-37`) doivent accepter `action: "complete"`. Ajouter `"complete"` à l'union `action`.

### 5.3 Fallback headless (NON-DIT critique)
Le tool `question` n'est exposé que si `questionEnabled` (`registry.ts:307`). En mode non-interactif (CI, `flags.client !== "cli"`, pas de UI), `question.ask` **bloque** sur un `Deferred` jamais résolu (`question/index.ts:155-180`) → **deadlock**.

**Mitigation obligatoire** : avant `question.ask`, détecter l'absence d'interface (via `RuntimeFlags` / `questionEnabled`) et, dans ce cas, **marquer `completed` directement sans confirmation** (log d'info). À spécifier explicitement dans l'implémentation.

### 5.4 Enregistrement — `packages/opencode/src/tool/registry.ts`
- Importer `CompleteObjectifTool`, `CompleteObjectiveTool`.
- `custom` map (≈ ligne 291-296) : ajouter `complete_objectif`, `complete_objective`.
- `builtin` array (≈ ligne 321-326) : ajouter `tool.complete_objectif`, `tool.complete_objective`.
- Mettre à jour le test `packages/opencode/test/tool/registry.test.ts:147-151` (ajouter les deux ids).

---

## 6. Reminder / instruction agent

### 6.1 Où
`packages/opencode/src/session/reminders.ts` — `SessionReminders.apply` (appelé `prompt.ts:1809`). Ajouter un bloc injecté quand un `goalState` actif existe (statut `draft`/`edited`/`approved`).

### 6.2 Contenu (synthétique, adapté à `rollout.systemBoilerplate`)
```
<goal_reminder>
- When you believe the current objective is achieved, call `complete_objectif`
  (it will ask the user to confirm). Do this when you finish your last todo.
- If the user's latest message diverges from the current objective:
  pivot → `edit_objectif`, or finish first → `complete_objectif`.
</goal_reminder>
```

> ⚠️ Garde-fou : ce reminder **encourage** mais ne garantit pas. La fiabilité réelle vient du fait que `complete_objectif` est la **seule** porte de sortie du gel (§4.1) + le déclencheur todo (§7).

---

## 7. Couplage avec les todos (point 5 utilisateur)

**Objectif** : nudger l'agent à compléter l'objectif quand tous les todos sont faits.

**État actuel** : aucun lien entre le tool `todo` et `goalState`. À investiguer : où l'état des todos est stocké (tool `todo`, `packages/opencode/src/tool/`).

**Implémentation proposée** (après investigation) : dans la construction du reminder (§6) ou dans l'injection par-turn, détecter « tous les todos `completed` » et, si l'objectif est encore actif, injecter :
```
All todos are complete. If the objective is achieved, call `complete_objectif` now.
```

> **Marqué comme tâche d'investigation**, pas comme acquis — le couplage dépend de l'API du tool `todo` non auditée dans ce plan.

---

## 8. Liste des fichiers à modifier (récapitulatif)

| # | Fichier | Changement | Risque |
|---|---------|-----------|--------|
| 1 | `session/goal-state.ts:4` | + statut `"completed"` ; + champ `anchorUserID?` | faible |
| 2 | `session/compaction.ts:120-128` | + clé `completed` dans `formatGoalStatusBadge` | **build TS** si oublié |
| 3 | `session/compaction.ts:112-117` | branche `completed` dans `formatGoalContext` | faible |
| 4 | `session/prompt.ts:2048-2089` | logique `completed` + `anchorUserID` dans `ensureGoalState` | **élevé** (cœur) |
| 5 | `session/prompt.ts:1909` | garde d'injection : exclure `completed` | faible |
| 6 | `tool/goal-contract.ts` | + `CompleteObjectifTool` / `CompleteObjectiveTool` ; action `"complete"` ; `anchorUserID` posé par create/edit/apply | moyen |
| 7 | `tool/registry.ts:291-326` | enregistrer les 2 tools | faible |
| 8 | `session/reminders.ts` | + bloc `goal_reminder` | faible |
| 9 | `test/tool/registry.test.ts:147-151` | + ids `complete_objectif`/`complete_objective` | faible |
| 10 | `tool/goal-contract.txt` (si description externe) / descriptions | textes des tools | faible |

> **Surface Go/TUI** : `rg` sur `packages/tui` → **0 référence** à goal/objective. Aucun travail Go. Le badge TUI (`formatGoalStatusBadge`) est TS uniquement.

---

## 9. Plan de tests

### 9.1 Unitaires
- `ensureGoalState` : 
  - objectif `completed` + même `lastUserID` → renvoyé tel quel (pas de régénération).
  - objectif `completed` + `lastUserID` différent → régénère un `draft` depuis le nouveau prompt, `anchorUserID` = nouveau.
  - objectif `draft` valide → sticky (inchangé).
- `formatGoalContext` : `completed` → bannière "DONE", pas le bloc DoD.
- `formatGoalStatusBadge` : mappe `completed` → "terminé".
- `complete_objectif` : 
  - pas d'objectif → erreur.
  - déjà `completed` → no-op ok.
  - confirmation "Yes" → `setGoalState` statut `completed`.
  - confirmation "No" → statut inchangé, output contient le feedback.
  - **headless (pas de question UI)** → marque `completed` sans blocage.

### 9.2 Intégration
- Scénario : objectif A créé → travail → `complete_objectif` (Yes) → nouveau prompt B → le `<task-contract>` injecté reflète B, pas A.
- Régression : un objectif `draft` non complété reste injecté à chaque turn (comportement actuel préservé).

### 9.3 Build
- `skill("fork-build")` **obligatoire** avant tout build (règle AGENTS.md du fork).
- `bun run typecheck` doit passer (exhaustivité `Record` du badge).

---

## 10. Critères d'acceptation (mappés au besoin)

| Besoin utilisateur | Critère vérifiable |
|--------------------|--------------------|
| Objectif réinjecté à chaque prompt, comparé | Injection par-turn conservée (`prompt.ts:1909`) ; comparaison remplacée par cycle de statut |
| Si « objectif changé » → mise à jour | `completed` + nouveau prompt → re-dérivation auto (`ensureGoalState`) |
| Ne pas injecter pendant la compaction | Déjà le cas (`compaction.ts:520` `system:[]`) — **documenté, rien à faire** |
| Agent marque l'objectif atteint | tool `complete_objectif` + statut `completed` |
| Confirmation utilisateur | `question.ask` dans le tool (anglais) avec option "what's missing" |
| Couplage fin de todo | reminder + nudge todos-complétés (§7, à investiguer) |

---

## 11. Ordre d'exécution recommandé pour les agents

1. **Data model** (#1) — enum + champ. Compiler.
2. **Build-breakers** (#2) — badge exhaustif. Compiler.
3. **Injection & format** (#3, #5) — `formatGoalContext` + garde.
4. **Cœur** (#4) — `ensureGoalState`. Tests unitaires immédiats.
5. **Tool** (#6, #7) — `complete_objectif` + registry + test registry.
6. **Reminder** (#8).
7. **Todo coupling** (#7 du plan) — après investigation tool `todo`.
8. **Build complet** (`fork-build`) + typecheck + tests.

Chaque étape = un commit `feat(core): …` ou `feat(opencode): …` (Conventional Commits, scope `core`/`opencode`).

---

# REVUE CRITIQUE DU PLAN (2ᵉ passe — failles & non-dits)

> Audit du plan ci-dessus contre le code réel, pour éviter qu'un agent l'exécute avec des angles morts. Classé par sévérité.

## 🔴 BLOQUANT

### F1 — Contradiction interne du plan (gate vs bannière)
Le §4.2 **table #5** dit « exclure `completed` de la garde d'injection `prompt.ts:1909` », mais le §4.3 **recommande une bannière** `<task-contract status="completed">` qui exige que `completed` **passe** la garde. Les deux sont incompatibles.
**Résolution** : garder la garde à `status !== "skipped"` **uniquement**, et laisser `formatGoalContext` décider (bannière pour `completed`, bloc DoD sinon). **Supprimer** la mention « exclure completed » de la garde. Mettre à jour table #5 → « garde inchangée ; le filtrage `completed` est dans `formatGoalContext` ».

### F2 — Résurrection de l'objectif terminé sur prompt de continuation
`buildGoalSourceText` (`prompt.ts:288-305`) : si le nouveau prompt est court/continuation (`"ok"`, `"continue"`), il **retombe sur les 3 derniers messages user** — qui contiennent le prompt de l'objectif **qu'on vient de terminer**. Conséquence : après `completed` + « continue », la régénération **ressuscite l'objectif A** et l'agent le **refait**. C'est exactement le bug que la feature veut tuer.
**Résolution obligatoire** : dans la branche « `completed` + nouveau `lastUserID` » de `ensureGoalState`, si `isContinuationPrompt(currentPrompt)` → **NE PAS régénérer** ; garder `completed` (bannière « awaiting a new objective ») et laisser l'agent demander la suite. Ne régénérer que sur un **vrai** nouveau prompt substantiel (`!isContinuationPrompt && length ≥ seuil`).

### F3 — Confirmation bloquante dans un sous-agent / run non-interactif
Le tool `complete_objectif` appelle `question.ask` → `Deferred` bloquant (`question/index.ts:155-180`). Dans un **sous-agent** (`task`) ou un run headless, la question peut ne jamais remonter à l'humain → **deadlock du sous-agent**.
Le §5.3 mentionne le fallback headless mais **pas le cas sous-agent**. 
**Résolution** : court-circuiter la confirmation si `questionEnabled === false` **OU** si l'exécution est un sous-agent (détecter via le contexte d'agent / `flags.client`). Dans ces cas → marquer `completed` directement, log d'info. **Critère de test dédié** (déjà en §9.1, étendre au cas sous-agent).

## 🟠 ÉLEVÉ

### F4 — Le `## Goal` de la compaction reste désaligné (vecteur d'origine non traité)
Le `SUMMARY_TEMPLATE` (`compaction.ts:46`) demande au résumeur de produire une section `## Goal` **dérivée de toute l'historique**, indépendamment du `goalState`. Après complétion + nouvel objectif, une compaction peut faire **resurgir l'ancien objectif** dans le résumé persistant — c'est *précisément* l'intuition « le compact désoriente » de l'utilisateur, et **le plan ne le traite pas**.
**Résolution proposée** : injecter le `goalState.goal` **courant** dans le contexte de compaction (via `buildPrompt({ context })` ou le hook `experimental.session.compacting`) pour que `## Goal` reflète l'objectif actif/terminé, pas l'historique brut. **Décision à acter** (in-scope ou follow-up ?).

### F5 — Qualité de la régénération automatique (heuristique faible)
La re-dérivation post-complétion utilise `generateGoalDraft` (`prompt.ts:2394`) : 1ʳᵉ phrase = goal, puces = DoD, sinon **DoD générique fallback**. Pour un prompt en prose sans puces, l'objectif régénéré est **pauvre** et devient *sticky* (statut `draft`) → l'agent travaille sur un contrat médiocre.
**Résolution** : après régénération auto, le **reminder** (§6) doit explicitement inviter l'agent à **raffiner via `edit_objectif`** au step 1 si le DoD est le fallback générique. Alternative plus robuste (hors scope ?) : régénération **LLM** plutôt qu'heuristique.

## 🟡 MOYEN

### F6 — Feedback du « No » doit atteindre l'agent en clair
Au refus de confirmation, `responseResult` sérialise `result` en JSON (`goal-contract.ts:177-183`) ; le texte « ce qui n'a pas été fait » (`reply`) doit apparaître dans le champ **`output`** lisible, pas seulement dans `metadata`. 
**Résolution** : pour la branche refus, retourner un `output` custom : `"User says the objective is NOT done: <reply>. Continue working on it."` Sans ça, l'agent peut ignorer le feedback.

### F7 — Risque de snapshot/test sur le system prompt
`packages/opencode/test/session/prompt.test.ts:853` compte les occurrences de `<task-contract` (attendu : 1/turn) et `:846` attend `status === "draft"`. Le `<goal_reminder>` (tag distinct) n'impacte pas le compte ✅, mais **tout test** assertant le contenu exact du system prompt peut casser.
**Résolution** : exécuter `prompt.test.ts` après chaque modif d'injection ; ajuster les assertions si le `goal_reminder`/bannière change le contenu attendu. Lister explicitement dans le run de tests.

### F8 — `anchorUserID` : sur-spécifié dans le plan
Le §5.2/§8 dit que `create/edit/apply` doivent poser `anchorUserID`. **Inutile** : la branche `completed` est la seule à le lire. Il suffit que **`complete_objectif`** (au moment de la confirmation) et **`ensureGoalState`** (à la régénération) le posent. 
**Résolution** : simplifier — ne pas toucher `create/edit/apply`. Réduit la surface de modif de #6.

### F9 — `formatGoalContext` : helper `oneLine` inexistant
Le pseudo-code §4.3 référence `oneLine(state.goal)` qui n'existe pas. Réutiliser la logique de `compressGoalState` (slice 200, strip `\n`) ou inliner. Détail d'implémentation à ne pas copier tel quel.

## ⚪ FAIBLE / À NOTER

- **F10 — Interaction avec `approved` / `pending_user`** : peut-on compléter un objectif `pending_user` (en attente d'approbation) ? Le plan ne tranche pas. Défaut raisonnable : `complete_objectif` autorisé quel que soit le statut actif (sauf `skipped`/`completed`). À documenter dans la description du tool.
- **F11 — Multi-objectifs / historique** : la complétion **écrase** (pas d'historique des objectifs successifs). Acceptable pour v1 → **explicitement Out-of-Scope**. À noter dans le contrat de tâche.
- **F12 — Couplage todo (§7) non audité** : le lien « tous les todos faits → nudge » dépend de l'API du tool `todo` non lue. Reste une **tâche d'investigation**, pas un acquis. Ne pas le promettre comme livré.
- **F13 — Course intra-turn** : après que `complete_objectif` pose `completed`, le `const goalState` capturé en début de step est périmé pour la fin du step courant ; corrigé au step suivant (ensureGoalState relit). Inoffensif mais à garder en tête pour les tests d'intégration.

## Verdict de la revue
Le plan est **exécutable** mais **F1 (contradiction)**, **F2 (résurrection sur continuation)** et **F3 (deadlock sous-agent)** sont **bloquants** : un agent qui exécute le plan tel quel produirait un comportement incorrect ou un blocage. **F4** est le non-dit conceptuel le plus important (il touche au cœur de la plainte initiale). À traiter avant de lancer l'implémentation.

### Corrections à intégrer au plan avant exécution
1. F1 → corriger §4.2 + table #5 (garde inchangée, filtrage dans `formatGoalContext`).
2. F2 → ajouter le garde `isContinuationPrompt` dans la branche régénération de `ensureGoalState`.
3. F3 → étendre le fallback no-confirmation aux sous-agents.
4. F4 → décider : aligner `## Goal` de compaction sur le `goalState` courant (in-scope recommandé).
5. F5/F6/F8 → ajustements ciblés (reminder de raffinage, output custom du refus, simplifier `anchorUserID`).

