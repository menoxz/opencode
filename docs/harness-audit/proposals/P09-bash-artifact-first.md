# P09 — `bash` : l'artefact de troncature est intègre, sa **décision** ne l'est pas

> Révisé après verdict du 2026-10-04 — A-3 appliqué (shell.ts propriétaire), A-4 satisfait par mesure, hypothèse terminal-output.ts:233 infirmée

Date de révision : 2026-10-04. Le fichier `verdicts/P09-verdict.md` ne porte aucun champ de
date (relecture intégrale : `grep "2026|Date|date"` → une seule occurrence, sans rapport, à la
ligne 293) ; la date retenue est celle des arbitrages opérateur qui clôturent ce dossier,
`REVALIDATION-STATUS.md:117` (« Arbitrages opérateur — décisions du 4 octobre 2026 »).

**Statut : `NOT_IMPLEMENTABLE` — 6 résidus `open`.** Les deux arbitrages sont réglés et la
mesure A-4 est faite, mais cette révision **ne rend pas P09 implémentable**. Le motif est écrit
au §9 : la mesure a **réfuté** l'hypothèse centrale au lieu de la confirmer, et les défauts
réels qu'elle a fait émerger sont au nombre de six, tous `open`.

---

## 1. Problem

La version initiale de cette proposition énonçait : « sur 36 appels qui ont touché ce plafond,
un seul a produit un fichier contenant la sortie complète, les 35 autres ont été coupés en place
sans qu'aucun chemin de récupération ne soit offert au modèle ».

**Cette affirmation est réfutée, à la fois par le code et par la mesure.** Deux chemins
indépendants écrivent un artefact (§3), et la mesure d'exécution en confirme le déclenchement :
pour chaque exécution dont la sortie dépasse `limits.maxBytes`, `shell.ts:598` écrit un fichier
**byte-exact**. Il n'existe pas de « troncature sans fichier » dans cette population.

Le défaut réel est ailleurs, et il est plus grave qu'une absence : **la décision de produire un
artefact est arbitraire**. Elle est prise par la mécanique interne d'un tampon, et non par
l'écart entre ce que le processus a produit et ce que le modèle a reçu. Les quatre conséquences
mesurées :

1. **Un tiers de la sortie peut disparaître sans qu'aucun chemin ne soit offert.** Section B de
   la mesure : un artefact de **35 129 o** existe sur disque pour une présentation de
   **1 148 o** rendue au modèle, et `outputPath` vaut **`null`**. Le contenu intégral est là ;
   le chemin, non. Le modèle ne peut pas `Read`/`Grep` ce qu'il n'a pas de chemin pour atteindre.
2. **L'artefact peut être produit là où aucune perte n'a eu lieu.** `shell.ts:597-599` écrit un
   fichier dès que `tail()` coupe, c'est-à-dire au-delà de `maxLines = 2 000` **ou** de
   `maxBytes = 51 200` : une sortie de 20 006 lignes / 60 000 o reçoit un artefact alors que la
   perte de tête n'a pas eu lieu (spill antérieur) — dans ce cas l'artefact est en outre
   **différent** de celui du chemin de spill.
3. **Le symétrique inverse n'existe pas.** Une sortie sous `maxBytes` ne reçoit jamais de fichier
   de la part de `shell.ts`, alors que c'est précisément la population que la couche aval réduit.
4. **Une commande qui échoue en sortant 0 se voit servir un extrait plus petit** (§6, R5), et le
   pointeur inconditionnel transformerait « sortie tronquée ambiguë » en « sortie tronquée
   annoncée comme réussie ».

## 2. Evidence

### 2.1 Ce que la mesure établit

Source unique, lue par `read` (**C-50** : jamais `glob`), 13 811 o :
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\p09-fidelity-report.md` (233 lignes). Burin
`bun v1.4.2`, shells `pwsh 7.6.6`, exécution réelle (vrai processus enfant, `ShellTool.init()`
puis `bash.execute`), aucun fichier sous `packages/**` modifié, aucun `git`.

| section | site | octets attendus | octets écrits | écart | `identical` | `firstDiffOffset` |
|---|---|---|---|---|---|---|
| A | `shell.ts:598` (via `:604-606`) | 35 129 / 140 129 | **35 129 / 140 129** | **0 / 0** | **true** | **-1** |
| B | `terminal-output.ts:247` | 35 129 | **35 129** | **0** | **true** | — |
| C | `truncate.ts:128` | 35 129 | **35 129** | **0** | **true** | — |

Charges : 5 005 et 20 005 lignes. Non-ASCII (`😀 é 漢 字 ✓`) conservés, **aucun U+FFFD**.
Un seul artefact par exécution, nom dérivé `tool_<ascendant>` conforme. `Truncate.limits()` sur
le vrai service : `{"maxLines":2000,"maxBytes":51200}`.

**Contrôle négatif de la mesure.** `terminalOutput.rawBytes` vaut **1 148** alors que
`outputPath` vaut **`null`** : les octets sur disque (35 129) et les octets rendus (1 148)
divergent d'un facteur 30. L'hypothèse « `:247` écrit un `raw` déjà tronqué » est donc **infirmée**
et non pas confirmée — `raw` est l'intégralité (§2.2). Une confirmation partielle aurait laissé
la proposition debout ; c'est une réfutation, et la proposition est réécrite sur ce fait.

### 2.2 `raw` est l'intégralité de la sortie rendue, pas un extrait

`packages/opencode/src/tool/terminal-output.ts:162` :
```ts
  const raw = input.output
```
`input.output` est la sortie **telle que rendue par `bash`**, c'est-à-dire la présentation
déjà réduite par `shell.ts:601-606`. Il n'est **jamais** tronqué par cette couche : c'est la
sortie d' amont, non un extrait de celle-ci. `:247` écrit donc un fichier plus grand que ce que
le modèle reçoit — ce que la mesure confirme (35 129 o écrits / 1 148 o rendus).

`terminal-output.ts:163-166` — pour `bash`, aucune décodification structurée n'a lieu, donc
`extracted.text === raw` :
```ts
  const normalized = input.tool.replaceAll("__", "_").toLowerCase()
  const decoded = normalized === "bash" ? Option.none() : decode(raw)
```

`terminal-output.ts:238` — le budget d'extrait, 2 000 caractères au cas nominal, 4 000 sinon :
```ts
  const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
```
`terminal-output.ts:7-8` — `MAX_BYTES = 4_000`, `MAX_LINES = 120`. Ces deux constantes sont un
budget de **présentation** ; elles ne bornent pas `trunc.write` (voir §6, R3).

### 2.3 Les quatre chemins d'écriture, et leurs conditions réelles

`packages/opencode/src/tool/shell.ts:517-519` — **spill**, conditionné à la taille de `full` :
```ts
                full += chunk
                if (Buffer.byteLength(full, "utf-8") > limits.maxBytes) {
                  return trunc.write(full).pipe(
```
`shell.ts:524` — le sink existe **déjà** et est ouvert en ajout :
```ts
                        sink = createWriteStream(next, { flags: "a" })
```
`shell.ts:514-515` — une fois `file` posé, les chunks suivants vont au sink :
```ts
              if (file) {
                sink?.write(chunk)
```
`shell.ts:594-599` — **coupe de sortie**, conditionnée à `tail()` :
```ts
      const raw = list.map((item) => item.text).join("")
      const end = tail(raw, limits.maxLines, limits.maxBytes)
      if (end.cut) cut = true
      if (!file && end.cut) {
        file = yield* trunc.write(raw)
```
`shell.ts:604-606` — le marqueur, conditionné à `cut && file` :
```ts
      if (cut && file) {
        output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
      }
```
`terminal-output.ts:246-247` — **aval**, conditionnée à `reduced` :
```ts
  const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
  const outputPath = reduced ? yield* input.store.write(raw) : undefined
```
`truncate.ts:128` — `const file = yield* write(text)`, appelé depuis `truncate.ts:82+` **seulement
si** le texte dépasse les limites résolues (`truncate.ts:93`).

**Conséquence directe, et c'est le cœur du problème** : `shell.ts` n'écrit un artefact que si la
sortie dépasse `maxBytes = 51 200` **ou** `maxLines = 2 000`; `terminal-output.ts:247` n'écrit
rien si la sortie tient sous `limits.maxBytes` et sous `maxLines`, **quelle que soit** la taille
du budget d'extrait. Les deux jeux de bornes sont disjoints, et l'artefact disponible dépend
duquel des deux seuils a été franchi en premier.

### 2.4 Le point d'entrée de la couche aval n'est pas le retour d'`execute`

`shell.ts:611-618` — `execute` renvoie :
```ts
        metadata: {
          output: last || preview(output),
          exit: code,
          description: input.description,
          truncated: cut,
          ...(cut && file ? { outputPath: file } : {}),
        },
```
`processor.ts:581-584` — la couche aval ne reçoit que ce `result` **déjà rendu** :
```ts
              const compact = yield* normalizeTerminalOutput(toolCall.part, rawOutput)
              rawOutput.output = compact.output
              rawOutput.metadata = compact.metadata
```
Un chemin qui n'est pas `cut && file` est donc **lost before arrival** : aucune couche aval ne
peut le reconstruire. C'est le fondement technique de l'arbitrage A-3 (§9).

### 2.5 Le pont vers la troncature générique est déjà protégé, et plus qu'on ne le croyait

`terminal-output.ts:156` appelle `Truncate.savedOutputPath(input.output)` ;
`terminal-output.ts:157-160` compose `references` et **filtre** la valeur dérivée :
```ts
  const references = [...new Set([
    typeof input.metadata.outputPath === "string" ? input.metadata.outputPath : undefined,
    withinTruncationRoot(saved) ? saved : undefined,
  ].filter((value): value is string => value !== undefined))]
```
`tool.ts:188-190` — la troncature générique est court-circuitée pour `bash` :
```ts
          if (result.metadata.truncated !== undefined) {
            return result
          }
```
`truncate.ts:127` — et son propre pont énumère les deux sources :
```ts
      const references = [...new Set([options.outputPath, savedOutputPath(text)].filter((value): value is string => value !== undefined))]
```
Le pont existe donc **des deux côtés**, et il est **filtré** par `withinTruncationRoot`
(`terminal-output.ts:159`) côté aval.

### 2.6 Les quatre seuils, et lequel est lequel

| seuil | valeur | rôle | s'applique à `bash` ? |
|---|---|---|---|
| `truncate.ts:15` `MAX_LINES` | 2 000 | `limits()` → `tail()` | oui |
| `truncate.ts:16` `MAX_BYTES` | 51 200 | `limits()` → `tail()`, `tail()`, seuil du spill | oui |
| `terminal-output.ts:238` `budget` | 2 000 / 4 000 | **présentation** de l'extrait | oui |
| `lean-output-policy.ts:4` `LEAN_TERMINAL_MAX_CHARS` | 4 000 | budget lean | **non** |

`processor.ts:587` est la preuve du « non » :
```ts
            if (!terminal && flags.experimentalLeanOutputBudget && truncate._tag === "Some" && toolCall && outputBudget) {
```
`lean-output-policy.ts:37-39` fait passer `bash` pour terminal :
```ts
export function isLeanTerminalTool(tool: string, input: Record<string, unknown> = {}) {
  const normalized = tool.replaceAll("__", "_").toLowerCase()
  if (normalized === "bash") return true
```
`!terminal` est donc **faux** pour `bash` : le bloc `leanOutputBudget`
(`processor.ts:597-603`) n'est **jamais** écrit pour lui. Toute la table du §4.3 de la version
initiale qui opposait `MAX_BYTES = 50 102` à `LEAN_TERMINAL_MAX_CHARS = 4 000` comparait deux
plafonds qui ne s'appliquent pas au même outil. **Supprimée.**

### 2.7 La perte de tête amont n'existe pas sur le chemin principal

`shell.ts:503-510` — le tampon est purgé par la tête :
```ts
              list.push({ text: chunk, size })
              used += size
              while (used > keep && list.length > 1) {
                const item = list.shift()
                if (!item) break
                used -= item.size
                cut = true
              }
```
`shell.ts:452` — `const keep = limits.maxBytes * 2`, soit 102 400 o de mémoire tampon. Dès que
`file` est posé (§2.3), `full` n'est plus alimenté (`:517` est dans le `else` de `:514`) et
`list` n'est plus purgé **pour aucune raison** : c'est pourquoi la mesure constate des charges de
20 005 lignes (140 129 o) réassemblées **intégralement** en `:594`, en violation de `keep`. Le
purge par la tête ne s'observe que **sous** `maxBytes`, où il n'y a pas de fichier. Il n'est donc
**pas** la cause de la perte constatée — et la version initiale, qui en faisait la cause
structurelle, était doublement fausse sur ce point.

### 2.8 `preview()` borne le confort, pas la preuve

`shell.ts:614` — `output: last || preview(output)`; `shell.ts:512` — `last = preview(last + chunk)`.
`shell.ts:29` — `const MAX_METADATA_LENGTH = 30_000`; `shell.ts:235-237` :
```ts
function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  return "...\n\n" + text.slice(-MAX_METADATA_LENGTH)
}
```
C'est une vue de confort dans `metadata`. La mesure montre que l'exactitude de l'artefact n'en
dépend pas. **Inchangé.**

### 2.9 `collect()` : la contrepartie opposable de A-3

`shell.ts:390-426` définit `collect()`, qui produit le balayage de chemins
(`scan.dirs` / `scan.patterns` / `scan.always`) consommé par la logique de permission. Il **doit**
rester sur le chemin de **chaque** tentative d'exécution, y compris refusée : sinon la garantie
d'A-3 devient vacante et le contournement fermé par P12 se rouvre. `shell.ts:498` (`spawn`) est
le point où la branche d'échec peut court-circuiter cette garantie. Contrainte contraignante,
prescrite au §4.4, vérifiable par le critère S5 (§7).

### 2.10 Dérive texte → chemin : mesurée, et **distincte** de l'hypothèse initiale

`truncate.ts:29-31` :
```ts
export function savedOutputPath(text: string) {
  return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
}
```
Sept sondes réelles (section D de la mesure) : **6/6 extractions non nulles conservent `{{` et
`}}`** — l'extrait n'est donc pas un chemin ; et `{{line1\nline2}}` → `{{line1`, troncature
silencieuse au premier `\n`. Points robustes : CRLF géré, première occurrence gagnante, padding
toléré, `.` en début de ligne accepté, absence de mot-clé → `null`.

**Ce défaut est classé `out_of_scope` (R1)** : il appartient à la troncature générique et n'affecte
pas `bash`, parce que `withinTruncationRoot` (`terminal-output.ts:159`) **rejette** une valeur qui
n'est pas un chemin sous la racine de troncation. Une extraction `{{…}}` est rejetée par ce filtre.
Il n'est donc pas un défaut de `bash`, et il ne doit pas être fusionné avec la perte d'information
au retour (R2) : ce sont deux défauts distincts, mesurés séparément, à ne pas confondre.

### 2.11 Dérive des numéros de ligne depuis le verdict

`terminal-output.ts` est passé de 277 à 289 lignes depuis le verdict. Les citations ont été
re-ancrées par lecture directe. Correspondances : `ERROR` `:28`→**`:30`**, `savedOutputPath`
`:145`→**`:156`**, `raw` `:148`→**`:162`**, `normalized === "bash"` `:150`→**`:163`**, `failed`
`:168-170`→**`:182-184`**, `budget` `:224`→**`:238`**, `reduced` `:232`→**`:246`**, `store.write`
`:233`→**`:247`**, footer `:236`→**`:250`**, `rawBytes` `:260`→**`:274`**, `terminalOutput`
`:264-271`→**`:267-277`**. Inchangés : `shell.ts:604-606`, `shell.ts:617-618`, `tool.ts:188-190`,
`truncate.ts:29-31`, `truncate.ts:127`, `truncate.ts:130`, `processor.ts:581`, `processor.ts:587`.

**Citations de la version initiale retirées, faute de pouvoir être relues** : `shell.ts:452`
comme borne de `keep` a été ré-ancrée (ligne 452 confirmée) ; en revanche la version initiale
cité `ShellTool.run (shell.ts:440)` et `shell.ts:614` pour `metadata.output` sans les relire
systématiquement — `shell.ts:614` est confirmée, `shell.ts:440` n'a pas été relue et **n'est plus
citée** (le §4.2 la remplace par la plage relue `:498-524`).

## 3. Mechanism

Ordre réel d'un appel `bash`, une fois les seuils corrigés. `s` = sortie du processus en octets ;
`p` = octets rendus au modèle.

1. `shell.ts:498` — `spawn` via `retryTransientLaunch`. `:501` — lecture du flux par chunks.
2. `:503-510` — `list` accumule ; purge par la tête au-delà de `keep = 102 400` (§2.7). `cut = true`.
   **Tant que `file` est absent, ce qui part dans `list` est perdu de façon définitive dès que le
   tampon déborde** — c'est le seul endroit où l'invariant peut être violé en amont.
3. `:512` — `last = preview(last + chunk)`, confort seulement.
4. `:514-515` — si `file`, le chunk va au sink. Sinon `:517` `full += chunk`, et `:518-519`
   déclenche le spill si `full > maxBytes`.
5. `:578-581` — vidange du consommateur, 200 ms de grâce.
6. `:594` — `raw` reassemblé depuis `list`.
7. `:595-599` — `tail(raw, maxLines, maxBytes)`; si `end.cut` et pas de `file`, **écriture d'un
   second artefact**, potentiellement différent du premier (§6, R7).
8. `:601-606` — présentation ; marqueur si `cut && file`.
9. `:617-618` — `truncated: cut`, `outputPath` si `cut && file`.
10. `processor.ts:581-584` → `terminal-output.ts:238` — budget d'extrait 2 000 / 4 000.
11. `terminal-output.ts:246-247` — `reduced` vrai → **écriture d'un second artefact**, de la sortie
    amont intégrale ; `outputPath` local.
12. `:250` — `Received output saved to: <chemin>` dans le texte, **jamais** dans les métadonnées
    lorsque `reduced` est faux.

**Défaut structurel, reformulé** : non pas « la donnée est perdue avant écriture » (infirmé,
§2.1/§2.7), mais **« la présence d'un artefact est décidée par deux mécanismes de seuil
disjoints, dont aucun ne correspond à l'écart entre `s` et `p` »**. Résultat mesuré : `s = 35 129`,
`p = 1 148`, `outputPath = null`. Le modèle reçoit 3 % de la sortie et n'a aucun chemin.

## 4. Proposal

### 4.1 Périmètre

| Défaut | Fichier | Propriétaire | Dans P09 |
|---|---|---|---|
| Présence d'un artefact décidée par seuil, pas par l'écart `s`/`p` | `shell.ts:517-519`, `shell.ts:597-599`, `terminal-output.ts:246-247` | outillage `bash` | **oui** — cœur du correctif |
| Double écriture, artefacts potentiellement divergents | `shell.ts:598` + `terminal-output.ts:247` | outillage `bash` | **oui** |
| Artefact non borné par fichier | `truncate.ts:68-73` | troncature générique | **non** → P17, mais **bloquant** (R3) |
| Dérive texte → chemin (`{{`/`}}`, coupe au `\n`) | `truncate.ts:29-31`, `terminal-output.ts:159` | troncature générique | **non** → P16, `out_of_scope` (R1) |
| `exit === 0` avec marqueur d'erreur non détecté | `terminal-output.ts:30`, `:182-184`, `:238` | couche terminale | **oui** — §6 R5, §4.2 étape 3 |
| Court-circuit de la troncature générique | `tool.ts:188-190` | troncature générique | **non** → P17 (tranché, §9) |
| `preview()` borne le confort | `shell.ts:29`, `:235-237` | outillage `bash` | **non** → P14 |

### 4.2 Correctif : la règle d'écriture, pas un nouvel emplacement d'écriture

Invariant (inchangé quant au fond, **réécrit quant à la condition**) :

> **Si le nombre d'octets rendus au modèle est strictement inférieur au nombre d'octets produits
> par le processus, alors un chemin vers l'artefact intégral est présent dans `metadata`, et
> exactement un artefact a été écrit.**

La condition passe de « un seuil de tampon a été franchi » à « une perte a eu lieu ». C'est la
seule chose que la mesure établisse comme défaillante.

**Étape 1 — `shell.ts` : ne plus écrire sur un seuil, écrire sur une perte.**

`trunc.write` devient le chemin par défaut, appelé au premier chunk, le sink existant étant déjà
ouvert en ajout à `:524` — il suffit de l'ouvrir au premier chunk au lieu d'attendre le dépassement
de `maxBytes` :
```ts
              if (!file) {
                file = yield* trunc.write("")
                cut = true
                sink = createWriteStream(file, { flags: "w" })
              }
              sink?.write(chunk)
```
Puis `:517-519` (spill conditionnel) devient **inutile** et `:597-599` devient :
```ts
      if (!file && end.cut) {
        file = yield* trunc.write(raw)
      }
```
inchangé — il ne couvre plus que le cas où le flux n'a produit aucun chunk.

**Coût assumé et chiffré** : un fichier par appel `bash`, y compris pour une sortie d'un octet.
Le gain en nombre de fichiers est inconnu (§6, R6) et le coût I/O est certain. **Cette étape est
suspendue à R6** : tant que la distribution des tailles n'est pas mesurée, l'écriture inconditionnelle
est un pari, et l'invariant doit être amorcé par `metadata.outputPath` déjà présente
(étape 2) avant de l'être par le disque.

**Étape 2 — `terminal-output.ts` : l'aval ne réécrit plus, il propage.**

```ts
  // terminal-output.ts:246-247 — après
  const upstream = typeof input.metadata.outputPath === "string" ? input.metadata.outputPath : undefined
  const outputPath = upstream ?? (reduced ? yield* input.store.write(raw) : undefined)
```
Effet mesurable : exactement **un** artefact par exécution, et `outputPath` présent dans
`metadata` pour toute perte. `metadata` est déjà propagé par `processor.ts:583`
(`rawOutput.metadata = compact.metadata`), donc la correction est **réellement atteignable** — le
signal de terrain devient `metadata.outputPath`, pas `metadata.leanOutputBudget.outputPath`, qui
n'est jamais écrit pour `bash` (`processor.ts:587`, `lean-output-policy.ts:39`).

**Étape 3 — l'extrait doit porter l'échec, pas seulement le chemin.**

`terminal-output.ts:238` devient :
```ts
  const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
  const effectiveFailed = failed || ERROR.test(useful)
```
et `:233` (en-tête) porte `"; failed"` sur `effectiveFailed`. Un `exit === 0` dont la sortie
contient `no tests found` — qui ne matche pas `ERROR` (`terminal-output.ts:30`) — cesse ainsi
d'être traité comme un succès : il est soit élargi, soit signalé.

**Périmètre strict.** L'étape 2 est restreinte à `normalized === "bash"`
(`terminal-output.ts:163`), ou alors la non-régression doit être étendue à tous les outils
terminaux listés par `lean-output-policy.ts:40-43` (`execute|read|stream_read`, `command_stream`,
`command_status`). Retenu : **restreint à `bash`**, la non-régression des autres outils
terminaux n'étant pas couverte par `test/shell/shell.test.ts`.

### 4.3 Ce qui reste volontairement inchangé

- **`preview()` et `MAX_METADATA_LENGTH`** (`shell.ts:29`, `:235-237`, `:614`). Mesuré : sans
  effet sur l'exactitude de l'artefact (§2.8). Traitement de P14.
- **Les plafonds `2 000` / `4 000`** (`terminal-output.ts:238`, `:7-8`). Ils changent de statut :
  budget d'**extrait**. Aucun test ne casse par construction.
- **`LEAN_TERMINAL_MAX_CHARS = 4 000`** (`lean-output-policy.ts:4`) et la garde `!terminal`
  (`processor.ts:587`) : inchangés.
- **`truncate.ts` n'est pas modifié.** Raison tenue : la correction de la règle d'écriture et de
  la borne par fichier relèvent de deux étages différents, et les mélanger rendrait le patch
  invérifiable. Mais cette non-modification **rend R3 bloquant** (§9) : `truncate.ts:68-73` est
  le seul endroit où une borne par fichier peut être posée.
- **`tool.ts:188-190` n'est pas rouvert.** Arbitrage §9.

### 4.4 La garantie `collect()` — opposable, non négociable

Conséquence directe d'A-3, et condition de validité de l'ensemble : `collect()`
(`shell.ts:390-426`) doit rester sur le chemin de **chaque** tentative d'exécution, y compris
celles qui n'atteignent pas `spawn` (`shell.ts:498`). Toute forme de court-circuit de
lestablishment de `scan` en amont de `spawn` rend la garantie d'A-3 vacante et rouvre le
contournement que P12 ferme. Présenté ici comme **contrainte d'implémentation**, vérifiée par le
critère S5 (§7), non comme un risque de régression parmi d'autres.

### 4.5 Séquence

`shell.ts` est touché par **P09, P12, P13, P14, P18** (`REVALIDATION-STATUS.md:77`) : la vague 4
doit y être **séquentielle**. P09 est **bloquée** par R2, R3, R4, R5, R6, R7 (§9) ; rien n'est
implémentable avant leur levée.

## 5. Alternatives considered

**A. Élever le plafond de présentation.** Rejeté. Cela déplace le seuil au-delà duquel le
comportement redevient destructif sans supprimer un seul appel perdu, et n'adresse aucun des six
résidus.

**B. Écrire un artefact de plus, sans changer la règle d'écriture.** Rejeté : c'est l'état actuel
en plus du bruit. Deux artefacts par exécution au-delà de `maxBytes`, et toujours aucun chemin
pour la bande 2 000 – 51 200 o, qui est précisément la population massivement touchée.

**C. Écrire l'artefact dans `terminal-output.ts` uniquement.** Rejeté, et c'est désormais un fait
mesuré plutôt qu'une intuition : A-3 tranche pour `shell.ts`, et la raison tient — l'aval ne
voit que la sortie déjà rendue (`shell.ts:611-618` → `processor.ts:581-584`), l'information
manquante est perdue avant arrivée. Le valideur P12 est arrivé indépendamment à la même
conclusion, avec son motif propre : `terminal-output.ts:238` calcule un budget depuis `useful`
déjà réduit et `:240-245` appelle `preview` ; y confier la garantie serait **non implémentable**.

**D. Rendre l'artefact inconditionnel pour tout appel `bash` sans borne.** Rejeté : c'est
l'étape 1 de §4.2 **sans** sa contrepartie de coût. Un fichier par appel, sans borne de taille
(R3 mesuré), pour un gain en nombre de tours non mesuré (R6). Le gain est réel en principe —
l'extrait perdu devient adressable sans entrer dans le contexte — mais il n'est pas chiffré, et
la version initiale l'annonçait à partir d'une statistique réfutée.

**E. Borner la taille de l'artefact dans `shell.ts` avant écriture.** Rejeté : `trunc.write`
(`truncate.ts:68-73`) est le point d'écriture et il n'applique aucune borne ; borner chez
l'appelant laisse la borne contournable par `truncate.ts:128`. C'est P17, et c'est pourquoi R3 est
`open` et bloque.

**F. Supprimer `tool.ts:188-190`.** Rejeté pour P09 : ce court-circuit protège la troncature
générique, et `P17` est elle-même bloquée par C-60. Le maintien de cette porte est acté au §9.

**G. Traiter la dérive texte → chemin dans P09.** Rejeté et **mesuré** : `withinTruncationRoot`
(`terminal-output.ts:159`) rejette les extractions `{{…}}`, donc le défaut n'affecte pas `bash`.
C'est le P16 d'origine, désormais `out_of_scope` (R1). Le traiter ici mélangerait deux étages et
introduirait dans P09 une dépendance à P16, alors que C-60 signale précisément une collision de
fichiers entre les deux.

**H. Attendre la distribution de tailles avant tout correctif.** **Retenu**, et c'est la seule
alternative qui est devenue la conclusion de cette révision : elle est l'élément bloquant R6.

## 6. Risks

**R5 — `exit === 0` avec sortie en erreur, non traité (inchangé depuis le verdict).**
`terminal-output.ts:30` :
```ts
const ERROR = /\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i
```
`terminal-output.ts:182-184` :
```ts
  const failed =
    [...hostExits, ...reportedExits].some((value) => value !== 0) ||
    [host, extracted.controls].some((value) => value.isError === true || value.success === false || /^(failed|error)$/i.test(String(value.status)))
```
`terminal-output.ts:238` : `budget` dépend de `failed`. `failed` dépend du code de sortie. Le
budget double quand aucun signal d'échec n'est détecté dans le texte utile — donc quand
`ERROR.test(useful)` échoue. `E   no tests found` ne matche pas `error`. Le modèle reçoit alors
2 000 caractères et `exit=0` dans l'en-tête (`:233`), et sa décision est prise avant la ligne qui
dit que rien ne fonctionne. **Le correctif l'aggrave** si le pointeur devient inconditionnel :
il substitue au texte d'erreur manquant une affirmation de succès (`Full output saved to:`) que
rien ne qualifie. Traitement : §4.2 étape 3.

**R3 — Artefact non borné par fichier : `P09-UNBOUNDED-ARTIFACT-SIZE`.** **Confirmé par la
mesure.** `truncate.ts:68-73` :
```ts
    const write = Effect.fn("Truncate.write")(function* (text: string) {
      const file = path.join(TRUNCATION_DIR, ToolID.ascending())
      yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
      yield* fs.writeFileString(file, text).pipe(Effect.orDie)
      return file
    })
```
Aucun paramètre de taille. La mesure a écrit **140 129 o / 20 005 lignes** sans plafond, avec
`Truncate.limits()` = `{"maxLines":2000,"maxBytes":51200}`. Un appel qui produit 1 Go écrira 1 Go
dans `TRUNCATION_DIR` (`truncate-dir.ts:4`, `Global.Path.data`/`tool-output`), et la rétention à
7 jours (`truncate.ts:13`, purge `:60-65`) n'a pas été mesurée sous ce volume. **Bloquant.**

**R7 — Double écriture, artefacts divergents.** Une exécution au-delà de `maxBytes` écrit deux
fichiers : `shell.ts:519` puis `terminal-output.ts:247`. Ils ne sont pas identiques quand la purge
par la tête (`:503-510`) a joué avant le spill. Le modèle peut donc recevoir deux chemins
différents pour la même sortie, sans indication de lequel est complet. **Bloquant.**

**R4 — Le chemin amont se perd avant arrivée.** `shell.ts:611-618` ne pose `outputPath` que si
`cut && file`; `processor.ts:581-584` ne reçoit que ce `result`. Toute sortie qui n'a pas Satisfait
un seuil de `shell.ts` n'a **aucun** chemin, quel que soit le nombre de couches ajoutées en aval.
C'est l'argument de fond d'A-3, et il interdit de traiter ce défaut en aval.

**R1 — Dérive texte → chemin.** Mesuré : 6/6 conservent `{{`/`}}`, troncature silencieuse au `\n`
(§2.10). **Maîtrisé pour `bash`** par `withinTruncationRoot` (`terminal-output.ts:159`).
`out_of_scope` pour P09, owned by P16.

**R6 — Coût I/O et volume, non chiffrés.** L'étape 1 écrit un fichier par appel. La session
auditée de la version initiale annonçait 445 appels `bash` pour 672 535 caractères, moyenne
1 511 caractères ; **cette moyenne est inférieure au budget d'extrait de 2 000 caractères**, donc
une fraction minoritaire seulement franchit 2 000. **La distribution n'a jamais été mesurée** :
combien d'appels au-dessus de 2 000 caractères, combien au-dessus de 51 200 o. L'exigence de
distribution du verdict (Required change 8) **n'est pas satisfaite**, et c'est le motif principal
du statut `NOT_IMPLEMENTABLE`. **Bloquant.**

**R10 — Régression sur les assertions existantes.** `truncate.ts:130` émet
`Upstream reference (unverified; not opened): ${JSON.stringify(reference)}`. Cette mention doit
être **conservée** pour tout chemin émis : le contenu d'un fichier sur disque n'est pas sanitisé,
et un artefact contenant des instructions deviendrait une surface d'instruction directe. Risque
**accepté** (R10) avec mitigation existante, à condition que le correctif n'y touche pas.
`test/shell/shell.test.ts` (12 pass / 0 fail) est la porte ; `test/tool/shell.test.ts` est
**exclu** de toute porte (instable : 63/32/1 puis 62/33/4).

**Collision d'édition (hors table des résidus).** `shell.ts` est partagé avec P12, P13, P14, P18 ; vague 4
obligatoirement séquentielle sur ce fichier (`REVALIDATION-STATUS.md:77`).

## 7. Tests

Base de non-régression : `bun test test/shell/shell.test.ts` — **mesurée à la révision**,
`packages/opencode` : `bun test v1.4.2`, **`12 pass` / `0 fail`**, 26 `expect()` calls,
`Ran 12 tests across 1 file [4.70s]`, **exit 0**. Verte et stable ; porte unique.
`test/tool/shell.test.ts` **n'est jamais une porte** (instable : 63/32/1 puis 62/33/4).

Critère de succès décisif, **conçu pour échouer avant et passer après** :

> **S1.** `bash` exécutant une charge déterministe de **35 129 o** (5 005 lignes, sous
> `maxBytes`, au-dessus du budget d'extrait) : `metadata.outputPath` doit être une `string`
> pointant un fichier dont `Buffer.byteLength` vaut **35 129**, et `metadata.terminalOutput.rawBytes`
> doit valoir **35 129** — donc aucun octet perdu sans chemin.
> **Avant :** `outputPath === null` et `rawBytes === 1 148` → **échoue**. La section B de la
> mesure fournit les deux valeurs exactes.
> **Après :** `outputPath` renseigné par l'amont (`shell.ts:618`) et `rawBytes` à 35 129 →
> **passe**.

**S2 — sortie entre 2 000 et 51 200 o.** Même charge, plus une de 8 000 o : `outputPath` doit être
une `string` dans les deux cas. **Avant :** échec sur les deux. **Après :** passe. C'est le test qui
distingue « un fichier existe parfois » de « la règle d'écriture est respectée ».

**S3 — un seul artefact.** Diff des noms de `TRUNCATION_DIR` avant/après une charge de 140 129 o :
exactement **1** fichier. **Avant :** 2 (`shell.ts:519` puis `terminal-output.ts:247`) → échec.
**Après :** 1. Ce test est aussi la preuve du non-double-écriture (R3).

**S4 — `exit === 0` avec marqueur d'erreur.** Commande exiting 0 et imprimant `no tests found` :
le rendu doit porter l'indicateur d'échec. **Avant :** échec (`terminal-output.ts:238` +
`:233` ne le produisent pas). **Après :** passe. C'est le test de R-1.

**S5 — `collect()` sur chaque tentative.** Une tentative refusée avant `spawn` doit laisser le
balayage de `shell.ts:390-426` constitué. **Avant :** non couvert. **Après :** passe. Porte de
la contrepartie opposable d'A-3 (§4.4).

**S6 — borne par artefact.** Écrire une charge de 140 129 o ne doit pas produire un fichier de
140 129 o si une borne est posée. **Avant :** échec (`truncate.ts:68-73` n'en applique aucune).
**Après :** passe. **Ce test ne peut pas passer tant que R3 est `open`**, et R3 vit dans
`truncate.ts`, que P09 ne modifie pas. Il est donc la mesure de la dépendance de P09 à P17.

**S7 — fidélité d'octets (non-régression de la mesure).** Reprendre le protocole de la section A
du rapport : charge de 35 129 et 140 129 o, comparaison octet à octet, `identical === true`,
`firstDiffOffset === -1`, aucun U+FFFD, non-ASCII conservé. Ce test **passe déjà aujourd'hui** ;
il ne prouve pas le correctif, il interdit sa régression. Ne pas le compter comme critère de
succès du correctif.

Commande, depuis `packages/opencode` :
```
bun test test/shell/shell-artifact-consistency.test.ts
bun test test/shell/shell.test.ts
```
Exit code 0, `0 fail`, sur les deux. Le second est la non-régression, il ne se dégrade pas.

## 8. Effort

**S** — un seul fichier de production modifié (`shell.ts`, étapes 1 et 2 de §4.2 hors
`terminal-output.ts` qui relève de la couche terminale), plus 6 tests dans
`test/shell/`. L'ancienne estimation **M** était fondée sur deux fichiers et la réécriture du
cycle de vie du flux ; l'infirmation de l'hypothèse centrale retire le travail sur
`terminal-output.ts:247` (l'artefact y est déjà intègre) mais **ajoute** la borne par fichier, qui
vit dans P17. Le rayon réel de P09 se réduit ; le coût total ne baisse pas, parce que le
bloquant principal (R6) est une **mesure**, pas du code.

## 9. Verdict self-assessment

**`NOT_IMPLEMENTABLE`** — six résidus `open` bloquants (R2, R3, R4, R5, R6, R7). Un `open`
interdit l'implémentation ; il y en a six.

### Arbitrages : appliqués

- **A-3 — propriétaire de l'invariant « la sortie complète existe sur disque » = `shell.ts`.**
  Tranché par **double source indépendante** (**C-39**) : la décision de l'opérateur, et le
  validateur P12, dont le motif propre est que `terminal-output.ts:238` calcule un budget depuis
  `useful` déjà réduit et `:240-245` appelle `preview` — l'y confier serait non implémentable,
  l'information étant perdue avant arrivée. Appliqué au §4.2 (étape 1) et **opposable** au §4.4 :
  `collect()` (`shell.ts:390-426`) doit rester sur le chemin de chaque tentative, sinon la
  garantie devient vacante et le contournement fermé par P12 se rouvre. **Contrepartie inscrite au
  texte et vérifiée par S5.**
- **A-4 — satisfait par mesure.** `p09-fidelity-report.md`, 13 811 o, `bun` 1.4.2, exit 0.
  `shell.ts:604` : 35 129/35 129 et 140 129/140 129, écart **0/0**, `identical=true`,
  `firstDiffOffset=-1`, non-ASCII conservés, aucun U+FFFD. `P09-RESIDUAL-ARTIFACT-FIDELITY` →
  `clos` (**C-43**).
- **Question d'architecture laissée ouverte par la version initiale : tranchée.** Option (a) —
  `shell.ts` écrit toujours l'artefact, `tool.ts:188-190` est maintenu fermé, et P17 traite la
  borne et le plafond séparément. C'est la seule option cohérente avec §4.2, et elle **n'ouvre
  pas** P17 : le renvoi de `truncate.ts` à P17 était la condition que la version initiale posait
  sans la remplir. « `truncate.ts` n'est pas modifié » et « `tool.ts:188-190` reste fermé » sont
  compatibles.

### Hypothèse centrale : réfutée, et la proposition réécrite dessus

La version initiale bâtissait ses §1, §2, §6 et §7 sur « 36 troncatures → 1 seul artefact », et
reconnaissait au §9 que le lien de causalité n'était pas mesuré. **La mesure a tranché dans le
sens opposé** : l'artefact est byte-exact, il en existe un par exécution, et le fichier de
`terminal-output.ts` est **intégral** (35 129 o), pas un `raw` amputé. La proposition n'est donc pas
« corrigée sur une statistique fausse » : elle est **réécrite sur un fait mesuré**, et le défaut
retenu est un autre défaut — arbitraire de la règle d'écriture, avec `outputPath = null` pour
1 148 o rendus sur 35 129 o produits.

### Traçabilité des `Required change` du verdict

| # | Exigence | Où appliquée | État |
|---|---|---|---|
| 1 | Corriger les citations fausses (`truncate.ts:225`→`:130`, `TRUNCATION_DIR`, ne pas opposer `maxBytes` à `LEAN_TERMINAL_MAX_CHARS`) | §2.6, §2.11 | **fait** |
| 2 | Remplacer « 36/1 » par une mesure ; reformuler en « artefact incomplet » ; gain conditionné | §1, §2.1, §2.3 | **fait** — et **réformulé plus loin** : la mesure n'a pas trouvé un artefact incomplet, elle a trouvé un artefact intègre dont la *présence* est arbitraire |
| 3 | Traiter `exit === 0` avec sortie en erreur ; le pointeur doit porter l'échec | §6 R-1, §4.2 étape 3, test S4 | **fait** (résidu **ouvert** : non implémenté) |
| 4 | Rendre l'étape 1 implémentable (`fs.readFileString` n'existe pas) | §4.2 étape 1 | **fait** — plus de relecture : `fs.readFileString` est **retiré**, `shell.ts:598` écrit déjà `raw` ; `AppFileSystem` n'expose que `readFileStringSafe` (`packages/core/src/filesystem.ts:28`), l'accumulation en mémoire suffit |
| 5 | Restreindre l'étape 2 à `normalized === "bash"` ou étendre la non-régression | §4.2 étape 2, retenue restreinte à `bash` (`terminal-output.ts:163`) | **fait** |
| 6 | Remplacer le signal de terrain `leanOutputBudget.outputPath` (jamais écrit pour `bash`) | §4.2 étape 2, §7 S1-S3 : `metadata.outputPath` + `terminalOutput.rawBytes` (`:274`) | **fait** |
| 7 | Trancher la réouverture de `tool.ts:188-190` | §9, §5 F, §4.3 | **fait** — fermée, P17 reste refermée |
| 8 | Fournir la distribution des tailles `bash`, ou conditionner l'écriture à un seuil, et amender l'invariant | §4.2 (invariant réécrit), §6 R-6 | **partiellement fait** — l'invariant est réécrit (condition de perte, pas de seuil) ; **la distribution n'est pas fournie** → **R6 ouvert, bloquant** |

### Résidus, classés

| id | résidu | statut | bloquant ? |
|---|---|---|---|
| R1 | Dérive texte → chemin (`truncate.ts:29-31`) | **`out_of_scope`** — troncature générique, P16 ; sans effet sur `bash` (`withinTruncationRoot`, `terminal-output.ts:159`) | non |
| R2 | Perte d'information au retour (35 129 o / 1 148 o, `outputPath = null`) — **distincte de R1** | **`open`** | **oui** |
| R3 | `P09-UNBOUNDED-ARTIFACT-SIZE` — `truncate.ts:68-73` sans borne | **`open`** | **oui** |
| R4 | Le chemin amont se perd avant arrivée (`shell.ts:611-618` → `processor.ts:581`) | **`open`** | **oui** |
| R5 | `exit === 0` avec marqueur d'erreur non détecté | **`open`** | **oui** |
| R6 | Distribution des tailles non mesurée → coût/gain de l'écriture inconditionnelle | **`open`** | **oui** |
| R7 | Double écriture, artefacts potentiellement divergents | **`open`** | **oui** |
| R8 | `P09-OWNERSHIP-INVARIANT` — propriétaire de l'invariant | **`out_of_scope`** — tranché A-3 (**C-39**), `clos` | non |
| R9 | `P09-RESIDUAL-ARTIFACT-FIDELITY` — fidélité de l'artefact | **`out_of_scope`** — satisfait par mesure (**C-43**), `clos` | non |
| R10 | Injection via l'artefact (`truncate.ts:130`) | **`accepted`** — risque consigné, mitigation existante à préserver ; ne traite pas le résidu | non |
| R11 | `collect()` hors chemin d'une tentative | **`accepted`** — retenu comme contrainte opposable d'A-3, prescrite §4.4, vérifiée par S5 | non |
| R12 | P09 jamais revalidée (`C-61`) | **`out_of_scope`** — la revalidation suit la révision, pas l'inverse | non |
| R13 | Provenance de la source de mesure | **`out_of_scope`** — existence établie par `read`, jamais par `glob` (**C-50**) | non |

### Résiduel de cette révision, déclaré

Le fichier verdict ne porte aucune date : le bandeau cite `2026-10-04`, date des arbitrages
opérateur (`REVALIDATION-STATUS.md:117`), et non celle du verdict, qui est inconnue. Ce
remplacement est **signalé dans le texte** plutôt que passé sous silence.

---

## Points non mesurés

Consignés, non masqués. **7 points `NON MESURÉS`** du rapport de mesure :

| # | point | statut |
|---|---|---|
| 1 | `terminal-output.ts:156` comme **site d'appel distinct** de la regex | `NON MESURÉ` — la section D mesure le helper partagé `savedOutputPath` (`truncate.ts:29-31`) ; le fait que `:156` appelle ce même helper n'a pas été isolé par une exécution dédiée |
| 2 | `MAX_BYTES = 4 000` / `MAX_LINES = 120` (`terminal-output.ts:7-8`, `lean-output-policy.ts:3-5`) mesurés **directement** sur ces constantes | `NON MESURÉ comme constante` ; effet observé indirectement (35 129 → 1 148 rendus, section B) |
| 3 | `shell.ts:517-519` : fidélité de `last` cumulé pendant le streaming | `NON MESURÉ` — le flux est exercé (5 005 / 20 005 lignes) mais la valeur intermédiaire `last` n'est pas instrumentée ; l'intégrité finale est mesurée, pas la boucle de preview |
| 4 | Charge > 51 200 o **et** > 2 000 lignes combinées avec sortie multi-octets coupée en bordure d'octet | `PARTIELLEMENT MESURÉ` — `large` (140 129 o) couvre le dépassement des deux plafonds ; aucun cas de coupure UTF-8 en frontière de chunk n'a été injecté |
| 5 | Comportement multi-appels concurrents sur `TRUNCATION_DIR` | `NON MESURÉ` — exécutions séquentielles uniquement |
| 6 | Comportement quand `TRUNCATION_DIR` est absent ou non inscriptible | `NON MESURÉ` |
| 7 | Chemin de retour `bash` (POSIX) alors que la mesure est sous pwsh | `NON MESURÉ` — l'artefact est écrit par le même code quel que soit l'OS, non revalidé sous bash |

**6 échecs d'outillage Bun** avant de pouvoir exécuter le code du dépôt depuis le répertoire
temporaire. Aucun n'a été corrigé dans le dépôt ; consignés parce qu'ils expliquent la méthode de
reproduction, pas parce qu'ils sont sans portée pour le défaut :

| essai | stratégie | exit | erreur exacte |
|---|---|---|---|
| probe-a | `import "effect"` nu | 1 | `Cannot find package 'effect' from ...\probe-a.ts` |
| probe-b | `C:/...` absolu | 1 | `Cannot find module 'C:/...' ` |
| probe-c | alias `@/` + preload plugin | 1 | `ENOENT reading ...node_modules\C:\...\probe-c.ts` |
| probe-d | `C:\...` absolu | 1 | `Cannot find module 'C:\...\effect' ` |
| probe-e | relatif `../../../..` | 1 | `Cannot find module '../../..\..\...\effect' ` |
| copie physique | `node_modules\effect` copié | -1073741819 | `STATUS_ACCESS_VIOLATION` (crash Bun) |

Cause racine : Bun résout les spécificateurs nus depuis le répertoire du fichier d'entrée et ne
traverse pas un `node_modules` lui-même junctionné ; un répertoire `node_modules` réel contenant
des **junctions par paquet** fonctionne. Voie retenue, exit **0**. Aucune correction apportée au
dépôt.

**Baseline de non-régression mesurée à cette révision** — `bun test test/shell/shell.test.ts`
depuis `packages/opencode` : `bun test v1.4.2`, **12 pass / 0 fail**, 26 `expect()` calls,
`Ran 12 tests across 1 file [4.70s]`, **exit 0**.
`bun test test/tool/truncation.test.ts` et `bun test test/tool/terminal-output.test.ts` (le
rapport de mesure) : **19 pass / 0 fail** et **14 pass / 0 fail**, exit 0, aucun échec préexistant.

**Note de sonde, pas de défaut** : `containsLastLine: false` dans les comparaisons vient d'une
formule off-by-one du script de mesure (il testait `L05001`, inexistant dans une charge de 5 005
lignes). Sans portée : `identical: true` et `containsEndMarker: true` prouvent que la dernière
ligne est là. Signalé plutôt que masqué.

**Point non mesuré propre à cette révision** : la distribution des tailles de sortie `bash`
(appels au-dessus de 2 000 caractères, au-dessus de 51 200 o) reste inconnue. C'est R6, et c'est
le motif du statut `NOT_IMPLEMENTABLE`.

**Hygiène du document** : la version initiale contenait des artefacts lexicaux corrompus et des
fragments CJK insérés dans le texte français, dus à une génération antérieure ; le texte est
réécrit. `truncate.ts:130` a été relue directement (`Upstream reference (unverified; not
opened)`), ainsi que `Truncate.limits()` (`truncate.ts:44`).