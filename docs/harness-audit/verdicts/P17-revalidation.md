# Revalidation de P17 — cycle 4 (reviseur indépendant)

Je n'ai rédigé ni `P17-output-cap-invariant.md`, ni `P17-verdict.md`, ni aucune révision.
Aucun fichier du dépôt n'a été modifié ; `git` n'a pas été invoqué. Les seules écritures sont
ce verdict et deux scripts hors dépôt (`%TEMP%\opencodev2\p17-sim.mjs`, `p17-sim2.mjs`).

Levée d'une confusion de cadrage avant tout : le brief affirme que « la table à `:383` déclare
que `processor.ts:589-593` passe actuellement `{ tool: toolCall.part.tool }` **SANS**
`maxBytes: outputBudget.maxChars` ». C'est **faux**. La colonne `avant` de `:383` déclare au
contraire `{ maxLines, maxBytes: outputBudget.maxChars, direction }`, et la colonne `après`
retire le `maxBytes`. La proposition dit donc vrai. C'est le brief, pas la proposition, qui
inverse les colonnes. `F-02` est réel, et c'est la proposition qui le trouve.

## Preuves d'ancrage (relevés sur les fichiers réels, pas sur la proposition)

| ancrage | réel | attendu par P17 | verdict |
|---|---|---|---|
| `terminal-output.ts:155` | `if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }` | carve-out lean | exact |
| `terminal-output.ts:7-8` | `const MAX_BYTES = 4_000` / `const MAX_LINES = 120` | 4 000 / 120 | exact |
| `terminal-output.ts:142` | `return path.resolve(root, value).startsWith(root + path.sep)`, dans `withinTruncationRoot` (`:139`) | ancien `:142` | exact, **zéro dérive** |
| `processor.ts:587` | `if (!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget) {` | aucun test `isLeanAgent` | exact (comparaison caractère à caractère avec `:392`) |
| `processor.ts:591` | `{ maxLines: outputBudget.maxLines, maxBytes: outputBudget.maxChars, direction: outputBudget.direction },` | `maxBytes: outputBudget.maxChars` **présente** | la proposition est correcte |
| `lean-output-policy.ts:6` / `:8` | `LEAN_BROWSER_MAX_CHARS = 8_000` / `LEAN_OVERVIEW_MAX_CHARS = 6_000` | 6 000 / 8 000 | réels |
| `truncate.ts:16` | `export const MAX_BYTES = 50 * 1024` | 51 200 générique | réel |
| `truncate.ts:93-95` | `if (lines.length <= maxLines && totalBytes <= maxBytes) return { content: text, truncated: false }` | sortie anticipée | réel |
| `truncate.ts:85` | `function* (text: string, options: Options = {}, _agent?: Agent.Info)` | `_agent` ignoré aujourd'hui | réel |

**Contrôle positif des recherches.** `grep path=docs/harness-audit/proposals,
include=P17-output-cap-invariant.md` sur `expectCut|32 798|115 octets|413 octets|repeat\(151\)|toBeGreaterThan|toBeLessThan|content\.length|maxBytes:|isLeanAgent`
→ **28 correspondances**, dont `expectCut` présent à **5 lignes** (`:688` définition, `:726`,
`:747`, `:775`, `:820`). Même forme de recherche, même `path`, même `include` : le contrôle
positif est donc établi, et aucune conclusion de ce verdict ne repose sur un résultat vide.
Second contrôle, `grep path=packages/opencode/src/tool, include=terminal-output.ts` →
**16 correspondances** (ancrages listés ci-dessus tous présents).

## R17-01 — §8 était inexécutable : le défaut est réel, mais il a survécu sous une autre forme

La contrainte de fixture §8.1 est **juste et bien démontrée**. J'ai vérifié la mécanique :
`truncate.ts:90` fait `text.split("\n")`, `truncate.ts:109` fait `out.push(lines[i])` — seules
des lignes entières survivent. Je confirme donc le diagnostic de `:661-668`.

Mais §8.1 **n'est pas exécutable tel quel**, pour une raison que §8.1 ne voit pas.

`expectCut` (`:688-699`) contient cinq assertions. J'ai réduit l'assertion (b) (`:694-696`) :

```
retained + (cap - retained)  ≡  cap
⇒  (b)  ⇔  text.slice(0, cap) === result.content.slice(0, cap)
```

`expectCut` n'est appelée qu'à `:726`, `:747`, `:775`, `:820` — **toujours** dans une branche où
`result.truncated === true`. Or à l'offset `cap`, `result.content` contient le bandeau
`\n\n...${removed} ${unit} truncated...\n\n${hint}` construit en `truncate.ts:135`, jamais le préfixe
de l'entrée. **(b) est donc fausse par construction, quelle que soit la fixture.**

Simulation exécutée (`node %TEMP%\opencodev2\p17-sim.mjs`, exit 0), boucle `:308-332` de la
proposition, `width` réel = `lines[i].length + 1` :

| cas | `k` recalculé par moi | `retained` | annoncé | (a) | (b) | (c) sentinelles | (e) bandeau | `ALL` |
|---|---|---|---|---|---|---|---|---|
| 8.2 | `floor(6001/59)` = **101** | **5 958** | 101 / 5 958 `:723` | true | **false** | 101 ✓ | « characters » ✓ | **false** |
| 8.3 | `floor(6001/207)` = **28** | **5 795** | 28 / 5 795 `:746` | true | **false** | 28 ✓ | « characters » ✓ | **false** |
| 8.4 | `floor(51201/402)` = **127** | **51 053** | 127 / 51 053 `:770` | true | **false** | 127 ✓ | **« bytes », donc (e) false** | **false** |
| 8.7 | `floor(6001/42)` = **142** | **5 963** | 142 / 5 963 `:815` | true | **false** | 142 ✓ | « characters » ✓ | **false** |

Mes quatre `k` et mes quatre `retained` correspondent exactement aux annonces `:723`, `:746`,
`:770`, `:815`. La **formule fermée** de `:677` et `:689` est correcte, les fixtures
(`:715`, `:744`, `:771`, `:818`) sont bien multi-lignes et assez courtes pour être conservées
entières (largeur 59 / 207 / 202 cp / 42 cp, très en deçà de tout plafond), et l'assertion (c)
(`:697`, comptage des sentinelles) est la seule assertion réellement discriminante du lot.
Mais `expectCut` **ne retourne jamais vert**, pour deux raisons indépendantes :

1. (b) `:694-696` — fausse par construction, ci-dessus.
2. (e) `:698` — `expect(result.content).toContain("characters truncated")` est câblée sur l'unité
   « characters ». Or `:775` appelle `expectCut(big, result, 51_200, 402)` sur le cas **non lean**,
   dont le bandeau doit être « bytes truncated » : mesuré `banner=false`. `expectCut` **contredit
   donc l'assertion `:774`** de 8.4, qui exige `not.toContain("characters truncated")`.

Conséquence : `:834` « **Critère de succès observable** : `0 fail` » est **inatteignable** pour 8.2,
8.3, 8.4 et 8.7. C'est un défaut bloquant au sens de la règle « une prescription de test qui ne peut
pas atteindre son état de passage attendu est un défaut BLOQUANT ».

**Sur la discrimination 8.2 / 8.3 / 8.7.** Je n'ai pas accepté `:719-720` et `:814-815` sur
parole. Le code actuel n'a **pas** de `leanCeiling` : `truncate.ts:87-88` résout
`maxLines = 2000` et `maxBytes = 51 200` (options non fournies), et `_agent` est ignoré. Simulation
`p17-sim2.mjs` (exit 0), limites réelles :

| cas | lignes | points de code | octets | `truncated` actuel | lignes conservées | unité |
|---|---|---|---|---|---|---|
| 8.2 | 400 | 23 599 | 46 399 | **false** | — | — |
| 8.3 | 400 | 82 799 | 164 799 | **true** | 124 | bytes |
| 8.4 | 800 | 161 599 | 321 599 | **true** | 127 | bytes |
| 8.7 | 300 | 12 599 | 12 599 | **false** | — | — |

- **8.2 est réellement rouge.** Assertion qui échoue : `expect(result.truncated).toBe(true)` à
  `:721` — mesuré `false`, sortie anticipée `truncate.ts:93-95`. Motif annoncé `:719-720`
  (« 46 399 octets passent dessous ») **exact**.
- **8.7 est réellement rouge.** Assertion qui échoue : `expect(result.truncated).toBe(true)` à
  `:691`, à l'intérieur de `expectCut` — mesuré `false`. Motif `:814-815` **exact**.
- **8.3 est rouge, mais pas pour la raison annoncée.** Le tableau `:843` annonce
  « rouge (`truncated === false`) ». C'est **faux** : le code actuel tronque déjà, à 124 lignes,
  unité `bytes`. Aucune assertion de 8.3 ne peut donc échouer sur `truncated`. Les assertions qui
  échouent réellement sont `:697` (`sentinels === 28`, observé `124`) et, après correctif, (b).
  Et `:750` (`byteLength > 11 000`) **passe déjà** sur le code actuel (contenu ≈ 50 561 octets), donc
  ce n'est pas un point de rupture. Conclusion : 8.3 discrimine, mais **par le comptage de sentinelles,
  pas par `truncated`**. La table de discrimination est donc mensongère sur une ligne — et c'est
  précisément la famille de erreur que l'agent de révision avait divulguée (mauvais compte de lignes
  en 8.3).
- **8.4 est un non-régression correcte.** `:765` (500 lignes de 40 « é » = 40 499 octets < 51 200)
  et `:773`/`:774` sont vertes avant comme après. Le `width = 402` passé à `:775` est **juste** :
  pour un agent non lean, `maxChars` vaut `undefined` (`lean-output-policy.ts:49-62` renvoie
  `undefined` hors liste blanche, `leanCeiling` `:273`), donc le seul prédicat qui joue est
  `bytes + size > maxBytes`, de largeur 402 octets. Le compteurfactual `:776`
  (`floor(51 201 / 202) = 253`) est exact. Mon premier contrôle automatique avait signalé un écart
  202 cp / 402 octets : c'était **ma** spécification de contrôle qui était erronée, la proposition
  était juste — je le consigne pour que l'écart ne soit pas réintroduit.

**8.5 et 8.6 sont bien vertes avant et après.** 8.5(a) : 900 lignes de 40 « x » = 36 899 points de
code (`:783` exact), 36 899 < 51 200 et 901 lignes ≤ 2 000 → `truncated === false`, et le carve-out
`leanCeiling` `:271` renvoie `undefined`. 8.5(b) : `read` est hors liste blanche → `maxChars`
`undefined` → non tronqué. 8.6 : drapeau coupé → `:266` renvoie `undefined` → non tronqué. Le
caractère de non-régression annoncé à `:845-847` est donc exact, et la justification `:851-853`
(« annoncer qu'elles seraient rouges avant serait une autre affirmation infondée ») est la bonne
posture — ce qui rend d'autant plus inexcusable l'affirmation contraire en 8.3.

## R17-02 — F-02 : dans le périmètre, et l'extension est une correction, pas du scope creep

Confirmé sur le fichier réel. `processor.ts:589-593` est **bien** le site qui passe
`maxBytes: outputBudget.maxChars` (`:591`), et le garde-fou `:587` est **bien**
`!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget`
— aucun test d'`isLeanAgent`, alors que `outputBudget` (`:586`) ne dépend que du nom de l'outil
(`lean-output-policy.ts:49-62`). Un agent **non lean** qui appelle `repo_overview` ou
`web-browser_*` passe la garde et reçoit 6 000 / 8 000 **octets** au lieu de 51 200 : restriction
réelle d'un facteur 6 à 8,5, dès que le drapeau est actif.

Le correctif extended à `processor.ts` est **juste et nécessaire**, et l'argument de `:532-534` tient
contre vérification : la borne entre par `Options.maxBytes`, un `??` explicite à `truncate.ts:88`
que le patch de `truncate.ts` **ne réécrit pas**. `INFERE:` un patch limité à `truncate.ts` laisserait
donc le défaut vivant ; vérification : `Select-String -Path packages\opencode\src\tool\truncate.ts -Pattern 'options.maxBytes'`
→ `truncate.ts:88`. Ce n'est pas du scope creep, c'est la correction du fond. `:472` (retrait de
`processor.ts:585-604` de la liste des fichiers non modifiés) est cohérent avec cette décision.

## R17-03 — citations périmées : corrigées, et **zéro dérive résiduelle**

Les quatre ancres corrigées sont exactes sur les fichiers actuels, malgré le fait que P16 ait été
implémenté et commité : `:155` est bien le carve-out lean, `:7-8` sont bien `MAX_BYTES = 4_000` /
`MAX_LINES = 120`, l'ancien `:142` est bien `path.resolve(root, value).startsWith(root + path.sep)`
dans `withinTruncationRoot`, et il est **toujours** à `:142`. Aucune citation n'a bougé. `R17-03` est
clos.

## Défauts divulgués par l'agent de révision : ont-ils survécu ailleurs ?

- **Assertion inversée de 8.2** : **n'a pas survécu**. `:721` est correctement orientée et mon
  mesure confirme que le code actuel renvoie `false` — la déclaration « rouge » est donc exacte.
- **Mauvais compte de lignes de 8.3** : **a survécu sous forme résiduelle**, dans trois endroits de
  §8. Le compte 400 est juste (`lines=400` mesuré), mais le **diagnostic** de rouge de 8.3 est faux
  (voir ci-dessus), et la même famille de dérive arithmétique traîne ailleurs :
  - `:713` et `:727` annoncent une largeur en octets de **115** et `floor(6 001 / 115) = 52` ;
    la largeur réelle est **116** octets (57 « é » = 114 B + sentinelle + séparateur), et
    `floor(6 001 / 116) = 51`. Vérifié par la simulation (`BYTECAP k=51`).
  - `:741` et `:748` annoncent **413** octets ; la largeur réelle est **412**. Le `k = 14` est
    juste, le diviseur affiché non.
  - `:792` et `:804` annoncent **32 798** octets pour 400 lignes de 40 « é » sans sentinelle ; le
    vrai total est **32 399**. L'assertion `:795` reste verte (32 399 < 51 200), donc sans effet sur
    le résultat, mais c'est une dérive de la même famille.
  Aucun de ces nombres n'est utilisé par une assertion, donc aucun n'est bloquant : c'est
  précisément ce qui les rend inacceptables dans un document dont l'argument central est
  l'exactitude de l'unité.

## Final verdict

**REVALIDATED-FAIL**

Le diagnostic de fond de R17-01 est correct et la formule fermée de §8.1 est exacte — mes quatre `k`
recalculés concordent avec les quatre annonces. Mais `expectCut` est appelé dans quatre tests et
**n'en peut passer aucun** : son assertion (b) est une tautologie déguisée qui se réduit à
`text.slice(0,cap) === content.slice(0,cap)` et est donc fausse dès que `truncated === true`, et son
assertion (e) est câblée sur l'unité « characters » et contredit l'assertion `:774` de 8.4. Le
critère `0 fail` de `:834` est donc inatteignable : c'est un défaut bloquant, pas une note de style.
R17-02 et R17-03 sont clos et correctement traités. `RESIDUES_REMAINING = 9` (7 miennes, dont 2
bloquantes, + 2 résidus déclarés hérités de `F-03` / `F-05`).

| id | severity | statut | evidence (file:line) | statement |
|---|---|---|---|---|
| `V17-01` | blocking | open | `P17:694-696` (appelé `:726`, `:747`, `:775`, `:820`) ; mesuré `node %TEMP%\opencodev2\p17-sim.mjs` → `b=false` sur 8.2/8.3/8.4/8.7 | L'assertion (b) d'`expectCut` se réduit à `text.slice(0,cap) === result.content.slice(0,cap)` ; comme `expectCut` n'est appelée que sur un résultat `truncated === true`, elle bute sur le bandeau de `truncate.ts:135`. Fausse par construction : `0 fail` (`:834`) inatteignable. Correction : asserter l'identité du **préfixe** `text.slice(0, retained)` contre `result.content.slice(0, retained)`, ou asserter `result.content.startsWith(text.slice(0, retained))`. |
| `V17-02` | blocking | open | `P17:698` vs `P17:774` et `P17:775` ; mesuré `banner=false` sur 8.4 | L'assertion (e) exige `"characters truncated"` alors que `expectCut` est appelée en 8.4 sur le cas non lean en octets, dont l'unité correcte est `bytes` — mesuré. `expectCut` contredit l'assertion `:774` du même test. Correction : passer l'unité en paramètre (`expectCut(text, result, cap, width, unit)`), ou déduire l'unité du bandeau présent. |
| `V17-03` | material | open | `P17:843` vs `p17-sim2.mjs` (`8.3: truncated=true keptLines=124 unit=bytes`) | Le tableau de discrimination annonce 8.3 « rouge (`truncated === false`) » ; le code actuel tronque déjà (124 lignes, unité `bytes`). La assertion qui échoue réellement est `:697` (sentinelles `28` vs `124`), pas `truncated`. `:750` passe déjà sur le code actuel. La justification de non-régression `:851-853` est la bonne posture ; la ligne 8.3 du tableau la contredit. |
| `V17-04` | minor | open | `P17:713`, `P17:727` (annoncé 115 / 52) ; `P17:741`, `P17:748` (annoncé 413) ; mesuré `lineWidth=58cp/115B` → 116 B, `206cp/411B` → 412 B, `BYTECAP k=51` | Largeurs en octets fausses d'une unité dans les contrefactuels de 8.2 et 8.3 (115 au lieu de 116, 413 au lieu de 412). Le `k` de 8.3 (14) reste juste ; celui de 8.2 est faux (51, pas 52). Aucune assertion n'en dépend. |
| `V17-05` | minor | open | `P17:792`, `P17:804` (annoncé 32 798) ; recalcul 400 × 80 + 399 = **32 399** | Total d'octets faux pour la fixture 8.5(b) (ligne = 40 « é » = 80 octets, sans sentinelle). L'assertion `:795` reste verte ; dérive documentary. |
| `V17-06` | minor | open | `P17:754` ; grep `repeat\(151\)` sur `include=P17-output-cap-invariant.md` → 1 seule correspondance, en prose | La prose de 8.3 affirme que « `not.toContain("é".repeat(151))` prouve que la coupe n'a pas été décidée en octets », mais cette assertion n'existe plus dans la section : la preuve correspondante est désormais `:750`. Renvoi obsolète. |
| `V17-07` | minor | open | `P17:789` vs `P17:672-674` | `:789` (`expect(t.content.length).toBeGreaterThan(30_000)`) est exactement la « comparaison à une borne nue » que `:672-674` qualifie de « fausse par construction ». Elle passe (36 899 > 30 000) et n'est pas bloquante, mais elle contredit le principe énoncé six lignes plus haut. |
| `V17-08` | minor | closed | `P17:188-201`, `:470` ; `terminal-output.ts:139`, `:141-142`, `:155`, `:7-8` | R17-03 : les quatre ancres corrigées sont exactes et n'ont pas bougé malgré P16 commité ; l'ancien `:142` est toujours `:142`. Zéro dérive résiduelle. |
| `V17-09` | material | closed | `P17:383`, `:387-401`, `:527-534`, `:867` ; `processor.ts:586-591` ; `truncate.ts:88` | R17-02 : `maxBytes: outputBudget.maxChars` est bien présent à `processor.ts:591`, le garde `:587` ne teste pas `isLeanAgent`, les constantes 6 000 / 8 000 / 51 200 existent (`lean-output-policy.ts:6`, `:8`, `truncate.ts:16`). Le défaut est réel et non corrigeable depuis `truncate.ts` seul, car `Options.maxBytes` est un `??` prioritaire à `truncate.ts:88`. Étendre le correctif à `processor.ts` est une correction, pas du scope creep. |
| `V17-10` | minor | open (assumé, hérité) | `P17:868` ; `src/tool/lean-output-policy.ts:49-62` ; `src/tool/lean-output-policy.test.ts:135` (`expect(leanToolOutputBudget("read")).toBeUndefined()` — relu) | `F-03` : la liste blanche est une allowlist, `read` / `inspect_batch` / `glob` / `grep` / `ls` n'ont aucun plafond lean, gain mesuré = 0 token. Déclaration de scope et de mesure, pas de prescription de code : ne bloque pas. Confirmé : 8.5(b) fige ce comportement en non-régression. |
| `V17-11` | minor | open (assumé, hérité) | `P17:870` ; `lean-output-policy.ts:4` ; `P17:271` | `F-05` : la fixture `"é".repeat(5000)` du verdict initial est mono-ligne **et** teste un plafond terminal carve-out, donc inexécutable. Diagnostic juste (4 000 = `LEAN_TERMINAL_MAX_CHARS`, terminals exclus par `leanCeiling` `:271`) ; la substitution multi-lignes discrimine réellement (mesuré : 8.2 passe de `false` à `true`). Ne bloque pas. |

## Handed back to

Révision de `P17-output-cap-invariant.md`. Aucun de ces résidus n'est de la finition : deux sont
bloquants au sens de la règle d'implémentabilité.

**Bloquants — l'implémentation ne peut pas démarrer avant correction :**

1. **`V17-01`** — réécrire l'assertion (b) d'`expectCut` (`:694-696`). En l'état elle compare
   `text.slice(0, 6 000)` au contenu réel, qui porte le bandeau à cet offset ; elle échoue sur les
   quatre appels. Sans cela, `bun test test/tool/truncation.test.ts` ne peut pas atteindre le
   `0 fail` que `:834` annonce comme critère de succès.
2. **`V17-02`** — decoupling l'assertion (e) (`:698`) de l'unité « characters », afin que
   `expectCut(big, result, 51_200, 402)` (`:775`) cesse de contredire `:774`.

**Matériel — à corriger dans la même passe :**

3. **`V17-03`** — corriger la ligne 8.3 du tableau de discrimination (`:843`) : 8.3 est rouge **par le
   comptage de sentinelles** (`:697`, 28 attendu contre 124 observé), pas parce que `truncated`
   vaudrait `false`. Nommer l'assertion qui échoue réellement est une exigence de ce cycle.

**Mineurs — même passe, sans urgence bloquante :**

4. **`V17-04`** — 115 → 116 et 52 → 51 en `:713`/`:727` ; 413 → 412 en `:741`/`:748`.
5. **`V17-05`** — 32 798 → 32 399 en `:792` et `:804`.
6. **`V17-06`** — supprimer ou réécrire le renvoi à `not.toContain("é".repeat(151))` en `:754`,
   l'assertion n'existant plus.
7. **`V17-07`** — remplacer la borne nue de `:789` par une assertion sur le nombre de lignes ou
   l'absence de troncature, conformément au principe énoncé en `:672-674`.

**Ce qui ne bloque pas et ne doit pas être repris :** `V17-08` et `V17-09` sont clos et correctement
traités — l'extension à `processor.ts` est justifiée par `truncate.ts:88` et doit être conservée.
`V17-10` (`F-03`) et `V17-11` (`F-05`) sont des **résidus déclarés** : ce sont des constats de périmètre
et de mesure, antérieurs à cette revalidation, qui ne prescrivent aucun code et ne rendent aucun test
inatteignable. Ils restent `open` au sens du tableau mais **ne bloquent pas l'implémentation**. Le
`RESIDUES_REMAINING=2` rapporté par l'agent de révision ne compte que ceux-là ; mon décompte est
`9`, parce que `expectCut` et la table de discrimination n'ont pas été validés.