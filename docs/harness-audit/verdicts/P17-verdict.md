# Verdict de validation

## Proposal

`P17` — Invariant de plafond de sortie (`min(lean, générique)`).
Fichier de proposition validé :
`C:\jeanluc\opencode-fork\docs\harness-audit\proposals\P17-output-cap-invariant.md` (194 lignes).

## Validator

`validator-independent-p17` — `independent` : n'a pas rédigé la proposition. Toutes les
citations ci-dessous ont été relevées sur le code réel, pas sur la proposition.

## Status

`PASS_WITH_CHANGES`

Le raisonnement central de la proposition est juste et démontrable : la cause est
l'absence d'invariant dans `truncate.ts`, et `registry.ts:256` est bien un no-op. Deux
corrections obligatoires portent sur la mécanique du patch : la collision d'unités
octets/caractères, et un chiffre de gain-token incohérent avec la liste blanche qu'il
prétend mesurer.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | 23 citations contrôlées, 23 exactes. `truncate.ts:15-16` = `export const MAX_LINES = 2000` / `export const MAX_BYTES = 50 * 1024`. `lean-output-policy.ts:3-5` = `4_000` / `4_000` / `120`. `terminal-output.ts:5-6` = `MAX_BYTES = 4_000` / `MAX_LINES = 120`. `registry.ts:253`, `registry.ts:256`, `tool.ts:192`, `session/tools.ts:681`, `processor.ts:586-593`, `runtime-flags.ts:58`, `truncate.ts:128`, `truncate.ts:130`, `truncate.ts:93-95`, `lean-output-policy.ts:16-18`, `truncation.test.ts:104`, `truncation.test.ts:118`, `inspect-batch.ts:7`, `registry.ts:219` / `:320` / `:328` : tous conformes au texte réel |
| `registry.ts:256` est un no-op, la correction de prémisse du dossier est juste | ok | `truncate.ts:93-95` : `if (lines.length <= maxLines && totalBytes <= maxBytes) { return { content: text, truncated: false } as const }`. Donc `truncated === false` implique `out.content === output` octet pour octet ; le ternaire de `:256` ne peut pas changer la sortie. La proposition a raison de refuser d'y toucher |
| le correctif supprime vraiment la cause | KO | `leanCeiling` (proposition `:117-126`) calcule `lean.maxChars`, mais le patch l'applique via `maxBytes` (proposition `:133-134`), qui est en octets UTF-8. `buffer.byteLength("é")` vaut 2 : une sortie française de 4 000 caractères pèse environ 8 000 octets et se voit donc tronquée vers 2 000 caractères. Le plafond lean n'est pas honoré, il est divisé par deux |
| point d'application unique réel, pas une troisième constante déguisée | ok | `truncate.ts:75-83` (`limits()`) est l'unique lecture du plafond générique ; `:85` reçoit déjà `agent` en 3e argument ; `:87-88` est l'unique `??` qui résout le plafond. `leanCeiling` est une fonction dérivée d'une politique existante (`leanToolOutputBudget`), pas un nombre : aucun quatrième dialecte de plafond n'est introduit. L'alternative C (proposition `:155`) est correctement rejetée |
| le correctif ne casse pas un comportement existant, carve-out terminal | ok | `terminal-output.ts:142` : `if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }`, puis plafond 4 000 / 120 sans écriture disque. Sans le carve-out de `leanCeiling` (proposition `:122`), `truncate.ts:128` (`const file = yield* write(text)`) écrirait le texte intégral sur disque et `:130` ajouterait le bandeau : régression réelle. Carve-out correct et obligatoire |
| le correctif ne casse pas un comportement existant, idempotence avec `processor.ts` | ok | `processor.ts:589-593` passe déjà `{ maxLines, maxBytes, direction }` ; les deux premiers sont résorbés par `??` (proposition `:133-134`). Seconde application de `min(v, v)`, donc identité. Pas de double écriture disque |
| le correctif ne casse pas un comportement existant, signature et chemins court-circuités | KO | `tool.ts:192` transforme la sortie via `truncated.content` (`:195`), donc le contenu change pour tout appelant qui passe `{}`. Or `tool.ts:188-190` court-circuite : `if (result.metadata.truncated !== undefined) return result`. `session/tools.ts:681` est dans le même cas. Le patch ajoute un champ `tool` à `Options` (proposition `:109`) et renomme `_agent` en `agent` (`:110`) : toute lecture par index positionnel, présente ou future, casse silencieusement |
| tests proposés exécutables dans ce dépôt | ok | `packages/opencode/test/tool/truncation.test.ts` existe ; `test("uses default MAX_LINES and MAX_BYTES")` (`:104`) et `describe("with tool_output config")` (`:118`) sont aux lignes annoncées. `src/tool/lean-output-policy.test.ts:127-135` fournit déjà les harnais attendus (`leanToolOutputBudget("bash")` = 4 000, `leanToolOutputBudget("read")` = `undefined`). Runner du dépôt : `bun test` |
| effort et coût annoncés réalistes | KO | Le chiffre de gain-token est incohérent avec la liste blanche mesurée (Objection 2). L'effort annoncé, lui, est réaliste : un fichier de logique, quatre lignes d'appelant, une suite de tests existante |
| les 4 000 caractères lean sont un plafond par couche, pas un plafond global | ok | Deux chemins disjoints, tracés. Couche terminal : `terminal-output.ts:142` puis `:54-56`, 4 000 / 120, sans disque. Couche inspect : `lean-output-policy.ts:20-35` (`inspectBudget`), avec `maxActions: 16`, `totalChars: 16_000` et `maxCharsPerResult` de 1 000 à 4 000 par résultat. Ni `MAX_BYTES`/`MAX_LINES` (`truncate.ts:15-16`) ni `MAX_BYTES`/`MAX_LINES` (`terminal-output.ts:5-6`) ne dérive l'un de l'autre. Réduire le générique serait une erreur de conception, et la proposition le rejette à raison (alternative A, `:151`) |

## Objections

### Objection 1 — Collision d'unités : `maxChars` appliqué à un compteur d'octets

Le patch énonce l'invariant comme `min(plafond générique, plafond lean)` (proposition
`:100`), calcule `lean.maxChars` (`:125`), puis l'injecte dans `maxBytes` (`:133-134`),
dont la sémantique est en octets UTF-8 :

```ts
const maxBytes = options.maxBytes ?? resolved.maxBytes   // truncate.ts:88
const totalBytes = Buffer.byteLength(text, "utf-8")       // truncate.ts:91
if (bytes + size > maxBytes) { hitBytes = true; break }   // truncate.ts:105 et :115
```

Un caractère accentué UTF-8 vaut 2 octets, une flèche 3 octets. Sur une sortie française,
4 000 caractères pèsent environ 8 000 octets : le plafond lean est appliqué à moitié. Le
commentaire de la proposition (`:135-136`) reconnaît le besoin d'un second compteur en
points de code, mais la liste des corrections obligatoires ne l'énonce pas. C'est
précisément la partie du patch où le défaut se réintroduirait.

Ce qui doit changer : l'accumulation doit se faire en points de code le long de la boucle
`head` / `tail` (`truncate.ts:102-122`), avec sortie anticipée au dépassement, et
`removed` / `unit` (`:124-125`) doivent refléter l'unité réellement tronquée.

### Objection 2 — Le gain-token annoncé est surfondu : il mesure une population hors liste blanche

Le gain est chiffré sur 64 lectures au-delà de 4 000 caractères (proposition `:46` et
`:162`). Or la liste blanche sur laquelle s'appuie `leanCeiling` ne contient que trois
familles : `isLeanTerminalTool`, `repo_overview` et `web-browser_*`
(`lean-output-policy.ts:49-62`). Les lectures du harness (`read`, `inspect_batch`, `glob`,
`grep`, `ls`) n'en font pas partie, et c'est affirmé noir sur blanc dans le test
existant :

```ts
expect(leanToolOutputBudget("read")).toBeUndefined()   // lean-output-policy.test.ts:135
```

Après le patch, une lecture de 49 572 caractères appelle `leanToolOutputBudget("read")`,
qui renvoie toujours `undefined` ; `leanCeiling` renvoie donc `undefined` (proposition
`:124`) et la sortie passe toujours en entier. Le même raisonnement vaut pour tout outil
natif hors liste blanche : `repo_overview` garde 6 000, `web-browser_*` garde 8 000. Le
seuil de 4 000 est de surcroît le plafond terminal, pas le plafond des lectures ; `read`
n'a aujourd'hui aucun plafond lean, donc il n'y a rien à récupérer.

La borne haute annoncée, 64 lectures toutes au maximum de 49 572 pour environ 833 000
tokens (proposition `:162`), est arithmétiquement correcte mais hors sujet : elle suppose
que 64 lectures soient réduites, ce que le patch ne fait pas.

Ce qui doit changer : publier l'histogramme de la section 7 par nom d'outil (la
proposition reconnaît déjà ce point comme `INFERE`, `:162`), ou corriger la formule du
gain, ou les deux. Sans cela le dossier annonce un bénéfice qu'il ne produit pas.

### Objection 3 — `maxChars` dans `Options` n'est jamais consommé, et `RuntimeFlags` n'est pas importé

`Options` (proposition `:109`) reçoit `maxChars?: number` pour ne pas être mêlé à
`maxBytes`, qui est en octets. Mais le code cible ne l'utilise nulle part (proposition
`:131-137`) : le plafond lean arrive par `options.tool` et `agent`, jamais par `maxChars`.
Un champ d'API mort est une surface de divergence. Par ailleurs `leanCeiling` utilise
`RuntimeFlags` (proposition `:118`) alors que `truncate.ts` ne l'importe pas aujourd'hui.
La dépendance est faisable, l'import existe déjà dans le même répertoire
(`inspect-batch.ts:7`), mais il doit figurer dans la liste des ajouts.

## Required changes

1. Corriger l'unité. Implémenter la borne lean en points de code dans la boucle
   `truncate.ts:102-122`, et non via `maxBytes`. Ajouter un test qui vérifie le plafond
   sur une chaîne accentuée (`"é".repeat(5000)`) pour un agent lean : il doit produire
   environ 4 000 caractères, pas 2 000. Sans ce test, la régression UTF-8 est invisible.
2. Publier le gain-token par nom d'outil avant tout engagement de chiffre. Si les 64
   lectures sont majoritairement `read` et `inspect_batch`, annoncer explicitement que le
   patch les laisse passer, coût zéro et risque zéro, au lieu de chiffrer 91 000 à
   833 000 tokens.
3. Soit justifier `maxChars` dans `Options`, soit le retirer du diff (proposition `:109`).
   Lister l'import `RuntimeFlags` parmi les ajouts de `truncate.ts`.

## Implementation guidance

Ordre : (a) `leanCeiling` et le renommage `_agent` en `agent` dans `truncate.ts:85`, avec
l'import `RuntimeFlags` ; (b) le compteur en points de code dans la boucle, seul endroit où
le défaut peut réapparaître, à livrer dans le même patch et non dans un second ; (c) les
quatre appelants, une ligne chacun : `registry.ts:253` en `{ tool: id }`, `tool.ts:192` en
`{ tool: id }`, `session/tools.ts:681` en `{ tool: input.tool }`, `processor.ts:589` en
`{ tool: toolCall.part.tool }`. Piège connu : les chemins où `truncate.output` reçoit une
sortie déjà bornée court-circuitent en amont (`tool.ts:188-190`, `session/tools.ts:681`) ;
ne pas y ajouter une seconde troncature, sous peine de double écriture disque. Fichiers de
test : `packages/opencode/test/tool/truncation.test.ts` pour le cas UTF-8 et pour les cas
agent lean multiplié par outil en liste blanche ou hors liste blanche ;
`packages/opencode/src/tool/lean-output-policy.test.ts` à étendre à partir de `:127-135`.

## Questions ouvertes adressées au commanditaire

- Quel outil domine les 64 lectures excédentaires ? C'est le seul fait qui distingue
  « le patch produit 91 000 tokens par session » de « le patch produit 0 token ».
- Un plafond par couche pour `read` est-il souhaité ? Si oui il manque à
  `leanToolOutputBudget` et le patch devrait l'ajouter. Si non, l'Objection 2 est déjà la
  bonne lecture et le chiffre de gain doit être retiré du dossier.