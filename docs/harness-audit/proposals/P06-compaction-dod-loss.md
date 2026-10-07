# P06 — Le résumé de compaction ne porte ni DoD ni findings, et le mécanisme de secours qui les porte est tronqué en silence

## 1. Problem

Quand le harnais compacte une session, le texte de remplacement ne contient aucune
section Definition of Done ni aucune section findings, et le bloc de contexte qui,
lui, sait les contenir est amputé sans jamais le dire : au-delà de dix éléments,
le onzième disparaît du prompt sans marqueur.

## 2. Evidence

**(1) Le gabarit du résumé n'a ni DoD ni findings** — `packages/opencode/src/session/compaction.ts:55-90`.

Cité indenté de deux espaces, pour que les titres du gabarit opencode ne soient pas
confondus avec les titres de la présente proposition.

```ts
  ## Progress
  ### Done
  - [completed work or "(none)"]
  ### In Progress
  - [current work or "(none)"]
  ### Blocked & Difficulties
  - [blockers, root causes of bugs/delays, difficulties encountered, or "(none)"]
  ## Decisions & Lessons
```

Sections effectivement déclarées : `## Goal` (57), `## Constraints & Preferences` (60),
`## Progress` (63) avec `### Done` (64) / `### In Progress` (67) / `### Blocked & Difficultés` (70),
`## Decisions & Lessons` (73), `## Next Steps` (76), `## Critical Context` (79),
`## Relevant Files` (82). Aucune section `DoD`, aucune section `findings`. Le résumé
ancré est donc structurellement incapable de porter le contrat de sortie.

**(2) Le mécanisme de secours est tronqué en silence** — `packages/opencode/src/session/compaction.ts:98-105`.

```ts
function stickyGoalContext(state: GoalState): string {
  const findings = (state.findings ?? [])
    .slice(0, 10)
    .map((finding) => `FINDING ${finding.id} [${finding.severity}/${finding.status}]: ${finding.summary.slice(0, 240)}`)
  const gaps = (state.completion?.unverified ?? [])
    .slice(0, 10)
    .map((item) => `UNVERIFIED: ${item.dod.slice(0, 160)} → ${item.reason.slice(0, 240)}`)
```

Deux `slice(0, 10)` par liste, aucun indicateur de reste, aucun ordre de priorité :
l'ordre d'insertion décide, donc un finding `open` créé en premier est无从 Guaranteed et un
finding `open` créé en onzième n'existe pas pour le modèle.

**(3) La barrière anti-clôture dépend pourtant de ces findings** — `packages/opencode/src/tool/goal-contract.ts:609-628`.

```ts
const openFindings = findings.filter((finding) => finding.status === "open")
if (openFindings.length > 0) {
  ...
  return responseResult({
    status: "error", action: "complete", ...
    warnings: [
      "Completion refused: sticky findings remain OPEN.",
      ...openFindings.map((finding) => `${finding.id}: ${finding.summary}`),
```

Écart de chemin à signaler au validateur : le contrat P06 pointe
`packages/opencode/src/session/goal-contract.ts:609-628`, le fichier réel est
`packages/opencode/src/tool/goal-contract.ts:609-628` (ligne 624 pour le message exact).

**(4) Le bloc est bien réinjecté, mais son contenu est amputé** — `packages/opencode/src/session/compaction.ts:112-125`.

```ts
const body = state.compressed ?? compressGoalState(state)
const sticky = stickyGoalContext(state)
return `<task-contract status="${state.status}">\n${body}${sticky ? `${sticky}\n` : ""}</task-contract>\n`
```

Et `packages/opencode/src/session/prompt.ts:2381-2386` l'injecte une fois par tour :

```ts
if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
  const goalCtx = cachedGoal.cached ? cachedGoal.value : injectionCache.set(goalKey, formatGoalContext(goalState))
  if (goalCtx) volatile.push(goalCtx)
```

La réinjection fonctionne ; c'est le contenu qu'elle transporte qui est incomplet.

**(5) Mesure terrain** — 5 compactions sur la session auditée, dont 2 manuelles à
2,7 minutes d'intervalle sur 5 parts d'écart (mesure fournie avec le contrat P06,
non reproductible par une commande : voir `unverified` en section 9).

## 3. Mechanism

Chemin d'exécution, de bout en bout :

1. La session déborde (ou l'utilisateur déclenche `/compact`). `SessionCompaction.create`
   (`compaction.ts:912`) écrit une part `compaction` sur un message utilisateur.
2. `processCompaction` (`compaction.ts:525`) découpe le transcript en `head` + queue
   verbatim (`select`, `compaction.ts:416`), puis lit le résumé précédent
   (`completedCompactions`, `compaction.ts:168`).
3. `buildPrompt` (`compaction.ts:186`) assemble `anchor` + `SUMMARY_TEMPLATE` + context.
   **À cet instant, rien de l'état du contrat n'est fourni au résumeur** : ni la DoD,
   ni les findings. Le modèle ne peut écrire que ce qu'il devine dans l'historique.
4. Le résumeur répond. Comme le gabarit (preuve 1) n'a pas de section correspondante,
   la DoD et les findings **ne sont pas écrits** — ils n'ont pas de case. Le modèle ne
   les loge pas « dans une section » : il n'y a pas de section, et la règle
   `Do not mention the summary process` (`compaction.ts:90`) interdit d'inventer un
   encadré.
5. Le résumé devient le transcript. À partir du tour suivant, l'agent travaille avec un
   historique où DoD et findings ont été supprimés par construction.
6. Le seul filet restant est `formatGoalContext` → `stickyGoalContext`
   (`compaction.ts:98-125`), réinjecté à chaque tour par `prompt.ts:2381-2386`.
   Ce filet coupe à dix éléments (preuve 2) : le onzième finding et la onzième lacune
   disparaissent, silencieusement, à chaque tour, pour toujours.
7. Le point de culmination : `goal-contract.ts:609-628` refuse la clôture tant qu'un
   finding est `open`. Un agent qui a perdu de vue le onzième finding ne voit plus que
   dix lignes et juge le contrat satisfaible ; il tente `complete`, reçoit
   « Completion refused », ne sait pas quel finding l'a déclenché, recommence à
   fouiller. La barrière, qui existe pour empêcher une clôture frauduleuse, produit à la
   place une boucle de refus sans cause identifiable.

Cause racine unique : le contrat de sortie possède deux representations indépendantes
(l'état `GoalState` persisté, et le texte que le modèle relit), et aucune des deux n'est
garantie complète après une compaction.

## 4. Proposal

Un seul fichier de production modifié : `packages/opencode/src/session/compaction.ts`.
Aucun autre fichier source n'est touché ; `src/tool/goal-contract.ts` est laissé intact
(il est correct : c'est le canal de restitution qui est lacunaire, pas la barrière).

### 4.1 (a) Deux sections dans le gabarit, et les données qui les remplissent

**Gabarit** — insertion entre `### Blocked & Difficultés` (ligne 70) et `## Decisions & Lessons`
(ligne 73), plus une règle dans le bloc `Rules` :

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

L'ancrage des deux sections après `### Blocked & Difficultés` est délibéré : ce sont des
énoncés d'avancement, donc ils appartiennent au bloc `## Progress`, pas à `## Critical Context`
(qui décrit le contexte technique). `## Decisions & Lessons` garde sa position, donc
l'ordre imposé par `keep the section order unchanged` reste valide.

**Données** — le gabarit ne suffit pas : sans source, le résumeur écrira `"(none)"`, ce qui
est pire que l'absence (il nierait un finding `open` qui bloque la clôture). Il faut donc
alimenter le prompt de compaction avec l'état vivant du contrat, exactement comme
`prompt.ts:2385` le fait pour le tour normal :

```ts
function buildPrompt(input: { previousSummary?: string; context: string[]; goalContract?: string }) {
  const anchor = /* … inchangé … */
  return [anchor, SUMMARY_TEMPLATE, ...(input.goalContract ? [input.goalContract] : []), ...input.context].join("\n\n")
}
```

et, au site d'appel `compaction.ts:655-660`, passer `goalContract: formatGoalContext(goalState)`
lorsque l'état est disponible. Coût : **une seule** occurrence de ce bloc, dans **un seul**
appel de summarizer — il ne coûte pas de contexte persistant.

> `INFERE:` le service `Session` n'expose pas, dans `src/session`, de getter nommé
> `getGoalState` (recherche `getGoalState|goalState\(|cachedGoal|injectionCache` sur
> `packages/opencode/src` : les seuls résultats sont `prompt.ts:1747` et `prompt.ts:2384-2392`).
> `goalState` est donc produit en amont dans `prompt.ts` par une voie non nommée dans cette
> fenêtre. Vérification avant implémentation :
> `rg -n "goalState" packages/opencode/src/session/prompt.ts | Select-Object -First 30`
> puis réutiliser le même accès dans `processCompaction`. Si aucun getter n'existe,
> l'alternative不退 est d'exposer `goalState` sur l'interface `Session` — changement plus
> large, qui justifie alors un second dossier de proposition plutôt qu'un patch ici.

### 4.2 (b) Un budget en tokens, et une ligne de reste non ambiguë

Remplacement des deux `slice(0, 10)` par un rendu budgété. Le format de ligne est
**conservé à l'identique** (`FINDING <id> [<severity>/<status>]: <summary>`) pour ne pas
casser `src/session/goal-context.test.ts:12-13`.

```ts
type Sticky = { id: string; text: string }

/** Never hide a line: whatever does not fit is named, in order, with its id. */
function renderBudgeted(items: readonly Sticky[], budget: number) {
  const shown: string[] = []
  const hidden: string[] = []
  let spent = 0
  for (const item of items) {
    if (shown.length > 0 && spent + item.text.length > budget) hidden.push(item.id)
    else { shown.push(item.text); spent += item.text.length }
  }
  return { shown, hidden }
}
```

Budgets exprimés en caractères, convertis avec `Token.estimate`
(`packages/opencode/src/util/token.ts:1-4`, `CHARS_PER_TOKEN = 4`) :

| constante | valeur | tokens |
|---|---|---|
| `OPEN_BUDGET_CHARS` | 1 600 | ~400 |
| `DETAIL_BUDGET_CHARS` | 800 | ~200 |
| ligne finding non-`open` | 120 caractères | ~30 |
| ligne finding `open` | 160 caractères | ~40 |
| marqueur de reste | ~90 caractères | ~22 |

Le marqueur est **généré par le harnais, jamais par le modèle**, et il nomme les éléments
perdus — c'est ce qui rend la perte actionnable au lieu d'être silencieuse :

```ts
const OVERFLOW_MARKER = (ids: readonly string[]) =>
  `+${ids.length} éléments non affichés : ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ", …" : ""} — lire la liste complète via task-contract(edit)`
```

### 4.3 (c) Un finding `open` n'est jamais tronqué : priorité open > residual > out_of_scope > closed

```ts
const FINDING_PRIORITY: Record<GoalFinding["status"], number> = {
  open: 0, residual: 1, out_of_scope: 2, closed: 3,
}
```

`stickyGoalContext` devient, en ordre :

1. **Palier `open`** — budget propre `OPEN_BUDGET_CHARS`, jamais partagé avec le reste,
   résumé à 160 caractères. C'est ce palier que la barrière `goal-contract.ts:610` consulte.
2. **Palier non-`open`** — budget `DETAIL_BUDGET_CHARS` partagé, résumé à 120 caractères.
3. **Palier `unverified`** — budget `DETAIL_BUDGET_CHARS` partagé, libellés conservés
   (`UNVERIFIED: <dod> → <reason>`).
4. **Marqueur** — émis si et seulement si `hidden.length > 0`, ids inclus.

** saturation du palier `open`.** Si des findings `open` débordent malgré tout
`OPEN_BUDGET_CHARS` — scénario à plus de 40 findings `open` simultanés — ils ne sont pas
supprimés : ils **se dégradent** en ligne d'index, hors budget de détail :

```ts
if (open.hidden.length) shown.push(...open.hidden.map((id) => `OPEN: ${id} [open] — résumé tronqué, lire via task-contract(edit)`))
```

Coût de cette dégradation : ~40 caractères par finding `open` surnuméraire, donc borné et
sûrement inférieur à la ligne complète qu'elle remplace. Un finding `open` disparaît du
prompt quand, et seulement quand, il disparaît aussi de l'état persisté — ce qui est le
seul cas où le silence est correct.

### 4.4 Le cas du 11ᵉ finding invisible, et comment le récupérer

Avant correctif, un onzième finding est dans un état impossible à rattraper depuis le
prompt : absent du résumé (pas de section), absent du filet (coupé), présent en base. Le
modèle ne peut que le redécouvrir par hasard. Après correctif, il y a deux sorties, toutes
deux actionnables :

- **≤ budget** : il est affiché, avec son id, sa sévérité et son statut.
- **> budget** : le marqueur nomme son id dans les six premiers, ou le compte au-delà, et
  désigne l'outil de lecture. La route de récupération est explicite et déjà persistante :
  `task-contract` accepte `action: "create" | "edit" | "suggest" | "apply" | "complete"`
  (`packages/opencode/src/tool/goal-contract.ts:21`) ; `edit` lit l'état précédent
  (`previous`, `goal-contract.ts:607`) et renvoie le contrat courant avec ses findings, donc
  un `task-contract(edit, findings: [])` **sans** mutation d'objectif suffit à relire la
  liste complète. Le marqueur ne dit donc pas « quelque chose manque » — il dit quoi, et
  avec quelle commande le récupérer.

### 4.5 Ce qui reste volontairement inchangé

- **`goal-contract.ts` n'est pas touché.** La barrière de clôture est correcte ; c'est le
  canal qui doit être complet, pas la barrière qui doit être assouplie.
- **`TOOL_OUTPUT_MAX_CHARS`, `MAX_PRESERVE_RECENT_TOKENS`, le découpage head/tail, le
  passages Jev** : sans rapport avec la perte de DoD/findings. Y toucher mélangerait deux
  problèmes.
- **Aucune configuration utilisateur** pour les budgets. Ce sont des constantes de
  correction, pas des préférences : un opérateur qui peut régler ce budget peut le mettre
  à zéro et reintroduire la perte. `YAGNI`.
- **Aucun format de section existant n'est modifié**, ni déplacé : `test/session/compaction.test.ts:1728-1729`
  vérifie `toContain` sur `## Constraints & Preferences` et `## Progress`, et le résumeur
  ancre ses résumés existants ; réordonner casserait les deux.
- **`stickyGoalContext` reste non exportée.** Les tests passent par `formatGoalContext`,
  ce qui évite d'élargir la surface du module.

## 5. Alternatives considered

**(i) Supprimer la limite, ou la porter à 50 éléments.** Rejeté : le bloc est réinjecté à
**chaque tour** (`prompt.ts:2385`), pas une fois. 50 findings à 240 caractères font ~3 000
tokens par tour sur une session qui peut en compter des centaines, et la perte reste
silencieuse au-delà. On paie un coût croissant pour un défaut qui n'est pas résolu.

**(ii) Ne rien injecter après compaction, et demander au modèle de relire son contrat.** Rejeté :
le modèle doit construire un appel d'outil par tour, pour un fait que le harnais possède
déjà en mémoire et réinjecte déjà. Coût par tour supérieur au correctif proposé, fiabilité
inférieure (un appel peut échouer), et la barrière de clôture continue de dépendre d'une
lecture volontaire.

**(iii) Bloquer la compaction tant qu'un finding est `open`.** Rejeté : coupler deux cycles
de vie indépendants. Un finding `open` signifie « le contrat n'est pas clôturé », pas
« le transcript ne doit plus rétrécir » ; sur une session à 30 findings, ce serait un
deadlock. La perte n'est pas « le transcript rétrécit trop », c'est « le transcript perd une
information que la barrière exige ».

**(iv) Ajouter seulement les sections au gabarit, sans alimenter le résumeur.** Rejeté :
c'est la variante qui produit `## DoD (unmet)\n- (none) — every item is proven` alors
qu'un finding `open` bloque la clôture. Une affirmation fausse dans le résumé ancré est
plus coûteuse que son absence : elle contredit une barrière qui refuse la clôture, et le
modèle se retrouve à défendre un faux énoncé.

**(v) Écrire l'état complet dans la base et le lire à la demande.** Rejeté : la base est
déjà la source de vérité (`goal-contract.ts:607` relit `previous`), mais la lecture est un
appel outillé à chaque tour. La réinjection existe et fonctionne ; le correctif porte sur
son contenu, pas sur son mécanisme.

## 6. Risks

**Régression sur les tests existants — fichiers nommés.**

- `packages/opencode/src/session/goal-context.test.ts:11-13` — vérifie
  `FINDING SEC-001 [high/residual]` et `UNVERIFIED: load`. **Compatible** : le préfixe de
  ligne est conservé à l'identique par `renderBudgeted`. Ce test passe sans modification,
  et c'est le test qui interdit de changer le format.
- `packages/opencode/test/session/working-state-goal-dod.test.ts:54` — vérifie
  `formatGoalContext(skipped) === ""`. **Compatible** : le court-circuit `status === "skipped"`
  (`compaction.ts:113`) est en amont de `stickyGoalContext` et n'est pas touché.
- `packages/opencode/test/session/compaction.test.ts:1725-1729` — vérifie `<previous-summary>`,
  `## Constraints & Preferences`, `## Progress` par `toContain`. **Compatible** : les
  assertions sont additives, l'insertion de deux sections ne les invalide pas.
- `packages/opencode/test/server/httpapi-exercise/index.ts:1139-1167` — contient une
  **copie figée** de la liste de sections comme réponse LLM factice. Elle n'assert rien sur
  `SUMMARY_TEMPLATE` : pas de casse, mais c'est une seconde source de vérité qui dérivera
  silencieusement. À mettre à jour dans le même patch, pour que la fixture reste un
  exemple fidèle.
- `packages/opencode/test/tool/goal-contract.test.ts` — non concerné, aucun fichier modifié
  côté `tool/`.
- **Aucun autre test n'assert la présence ou l'absence des sections `DoD`/`Findings`** :
  recherche `Constraints & Preferences|## Relevant Files|SUMMARY_TEMPLATE` sur
  `packages/opencode` → seuls `compaction.ts:55/60/82/196` et les deux sites de test
  ci-dessus. Le rayon de casse est donc fermé et connu.

**Coût en tokens et en latence, chiffré.** `Token.estimate` divise par 4
(`src/util/token.ts:1`).

| poste | ajout | par quoi |
|---|---|---|
| prompt de summarizer (entrée) | ~500 car. ≈ **+125 tok** | deux sections + une règle |
| résumé ancré (sortie) | 2 titres (~16 car.) + ~4 puces | **+35 à +50 tok** |
| bloc sticky, tour normal (≤ 3 findings) | **0 tok** | sous le plancher de 800 car. |
| bloc sticky, session de 26 findings | **≈ −540 car. vs aujourd'hui** | voir ci-dessous |
| bloc sticky, session de 45 findings | **≈ −1 400 car. vs aujourd'hui** | voir ci-dessous |

Le point clé est que **le plafond actuel est lui-même un budget** : `10 × (240 car. + ~25 car.
de préfixe)` ≈ **2 650 car. ≈ 660 tok**, et il est atteint dès 11 findings. La redistribution
proposée rend le pire cas **égal ou inférieur** à aujourd'hui :

- 26 findings : aujourd'hui 2 650 car. tronquées sans avis ; après 26 lignes à 120 car.
  ≈ 3 700 car.… **au-dessus** du budget, donc le palier non-`open` rend ~1 200 car. + marqueur.
  Le budget de détail étant un plancher puis un plafond par palier, le rendu réel se cale
  sur `DETAIL_BUDGET_CHARS + OPEN_BUDGET_CHARS + marge` ≈ 2 500 car. **Soit comparable ou
  inférieur à aujourd'hui, avec la liste complète.**
- 45 findings : après ≈ 2 500 car. + 45 ids dans le marqueur (~450 car.) ≈ **2 950 car. contre
  2 650 aujourd'hui**, soit **+300 car. ≈ +75 tok par tour** dans le pire cas observé, contre
  0 % de risque de perte.

Comparaison au coût d'un agent bloqué : une compaction facture le `head` entier, chaque part
d'outillage y étant plafonnée à `TOOL_OUTPUT_MAX_CHARS = 2 000` caractères
(`compaction.ts:44`) ≈ **500 tok par part**. Sur la session auditée, la perte a provoqué
**2 compactions manuelles à 2,7 minutes d'intervalle** (contrat P06), chacune facturant le
`head` complet. Avec un `head` de 200 parts d'outillage, un seul appel ≈ 100 000 tok ; le
surcoût du correctif (≈ 125 tok d'entrée + ≈ 45 tok de sortie, une fois par compaction)
représente **< 0,2 % d'un seul de ces appels**, et il est **permanent** seulement dans le cas
extrême à 45 findings, où il est dwarfé par le simple fait de ne pas relancer la compaction
manuellement. `INFERE:` le nombre de 200 parts est une hypothèse de calcul, pas une mesure ;
la formule est vérifiable — compter les parts d'outillage du `head` de la session auditée et
appliquer `parts × Token.estimate(TOOL_OUTPUT_MAX_CHARS)`.

**Latence.** Le correctif est pur calcul local sur des chaînes déjà en mémoire
(`toSorted` + `map` + boucle) : aucune E/S, aucun aller-retour réseau, coût CPU négligeable
au regard d'un appel de summarizer.

**Sécurité / injection.** Le bloc sticky est déjà de la donnée modèle-visible ; le correctif
n'ajoute **aucune** nouvelle surface de confiance, il élargit seulement le volume déjà
injecté (`prompt.ts:2385`). Le contenu reste au format prefixed
`FINDING <id> [<severity>/<status>]:` — un jeton d'état de harness avant tout texte libre,
ce qui empêche de lire un résumé de finding comme une instruction. Le marqueur de reste est
construit par le harnais et n'embarque aucun texte modèle : un finding ne peut donc pas
fabriquer de faux marqueur. Les budgets par élément (`120` / `160` car.) sont **conservés** :
c'est aussi une borne d'injection, et les relever serait une régression de sécurité. Aucune
permission, aucun outil, aucun droit d'écriture n'est ajouté par ce patch.

**Ordre de priorité `open > residual > out_of_scope > closed`.** Chosen pour aligner le
rendu sur la barrière de clôture (`goal-contract.ts:609`), qui ne considère que `open`.
`residual` passe avant `out_of_scope` parce qu'un risque résiduel accepté est plus proche
d'une action à faire qu'une observation écartée du périmètre.

## 7. Tests

**T1 — budget et marqueur (nouveau, fichier existant étendu)**
Chemin : `packages/opencode/src/session/goal-context.test.ts` (il importe déjà
`formatGoalContext`, ligne 2).
Commande : `bun test src/session/goal-context.test.ts` depuis `packages/opencode`.
Critère de succès, trois assertions observables :
1. avec 26 findings dont 3 `open`, le contexte contient `FINDING F-0003 [critical/open]` ;
2. il contient une ligne `+N éléments non affichés` avec `N` égal au nombre exact de findings
   non affichés, et le nom `F-0011` y figure ;
3. avec 3 findings, le contexte **ne contient pas** `éléments non affichés` (le marqueur ne
   doit jamais apparaître quand rien n'est caché).

**T2 — priorité et invariant « jamais tronqué »**
Même fichier, même commande.
Critère de succès : avec 12 findings dont le premier en `insertion` est `closed` et le
douzième est `open`, la ligne `open` est présente **et** précède la ligne `closed` dans la
sortie. C'est le test qui encode la règle (c) : sans lui, une régression future du tri
reviendrait silencieusement.

**T3 — plafond mesuré**
Même fichier. Critère de succès : `Token.estimate(formatGoalContext(state))` avec 45
findings est **≤** `Token.estimate` du rendu d'aujourd'hui sur la même entrée + 100 tokens,
c'est-à-dire que le correctif ne rend pas le cas extrême plus cher. Assertion chiffrée, pas
une impression.

**T4 — le gabarit porte les deux sections**
Chemin : `packages/opencode/test/session/compaction.test.ts`, à côté du test de prompt qui
capture déjà le texte (`captured`, ligne 1725-1729).
Commande : `bun test test/session/compaction.test.ts -t "previous-summary"`.
Critère de succès : le prompt capturé contient `## DoD (unmet)` **et** `## Findings`, **et**
contient le bloc `<task-contract` (preuve que les données, pas seulement le gabarit, sont
présentées au résumeur). Sans le second `toContain`, le test passe avec un résumeur qui
écrirait `"(none)"`.

**T5 — non-régression de la barrière**
Commande : `bun test test/tool/goal-contract.test.ts`.
Critère de succès : suite verte, aucun fichier de `src/tool/` modifié. Cette preuve borne le
rayon du changement : le refus de clôture doit être **exactement** le même avant et après.

**Commande globale de non-régression** :
`bun test src/session/goal-context.test.ts test/session/compaction.test.ts test/session/working-state-goal-dod.test.ts test/session/working-state.test.ts test/tool/goal-contract.test.ts`

## 8. Effort

**S** — un seul fichier de production, trois corrections locales dans des fonctions pures
déjà testables, plus une mise à jour de fixture ; aucun nouveau service, aucune migration,
aucune modification de schéma.

## 9. Verdict self-assessment

`READY` — les trois corrections sont locales, testables sans réseau, et chacune a un critère
de succès chiffré ; le pire cas de coût est mesuré et ne dépasse pas le coût d'une seule
compaction manuelle observée.

Deux points à faire trancher par le validateur, qui ne sont pas des défauts mais des
choix de valeur :

1. **Valeur du plafond.** `OPEN_BUDGET_CHARS = 1 600` est calé pour que le pire cas reste
   sous le plafond actuel de 660 tok. Le valider peut vouloir 1 200 (plus strict, marqueur
   plus fréquent) ou 2 400 (plus confortable sur une session à 30 findings `open`). La
   constante est isolée et le test T3 la protège.
2. **Voie d'accès à l'état du contrat dans `processCompaction`** (section 4.1, `INFERE:`) :
   réutiliser un getter existant, ou l'exposer sur l'interface `Session`. La première est un
   patch de 3 lignes ; la seconde sort du périmètre de P06 et demande son propre dossier.

`unverified` : la mesure terrain « 5 compactions, dont 2 manuelles à 2,7 minutes, 5 parts
d'écart » est fournie avec le contrat et n'est pas reproductible par une commande de ce
dépôt ; aucun chiffre de la section 6 ne repose sur elle seule — le coût du correctif est
calculé à partir de `TOOL_OUTPUT_MAX_CHARS` (`compaction.ts:44`), qui est vérifiable.