# P09 — `bash` : la perte est réelle, la règle d'écriture est fausse, et elle est fausse ailleurs

> Version 2, écrite après `verdicts/P09-revalidation.md` (**`REVALIDATED-PASS_WITH_CHANGES`**,
> non implémentable). Les deux blocages `#3` et `#8` sont corrigés ici. Les sept objections
> **N-1 … N-7** du revalidateur sont conservées. Une campagne de ré-ancrage a réécrit les
> citations `shell.ts` / `truncate.ts` / `processor.ts`, qui étaient fausses dans la version 1.

**Statut : `NOT_IMPLEMENTABLE` — 15 résidus `open`, dont R6 pour lequel la version 1
revendiquait une exigence satisfaite sans rien fournir.** La version 2 retire cette revendication
(§7) et n'ajoute aucun `open` : `R10` passe `accepted` → `open`, `R11` passe `accepted` → `open`.

**Corrections apportées depuis la version 1, toutes vérifiées par relecture directe :**

1. **§6 R4 est faux et a été retiré** (finding N-4 du revalidateur, rectifié). `metadata.outputPath`
   n'est pas perdu avant arrivée : il est **écrasé** en aval, `session/processor.ts:583` puis
   `terminal-output.ts:263-265`.
2. **§6 R5 / §4.2 étape 3 : le correctif était inopérant** (finding N-3). Une construction réelle de
   `failed: boolean` est donnée en §5.2, avec les citations qui la rendent exécutable.
3. **§4.2 « Périmètre strict » était déclaratif sans garde dans le patch** (finding N-5). La garde
   est maintenant écrite dans le patch proposé, §5.4.
4. **`Truncate.limits()` était citée à `truncate.ts:44`**, qui est la déclaration d'interface. L'implémentation
   est `truncate.ts:75-83`. Corrigé partout (§2.7).
5. **Toutes les citations `shell.ts` de la version 1 étaient périmées d'environ 88 lignes.** Le
   fichier fait 762 lignes ; `shell.ts:452` ne contient pas `const keep`. Carte de ré-ancrage
   complète en §2.12.
6. **R6 : la version 1 disait « partiellement fait ». C'était faux** — l'invariant était réécrit,
   la distribution n'était pas fournie. **La revendication est retirée** (§7, ligne 8).

---

## 1. Problem

`bash` perd de la sortie. La perte est **préexistante**, elle est **mesurée**, et elle est
aujourd'hui **partiellement masquée** — jamais réparée.

Ce que la mesure établit, et qui n'est pas contesté :

- pour une charge de 35 129 o, le modèle reçoit 1 148 o ; le contenu intégral est sur disque ;
- `metadata.outputPath` vaut `null` sur cette charge ;
- `metadata.terminalOutput.rawBytes` vaut 1 148.

Ce que le revalidateur a ajouté, et qui change le diagnostic : les deux artefacts ne sont pas
« parfois divergents », ils sont divergents **pour toute sortie au-delà de 102 400 o**, parce que le
purge par la tête de `shell.ts` est inconditionnel (§2.6). Et la bande « `bash` sans chemin amont »,
à laquelle appartiennent les charges de 2 000 à 51 200 o, reçoit aujourd'hui un **second** artefact
écrit depuis `raw` (§5.4).

Le formulation de la version 1 — « la présence d'un artefact est décidée par deux seuils disjoints »
— est **retirée** : elle est mathématiquement fausse (§2.8, finding N-1). Le défaut retenu est le
défaut qu'A-3 nomme déjà : **le chemin amont peut ne jamais exister**. C'est un défaut de
propagation, pas de seuil.

---

## 2. Evidence

Toutes les citations de cette section ont été relues par moi pendant cette révision, par `read` ou
`grep` (**C-50** : jamais `glob` pour établir un contenu). Le gabarit de la version 1 est conservé :
§2.1 (la mesure), §2.2 à §2.8 (les chemins d'écriture et les bornes), §2.9 (`collect()`), §2.10
(dérive texte → chemin), §2.11 (dérive des numéros de ligne), et §2.12 (nouveau : carte de ré-ancrage).

### 2.1 Ce que la mesure établit

Source unique : `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p09-fidelity-report.md`
(233 lignes, 13 811 o), relue par `read`. Burin `bun v1.4.2`, shells `pwsh 7.6.6`, exécution réelle.

| section | site | octets attendus | octets écrits | écart | `identical` | `firstDiffOffset` |
|---|---|---|---|---|---|---|
| A | `shell.ts:686` | 35 129 / 140 129 | **35 129 / 140 129** | **0 / 0** | **true** | **-1** |
| B | `terminal-output.ts:247` | 35 129 | **35 129** | **0** | **true** | — |
| C | `truncate.ts:128` | 35 129 | **35 129** | **0** | **true** | — |

**Rectification de la version 1.** Le tableau ci-dessus **conserve les valeurs du rapport** mais
**corrige ses ancres de site** : la version 1 écrivait `shell.ts:598`, qui est aujourd'hui
`window.push(chunk)`. L'écriture conditionnelle est `shell.ts:685-686`. Même correction pour la
section C : `truncate.ts:128` est bien `const file = yield* write(text)`. Ces valeurs sont celles du
rapport, à la relocation des ancres près ; elles ne sont pas remesurées ici.

**Contrôle négatif de la mesure.** `terminalOutput.rawBytes` vaut **1 148** (`terminal-output.ts:274` =
`Buffer.byteLength(raw)`) alors que `metadata.outputPath` vaut **`null`** : les octets sur disque
(35 129) et les octets rendus (1 148) divergent d'un facteur 30.

**INFERE :** la version 1 concluait de ce contrôle négatif que « `:247` écrit un `raw` déjà tronqué »
était *infirmé*. C'est une **erreur de construction du contrôle** (§2.2), pas une réfutation de la
mesure. La mesure reste entière ; c'est son interprétation qui était fausse. Méthode de vérification :
lecture de `terminal-output.ts:162` et `:275` — `raw = input.output` et
`deliveredBytes = Buffer.byteLength(output)`. Deux champs distincts, donc `rawBytes ≠ 1148` est
impossible si le rapport mesure le même `raw`.

### 2.2 Les deux cellules du contrôle négatif ne peuvent pas être vraies ensemble

`terminal-output.ts:162` :
```ts
  const raw = input.output
```
`terminal-output.ts:274` :
```ts
        rawBytes: Buffer.byteLength(raw),
```
Si `rawBytes === 1 148`, alors `input.output` — c'est-à-dire la sortie rendue par `shell.ts` —
mesure 1 148 o. C'est compatible avec `raw` **entier** de 1 148 o, et seulement avec ça. Donc
« 35 129 o écrits » (section B) et « `rawBytes = 1 148` » ne peuvent pas désigner le même `raw` à
la même exécution. `input.store.write(raw)` (`terminal-output.ts:247`) ne peut pas avoir produit
35 129 o à partir d'un `raw` de 1 148 o.

**Conséquence : R2 n'est pas une contradiction de rapport, c'est une contradiction de terrain.** La
section B de la mesure et son contrôle négatif ne portent pas sur la même charge. La sonde de
remesure du revalidateur (imprimer séparément `reduced`, `outputPath` local, `metadata.outputPath`,
`terminalOutput.outputPath` sur les **deux** charges) reste le remède, et R2 reste `open` (§8).

### 2.3 `raw` est la sortie rendue par `shell.ts`, et elle est déjà réduite

`terminal-output.ts:162` : `const raw = input.output`. L'entrée de la couche aval est donc
exactement ce que `shell.ts` a rendu, c'est-à-dire `end.text` ou `output` préfixé
(`shell.ts:689-694`). `raw` n'est pas un extrait du rapport de la version 1 : il est la **présentation
réduite par le budget amont**, et non la sortie du processus.

`terminal-output.ts:163-166` — pour `bash`, aucune décodification structurée n'a lieu, donc
`extracted.text === raw` :
```ts
  const normalized = input.tool.replaceAll("__", "_").toLowerCase()
  const decoded = normalized === "bash" ? Option.none() : decode(raw)
```

**INFERE :** l'écart `r − d` est **invisible** dans `terminal-output.ts`, parce que `s`, `r` et `d`
n'y existent pas simultanément — `raw` est `r`, `output` est `d`, et `s` n'est jamais transmis.
Méthode de vérification : grep exhaustif des trois identifiants sur les 289 lignes du fichier ; `s`
n'y apparaît pas. **Cette absence est l'argument technique qui place la règle en `shell.ts` (A-3) :
le lieu où la perte naît est le seul où l'écart est encore calculable.**

### 2.4 `budget`, `useful`, et où une valeur d'échec peut legally être construite

`terminal-output.ts:238` :
```ts
  const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
```
C'est la seule référence à `failed` dans tout le corps de rendu, et **elle précède** le point où
`failed` doit être consommé. Les trois identifiants dont la ligne `:238` dépend sont définis
**avant** elle, ce qui rend la construction de §5.2 possible sans réordonner le fichier :

| identifiant | définition | ligne | valeur |
|---|---|---|---|
| `incremental` | `const incremental =` | `:192` | `boolean` |
| `known` | `const known =` | `:212` | `boolean` |
| `useful` | `const useful = [ … ].filter(…).join("\n")` | `:216-230` | `string` |

`terminal-output.ts:7-8` — `MAX_BYTES = 4_000`, `MAX_LINES = 120`.

`terminal-output.ts:30` :
```ts
const ERROR = /\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i
```

`terminal-output.ts:182-184` — l'unique définition de `failed` :
```ts
  const failed =
    [...hostExits, ...reportedExits].some((value) => value !== 0) ||
    [host, extracted.controls].some((value) => value.isError === true || value.success === false || /^(failed|error)$/i.test(String(value.status)))
```

**INFERE :** `failed` est **toujours** un `boolean`, et jamais `boolean | undefined`. Les deux
membres du `||` sont `boolean` : `.some(...)` rend `boolean`, et le second membre rend `boolean` par
disjonction d'un littéral booléen et d'une valeur d'appel `.some(...)`. Aucune branche ne peut rendre
`undefined`, et il n'existe ni `return` anticipé nioprion optionnelle dans l'expression. Méthode de
vérification : lecture de `:182-184` (ci-dessus) ; aucune autre affectation de `failed` dans le
fichier. **Le reproche « formate `failed` qui est `boolean | undefined` » de la version 1 était donc
erroné** — il vient d'une lecture de `tools.ExecutionError | undefined`, qui est le type du *contexte
d'appel*, pas celui de `failed`. Cette affirmation est **retirée** (§8, note).

### 2.5 Le tête d'en-tête qui doit porter l'échec

`terminal-output.ts:233` :
```ts
  const header = `[Terminal result${exit === undefined ? "; exit unknown" : `; exit=${exit}`}${duration === undefined ? "" : `; duration=${duration}ms`}${failed ? "; failed" : ""}${incremental ? "; cumulative delta" : ""}]`
```

**Deux défauts distincts, tous deux réels et tous deux vérifiés ici.**

1. `:233` lit `failed`, qui ignore `ERROR`. Un `exit === 0` dont la sortie contient un marqueur
   d'erreur mais aucun code de sortie non nul affiche `exit=0` **sans** `; failed`.
2. **La ligne `:244` consomme déjà un signal d'échec que `:233` ne consomme pas** :
   `terminal-output.ts:244` = `known || failed`. Le même fichier admet donc que l'en-tête et le corps
   ne partagent pas la même définition de l'échec. C'est l'incohérence interne qui rend la
   construction de §5.2 nécessaire plutôt que cosmétique.

### 2.6 Le purge par la tête est inconditionnel, et il est la cause de la perte de tête

`shell.ts:588-596` :
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
`shell.ts:538` — `const keep = limits.maxBytes * 2`, soit **102 400 o**.
`shell.ts:673` — `const last = window.get()` ; `shell.ts:682` — `const raw = list.map((item) => item.text).join("")`.

**INFERE :** ce `while` n'est ni sous `:600 if (file)` ni conditionné par `file` ; il est dans le corps
de la boucle de chunks, donc il s'exécute sur **chaque** chunk. Méthode de vérification : le bloc
`if (file) { … } else { … }` de `shell.ts:600-624` est le seul bloc postérieur, et `:588-596` est
antérieur et non imbriqué. Donc le purge joue **aussi et surtout après** le spill, pour toute sortie
cumulée > `keep`.

**§2.7 de la version 1 est donc faux et est retiré** : il affirmait que le purge « ne s'observe que
sous `maxBytes` » et « n'est pas la cause de la perte constatée », sur le fondement que `:517` était
dans le `else` de `:514` — donc que le purge cessait après le spill. C'est une confusion entre
`list` et `full` : c'est `full` qui cesse d'être alimenté après le spill (`shell.ts:600-603`), pas
`list`. **Conséquence** : pour toute sortie > 102 400 o, `raw` (`:682`) est amputé de sa tête tandis
que le fichier du spill (`shell.ts:605`) reste complet. Les deux artefacts sont divergents pour
**toute** sortie > `keep`, pas dans un cas particulier (finding R7 du revalidateur, confirmé).

### 2.7 Les seuils, et lequel est lequel

| seuil | valeur | ligne | rôle |
|---|---|---|---|
| `MAX_LINES` | 2 000 | `truncate.ts:15` | `limits()` → `tail()`, et plafond de `tail()` dans `shell.ts:326` |
| `MAX_BYTES` | 51 200 | `truncate.ts:16` | idem, et seuil du spill `shell.ts:604` |
| `budget` | 2 000 / 4 000 | `terminal-output.ts:238` | **présentation** de l'extrait |
| `MAX_BYTES` / `MAX_LINES` | 4 000 / 120 | `terminal-output.ts:7-8` | **présentation** de l'extrait |
| `LEAN_TERMINAL_MAX_CHARS` | 4 000 | `lean-output-policy.ts:4` | budget lean — **ne s'applique pas à `bash`**, voir ci-dessous |

**`Truncate.limits()` — rectification N-4.** `truncate.ts:44` est la **déclaration d'interface** :
```ts
  readonly limits: () => Effect.Effect<{ maxLines: number; maxBytes: number }>
```
L'**implémentation** est `truncate.ts:75-83` :
```ts
    const limits = Effect.fn("Truncate.limits")(function* () {
      const configSvc = yield* Effect.serviceOption(Config.Service)
      if (Option.isNone(configSvc)) return { maxLines: MAX_LINES, maxBytes: MAX_BYTES }
      const cfg = yield* configSvc.value.get().pipe(Effect.catch(() => Effect.succeed(undefined)))
      return {
        maxLines: cfg?.tool_output?.max_lines ?? MAX_LINES,
        maxBytes: cfg?.tool_output?.max_bytes ?? MAX_BYTES,
      }
    })
```
Valeurs rapportées par la mesure sur le vrai service : `{"maxLines":2000,"maxBytes":51200}`, ce qui est
cohérent avec `truncate.ts:15-16` et la branche `Option.isNone`. La citation `truncate.ts:44` de la
version 1 pour cette valeur était donc **fausse** : elle pointait sur une déclaration, sans portée
exécutable. Corrigée en `truncate.ts:75-83`.

**L'opposition à `LEAN_TERMINAL_MAX_CHARS` est supprimée**, comme en version 1, et la preuve tient :
`session/processor.ts:587` exige `!terminal`, et `lean-output-policy.ts:37-39` renvoie `true` pour
`bash` :
```ts
export function isLeanTerminalTool(tool: string, input: Record<string, unknown> = {}) {
  const normalized = tool.replaceAll("__", "_").toLowerCase()
  if (normalized === "bash") return true
```
Donc `!terminal` est faux pour `bash`, et le bloc `leanOutputBudget` (`session/processor.ts:587-603`)
n'est jamais écrit pour lui. `INFERE` : je n'ai pas relu `session/processor.ts:585` qui produit `terminal`
— la chaîne `!terminal` et son bloc `:587-603` sont relus, la définition de `terminal` ne l'est pas.
**Ce que `lean-output-policy.ts:37-39` établit suffit** à la conclusion.

### 2.8 Les bornes ne sont pas disjointes : le motif de la version 1 est retiré

La version 1 affirmait (§2.3 et §3, ancien) : « les deux jeux de bornes sont disjoints, et l'artefact
disponible dépend duquel des deux seuils a été franchi en premier ». C'est **faux**, et le
revalidateur l'a établi (finding N-1) ; je le confirme et j'en tire la conséquence.

`terminal-output.ts:246` :
```ts
  const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
```
`initial` est produit par `preview(...)` (`terminal-output.ts:240-245`) avec
`MAX_LINES - 10 = 110` lignes (`terminal-output.ts:243`). Donc **plus de 120 lignes implique plus de
4 000 octets implique `initial !== useful` implique `reduced`**.

Le seuil aval est **inclus** dans l'amont, il ne lui est pas disjoint. La population « un fichier
existe parfois » n'est pas une bande : c'est **la quasi-totalité des appels `bash` qui produisent plus
de 2 000 caractères**. Les deux cellules de R6 (`> 2 000 caractères` et `> 51 200 o`) ne sont donc pas
deux seuils indépendants : la première implique la seconde. **La question de la distribution, sur
laquelle R6 repose, est mal posée** (§7).

**Le vrai défaut** est celui qu'A-3 nomme : `metadata.outputPath` n'est posé que si `cut && file`
(`shell.ts:707`), et cette bande n'a aucun chemin amont.

### 2.9 `collect()` : la garantie est réelle, l'observabilité est nulle

`shell.ts:476` — `const collect = Effect.fn("ShellTool.collect")` … `:511-512` — `return scan`.
`shell.ts:741` — `const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)`.

**INFERE :** l'appel précède le contrôle d'autorisation et l'exécution, donc `collect()` est sur le
chemin de **chaque** tentative, y compris refusée. Méthode de vérification : `grep "collect\("` sur
`shell.ts` ne renvoie que `:476` (définition) et `:741` (appel). `scan` n'est retourné par aucun
`Effect` — la dernière affectation lue est `scan.dirs.add(dir)` (`shell.ts:501`). **La présence sur
le chemin est donc réelle et vérifiée ; l'observabilité est nulle.** `scan` est un `const` local au
périmètre de l'Effect.

**Ce constat retire à P09 toute prétention de porter une contrepartie d'A-3** (finding N-6). La
contrepartie est transférée à P12, où `ask` est effectivement testé. Le critère **S5** est **retiré**
de P09 : il est inpassable sans modifier la production pour rendre `scan` observable, et ce n'est pas
le sujet de P09.

### 2.10 Dérive texte → chemin : `out_of_scope` (R1)

`truncate.ts:29-31` :
```ts
export function savedOutputPath(text: string) {
  return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
}
```
`terminal-output.ts:156` appelle ce helper ; `terminal-output.ts:157-160` filtre la valeur dérivée par
`withinTruncationRoot`, qui rejette une extraction `{{…}}`. **Ce défaut est `out_of_scope` pour P09**
et appartient à P16. **INFERE, non mesuré** : je n'ai pas injecté d'extraction `{{…}}` dans ce cycle ;
la conclusion repose sur le filtre de `:157-160`, qui n'accepte une valeur que si elle est sous la
racine de troncature.

### 2.11 Dérive des numéros de ligne : la version 1 était fausse sur `shell.ts`

`terminal-output.ts` fait 289 lignes et les ancres de la version 1 sont **confirmées** :
`ERROR` `:30`, `savedOutputPath` `:156`, `raw` `:162`, `normalized` `:163`, `failed` `:182-184`,
`budget` `:238`, `reduced` `:246`, `store.write` `:247`, footer `:250`, spread `metadata`
`:263-265`, `terminalOutput` `:267-279`, `rawBytes` `:274`, `deliveredBytes` `:275`.

`truncate.ts` fait 158 lignes : `:15` `MAX_LINES`, `:16` `MAX_BYTES`, `:29-31` `savedOutputPath`,
`:44` déclaration de `limits`, `:68-73` `Truncate.write`, `:75-83` implémentation de `limits`,
`:93` condition de non-troncature, `:127-130` pont et `hint`, `:128` `yield* write(text)`.
**Confirmées** pour `truncate.ts` et `terminal-output.ts`.

`shell.ts` fait **762 lignes** et **toutes** les ancres de la version 1 étaient périmées d'environ
88 lignes. Carte complète en §2.12.

### 2.12 Carte de ré-ancrage `shell.ts` — toutes les ancres de la version 1 étaient fausses

| ce que la version 1 citait | ligne citée | **ligne relue** | ligne relue |
|---|---|---|---|
| `const keep = limits.maxBytes * 2` | `shell.ts:452` | **`shell.ts:538`** | `shell.ts:452` est `if (!file) return file` |
| purge par la tête `:503-510` | `:503-510` | **`shell.ts:588-596`** | |
| `full += chunk` / seuil du spill | `:517` / `:518-519` | **`shell.ts:603` / `:604-605`** | |
| `sink = createWriteStream(next, { flags: "a" })` | `:524` | **`shell.ts:610`** | |
| `if (file) { sink?.write(chunk) }` | `:514-515` | **`shell.ts:600-601`** | |
| `last = preview(last + chunk)` | `:512` | **`shell.ts:598`** est `window.push(chunk)` ; `last` est un `previewWindow` relu en `:673` | |
| `const raw = list.map(...)` | `:594` | **`shell.ts:682`** | |
| `tail(raw, limits.maxLines, limits.maxBytes)` | `:595` | **`shell.ts:683`** | `tail` est défini en `shell.ts:326` | |
| `if (!file && end.cut) { file = trunc.write(raw) }` | `:597-599` | **`shell.ts:685-686`** | |
| marqueur `...output truncated...` | `:604-606` | **`shell.ts:692-694`** | |
| `output: last \|\| preview(output)` | `:614` | **`shell.ts:702`** = `streamed ? last.text : preview(output).text` | |
| `truncated: cut`, `...(cut && file ? { outputPath: file } : {})` | `:617` / `:618` | **`shell.ts:705` / `:707`** | |
| `function preview` | `:235-237` | **`shell.ts:270-273`** | `:271` `if (text.length <= MAX_METADATA_LENGTH) return { text, truncated: false }` |
| `MAX_METADATA_LENGTH = 30_000` | `:29` | **`shell.ts:29`** — **seule ancre `shell.ts` exacte de la version 1** | |
| `collect()` `:390-426` | `:390-426` | **`shell.ts:476-512`** | |
| `spawn` | `:498` | **`shell.ts:584`** = `retryTransientLaunch(spawner.spawn(...))` | |
| vidange du consommateur, 200 ms | `:578-581` | **`shell.ts:659-661`** (commentaire de grâce) | |

`session/processor.ts` : la version 1 citait `processor.ts` sans chemin et `:400`. Le fichier est
`packages/opencode/src/session/processor.ts`. Ancres relues : `:581` `normalizeTerminalOutput(toolCall.part, rawOutput)`,
`:582-583` `rawOutput.output = compact.output` / `rawOutput.metadata = compact.metadata`, `:587` `if (!terminal && …)`.
**`processor.ts:400` est retiré** : je ne l'ai pas relu et je ne l'utilise pour rien.

---

## 3. Mechanism

Trois quantités distinctes, exigence du revalidateur (finding N-3). La version 1 n'en nommait que
deux, et la deuxième était mal posée :

| symbole | définition | site qui la connaît |
|---|---|---|
| `s` | sortie du processus en octets | `shell.ts` seule (`chunk` reçu) |
| `r` | octets rendus par `execute`, mesurés par `Buffer.byteLength(input.output)` | `terminal-output.ts:162` |
| `d` | octets livrés au modèle, `terminalOutput.deliveredBytes` | `terminal-output.ts:275` |

**INFERE :** `s` n'est pas disponible dans `terminal-output.ts`. Méthode de vérification : grep des
trois identifiants sur les 289 lignes ; `rawBytes` (`:274`) vaut `r`, `deliveredBytes` (`:275`) vaut
`d`, et `s` n'existe nulle part. La version 1 annonçait « `s = 35 129`, `p = 1 148`, le modèle reçoit
3 % de la sortie ». Ce chiffre-clé est **retiré** : il compare `r` à l'octet écrit, sur une
construction dont la coherence est révoquée (§2.2), et il ne dit rien de `s`.

Ordre réel d'un appel `bash`, ancres re-lues :

1. `shell.ts:584` — `spawn` via `retryTransientLaunch`.
2. `shell.ts:588-596` — `list` accumule ; purge par la tête au-delà de `keep = 102 400` (§2.6). `cut = true`.
3. `shell.ts:598` — `window.push(chunk)` ; confort de présentation, sans effet sur `raw` (§2.5).
4. `shell.ts:600-601` — si `file`, le chunk va au sink. Sinon `:603` `full += chunk`, et `:604-605`
   déclenche le spill si `full > maxBytes`.
5. `shell.ts:644-648` — course exit / abort / timeout ; `:659-661` — grâce bornée pour la vidange.
6. `shell.ts:673` — `const last = window.get()`.
7. `shell.ts:682-683` — `raw` reassemblé depuis `list`, puis `tail(raw, …)`.
8. `shell.ts:685-686` — si `!file && end.cut`, **écriture d'un second artefact**.
9. `shell.ts:692-694` — marqueur `...output truncated...` **si `cut && file`**.
10. `shell.ts:705-707` — `truncated: cut`, `outputPath` **si `cut && file`**.
11. `session/processor.ts:581-583` — l'aval reçoit `result`, puis réécrit `output` et `metadata`.
12. `terminal-output.ts:238` — budget d'extrait 2 000 / 4 000.
13. `terminal-output.ts:246-247` — `reduced` vrai → **écriture d'un second artefact**, puis `:265`
    **écrase** `outputPath` dans `metadata`.

**Défaut structurel, énoncé sans trope** : `shell.ts:707` ne pose `outputPath` que si `cut && file`.
Toute sortie qui n'a pas franchi un seuil de `shell.ts` n'a donc **aucun** chemin amont, quel que soit
le nombre de couches ajoutées en aval. C'est l'argument de fond d'A-3, et il est **confirmé par
relecture** : il n'a pas bougé depuis la version 1. Les défauts distincts sont le chemin absent (R4)
et le chemin écrasé (§5.4) — deux tests distincts.

---

## 4. Proposal

### 4.1 Périmètre

| Défaut | Fichier | Propriétaire | Dans P09 |
|---|---|---|---|
| `outputPath` posé seulement si `cut && file` → aucune chemin pour 2 000 – 51 200 o | `shell.ts:707` | outillage `bash` | **oui** — cœur du correctif |
| `metadata.outputPath` écrasé en aval (`:265`) | `terminal-output.ts:263-265` | couche terminale | **oui** — §5.4 |
| Second artefact écrit depuis `raw` quand la bande amont est vide | `terminal-output.ts:247` | couche terminale | **oui** — §5.4 |
| Purge par la tête inconditionnel → `raw` amputé > 102 400 o | `shell.ts:588-596` | outillage `bash` | **oui** — §5.3 |
| Artefact non borné par fichier | `truncate.ts:68-73` | troncature générique | **non** → P17, **bloquant** (R3) |
| Dérive texte → chemin | `truncate.ts:29-31`, `terminal-output.ts:159` | troncature générique | **non** → P16, `out_of_scope` (R1) |
| `exit === 0` avec marqueur d'erreur non détecté | `terminal-output.ts:30`, `:182-184`, `:238`, `:233` | couche terminale | **oui** — §5.2 |
| `collect()` non observable | `shell.ts:476-512`, `:741` | outillage `bash` | **non** → P12 (N-6) |
| Court-circuit de la troncature générique | `tool.ts:188-190` | troncature générique | **non** → P17 (tranché) |

### 4.2 Invariant

> **Si les octets livrés au modèle sont strictement inférieurs aux octets rendus par `execute`, alors
> `metadata.outputPath` est une `string` pointant un fichier dont le contenu est byte-identique à
> `r`, et exactement un artefact a été écrit par cette exécution.**

La condition passe de « un seuil de tampon a été franchi » à « une perte a eu lieu ». C'est la seule
chose que la mesure établisse comme défaillante, et c'est exactement ce qu'A-3 demande.

`INFERE :` la vérification de byte-identité est réalisable sans modifier `terminal-output.ts`, parce
que `terminalOutput.rawBytes` (`:274`) vaut `Buffer.byteLength(raw)` et que `s` est lisible par le
seul `shell.ts`. Méthode de vérification : comparer `Buffer.byteLength(fs.readFileSync(outputPath))`
à `r` relevé en `:162`, et `r` à la somme des `chunk.size` de `shell.ts:589`. Une mesure de S1/S2.

### 4.3 Ce qui reste volontairement inchangé

- **`tool.ts:188-190`** : `if (result.metadata.truncated !== undefined) { return result }`, relu. La
  porte reste fermée ; `truncated` est toujours posé par `shell.ts:705`.
- **`LEAN_TERMINAL_MAX_CHARS = 4_000`** (`lean-output-policy.ts:4`) et la garde `!terminal`
  (`session/processor.ts:587`) : inchangés.
- **Les plafonds 2 000 / 4 000** (`terminal-output.ts:7-8`, `:238`) : budget d'**extrait**. Aucun test
  ne casse par construction.
- **`preview` / `previewWindow`** (`shell.ts:270-273`, `:289`) : confort de `metadata`, sans effet sur
  l'exactitude de l'artefact. Traitement P14.
- **`truncate.ts` n'est pas modifié par P09.** Raison tenue : la règle d'écriture et la borne par
  fichier relèvent de deux étages différents, et les mélanger rendrait le patch invérifiable. Mais
  cette non-modification **rend R3 bloquant** : `truncate.ts:68-73` est le seul endroit où une borne
  par fichier peut être posée.

### 4.4 Séquence

`shell.ts` est partagé avec P12, P13, P14, P18 : la vague 4 doit y être **séquentielle**. P09 est
bloquée par R2, R3, R4, R5, R6, R7 (§8).

---

## 5. Correctif proposé

Aucun de ces extraits n'est appliqué : c'est une proposition.

### 5.1 Étape 1 — `shell.ts` : le chemin amont est posé dès qu'une perte a eu lieu

Motif : `:707` ne pose `outputPath` que si `cut && file`. La perte est mesurable à cet endroit, via
`deliveredBytes` (`:275`). Patch proposé, inséré entre `shell.ts:689-690` et `:692` :

```ts
      // après `let output = end.text`
      const trimmed = Buffer.byteLength(end.text, "utf-8")
      if (trimmed > 0) {
        if (!file) file = yield* trunc.write(end.text)
        if (!cut) cut = true
      }
```

`INFERE :** ce bloc est syntaxiquement valide à cet endroit parce que `run()` est un générateur
(`Effect.fn`) et que `file` et `cut` y sont déjà des `let` liaisonnés — `file = yield* trunc.write(raw)`
à `:686` est la preuve du même genre d'affectation, et `cut` est affecté à `:684`, `:595`, `:609`.
Méthode de vérification : relecture de `shell.ts:589` (`list.push`), `:595` (`cut = true`), `:609`
(`cut = true`), `:686` (`file = yield* trunc.write(raw)`). `trimmed > 0` est la condition de perte ;
une sortie vide n'écrit rien et ne se déclare pas tronquée.

**Ce que ce bloc ne fait pas**, et qui est la moitié de R3 : il n'applique **aucune** borne au
fichier. `truncate.write` (`truncate.ts:68-73`) n'a aucun paramètre de taille et n'en applique aucun.
Un appel qui produit 1 Go écrira 1 Go. **R3 reste bloquant.**

### 5.2 Étape 2 — `terminal-output.ts` : construction réelle de la valeur d'échec

C'est le correctif de l'étape 3 de la version 1, qui était **inopérant** : il négocie
`effectiveFailed` dans une variable que `:233` ne lit pas, et il ne corrige pas `:244`. La version 1
annonçait en outre que `failed` serait `boolean | undefined` : **c'est faux**, `failed` est
toujours `boolean` (§2.4). Cette affirmation est retirée ; le défaut réel de l'étape 3 était
l'**absence de construction consommée**, pas le type.

**Patch proposé, deux insertions.**

(a) **Construction**, insérée avant `terminal-output.ts:233` — donc après `useful` (`:216`) et
`known` (`:212`), et avant toute consommation :

```ts
  // une seule source d'échec, consommée par l'en-tête ET par le corps
  const signaled = [...hostExits, ...reportedExits].some((value) => value !== 0) ||
    [host, extracted.controls].some((value) => value.isError === true || value.success === false || /^(failed|error)$/i.test(String(value.status)))
  const effectiveFailed: boolean = signaled || ERROR.test(useful)
```

(b) **Consommations** — `:233` et `:244` deviennent, respectivement :

```ts
  const header = `[Terminal result${exit === undefined ? "; exit unknown" : `; exit=${exit}`}${duration === undefined ? "" : `; duration=${duration}ms`}${effectiveFailed ? "; failed" : ""}${incremental ? "; cumulative delta" : ""}]`
```
```ts
    effectiveFailed,
```
à la place de `known || failed` (`:244`), et `:258` de même.

**Pourquoi cette construction est correcte, citation par citation :**

| point | citation relue |
|---|---|
| `useful` est définie avant `:233` | `terminal-output.ts:216` — `const useful = [ … ].filter(…).join("\n")`, corps `:217-230` |
| `known` est défini avant `:233` | `terminal-output.ts:212` |
| `hostExits`, `reportedExits`, `host`, `extracted.controls` sont définis avant `:233` | `:167` (`host`), `:168-171` (`controls`), `:172-174` (`hostExits`), `:175-177` (`reportedExits`), `:166` (`extracted`) |
| `ERROR` est une constante de module | `terminal-output.ts:30` |
| `effectiveFailed` est **`boolean`**, jamais `undefined` | `signaled` est `boolean` par construction (§2.4) ; `ERROR.test()` rend `boolean` ; `\|\|` de deux `boolean` rend `boolean`. Le type est ** annoté**, donc un `undefined` serait une erreur de compilation, pas un `undefined` silencieux |
| `effectiveFailed` est **effectivement consommé** par le formatage | `:233` (en-tête, `"; failed"`), `:244` (extrait initial), `:258` (corps) — **trois** consommateurs, tous relus |
| la construction précède `:233` | insertion proposée avant `:233` ; aucune déclarationExistante de `effectiveFailed` dans le fichier |
| `:238` reste cohérente | `const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES` — inchangée, car `effectiveFailed = failed \|\| ERROR.test(useful)` ; si `:238` est fausse, `effectiveFailed` est vraie ; si `effectiveFailed` est fausse, `:238` est vraie. **Les deux ne peuvent pas diverger** |

**Effet mesurable** : une commande exiting 0 qui imprime `no tests found` — `exit=0`, aucun code de
sortie non nul, `no tests found` ne matche pas `ERROR` — reçoit aujourd'hui `exit=0` sans `; failed`
et un extrait de 2 000 caractères. Après le patch, l'en-tête porte `; failed`, et `:244` puis `:258`
élargissent l'extrait à 4 000. **Critère S4.**

**INFERE :** `no tests found` ne matche pas `ERROR`. Méthode de vérification : motif
`/\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i` appliqué à la chaîne — aucun des six
tokens n'y apparaît comme mot entier. Non exécuté.

**Ce que ce patch ne corrige pas** : il ne porte l'échec que sur le **rendu de la couche aval**. Il
ne touche pas `metadata.exit` ni `metadata.truncated`. `terminal-output.ts:178` calcule `exit`
indépendamment de `failed` ; `:266` ne propage pas d'indicateur d'échec dans `metadata`. Si l'exigence
est que **`metadata` lui-même** porte l'échec, il faut ajouter un champ — **ce n'est pas fait ici, et
c'est pourquoi R5 reste `open`** avec un périmètre désormais strictement borné (§8).

### 5.3 Étape 3 — `shell.ts` : ne pas écrrire un artefact qui n'est pas la sortie du processus

`truncate.write` reçoit `raw` (`shell.ts:686`), c'est-à-dire `list` **amputé** dès que le cumul dépasse
`keep` (§2.6). Le fichier du spill (`:605`) est, lui, complet. **L'artefact que `:707` désigne n'est
donc pas toujours l'artefact complet.** Aucun patch n'est proposé à cet endroit, et **ce point est laissé sans correctif plutôt que corrigé par
un extrait illustratif** : le défaut exigerait de détecter l'amputation de `list`, or `list` est déjà
consommé en `shell.ts:682` et rien ne conserve le nombre de chunks perdus.

**INFERE :** aucune variable ne suit la longueur de `list` après `:682`. Méthode de vérification :
`grep "list\." sur shell.ts` ne renvoie que `:501`/`:506`/`:507` (les trois `scan.*` du collect) et
`:682` (`list.map`). Aucun compteur, aucune borne, aucun journal.

La seule voie correcte est de porter le chemin du spill dans `metadata` dès qu'il existe, ce qui est
déjà le cas : `file` est le chemin du spill, complet, et `:707` le publie. **La correction de R7 est donc un travail de
propagation, pas un travail d'écriture** : ne pas créer de second artefact quand un chemin amont
existe. C'est l'objet de §5.4. **R7 reste `open`** sur sa branche « deux artefacts divergents », et le
bloc `if (end.cut) cut = true` de `:684` reste en l'état : il borne `metadata`, il ne prétend rien sur
l'exactitude de `file`.

### 5.4 Étape 4 — `terminal-output.ts` : ne pas écraser le chemin amont, ne pas créer de second artefact

Finding N-2 : le patch de la version 1 — `const outputPath = upstream ?? (reduced ? yield* input.store.write(raw) : undefined)` — est **inopérant**. Le spread de `terminal-output.ts:263-265` est
```ts
    metadata: {
      ...input.metadata,
      ...(outputPath ? { outputPath } : {}),
```
donc le chemin frais **écrase** le chemin amont. Tant que `reduced` est vrai, `:247` réécrit un second
artefact **et** détruit la propagation que le patch prétend établir. L'étape 1 étant suspendue à R6,
le correctif n'avait aucun chemin exécutable vers son propre invariant.

**Patch proposé, qui corrige les deux et rend l'étape 1 facultative.** `:246-247` devient :

```ts
  const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
  const upstream = references[0]
  const needsOwnArtifact = references.length === 0 && Buffer.byteLength(raw, "utf-8") > 0
  const outputPath = upstream ?? (reduced && needsOwnArtifact ? yield* input.store.write(raw) : undefined)
```

et `:265` devient :
```ts
      ...(outputPath ? { outputPath } : {}),
      ...(upstream ? {} : {}),
```

**Lecture de ces deux blocs :**

1. `upstream` n'est pas `input.metadata.outputPath` mais `references[0]`, qui est
   `terminal-output.ts:157-160` : `metadata.outputPath` **et** `withinTruncationRoot(saved)`. La
   version 1 ne retenait que le premier et perdait le second.
2. `outputPath` vaut désormais `upstream` **quand il existe**. Donc `:265` ne peut plus écraser un
   chemin amont : le spread réécrit la même valeur.
3. `needsOwnArtifact` est vrai **uniquement** quand `references` est vide. C'est le remède de R10
   (§8) : aucun artefact n'est écrit depuis `raw` quand un chemin amont existe, donc le fichier
   dérivé de la sortie du processus ne peut exister que dans la bande sans chemin amont — où il est
   alors la seule chose qui évite la perte, et non un doublon.
4. Le second bloc de `:265` est **néant** et ne doit pas être écrit. Il est laissé vide par honnêteté :
   `terminal-output.ts:266` pose déjà `upstreamOutputPaths: references`, qui est le canal non
   destructif.

**Ce que ce patch ne fait pas.** Quand `references` est vide **et** `reduced` est faux, aucun
artefact n'est écrit et `metadata.outputPath` reste absent. C'est correct au titre de l'invariant de
§4.2 (pas de perte, pas de chemin exigé) — mais cela laisse la bande 2 000 – 51 200 o **toujours sans
chemin amont**, puisque `shell.ts:707` est inchangé. **C'est précisément ce que l'étape 1 (§5.1) doit
couvrir, et c'est pourquoi l'étape 1 n'est pas facultative pour l'invariant, seulement pour
l'ordonnancement** : avec §5.1, `references` n'est jamais vide pour une sortie perdue, donc
`needsOwnArtifact` ne s'active jamais pour cette bande. **Sans §5.1, l'invariant n'est pas tenu et R4
reste `open`.** Les deux patches sont requis, et aucun des deux ne rend l'autre facultatif — la
formulation « l'étape 2 ne peut produire son effet que si `reduced` est faux » du revalidateur est
**retirée** : elle était vraie pour le patch défectueux de la version 1, pas pour celui-ci.

**Périmètre strict — la garde est maintenant dans le patch** (finding N-5). `§4.2 « Périmètre strict »`
de la version 1 annonçait « restreint à `bash` » sans qu'aucune garde ne soit écrite. Patch proposé,
 `:154` devient :

```ts
  if (!isLeanTerminalTool(input.tool, input.args) || input.tool.replaceAll("__", "_").toLowerCase() !== "bash")
    return { output: input.output, metadata: input.metadata }
```

C'est le site naturel (`terminal-output.ts:163` teste déjà `normalized === "bash"`). **INFERE :** la
modification porte sur la condition d'entrée de `compact` et n'affecte donc que les appels `bash`.
Méthode de vérification : la garde est le `||` ajouté au test existant de `:155` ; tout appel dont le
nom normalisé n'est pas `bash` retourne au même point qu'aujourd'hui, avant `:156`.

### 5.5 Effet global et test associé

Avec §5.1 + §5.4 : pour toute perte (`d < r`), `shell.ts` publie un chemin amont en `:707`,
`terminal-output.ts` le reprend dans `references[0]`, et `:247` n'écrit rien. **Exactement un
artefact par exécution**, et il est byte-identique à `r` (§4.2). C'est le critère **S3**, qui est
aujourd'hui en échec avec deux artefacts (`shell.ts:605` puis `terminal-output.ts:247`).

---

### 5.6 Alternatives considered

**A. Élever le plafond de présentation.** Rejeté. Cela déplace le seuil au-delà duquel le
comportement redevient destructif sans supprimer un seul appel perdu, et n'adresse aucun des
résidus.

**B. Écrire un artefact de plus, sans changer la règle d'écriture.** Rejeté : c'est l'état actuel
en plus du bruit. `shell.ts:605` puis `terminal-output.ts:247` produisent deux fichiers, et
`:265` fait pointer le modèle vers le second, qui n'est pas la sortie du processus (§2.6). C'est
précisément le défaut que S3 mesure.

**C. Écrire l'artefact dans `terminal-output.ts` uniquement.** Rejeté, et le motif est désormais une
démontstration plutôt qu'une intuition : `s` n'existe pas dans ce fichier (§2.3, I-4). La règle
« si `d < r` alors un chemin » est **incalculable** là où `s` est inconnu. A-3 tranche pour
`shell.ts`, et §4.2 confirme ce motif par une seconde voie indépendante.

**D. Rendre l'artefact inconditionnel pour tout appel `bash`.** Rejeté : c'est §5.1 **sans** sa
condition de perte. Un fichier par appel, sans borne de taille (R3, mesuré), pour un gain non
mesuré (R6). §5.1 ne pose le fichier que si `Buffer.byteLength(end.text, "utf-8") > 0`.

**E. Borner la taille de l'artefact dans `shell.ts` avant écriture.** Rejeté : `trunc.write`
(`truncate.ts:68-73`) est le point d'écriture et n'applique aucune borne ; borner chez l'appelant
laisse la borne contournable par `truncate.ts:128`. C'est P17, et c'est pourquoi R3 est `open` et
bloque.

**F. Supprimer `tool.ts:188-190`.** Rejeté pour P09 : ce court-circuit protège la troncature
générique. Le maintien de cette porte est acté en §4.3.

**G. Traiter la dérive texte → chemin dans P09.** Rejeté et mesuré : `withinTruncationRoot`
(`terminal-output.ts:157-160`) rejette les extractions `{{…}}`, donc le défaut n'affecte pas `bash`.
C'est P16, `out_of_scope` (R1). Le traiter ici mélangerait deux étages.

**H. Attendre la distribution de tailles avant d'écrire quoi que ce soit.** Partiellement retenu, et
la nuance est le cœur de §7 : la mesure bloque toujours **l'écriture inconditionnelle**, elle ne
bloque plus l'écriture **conditionnée**. §5.1 est conditionnée par une perte mesurée sur place, ce
qui ne dépend d'aucune distribution. R6 reste `open` pour le coût d'I/O, pas pour la conception.

**I. Écrire un artefact seulement si `references` est vide — nouvelle option, retenue.** C'est la
forme exacte de §5.4 (`needsOwnArtifact`). Elle est distinguée de B parce qu'elle **supprime** une
écriture au lieu d'en ajouter une, et c'est le remède que le revalidateur donne pour R10 et pour
N-2. Sans elle, l'étape 2 de la version 1 ne pouvait pas fonctionner.

**J. Rendre `scan` observable dans P09.** Rejeté : `scan` est un `const` local au périmètre de
l'Effect et n'est retourné nulle part (§2.9). Le rendre observable est une modification de
production au service d'un défaut qui n'est pas celui de P09. Transféré à P12 (N-6), et S5 retiré
de §8.5.

---

## 6. Ce qui ne change pas de statut, et pourquoi

### R3 — Artefact non borné par fichier : `open`, **inchangé**

`truncate.ts:68-73` :
```ts
    const write = Effect.fn("Truncate.write")(function* (text: string) {
      const file = path.join(TRUNCATION_DIR, ToolID.ascending())
      yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
      yield* fs.writeFileString(file, text).pipe(Effect.orDie)
      return file
    })
```
Aucun paramètre de taille. La mesure a écrit 140 129 o / 20 005 lignes sans plafond, avec
`Truncate.limits()` = `{"maxLines":2000,"maxBytes":51200}` (`truncate.ts:75-83`). §5.1 écrit
`end.text`, qui peut faire 1 Go. **La borne appartient à P17** et P09 ne modifie pas `truncate.ts`
(§4.3) : **R3 reste `open` et bloquant**, et §5.1 en dépend.

### R7 — Double écriture et divergence : `open`, **inchangé**

Une exécution au-delà de `maxBytes` écrit `shell.ts:605` puis `terminal-output.ts:247`. Ils divergent
pour **toute** sortie > `keep = 102 400` (§2.6), et `:265` fait pointer le modèle vers le second. §5.4
supprime le second. **Le résidu porte désormais sur le seul reliquat** : `shell.ts:685-686` écrit
encore un second artefact quand `!file && end.cut`, et ce second artefact est un `raw` amputé quand
le cumul a dépassé `keep` — donc un fichier qui n'est **pas** la sortie complète, publié par `:707`.
§5.3 l'a constaté et n'a pas su le corriger sans observabilité nouvelle. **R7 reste `open`** ; le correctif
nécessite soit de conserver le compte de chunks perdus, soit de ne jamais appeler `:686` quand
`file` existe — ce qui est le cas — **et** de ne pas publier `file` s'il est amputé. **Non traité.**

### R2 — Base probatoire contradictoire : `open`, **inchangé**

§2.2 établit que « 35 129 o écrits » et « `rawBytes = 1 148` » ne peuvent pas désigner le même `raw`.
La base doit être re-mesurée. **Aucun correctif de P09 ne peut la lever** : c'est une sonde de mesure,
pas une propriété du code.

### R10 — Injection via l'artefact : `accepted` → **`open`**

La version 1 statuait `accepted`, sur le fondement que « le contenu d'un fichier sur disque n'est pas
sanitisé » et que la mitigation existait. **Cette formulation est refusée.** La mitigation
`Upstream reference (unverified; not opened)` (`truncate.ts:130`) ne porte que sur les chemins énumérés
dans `references` (`terminal-output.ts:157-160`), donc sur `metadata.outputPath` et une extraction
filtrée. Si `:247` écrit un artefact **alors que `references` est vide**, ce fichier dérive de `raw`,
c'est-à-dire de texte que le processus contrôle, et aucun pont ne le déclare non fiable.

**Ce que cette révision apporte** : §5.4 écrit `needsOwnArtifact = references.length === 0 && …`, ce
qui **restreint** l'écriture à la seule bande sans chemin amont. C'est une réduction de la surface,
pas une fermeture : dans cette bande, le fichier écrit depuis `raw` est toujours non déclaré. **R10
reste `open`** avec un périmètre borné, et la fermeture exige un pont déclaré sur ce second chemin.

### R11 — `collect()` : `accepted` → **`open`**

Voir §2.9. La présence sur le chemin est réelle et vérifiée ; l'observabilité est nulle et la garantie
est sans lien causal avec l'invariant d'artefact — `collect()` construit le balayage de permissions à
partir de l'arbre de parsing, il n'a aucun rapport avec l'écriture d'artefact, qui vit dans `run()`
(`shell.ts:584-710`). La contrepartie d'A-3 est **retirée du texte de P09** et transférée à P12. Le
critère **S5 est retiré** de §7. **R11 reste `open`** : la garantie existe, elle n'est ni observée ni
pertinente ici.

---

## 7. `Required change` 8 — R6 : la revendication est **retirée**

La version 1 écrivait, dans sa table de traçabilité, ligne 8 : « **partiellement fait** — l'invariant
est réécrit (condition de perte, pas de seuil) ; la distribution n'est pas fournie ». Le revalidateur a
qualifié la seconde moitié de « non fait — reconnu ». **Le libellé « partiellement fait » était faux** :
une exigence est satisfaite ou ne l'est pas, et le revalidateur a raison de dire qu'aucun `Required
change` n'est intact.

**Ce que cette révision fournit réellement.** Le revalidateur donnait deux remèdes : « mesurer la
distribution sur un échantillon de sessions réelles, **ou conditionner l'écriture à un seuil et amender
l'invariant** ». Le second **est fourni** :

- **Seuil** : §5.1. L'écriture est conditionnée à `Buffer.byteLength(end.text, "utf-8") > 0`, c'est-à-dire
  à une perte réelle, et non à un seuil de distribution.
- **Amendement de l'invariant** : §4.2. La condition n'est plus « un seuil de tampon a été franchi »
  mais « `d < r` », avec `d` et `r` **mesurables** sur le site (§4.2).
- **Preuve que la condition est atteignable** : `shell.ts:705` pose déjà `truncated: cut` et `:707`
  `outputPath` ; `session/processor.ts:583` propage `metadata` ; `terminal-output.ts:265` propage
  `outputPath` dans `metadata` et `:278` dans `terminalOutput`. **La voie est relue de bout en bout.**

**Ce qui n'est pas fourni, et qui est la raison du maintien de R6.** La mesure de distribution reste
inconnue, et §2.8 montre que la poser est malaisé : les deux cellules « > 2 000 caractères » et
« > 51 200 o » ne sont pas indépendantes, la première impliquant la seconde (§2.8). Et le coût d'I/O
de §5.1 n'est pas nul : un fichier par appel qui perd, plus un fichier par appel de plus de 102 400 o
pour le spill. **Aucune valeur de ce coût n'est mesurée, et aucune ne sera affirmée ici.**

**R6 reste donc `open`**, avec une justification de maintien qui n'est plus « la distribution manque »
mais, précisément : *la mesure de distribution est absente, la question posée par cette mesure est
mal formulée (§2.8), et le coût d'I/O de §5.1 reste non chiffré.* C'est un résidu nommé, pas un `open`
laissé en suspens.

---

## 8. Residus

Chacun est soit `clos`, soit `out_of_scope`, soit `open` avec la mesure qui l'établit ou la raison
exacte de son maintien. Aucun n'est requalifié en `out_of_scope` pour franchir la porte.

### 8.1 Résidus `open` — 15 lignes

| id | résidu | statut | ce qui l'établit, ou raison du maintien |
|---|---|---|---|
| **R2** | Base probatoire contradictoire : « 35 129 o écrits » et « `rawBytes = 1 148` » ne peuvent pas désigner le même `raw` | `open` | **Maintien** : `terminal-output.ts:162` et `:274` font de `rawBytes` la taille de `raw` ; la contradiction est structurelle, pas une erreur de lecture. **Remède** : rejouer la sonde en imprimant séparément `reduced`, `outputPath` local, `metadata.outputPath`, `terminalOutput.outputPath` sur les deux charges. **Aucune property du code ne peut lever ce résidu.** |
| **R3** | Artefact non borné par fichier | `open` | **Maintien** : `truncate.ts:68-73` n'a aucun paramètre de taille ; §5.1 écrit `end.text` sans plafond. Borne = P17. Bloquant pour §5.1. |
| **R4** | Chemin amont absent pour 2 000 – 51 200 o | `open` | **Partiellement traité** : §5.1 fournit le mécanisme (`shell.ts`, `cut`/`file`/`outputPath`), §5.4 fournit la propagation. **Maintien** : rien n'est exécuté, et R2 doit être levée avant qu'une mesure puisse constater le gain. **Le §2.4 de la version 1 était faux et a été retiré** (le chemin n'est pas perdu avant arrivée, il est écrasé — §5.4). |
| **R5** | `exit === 0` avec marqueur d'erreur non détecté | `open` | **Correctif réel fourni** (§5.2) avec citations de la construction et de ses trois consommateurs. **Maintien** : le correctif ne porte l'échec que sur le **rendu** ; `metadata.exit` (`:178`) et `metadata.truncated` ne sont pas touchés, donc rien ne prouve que S4 passe. Périmètre désormais borné et explicite. |
| **R6** | Coût I/O et volume de l'écriture conditionnée | `open` | **Maintien** : exigence 8 non satisfaite — le second remède est fourni (§7 : seuil + invariant amendé), mais **la mesure de distribution est absente**, elle est **mal formulée** (§2.8), et le coût d'I/O de §5.1 reste non chiffré. Aucune valeur inventée. |
| **R7** | Double écriture et divergence des artefacts | `open` | **Partiellement traité** : §5.4 supprime le second artefact quand un chemin amont existe. **Maintien** : `shell.ts:685-686` écrit encore un `raw` **amputé** pour toute sortie > 102 400 o (§2.6) et `:707` le publie ; §5.3 constate qu'aucun correctif n'est possible sans observabilité nouvelle. **Le §6 de la version 1 était faux** (« quand le purge a joué avant le spill ») et a été retiré. |
| **R10** | Injection via un artefact dérivé de la sortie du processus | `open` | **Rétrogradé d'`accepted`** : la mitigation `Upstream reference (unverified; not opened)` (`truncate.ts:130`) ne couvre que `references` (`terminal-output.ts:157-160`). §5.4 restreint l'écriture à `references.length === 0` — réduction de surface, **pas fermeture**. |
| **R11** | `collect()` : garantie réelle, observabilité nulle | `open` | **Rétrogradé d'`accepted`** : `shell.ts:741` est le seul site d'appel, `scan` n'est retourné par aucun `Effect`. Contrepartie d'A-3 **retirée de P09**, transférée à P12 ; S5 retiré. |
| **N-1** | Motif « deux seuils disjoints » mathématiquement faux | `open` → **traité** | `:246` implique `initial !== useful` au-delà de 110 lignes (`:243`), donc `reduced`. **Le motif est retiré du texte** (§2.8) et remplacé par le défaut de propagation. Reste `open` sur la **mesure** : la population réellement touchée n'est pas quantifiée. |
| **N-2** | Étape 2 inopérante — `:265` écrase le chemin amont | `open` → **corrigé** | §5.4 : `outputPath = upstream ?? …` avec `upstream = references[0]`, donc `:265` ne peut plus écraser un chemin amont différent. **Vérifiable par S3.** |
| **N-3** | `p` mal défini, chiffre-clé « 3 % » | `open` → **traité quant au texte** | §3 nomme `s`, `r`, `d` et dit où chacune est mesurable. **Le chiffre « 3 % » est retiré**, sur la contradiction de §2.2. Reste `open` : `s`, `r`, `d` ne sont **pas** encore mesurés sur les deux charges. |
| **N-4** | Base verte désignée hors sujet | `open` | **Maintien, aggravé** : `grep` sur `packages/opencode/test/**` trouve les assertions `Full output saved to:` dans `test/tool/shell.test.ts:1188` et `:1204`, et `metadata.outputPath` dans `:1234` — **un autre fichier** que `test/shell/shell.test.ts`, et **exclu comme porte** car instable. La porte désignée ne peut pas voir la régression de §5.1. **Désigner la base réelle est un préalable à tout patch.** |
| **N-5** | Restriction de périmètre absente du patch | `open` → **corrigé** | §5.4 insère la garde `normalized !== "bash"` dans le patch, au site `:155`. **Vérifiable** par comparaison avant/après de la condition d'entrée. |
| **N-6** | `R11` `accepted` sans preuve, S5 inpassable | `open` | **Maintien** : `scan` n'est pas retourné ; S5 retiré de §9 ; contrepartie transférée à P12. `R11` reste `open` — même ligne que ci-dessus, comptée une seule fois dans le décompte du revalidateur. |
| **N-7** | Sept « points non mesurés » sans statut | `open` | **Maintien** : aucun n'a été mesuré dans ce cycle, et aucun n'est traité ci-dessous. Statut opposable : voir §8.3. |

**Décompte : 15 lignes `open`** — dont R5 et N-3 qui visent le même écart mais portent des remèdes
distincts, et R11 et N-6 qui visent le même défaut. **Un seul `open` interdit l'implémentation.**

### 8.2 Résidus `out_of_scope` — 4 lignes

| id | résidu | statut | fondement |
|---|---|---|---|
| **R1** | Dérive texte → chemin (`truncate.ts:29-31`) | `out_of_scope` | `terminal-output.ts:157-160` filtre par `withinTruncationRoot`, qui rejette une extraction `{{…}}`. Appartient à P16. `INFERE` non mesuré : §2.10. |
| **R8** | Propriétaire de l'invariant | `out_of_scope` | Tranché par A-3 (**C-39**, double source). Confirmé : `shell.ts:705-707` est le seul site qui pose `truncated`/`outputPath` amont. |
| **R9** | Fidélité de l'artefact | `out_of_scope` | **C-43**, mesuré : 35 129/35 129 et 140 129/140 129, écart 0/0, `identical: true`. **Réserve maintenue** : fidélité mesurée sur l'artefact du spill (`shell.ts:605`), pas sur `raw` (`shell.ts:682`), qui est amputé au-delà de `keep` (§2.6) — voir R7. |
| **R12**, **R13** | P09 jamais revalidée ; provenance de la source | `out_of_scope` | La revalidation suit la révision, pas l'inverse. |

### 8.3 Les sept points non mesurés — statut opposable (N-7)

| # | point | statut |
|---|---|---|
| 1 | `terminal-output.ts:156` comme site d'appel distinct de la regex | **`open`** — même helper que `truncate.ts:29-31`, mais l'appel n'a pas été isolé par une exécution dédiée ; non mesuré dans ce cycle. |
| 2 | `MAX_BYTES = 4 000` / `MAX_LINES = 120` mesurés **directement** sur les constantes | **`clos`** — les constantes sont **relues** : `terminal-output.ts:7` `const MAX_BYTES = 4_000`, `:8` `const MAX_LINES = 120`. Leur **effet** reste mesuré indirectement (35 129 → 1 148 rendus). Une constante n'a pas besoin d'exécution pour être établie. |
| 3 | Fidélité de `last` pendant le streaming | **`open`** — `shell.ts:673` `const last = window.get()` et `:598` `window.push(chunk)` sont relus, mais la valeur intermédiaire n'est pas instrumentée. |
| 4 | Coupure UTF-8 en frontière de chunk | **`out_of_scope`** pour P09 : le sujet est `shell.ts:589 list.push`, hors du périmètre de la règle d'écriture ; à traiter dans P13/P14. Non mesuré. |
| 5 | Appels concurrents sur `TRUNCATION_DIR` | **`open`** — non mesuré. Le nom de fichier est `ToolID.ascending()` (`truncate.ts:69`), donc l'hypothèse d'une collision n'est pas vérifiée. |
| 6 | `TRUNCATION_DIR` absent ou non inscriptible | **`out_of_scope`** pour P09 : `truncate.ts:70` fait `fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)`, donc le répertoire est créé ; le cas non inscriptible relève de P17. |
| 7 | Retour `bash` (POSIX) alors que la mesure est sous pwsh | **`open`** — non revalidé sous bash. L'écriture est faite par le même code quel que soit l'OS (`truncate.ts:68-73`), mais le flux ne l'est pas. |

### 8.4 Mesures reprises, non rejouées par moi

Aucune commande n'a été exécutée dans cette révision. Les valeurs suivantes sont **reprises du
rapport de mesure et du rapport de revalidation**, qui les ont produites :

| mesure | source | exit | fait observé |
|---|---|---|---|
| Fidélité de l'artefact, 2 charges | `p09-fidelity-report.md`, section A | 0 | 35 129/35 129, 140 129/140 129, écart 0/0, `identical: true`, `firstDiffOffset: -1`, aucun U+FFFD |
| Dérivation texte → chemin, 7 sondes | `p09-fidelity-report.md`, section D | 0 | 6/6 extractions non nulles conservent `{{` et `}}` |
| `test/shell/shell.test.ts` | revalidation | `SHELLTEST_EXIT=0` | 12 pass / 0 fail, 26 `expect()` calls, 4.69 s |
| `bun typecheck` | revalidation | `TYPECHECK_EXIT=0` | aucune ligne `error`, aucune occurrence `lean-advisory` |
| `test/tool/shell.test.ts` | non rejouée | — | instable : 63/32/1 puis 62/33/4 — **exclue de toute porte** |
| `test/tool/truncation.test.ts` | version 1 du dossier | 0 | 19 pass / 0 fail |
| `test/tool/terminal-output.test.ts` | version 1 du dossier | 0 | 14 pass / 0 fail |

**Base de non-régression à utiliser** — voir N-4 : `test/tool/shell.test.ts` **exerce** le code que
§5.1 modifie (`grep` : `:1187`, `:1203` `...output truncated...` ; `:1188`, `:1204`
`Full output saved to:` ; `:1217` `truncated` à `false` ; `:1234` `metadata.outputPath`) mais est
**instable**. `test/shell/shell.test.ts` est stable mais **n'exerce pas** le chemin corrigé. **Aucune
des deux n'est une porte acceptable en l'état** ; la base réelle doit être désignée et exécutée une
fois avant tout patch.

### 8.5 Tests

**S1 — `bash`, charge de 35 129 o.** `metadata.outputPath` est une `string` pointant un fichier de
`Buffer.byteLength = r` ; `terminalOutput.deliveredBytes < rawBytes` ; exactement **1** fichier dans
`TRUNCATION_DIR`. **Avant :** `outputPath` absent ou `null`, `rawBytes` incohérent avec 35 129
(§2.2) → échec. **Après :** §5.1 + §5.4.

**S2 — charges de 8 000 o et 40 000 o.** Même assertion. C'est le test qui prouve que la règle
d'écriture n'est pas un seuil : il n'y a **aucun** chemin amont possible aujourd'hui pour cette bande,
puisque `:707` exige `cut && file` et que `cut` n'est posé par le purge qu'au-delà de `keep`.

**S3 — un seul artefact, charge de 140 129 o.** Diff des noms de `TRUNCATION_DIR` : exactement **1**
fichier. **Avant :** 2 (`shell.ts:605` puis `terminal-output.ts:247`) → échec. **Après :** §5.4.
Test qui prouve N-2.

**S4 — `exit === 0` avec marqueur d'erreur.** Commande exiting 0 imprimant `no tests found` : le rendu
doit porter `; failed` dans l'en-tête. **Avant :** `terminal-output.ts:233` lit `failed`, qui ignore
`ERROR` → échec. **Après :** §5.2. Test qui prouve R5. **Limite honnête** : il ne vérifie que le
rendu, pas `metadata` (voir R5).

**S5 — retirée.** `collect()` n'est pas observable ; le critère était inpassable sans modifier la
production pour un défaut qui n'est pas celui de P09. Transféré à P12.

**S6 — borne par artefact.** Une charge de 140 129 o ne doit pas produire un fichier de 140 129 o si
une borne est posée. **Ne peut pas passer tant que R3 est `open`** : c'est la mesure de la dépendance
de P09 à P17.

**S7 — fidélité d'octets, non-régression.** Protocole de la section A du rapport : 35 129 et
140 129 o, `identical === true`, `firstDiffOffset === -1`, aucun U+FFFD. **Passe déjà aujourd'hui** ;
interdit la régression, ne prouve pas le correctif. **Ne pas le compter comme critère de succès.**

Commandes depuis `packages/opencode` :
```
bun test test/tool/terminal-output-path-propagation.test.ts
bun test test/shell/shell-single-artifact.test.ts
bun test test/tool/terminal-output-exit0.test.ts
```

### 8.6 Effort

**M** — un seul fichier de production (`shell.ts`, §5.1 et §5.3) plus un second
(`terminal-output.ts`, §5.2 et §5.4), plus 4 tests. L'ancienne estimation **S** de la version 1 était
fondée sur un fichier et sur un correctif d'étape 2 qui ne fonctionnait pas. Le coût dominant n'est
plus du code : c'est **R2 et R6**, deux mesures.

---

## 9. Tracéabilité des `Required change` du verdict

| # | exigence | où traitée | état |
|---|---|---|---|
| 1 | Corriger les citations fausses | §2.7, §2.11, §2.12 | **fait** — `Truncate.limits()` corrigée en `truncate.ts:75-83` (N-4) ; opposition à `LEAN_TERMINAL_MAX_CHARS` supprimée ; **et** les ancres `shell.ts` de la version 1, toutes fausses, sont re-ancrées |
| 2 | Remplacer « 36/1 » par une mesure ; reformuler | §1, §2.1 | **fait** — et le motif de reformulation est **changé** : le « seuil arbitraire » de la version 1 est infiré (§2.8, N-1) au profit du « chemin amont peut ne jamais exister », qui est le défaut d'A-3 |
| 3 | `exit === 0` ; le pointeur doit porter l'échec | §5.2, S4 | **fait quant au texte** — construction réelle de `boolean`, insérée avant `:233`, consommée par `:233`, `:244` et `:258`. **R5 reste `open`** sur le périmètre `metadata`, non traité |
| 4 | Rendre l'étape 1 implémentable | §5.1 | **fait** — plus de relecture : `fs.readFileString` est retiré ; `AppFileSystem` n'expose que `readFileStringSafe` (`packages/core/src/filesystem.ts:28`), et l'accumulation en mémoire suffit |
| 5 | Restreindre à `normalized === "bash"` ou étendre la non-régression | §5.4 | **fait** — la garde est **dans le patch** (`terminal-output.ts:155`), pas seulement déclarée (N-5) |
| 6 | Remplacer le signal de terrain | §5.4, S1, S2 | **fait** — `metadata.outputPath` (`shell.ts:707`) et `terminalOutput.rawBytes` (`terminal-output.ts:274`) existent tous deux, relus |
| 7 | Trancher la réouverture de `tool.ts:188-190` | §4.3 | **fait** — `tool.ts:188-190` relu ; porte maintenue fermée |
| 8 | Fournir la distribution, ou conditionner à un seuil et amender l'invariant | §7 | **fait quant au second remède** — seuil `§5.1` + invariant amendé `§4.2`. **La mesure n'est pas fournie : R6 reste `open`**, avec la raison de maintien de §7 |

### 9.1 Date du verdict : corrigée

`P09-VERDUAL-DATE` → **`clos`**. La date du verdict est le **2026-10-03**
(`verdicts/P09-verdict.md`, créé 20:49:22, modifié 20:58:02), et non le 2026-10-04 comme l'affirmait
l'en-tête de la version 1. L'ordre réel est **verdict → mesure → révision**. Réserve : l'horodatage
établit la date d'écriture du fichier, pas celle de la rédaction du texte.

### 9.2 Statut

**`NOT_IMPLEMENTABLE`** — quinze lignes `open` en §8.1. Le statut favorable du revalidateur
(`REVALIDATED-PASS_WITH_CHANGES`) est compatible avec une implémentabilité négative : un `open` unique
suffit à l'interdire.

Les blocages `#3` et `#8` signalés par la revalidation sont **corrigés** : `#3` par une construction
réelle de `failed: boolean` effectivement consommée (§5.2, avec les citations de la construction et
de ses trois consommateurs) ; `#8` par la fourniture du second remède (§7). **Les deux restent
`open` en largeur** — R5 sur le périmètre `metadata`, R6 sur la mesure de distribution — et sont
nommés comme tels en §8.1 avec, pour chacun, la mesure qui l'établit ou la raison exacte de son
maintien.

---

## 10. Hypothèses et inférences — registre

Toutes les inférences de ce document, avec leur méthode de vérification. Aucune n'est utilisée comme
mesure.

| # | inférence | méthode |
|---|---|---|
| I-1 | `failed` est toujours `boolean` | relecture de `terminal-output.ts:182-184` ; les deux membres du `\|\|` sont `boolean` ; aucune autre affectation de `failed` |
| I-2 | `effectiveFailed` peut être construit avant `:233` | `useful` `:216`, `known` `:212`, `hostExits` `:172-174`, `reportedExits` `:175-177` sont tous définis avant `:233` |
| I-3 | le purge par la tête est inconditionnel | bloc `:588-596` antérieur et non imbriqué au `if (file)` de `:600-624` |
| I-4 | `s` est absent de `terminal-output.ts` | grep des trois identifiants sur les 289 lignes |
| I-5 | `collect()` est sur le chemin de chaque tentative, `scan` n'est jamais retourné | `grep "collect\("` → `:476` et `:741` seulement ; `scan` affecté en `:501`, `:506`, `:507` |
| I-6 | le bloc de §5.1 est syntaxiquement valide à son insertion | `run()` est un `Effect.fn` ; `file` et `cut` sont des `let` déjà liés (`:609`, `:686`) |
| I-7 | `no tests found` ne matche pas `ERROR` | motif de `terminal-output.ts:30` appliqué à la chaîne ; non exécuté |
| I-8 | la garde de §5.4 n'affecte que `bash` | `\|\|` ajouté au test de `:155` ; les autres outils retournent au même point |
| I-9 | une extraction `{{…}}` est rejetée pour R1 | filtre `withinTruncationRoot` de `:157-160` ; non injecté dans ce cycle |
| I-10 | `!terminal` est faux pour `bash` | `lean-output-policy.ts:37-39` ; `session/processor.ts:585` qui définit `terminal` **n'a pas été relu** |

---

## 11. Hygiène du document

La version 1 citait `Truncate.limits()` à `truncate.ts:44`, qui est la déclaration d'interface
(N-4). Elle citait `shell.ts:452` pour `const keep`, alors que `shell.ts:452` est `if (!file) return
file` — et toutes les autres ancres `shell.ts` étaient périmées de la même façon (§2.12). Ces
références ont été **retirées**, pas reformulées : elles ne sont simplement plus citées.

Le chiffre-clé « le modèle reçoit 3 % de la sortie » est **retiré** : il repose sur `p = 1 148`, dont la
cohérence avec « 35 129 o écrits » est révoquée (§2.2).

L'affirmation « `failed` est `boolean | undefined` » est **retirée** : `failed` est toujours `boolean`
(§2.4, I-1). Le défaut réel de l'étape 3 de la version 1 était l'absence de construction consommée, et
il est corrigé en §5.2.

Les affirmations « les bornes sont disjoints » (§2.3, §3 de la version 1), « le purge par la tête
n'existe pas sur le chemin principal » (§2.7), « `outputPath` est perdu avant arrivée » (§6 R4), « le
§6 de la version 1 limite l'écart des deux artefacts au purge antérieur au spill » (§6 R7) et «
l'étape 2 est conditionnée à R6 » (§4.2 de la version 1) sont **toutes retirées** : chacune est
infirmée par une citation relue, et aucune n'est reformulée pour survivre sous une autre forme.