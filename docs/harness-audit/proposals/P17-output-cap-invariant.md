# P17 — Invariant de plafond de sortie : `min(lean, générique)`, unité fixée en points de code

## 1. Problem

Deux plafonds de sortie coexistent sans invariant qui les rapproche : la politique « lean »
raisonne en **caractères** (4 000 / 6 000 / 8 000 selon l'outil), le plafond générique raisonne en
**octets** (50 × 1024) et en lignes (2 000), et rien n'impose que le plafond réellement appliqué
soit le plus petit des deux. Un budget lean peut donc être silencieusement ignoré.

Cette révision applique les trois corrections obligatoires du verdict `P17-verdict.md:101-112` :

1. l'unité est fixée **une fois** et au bon niveau — les points de code, portés par la
   borne lean et appliqués dans la boucle, jamais convertis en octets (§4.1) ;
2. le chiffre de gain-token est **retiré**, parce qu'il mesurait une population hors liste
   blanche ; il est remplacé par la borne prouvable `0` et par la formule qui le rend
   calculable (§7) ;
3. des tests sont ajoutés qui démontrent que l'invariant tient **sur les deux unités** — un
   cas où la borne en points de code lie et où la borne en octets ne lie pas, un cas inverse
   (§8).

## 2. Evidence

### 2.1 Plafond générique — en octets et en lignes

`packages/opencode/src/tool/truncate.ts:15-16` :

```ts
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
```

Sa lecture unique est `limits()` (`truncate.ts:75-83`), et le seul point où le plafond est
résolu est `truncate.ts:87-88` :

```ts
const maxLines = options.maxLines ?? resolved.maxLines
const maxBytes = options.maxBytes ?? resolved.maxBytes
```

### 2.2 Plafond lean — en caractères

`packages/opencode/src/tool/lean-output-policy.ts:3-5` :

```ts
export const LEAN_INSPECT_MAX_CHARS_PER_RESULT = 4_000
export const LEAN_TERMINAL_MAX_CHARS = 4_000
export const LEAN_TERMINAL_MAX_LINES = 120
```

et, pour les deux autres familles de la liste blanche, `lean-output-policy.ts:6-9` :

```ts
export const LEAN_BROWSER_MAX_CHARS = 8_000
export const LEAN_BROWSER_MAX_LINES = 250
export const LEAN_OVERVIEW_MAX_CHARS = 6_000
export const LEAN_OVERVIEW_MAX_LINES = 200
```

Tout le nommage de la politique est en `MAX_CHARS`. C'est une décision de conception, pas une
coincidence : un plafond en caractères est un **budget de modèle**, alors qu'un plafond en
octets est une **contrainte de transport et de stockage disque**.

### 2.3 La boucle ne compte que des octets

`packages/opencode/src/tool/truncate.ts:99-122` :

```ts
let bytes = 0
let hitBytes = false

if (direction === "head") {
  for (i = 0; i < lines.length && i < maxLines; i++) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
    if (bytes + size > maxBytes) {
      hitBytes = true
      break
    }
    out.push(lines[i])
    bytes += size
  }
} else {
  for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
    if (bytes + size > maxBytes) {
      hitBytes = true
      break
    }
    out.unshift(lines[i])
    bytes += size
  }
}
```

et le passage sous le seuil, `truncate.ts:91-95` :

```ts
const totalBytes = Buffer.byteLength(text, "utf-8")

if (lines.length <= maxLines && totalBytes <= maxBytes) {
  return { content: text, truncated: false } as const
}
```

### 2.4 `removed` / `unit` sont typés par octets

`packages/opencode/src/tool/truncate.ts:124-125` :

```ts
const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
const unit = hitBytes ? "bytes" : "lines"
```

### 2.5 La liste blanche ne couvre que trois familles

`packages/opencode/src/tool/lean-output-policy.ts:49-62` : `leanToolOutputBudget(tool)` renvoie
un budget si et seulement si l'outil est un outil de terminal lean (`:52-54`), `repo_overview`
(`:56-58`) ou `web-browser_*` (`:59-61`). Pour tout autre nom, la fonction retombe hors des
trois branches et renvoie `undefined` — ce que le test existant affirme noir sur blanc :

`packages/opencode/src/tool/lean-output-policy.test.ts:135` :

```ts
expect(leanToolOutputBudget("read")).toBeUndefined()
```

et le comportement d'agent est défini à `lean-output-policy.ts:16-18` :

```ts
export function isLeanAgent(agent: { name: string; lean?: boolean }) {
  return agent.lean ?? agent.name === "lean"
}
```

### 2.6 Les quatre appelants, et ce que chacun sait

| appelant | ligne | passe `options` | agent | identité d'outil disponible |
|---|---|---|---|---|
| `registry.ts` | `:253` | `{}` | oui (`:252`) | oui — `id`, dans `fromPlugin` (`registry.ts:219`) |
| `tool.ts` | `:192` | `{}` | oui (`:191`) | oui — `id` (liaison visible à `:162`, utilisée `tool: id` en `:164`) |
| `session/tools.ts` | `:681` | `{}` | oui (`input.agent`) | oui — `input.tool` |
| `processor.ts` | `:589-593` | `{ maxLines, maxBytes, direction }` | oui (`:588`) | oui — `toolCall.part.tool` (`:586`) |

`registry.ts:253` et `tool.ts:192` passent tous deux `{}` : ils n'imposent donc aujourd'hui
aucun plafond et héritent intégralement de `limits()`. C'est là que se loge le défaut.

### 2.7 Deux chemins court-circuitent avant `truncate.output`

`tool.ts:188-190` :

```ts
if (result.metadata.truncated !== undefined) {
  return result
}
```

`session/tools.ts:681` est dans le même cas : ces chemins reçoivent une sortie déjà bornée en
amont. `tool.ts:195` consomme `truncated.content` pour tous les autres appelants.

### 2.8 Le drapeau qui porte la politique

`packages/opencode/src/effect/runtime-flags.ts:58` :

```ts
experimentalLeanOutputBudget: bool("OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET"),
```

Le même drapeau est consulté côté session, `processor.ts:586-593` :

```ts
const outputBudget = toolCall ? leanToolOutputBudget(toolCall.part.tool) : undefined
if (!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget) {
  const agent = yield* agents.get(ctx.assistantMessage.agent)
  const bounded = yield* truncate.value.output(
    rawOutput.output,
    { maxLines: outputBudget.maxLines, maxBytes: outputBudget.maxChars, direction: outputBudget.direction },
    agent,
  )
```

### 2.9 Ce que la troncature coûte déjà

`truncate.ts:128` écrit le texte **intégral** sur disque, `truncate.ts:130` compose le bandeau
qui cite ce fichier, et la rétention est de 7 jours (`truncate.ts:13`,
`RETENTION = Duration.days(7)`).

### 2.10 Le carve-out terminal existe déjà et est indispensable

`packages/opencode/src/tool/terminal-output.ts:142` :

```ts
if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }
```

avec son plafond local `terminal-output.ts:5-6` :

```ts
const MAX_BYTES = 4_000
const MAX_LINES = 120
```

Ces outils de terminal sont donc **déjà** plafonnés à 4 000 / 120 **sans écriture disque**.

### 2.11 Le harnais sait déjà consuming la même politique

`packages/opencode/src/tool/inspect-batch.ts:7-8` :

```ts
import { RuntimeFlags } from "@/effect/runtime-flags"
import { inspectBudget } from "./lean-output-policy"
```

## 3. La collision d'unités, énoncée

`MAX_BYTES` est en **octets UTF-8** (`Buffer.byteLength`, `truncate.ts:91`, `:104`, `:114`).
La politique lean raisonne en **caractères**, et le seuil de débordement d'une session dérive
d'un ratio caractères/token — c'est-à-dire d'une unité, les points de code.

Un invariant qui énonce `min(plafond générique, plafond lean)` sans fixer l'unité est donc
faux même lorsque chaque plafond est juste individuellement, parce que `min()` n'est pas
défini entre deux grandeurs de dimensions différentes. Injecter `maxChars` dans `maxBytes`
donne un invariant qui *paraît* s'appliquer et qui, en pratique, divise le budget lean par le
facteur de largeur UTF-8 du texte : `Buffer.byteLength("é") === 2`, donc une sortie française
de 4 000 caractères pèse environ 8 000 octets et se voit tronquée vers 2 000 caractères. Le
plafond n'est pas honoré, il est atténué.

C'est le `Objection 1` du verdict (`P17-verdict.md:41-61`), et c'est aussi ce qui rend le
test de §8.2 nécessaire : sans lui, la régression UTF-8 est invisible, car `Buffer.byteLength`
est correct en soi — c'est l'unité qui ment.

## 4. Décision

### 4.1 L'unité, fixée une fois et au bon niveau

> **L'unité de l'invariant est le point de code.** Elle est fixée au niveau de la **borne**,
> là où le nombre naît (`leanCeiling`, dérivé de `leanToolOutputBudget`), et appliquée au
> niveau de la **coupe**, là où la troncature décide (`truncate.output`).
> Le plafond générique reste en octets, parce que c'est ce qu'il mesure réellement : la
> taille d'un fichier écrit sur disque (`truncate.ts:128`). Les deux unités sont conservées,
> jamais converties l'une en l'autre.

Le bon niveau est celui de la borne, pour trois raisons :

- **La conversion serait destructive dans les deux sens.** De caractères vers octets, il faut
  supposer une largeur UTF-8 maximale (3 octets pour un point de code BMP hors ASCII, 4 pour un
  supplementary plane) : on sous-estimerait le texte accentué et surestimerait l'ASCII. D'octets
  vers caractères, il faut supposer une largeur minimale (1 octet = 1 point de code) : on
  gaspillerait deux tiers du budget sur du français. Aucun des deux ordres ne donne un plafond
  qui honore les deux propriétés à la fois.
- **Chaque plafond reste dans l'unité de sa grandeur physique.** Le plafond générique protège
  le disque et la taille du prompt en octets ; le plafond lean protège le budget de modèle en
  caractères. Ce ne sont pas deux façons de dire la même chose, et ce n'est pas au code de
  troncature qu'il appartient d'arbitrer entre elles.
- **L'invariant devient un `min` bien formé.** `min(51 200 octets, 6 000 caractères)` n'a pas de
  sens ; `min(générique, lean)` où chaque terme est déjà dans son unité, et où la coupe retient
  les deux contraintes, en a un. `output()` n'a pas à choisir : il applique les deux.

Conséquence d'écriture : la borne lean **n'entre pas** dans `Options` (voir §4.3), et
`maxBytes` reste en octets de bout en bout.

### 4.2 `leanCeiling`, dans `truncate.ts`

```ts
export function leanCeiling(tool: string | undefined, agent: Agent.Info | undefined) {
  if (!agent || !RuntimeFlags.experimentalLeanOutputBudget) return undefined
  if (!isLeanAgent(agent)) return undefined
  // terminal-output.ts:142 plafonne deja ces outils a 4 000 / 120 SANS ecriture
  // disque ; leur faire traverser truncate.output ajouterait une seconde ecriture
  // et un second bandeau. Carve-out non negociable.
  if (tool && isLeanTerminalTool(tool)) return undefined
  const budget = tool ? leanToolOutputBudget(tool) : undefined
  if (!budget) return undefined // hors liste blanche : plafond generique conserve tel quel
  return { maxChars: budget.maxChars, maxLines: budget.maxLines, direction: budget.direction }
}
```

Elle est **dérivée** d'une politique existante, pas un nombre : `leanToolOutputBudget` reste la
seule source des valeurs. Aucun quatrième dialecte de plafond n'est introduit.

Dans `output()`, `_agent` est renommé `agent` (`truncate.ts:85`) et la borne est résolue :

```ts
const output = Effect.fn("Truncate.output")(function* (text: string, options: Options = {}, agent?: Agent.Info) {
  const resolved = yield* limits()
  const lean = leanCeiling(options.tool, agent)
  const maxLines = options.maxLines ?? lean?.maxLines ?? resolved.maxLines
  const maxBytes = options.maxBytes ?? resolved.maxBytes
  const direction = options.direction ?? lean?.direction ?? "head"
  const maxChars = lean?.maxChars   // points de code. Jamais dans maxBytes.
  const lines = text.split("\n")
  const totalBytes = Buffer.byteLength(text, "utf-8")
  const totalChars = maxChars === undefined ? 0 : text.length

  if (lines.length <= maxLines && totalBytes <= maxBytes && totalChars <= maxChars) {
    return { content: text, truncated: false } as const
  }
  ...
```

Détail qui compte : `totalChars` vaut `0` quand aucune borne lean n'est active, donc
`totalChars <= maxChars` est vrai et le passage sous le seuil reste **exactement** l'invariant
`truncate.ts:93-95` pour tout appelant non lean. C'est `0`, pas `Infinity`, qui évite de
réécrire la condition existante — le seuil ne peut pas être franchi par défaut.

### 4.3 La boucle : deux accumulateurs, sortie anticipée, dans les deux branches

```ts
const out: string[] = []
let i = 0
let bytes = 0
let chars = 0
let hitBytes = false
let hitChars = false

if (direction === "head") {
  for (i = 0; i < lines.length && i < maxLines; i++) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
    const width = lines[i].length + (i > 0 ? 1 : 0)
    if (maxChars !== undefined && chars + width > maxChars) { hitChars = true; break }
    if (bytes + size > maxBytes) { hitBytes = true; break }
    out.push(lines[i]); bytes += size; chars += width
  }
} else {
  for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
    const width = lines[i].length + (out.length > 0 ? 1 : 0)
    if (maxChars !== undefined && chars + width > maxChars) { hitChars = true; break }
    if (bytes + size > maxBytes) { hitBytes = true; break }
    out.unshift(lines[i]); bytes += size; chars += width
  }
}
```

L'ordre des deux `break` est significatif : la contrainte en points de code est évaluée
**en premier**, parce que `min(lean, générique)` n'est correct que si la contrainte la plus
stricte est appliquée d'abord ; la borne en octets reste en second filet, seule contrainte du
cas non lean.

`removed` / `unit` (`truncate.ts:124-125`) reflètent **l'unité réellement tronquée** — un
bandeau annonçant « 4 000 bytes truncated » après une coupe décidée en points de code serait un
second mensonge d'unité, et le verdict l'exige explicitement (`P17-verdict.md:59-61`) :

```ts
const removed = hitChars ? totalChars - chars : hitBytes ? totalBytes - bytes : lines.length - out.length
const unit = hitChars ? "characters" : hitBytes ? "bytes" : "lines"
```

**Le champ `maxChars` est retiré de `Options`** (`truncate.ts:22-27`). Il n'était consommé par
aucun code : la borne lean arrive par `options.tool` et `agent`. Un champ d'API mort est une
surface de divergence — deux chemins concurrents vers le même plafond, exactement ce que
l'invariant veut supprimer. `Options` ne gagne que :

```ts
export interface Options {
  maxLines?: number
  maxBytes?: number
  direction?: "head" | "tail"
  outputPath?: string
  tool?: string      // nouveau : identite de l'outil, pour resoudre la borne lean
}
```

Le champ est optionnel et named : aucun appelant n'est cassé par le typage, et
`processor.ts:589-593` passe déjà un littéral nommé, donc `min(v, v)` — seconde application de
la même borne, **identité**, pas de double écriture disque.

**Ajouts dans `truncate.ts`** (le fichier ne les importe pas aujourd'hui) :

- `import { isLeanAgent, isLeanTerminalTool, leanToolOutputBudget } from "./lean-output-policy"`
- `import { RuntimeFlags } from "@/effect/runtime-flags"` — le même chemin que
  `inspect-batch.ts:7`

### 4.4 Les quatre appelants, une ligne chacun

| fichier | ligne | avant | après |
|---|---|---|---|
| `registry.ts` | `:253` | `truncate.output(output, {}, info)` | `truncate.output(output, { tool: id }, info)` |
| `tool.ts` | `:192` | `truncate.output(result.output, {}, agent)` | `truncate.output(result.output, { tool: id }, agent)` |
| `session/tools.ts` | `:681` | `truncate.output(textParts.join("\n\n"), {}, input.agent)` | `truncate.output(textParts.join("\n\n"), { tool: input.tool }, input.agent)` |
| `processor.ts` | `:589-593` | `{ maxLines, maxBytes: outputBudget.maxChars, direction }` | inchangé — résorbé par `??` |

**Piège connu, à ne pas franchir.** `tool.ts:188-190` et `session/tools.ts:681` sont sur des
chemins qui reçoivent une sortie déjà bornée en amont et court-circuitent. Il ne faut **pas** y
ajouter une seconde troncature, sous peine de double écriture disque. Le correctif les touche
par le seul ajout de `{ tool: … }`, qui n'a d'effet que si la sortie atteint effectivement
`output()`.

### 4.5 `registry.ts:256` — formulation exacte

`registry.ts:242-253` est le bloc d'exécution d'un outil plugin. En `:253`,
`truncate.output(output, {}, info)` est appelé, puis `registry.ts:256` :

```ts
output: out.truncated ? out.content : output,
```

Ce ternaire **substitue `out.content` quand `truncated` est vrai**, et `output` — la chaîne
d'origine, avant troncature — sinon. Les deux branches ne sont équivalentes qu'en apparence, et
l'équivalence repose sur une propriété du callee. Quand
`truncated` est faux, `truncate.ts:93-95` renvoie `{ content: text, truncated: false }`, donc
`out.content === output` **octet pour octet**, et la branche droite rend le même texte. Quand
`truncated` est vrai, la branche gauche rend le contenu tronqué et le bandeau. Le texte de sortie
est donc inchangé par la forme du ternaire.

Ce qui reste à traiter, et qui est réel :

1. **La portée.** `registry.ts:253` et `registry.ts:256` sont à l'intérieur de `fromPlugin`
   (`registry.ts:219`), appelée en `registry.ts:320` et `registry.ts:328`. Ce chemin ne couvre donc que les outils
   plugin/custom — **pas** les outils natifs. Un invariant qui ne serait appliqué qu'ici
   laisserait `tool.ts:192` et `session/tools.ts:681` hors d'atteinte, c'est-à-dire la majeure
   partie de la surface.
2. **Le site de décision.** `:256` est l'endroit où le résultat de la troncature est consommé
   pour produire la sortie finale. C'est donc bien le site à traiter, mais **pour y rendre la
   borne visible**, pas pour corriger une branche : le ternaire se simplifie en `out.content`
   (l'équivalence ci-dessus le garantit), et `metadata.truncated` (`:260`) reste la source de
   vérité pour le consommateur. Cette simplification est cosmétique et **n'est pas** le
   correctif ; elle ne sera faite que si elle accompagne le passage de `{ tool: id }`, afin que
   la ligne affichant la substitution cesse de suggérer une branche conditionnelle inexistante.
3. **Le correctif de la cause est en amont.** La borne elle-même est appliquée dans
   `truncate.output`, une fois, pour tous les appelants. `registry.ts:256` ne doit jamais être
   décrite comme le lieu où le défaut de plafond est corrigé.

### 4.6 Volontairement inchangé

- **`lean-output-policy.ts`** — aucune modification. Il exporte déjà exactement ce qu'il faut
  (`isLeanAgent` `:16-18`, `isLeanTerminalTool`, `leanToolOutputBudget` `:49-62`,
  `inspectBudget` `:20-35`). La proposition consomme la politique existante au lieu de la
  dupliquer. C'est le principal point fort du design.
- **`terminal-output.ts`** — aucune modification. Le carve-out de §4.2 est obligatoire : sans
  lui, un agent lean ferait passer chaque sortie de terminal aussi par `output()`, donc par
  `truncate.ts:128` (écriture du texte intégral sur disque) et `truncate.ts:130` (bandeau), là
  où `terminal-output.ts:142` + `:5-6` plafonnent déjà à 4 000 / 120 sans disque. Ce serait une
  régression de comportement, pas un durcissement.
- **`processor.ts:585-604`** — gardé tel quel. Il apporte le metadata `leanOutputBudget` utile
  au débogage, et son plafond devient une seconde application idempotente de `min(v, v)`.
  Noter que `processor.ts:591` fait passer `outputBudget.maxChars` dans `maxBytes` : c'est le
  même défaut d'unité que la version précédente de cette proposition, sur le chemin session.
  Le patch ne l'y touche pas — le chemin est idempotent et sous drapeau, donc sans effet de bord
  observable — mais il est **cité comme défaut connu et hors périmètre**, pas comme conformité.
  Voir §10, finding `F-02`.
- **Le plafond générique 50 KB / 2 000 lignes** — inchangé pour tout agent non lean et pour tout
  outil absent de la liste blanche. C'est la réponse directe à « ne pas casser les outils qui ont
  besoin de plus » : `leanToolOutputBudget` renvoie `undefined` hors liste blanche
  (`lean-output-policy.ts:49-62`), donc ces outils conservent 51 200 octets.
- **Le drapeau `experimentalLeanOutputBudget`** (`runtime-flags.ts:58`) — il reste la soupape
  d'échappement : à `OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET` désactivé, le comportement est
  identique. Aucune proposition ne retire un contrôle à l'opérateur.

## 5. Alternatives considered

**A. Réduire `MAX_BYTES` à 4 000.** Rejeté. `MAX_BYTES` (`truncate.ts:16`) est le plafond de
tous les agents et de tous les outils, y compris `repo_overview` dont la politique lean demande
6 000 (`lean-output-policy.ts:8`) et `web-browser_*` qui demande 8 000
(`lean-output-policy.ts:6`). Un plafond unique à 4 000 casserait les outils de navigation.
Cela revient aussi à faire de `4_000` une quatrième constante.

**B. Corriger `registry.ts:256` (`out.truncated ? out.content : output` → `out.content`).**
Rejeté **comme correctif**. Le texte rendu est déjà identique (§4.5) et, surtout, la ligne est
dans le bloc plugin-only `registry.ts:242-253` : la changer ne ferait rien pour `tool.ts:192` ni
`session/tools.ts:681`. Retenu comme nettoyage opportun, jamais comme correction.

**C. Ajouter une troisième constante `MAX_CHARS = 4_000` dans `truncate.ts`.** Rejeté. Une
constante n'est pas un invariant : rien n'obligerait `processor.ts`, `tool.ts:192` ou
`session/tools.ts:681` à la consulter, et on obtiendrait trois plafonds là où il y en a deux. Le
problème est l'absence de point d'application unique, pas l'absence de nombre.

**D. Renforcer la garde `processor.ts:587` au lieu de toucher `truncate.ts`.** Rejeté.
`processor.ts` est la couche session : elle ne voit pas les appels directs à `truncate.output`
(`tool.ts:192`, `registry.ts:253`) et ne peut rien garantir sur un chemin qui la contourne. Le
gargouillis resterait dans le type (« sortie de 45 000 caractères pour un agent lean »), il serait
seulement moins fréquent.

**E. Injecter la borne lean dans `maxBytes` et convertir au moment de l'injection.** Rejeté, et
c'est l'objet de l'`Objection 1` du verdict. L'injection fonctionne tant que l'appelant n'est pas
connu à l'avance, mais elle :
  (a) rend l'unité invisible **dans** la boucle — `truncate.ts:104` et `:114` restent en
  `Buffer.byteLength`, donc un texte accentué est coupé à la moitié du budget sans qu'aucune
  ligne ne le dise ;
  (b) casse le test de passage `truncate.ts:93-95`, qui compare `totalBytes <= maxBytes` et
  rendrait `truncated: false` pour un texte de 3 500 caractères pesant 7 000 octets, alors que
  la politique lean dit 4 000 : le type « sortie non tronquée » réapparaît par la porte du bas ;
  (c) rend `removed` / `unit` (`truncate.ts:124-125`) faux par construction.

**F. Conserver `maxChars` dans `Options` en le consommant réellement.** Rejeté. Ce serait
défendable si un appelant externe avait besoin d'un plafond en caractères ; aucun n'en a, et en
ajouter un crée deux chemins concurrents vers le même plafond (`options.maxChars` vs
`leanCeiling`), donc exactement la divergence que l'invariant veut supprimer. Champ retiré.

**G. Corriger aussi `processor.ts:591` (`maxBytes: outputBudget.maxChars`).** Rejeté **pour ce
patch**, cité comme résiduel `F-02`. Même nature de défaut que E, mais sur un chemin déjà
idempotent et sous drapeau. Le corriger élargit le rayon de régression à la couche session sans
changer le comportement observable. À traiter dans une proposition dédiée si l'invariant doit
devenir exact sur ce chemin aussi.

**H. Exprimer la borne lean en octets au niveau de la politique.** Rejeté, et c'est l'inverse
exact de la décision §4.1. Cela obligerait `lean-output-policy.ts` — qui est une politique de
budget de modèle, et dont toutes les constantes sont nommées `MAX_CHARS` — à déclarer un facteur
de conversion, et rendrait le plafond lean dépendant de la langue du texte. L'erreur se
propagerait alors vers le haut, vers la politique, au lieu d'être contenue ici.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/test/tool/truncation.test.ts` est le
  fichier concerné : `test("uses default MAX_LINES and MAX_BYTES")` (`truncation.test.ts:104`),
  dont les assertions `truncation.test.ts:105-106` vérifient `Truncate.MAX_LINES === 2000` et
  `Truncate.MAX_BYTES === 50 * 1024`, et `describe("with tool_output config")`
  (`truncation.test.ts:118`) qui porte le test `"limits() reflects config overrides"`
  (`truncation.test.ts:120`) sur la surcharge `tool_output: { max_lines: 123, max_bytes: 456 }`
  (`truncation.test.ts:119`). Attendu : **aucun échec** — ni l'un ni l'autre n'exerce d'agent lean
  ni la borne en caractères — mais les deux suites doivent être **exécutées**, pas supposées
  vertes.
- **Régression UTF-8 si la borne repassait en octets.** C'est le risque central du patch, couvert
  par §8.2 et §8.3. Sans ces tests, une réintroduction future de l'injection par `maxBytes` serait
  invisible.
- **Coût en tokens / latence ajouté — aucun engagement de chiffre.** Voir §7 : le chiffre
  précédent est **retiré**. La latence ne change pas de façon mesurable : la troncature est une
  opération mémoire déjà présente (`truncate.ts:90-122`), à laquelle s'ajoute un
  `lines[i].length` par ligne retenue, soit un acces de longueur sur une chaîne déjà en mémoire.
- **Ce que le patch touche, et ce qu'il ne touche pas.** La liste blanche sur laquelle repose
  `leanCeiling` est exactement trois familles (`lean-output-policy.ts:49-62`) :
  `isLeanTerminalTool` — **exclu par le carve-out** (§4.2), donc gain nul ; `repo_overview`,
  plafond 6 000 ; `web-browser_*`, plafond 8 000. Tout le reste — `read`, `inspect_batch`,
  `glob`, `grep`, `ls` — renvoie `undefined` (`lean-output-policy.test.ts:135` l'affirme pour
  `read`) et **conserve 51 200 octets**.
- **Effet de bord non évident — croissance du répertoire de troncature.** `truncate.ts:128` écrit
  le texte **intégral** sur disque à chaque troncature, avec une rétention de 7 jours
  (`truncate.ts:13`). Durcir le seuil lean **augmente** le nombre d'écritures dans
  `TRUNCATION_DIR`. Effet net attendu : quelques dizaines de fichiers de quelques dizaines de
  kilo-octets par session — négligeable, mais **réel et non nul**, et proportionnel au nombre
  d'appels réellement dans la liste blanche.
- **Risque de sécurité.** Aucun risque d'injection ni de contournement de permission introduit :
  la proposition ne modifie ni le contenu ni l'origine des données envoyées au modèle, unique
  ment le seuil au-delà duquel le même contenu est tronqué et redirigé vers un fichier. Deux
  remarques de sûreté, dans le sens favorable : (a) le durcissement **réduit** la surface d'un
  déni de service par sortie géante ; (b) la référence « unverified » injectée par
  `truncate.ts:130` n'est pas touchée. Le seul point à surveiller est le disque (ci-dessus).
- **Résiduel de conception à assumer.** La liste blanche de `leanToolOutputBudget` est une
  **allowlist** (`lean-output-policy.ts:49-62`). Un outil lean nouveau n'obtiendra pas de plafond
  tant qu'il n'y sera pas ajouté — et `read` n'en fait pas partie aujourd'hui, ce qui est le point
  faible fonctionnel principal de cette proposition (§7). C'est le bon sens par défaut pour la
  contrainte « ne pas casser les outils qui ont besoin de plus », mais la protection ne s'étend
  pas automatiquement.
- **Compatibilité de l'ajout de `tool` dans `Options`.** Les quatre appelants passent `{}` ou des
  littéraux ; le champ est optionnel et nommé, donc aucun appelant n'est cassé par le typage.
  `processor.ts:589-593` passe déjà un objet littéral nommé.

## 7. Gain-token : chiffre retiré, borne prouvable, formule de recalcul

### 7.1 Pourquoi le chiffre précédent était faux

La version précédente annonçait « ≈ 91 000 à ≈ 833 000 tokens », calculés sur 64 lectures au
delà de 4 000 caractères. L'arithmétique était correcte ; la **population** ne l'était pas. Ces
64 lectures sont des lectures du harnais (`read`, `inspect_batch`, `glob`, `grep`, `ls`), et
aucune n'est dans la liste blanche que `leanCeiling` consulte. Après le patch,
`leanToolOutputBudget("read")` renvoie toujours `undefined`
(`lean-output-policy.test.ts:135`), donc `leanCeiling` renvoie `undefined`, et la sortie de
49 572 caractères passe **en entier**. Le même raisonnement vaut pour tout outil natif hors liste
blanche. Le seuil de 4 000 est de surcroît le plafond *terminal*, pas le plafond des lectures ;
`read` n'a aujourd'hui aucun plafond lean, donc il n'y a rien à récupérer.

C'est le `Objection 2` du verdict (`P17-verdict.md:63-89`), et le précédent documenté : le gain
P05 avait été annoncé à −35 caractères au lieu de +35. Un gain non reproductible est pire
qu'un gain absent.

### 7.2 Ce qui est remplacement

**Le chiffre est retiré.** Il n'est remplacé par aucun autre chiffre, parce qu'aucun chiffre
n'est dérivable des seules mesures disponibles.

**La seule borne prouvable sur la population mesurée est zéro** : sur 64 lectures du harnais, le
gain de ce patch est de **0 token**, avec un risque de **0**. C'est une affirmation derivable du
code, pas une estimation.

**Sur la population réellement couverte** — `repo_overview` (6 000) et `web-browser_*` (8 000) —
le gain est réel mais **non mesuré**, et sa formule est la suivante. Pour un appel d'outil de la
liste blanche de longueur `L` caractères avec un plafond `B`, la sortie rendue est
`min(L, B)` caractères, donc l'économie vaut `L − min(L, B)` caractères. Sur une session :

```
gain_tokens = (1 / R) * Σ_appels  max(0, L_i − min(L_i, B_i))
```

où `R` est le ratio caractères/token mesuré sur la session. Cette formule ne demande qu'un
histogramme par nom d'outil, et **rien d'autre**. Tant qu'il n'est pas produit, le coefficient
reste inconnu et le gain reste non chiffrable — c'est la conclusion honnête, pas une prudence de
style.

**Le bénéfice réel de ce patch n'est pas un chiffre, c'est une propriété** : les quatre
appelants appliquent désormais la même borne, et l'unité de cette borne est la même partout. Une
garde peut être réécrite, une constante peut être déplacée, un appelant peut passer de `{}` à un
littéral sans que le plafond lean puisse être perdu, parce qu'il est appliqué au point
d'application unique et non dans une condition de chemin d'exécution
(`processor.ts:587`).

### 7.3 Préalable à toute annonce chiffrée

Instrumenter `truncate.output` sur la session auditée, et compter **par nom d'outil** (champ
`options.tool`) :

- (a) le nombre d'appels ;
- (b) la distribution de `text.length` ;
- (c) le nombre d'appels dont `text.length` dépasse `leanToolOutputBudget(tool)` — ou 4 000
  caractères quand le budget est `undefined`.

Les colonnes (a) et (c) suffisent à établir le périmètre réel du patch et à alimenter la formule
§7.2. `read`, `inspect_batch`, `glob`, `grep`, `ls` doivent y apparaître avec `(c) = 0`, ce qui
est le résultat attendu au vu de `lean-output-policy.test.ts:135` — et c'est précisément le
chiffre que la version précédente ne publiait pas.

## 8. Tests

Fichier existant : `packages/opencode/test/tool/truncation.test.ts`. Les cas 1 à 3 et 5-
7 démonstration de bout en bout de l'invariant ; **les cas 4 et 5 sont les deux faces de l'unité**, et sont
la preuve directe de la décision §4.1.

### 8.1 Invariant principal

`truncate.output(texte_de_45_000_caractères, { tool: "web-browser_take_snapshot" }, agent lean)`
avec `OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET` actif → `result.truncated === true` et
`result.content.length <= 8_000` (plafond `LEAN_BROWSER_MAX_CHARS`, `lean-output-policy.ts:6`)
**et non** 51 200. C'est le test qui échoue avant le correctif et passe après.

### 8.2 Unité — la borne en points de code lie, la borne en octets ne lie pas

```ts
// repo_overview : plafond lean 6 000 points de code (lean-output-policy.ts:8)
// 7 000 caractères accentués = 14 000 octets.
const text = "é".repeat(7000)
const result = yield* svc.output(text, { tool: "repo_overview" }, { name: "lean", lean: true } as Agent.Info)
expect(result.truncated).toBe(true)
// la borne en caractères a été appliquée : ~6 000 points de code conservés
expect(result.content.length).toBeGreaterThan(5_500)
expect(result.content.length).toBeLessThanOrEqual(6_000)
// la borne en octets n'a PAS été appliquée : le résultat pèse bien plus que 6 000 octets
expect(Buffer.byteLength(result.content, "utf-8")).toBeGreaterThan(11_000)
// le bandeau dit l'unité réellement utilisée
expect(result.content).toContain("characters truncated")
expect(result.content).not.toContain("bytes truncated")
```

**Pourquoi `7 000` et non le `"é".repeat(5000)` suggéré par le verdict.** La fixture du verdict
vise le plafond de 4 000 caractères, qui est `LEAN_TERMINAL_MAX_CHARS`
(`lean-output-policy.ts:4`) — et les outils de terminal sont **exclus par le carve-out** (§4.2) :
`leanCeiling` renvoie `undefined` pour eux, donc aucune borne lean n'entre dans `output()` et
`"é".repeat(5000)` ressort **non tronqué**. La fixture n'est pas reproductible par cette
couture. `repo_overview` (6 000) et `web-browser_*` (8 000) sont, eux, dans la liste blanche et
atteignables : `7 000` caractères accentués discriminent exactement de la même manière — sous
une borne en octets injectée, la coupe se ferait à 3 000 caractères ; sous une borne en points
de code, à 6 000. L'écart est de 2×, comme dans la fixture d'origine, et le test est **rouge
exactement sur le défaut décrit par l'`Objection 1`**.

### 8.3 Unité — la borne en octets lie, la borne en points de code ne lie pas

Le symétrique indispensable : prouver que la borne générique reste en octets, et qu'elle
découpe un texte accentué **au bon endroit** selon sa propre unité.

```ts
// agent NON lean => aucune borne en caractères. 30 000 caractères accentués
// = 60 000 octets > 51 200 octets. La coupe doit être décidée en octets.
const text = "é".repeat(30_000)
const result = yield* svc.output(text, {}, { name: "build" } as Agent.Info)
expect(result.truncated).toBe(true)
expect(result.content).toContain("bytes truncated")
expect(result.content).not.toContain("characters truncated")
// ~51 200 octets conservés = ~25 600 caractères accentués
expect(result.content.length).toBeGreaterThan(25_000)
expect(result.content.length).toBeLessThan(25_700)
```

Avec ce couple de tests, l'invariant est démontré sur les deux unités : chacun des deux
compteurs est exerce, dans un cas où il est le seul contraignant, et l'autre est vérifié
inactif. Un patch qui mélangerait les deux unités ferait échouer au moins l'un des deux.

### 8.4 Non-régression hors liste blanche

Le texte de 45 000 caractères avec un outil **absent** de la liste blanche (`read`) et le même
agent lean → `result.truncated === false`. Prouve qu'aucun outil n'est serré par inadvertance, et
fige le comportement de `read` documenté au §7.

### 8.5 Opt-out

Le cas 8.1 avec le drapeau désactivé → `result.truncated === false`. Prouve que la soupape
d'échappement est préservée.

### 8.6 Non-régression de l'égalité d'unités

Un texte **ASCII** doit produire le même résultat avant et après le patch, puisque pour l'ASCII
1 octet = 1 point de code. `svc.output("x".repeat(45_000), { tool: "web-browser_take_snapshot" },
agent lean)` sous drapeau actif → `truncated === true`, `content.length` proche de 8 000. Prouve
que l'ajout du second compteur ne déplace pas la coupe quand les deux unités coïncident.

### 8.7 Commande et critère de succès

Depuis `packages/opencode` :

```
bun test test/tool/truncation.test.ts
```

**Critère de succès observable** : `0 fail`. Les tests 8.1, **8.2 et 8.3** doivent être rouges
sur le code actuel ; 8.2 l'est par la demi-limitation UTF-8, 8.3 ne l'est pas (il fige le
comportement actuel, il le protège). Un simple « la suite passe » ne suffit pas : 8.1 prouve
l'invariant, 8.2 prouve l'unité dans un sens, 8.3 la prouve dans l'autre.

## 9. Effort

**S** — un seul fichier de logique (`truncate.ts` : `leanCeiling`, deux compteurs, deux gardes,
`unit` à trois branches, `:85` renommé, deux imports), quatre appelants modifiés d'une ligne
chacun, un fichier de test existant étendu. Aucune dépendance nouvelle, aucune migration, aucun
changement de schéma, aucun changement de configuration.

## 10. Findings

| id | sévérité | statut | résumé | preuve |
|---|---|---|---|---|
| `F-01` | medium | **closed by this patch** | Collision octets/caractères : `maxChars` lean appliqué à un compteur d'octets, budget lean divisé par ~2 sur texte accentué | `truncate.ts:88`, `:91`, `:104`, `:105`, `:114`, `:115` ; verdict `:41-61` ; §4.1 fixe l'unité, §4.2 l'applique, §8.2-8.3 le démontrent |
| `F-02` | medium | **open, hors périmètre** | `processor.ts:591` fait passer `outputBudget.maxChars` dans `maxBytes` — même défaut d'unité, chemin session, idempotent et sous drapeau donc sans effet observable | `processor.ts:589-593` ; §4.6 ; §5-G. À traiter dans une proposition dédiée |
| `F-03` | low | **open, assumé** | La liste blanche est une allowlist : `read`, `inspect_batch`, `glob`, `grep`, `ls` n'ont aucun plafond lean. Gain mesuré sur la population auditée = 0 token | `lean-output-policy.ts:49-62` ; `lean-output-policy.test.ts:135` ; §7.2 |
| `F-04` | info | **closed by this patch** | `maxChars` dans `Options` était un champ d'API mort ; `RuntimeFlags` non importé alors qu'il est utilisé | verdict `:91-99`, `:112` ; §4.3 retire le champ et liste les deux imports, chemin d'import calé sur `inspect-batch.ts:7` |
| `F-05` | info | **open, assumé** | La fixture `"é".repeat(5000)` du verdict ne teste pas ce qu'elle paraît tester : le plafond de 4 000 est terminal, et le terminal est carve-out | §8.2 — remplacée par une fixture `repo_overview` à 7 000 caractères, même discrimination 2× |

## 11. Verdict self-assessment

**NEEDS_REVIEW** — l'invariant, son point d'application unique et son unité (points de code)
sont solides et le correctif est de faible risque, mais deux points doivent être tranchés par
le validateur avant acceptation :

1. **Les outils de plugin doivent-ils être soumis au plafond lean ?** `registry.ts:253` est à
   l'intérieur de `fromPlugin` (`registry.ts:219`, appelé `registry.ts:320` et `registry.ts:328`) et ne couvre donc
   que les outils plugin/custom. La prémisse du dossier suggère un périmètre universel, alors
   que ce chemin est restreint. Si le validateur juge que le plafond lean ne doit pas contraindre
   les plugins, l'invariant doit alors être restreint à `tool.ts:192` — ce qui retire une partie
   du bénéfice sans changer une ligne du raisonnement. Je recommande de **le conserver** : la
   borne est un budget de sortie, pas une restriction de surface d'API, et un outil plugin qui
   produit 45 000 caractères dans un contexte lean a le même problème qu'un outil natif.
2. **Le bénéfice est-il suffisant si `read` reste hors liste blanche ?** Le §7.2 est explicite :
   ce patch ferme l'absence d'invariant, mais ne réduit pas la charge des lectures du harnais,
   qui sont la population mesurée. Deux options défendables : (a) accepter ce périmètre et faire
   de l'élargissement de la liste blanche une proposition séparée ; (b) étendre
   `lean-output-policy.ts` à `read` / `glob` / `grep`, ce qui sort du rayon d'action de ce
   dossier et contredit la réserve « ne pas casser les outils qui ont besoin de plus ». Je
   recommande (a) et je n'ai pas tranché à la place du validateur.

### Corrections du verdict appliquées, point par point

| `Required changes` (verdict `:101-112`) | Où c'est appliqué |
|---|---|
| 1. Borne lean en points de code dans la boucle `truncate.ts:102-122`, + test accentué | §4.1 (unité fixée une fois, au niveau de la borne, avec justification du niveau) ; §4.2 (`leanCeiling`, résolution, seuil `:93-95` conservé) ; §4.3 (accumulateurs `chars` / `hitChars` dans les deux branches, sortie anticipée, `removed` / `unit` à trois branches) ; §5-E justifie le rejet de la variante par `maxBytes` ; §8.2 et §8.3 (les deux faces de l'unité) |
| 2. Publier le gain-token par nom d'outil avant tout chiffre | §7.1 (pourquoi le chiffre précédent mesurait une population hors liste blanche) ; §7.2 (**chiffre retiré**, borne prouvable = 0 sur la population mesurée, formule `Σ max(0, L_i − min(L_i, B_i)) / R`) ; §7.3 (histogramme par `options.tool` comme préalable, avec `(c) = 0` attendu pour les lectures) |
| 3. Justifier `maxChars` dans `Options` ou le retirer ; lister l'import `RuntimeFlags` | §4.3 (`maxChars` **retiré** de `Options`, qui ne gagne que `tool` ; §5-F justifie le retrait) ; §4.3 liste les deux imports, `runtime-flags` au même chemin que `inspect-batch.ts:7` |
| Objection 3, suite : `registry.ts:256` décrit exactement | §4.5 — le ternaire substitue `out.content` quand `truncated`, et `output` sinon ; l'équivalence des deux branches repose sur `truncate.ts:93-95` qui renvoie `content === text` quand `truncated` est faux. La portée est le bloc plugin-only `registry.ts:242-253`, dans `fromPlugin` (`registry.ts:219`, appelé `registry.ts:320` et `registry.ts:328`). Le site est bien traité, pour la propagation de la borne et la visibilité de la limite, et jamais décrit comme un inerte littéral |
