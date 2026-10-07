# P05 — DoD réémis deux fois par tour (`task-contract` + `risk_advisory`)

## 1. Problem

La liste des DoD est réinjectée à l'identique deux fois dans chaque tour de conversation — une fois dans `<task-contract>`, une fois dans `<risk_advisory>` — ce qui duplique ~240 tokens par tour et expose deux listes du même objet susceptibles de diverger.

## 2. Evidence

**Le premier émetteur — `<task-contract>`, toujours présent, porte la liste canonique.**

`packages/opencode/src/session/prompt.ts:2380-2386` :
```ts
            // Inject task contract (Goal/DoD) once per turn if available
            if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
              const goalInjectionStart = Date.now()
              const goalKey = `goal:${createHash("sha1").update(JSON.stringify(goalState)).digest("hex")}`
              const cachedGoal = injectionCache.get(goalKey)
              const goalCtx = cachedGoal.cached ? cachedGoal.value : injectionCache.set(goalKey, formatGoalContext(goalState))
              if (goalCtx) volatile.push(goalCtx)
```

`packages/opencode/src/session/compaction.ts:122-124` — le corps est la forme compressée de l'état :
```ts
  const body = state.compressed ?? compressGoalState(state)
  const sticky = stickyGoalContext(state)
  return `<task-contract status="${state.status}">\n${body}${sticky ? `${sticky}\n` : ""}</task-contract>\n`
```

`packages/opencode/src/session/goal-state.ts:86-88` — la ligne DoD canonique, déjà compactée :
```ts
  const lines: string[] = [`GOAL: ${goal}`]
  if (dod) lines.push(`DOD: ${dod}`)
  if (oos) lines.push(`OOS: ${oos}`)
```

**Le second émetteur — `buildRiskAdvisory` réémet chaque DoD ligne à ligne.**

`packages/opencode/src/session/lean-advisory.ts:20-31` :
```ts
export function buildRiskAdvisory(goal: GoalLike, stickyFindings: readonly string[]): string {
  const requirements = (goal.dod ?? []).map((item) => `- mandatory requirement: ${item}`)
  const findings = stickyFindings.map((item) => `- sticky finding: ${item}`)
  if (requirements.length === 0 && findings.length === 0) return ""
  return [
    "<risk_advisory>",
    "This is advisory only: it cannot downgrade user requirements, security gates, failures or unverified evidence.",
    ...requirements,
    ...findings,
    "Reuse proof only when its git/file/environment freshness still matches; uncertainty invalidates rather than skips it.",
    "</risk_advisory>",
  ].join("\n")
}
```
La ligne 21 est la source exacte de la duplication ; les lignes 26 et 29 sont du contenu non-DoD qui doit survivre au correctif.

**Le branchement qui produit la double émission à chaque tour.**

`packages/opencode/src/session/prompt.ts:2458-2472` :
```ts
              const qaAdvisory = flags.experimentalQaProofAdvisory ? buildQaProofAdvisory(goalState) : ""
              const riskAdvisory = flags.experimentalRiskPlannerAdvisory
                ? buildRiskAdvisory(goalState, collectStickyFindings(msgs))
                : ""
              const goalReminderText = [
                  "<goal_reminder>",
                  ...
                  qaAdvisory,
                  riskAdvisory,
                ].filter(Boolean).join("\n") + "\n"
```

**INVARIANT DÉCISIF — quand `<goal_reminder>` est émis, `<task-contract>` est nécessairement émis aussi.**

`packages/opencode/src/session/prompt.ts:2451` :
```ts
              const goalActive = !isTerminalStatus(goalState.status) && goalState.goal?.trim()
```
`packages/opencode/src/session/goal-state.ts:47-50` :
```ts
const TERMINAL_STATUSES: readonly GoalStatus[] = ["completed", "skipped", "blocked"]

/** True once the objective is done/skipped/blocked — used to stop injecting it as "to do". */
export const isTerminalStatus = (status: GoalStatus): boolean => TERMINAL_STATUSES.includes(status)
```
`skipped` ∈ `TERMINAL_STATUSES` ⇒ `goalActive` (prompt.ts:2451) ⇒ `status ≠ "skipped"` ⇒ la garde de prompt.ts:2381 (`goalState.status !== "skipped"`) est toujours franchie. **La seconde condition de cette garde (`!system.some(...)`) ne peut pas non plus neutraliser le contrat dans le même tour**, puisque le reminder se base sur le même `goalState` dans le même passage. Conséquence : l'advisory n'est **jamais** le porteur unique de la liste des DoD ; il y a toujours un porteur canonique en amont dans le même prompt.

**Ce qui change réellement d'un tour à l'autre (la partie volumineuse de l'advisory).**

`packages/opencode/src/session/lean-advisory.ts:34-46` — les findings sont reconstruits depuis le transcript à chaque tour :
```ts
export function collectStickyFindings(messages: readonly { parts: readonly unknown[] }[]): string[] {
  const result = new Set<string>()
  const pattern = /(?:\bSEC-[A-Z0-9_-]+\b.*\b(?:OPEN|RESIDUAL)\b|^\s*(?:RESIDUAL|UNVERIFIED)\b|\b(?:HIGH|CRITICAL)\b.*\b(?:OPEN|RESIDUAL)\b)/i
  for (const message of messages) {
```
Ils dépendent de `msgs` : ils évoluent avec la conversation. Les DoD, eux, ne changent qu'à l'édition de l'objectif.

**La liste des DoD est constante pendant l'objectif ; sa clé de cache ne change qu'à l'édition.**

`packages/opencode/src/session/prompt.ts:2383` (clé du contrat) et `prompt.ts:2454` (clé du reminder) incorporent `goalState.version`. `packages/opencode/src/session/goal-state.ts:104-109` :
```ts
/** Bump version + timestamp monotonically; guards against clock-skew regressions. */
export const touchGoalState = (gs: GoalState): GoalState => ({
  ...gs,
  version: gs.version + 1,
  updatedAt: Math.max(Date.now(), gs.updatedAt + 1),
})
```
La version n'est incrémentée que par `edit_objective`. Donc à chaque tour sans édition, les ~1100 caractères du contrat **et** les ~240 tokens de duplication sont réinjectés à l'identique.

**Les flags : ce sont des variables d'environnement, pas des clés de configuration.**

`packages/opencode/src/effect/runtime-flags.ts:4` :
```ts
const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
```
`packages/opencode/src/effect/runtime-flags.ts:52` et `:55-56` (les lignes 53-54, omises ici, portent d'autres drapeaux sans rapport) :
```ts
  experimentalLeanProtocolDedupe: bool("OPENCODE_EXPERIMENTAL_LEAN_PROTOCOL_DEDUPE"),
  ...
  experimentalQaProofAdvisory: bool("OPENCODE_EXPERIMENTAL_QA_PROOF_ADVISORY"),
  experimentalRiskPlannerAdvisory: bool("OPENCODE_EXPERIMENTAL_RISK_PLANNER_ADVISORY"),
```

Ces trois flags utilisent `bool()`, **pas** `enabledByExperimental()` (`runtime-flags.ts:11-14`, employé par exemple ligne 44-51). Conséquence : `OPENCODE_EXPERIMENTAL=1` **n'active pas** ces deux advisories ; seule la variable dédiée le fait. Par défaut elles sont donc **éteintes** (`Config.withDefault(false)`).

**Fait vérifié qui contredit la prémisse de l'audit : il n'existe aucune clé de configuration `experimental.qa_proof_advisory` ni `experimental.risk_planner_advisory`.**

Recherche sur `packages/opencode/src` des motifs `qaProof|riskPlanner|qa_proof|risk_planner` : 2 occurrences seulement, et ce sont les étiquettes XML du bloc advisory — `packages/opencode/src/session/lean-advisory.ts:9` `"<qa_proof_advisory>"` et `lean-advisory.ts:16` `"</qa_proof_advisory>"`. Aucun schéma de configuration ne porte ces clés. `INFERE:` la matrice P05 (`docs/harness-audit/README.md:27`) et l'énoncé du problème décrivent ces drapeaux comme une configuration ; vérifiable par `grep -rn "qa_proof|risk_planner" packages/opencode/src` qui ne renvoie que les deux étiquettes ci-dessus. **Le seul levier est la variable d'environnement, ce qui renforce la contrainte « ne pas supprimer les flags »** : c'est l'unique interrupteur opérateur existant.

**État des tests existants (aucun n'assert l'énumération).**

`packages/opencode/src/session/lean-advisory.test.ts:20-28` :
```ts
  test("risk advisory remains non-scoring and keeps open findings sticky", () => {
    const text = buildRiskAdvisory(
      { goal: "Ship safely", dod: ["security audit passes"] },
      ["SEC-001 HIGH OPEN: tenant filter missing"],
    )
    expect(text).toContain("SEC-001 HIGH OPEN")
    expect(text).toContain("advisory only")
    expect(text).not.toContain("score")
  })
```
Aucune assertion sur la liste des DoD. Recherche de `risk_advisory|mandatory requirement|goalReminder|buildRiskAdvisory` sous `packages/opencode/test` : **1 seule** occurrence, `packages/opencode/test/session/context-budget.test.ts:295`, qui est un simple découpage de section :
```ts
    ["goalReminder", /<goal_reminder>[\s\S]*?<\/goal_reminder>/],
```

## 3. Mechanism

Chemin d'exécution, un tour de conversation, de bout en bout :

1. Le planificateur entre dans la boucle de tour et récupère `goalState` (`prompt.ts:2381`).
2. **Passe A — contrat.** La garde `!system.some(e => e.includes("<task-contract")) && goalState.status !== "skipped"` est franchie (§2, invariant). `goalKey` (prompt.ts:2383) est un SHA-1 de `JSON.stringify(goalState)` ; il inclut `version`, donc reste stable tant que l'objectif n'est pas édité. `injectionCache.get` renvoie le contrat déjà sérialisé ; `formatGoalContext(goalState)` (`compaction.ts:112`) produit `<task-contract status="…">` + `compressGoalState` (ligne `DOD: a|b|c`, goal-state.ts:87) + `stickyGoalContext` (findings OPEN et gaps UNVERIFIED, compaction.ts:100-104). Le bloc est poussé dans `volatile` (prompt.ts:2386). **≈1 100 caractères.**
3. **Passe B — reminder + advisories.** `goalActive` est vrai (§2). La garde `!system.some(e => e.includes("<goal_reminder"))` passe. `reminderKey` (prompt.ts:2454) inclut `goalState.version` et les trois flags → **stable entre deux tours sans édition**. `buildQaProofAdvisory` (prompt.ts:2458) ne fait que *tester* le corpus DoD pour décider s'il parle d'UI (`lean-advisory.ts:6-7`) : il **n'énumère rien**, il n'est pas concerné par P05. `buildRiskAdvisory` (prompt.ts:2459-2461) exécute `lean-advisory.ts:21`, qui mappe **chaque** DoD vers une ligne `- mandatory requirement: …`, puis l'assemble avec les findings de `collectStickyFindings(msgs)` (§2) dans `goalReminderText` (prompt.ts:2462-2472). Le texte est mis en cache sous `reminderKey` (prompt.ts:2473-2475) et poussé dans `volatile` (prompt.ts:2476). **≈950 caractères, dont ≈240 tokens qui sont la copie littérale de la ligne `DOD:` de l'étape 2.**
4. Les deux blocs partent dans le **même** prompt système, dans le même tour. Le modèle voit donc deux listes du même objet, et le cache ne les rapproche jamais : il ne mémorise que la version par goal, pas la déduplication inter-blocs.
5. Résultat : ~515 tokens de contexte d'objectif par tour pour ~275 tokens d'information utile, et une divergence possible entre les deux listes (une édition d'objectif touche `version`, mais rien ne garantit que les deux rendus restent synchronisés si l'un des deux est tronqué par un mécanisme tiers).

## 4. Proposal

**Fichier modifié : un seul.** `packages/opencode/src/session/lean-advisory.ts`, fonction `buildRiskAdvisory` (lignes 20-32). **`prompt.ts` n'est pas modifié.**

**Distinction qui commande le correctif — le modèle doit relire à chaque tour ce qui change, et une seule fois ce qui est figé.**

| Contenu | Nature | Où il doit vivre |
|---|---|---|
| Liste des DoD (`DOD: a\|b\|c`) | **figée** pour toute la durée de l'objectif ; ne change qu'à `edit_objective` (`version`) | `<task-contract>` une fois (déjà le cas) |
| Findings `OPEN`/`RESIDUAL`/`CRITICAL` | **volatil** : reconstruit du transcript à chaque tour (`lean-advisory.ts:34`) | `<risk_advisory>` à chaque tour (déjà le cas) |
| Gaps non prouvés (`UNVERIFIED`) | **volatil** : change à chaque `complete_objective` refusé | `<task-contract>` sticky + garde de clôture |
| Séquence de vie (quand appeler `complete_objective`) | **figé** mais court | `<goal_reminder>` (inchangé) |
| Chemin de preuve UI → réseau → persistance → sécurité | invariant, sans état | `<qa_proof_advisory>` (inchangé) |

La liste des DoD est la seule ligne de l'advisory qui soit figée. C'est **exactement** la ligne à supprimer de l'advisory, puisque le porteur canonique est toujours présent plus haut dans le même prompt (invariant démontré au §2).

**Le correctif : remplacer l'énumération par une ligne de renvoi qui porte le décompte et l'instruction d'application, en conservant tout le reste à l'identique.**

```ts
export function buildRiskAdvisory(goal: GoalLike, stickyFindings: readonly string[]): string {
  const count = (goal.dod ?? []).length
  const findings = stickyFindings.map((item) => `- sticky finding: ${item}`)
  if (count === 0 && findings.length === 0) return ""
  return [
    "<risk_advisory>",
    "This is advisory only: it cannot downgrade user requirements, security gates, failures or unverified evidence.",
    `- mandatory requirements: the ${count} DoD item(s) of <task-contract>, each needing its own verifiable proof; not restated here.`,
    ...findings,
    "Reuse proof only when its git/file/environment freshness still matches; uncertainty invalidates rather than skips it.",
  ]
    .concat("</risk_advisory>")
    .join("\n")
}
```

Comportement qui change, précisément :

- `lean-advisory.ts:21` (`requirements`) disparaît : plus aucune ligne `- mandatory requirement: <texte du DoD>` n'est produite.
- Une ligne unique `- mandatory requirements: the N DoD item(s) of <task-contract>, each needing its own verifiable proof; not restated here.` la remplace — elle **préserve l'instruction d'appliquer chaque DoD** (points 4 de la demande) sans recopier le texte.
- La garde de retour anticipé passe de `requirements.length === 0` à `count === 0` : même sémantique, une variable de moins.
- La sortie est identique quand `dod` est vide (retour `""`), donc le comportement par défaut est strictement inchangé (§ ci-dessous).
- `buildQaProofAdvisory` n'est **pas** touché : il n'énumère aucun DoD (`lean-advisory.ts:6-7` s'en sert uniquement comme test deotif).

**Ce qui reste volontairement inchangé, et pourquoi :**

- **Les flags `experimentalQaProofAdvisory` / `experimentalRiskPlannerAdvisory` / `experimentalLeanProtocolDedupe` (prompt.ts:2454-2459) et leurs variables d'environnement (`runtime-flags.ts:52-56`) sont conservés.** Ils sont le seul levier opérateur existant (§2 : aucune clé de configuration n'existe). Le correctif ne change que le *contenu* produit quand le flag est actif, pas *quand* il est actif. Le défaut par défaut reste `false` (`runtime-flags.ts:4`), donc un opérateur sans variable d'environnement ne voit aucun changement de prompt.
- **`prompt.ts` n'est pas touché** : ni les gardes, ni les clés de cache (`prompt.ts:2383`, `2454`), ni l'assemblage (2462-2472). Le contrat et le cycle de vie restent des sources distinctes, ce qui préserve le découpage de sections du test de budget.
- **`<task-contract>` n'est pas touché** : c'est le porteur canonique ; le vider dégraderait le TUI et `working-state-runtime.test.ts:201`, qui vérifie que la carte est cohérente avec le `<task-contract>` injecté.
- **Les findings sticky et les deux phrases non-DoD (lignes 26 et 29 d'origine) sont conservés mot pour mot** : c'est la moitié utile et volatile de l'advisory.
- **La porte de preuve par DoD n'est pas déplacée.** Elle vit dans le schéma de l'outil, pas dans le prompt : `packages/opencode/src/tool/goal-contract.ts:450` (`"One entry per DoD item, each carrying a verifiable artifact. Required — completion is refused without it."`) et son application `goal-contract.ts:724` (`... No proof for DoD item: ${item}`). Le prompt n'était qu'un rappel ; la vérification est structurelle.

## 5. Alternatives considered

1. **Supprimer `experimentalRiskPlannerAdvisory`, ou mettre le flag à `true` par défaut pour activer le chemin léger.** Rejeté : cela tue la moitié volatile de l'advisory (les findings `OPEN`/`RESIDUAL` collectés à chaque tour par `lean-advisory.ts:34`), qui est précisément ce que le modèle doit relire à chaque tour ; et supprime l'échappatoire opérateur. Contredit la consigne de ne pas supprimer les flags. C'est aussi le défaut que P05 doit corriger, pas le commode.
2. **Ne lister les DoD dans l'advisory que lorsque le contrat est absent (paramètre `hasContract` threading depuis `prompt.ts`).** Rejeté pour v1 : la condition est *prouvablement* toujours fausse (`goal-state.ts:47` + `prompt.ts:2451` + `prompt.ts:2381`), donc elle ajoute un paramètre inter-modules et un second chemin de test pour couvrir une branche morte. YAGNI. Reste documenté en §6 comme parade si l'invariant casse un jour.
3. **Alléger le `<task-contract>` lui-même (par exemple ne plus émettre la ligne `DOD:`).** Rejeté : c'est le porteur canonique, il est lu par le TUI et par `working-state-runtime.test.ts:201`, et `prompt.test.ts:910` en compte les occurrences. Toucher la source de vérité est bien plus risqué que supprimer la copie.
4. **Déplacer l'énumération dans `<qa_proof_advisory>`** — même contenu, un autre bloc. Rejeté : ne supprime aucune duplication, seulement la change de place.

## 6. Risks

- **Régression sur les tests existants — aucun test n'assert l'énumération, vérifié :** `packages/opencode/src/session/lean-advisory.test.ts:20-28` n'assert que `SEC-001 HIGH OPEN`, `advisory only` et l'absence de `score` : reste vert. `packages/opencode/test/session/context-budget.test.ts:414` (`expect(stats.systemTotal).toBeLessThan(20000)`) et `:450` (`toBeLessThan(60000)`) sont des **bornes supérieures** : retirer des tokens ne peut que les éloigner du seuil. Le découpage de sections de `context-budget.test.ts:294-295` utilise `["taskContract", /<task-contract[\s\S]*?(?=<goal_reminder|<task_context|$)/]` : supprimer des lignes *après* `<goal_reminder>` ne peut pas le perturber. `packages/opencode/test/session/prompt.test.ts:910` (`system.match(/<task-contract/g)`) et `:1193` portent sur le contrat, que le correctif ne touche pas. **Réserve :** ces fichiers sont les concernés, mais je n'ai pas exécuté la suite — la commande du §7 est le criterion.
- **Coût tokens / latence : net négatif.** −240 tokens par tour selon la mesure terrain fournie, soit ≈47 % des ≈515 tokens que mobilise le contexte d'objectif (contract + advisory), et une fraction plus petite encore du prompt système total. Zéro coût CPU et zéro latence ajoutée : le `.map()` de `lean-advisory.ts:21` disparaît et le texte à hasher (`prompt.ts:2454`, `injectionCache.set` ligne 2475) est plus court. Le gain est proportionnel au nombre de tours.
- **Sécurité / gates : aucun gate n'est supprimé.** L'advisory est explicitement non-notant (`lean-advisory.ts:26` « cannot downgrade user requirements, security gates, failures or unverified evidence ») ; l'énumération supprimée n'était pas un gate. La preuve par DoD est imposée structurellement par `goal-contract.ts:450` et appliquée par `goal-contract.ts:724` (« No proof for DoD item »). Les findings de sécurité, eux, sont conservés verbatim. Aucun changement de surface d'injection ni de permissions.
- **Risque principal, explicitement demandé : le modèle peut-il perdre l'instruction d'appliquer *chaque* DoD ?** Trois responses, dont deux indépendantes du prompt :
  1. *La liste n'est pas perdue, elle est déplacée.* L'invariant du §2 garantit que le `<task-contract>` qui porte la liste est dans le même prompt, plus haut. Le modèle voit `DOD: a|b|c` puis, ~500 tokens plus bas, « the 3 DoD item(s) of `<task-contract>`, each needing its own verifiable proof ». C'est un renvoi dans le même document, pas une suppression d'information.
  2. *L'instruction d'application est redondante ailleurs.* `prompt.ts:2466` (« verify the objective and DoD against the actual result and todo state ») et `prompt.ts:2468` (« A required DoD item with no verifiable evidence leaves the objective open ») énoncent déjà la règle par item, dans le bloc que le correctif ne touche pas. Et `goal-contract.ts:450` l'énonce dans le schéma de l'outil.
  3. *Le décompte est conservé* (`the ${count} DoD item(s)`), ce qui donne au modèle un contrôle de cohérence : si la liste canonienne est tronquée ou absente, l'écart de compte est visible. Un `findings.length`-seul aurait rendu l'advisory muet dans ce cas.
- **Paradde si l'invariant du §2 se rompt (constatée, non activée).** Si un chemin futur émettait `<goal_reminder>` sans `<task-contract>`, le renvoi pointerait dans le vide. Parade : passer un `hasContract: boolean` depuis `prompt.ts` et n'émettre le renvoi que dans ce cas, sinon retomber sur l'énumération actuelle. Non implémenté ici (§5, option 2) parce que la branche est inatteignable ; à réactiver si `TERMINAL_STATUSES` (goal-state.ts:47) ou la garde de prompt.ts:2381 changent.
- **Fait hors périmètre à signaler :** il n'existe pas de clé de configuration `experimental.risk_planner_advisory` / `qa_proof_advisory` (§2), contrairement à ce que suggère la matrice `README.md:27`. Le correctif n'en ajoute pas — c'est un changement de surface de configuration qui dépasse P05 et应由 le validateur router séparément.

## 7. Tests

**1. Test unitaire — chemin exact : `packages/opencode/test/session/lean-advisory.test.ts`** (nouveau ; le test existant est colocalisé dans `src/`, le gabarit impose un chemin sous `test/`).

Commande exacte :
```
cd packages/opencode && bun test test/session/lean-advisory.test.ts
```

Critères de succès observables, sur des DoD sentinelles distincts de tout autre texte :
- `buildRiskAdvisory({ goal: "Ship safely", dod: ["DOD_SENTINEL_ALPHA", "DOD_SENTINEL_BETA"] }, [])` → `expect(text).not.toContain("DOD_SENTINEL_ALPHA")` et `not.toContain("DOD_SENTINEL_BETA")` (**le défaut est corrigé**) ;
- le même texte → `expect(text).toContain("<task-contract>")` et `expect(text).toContain("2 DoD item(s)")` (**le renvoi et le décompte subsistent**) ;
- `expect(text).toContain("its own verifiable proof")` (**l'instruction d'application par item subsiste**) ;
- avec findings : `expect(text).toContain("SEC-001 HIGH OPEN")` (**la moitié volatile est intacte**) ;
- `buildRiskAdvisory({ goal: "Ship safely", dod: [] }, [])` → `expect(text).toBe("")` (**défaut par défaut inchangé**) ;
- taille : `expect(text.length).toBeLessThan(400)` (**gain de place effectif**).

**2. Non-régression — les fichiers de test nommés au §6 :**
```
cd packages/opencode && bun test test/session/prompt.test.ts test/session/context-budget.test.ts test/tool/goal-contract.test.ts
```
Critère : code de sortie 0, et `context-budget.test.ts` conserve `systemTotal` sous les bornes de `:414` et `:450`.

**3. Non-régression de l'existant :**
```
cd packages/opencode && bun test src/session/lean-advisory.test.ts
```
Critère : code de sortie 0, les 3 tests existants passent (aucun n'assert l'énumération — §2).

## 8. Effort

`S` — une fonction de 13 lignes dans un fichier, plus un fichier de test ; le site d'assemblage, les flags, les caches et le contrat ne sont pas modifiés, et l'invariant de sécurité du renvoi est déjà démontré par trois assertions existantes.

## 9. Verdict self-assessment

`READY`.

L'invariant qui rend le correctif sûr est démontré, pas supposé : `TERMINAL_STATUSES` contient `skipped` (goal-state.ts:47), donc `goalActive` (prompt.ts:2451) implique `status ≠ "skipped"`, donc la garde de prompt.ts:2381 est toujours franchie et le `<task-contract>` porteur de la liste est toujours présent dans le même prompt que l'advisory. Aucun test n'assert l'énumération à supprimer ; les seuls tests qui lintent le prompt ont des bornes supérieures.

**Question à trancher (non bloquante, une seule) :** la ligne de renvoi doit-elle rester formule (« the N DoD item(s) of `<task-contract>` ») comme proposé, ou l'advisory doit-il ne plus mentionner les DoD du tout, au risque de perdre le rappel par item chez un modèle qui n'examine pas le contrat ? Le validateur tranche cette formulation ; le reste du correctif n'en dépend pas.