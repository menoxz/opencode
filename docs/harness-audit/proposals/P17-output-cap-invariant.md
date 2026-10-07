# P17 — Invariant de plafond de sortie (`min(lean, générique)`)

## 1. Problem

Deux plafonds de sortie coexistent sans invariant qui les rapproche : la politique « lean » vise 4 000 caractères, le plafond générique 50 KB / 2 000 lignes, et rien n'impose que le plafond réellement appliqué soit le plus petit des deux — donc un budget lean peut être silently ignoré.

## 2. Evidence

**Plafond générique** — `packages/opencode/src/tool/truncate.ts:15-16` :

```ts
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
```

**Plafond lean** — `packages/opencode/src/tool/lean-output-policy.ts:3-5` :

```ts
export const LEAN_INSPECT_MAX_CHARS_PER_RESULT = 4_000
export const LEAN_TERMINAL_MAX_CHARS = 4_000
export const LEAN_TERMINAL_MAX_LINES = 120
```

**Troisième plafond, non nommé** — `packages/opencode/src/tool/terminal-output.ts:5` :

```ts
const MAX_BYTES = 4_000
const MAX_LINES = 120
```

**Appel sans options** — `packages/opencode/src/tool/registry.ts:253` :

```ts
const info = yield* agent.get(toolCtx.agent)
const out = yield* truncate.output(output, {}, info)
```

**Retour « non tronqué »** — `packages/opencode/src/tool/registry.ts:256` :

```ts
return {
  title: typeof result === "string" ? "" : (result.title ?? ""),
  output: out.truncated ? out.content : output,
```

**Mesure terrain (session auditée)** : 205 lectures, maximum 49 572 caractères, 64 lectures au-delà de 4 000 caractères. *(Source : mesure d'audit fournie avec la commande ; reproductible via l'instrumentation décrite en §7.)*

**`truncate.output` reçoit l'agent et l'ignore** — `packages/opencode/src/tool/truncate.ts:85` :

```ts
const output = Effect.fn("Truncate.output")(function* (text: string, options: Options = {}, _agent?: Agent.Info) {
```

Le paramètre est préfixé `_` : il n'est lu nulle part dans le corps (`truncate.ts:85-140`). C'est le fait central de ce dossier.

**Les plafonds génériques sont résolus sans l'agent** — `packages/opencode/src/tool/truncate.ts:86-88` :

```ts
const resolved = yield* limits()
const maxLines = options.maxLines ?? resolved.maxLines
const maxBytes = options.maxBytes ?? resolved.maxBytes
```

**La politique lean ne connaît que des outils d'une liste blanche, et renvoie `undefined` pour tout le reste** — `packages/opencode/src/tool/lean-output-policy.ts:49-62` : `leanToolOutputBudget(tool)` renvoie `{ maxChars: LEAN_TERMINAL_MAX_CHARS, maxLines: LEAN_TERMINAL_MAX_LINES, direction: "tail" }` si `isLeanTerminalTool(tool)` (`:52-54`), `{ maxChars: LEAN_OVERVIEW_MAX_CHARS, ... }` pour `repo_overview` (`:56-58`), `{ maxChars: LEAN_BROWSER_MAX_CHARS, ... }` pour `web-browser_*` (`:59-61`), et **rien du tout** dans tous les autres cas (absence de `return` en fin de fonction).

**Un agent lean est identifiable** — `packages/opencode/src/tool/lean-output-policy.ts:16-18` : `return agent.lean ?? agent.name === "lean"`.

**La liste blanche est déjà appliquée, mais au niveau session et sous drapeau** — `packages/opencode/src/session/processor.ts:586-587` :

```ts
const outputBudget = toolCall ? leanToolOutputBudget(toolCall.part.tool) : undefined
if (!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget) {
```

`processor.ts:589-593` passe alors `{ maxLines: outputBudget.maxLines, maxBytes: outputBudget.maxChars, direction: outputBudget.direction }`.

**Les outils de terminal lean sont déjà plafonnés ailleurs** — `packages/opencode/src/tool/terminal-output.ts:142` : `if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }`, puis `compactTerminalOutput` plafonne à `MAX_BYTES = 4_000` / `MAX_LINES = 120` (`terminal-output.ts:5-6`, `:54-56`), **sans écriture disque**.

**Le drapeau est un drapeau d'expérimentation, lisible depuis `src/tool/`** — `packages/opencode/src/effect/runtime-flags.ts:58` : `experimentalLeanOutputBudget: bool("OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET")`, importé ainsi dans le même répertoire que `truncate.ts`, `packages/opencode/src/tool/inspect-batch.ts:7` : `import { RuntimeFlags } from "@/effect/runtime-flags"`.

**Rayon d'action réel de `registry.ts:253`** — `packages/opencode/src/tool/registry.ts:219` : `function fromPlugin(id: string, def: ToolDefinition) {` … `:320` et `:328` : `custom.push(fromPlugin(...))`. Les lignes 253 et 256 sont donc **à l'intérieur de `fromPlugin`** : elles ne concernent que les outils enregistrés par plugin/plugin custom, pas les outils natifs, qui passent par `packages/opencode/src/tool/tool.ts:192` (`truncate.output(result.output, {}, agent)`).

## 3. Mechanism

1. Un outil s'exécute. Le résultat est une chaîne `output` ; le wrapper l'envoie à `truncate.output`.
2. `truncate.output` (`truncate.ts:85`) reçoit `(text, options, agent)`. Le troisième argument est nommé `_agent` (`truncate.ts:85`) : **le profil de l'agent est disponible ici et n'est pas consulté**.
3. `limits()` (`truncate.ts:75-83`) ne lit que la configuration `tool_output.max_lines` / `tool_output.max_bytes`, et sinon `MAX_LINES` / `MAX_BYTES` (`truncate.ts:80-82`). Aucune entrée de profil.
4. Avec `options = {}` (les quatre appelants le font : `registry.ts:253`, `tool.ts:192`, `session/tools.ts:681`), les opérateurs `??` de `truncate.ts:87-88` retombent sur les valeurs génériques : **2 000 lignes / 51 200 octets**.
5. Le test de passage de `truncate.ts:93-95` (`lines.length <= maxLines && totalBytes <= maxBytes`) renvoie alors `{ content: text, truncated: false }` pour toute sortie sous 51 200 octets — y compris une sortie de 45 000 caractères pour un agent lean dont la politique dit 4 000.
6. `registry.ts:256` renvoie alors `output`, c'est-à-dire la chaîne complète.

**Correction d'une prémisse du dossier : `registry.ts:256` n'est pas le défaut.** Le ternaire `out.truncated ? out.content : output` est un **no-op sémantique** : quand `truncated` vaut `false`, `truncate.ts:93-95` a retourné `{ content: text }`, donc `out.content === output` octet pour octet. Les deux branches rendent la même chaîne. Le défaut est à la ligne **253** (`options` vides) et dans le fait que **`truncate.ts` n'a pas d'entrée de profil** — pas dans le choix de branche de la ligne 256. Je propose donc de **ne pas toucher** `registry.ts:256` (voir §4).

**Pourquoi 3 des 4 appelants contournent la politique lean :** la liste blanche de `leanToolOutputBudget` n'est appliquée qu'au niveau session, dans `processor.ts:587`, sous le drapeau `flags.experimentalLeanOutputBudget`, et seulement pour `!terminal`. Les trois appelants de `truncate.output` — `registry.ts:253` (plugins), `tool.ts:192` (outils natifs), `session/tools.ts:681` — passent `{}` et n'appellent jamais `leanToolOutputBudget`. La coercition est donc **conditionnelle au chemin d'exécution**, pas une propriété du plafond : c'est l'absence d'invariant, pas une constante manquante.

## 4. Proposal

**Invariant, énoncé une fois :**

> Le plafond effectif d'un résultat d'outil est `min(plafond générique configuré, plafond de la politique lean)`, et le plafond lean s'applique dès lors que l'agent est lean **et** que l'outil figure dans la liste blanche de `leanToolOutputBudget` **et** qu'aucun compacteur plus spécifique ne possède déjà l'outil.

**Point d'application unique : `truncate.ts`.** C'est le seul endroit par lequel passent les quatre appelants (`registry.ts:253`, `tool.ts:192`, `session/tools.ts:681`, `processor.ts:589`), et c'est le seul qui dispose à la fois des trois informations nécessaires — le plafond générique (`limits()`), le profil de l'agent (déjà passé en 3ᵉ argument), et — après ajout — l'identité de l'outil. Une troisième constante serait pire : elle créerait un quatrième dialecte de plafond sans rien garantir, puisque rien n'obligerait les trois chemins à la consulter.

**Ce qui change, et pourquoi c'est préférable à une troisième constante.** Aujourd'hui le plafond lean est une *condition* de chemin d'exécution (`processor.ts:587` : drapeau ∧ non-terminal ∧ liste blanche ∧ service disponible). Demain il devient une *propriété* du plafond. Un caractère supprimé par accident d'une garde becomes impossible à représenter : si la garde manque, le plafond lean ne se perd plus, il n'était jamais ailleurs.

**Fichiers modifiés :**

- **`packages/opencode/src/tool/truncate.ts`** — seul fichier porteur de logique.
  - `Options` (`:22-27`) : ajouter `tool?: string` et `maxChars?: number` (en points de code, pour ne pas mingled avec `maxBytes` qui est en octets).
  - `output()` (`:85`) : renommer `_agent` → `agent`, et résoudre le plafond lean avant le test `fits`.
  - `limits()` (`:75-83`) : inchangée — elle reste la source unique du plafond générique.
- **Quatre appelants, une ligne chacun**, pour fournir l'identité de l'outil : `registry.ts:253` (`{ tool: id }`, `id` est le paramètre de `fromPlugin`, `registry.ts:219`), `tool.ts:192` (`{ tool: id }`), `session/tools.ts:681` (`{ tool: input.tool }`), `processor.ts:589` (`{ tool: toolCall.part.tool }`, qui l'a déjà sous le nom `outputBudget` — belt-and-braces).

**Code cible — la fonction de plafond (`truncate.ts`), 14 lignes :**

```ts
export function leanCeiling(tool: string | undefined, agent: Agent.Info | undefined) {
  if (!agent || !RuntimeFlags.experimentalLeanOutputBudget) return undefined
  if (!isLeanAgent(agent)) return undefined
  // terminal-output.ts:142-… possede deja les outils de terminal lean et plafonne
  // a 4 000 / 120 SANS ecriture disque : ne pas lui ajouter un second pis d'ecriture.
  if (tool && isLeanTerminalTool(tool)) return undefined
  const budget = tool ? leanToolOutputBudget(tool) : undefined
  if (!budget) return undefined // liste blanche => plafond generique conserve tel quel
  return { maxChars: budget.maxChars, maxLines: budget.maxLines, direction: budget.direction }
}
```

Puis, dans `output()`, trois lignes quiumplissent l'invariant :

```ts
const lean = leanCeiling(options.tool, agent)
const maxLines = options.maxLines ?? lean?.maxLines ?? resolved.maxLines
const maxBytes = options.maxBytes ?? resolved.maxBytes
// puis, dans la boucle head/tail (truncate.ts:102-122), un compteur de points de code
// qui fait la meme sortie que `hitBytes` quand il depasse lean.maxChars.
```

**Le carve-out terminal est délibéré et non négociable.** Sans lui, un agent lean voit chaque sortie de terminal passer *aussi* par `truncate.output`, qui **écrit le texte intégral sur disque** (`truncate.ts:128` `const file = yield* write(text)`) et ajoute le bandeau `truncate.ts:130` — alors que `compactTerminalOutput` (`terminal-output.ts:132`, `:142`) le plafonne déjà à 4 000 / 120 sans disque. Ce serait une régression de comportement, pas un durcissement. `terminal-output.ts` n'est donc **pas** modifié.

**Volontairement inchangé :**

- **`registry.ts:256`** — le ternaire est un no-op démontré (`truncate.ts:93-95`) ; le modifier serait du bruit de diff qui donne l'illusion de corriger le défaut au mauvais endroit.
- **`lean-output-policy.ts`** — aucune modification. Il exporte déjà exactement ce qu'il faut (`isLeanAgent`, `leanToolOutputBudget`, `isLeanTerminalTool`). C'est un point fort du design : la proposition consomme la politique existante au lieu de la dupliquer.
- **`processor.ts:585-604`** — gardé tel quel. Il apporte le metadata `leanOutputBudget` (`:597-603`) utile au débogage, et son plafond devient une seconde application idempotente de `min(une valeur, elle-même)`. Le supprimer serait un nettoyage, pas une correction, et augmenterait le rayon de régression.
- **Le plafond générique 50 KB / 2 000 lignes** — inchangé pour tout agent non lean et pour tout outil absent de la liste blanche. C'est la réponse directe à la contrainte « ne casse pas les outils qui ont besoin de plus » : `leanToolOutputBudget` renvoie `undefined` hors liste blanche (`lean-output-policy.ts:49-62`), donc ces outils conservent 51 200 octets.
- **Drapeau `experimentalLeanOutputBudget`** — il reste la soupape d'échappement : à `OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET` désactivé, le comportement est identique à l'octet près. La proposition ne retire aucun contrôle à l'opérateur.

## 5. Alternatives considered

**A. Réduire `MAX_BYTES` à 4 000.** Rejeté. `MAX_BYTES` (`truncate.ts:16`) est le plafond de **tous** les agents et de tous les outils, y compris `repo_overview` dont la politique lean demande 6 000 (`lean-output-policy.ts:8`) et `web-browser_*` qui demande 8 000 (`lean-output-policy.ts:6`). Un plafond unique à 4 000 casserait les outils de navigation, qui ont besoin de plus — exactement l'écueil signalé par la commande. Cela revient aussi à faire de `4_000` une quatrième constante.

**B. Corriger `registry.ts:256` (`out.truncated ? out.content : output` → `out.content`).** Rejeté comme correctif : le ternaire est un no-op, donc le changement est sans effet sur la sortie, et il déplace l'apparence du durcissement vers une ligne qui n'a rien à voir avec le plafond. Retenu comme **non-correction volontaire** (§4).

**C. Ajouter une troisième constante `MAX_CHARS = 4_000` dans `truncate.ts`.** Rejeté. Une constante n'est pas un invariant : rien n'obligerait `processor.ts`, `tool.ts:192` ou `session/tools.ts:681` à la consulter, et on obtiendrait trois plafonds là où il y en a deux. Le problème est l'absence de point d'application unique, pas l'absence de nombre.

**D. Renforcer la garde `processor.ts:587` au lieu de toucher `truncate.ts`.** Rejeté. `processor.ts` est la couche session : elle ne voit pas les appels directs à `truncate.output` (`tool.ts:192`, `registry.ts:253`) et ne peut pas garantir quoi que ce soit sur un chemin de code qui la contourne. Le gargouillis resterait dans le type (« sortie de 45 000 caractères pour un agent lean »), il serait seulement moins fréquent.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/test/tool/truncation.test.ts` est le fichier concerné : `describe("Truncate")` (`:28`), `describe("output")` (`:29`), test `"uses default MAX_LINES and MAX_BYTES"` (`:104`) — **c'est le test le plus directement exposé**, il vérifie qu'un texte hors budget est tronqué ; il continuera de passer car il n'exerce pas d'agent lean. `describe("with tool_output config")` (`:118`) et `"loads truncate effect in a fresh process"` (`:235`) sont exposés au renommage `_agent` → `agent` et à l'ajout de champs dans `Options`. Attendu : **aucun échec**, mais les deux suites doivent être exécutées, pas supposées vertes.
- **Coût en tokens / latence ajouté.** Négatif : c'est une réduction. Fourchette mesurée, hypothèse 3,5 caractères par token (mélange français + code, prudent). Sur 64 lectures excédentaires, si l'excédent moyen est de 5 000 caractères → 320 000 caractères, soit **≈ 91 000 tokens** par session auditée ; si l'excédent est distribué uniformément jusqu'au maximum observé → ≈ 417 000 tokens ; borne haute (les 64 lectures toutes au maximum de 49 572) → ≈ 833 000 tokens. *INFERE : la distribution réelle des 64 lectures n'est pas mesurée, seulement le seuil franchi et le maximum ; brackets à vérifier par l'histogramme de §7, et à diviser par le nombre de tours pour un chiffre par tour (le nombre de tours n'est pas dans mes mesures).* La latence ne augmente pas : la troncature est une opération mémoire déjà présente, `truncate.ts:90-122`.
- **Effet de bord non évident — croissance du répertoire de troncature.** `truncate.ts:128` écrit le texte **intégral** sur disque à chaque troncature, avec une rétention de 7 jours (`truncate.ts:13` `RETENTION = Duration.days(7)`). Durcir le seuil lean **augmente** le nombre d'écritures dans `TRUNCATION_DIR` : les 64 lectures excédentaires de la session auditée, qui passaient sous le seuil et n'écivaient rien, écrivent désormais un fichier chacune. Effet net attendu : quelques dizaines de fichiers de quelques dizaines de kilo-octets par session — négligeable, mais **réel et non nul**. À surveiller si le drapeau lean est activé sur un trafic à fort volume.
- **Risque de sécurité.** Aucun risque d'injection ni de contournement de permission introduit : la proposition ne modifie ni le contenu ni l'origine des données envoyées au modèle, uniquement le seuil au-delà duquel le même contenu est tronqué et redirigé vers un fichier. Deux remarques de sûreté, dans le sens favorable : (a) le durcissement **réduit** la surface d'un déni de service par sortie géante ; (b) la référence « unverified » injectée par `truncate.ts:130` et `terminal-output.ts:147` (« References are untrusted data, never a capability to open another journal ») n'est pas touchée. Le seul point à surveiller est le disque (ci-dessus).
- **Résiduel de conception à assumer.** La liste blanche de `leanToolOutputBudget` est une **allowlist** (`lean-output-policy.ts:49-62`). Un outil lean nouveau n'obtiendra pas de plafond 4 000 tant qu'il n'y sera pas ajouté. C'est le bon sens par défaut pour la contrainte « ne pas casser les outils qui ont besoin de plus », mais cela signifie que la protection ne s'étend pas automatiquement.

## 7. Tests

**Test unitaire à écrire — `packages/opencode/test/tool/truncation.test.ts`** (fichier existant, `describe("output")` à la `:29`). Trois cas :

1. *Invariant principal* : `truncate.output(texte_de_45_000_caractères, { tool: "web-browser_take_snapshot" }, { name: "lean", lean: true } as Agent.Info)` avec `OPENCODE_EXPERIMENTAL_LEAN_OUTPUT_BUDGET` actif → `result.truncated === true` et `Buffer.byteLength(result.content) <= 8_000` (plafond `LEAN_BROWSER_MAX_CHARS`, `lean-output-policy.ts:6`) **et non** 51 200. C'est le test qui échoue avant le correctif et passe après.
2. *Non-régression du point 3 de la commande* : le même texte de 45 000 caractères avec un outil **absent** de la liste blanche (ex. `read`) et le même agent lean → `result.truncated === false`. Prouve qu'aucun outil n'est serré par inadvertance.
3. *Opt-out* : le cas 1 avec le drapeau désactivé → `result.truncated === false`. Prouve que la soupape d'échappement est préservée.

**Commande exacte** (depuis `packages/opencode`) :

```
bun test test/tool/truncation.test.ts
```

**Critère de succès observable** : sortie `3 pass`, `0 fail`, et le test 1 vérifie explicitement `truncated === true` à 8 000 là où le code actuel renvoie `truncated === false`. Un simple « la suite passe » ne suffit pas : le test 1 doit être rouge sur le code actuel, sinon il ne prouve rien.

**Test d'observation complémentaire** (produit la donnée qui manque au §6) : instrumenter un histogramme `Buffer.byteLength(output)` par lecture sur la session auditée, pour remplacer les brackets par une moyenne d'excédent réelle etmeasure le nombre de tours.

## 8. Effort

**S** — un seul fichier de logique (`truncate.ts`, ~30 lignes), quatre appelants modifiés d'une ligne chacun, aucune dépendance nouvelle, aucune migration, un fichier de test existant étendu.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — l'invariant et son point d'application unique sont sound et le correctif est de faible risque, mais deux points doivent être tranchés par le validateur avant acceptation :

1. **Les outils de plugin doivent-ils être soumis au plafond lean ?** `registry.ts:253` est à l'intérieur de `fromPlugin` (`registry.ts:219`, appelé `:320` et `:328`) et ne couvre donc que les outils plugin/custom. La prémisse du dossier (« le chemin sous le seuil renvoie la sortie non tronquée ») suggère un périmètre universal, alors que ce chemin est restreint. Si le validateur juge que le plafond lean ne doit pas contraindre les plugins, l'invariant doit alors être restreint à `tool.ts:192` — ce qui retire la moitié du bénéfice observé sans changer une ligne du raisonnement.
2. **Faut-il conserver la garde de `processor.ts:587` (double application) ou la supprimer ?** Je propose de la conserver pour le metadata `leanOutputBudget` (`processor.ts:597-603`) ; le validateur peut préférer supprimer la duplication.