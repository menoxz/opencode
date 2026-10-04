# P06 — Le résumé de compaction ne porte ni DoD ni findings, et le filet qui les porte est tronqué en silence — correctif borné, un seul fichier de production

> Révisé cycle 2 après REVALIDATED-PASS_WITH_CHANGES du 2026-10-03 — §8 re-scopé en effort S (C-28), compacting.prompt / DETAIL_BUDGET_CHARS / plafond T3 tranchés

**Résumé du cycle 2.** La revalidation a établi, par citation de code, que le cycle 1
avait **surestimé** son propre périmètre. L'affirmation « l'accès à `GoalState` depuis
`processCompaction` n'existe pas » (§8 du cycle 1) est **réfutable par le code lui-même** :
le service qui porte l'état du contrat est déjà importé (`compaction.ts:5`), déjà acquis
dans le générateur qui définit `processCompaction` (`compaction.ts:372-377`), et déjà
utilisé par ce générateur à deux endroits (`:477`, `:711`). La voie A — lecture de
`Session.Service.get(sessionID).goalState` — est établie, pas supposée. Conséquences
appliquées dans ce cycle :

- **§8 réécrit** : effort `S`, **un seul fichier de production**, type d'entrée
  `compaction.ts:525-531` **inchangé**. Toute affirmation sur les appelants de
  `use.process` est **retirée** : elle était une surestimation fondée sur la prémisse
  erronée ci-dessus.
- **Test de condition reconstruit** : le test lexical (`rg` sur un littéral) est
  **abandonné** — il ne distingue pas les deux mondes (défaut de classe C-20). Il est
  remplacé par un test **comportemental, rouge avant le patch** (§7 T4).
- **Trois points laissés muets sont tranchés** : le court-circuit `compacting.prompt`
  (traité, §4.1), le budget `DETAIL_BUDGET_CHARS` « partagé » (résolu par fusion, §4.3),
  le plafond gelé de T3 (arbitré, §5 (vii) et §9).
- **RC6 est désormais traitée intégralement** : le chemin de la preuve (3), l'étape 4 de
  §3 et la requalification d'effort. RC1 à RC5 sont conservées telles quelles.
- **Deux corrections arithmétiques** apportées en repassant les chaînes à la main (§6) :
  les deux marqueurs étaient sous-estimés de ≈ 45 et ≈ 39 caractères. Le pire cas corrigé
  vaut **4 401 car. = 1 100 tok exactement**, ce qui change l'arbitrage du plafond T3.
- **Un `unverified` clos** : `working-state-goal-dod.test.ts:54` a été relu et est exact ;
  il n'est plus dans la liste des non-vérifiés.

---

## 1. Problem

Quand le harnais compacte une session, le texte de remplacement ne contient aucune
section Definition of Done ni aucune section findings, et le bloc de contexte qui, lui,
sait les contenir est amputé sans jamais le dire : au-delà de dix éléments, le
onzième disparaît du prompt sans marqueur.

## 2. Evidence

**(1) Le gabarit du résumé ne contient ni DoD ni findings** —
`packages/opencode/src/session/compaction.ts:55-90`. Cité indenté de deux espaces, pour
que les titres du gabarit opencode ne soient pas confondus avec ceux de la présente
proposition.

```ts
  ## Progress
  ### Done
  - [completed work or "(none)"]
  ### In Progress
  - [current work or "(none)"]
  ### Blocked & Difficultés
  - [blockers, root causes of bugs/delays, difficulties encountered, or "(none)"]
  ## Decisions & Lessons
```

Titres effectivement déclarés : `## Goal` (57), `## Constraints & Preferences` (60),
`## Progress` (63) avec `### Done` (64) / `### In Progress` (67) /
`### Blocked & Difficultés` (70), `## Decisions & Lessons` (73), `## Next Steps` (76),
`## Critical Context` (79), `## Relevant Files` (82). Aucune section `DoD`, aucune
section `findings`. La première ligne (55) est une **consigne** :
`Output exactly the Markdown structure shown inside <template> and keep the section order unchanged.`

**(2) Le mécanisme de secours est tronqué en silence** —
`packages/opencode/src/session/compaction.ts:98-105`.

```ts
function stickyGoalContext(state: GoalState): string {
  const findings = (state.findings ?? [])
    .slice(0, 10)
    .map((finding) => `FINDING ${finding.id} [${finding.severity}/${finding.status}]: ${finding.summary.slice(0, 240)}`)
  const gaps = (state.completion?.unverified ?? [])
    .slice(0, 10)
    .map((item) => `UNVERIFIED: ${item.dod.slice(0, 160)} → ${item.reason.slice(0, 240)}`)
  return [...findings, ...gaps].join("\n")
}
```

Deux `slice(0, 10)` (`:100` et `:103`), aucun indicateur de reste, aucun ordre de
priorité : l'ordre d'insertion décide, donc un finding `open` créé en premier est garanti
visible et un finding `open` créé en onzième **n'existe pas pour le modèle**. La fonction
est **non exportée** (`:98`), mais reste atteignable par les tests via `formatGoalContext`
(`:112`) — voir §4.5.

**(3) La barrière anti-clôture dépend pourtant de ces findings** —
`packages/opencode/src/tool/goal-contract.ts:598-628`.

```ts
          const findings = mergeGoalFindings(previous.findings ?? [], incomingFindings, now)
          const findingsChanged = JSON.stringify(findings) !== JSON.stringify(previous.findings ?? [])
          const openFindings = findings.filter((finding) => finding.status === "open")
          if (openFindings.length > 0) {
            ...
                "Completion refused: sticky findings remain OPEN.",
```

Le filtre est `:609`, la garde `:610`, le message exact `:624`, et le nom des findings
refusés est énuméré ligne à ligne en `:625`. La citation ne couvre que le fichier réel
`src/tool/goal-contract.ts` : la matrice `README.md:28` (ligne **P06**) pointe bien
`src/session/compaction.ts:55`, et `README.md:33` (ligne **P11**) porte déjà
`src/tool/goal-contract.ts:519`. Aucune correction de chemin n'est nécessaire dans la
matrice, et la présente proposition ne cite que des chemins existants.

**(4) Le bloc est bien réinjecté, mais son contenu est amputé** —
`packages/opencode/src/session/prompt.ts:2381-2386` : une fois par tour, sous condition
`!system.some((entry) => entry.includes("<task-contract"))`, puis
`injectionCache.set(goalKey, formatGoalContext(goalState))` et `volatile.push(goalCtx)`.
Le bloc sticky est produit par `formatGoalContext` (`compaction.ts:122-124`) et vit donc
dans ce que ce prompt réinjecte.

**(5) Le gabarit est une consigne à un modèle, pas un rendu** —
`packages/opencode/src/session/compaction.ts:196` est l'unique point d'assemblage :

```ts
  return [anchor, SUMMARY_TEMPLATE, ...input.context].join("\n\n")
```

et `compaction.ts:717-738` envoie le résultat **comme message utilisateur** au
processeur :

```ts
        messages: [
          ...modelMessages,
          {
            role: "user",
            content: [{ type: "text", text: nextPrompt }],
          },
        ],
```

**Aucune normalisation de la sortie du résumeur n'existe entre ces deux points.** Le
résumé persisté est le texte du résumeur repris tel quel : `completedCompactions` lit
`msg.info.summary` (`:179`) et `summaryText` concatène les parts texte (`:158-166`).
`INFERE:` l'absence de post-traitement **ailleurs** dans le fichier (au-delà des
plages `:40-200`, `:460-600`, `:640-768` effectivement relues) n'est pas prouvée ici ;
protocole : `rg -n "Progress|ensureSection|normalize|replace\(|template"
packages/opencode/src/session/compaction.ts`, puis lire les hits éventuels hors
des plages déjà couvertes.

**(6) L'accès à l'état du contrat est DÉJÀ acquis dans la portée du générateur** —
preuve décisive pour l'effort, et **inverse** de ce qu'affirmait le cycle 1.

```ts
// compaction.ts:5
import * as Session from "./session"
```

```ts
// compaction.ts:372-374 puis :377
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    ...
    const session = yield* Session.Service
```

Ce même `session` est **déjà utilisé** dans le générateur, deux fois :

```ts
// compaction.ts:477-479, dans prune (déclaré :472)
      const msgs = yield* session
        .messages({ sessionID: input.sessionID })
        .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
```

```ts
// compaction.ts:711, dans processCompaction (déclaré :525)
      yield* session.updateMessage(msg)
```

Et la lecture nommée de l'état du contrat est **établie par le site d'appel** de la
barrière elle-même :

```ts
// goal-contract.ts:568, puis :576-577
    const sessions = yield* Session.Service
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const previous = session.goalState ?? null
```

`Session.Service.get(sessionID).goalState` est donc **une lecture nommée, publique et
déjà pratiquée**. Le motif d'absence est déjà importé et déjà employé dans le fichier de
compaction : `NotFoundError` en `compaction.ts:16`, `Effect.catchIf(NotFoundError.isInstance, ...)`
en `:479`. Conclusion : l'injection coûte **une ligne**, dans le fichier déjà ouvert.

**(7) Le type d'entrée de `processCompaction` ne porte aucun état, et n'en portera pas** —
`packages/opencode/src/session/compaction.ts:525-531`.

```ts
    const processCompaction = Effect.fn("SessionCompaction.process")(function* (input: {
      parentID: MessageID
      messages: MessageV2.WithParts[]
      sessionID: SessionID
      auto: boolean
      overflow?: boolean
    }) {
```

C'est un **fait neutre** dans le cycle 2 : le correctif n'y touche pas. Le champ
`sessionID` est déjà là, et il suffit. Le cycle 1 traitait ce type comme une frontière à
franchir ; il n'y a rien à franchir.

## 3. Mechanism

Chemin d'exécution, de bout en bout :

1. La session déborde (ou l'utilisateur déclenche `/compact`). Le point d'entrée public
   est `SessionCompaction.create` (`compaction.ts:912`).
2. `processCompaction` (`compaction.ts:525`) valide le parent (`:532-535`), puis découpe
   le transcript via `select` (appel `:577-582`) et lit le résumé précédent par
   `completedCompactions` (`:574`, définition `:168`).
3. Un plugin peut injecter du contexte **ou remplacer le prompt** :
   `plugin.trigger("experimental.session.compacting", { sessionID: input.sessionID }, { context: [], prompt: undefined })`
   (`compaction.ts:584-588`). Le prompt effectif est ensuite
   `compacting.prompt ?? buildPrompt({ previousSummary, context })` (`:655-660`).
4. `buildPrompt` (`:186`) assemble `anchor` + `SUMMARY_TEMPLATE` + `input.context`
   (`:196`). **À cet instant, aucun état du contrat n'est fourni au résumeur** : ni la
   DoD, ni les findings. Le modèle ne peut écrire que ce qu'il devine dans
   l'historique. Et si un plugin a imposé `compacting.prompt`, `buildPrompt` n'est
   **jamais appelé** : le défaut est alors structurel, pas accidentel.
5. **Le résumeur répond, et sa réponse devient le résumé telle quelle.** `nextPrompt`
   part en dernier message utilisateur (`:730-735`) et le texte persisté est repris tel
   quel par `summaryText` (`:158-166`) via `msg.info.summary` (`:179`).
   Correction conservée du cycle 1 : la formulation d'origine — « la DoD et les findings
   *ne sont pas écrits* — ils n'ont pas de case » — était **fausse**. `SUMMARY_TEMPLATE`
   est une **consigne adressée à un modèle** ; aucune section n'a de « case », parce
   qu'aucune section n'est rendue : toutes sont *demandées* (preuve 5). Le risque réel
   n'est donc pas l'absence de section, c'est le **`(none)` affirmatif** : un
   `## Findings\n- (none)` dans le résumé ancré contredit `goal-contract.ts:624` et
   produit exactement la boucle de refus sans cause que ce correctif prétend supprimer.
   C'est ce risque qui motive l'alimentation du résumeur (§4.1) et la règle
   anti-invention du gabarit.
6. Le résumé devient le transcript. À partir du tour suivant, l'agent travaille avec un
   historique dont le contrat de sortie dépend entièrement de la bonne volonté d'un
   résumeur qui n'est pas contraint.
7. Le seul filet restant est `formatGoalContext` → `stickyGoalContext`
   (`compaction.ts:112-124`), réinjecté à chaque tour par `prompt.ts:2381-2386`.
   Ce filet coupe à dix éléments (preuve 2) : le onzième finding et la onzième lacune
   disparaissent, silencieusement, à chaque tour, pour toujours.
8. Point de culmination : `tool/goal-contract.ts:609-610` refuse la clôture tant qu'un
   finding est `open`, et `:625` nomme les findings refusés — mais ce nom n'atteint le
   modèle que si la ligne correspondante a survécu à l'étape 7. Un agent qui a perdu de
   vue le onzième finding ne voit plus que dix lignes et juge le contrat satisfaible ; il
   tente `complete`, reçoit « Completion refused », ne sait pas quel finding l'a
   déclenché, recommence à fouiller. La barrière, qui existe pour empêcher une clôture
   frauduleuse, produit à la place une boucle de refus sans cause identifiable.

Cause racine unique : le contrat de sortie possède deux représentations indépendantes
(l'état `GoalState` persisté, et le texte que le modèle relit), et aucune des deux n'est
garantie complète après une compaction — la première parce qu'elle n'est jamais lue au
moment où la seconde est écrite, la seconde parce qu'elle est tronquée en silence.

## 4. Proposal

### 4.0 Fichiers touchés — périmètre, un seul fichier de production

| fichier | nature |
|---|---|
| `packages/opencode/src/session/compaction.ts` | **production — seul fichier** : (a) sections du gabarit + alimentation, (b) budget, (c) bornage, (d) tri |
| `packages/opencode/src/session/goal-context.test.ts` | test — T1, T2, T3 |
| `packages/opencode/test/session/compaction.test.ts` | test — T4 (test de condition), T4b, T4c |
| `packages/opencode/test/server/httpapi-exercise/index.ts` | fixture — cosmétique (§4.5) |

`src/tool/goal-contract.ts` est laissé intact : il est correct, c'est le canal de
restitution qui est lacunaire, pas la barrière.

`SessionCompaction.process` **n'est pas un second fichier** et son type d'entrée
(`compaction.ts:525-531`) **n'est pas modifié**. Aucun appelant de `use.process`, en
production ou en test, n'est touché : ils transmettent déjà `sessionID`, qui est tout ce
dont la lecture a besoin (preuves 6 et 7).

### 4.1 (a) Deux sections dans le gabarit, et les données qui les remplissent

**Gabarit** — insertion entre `### Blocked & Difficultés` (ligne 70) et
`## Decisions & Lessons` (ligne 73), plus une règle dans le bloc `Rules` :

```diff
   ### Blocked & Difficultés
   - [blockers, root causes of bugs/delays, difficulties encountered, or "(none)"]
+
+## DoD (unmet)
+- [each Definition-of-Done item still unproven, or "(none) — every item is proven"]
+
+## Findings
+- [FINDING <id> [severity/status]: summary, or "(none)"]
 
   ## Decisions & Lessons
```

```diff
   Rules:
   - Keep every section, even when empty.
   - Use terse bullets, not prose paragraphs.
   - Preserve exact file paths, commands, error strings, and identifiers when known.
+- Copy DoD wording and finding ids verbatim from <task-contract>; write "(none)" only
+  when that block lists none. Never invent a DoD item or a finding id.
   - Do not mention the summary process or that context was compacted.
```

La règle anti-`"(none)"` est ce qui rend la correction réellement utile : le risque
identifié au §3 étape 5 est un `"(none)"` affirmatif, pas une section manquante.
L'ancrage des deux sections après `### Blocked & Difficultés` est délibéré : ce sont des
énoncés d'avancement, ils appartiennent au bloc `## Progress`, pas à
`## Critical Context`. `## Decisions & Lessons` garde sa position, donc `keep the section
order unchanged` (`compaction.ts:55`) reste valide, et `- Keep every section, even when
empty.` (`:87`) reste juste.

**Données — `buildPrompt` n'est PAS modifié.** Le point d'injection est l'**après
résolution du prompt**, `compaction.ts:654-660`, et il est choisi pour une raison
précise : c'est le seul endroit où le bloc contrat est garanti présent **quelle que soit
la voie par laquelle le prompt a été obtenu**.

```ts
      // The LLM boundary supplies escaped live state, not a raw/stale goal hint.
      // Added: the contract is read here and appended AFTER prompt resolution, so a
      // plugin that forces `compacting.prompt` cannot bypass it.
      const goalContract = (yield* session
        .get(input.sessionID)
        .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
      )?.goalState
      const resolvedPrompt =
        compacting.prompt ??
        buildPrompt({
          previousSummary,
          context: jevChecklist ? [...compacting.context, jevChecklist] : compacting.context,
        })
      const nextPrompt = goalContract ? [resolvedPrompt, formatGoalContext(goalContract)].join("\n\n") : resolvedPrompt
```

Cinq properties, chacune vérifiable :

1. **La voie est déjà ouverte** (§2 preuve 6) : `session` est acquis en `:377`, et
   `session.get(sessionID).goalState` est la même lecture que
   `goal-contract.ts:576-577`. Aucune API nouvelle, aucun service nouveau.
2. **L'absence est traitée explicitement** : `NotFoundError` est importé (`:16`) et le
   motif `Effect.catchIf(NotFoundError.isInstance, …)` est déjà utilisé en `:479`.
3. **Le bloc contrat est échappé par construction** : `formatGoalContext` produit
   lui-même `<task-contract status="…">…</task-contract>` (`compaction.ts:124`). Il est
   concatené comme **élément distinct** du tableau, jamais fondu dans `input.context` —
   un texte libre de finding ne peut donc pas se retrouver au milieu du contexte
   conversationnel.
4. **`buildPrompt` garde sa signature** (`:186`) et son comportement. Rien à y changer :
   c'est précisément l'objet du point 2 de l'objection 2 de la revalidation.
5. **Position dans le prompt** : le bloc est apposé **en fin** de prompt. C'est la
   position la plus proche de la consigne, et c'est la seule qui soit **identique sur les
   deux voies** de résolution — une injection à l'intérieur de `buildPrompt` (entre
   `SUMMARY_TEMPLATE` et `input.context`) n'existerait pas du tout sur la voie plugin.

**Compatibilité avec les tests existants, argumentée.** Quand la session n'a pas d'état
de contrat — cas de tous les tests de compaction actuels, qui créent la session par
`ssn.create({})` sans passer par l'outil `task-contract` — `goalContract` vaut
`undefined`, `nextPrompt` est **octet pour octet** celui d'aujourd'hui, et rien ne
change. C'est ce qui rend `compaction.test.ts:1727`
(`expect(captured.match(/summary one/g)?.length).toBe(1)`) et `:1728-1729` insensibles
au patch.

### 4.2 (b) Un budget en caractères, et une ligne de reste non ambiguë

Remplacement des deux `slice(0, 10)` par un rendu budgété. **Le format de ligne est
conservé à l'identique** — `FINDING <id> [<severity>/<status>]: <summary>` (`compaction.ts:101`)
et `UNVERIFIED: <dod> → <reason>` (`compaction.ts:104`) — pour ne pas casser
`packages/opencode/src/session/goal-context.test.ts:12-13`, qui épingle
`FINDING SEC-001 [high/residual]` et `UNVERIFIED: load`. **C'est ce test qui interdit de
changer le format**, et il est la raison de cette contrainte, pas une précaution
générique.

**Correction 5 conservée — le type porte la priorité, et le tri a une clé explicite.**
`stickyGoalContext` **trie** avant d'appeler `renderBudgeted`, et `renderBudgeted`
déclare sa pré-condition.

```ts
type Sticky = {
  id: string
  status: GoalFinding["status"]
  text: string
  firstSeenAt: number
}

/** Priority order for the sticky tier: the closure barrier (goal-contract.ts:609) only
 *  reads `open`, so `open` must never be the line that gets cut. */
const FINDING_PRIORITY: Record<GoalFinding["status"], number> = {
  open: 0,
  residual: 1,
  out_of_scope: 2,
  closed: 3,
}

/** `items` MUST already be sorted by the caller (priority, then firstSeenAt, then id).
 *  This function never reorders: rendering is the only concern. */
function renderBudgeted(items: readonly Sticky[], budget: number) {
  const shown: string[] = []
  const hidden: string[] = []
  let spent = 0
  for (const item of items) {
    if (shown.length > 0 && spent + item.text.length > budget) hidden.push(item.id)
    else {
      shown.push(item.text)
      spent += item.text.length
    }
  }
  return { shown, hidden }
}
```

`Record<GoalFinding["status"], number>` est exhaustif et compile sans type nouveau :
`GoalFindingStatus` a exactement quatre membres —
`export type GoalFindingStatus = "open" | "closed" | "residual" | "out_of_scope"`
(`packages/opencode/src/session/goal-evidence.ts:1`).

**Clé de départ du tri — plus un accident de stabilité.** `toSorted` est stable, donc
l'ordre d'insertion départageait à statut égal ; réécrire le tri en `sort` non stable
changerait silencieusement *quels* findings sont coupés au seuil. `toSorted` est déjà
employé dans ce fichier (`:327`, `:329`), donc aucune contrainte de lib/tsconfig. La clé
existe déjà dans le modèle — **aucun changement de schéma** : `firstSeenAt: number` est un
champ de `GoalFinding` (`goal-evidence.ts:11`).

```ts
const ordered = findings.toSorted((a, b) =>
  FINDING_PRIORITY[a.status] - FINDING_PRIORITY[b.status] || a.firstSeenAt - b.firstSeenAt ||
  a.id.localeCompare(b.id),
)
```

Budgets exprimés en caractères, convertis avec `Token.estimate`
(`packages/opencode/src/util/token.ts:1-4` : `CHARS_PER_TOKEN = 4`,
`Math.max(0, Math.round((input || "").length / 4))`) :

| constante | valeur | tokens |
|---|---|---|
| `OPEN_BUDGET_CHARS` | 1 600 | 400 |
| `DETAIL_BUDGET_CHARS` | 800 | 200 |
| ligne finding `open` | 160 caractères | 40 |
| ligne finding non-`open` | 120 caractères | 30 |

`OPEN_BUDGET_CHARS / 160` = **10 lignes complètes**, donc la dégradation du §4.3 commence
au **onzième** finding `open` — cohérent avec le défaut observé.

Le marqueur est **généré par le harnais, jamais par le modèle**, et il nomme les
éléments perdus :

```ts
const OVERFLOW_MARKER = (ids: readonly string[]) =>
  `+${ids.length} éléments non affichés : ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ", …" : ""} — lire la liste complète via task-contract(edit)`
```

### 4.3 (c) La dégradation `open` est **bornée**, et le budget de détail est **unique**

Priorité `open > residual > out_of_scope > closed`, en quatre paliers :

1. **Palier `open`** — budget **propre** `OPEN_BUDGET_CHARS`, résumé à 160 caractères.
   C'est le palier que la barrière `goal-contract.ts:610` consulte.
2. **Palier `detail`** — budget `DETAIL_BUDGET_CHARS`, résumé à 120 caractères pour un
   finding non-`open`, libellé `UNVERIFIED: <dod> → <reason>` conservé pour une lacune.
3. **Marqueurs** — émis si et seulement si des éléments sont cachés ; un par palier.

**Arbitrage de l'objection 3 : le budget de détail est partagé par construction, parce
qu'il n'y a qu'un seul site d'appel.** Le cycle 1 déclarait `DETAIL_BUDGET_CHARS`
« partagé » entre les findings non-`open` et les lacunes `unverified`, tout en
exposant un `renderBudgeted` à budget scalaire et à `spent` local : deux appels
consommeraient chacun 800 car. et le `spent` du premier serait perdu — c'est-à-dire
**1 600 car. rendues pour un budget advertised de 800**, et un §6 qui mentait sur son
propre pire cas. Deux issues étaient ouvertes : faire returning `spent` par
`renderBudgeted`, ou fusionner. **Le correctif fusionne**, parce que c'est l'issue qui
supprime le défaut au lieu de le déplacer :

```ts
/** One pre-sorted list, one budget, one marker. There is no second call site on
 *  DETAIL_BUDGET_CHARS: a shared budget with a local `spent` is not expressible, so the
 *  tiers are merged instead of stacked. */
const detail = [
  ...ordered
    .filter((finding) => finding.status !== "open")
    .map((finding) => ({
      id: finding.id,
      status: finding.status,
      text: `FINDING ${finding.id} [${finding.severity}/${finding.status}]: ${finding.summary.slice(0, 120)}`,
      firstSeenAt: finding.firstSeenAt,
    })),
  ...(state.completion?.unverified ?? []).map((item, index) => ({
    id: `UNVERIFIED-${index}`,
    status: "out_of_scope" as const,
    text: `UNVERIFIED: ${item.dod.slice(0, 160)} → ${item.reason.slice(0, 240)}`,
    firstSeenAt: index,
  })),
].toSorted((a, b) => FINDING_PRIORITY[a.status] - FINDING_PRIORITY[b.status] || a.firstSeenAt - b.firstSeenAt || a.id.localeCompare(b.id))
const renderedDetail = renderBudgeted(detail, DETAIL_BUDGET_CHARS)
```

> **Invariant de budget.** `DETAIL_BUDGET_CHARS` est **dépensé une seule fois**, sur une
> liste unique et pré-triée, et il **n'est jamais additionné** avec un autre palier. Le
> palier `open` a son propre budget. Un second site d'appel sur ce budget est interdit
> par construction, et le test T1 l'assert : avec 40 findings non-`open` et 40 lacunes,
> la sortie doit rester sous `DETAIL_BUDGET_CHARS + un marqueur`.

`unverified` n'expose, dans les deux seules surfaces relues, que `dod` et `reason`
(`goal-context.test.ts:9`, `goal-contract.ts:600` qui filtre `item.dod?.trim() &&
item.reason?.trim()`). Aucun timestamp n'y est observé, donc la clé de départ des
lacunes est leur **indice** dans le tableau, pas `firstSeenAt`. `INFERE:` si le type en
porte un, lui substituer `firstSeenAt` — la clé de tri reste la même et le résultat est
identique.

**Correction 1 conservée — bornage de la bande `open`.** Le cycle 0 poussait les findings
`open` surnuméraires **hors de tout budget**, après la boucle budgétaire, sans plafond ni
condition de sortie. La bande dégradée était non bornée, réinjectée **à chaque tour** par
`prompt.ts:2381-2386`, sur une session que `goal-contract.ts:610` interdit de clore.
Correction par une constante supplémentaire, pas par une retouche de calibrage :

```ts
const OPEN_OVERFLOW_MAX_LINES = 25

function renderOpenOverflow(hidden: readonly string[]): string[] {
  const named = hidden.slice(0, OPEN_OVERFLOW_MAX_LINES)
  const beyond = hidden.length - named.length
  const ids = hidden.slice(OPEN_OVERFLOW_MAX_LINES, OPEN_OVERFLOW_MAX_LINES + 6)
  return [
    ...named.map((id) => `OPEN: ${id} [open] — résumé tronqué, lire via task-contract(edit)`),
    `OPEN: +${hidden.length} findings open non affichés${beyond > 0 ? ` (${beyond} au-delà du plafond de ${OPEN_OVERFLOW_MAX_LINES} lignes)` : ""} — ids non listés: ${ids.join(", ")}${ids.length > 0 && beyond > 0 ? ", …" : ""} — lire la liste complète via task-contract(edit)`,
  ]
}
```

**Bornes chiffrées.** Les comptes ci-dessous sont faits **caractère par caractère, à la
main** ; aucune commande n'a pu être exécutée pour cette révision (contrainte lecture
seule). Ils sont donc marqués `INFERE:` et accompanied de la commande qui les confirme.

- Coût d'une ligne dégradée : `"OPEN: "` 6 + `len(id)` 7 + `" [open]"` 7 + `" — "` 3 +
  `résumé` 6 + `" tronqué,"` 9 + `" lire via "` 10 + `task-contract(edit)` 19 = **67**.
  `INFERE:` les ids sont normalisés en majuscules par `mergeGoalFindings`
  (`goal-evidence.ts:27`, `item.id.trim().toUpperCase()`) et `goal-context.test.ts:8`
  utilise `SEC-001` (7 caractères). Vérification :
  `bun -e 'console.log("OPEN: SEC-001 [open] — résumé tronqué, lire via task-contract(edit)".length)'` → 67.
- **Bande dégradée plafonnée** : 25 × 67 = **1 675 car. ≈ 419 tok**, quel que soit le
  nombre total de findings `open`. Le plafond est structurel, pas probabiliste.
- **Marqueur `open`** : borné **indépendamment du nombre de findings cachés** — le
  décompte est un nombre, jamais une liste complète ; au plus 6 ids de plus.
  `INFERE:` **≈ 197 car. ≈ 49 tok** au maximum (texte fixe ≈ 100 car. + 6 ids × 8 + `, …`
  + ` — lire la liste complète via task-contract(edit)`). **Correction par rapport au
  cycle 1, qui l'estimait à ≈ 150 car.** Vérification :
  `bun -e 'console.log(`OPEN: +1000 findings open non affichés (975 au-delà du plafond de 25 lignes) — ids non listés: SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, … — lire la liste complète via task-contract(edit)`.length)'`.
- **Marqueur de détail** : `INFERE:` **≈ 129 car. ≈ 32 tok** (≈ 29 de préfixe + 6 ids × 8
  + `, …` + la même phrase de récupération). **Correction par rapport au cycle 1, qui
  l'estimait à ≈ 90 car.**

**Invariant corrigé.** La formulation d'origine — « un finding `open` disparaît du prompt
quand, et seulement quand, il disparaît aussi de l'état persisté » — était **fausse pour
l'implémentation proposée** : avec un plafond, un `open` disparaît aussi quand il déborde.
Invariant retenu :

> **Aucun finding `open` n'est tronqué silencieusement.** Tout `open` non affiché est soit
> listé ligne à ligne, soit compté dans le marqueur, qui porte toujours le **nombre exact**
> d'`open` non affichés et l'instruction `task-contract(edit)`. La perte est bornée par
> construction (`OPEN_OVERFLOW_MAX_LINES` lignes + un marqueur de taille constante), jamais
> proportionnelle au nombre de findings.

### 4.4 Le cas du 11ᵉ finding invisible, et comment le récupérer

Avant correctif, un onzième finding est dans un état impossible à rattraper depuis le
prompt : absent du résumé, absent du filet (coupé), présent en base. Après correctif, il y
a trois sorties, toutes actionnables :

- **≤ budget** : affiché, avec id, sévérité et statut.
- **dégradation (11ᵉ au 25ᵉ)** : listé explicitement en ligne d'index.
- **au-delà du 25ᵉ** : compté dans le marqueur, dont la route de récupération est
  explicite et déjà persistante : `task-contract` accepte `action: "create" | "edit" |
  "suggest" | "apply" | "complete"` (`goal-contract.ts:21`) ; `edit` relit l'état
  précédent (`goal-contract.ts:607`) et renvoie le contrat courant avec ses findings,
  donc un `task-contract(edit, findings: [])` **sans** mutation d'objectif suffit à relire
  la liste complète. Le marqueur ne dit donc pas « quelque chose manque » — il dit quoi, et
  avec quelle commande le récupérer.

### 4.5 Ce qui reste volontairement inchangé

- **Le chemin `compacting.prompt` — traité, pas contourné.** Ce n'est pas une voie
  « non concernée » : c'est une voie dont le défaut était **structurel** dans le cycle 1,
  puisque toute injection placée dans `buildPrompt` y était inatteignable. Le correctif
  déplace l'injection **après** résolution du prompt (§4.1), donc le bloc contrat est
  présent sur les deux voies par construction, et non par précaution. Le test T4c verrouille
  la voie plugin ; T4 verrouille la voie `buildPrompt`.
- **`buildPrompt` garde sa signature et son corps** (`:186-197`). C'est une conséquence de
  l'objection 2, pas une préférence de style.
- **`tool/goal-contract.ts` n'est pas touché.** La barrière de clôture est correcte ; c'est
  le canal qui doit être complet, pas la barrière qui doit être assouplie.
- **`SessionCompaction.process` et son type d'entrée** (`:525-531`) : inchangés. Aucun
  appelant de `use.process` n'est modifié, en production comme en test.
- **`TOOL_OUTPUT_MAX_CHARS` (`:44`), `MIN_PRESERVE_RECENT_TOKENS` (`:47`),
  `MAX_PRESERVE_RECENT_TOKENS` (`:48`), le découpage head/tail, le passage Jev** : sans
  rapport avec la perte de DoD/findings. Y toucher mélangerait deux problèmes.
- **Aucune configuration utilisateur** pour les budgets. Ce sont des constantes de
  correction, pas des préférences : un opérateur qui peut régler ce budget peut le mettre à
  zéro et réintroduire la perte. `YAGNI`.
- **Aucun format de section existant n'est modifié ni déplacé** :
  `test/session/compaction.test.ts:1728-1729` vérifie `toContain` sur
  `## Constraints & Preferences` et `## Progress` ; les assertions sont additives.
- **`stickyGoalContext` reste non exportée** (`:98`). Les tests passent par
  `formatGoalContext` (`:112`), y compris son court-circuit `status === "skipped"`
  (`:113`) et sa branche `completed` (`:115-120`) ; la surface d'export du module est
  préservée.
- **`test/server/httpapi-exercise/index.ts:1139-1167`** n'assert rien sur
  `SUMMARY_TEMPLATE` : la fixture passe par `ctx.llmText(summary)` (`:1168`). La mise à
  jour est cosmétique et sans risque. Motif corrigé : elle est déjà **défaithful** — elle
  renvoie `### Blocked` (`:1153`) et `## Key Decisions` (`:1156`) au lieu de
  `### Blocked & Difficultés` (`compaction.ts:70`) et `## Decisions & Lessons` (`:73`).
  Donc pas « pour rester fidèle », mais pour ne pas propager un gabarit de plus.

## 5. Alternatives considered

**(i) Supprimer la limite, ou la porter à 50 éléments.** Rejeté : le bloc est réinjecté à
**chaque tour** (`prompt.ts:2386`), pas une fois. La perte reste silencieuse au-delà du
plafond. On paie un coût croissant pour un défaut non résolu.

**(ii) Ne rien injecter après compaction, et demander au modèle de relire son contrat.**
Rejeté : le modèle doit construire un appel d'outil par tour, pour un fait que le harnais
possède déjà en mémoire et réinjecte déjà. Coût par tour supérieur, fiabilité inférieure
(un appel peut échouer), et la barrière continue de dépendre d'une lecture volontaire.

**(iii) Bloquer la compaction tant qu'un finding est `open`.** Rejeté : coupler deux cycles
de vie indépendants. Un finding `open` signifie « le contrat n'est pas clôturé », pas « le
transcript ne doit plus rétrécir » ; sur une session à 30 findings, ce serait un deadlock.

**(iv) Ajouter seulement les sections au gabarit, sans alimenter le résumeur.** Rejeté :
c'est la variante qui produit `## DoD (unmet)\n- (none) — every item is proven` alors
qu'un finding `open` bloque la clôture. Une affirmation fausse dans le résumé ancré est
**plus coûteuse** que son absence : elle contredit `goal-contract.ts:624` et le modèle se
retrouve à défendre un faux énoncé. C'est aussi le risque réel identifié au §3 étape 5.

**(v) Écrire l'état complet en base et le lire à la demande.** Rejeté : la base est déjà la
source de vérité (`goal-contract.ts:607` relit `previous`), mais la lecture est un appel
outillé à chaque tour.

**(vi) Élargir le type d'entrée de `processCompaction` et faire porter `goalState` par les
appelants.** Rejeté **sur preuve, pas par préférence** : `sessionID` est déjà dans le type
(`:528`), le service qui porte l'état est déjà importé (`:5`) et déjà acquis (`:377`), et la
lecture nommée existe déjà dans un autre fichier (`goal-contract.ts:576-577`). Un champ
supplémentaire serait un paramètre redondant, que le premier appelant oublie de peupler —
et l'oubli serait **silencieux**, puisque le champ serait optionnel. Cette voie est
rejetée parce qu'elle est **strictement moins sûre** que la lecture par le service, et
strictement plus coûteuse. Elle figurait dans le cycle 1 comme « voie B » : elle est
retirée.

**(vii) Plafond gelé de T3 : 750, 1 100 ou 1 200.** Arbitrage, voir §9 point 1 pour le
décret et son raisonnement. En résumé : **1 200** (`"x".repeat(4_800)`), qui conserve
`OPEN_OVERFLOW_MAX_LINES = 25`.

## 6. Risks

**Régression sur les tests existants — fichiers nommés.**

- `packages/opencode/src/session/goal-context.test.ts:11-13` — vérifie
  `SUMMARY: functional work done` (11), `FINDING SEC-001 [high/residual]` (12) et
  `UNVERIFIED: load` (13). **Compatible** : `renderBudgeted` conserve le format de ligne
  à l'identique (§4.2). C'est le test qui interdit de changer le format. Fichier de 15
  lignes, il **ne doit pas être agrandi** : `formatGoalContext` est déjà importé (ligne 2)
  et la surface d'export n'a pas besoin de bouger.
- **`packages/opencode/test/session/context-budget.test.ts` — surface de casse réelle.**
  Le bloc sticky vit **dans** `<task-contract>` (`compaction.ts:124`), et ce fichier
  segmente explicitement ce bloc en
  `["taskContract", /<task-contract[\s\S]*?(?=<goal_reminder|<task_context|$)/]`
  (ligne 294) puis plafonne `stats.systemTotal` / `stats.requestTotal` : `< 20 000` /
  `< 200 000` (lignes 414-415) et `< 60 000` / `< 300 000` (lignes 450-451). **Le bloc
  sticky compte donc dans `systemTotal`** : le pire cas corrigé vaut ≈ 4 400 car. contre
  un plafond de 20 000 sur le segment. Ce fichier est inclus dans la commande globale (§7).
- `packages/opencode/test/session/working-state-goal-dod.test.ts:54` — vérifie
  `expect(formatGoalContext(skipped)).toBe("")`. **Compatible et revérifié dans ce
  cycle** : le court-circuit `status === "skipped"` (`compaction.ts:113`) est en amont de
  `stickyGoalContext` et n'est pas touché. *Cet élément était listé en `unverified` par le
  cycle 1 : il est clos.*
- `packages/opencode/test/session/compaction.test.ts:1715-1732` — le test
  « anchors repeated compactions with the previous summary ». **Compatible**, et pour une
  raison qui n'est pas « les assertions sont additives » mais **structurelle** : la session
  de ce test est créée par `ssn.create({})` (`:1707`) sans passer par l'outil
  `task-contract`, donc `goalState` est absent, donc `goalContract` vaut `undefined`, donc
  `nextPrompt` est identique à celui d'aujourd'hui. `:1727`
  (`captured.match(/summary one/g)?.length).toBe(1)` et `:1728-1729` ne peuvent donc pas
  bouger. C'est l'argument de non-régression le plus fort du patch, et il tient parce que
  l'injection est **conditionnelle à la présence d'un état**, pas inconditionnelle.
- `packages/opencode/test/server/httpapi-exercise/index.ts:1139-1167` — copie figée du
  gabarit comme réponse LLM factice, n'assert rien sur `SUMMARY_TEMPLATE` (§4.5).
- **`packages/opencode/src/eval/eval.test.ts:914` + `packages/opencode/src/eval/scenario.ts:90`
  — consommateur du préfixe `UNVERIFIED:`, hors du fichier de compaction.**

  ```ts
  export const UNVERIFIED_PREFIX = "UNVERIFIED:"
  ```
  ```ts
      expect(result.errors.join(" ")).toContain("UNVERIFIED:")
  ```

  Non testé par ce patch, mais le préfixe est un contrat partagé : toute modification du
  libellé `UNVERIFIED:` doit passer par `UNVERIFIED_PREFIX`, pas par une littérale. Le
  correctif **conserve** le libellé (§4.2), donc ces deux surfaces sont intactes.
- `packages/opencode/test/tool/goal-contract.test.ts` — non concerné, aucun fichier de
  `src/tool/` modifié.
- **Ce qui n'est pas établi par ce cycle, et qui était affirmé au cycle 1.** Le cycle 1
  appuyait son affirmation « rayon de casse fermé » sur des comptes de `rg` (« 2 hits »,
  « 7 hits », « 10 hits ») qu'il n'avait pas exécutés et que la revalidation n'a pas pu
  rejouer non plus. Cette révision **ne recopie aucun de ces comptes**. Les faits
  Positive vérifiés par lecture sont : `SUMMARY_TEMPLATE` est déclarée à `compaction.ts:55`
  et assemblée à `:196` ; `compaction.test.ts:1728-1729` n'asserte que sur
  `## Constraints & Preferences` et `## Progress` ; `goal-context.test.ts:11-13` n'asserte
  que sur `SUMMARY:`, `FINDING` et `UNVERIFIED:` ; `httpapi-exercise/index.ts:1168`
  n'asserte rien. L'absence d'autres `toContain` sur les titres ajoutés reste en
  `unverified` (§9), avec la commande qui la tranche.

**Coût en tokens et en latence, chiffré.** `Token.estimate` divise par 4
(`src/util/token.ts:1-4`). Le cycle 0 chiffrait un « pire cas » défini par le nombre
**total** de findings, alors que `goal-contract.ts:609`
(`findings.filter((finding) => finding.status === "open")`) rend la répartition
`open` / non-`open` **non libre** : plus la session est bloquée, plus `N_open` est grand.
Le tableau est donc recalculé sur le **pire cas `open`**, qui est la configuration que la
découverte décrit. Les comptes de caractères sont **estimés à la main** (`INFERE:` : voir
§4.3 pour les commandes de confirmation) ; la conversion en tokens est exacte, elle
utilise la formule relue.

| poste | aujourd'hui | après correctif | écart |
|---|---|---|---|
| palier findings, 10 premières lignes | 10 × 273 = 2 730 car. ≈ 683 tok | 1 600 car. = 400 tok | **−1 130 car.** |
| findings au-delà (noyau de la perte) | **supprimés sans avis** | bande bornée 1 675 car. ≈ 419 tok | **+1 675 car.** (coût rendu visible) |
| marqueur `open` | aucun | ≈ 197 car. ≈ 49 tok | +197 car. |
| palier `unverified` | 10 × 415 = 4 150 car. ≈ 1 038 tok | **fusionné dans le palier détail** : 800 car. = 200 tok | **−3 350 car.** |
| marqueur de détail | aucun | ≈ 129 car. ≈ 32 tok | +129 car. |
| **pire cas absolu, bloc sticky** | **≈ 6 880 car. ≈ 1 720 tok** | **≈ 4 401 car. = 1 100 tok** | **−2 479 car. ≈ −620 tok par tour** |
| prompt du résumeur (entrée), pire cas | — | + ≈ 4 400 car. ≈ +1 100 tok | une fois par compaction |
| prompt du résumeur (entrée), cas courant | — | + ≈ 500 car. ≈ +125 tok | une fois par compaction |
| résumé ancré (sortie) | — | 2 titres (~16 car.) + ~4 puces ≈ +35 à +50 tok | une fois par compaction |

Le correctif est donc **moins cher que l'existant dans le pire cas**, tout en étant complet
— ce qui est l'inverse de la conclusion du cycle 0. Le surcoût du résumeur est borné et
ne s'applique qu'une fois par compaction.

Comparaison au coût d'un agent bloqué : une compaction facture le `head` entier, chaque
part d'outillage y étant plafonnée à `toolOutputMaxChars: TOOL_OUTPUT_MAX_CHARS = 2 000`
caractères (`compaction.ts:44`, appliqué en `:673`) ≈ **500 tok par part**. Sur la session
auditée, la perte a provoqué **2 compactions manuelles à 2,7 minutes d'intervalle**. `INFERE:`
avec un `head` de 200 parts, un seul appel ≈ 100 000 tok ; le surcoût du correctif au pire
cas (≈ 1 100 tok d'entrée) est **≈ 1,1 % d'un seul de ces appels**, et l'économie récurrente
(≈ 620 tok **à chaque tour** qui suit) le rembourse en une handful de tours. Vérification :
compter les parts d'outillage du `head` de la session auditée et appliquer
`parts × Token.estimate(TOOL_OUTPUT_MAX_CHARS)`.

**Latence.** Calcul pur sur des chaînes déjà en mémoire (`toSorted` + `map` + boucle) :
aucune E/S supplémentaire par tour. Le surcoût par tour est un `get` de session déjà en
mémoire (déjà fait à `:711`) et deux tris sur des tableaux de quelques dizaines d'éléments,
soit négligeable devant le coût d'un tour d'agent. Le seul coût d'E/S nouveau est **un
`get` par compaction**, négligeable face à un appel de résumeur.

**Sécurité / injection.** Le bloc sticky est déjà de la donnée modèle-visible ; le correctif
n'ajoute **aucune** nouvelle surface de confiance, il élargit seulement le volume déjà
injecté (`prompt.ts:2386`) — et le §6 le ramène sous le volume actuel. Le contenu reste au
format prefixed `FINDING <id> [<severity>/<status>]:`, un jeton d'état de harnais avant
tout texte libre, ce qui empêche de lire un résumé de finding comme une instruction. Les
marqueurs sont construits par le harnais et **n'embarquent aucun texte modèle** : un
finding ne peut donc pas fabriquer de faux marqueur, et le préfixe `OPEN:` les distingue des
lignes de finding. Les budgets par élément (`120` / `160` car.) sont **conservés** : c'est
aussi une borne d'injection, et les relever serait une régression de sécurité.
`goalContract` est produit par `formatGoalContext`, donc **échappé par construction**, et il
est concatené **hors de `input.context`** — un plugin qui fournit du contexte ne peut pas
y fusionner son texte. Aucune permission, aucun outil, aucun droit d'écriture ajouté.

## 7. Tests

**T4 — le gabarit porte les deux sections, ET le bloc contrat atteint le résumeur. Ce test
est le test de condition du §8, et il est rouge avant le patch.**
Chemin : `packages/opencode/test/session/compaction.test.ts`, construit sur le précédent
`« anchors repeated compactions with the previous summary »` (`:1694-1733`), dont il
reprend les helpers réels : `llm()` (`:312`), `reply(text, capture)` (`:334`, dont le
deuxième argument est bien le `capture` de `:1700-1702`), `withCompaction` (`:265`),
`itCompaction.instance` (`:255`), `createUserMessage` (`:1708`) et
`createCompactionMarker` (`:1710`).

```ts
itCompaction.instance(
  "the task contract reaches the summarizer, not only the template",
  () => {
    const stub = llm()
    let captured = ""
    stub.push(reply("summary one", (input) => { captured = JSON.stringify(input.messages) }))
    return Effect.gen(function* () {
      const ssn = yield* SessionNs.Service
      const session = yield* ssn.create({})
      yield* ssn.setGoalState({ sessionID: session.id, goalState: GOAL_WITH_OPEN_FINDING })
      yield* createUserMessage(session.id, "older context")
      yield* createCompactionMarker(session.id)
      const msgs = yield* ssn.messages({ sessionID: session.id })
      const parent = msgs.at(-1)?.info.id
      expect(parent).toBeTruthy()
      yield* SessionCompaction.use.process({ parentID: parent!, messages: msgs, sessionID: session.id, auto: false })
      expect(captured).toContain("<task-contract")
      expect(captured).toContain("FINDING SEC-001 [high/open]")
      expect(captured).toContain("## DoD (unmet)")
      expect(captured).toContain("## Findings")
    }).pipe(withCompaction({ llm: stub.layer }))
  },
  { git: true },
)
```

`GOAL_WITH_OPEN_FINDING` est une constante locale du test, littéral `GoalState` repris de
la fixture existante (`goal-context.test.ts:6-10`) avec deux seules modifications : `status`
vaut `"approved"` au lieu de `"completed"`, et le finding est `open` au lieu de `residual`.
Comme dans la fixture existante, le littéral est passé avec `as any` — aucune surface
d'export n'est ajoutée pour cela. L'écriture de l'état passe par
`ssn.setGoalState({ sessionID, goalState })`, le même écrivain que
`goal-contract.ts:620` — donc aucun accessor nouveau.

Commande : `bun test test/session/compaction.test.ts -t "task contract reaches"`.

Critère de succès : les quatre `toContain`. **Critère de discriminant** : `captured` ne
peut pas contenir `<task-contract` avant le patch, parce que le prompt de compaction
n'embarque aujourd'hui aucun état de contrat (preuve 5, `compaction.ts:196` et `:730-735`).
Le test est donc **rouge avant, vert après** — contrairement au test lexical du cycle 1,
qui était vert dans les deux mondes.

**T4c — le chemin plugin qui force `compacting.prompt` porte aussi le bloc.**
Chemin et commande : `test/session/compaction.test.ts`,
`bun test test/session/compaction.test.ts -t "plugin prompt keeps the contract"`.
Le test fournit un `Plugin.Service` dont `trigger` renvoie `{ context: [], prompt: "…" }`
pour `experimental.session.compacting`, via l'option `plugin` de `CompactionProcessOptions`
(`compaction.test.ts:260`, `plugin?: Layer.Layer<Plugin.Service>`), puis affirme que le
texte capturé contient **à la fois** la chaîne imposée par le plugin **et**
`<task-contract`. C'est la preuve exécutable de l'objection 2 : le bloc contrat survit à la
voie qui court-circuite `buildPrompt`. `INFERE:` la forme exacte du stub `Plugin.Service`
n'a pas été relue dans ce cycle (elle est dans `packages/opencode/src/plugin/index.ts`) ;
le critère d'assertion et le besoin d'un `plugin` par défaut qui laisse `prompt` à
`undefined` sont en revanche établis. Vérification avant d'écrire le test :
`rg -n "trigger" packages/opencode/src/plugin/index.ts`, puis lire la signature.

**T4b — test d'effet sur le résumé produit.** T4 assert le **prompt** : il passe
intégralement si le résumeur ignore les deux sections et n'écrit rien. L'item DoD central de
P06 est « le résumé ancré porte la DoD et les findings », et le cycle 0 ne lui donnait
**aucune** preuve. T4b observe donc le **résumé**, après compaction, via le même
read-back que le précédent `:1720` (`MessageV2.filterCompacted(MessageV2.stream(session.id))`).

```ts
    const stub = llm()
    stub.push(reply(SUMMARY_WITH_CONTRACT))
    ...
      yield* SessionCompaction.use.process({ parentID: parent!, messages: msgs, sessionID: session.id, auto: false })
      const after = JSON.stringify(MessageV2.filterCompacted(MessageV2.stream(session.id)))
      expect(after).toContain("## DoD (unmet)")
      expect(after).toContain("FINDING SEC-001 [high/open]")
```

où `SUMMARY_WITH_CONTRACT` est un résumé contenant `## DoD (unmet)`, `## Findings` et
`FINDING SEC-001 [high/open]`. Commande :
`bun test test/session/compaction.test.ts -t "summary carries the contract"`.

**Ce que T4b prouve, et ce qu'il ne prouve pas — limite assumée.** T4b prouve la
**plomberie** : le bloc `<task-contract>` atteint le résumeur (T4), et ce que le résumeur
renvoie est persisté verbatim dans le transcript (T4b). Il **ne prouve pas** l'obéissance
du modèle au gabarit, et aucun test à stub ne le peut : un stub répond ce qu'on lui dicte.
La moitié « le modèle remplit réellement les sections » reste non couverte par la suite
automatique, et c'est précisément la moitié qui protège du `(none)` affirmatif. Elle est
traitée par la règle anti-invention du gabarit (§4.1) et reste listée en `unverified` (§9)
avec son protocole de vérification manuelle. Écrire un test qui prétendrait la couvrir serait
un faux test.

**T1 — budget, budget partagé unique, et marqueur chiffré**
(`packages/opencode/src/session/goal-context.test.ts`, qui importe déjà
`formatGoalContext` ligne 2).
Commande : `bun test src/session/goal-context.test.ts` depuis `packages/opencode`.
Fixture calquée sur l'existante (ligne 8 : `firstSeenAt: 1, updatedAt: 2`). Quatre
assertions observables :
1. avec 26 findings dont 3 `open`, le contexte contient `FINDING F-0003 [critical/open]` ;
2. il contient une ligne `+N éléments non affichés` avec `N` **exactement** égal au nombre
   de findings non affichés, et le nom `F-0011` y figure ;
3. avec 3 findings, le contexte **ne contient pas** `éléments non affichés` ;
4. **invariant de budget fusionné** : avec 40 findings non-`open` et 40 lacunes, la
   longueur totale du palier de détail est inférieure à
   `DETAIL_BUDGET_CHARS + longueur du marqueur`. Sans cette assertion, une
   implémentation à deux appels sur le même budget passerait les trois premières.

**T2 — priorité et clé de départ du tri** (même fichier, même commande). Deux assertions,
pour encoder deux règles distinctes :
1. **priorité** : avec 12 findings dont le premier en insertion est `closed` et le douzième
   est `open`, la ligne `open` est présente **et** précède la ligne `closed` ;
2. **clé de départ, pas stabilité accidentelle** : avec deux findings `closed` dont celui
   inséré en premier a le **plus grand** `firstSeenAt`, la sortie est ordonnée par
   `firstSeenAt` croissant. Sans cette assertion, une réécriture future du tri en `sort`
   non stable changerait silencieusement quels findings sont coupés au seuil.

**T3 — plafond gelé, auto-suffisant, avec marge** (même fichier). La version initiale
comparait à « le rendu d'aujourd'hui », c'est-à-dire à une implémentation que le patch
supprime — un test qui ne peut pas s'auto-référencer à ce qu'il valide. Plafond **absolu et
gelé dans le test**, ne référençant aucune implémentation :

```ts
const FROZEN_CEILING_TOKENS = Token.estimate("x".repeat(4_800)) // 1 200
expect(Token.estimate(formatGoalContext(state45allOpen))).toBeLessThanOrEqual(FROZEN_CEILING_TOKENS)
expect(Token.estimate(formatGoalContext(state45mixed))).toBeLessThanOrEqual(FROZEN_CEILING_TOKENS)
```

Le fixture `state45allOpen` est **le pire cas corrigé** : c'est lui qui justifie les
nombres du §6, et le tableau initial ne le couvrait pas. La valeur du plafond est arbitrée
au §9 point 1 ; les deux formules sont exactes par construction
(`token.ts:1-4` : `Math.round(4 800 / 4)` = 1 200).

**T5 — non-régression de la barrière.**
Commande : `bun test test/tool/goal-contract.test.ts`.
Critère de succès : suite verte, aucun fichier de `src/tool/` modifié. Le refus de clôture
doit être **exactement** le même avant et après, message `:624` inclus.

**Commande globale de non-régression** — `context-budget.test.ts` inclus :

```
bun test src/session/goal-context.test.ts test/session/compaction.test.ts test/session/context-budget.test.ts test/session/working-state-goal-dod.test.ts test/session/working-state.test.ts test/tool/goal-contract.test.ts
```

**Porte de type, distincte des tests.** Le patch ne modifie aucun type ni aucune
signature, donc le compilateur est la preuve que « aucun appelant n'est touché » :
`bun typecheck` doit sortir en `0` avec `test/session/compaction.test.ts` **non modifié**.
C'est la moitié statique du test de condition (§8).

## 8. Effort

**`S`.** Un seul fichier de production (`src/session/compaction.ts`), aucune API nouvelle,
aucun nouveau service, aucun changement de schéma (`firstSeenAt` existe déjà,
`goal-evidence.ts:11`), aucune migration, et **aucune modification du type d'entrée de
`SessionCompaction.process`** (`compaction.ts:525-531`).

**Pourquoi S, et non M — la justification du cycle 1 était fausse.** Le cycle 1 affirmait
que « l'accès à `GoalState` depuis `processCompaction` n'existe pas », en s'appuyant sur une
recherche lexicale de dix hits dans un seul fichier, tous de niveau module. C'est vrai au
sens lexical et faux quant à la portée :

- `compaction.ts:5` importe déjà `./session`.
- `compaction.ts:372-374` ouvre le générateur et `:377` y acquiert déjà
  `const session = yield* Session.Service`, **avant** `processCompaction` (`:525`).
- Ce même `session` est déjà utilisé à `:477` (`session.messages`) et `:711`
  (`session.updateMessage`).
- `goal-contract.ts:576-577` établit que ce service rend l'état par une **lecture nommée** :
  `sessions.get(ctx.sessionID).goalState`.

L'injection coûte donc une ligne à `compaction.ts:654-660` (§4.1), et la voie A est
**établie par citation**, pas supposée. La voie B — élargir le type d'entrée et faire porter
`goalState` par les appelants — est retirée (§5 vi) : elle est redondante, plus coûteuse, et
introduirait un oubli silencieux.

**Test de condition — reconstruit, parce que l'ancien ne prouvait rien.** Le test du cycle 1
était `rg -n "goalState|formatGoalContext" packages/opencode/src/session/compaction.ts`.
Il cherche un **littéral dans un seul fichier** : il ne peut pas distinguer un monde où le
chemin passe par le service `Session` d'un monde où il n'existe pas. Il renvoie 10 hits, et
la révision en conclut « la condition est fausse ». C'est la structure exacte du défaut
**C-20** enregistré dans `CORRECTIONS.md` : un test qui passe dans les deux mondes. Il est
**abandonné**, et remplacé par une preuve comportementale en deux moitiés :

1. **Partie comportementale — T4 (§7).**
   `bun test test/session/compaction.test.ts -t "task contract reaches"`.
   Avant le patch, le prompt de compaction n'embarque aucun état de contrat, donc
   `expect(captured).toContain("<task-contract")` **échoue**. Après le patch, il passe. Ce
   test **échoue réellement sans le correctif** : c'est le critère demandé.
2. **Partie statique — porte de compilation.** `bun typecheck` doit sortir en `0`, avec
   `test/session/compaction.test.ts` non modifié et le type d'entrée `:525-531` inchangé.
   C'est ce qui prouve qu'aucun appelant de `use.process` n'a besoin d'être touché : les
   appels existants transmettent déjà `sessionID` (forme vérifiée en `:1715` :
   `{ parentID, messages, sessionID, auto }`), et le patch n'ajoute aucun champ.

Les deux moitiés ensemble remplacent la condition à vérifier. La formulation retenue est
donc : **l'accès est établi ; le test qui le prouve est exécutable et rouge avant le
patch.**

## 9. Verdict self-assessment

`READY`. La cause racine est vérifiée et revérifiée par lecture, le correctif est borné,
testable sans réseau, chiffré, et **d'un seul fichier de production**. Les quatre objections
de la revalidation sont traitées : l'objection bloquante (effort et périmètre) est reprise
au §8 et au §5 vi, l'objection 2 (court-circuit plugin) au §4.1 avec un test dédié T4c,
l'objection 3 (budget partagé) au §4.3 par fusion, l'objection 4 (plafond T3) par
l'arbitrage ci-dessous. RC1 à RC6 sont traitées.

Décisions de valeur, **prises ici et non laissées ouvertes** :

1. **Valeur du plafond gelé de T3 — 1 200 tokens** (`"x".repeat(4_800)`), soit
   `Token.estimate("x".repeat(4_800))` = 1 200 par `token.ts:1-4`. **C'est un choix de
   politique, pas une mesure** : aucun runtime n'a pu être exécuté dans ce cycle.
   L'arithmétique qui le contraint, recomptée caractère par caractère (§4.3) :
   plancher `open` 1 600 car. + bande 25 × 67 = 1 675 car. + marqueur `open` ≈ 197 car. +
   palier détail 800 car. + marqueur de détail ≈ 129 car. = **4 401 car. = 1 100 tok
   exactement**. Les deux marqueurs étaient sous-estimés au cycle 1 (≈ 150 et ≈ 90), ce qui
   rendait le plafond 1 100 faussement confortable. **Conséquence : 1 100 n'a plus aucune
   marge** — un plafond gelé à 0 car. de marge échoue au premier caractère ajouté dans un
   marqueur, donc ce n'est pas un plafond utilisable. La revalidation recommandait 1 100
   sur la base des comptes du cycle 1 ; **cette révision en diverge, et le dit** : elle
   retient 1 200, qui conserve `OPEN_OVERFLOW_MAX_LINES = 25` avec ≈ 399 car. / 100 tok de
   marge, tout en restant à ≈ 4 800 car. du plafond `context-budget.test.ts:414`
   (`< 20 000`). Descendre à 1 100 exigerait de ramener `OPEN_OVERFLOW_MAX_LINES` à 24,
   ce qui n'achète que 67 car. de marge et n'en vaut pas le prix : un plafond arbitraire
   n'est pas une politique. L'alternative 750 (prescrite par le verdict d'origine)
   reste écartée : elle ne s'obtient qu'avec `OPEN_OVERFLOW_MAX_LINES = 5`, qui ne nomme
   que cinq ids `open` et affaiblit la capacité de récupération du §4.4.
2. **`OPEN_OVERFLOW_MAX_LINES = 25`.** Arbitrage : plus de lignes nomme plus d'ids `open`
   au prix d'un bloc plus gros. La constante est isolée, T3 la protège, et le comportement
   reste correct pour toute autre valeur — y compris `0`, qui supprime la bande et ne
   laisse que le marqueur chiffré.
3. **Fusion du palier de détail plutôt que budget partagé à deux appels.** Voir §4.3 et
   l'invariant de budget : un budget partagé à `spent` local n'est pas exprimable, donc
   les paliers sont fusionnés et il n'y a qu'un site d'appel. T1.4 verrouille l'invariant.

`unverified` — à rejouer avant implémentation, avec le protocole indiqué :

- **L'obéissance du résumeur au gabarit** (§7 T4b). Aucun test à stub ne la prouve.
  Protocole : compaction réelle sur une session ayant ≥ 1 finding `open` et ≥ 1 DoD non
  prouvée, puis lecture du résumé ancré ; critère : `## Findings` ne contient ni
  `(none)` ni un id absent de `state.findings`.
- **La forme du stub `Plugin.Service` pour T4c** (§7). `INFERE:` ; protocole :
  `rg -n "trigger" packages/opencode/src/plugin/index.ts`, puis lire la signature de
  `trigger` et de `Plugin.Service`.
- **L'absence d'autres assertions sur les titres ajoutés** (§6). Cette révision ne peut
  pas l'établir par lecture seule sur l'ensemble du dépôt. Protocole :
  `rg -n "## DoD|## Findings|SUMMARY_TEMPLATE" packages/opencode`, puis vérifier que
  chaque hit est soit `compaction.ts:55`/`:196`, soit une assertion additive.
- **L'absence de post-traitement de la sortie du résumeur ailleurs dans
  `compaction.ts`** (§2 preuve 5). Établi pour les plages `:40-200`, `:460-600`, `:640-768`
  — donc entre l'assemblage du prompt et le consumption de la réponse, la chaîne est
  intacte. Protocole : `rg -n "Progress|ensureSection|normalize|replace\(|template"
  packages/opencode/src/session/compaction.ts`, puis lire les hits hors de ces plages.
- **Les trois estimations de longueur de marqueur** (≈ 197, ≈ 129, et les 273 / 415
  caractères par ligne du tableau §6). Comptées à la main, aucune commande exécutée dans
  ce cycle. Les commandes de confirmation sont dans §4.3. Aucune **décision** du §9 ne
  dépend d'elles au-delà du choix de marge du plafond, qui est argumenté par le pire cas
  dans son ensemble.
- **La mesure terrain** « 5 compactions, dont 2 manuelles à 2,7 minutes, 5 parts d'écart »
  est fournie avec le contrat et n'est pas reproductible par une commande de ce dépôt ;
  aucun chiffre du §6 n'en dépend seul.