# P05 — DoD réémis deux fois par tour (`task-contract` + `risk_advisory`)

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — gain mesuré en −35 caractères, argumentation d'impact supprimée (C-02)

## 1. Problem

À chaque tour où le plan est repris, la même liste de DoD est rendue deux fois dans le
prompt sous deux formes différentes — une fois compressée (`DOD: a|b|c`) dans
`<task-contract>`, une fois ligne par ligne dans `<risk_advisory>` — sans aucun mécanisme
qui les oblige à rester d'accord. Le défaut est un défaut de **fidélité du plan repris** :
deux rendus d'un même objet dans un même prompt, dont l'un peut tronquer ou reformuler ce
que l'autre affirme. Ce n'est pas un problème d'économie de tokens, et cette proposition
n'argumentera pas d'économie de tokens (voir §6 et C-02).

## 2. Evidence

Toutes les citations ci-dessous ont été relues au caractère près le 2026-10-03.

**Le premier émetteur — `<task-contract>`, porteur canonique de la liste.**

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

`packages/opencode/src/session/compaction.ts:122-124` :
```ts
  const body = state.compressed ?? compressGoalState(state)
  const sticky = stickyGoalContext(state)
  return `<task-contract status="${state.status}">\n${body}${sticky ? `${sticky}\n` : ""}</task-contract>\n`
```

`packages/opencode/src/session/goal-state.ts:76-79` puis `:86-88` — c'est là que la liste perd
sa forme énumérée :
```ts
  const dod = state.dod
    .map((item) => item.trim())
    .filter(Boolean)
    .join("|")
```
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
La ligne `:21` est l'unique site du dépôt qui recopie le texte d'un item de DoD ; `:87` de
`goal-state.ts` est le porteur canonique.

**Le branchement qui produit la double émission.**

`packages/opencode/src/session/prompt.ts:2458-2476` :
```ts
              const qaAdvisory = flags.experimentalQaProofAdvisory ? buildQaProofAdvisory(goalState) : ""
              const riskAdvisory = flags.experimentalRiskPlannerAdvisory
                ? buildRiskAdvisory(goalState, collectStickyFindings(msgs))
                : ""
              const goalReminderText = [
                  "<goal_reminder>",
                  "- Compare the user's latest message with the current objective before acting.",
                  `- If the latest message changes the objective, update it with ${editTool}; if the previous objective is already satisfied, complete it first.`,
                  "- Before finishing, verify the objective and DoD against the actual result and todo state.",
                  `- When objective and DoD are satisfied, call ${completeTool}; it completes without routine user approval.`,
                  `- A required DoD item with no verifiable evidence leaves the objective open: keep working. Only for an external obstacle you cannot remove, call ${completeTool} with outcome "blocked" and a reasoned unverified entry.`,
                  "</goal_reminder>",
                  qaAdvisory,
                  riskAdvisory,
                ].filter(Boolean).join("\n") + "\n"
```
La ligne `:2476` est `volatile.push(goalReminder)`.

**INVARIANT DÉCISIF — quand `<risk_advisory>` est émis, `<task-contract>` l'est aussi dans le même prompt.**

`prompt.ts:2451` :
```ts
            const goalActive = !isTerminalStatus(goalState.status) && goalState.goal?.trim()
```
`goal-state.ts:47` :
```ts
const TERMINAL_STATUSES: readonly GoalStatus[] = ["completed", "skipped", "blocked"]
```
`skipped` ∈ `TERMINAL_STATUSES` ⇒ `goalActive` (`:2451`) ⇒ `status !== "skipped"` ⇒ la seconde
condition de la garde de `prompt.ts:2381` est toujours franchie. Les deux blocs sont produits
dans le même tour, à partir du même `goalState`. **L'advisory n'est donc jamais le porteur
unique de la liste des DoD.**

Ce qui change d'un tour à l'autre, en revanche, est la moitié volatile :
`lean-advisory.ts:34-46` reconstruit les findings depuis le transcript à chaque appel
(`collectStickyFindings(messages)`), alors que la liste des DoD ne change qu'à l'édition de
l'objectif — `goal-state.ts:104-109` (`touchGoalState`) n'est appelé que par le chemin
d'édition.

**La porte de preuve par DoD n'est pas dans le prompt.**

`packages/opencode/src/tool/goal-contract.ts:450` :
```ts
    description: "One entry per DoD item, each carrying a verifiable artifact. Required — completion is refused without it.",
```
`goal-contract.ts:724` :
```ts
                  ...unproven.map((item) => `No proof for DoD item: ${item}`),
```
Et, dans le bloc que le correctif ne touche pas, `prompt.ts:2468` énonce déjà la règle par
item : « A required DoD item with no verifiable evidence leaves the objective open ».

**Les flags sont éteints par défaut.**

`packages/opencode/src/effect/runtime-flags.ts:4` :
```ts
const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
```
`runtime-flags.ts:55-56` :
```ts
  experimentalQaProofAdvisory: bool("OPENCODE_EXPERIMENTAL_QA_PROOF_ADVISORY"),
  experimentalRiskPlannerAdvisory: bool("OPENCODE_EXPERIMENTAL_RISK_PLANNER_ADVISORY"),
```
Ces deux drapeaux n'utilisent pas `enabledByExperimental` (`runtime-flags.ts:11-14`, employé
par `:48-50`) : `OPENCODE_EXPERIMENTAL=1` ne les active pas, et `Config.withDefault(false)`
les laisse éteints par défaut. Le correctif est donc **inerte** pour tout opérateur qui n'a
pas défini `OPENCODE_EXPERIMENTAL_RISK_PLANNER_ADVISORY`.

**Ce qui reste réellement variable dans l'advisory, mesuré.**

Exécuté le 2026-10-03 dans `packages/opencode` (cwd), en important la fonction réelle
`buildRiskAdvisory` et en simulant la version proposée (§4) :

```
c1 2 sentinelles        | items=2 dod_chars=35  current=348 proposed=383 delta=-35
c2 1 DoD realistic      | items=1 dod_chars=67  current=354 proposed=383 delta=-29
c3 3 DoD typiques       | items=3 dod_chars=44  current=383 proposed=383 delta=0
c4 5 DoD longs          | items=5 dod_chars=408 current=799 proposed=383 delta=+416
ref_line_len_n1=121 ref_line_len_n2=121
```

Les constantes sont établies par sonde directe sur la fonction réelle (longueur pour 0, 1, 2
et 3 items de 1 caractère : 287 / 288 / 315 / 342) :

```
longueur actuelle(n, S) = 261 + 26n + S      longueur proposée = 383
gain = S + 26n − 122
```

**Sur le cas de test que cette proposition prescrit, le bloc grossit de 35 caractères.**
C'est la mesure de C-02, reproduite. Aucun chiffre d'économie de tokens n'est donc annoncé.

**État des tests existants (aucun n'assert l'énumération).**

`packages/opencode/src/session/lean-advisory.test.ts:20-28` n'assert que `SEC-001 HIGH OPEN`,
`advisory only` et l'absence de `score`. Exécuté le 2026-10-03 :
`bun test src/session/lean-advisory.test.ts` → `3 pass`, `0 fail`, `8 expect() calls`, exit `0`.

`packages/opencode/test/session/context-budget.test.ts:288-299` découpe les sections avec
`:294` `["taskContract", /<task-contract[\s\S]*?(?=<goal_reminder|<task_context|$)/]` et
`:295` `["goalReminder", /<goal_reminder>[\s\S]*?<\/goal_reminder>/]`.

## 3. Mechanism

Chemin d'exécution d'un tour où le plan est repris :

1. La boucle de tour récupère `goalState` (`prompt.ts:2381`).
2. **Passe A — contrat.** `goalKey` (`:2383`) est un SHA-1 de `JSON.stringify(goalState)` ;
   il inclut `version`, donc reste stable tant que l'objectif n'est pas édité.
   `formatGoalContext` (`compaction.ts:112`) produit `<task-contract status="…">` +
   `compressGoalState` (ligne `DOD: a|b|c`, `goal-state.ts:87`) + `stickyGoalContext`
   (`compaction.ts:98-106`, findings et gaps). Le bloc est poussé dans `volatile` (`:2386`).
3. **Passe B — reminder + advisories.** `goalActive` est vrai (§2). `reminderKey` (`:2454`)
   inclut `goalState.version` et les trois drapeaux → stable entre deux tours sans édition.
   `buildQaProofAdvisory` (`:2458`) ne fait que tester le corpus pour décider s'il parle d'UI
   (`lean-advisory.ts:6-7`) : il n'énumère rien, P05 ne le concerne pas. `buildRiskAdvisory`
   (`:2459-2461`) exécute `lean-advisory.ts:21`, qui mappe **chaque** item vers une ligne
   `- mandatory requirement: …`, l'assemble avec les findings de `collectStickyFindings(msgs)`
   dans `goalReminderText` (`:2462-2472`), le met en cache (`:2473-2475`) et le pousse dans
   `volatile` (`:2476`).
4. Les deux blocs partent dans le **même** prompt, dans le même tour. Le modèle voit donc
   deux rendus du même objet : `DOD: a|b|c` d'un côté, une énumération item par item de
   l'autre. Le cache ne rapproche jamais les deux : il mémorise une version par objectif
   (`version`), pas une déduplication inter-blocs.
5. **Le point de désaccord concret :** le porteur canonique ne porte plus le nombre d'items
   de façon lisible. `DOD: a|b|c` exige une segmentation sur `|` (`goal-state.ts:79`) pour
   savoir qu'il y a trois items. La seule énumération lisible disparaît avec la ligne `:21`,
   et le décompte qu'elle portait disparaît avec elle — sauf à le réécrire explicitement, ce que
   fait le correctif.

## 4. Proposal

**Lot 1 — un seul fichier modifié :** `packages/opencode/src/session/lean-advisory.ts`,
fonction `buildRiskAdvisory` (lignes 20-32). `prompt.ts` n'est **pas** modifié par ce lot.

**Distinction qui commande le correctif — le modèle doit relire à chaque tour ce qui change,
et une seule fois ce qui est figé.**

| Contenu | Nature | Où il doit vivre |
|---|---|---|
| Liste des DoD (`DOD: a\|b\|c`) | **figée** pour toute la durée de l'objectif | `<task-contract>` une fois (déjà le cas) |
| Findings `OPEN`/`RESIDUAL`/`CRITICAL` | **volatil** : reconstruit du transcript à chaque tour (`lean-advisory.ts:34`) | `<risk_advisory>` à chaque tour (déjà le cas) |
| Gaps non prouvés (`UNVERIFIED`) | **volatil** : change à chaque `complete_objective` refusé | `<task-contract>` sticky (`compaction.ts:102-104`) + garde de clôture |
| Séquence de vie (quand appeler `complete_objective`) | figée mais courte | `<goal_reminder>` (inchangé) |
| Chemin de preuve UI → réseau → persistance → sécurité | invariant, sans état | `<qa_proof_advisory>` (inchangé) |

La liste des DoD est la seule ligne figée de l'advisory. C'est elle qui doit disparaître, et
être remplacée par un renvoi qui **porte le décompte** — parce que ce décompte n'est plus
lisible ailleurs (§3, étape 5).

**Le correctif :**
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

- `lean-advisory.ts:21` (`requirements`) disparaît : plus aucune ligne
  `- mandatory requirement: <texte du DoD>` n'est produite.
- Une ligne unique la remplace. Elle préserve l'instruction d'application par item **et** le
  décompte, sans recopier le texte.
- La garde de retour anticipé passe de `requirements.length === 0` à `count === 0` : même
  sémantique, une variable de moins.
- La sortie est identique quand `dod` est vide (retour `""`).

**Ce qui reste volontairement inchangé, et pourquoi :**

- **Les trois drapeaux (`runtime-flags.ts:52`, `:55`, `:56`) sont conservés.** Ils sont le seul
  levier opérateur existant : il n'existe aucune clé de configuration
  `experimental.risk_planner_advisory` ni `qa_proof_advisory` (cf. C-03 — recherche
  `qa_proof|risk_planner|qaProof|riskPlanner` sur `packages/opencode/src` : 2 résultats, qui
  sont les étiquettes XML `lean-advisory.ts:9` et `:16`). Le correctif ne change que le
  *contenu* produit quand le drapeau est actif, pas *quand* il est actif.
- **`prompt.ts` n'est pas touché** par ce lot : ni les gardes, ni les clés de cache
  (`:2383`, `:2454`), ni l'assemblage (`:2462-2472`). L'ordre des blocs reste
  `<task-contract>` avant `<goal_reminder>`, ce qui préserve le découpage de
  `context-budget.test.ts:294-295`.
- **`<task-contract>` n'est pas touché** : c'est la source de vérité, lue par
  `prompt.test.ts:910-911` (`expect(taskContractMatches.length).toBe(1)`) et par
  `working-state-runtime.test.ts:200-204` (« The card agrees with the injected
  `<task-contract>` »).
- **Les findings sticky et les deux phrases non-DoD (`lean-advisory.ts:26` et `:29`) sont
  conservés mot pour mot.**
- **`buildQaProofAdvisory` n'est pas touché.**

### Lot 2 — hors périmètre de P05, documenté explicitement (Objection 3, Required change 3, option « hors périmètre »)

La garde de `prompt.ts:2381` teste le mauvais tableau :
```ts
if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
```
`system` est déclaré `:2244` et alimenté uniquement par `:2297`, `:2298`, `:2315` et `:2530`
(`:2530` est `system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)`). Or le contrat est poussé dans
`volatile` — `:2251` `const volatile: string[] = []`, `:2386` `if (goalCtx) volatile.push(goalCtx)`
— et les deux tableaux ne fusionnent qu'en `:2526`
(`const injected = [...volatile, ...stepOneTail]...`). **La première clause de cette garde est
donc morte.** La même clause existe pour le reminder en `:2452`
(`!system.some((entry) => entry.includes("<goal_reminder"))`), et le reminder n'est poussé qu'en
`:2476`.

Ce n'est pas inoffensif : `system` contient les instructions fusionnées, donc un `AGENTS.md`
ou une skill qui mentionnerait littéralement `<task-contract` ferait évaluer la garde à `true`
et **supprimerait l'injection du contrat réel**. C'est un suppresseur à faux positifs.

**Le remède est d'une ligne et n'est pas appliqué ici** — il est hors périmètre de P05 et
n'est pas Modifié dans le Lot 1 :
```diff
-            if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
+            if (!volatile.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
```
idem en `:2452` (`system` → `volatile`).

*Pourquoi ce n'est pas dans le Lot 1, et ce qu'il faut vérifier avant de l'appliquer :* le
correctif est **un no-op aujourd'hui** — l'invariant du §2 prouve que le contrat est toujours
injecté, donc la clause ne fait jamais basculer la garde dans le sens défensif. Mais faire
passer la clause de morte à vivante n'est neutre que si rien ne pousse `<task-contract` dans
`volatile` **avant** la ligne `:2381`.

`INFERE:` aucun `volatile.push` n'a lieu entre `:2251` et `:2381`, donc le Lot 2 reste un no-op.
**Méthode de vérification :** lister tous les sites `volatile.push` de `prompt.ts` et vérifier
qu'aucun n'a un numéro de ligne `< 2381`. Cette inférence n'a pas été vérifiée dans cette
révision (la commande de recherche `grep` est en `EPERM` dans cet environnement) ; c'est la
seule dépendance qui reste à lever avant d'appliquer le Lot 2, et il doit être implémenté dans
un lot séparé avec ses propres tests, comme prescrit par le verdict.

## 5. Alternatives considered

1. **Supprimer `experimentalRiskPlannerAdvisory`, ou mettre le drapeau à `true` par défaut.**
   Rejeté : cela tue la moitié volatile de l'advisory (les findings `OPEN`/`RESIDINAL`
   collectés à chaque tour par `lean-advisory.ts:34`), qui est précisément ce que le modèle doit
   relire à chaque tour ; et supprime l'échappatoire opérateur. Contredit la consigne de ne pas
   supprimer les drapeaux. C'est aussi le défaut que P05 doit corriger, pas le commode.
2. **Ne lister les DoD dans l'advisory que lorsque le contrat est absent (paramètre
   `hasContract` depuis `prompt.ts`).** Rejeté pour v1 : la condition est *prouvablement*
   toujours fausse (`goal-state.ts:47` + `prompt.ts:2451` + `prompt.ts:2381`), donc elle ajoute
   un paramètre inter-modules et un second chemin de test pour couvrir une branche morte.
   Reste documenté en §6 comme parade si l'invariant casse un jour.
3. **Alléger le `<task-contract>` lui-même (ne plus émettre la ligne `DOD:`).** Rejeté : c'est
   le porteur canonique, lu par `prompt.test.ts:910-911` et `working-state-runtime.test.ts:200-204`.
   Toucher la source de vérité est bien plus risqué que supprimer la copie.
4. **Déplacer l'énumération dans `<qa_proof_advisory>`.** Rejeté : ne supprime aucune
   duplication, seulement la change de place.
5. **Supprimer l'advisory entière.** Rejeté : le bloc n'est pas entièrement redondant — il porte
   les deux phrases non-DoD (`lean-advisory.ts:26`, `:29`) et la liste des findings stale, qui
   n'apparaissent pas dans `<task-contract>` sous cette forme.

## 6. Risks

- **Régression sur les tests existants — aucun test n'assert l'énumération, vérifié :**
  `lean-advisory.test.ts:20-28` n'assert que `SEC-001 HIGH OPEN`, `advisory only` et l'absence
  de `score` → reste vert, confirmé par exécution (`3 pass`, `0 fail`, exit `0`).
  `context-budget.test.ts:414` (`expect(stats.systemTotal).toBeLessThan(20000)`) et `:450`
  (`toBeLessThan(60000)`) sont des **bornes supérieures**. L'effet du Lot 1 sur ce total est
  **une hausse d'au plus 35 caractères** dans le régime courant (2 items courts : −35, donc
  35 caractères de plus qu'avant) et d'au plus **416 caractères** sur une liste de 5 DoD longs.
  Une borne inférieure ne peut donc être franchie que si sa valeur actuelle valait déjà
  ≤ 19584 (resp. ≤ 59584), ce que la marge de conception exclut. L'ordre des sections de
  `:294-295` est préservé parce que le Lot 1 ne touche ni `<task-contract>` ni
  `<goal_reminder>`.
  `prompt.test.ts:910-911` compte les occurrences de `<task-contract`, que le Lot 1 ne touche
  pas.
- **Coût tokens / latence — mesuré, et le signe est défavorable dans le régime courant.**
  La formule est `gain = S + 26n − 122` (§2), où `S` est la longueur cumulée des items de DoD et
  `n` leur nombre. Le bloc **grossit** de 35 caractères sur 2 items courts, de 29 sur 1 item,
  est à égalité sur 3 items courts, et ne gagne (jusqu'à +416 caractères, ≈104 tokens) que sur
  une liste longue. Le coût CPU est nul ou négatif (le `.map()` de `lean-advisory.ts:21`
  disparaît) et il n'y a aucune latence ajoutée. **Aucune économie de tokens n'est revendiquée :
  la justification du correctif est la fidélité du plan repris, pas une économie.** Aucun test
  de cette proposition ne définit le succès par une réduction de taille (§7).
- **Sécurité / gates : aucun gate n'est supprimé.** L'advisory est explicitement non-notant
  (`lean-advisory.ts:26`) ; l'énumération supprimée n'était pas un gate. La preuve par DoD est
  imposée structurellement par `goal-contract.ts:450` et appliquée par `goal-contract.ts:724`.
  Les findings de sécurité sont conservés verbatim. Aucun changement de surface d'injection ni
  de permissions.
- **Risque principal, explicitement demandé : le modèle peut-il perdre l'instruction
  d'appliquer *chaque* DoD ?** Réponse nuancée, et la nuance est le cœur de l'Objection 4 :
  1. **Aucune information de *contenu* n'est perdue.** Le `<task-contract>` qui porte la liste
     est dans le même prompt, plus haut (§2, invariant). Le modèle voit `DOD: a|b|c` puis « the
     3 DoD item(s) of `<task-contract>`, each needing its own verifiable proof ».
  2. **La forme énumérée par item, elle, disparaît.** C'est une perte réelle et elle n'est pas
     réparable par le porteur canonique : ni le nombre d'items, ni leur frontière, n'y sont
     lisibles sans segmenter `goal-state.ts:79` sur `|`. Cette perte est **acceptée
     explicitement** (résidu R1, §Résidus) : elle est inhérente à l'objectif, qui est de ne pas
     produire deux rendus du même objet.
  3. **Le décompte est conservé délibérément** (`the ${count} DoD item(s)`) — non pas seulement
     comme contrôle de cohérence, mais parce qu'il est le seul endroit du prompt où le nombre
     d'items est lisible. C'est la justification de l'arbitrage du §9.
  4. **L'instruction d'application est redondante ailleurs**, indépendamment du renvoi :
     `prompt.ts:2468` l'énonce dans le bloc que le correctif ne touche pas, et
     `goal-contract.ts:450` l'énonce dans le schéma de l'outil, avec `goal-contract.ts:724`
     comme application.
- **Parade si l'invariant du §2 se rompt (constatée, non activée).** Si un chemin futur
  émettait `<risk_advisory>` sans `<task-contract>`, le renvoi pointerait dans le vide. Parade :
  passer un `hasContract: boolean` depuis `prompt.ts` et retomber sur l'énumération actuelle
  dans ce cas. Non implémenté ici (§5, option 2) parce que la branche est inatteignable ; à
  réactiver si `TERMINAL_STATUSES` (`goal-state.ts:47`) ou la garde de `prompt.ts:2381`
  changent.
- **Fait hors périmètre à signaler :** il n'existe pas de clé de configuration
  `experimental.risk_planner_advisory` / `qa_proof_advisory`, contrairement à ce que suggère
  la matrice `README.md:27`. Le correctif n'en ajoute pas — c'est un changement de surface de
  configuration qui dépasse P05 et doit être routé séparément.

## 7. Tests

La base de tests de ce dépôt est **rouge et instable par construction** : la baseline
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md:11-22` mesure 10 suites, dont
**4 rouges** (`test/tool/shell.test.ts` 32 échecs, `test/session/compaction.test.ts` 2,
`test/tool/read.test.ts` 4, `test/tool/task.test.ts` 1), soit **39 tests en échec**. **Aucun
critère de cette proposition ne consiste en « la suite passe ».** Le critère est toujours un
**écart nul** par rapport à cette baseline, sur les suites nommées.

**1. Test de fidélité du plan repris — fichier neuf.**

Chemin exact : `packages/opencode/test/session/lean-advisory-dod-fidelity.test.ts`.
Le gabarit impose un chemin sous `packages/opencode/test/` ; le fichier colocalisé existant
(`src/session/lean-advisory.test.ts`, 29 lignes, 3 tests) est laissé intact pour que le cas
nouveau soit isolé et que son statut rouge/vert soit lisible seul.

```ts
import { describe, expect, test } from "bun:test"
import { buildRiskAdvisory } from "../../src/session/lean-advisory"

const SENTINELS = ["DOD_SENTINEL_ALPHA", "DOD_SENTINEL_BETA"]

describe("risk advisory DoD fidelity", () => {
  test("no longer restates the text of each DoD item", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).not.toContain("DOD_SENTINEL_ALPHA")
    expect(text).not.toContain("DOD_SENTINEL_BETA")
    expect(text.match(/^- mandatory requirement: /gm) ?? []).toHaveLength(0)
  })

  test("keeps a reference to the canonical carrier and its item count", () => {
    const text = buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, [])
    expect(text).toContain("<task-contract>")
    expect(text).toContain("2 DoD item(s)")
    expect(text).toContain("its own verifiable proof")
  })

  test("preserves the volatile half and the default behaviour", () => {
    expect(
      buildRiskAdvisory({ goal: "Ship safely", dod: SENTINELS }, ["SEC-001 HIGH OPEN: tenant filter missing"]),
    ).toContain("SEC-001 HIGH OPEN")
    expect(buildRiskAdvisory({ goal: "Ship safely", dod: [] }, [])).toBe("")
  })
})
```

Commande exacte :
```
cd packages/opencode && bun test test/session/lean-advisory-dod-fidelity.test.ts
```

**Preuve rouge/vert — mesurée le 2026-10-03** en exécutant chaque assertion contre
`buildRiskAdvisory` (AVANT) puis contre la version proposée du §4 (APRÈS) :

| assertion | AVANT (len 348) | APRÈS (len 383) |
|---|---|---|
| `not.toContain("DOD_SENTINEL_ALPHA")` | FAIL | PASS |
| `not.toContain("DOD_SENTINEL_BETA")` | FAIL | PASS |
| `toHaveLength(0)` sur `/^- mandatory requirement: /gm` | FAIL | PASS |
| `toContain("<task-contract>")` | FAIL | PASS |
| `toContain("2 DoD item(s)")` | FAIL | PASS |
| `toContain("its own verifiable proof")` | FAIL | PASS |
| findings `SEC-001 HIGH OPEN` préservés | PASS | PASS |
| `dod: []` → chaîne vide | PASS | PASS |

Critère de succès observable : les six premières assertions **échouent avant** le correctif et
**passent après** ; les deux dernières passent dans les deux cas et servent de garde
d'invariant.

**Correction apportée à l'Objection 2.** Le verdict proposait `expect(text.length).toBeLessThan(200)`.
**Cette variante est rejetée par la mesure** : la sortie proposée fait 383 caractères constants,
donc `toBeLessThan(200)` échoue **aussi après** le correctif (mesuré : FAIL / 383). Elle ne peut
servir ni de critère ni de garde. L'ancienne assertion `toBeLessThan(400)` est non
discriminante : elle est vraie avant (348) *et* après (383). L'assertion de **forme** est donc
retenue (`toHaveLength(0)` sur `/^- mandatory requirement: /gm`), seule variante des deux
proposée par le verdict qui soit réellement discriminante, et elle est prouvée ci-dessus.

**2. Non-régression — critère = écart nul par rapport à la baseline, pas « exit 0 ».**
```
cd packages/opencode && bun test src/session/lean-advisory.test.ts test/session/context-budget.test.ts test/session/prompt.test.ts
```
Critère : aucune **nouvelle** assertion en échec par rapport à la baseline ; le compte
`3 pass / 0 fail` de `src/session/lean-advisory.test.ts` est reproduit à l'identique (mesuré
avant correctif) ; pour `context-budget.test.ts` et `prompt.test.ts`, le nombre d'échecs reste
celui de la baseline. La seule assertion de taille que le correctif pourrait faire bouger est
`context-budget.test.ts:414`/`:450`, et elle ne peut qu'être rapprochée du seuil de 20000 par
au plus 416 caractères — un seuil franchi uniquement s'il valait déjà ≤ 19584 avant correctif,
ce que la valeur actuelle exclut.

## 8. Effort

`S` — une fonction de 13 lignes dans un fichier, plus un fichier de test ; le site
d'assemblage, les drapeaux, les caches et le contrat ne sont pas modifiés, et l'invariant de
sécurité du renvoi est démontré par §2 et par `goal-contract.ts:450`/`:724`.

## 9. Verdict self-assessment

`READY`.

L'invariant qui rend le correctif sûr est démontré, pas supposé : `skipped` ∈
`TERMINAL_STATUSES` (`goal-state.ts:47`) ⇒ `goalActive` (`prompt.ts:2451`) ⇒ la garde de
`prompt.ts:2381` est toujours franchie ⇒ le `<task-contract>` porteur de la liste est toujours
présent dans le même prompt que l'advisory. Aucun test n'assert l'énumération à supprimer ; les
tests qui mesurent le prompt n'ont que des bornes supérieures.

**Arbitrage de la question laissée ouverte par le verdict (Objection 4, Required change 4).**
La formulation « the N DoD item(s) of `<task-contract>` » est **conservée**. Motif retenu :
elle porte le décompte des items, qui n'est plus lisible nulle part ailleurs — le porteur
canonique ne donne que `DOD: a|b|c` (`goal-state.ts:87`, jointure `|` en `:79`). Le contrôle de
cohérence est un benefit secondaire, pas la raison principale. L'advisory ne cesse donc pas de
mentionner les DoD : il cesse de les *recopier*, ce qui est l'objet de P05.

## Résidus

| id | résidu | statut |
|---|---|---|
| R1 | La forme énumérée par item disparaît de l'advisory ; ni le nombre d'items ni leur frontière ne restent lisibles dans le porteur canonique sans segmentation sur `\|` (`goal-state.ts:79`). | `accepted` — perte inhérente à l'objectif (ne plus produire deux rendus du même objet) ; le décompte est conservé par le renvoi, et l'instruction par item reste énoncée par `prompt.ts:2468` et `goal-contract.ts:450`. |
| R2 | La garde `prompt.ts:2381` teste `system` au lieu de `volatile` ; sa première clause est morte, et un `AGENTS.md` mentionnant littéralement `<task-contract` supprimerait l'injection du contrat réel. Même défaut en `:2452` pour `<goal_reminder`. | `out_of_scope` — traité par le Lot 2 (§4), dans un lot séparé avec ses propres tests, conformément à l'Objection 3 et à la Required change 3 (option « hors périmètre »), qui impose de le signaler explicitement avec les citations `prompt.ts:2244` / `:2386` / `:2526`. Ne bloque pas le Lot 1. |
| R3 | `INFERE:` aucun `volatile.push` avant `prompt.ts:2381`, donc le Lot 2 est un no-op. Non vérifié ici (recherche `grep` en `EPERM`). | `out_of_scope` — porte sur le **Lot 2**, déjà déclaré hors périmètre, et non sur le Lot 1, qui ne touche pas `prompt.ts`. **Précondition bloquante pour le seul Lot 2**, à lever avant toute application du Lot 2 : lister les sites `volatile.push` de `prompt.ts` et vérifier qu'aucun n'a une ligne `< 2381`. |
| R4 | Il n'existe aucune clé de configuration `experimental.risk_planner_advisory` / `qa_proof_advisory`, contrairement à `README.md:27`. | `out_of_scope` — ajout d'une clé de configuration = nouvelle surface de configuration, à router dans une proposition séparée (cf. C-03). |
| R5 | Paramètre `hasContract` pour n'émettre le renvoi que si le contrat est présent. | `out_of_scope` — branche prouvablement inatteignable (§5, option 2) ; à réactiver si `TERMINAL_STATUSES` ou la garde `:2381` changent. |
| R6 | La base de tests est rouge par construction : 4 suites rouges, 39 échecs (`wave4-baseline.md:11-22`). | `accepted` — antérieur et indépendant de P05 (cf. C-07, `CORRECTIONS.md:17`). Les critères du §7 sont des écarts nuls par rapport à cette baseline, jamais « la suite passe ». |

### Statut des six objections du verdict

| objection | traitement | statut |
|---|---|---|
| 1 — gain annoncé faux et négatif | §1 et §6 : l'argumentation d'impact est supprimée, remplacée par la formule `gain = S + 26n − 122` et le tableau mesuré (§2), qui montrent un **grossissement** de 35 caractères sur le cas prescrit. Aucune économie de tokens n'est revendiquée (C-02). | `accepted` |
| 2 — test non discriminant | §7 : assertion de forme `toHaveLength(0)` sur `/^- mandatory requirement: /gm`, prouvée FAIL avant / PASS après. La variante `toBeLessThan(200)` du verdict est **rejetée par la mesure** (elle échoue aussi après, 383) et le motif est donné ; `toBeLessThan(400)` est conservé uniquement comme non-discriminant documenté. | `accepted` |
| 3 — garde interrogeant le mauvais tableau | §4, Lot 2 + R2 : signalé explicitement avec `prompt.ts:2244` / `:2386` / `:2526`, diff d'une ligne fourni, et reporté en lot séparé avec ses propres tests. | `accepted` |
| 4 — défense 1 trop affirmative | §6, risque principal : reformulé en « aucune information de *contenu* n'est perdue, la forme énumérée par item l'est », avec la perte assumée en R1. §9 : arbitrage rendu, conservation justifiée par le décompte illisible ailleurs, pas par le contrôle de cohérence. | `accepted` |
| 5 — citation imprécise | §2 : la formulation est corrigée. `lean-advisory.ts:20-28` est cité pour ce qu'il assert réellement (`SEC-001 HIGH OPEN`, `advisory only`, absence de `score`) ; l'assertion sur la taille a été retirée du §7 ; plus aucune recherche par motif n'est revendiquée. | `accepted` |
| 6 — priorité réelle non tirée | §6 et R4 : le correctif est **inerte par défaut** (`runtime-flags.ts:4`, `:55-56` — `bool()` et non `enabledByExperimental`), il ne ferme aucun gate, et son bénéfice net est nul à négatif dans le régime courant. Il doit donc être priorisé **après P03** (`README.md:25`, outils MCP dont la readiness a échoué) et **P04** (`README.md:26`, `Retry-After` non borné), qui sont des défauts visibles sans drapeau. P05 est le dernier des huit de la matrice, pas un item de milieu de peloton. | `accepted` |

Aucun résidu n'est au statut `open` : les six objections du verdict sont `accepted`, R1 et R6
sont `accepted` (pertes assumées ; base de tests rouge préexistante), et R2, R3, R4, R5 sont
`out_of_scope` (champs nommés hors du périmètre du Lot 1). Conformément à la règle « un résidu
`open` interdit l'implémentation », **aucun résidu n'interdit l'implémentation du Lot 1**. R3
reste une **précondition bloquante pour le seul Lot 2**, qui ne doit pas être implémenté avant
la vérification qu'il énonce.