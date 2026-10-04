# P14 — Aperçu d'une commande : la tête de la sortie disparaît sans marqueur

> **Révision v2** —applicable à la suite du verdict `PASS_WITH_CHANGES`
> (`docs/harness-audit/verdicts/P14-verdict.md`, 203 lignes).
>
> Ce que cette révision change par rapport à la v1 :
>
> 1. **§4.3 est réécrit.** La détection `body !== (last || output)` est **supprimée** :
>    elle ne se déclenche pas en flux. Le signal vient désormais d'un **drapeau propagé**
>    par la fenêtre d'aperçu, jamais d'une comparaison de chaînes.
> 2. **La sévérité est reclassée** en **faible** (§1, §6, §9) : aucune décision
>    d'autorisation ne peut reposer sur l'aperçu, et l'affichage TUI plafonne l'aperçu
>    à 10 lignes.
> 3. **Les six Required changes** du verdict sont appliqués et tracés un par un
>    (§10).
> 4. **Les `INFERE:`** non vérifiés sont supprimés ou remplacés par des citations
>    relues (INFERE sur `handle.all`, sur le composant TUI, sur les bornes de tests).
> 5. **Le test du drain (§7.2)** est réécrit sur une condition structurelle, sans attente
>    par temps fixe.
>
> Un seul fichier source est touché : `packages/opencode/src/tool/shell.ts`.

---

## 1. Problem

Quand la sortie d'une commande dépasse 30 000 caractères, l'aperçu produit en
`metadata.output` ne garde que les 30 000 derniers caractères : le début du texte
disparaît en silence, sans marqueur et sans que l'indicateur `truncated` le signale.

**Sévérité : faible — défaut de fidélité d'affichage, pas perte de données
d'autorisation.** La v1 affirmait que le modèle ou l'approbateur pouvait « approuver une
commande dont il n'a pas vu le préambule ». Cette branche est **fausse** et a été
supprimée :

- l'autorisation est demandée **avant** l'exécution (`shell.ts:654` pour `ask`, puis
  `shell.ts:658` pour `run`) ;
- la demande ne transporte **aucun** aperçu : `metadata: {}` (`shell.ts:297`, et
  `shell.ts:288` pour l'external_directory) ;
- le texte vu par le modèle est `output` (`shell.ts:620`), dérivé de `tail()`
  (`shell.ts:601`), **jamais** de `preview()` ;
- l'aperçu vivant (`metadata.output`) est rendu à l'opérateur dans le TUI
  (`index.tsx:2467`, `session-v2.tsx:742`) et plafonné à 10 lignes
  (`index.tsx:2469`) : la perte de tête n'est même visible qu'après expansion
  (`index.tsx:2473`).

Ce qui reste vrai : `metadata.output` est amputé de sa tête sans qu'aucun champ ne le
signale, et un récepteur qui ne sait pas que la fenêtre existe ne peut pas distinguer
« la commande n'a produit que ces 30 000 derniers caractères » de « 200 000 caractères ont
été produits et les 170 000 premiers ont été jetés ».

**Priorité : basse.** Le chemin n'est pas mort, il est étroit (§2).

---

## 2. Evidence

Toutes les citations ci-dessous ont été relues au caractère près dans le code source.
Les compteurs de longueur sont en **unités de code UTF-16** (`String.length`), pas en
grappes de caractères — c'est la seule unité que `slice` et `Buffer.byteLength`
utilisent réellement ici.

`packages/opencode/src/tool/shell.ts:29` — le plafond du champ `metadata.output` :

```ts
const MAX_METADATA_LENGTH = 30_000
```

`packages/opencode/src/tool/shell.ts:235-238` — la troncature, queue seule, marqueur muet :

```ts
function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  return "...\n\n" + text.slice(-MAX_METADATA_LENGTH)
}
```

`packages/opencode/src/tool/shell.ts:512` — **la même fonction est appliquée à chaque
chunk du flux**, donc la tête perdue l'est définitivement et ne revient jamais :

```ts
last = preview(last + chunk)
```

`packages/opencode/src/tool/shell.ts:451-459` — les accumulateurs du streaming ; `last`
est borné par construction, `cut` est un `boolean` séparé :

```ts
const limits = yield* trunc.limits()
const keep = limits.maxBytes * 2
let full = ""
let last = ""
```

```ts
let file = ""
```

```ts
let cut = false
```

`packages/opencode/src/tool/shell.ts:500-501` — le consommateur de flux est unique et
porte les deux canaux, donc `preview()` n'a aucun moyen de les distinguer :

```ts
const streamFiber = yield* Effect.forkScoped(
  Stream.runForEach(Stream.decodeText(handle.all), (chunk) => {
```

`packages/opencode/src/tool/shell.ts:529-535` et `:540-545` — le champ `output` est
**republié à chaque chunk**, y compris au basculement vers un fichier ; c'est ce qui
explique que `last` soit non vide dès qu'un chunk est arrivé, et donc que la
détection par comparaison de chaînes de la v1 soit inopérante (§4.3) :

```ts
ctx.metadata({
  metadata: {
    output: last,
```

`packages/opencode/src/tool/shell.ts:594-596` — `raw` est reconstruit depuis `list`,
lequel est rempli **dans le même callback** que `last` (`:503`) : `last === ""` est donc
équivalent à « aucun chunk », et `preview(output)` à `:614` ne peut pas être le porteur du
signal (§4.3) :

```ts
const raw = list.map((item) => item.text).join("")
const end = tail(raw, limits.maxLines, limits.maxBytes)
if (end.cut) cut = true
```

`packages/opencode/src/tool/shell.ts:611-621` — le résultat final : `truncated` ne porte
que `cut`, et `outputPath` n'existe que si `cut` **et** `file` :

```ts
return {
  title: input.description,
  metadata: {
    output: last || preview(output),
    exit: code,
    description: input.description,
    truncated: cut,
    ...(cut && file ? { outputPath: file } : {}),
  },
  output,
}
```

`packages/opencode/src/tool/shell.ts:601-610` — l'avertissement existant ne concerne que
le fichier complet, et `meta` n'atteint que `output` :

```ts
let output = end.text
if (!output) output = "(no output)"

if (cut && file) {
  output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
}

if (meta.length > 0) {
  output += "\n\n<shell_metadata>\n" + meta.join("\n") + "\n</shell_metadata>"
```

`packages/opencode/src/tool/shell.ts:240-242` — les limites de `tail()` sont en
**lignes et en octets**, pas en caractères, d'où une sortie possiblement non marquée :

```ts
function tail(text: string, maxLines: number, maxBytes: number) {
  const lines = text.split("\n")
  if (lines.length <= maxLines && Buffer.byteLength(text, "utf-8") <= maxBytes) {
```

`packages/opencode/src/tool/truncate.ts:15-16` — ces limites valent 2 000 lignes et
50 KiB :

```ts
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
```

`packages/opencode/src/tool/truncate.ts:42-44` — **elles sont configurables** ; la fenêtre
de P14 n'existe donc qu'avec les valeurs par défaut (ou des valeurs plus hautes) :

```
  /**
   * Resolved truncation limits: values from `tool_output` in opencode config, or MAX_LINES / MAX_BYTES if unset.
   */
  readonly limits: () => Effect.Effect<{ maxLines: number; maxBytes: number }>
```

**La fenêtre est réelle mais étroite.** Avec les valeurs par défaut, une sortie
tranchée **sans marque** exige simultanément :

- `length > 30 000` unités de code (pour que `preview()` tronque, `shell.ts:236`) ;
- `byteLength ≤ 51 200` et `lignes ≤ 2 000` (pour que `tail()` renvoie `cut: false`,
  `shell.ts:242` → `:596`, donc `truncated: false` à `:617` et aucun bandeau à `:604`).

Cela implique une moyenne ≤ `51 200 / 30 001` ≈ **1,71 octet par unité de code**, donc
une sortie **ASCII-dominante**. En sortie CJK (3 octets/unité) la borne haute est
~17 000 caractères : la fenêtre de P14 n'est **jamais** atteinte. Et une configuration
`tool_output` qui abaisse `maxBytes` sous 30 000 la supprime entièrement. C'est un
défaut **rare**, ce qui justifie la priorité basse (§1).

`packages/opencode/src/tool/shell.ts:573-581` — le drain borné à 200 ms coupe le
consommateur de flux sans produire de signal (cas connexe P17 / F-L3) :

```ts
// Let the output consumer drain the last buffered chunks after the
// process ended, so output written right before "exit" is not lost.
// Bounded by a short grace period: a pipe kept open by a background
// child (e.g. a PowerShell Start-Process) must not stall the tool —
// the consumer fiber is interrupted when the scope closes.
yield* Effect.raceAll([
  Fiber.join(streamFiber).pipe(Effect.asVoid, Effect.ignore),
  Effect.sleep("200 millis"),
]).pipe(Effect.ignore)
```

`packages/opencode/src/tool/shell.ts:564-571` — les **seuls** cas où `meta` reçoit un
message aujourd'hui : l'abort et le timeout, tous deux suivis d'un `kill` identique :

```ts
if (exit.kind === "abort") {
  aborted = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
if (exit.kind === "timeout") {
  expired = true
  yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
}
```

`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:2462-2471` — **le composant
de rendu, vérifié** (l'INFERE de la v1 était faux) :

```tsx
function Shell(props: ToolProps<typeof ShellTool>) {
  const { theme } = useTheme()
  const pathFormatter = usePathFormatter()
  const ctx = use()
  const isRunning = createMemo(() => props.part.state.status === "running")
  const output = createMemo(() => stripAnsi(props.metadata.output?.trim() ?? ""))
  const [expanded, setExpanded] = createSignal(false)
  const maxLines = 10
  const maxChars = createMemo(() => maxLines * Math.max(20, ctx.width - 6))
  const collapsed = createMemo(() => collapseToolOutput(output(), maxLines, maxChars()))
```

**Conséquence tirée, que la v1 n'avait pas tirée :** `maxLines = 10`
(`index.tsx:2469`) plafonne l'affichage bien en-dessous de 30 000 caractères, et
`limited()` ne rend le texte complet qu'après expansion (`index.tsx:2473`). La perte de
tête est donc **invisible en régime courant** — ce qui abaisse encore la sévérité, déjà
corrigée en §1.

Autres lecteurs de `metadata.output` relevés : `index.tsx:2493`,
`session-v2.tsx:742`, `message-v2.ts:1089` (qui ne l'expose que si
`metadata.interrupted === true`), `terminal-output.ts:144` (qui ne lit que
`metadata.outputPath`).

---

## 3. Mechanism

1. `execute` (`shell.ts:636`) parse la commande, puis `ask` (`shell.ts:654`) demande la
   permission. `ctx.ask` reçoit `metadata: {}` (`shell.ts:297`) : la surface
   d'approbation est alimentée par `scan.patterns` et `scan.always`
   (`shell.ts:295-296`), **pas** par `preview()`. `preview()` n'a donc pas de surface
   d'autorisation à traiter.
2. `run` (`shell.ts:658`) démarre le processus et fork le consommateur de flux
   (`shell.ts:500-501`) sur un **flux unique** couvrant les deux canaux : la troncature de
   `preview()` est indifférente à l'origine, et stderr peut être coupé comme stdout.
   *(L'INFERE de la v1 sur l'implémentation de `handle.all` — fusion, ordre
   d'entrelacement — a été supprimé : non relu, donc non affirmé.)*
3. À chaque chunk, `last = preview(last + chunk)` (`shell.ts:512`) concatène puis
   retranche. Dès que `last` dépasse 30 000 unités, `preview()` ne renvoie plus que la
   queue : la tête est définitivement perdue, et le préfixe `"...\n\n"`
   (`shell.ts:237`) ne dit ni combien ont disparu, ni où.
4. Le même `last` est poussé vers le canal de progression à chaque chunk
   (`shell.ts:540-545`) : l'aperçu vivant est déjà amputé de sa tête avant la fin.
5. `ctx.metadata` est aussi appelé au basculement vers un fichier (`shell.ts:529-535`),
   donc le premier `metadata` publié peut déjà être tronqué.
6. À la fin, `tail()` (`shell.ts:595`) applique les limites lignes/octets. Si la sortie
   respecte 2 000 lignes et 50 KiB mais dépasse 30 000 unités de code, `end.cut` est
   `false` (`shell.ts:242`), donc `cut` reste `false`, donc `truncated: false`
   (`shell.ts:617`), aucun `outputPath` (`shell.ts:618`), et l'avertissement `:605`
   n'est pas émis.
7. Le résultat part avec `title: input.description` (`shell.ts:612`) et
   `metadata.output = last || preview(output)` (`shell.ts:614`) : `title` ne porte que
   la description fournie par le modèle. C'est bien `metadata.output` qui est l'aperçu,
   amputé de sa tête sans qu'aucun champ ne l'indique.
8. **La branche `preview(output)` de `:614` ne peut pas porter le signal.**
   `list.push` (`shell.ts:503`) et `last = preview(...)` (`shell.ts:512`) s'exécutent
   dans le **même** callback de `Stream.runForEach`, et la boucle d'éviction s'arrête à
   `list.length > 1` (`shell.ts:505`), donc `list` conserve au moins un élément dès
   qu'un chunk est arrivé. Or `raw` (`:594`) n'est construit que depuis `list`. Ainsi
   `last === ""` ⇒ `raw === ""` ⇒ `end.text === ""` ⇒ `output = "(no output)"`
   (`:602`), soit 13 caractères. Cette branche est donc **inoffensive en pratique**, et
   c'est précisément pourquoi la détection de la v1, qui s'y appuyait, ne peut pas
   fonctionner en flux.
9. Cas connexe P17 / F-L3 : la course de `Fiber.join(streamFiber)` contre
   `Effect.sleep("200 millis")` (`:578-581`) se termine au bout de 200 ms quoi qu'il
   arrive. Si le sleep gagne, le consommateur est interrompu à la fermeture du scope
   (commentaire `:577`) et les derniers octets sont perdus **sans aucun signal** :
   `meta` (`:587-593`) ne reçoit rien dans ce cas, et même quand il reçoit quelque chose
   il n'atteint pas `metadata` (`:608-610`).

---

## 4. Proposal

Aucun changement de schéma, de configuration, ni de format de sortie persisté. Un seul
fichier source : `packages/opencode/src/tool/shell.ts`.

### 4.1 `preview()` conserve tête et queue, et **signale** ce qu'il a tronqué

C'est le cœur de la correction de l'objection technique centrale. `preview()` cesse d'être
une fonction qui **tronque en silence** : elle devient une fonction qui **renseigne**.
Deux API, un seul budget.

```ts
const HEAD_SHARE = 0.25

/** Une fenêtre d'aperçu qui garde la tête ET la queue du texte qui la traverse,
 *  et qui sait dire si elle a tronqué. */
export type Preview = { text: string; truncated: boolean }

/** Coupe de tête sûre vis-à-vis des paires de surrogates. */
function cutStart(text: string, at: number) {
  let i = at
  while (i > 0 && i < text.length) {
    const code = text.charCodeAt(i)
    if (code >= 0xdc00 && code <= 0xdfff) i--
    else break
  }
  return text.slice(0, i)
}

export function preview(text: string): Preview {
  if (text.length <= MAX_METADATA_LENGTH) return { text, truncated: false }
  const head = Math.floor(MAX_METADATA_LENGTH * HEAD_SHARE)
  const tailLength = MAX_METADATA_LENGTH - head
  const head_ = cutStart(text, head)
  const tail_ = text.slice(-tailLength)
  const omitted = text.length - head - tailLength
  return {
    text:
      head_ +
      `\n\n[... ${omitted} characters omitted — first ${head} and last ${tailLength} shown ...]\n\n` +
      tail_,
    truncated: true,
  }
}
```

**Pourquoi un retour structuré et non une comparaison.** La v1 proposait de déduire la
troncature de `body !== (last || output)`. C'est faux, et pas seulement « imparfait » :
comme `last` est tronqué à chaque chunk (`:512`), dès le deuxième chunk on compare
`last` à `last`. Le signal ne peut donc être produit que par la fonction qui **a**
tronqué. `preview()` devient la source unique du fait, et le fait est transporté par un
`boolean`, jamais déduit d'une égalité de chaînes.

**Pourquoi la fenêtre d'aperçu est un accumulateur et non un appel par chunk.** On
pourrait se contenter d'appeler `preview(last + chunk)` et de lire `.truncated`. Ce serait
correct pour le drapeau, mais ** faux pour le texte** : `last` est déjà une chaîne
tronquée, donc le fenêtrage de `preview()` opérerait sur une sortie qui contient déjà le
préfixe `"...\n\n"`, et chaque passage ajouterait un marqueur à l'intérieur du précédent
— un marqueur par chunk. Le texte deviendrait illisible et la taille exploserait. D'où la
fenêtre :

```ts
/** Fenêtre glissante sur le flux : conserve la tête, la queue, et le total observé. */
export function previewWindow(maxLength = MAX_METADATA_LENGTH, headShare = HEAD_SHARE) {
  const headLength = Math.floor(maxLength * headShare)
  const tailLength = maxLength - headLength
  let raw: string | undefined = undefined   // texte exact tant qu'il tient
  let head = ""
  let tail = ""
  let seen = 0                              // total observé, jamais tronqué

  return {
    push(chunk: string) {
      seen += chunk.length
      if (raw === undefined) {
        raw += chunk
        if (raw.length <= maxLength) return
        head = cutStart(raw, headLength)
        tail = raw.slice(Math.max(headLength, raw.length - tailLength))
        raw = undefined
        return
      }
      tail = (tail + chunk).slice(-tailLength)
    },
    get(): Preview {
      if (raw !== undefined) return { text: raw, truncated: false }
      const omitted = seen - headLength - tailLength
      return {
        text:
          head +
          `\n\n[... ${omitted} characters omitted — first ${headLength} and last ${tailLength} shown ...]\n\n` +
          tail,
        truncated: true,
      }
    },
  }
}
```

Propriétés, chacune vérifiable par lecture du code ci-dessus :

- **Un seul marqueur, quelle que soit la coupe.** La fenêtre ne réapplique jamais
  `preview()` à sa propre sortie ; `head` et `tail` ne contiennent jamais de marqueur.
  Le texte est donc **idempotent** : `get()` appelé dix fois donne dix fois le même
  résultat, ce qui est indispensable puisque `:531` et `:542` publient à chaque chunk.
- **Le drapeau est exact, pas déduit.** `truncated` vaut `seen > maxLength`, où `seen`
  est le total exact en unités de code. Aucune comparaison de chaînes, donc aucune
  possibilité de « `last !== last` → `false` ».
- **La tête est réellement la tête du flux**, pas la tête d'une chaîne déjà tronquée.
- **Budget constant** : `headLength + tailLength === maxLength` ; le marqueur (~74 unités,
  voir §6) est le seul ajout. La coupure de tête peut coûter **une** unité de plus
  (voir §4.4, garde-fou UTF-8), donc la borne est `maxLength + marqueur + 1`.
- **Mémoire bornée** : `raw` ne vit que le temps d'un chunk ; ensuite `head + tail` +
  le chunk courant, soit ~30 000 unités. La borne mémoire de `last` est donc préservée,
  ce qui était la raison d'être du `preview()` par chunk.
- **Placement du marqueur** : au milieu, entre les deux fragments conservés. C'est la
  seule forme qui dit *où* l'information manque ; un préfixe `"..."` en tête est
  indistinguable d'une sortie dont le début a été omis en amont.

**Choix du ratio.** `HEAD_SHARE = 0.25`, soit 7 500 unités (~1 875 tokens) : les
premières lignes portent l'invocation, la version, le contexte, ou la première erreur —
précisément ce qui manque aujourd'hui. Un ratio de 0,5 est plus sûr pour les sorties dont
la conclusion est au milieu, au prix du même budget pris sur la queue. **Décision : 0,25**,
car la queue est la seule partie qui existe déjà dans le produit (elle est l'unique chose
que l'opérateur a toujours vue) et la régression y serait visible, alors que la tête est
un gain. Le ratio est **une constante** : le changer ne modifie ni le coût total ni le
budget.

### 4.2 Marqueur pour le drain 200 ms coupé (P17 / F-L3)

Correction minimale, sans changer la course existante. Un drapeau `drained`, déclaré à
côté de `let cut = false` (`shell.ts:459`), est positionné à la fin du
`Stream.runForEach` (`shell.ts:546`) ; après la course de `shell.ts:578-581`, il est lu
et, s'il est `false`, un message est ajouté à `meta` (`shell.ts:587-593`), qui atteint
déjà `output` via `shell.ts:608-610`.

```ts
let drained = false
// ... le fork de shell.ts:500 se termine par :
.pipe(Effect.andThen(Effect.sync(() => { drained = true })))

// ... après la course de shell.ts:578-581, une fois `meta` déclaré :
if (!drained) {
  meta.push(
    `output stream was still open when the 200 ms drain grace period expired; trailing output may be missing — re-run with a larger timeout or redirect to a file to capture it completely`,
  )
}
```

**Ce que ce message atteint, et ce qu'il n'atteint pas — à announce explicitement.**
`meta` n'est concaténé qu'à `output` (`shell.ts:608-610`). Or :

- `output` est le texte que **le modèle** reçoit (`session/tools.ts:691` en fait
  `output` à partir de `truncated.content`) ;
- l'affichage TUI de la commande lit `metadata.output` (`index.tsx:2467`,
  `session-v2.tsx:742`), **pas** `output`.

Donc **le message de drain est visible par le modèle et invisible dans l'affichage TUI**,
y compris pour l'opérateur qui regarde la commande en cours. C'est le modèle qui peut
agir dessus (relancer, rediriger) ; ce n'est pas un signal d'interface. Le correctif 4.2
est **plus étroit** que « l'opérateur est averti » : il informe le récepteur
textuel. Rendre le message visible à l'opérateur exigerait de le pousser dans `last`
(le `metadata` publié), ce qui est **hors périmètre de P14** (il contaminerait l'aperçu
vivant et le test de progression `shell.test.ts:1134`) et est tracé comme finding F-4.

### 4.3 Rendre la troncature **de la fenêtre** honnête, par propagation

Puisque `metadata.output` est amputé même quand `cut` est `false`
(`shell.ts:596`, `:617`), `metadata` doit distinguer les deux causes de troncature au
lieu de réutiliser un seul booléen qui ment sur la fenêtre.

**La détection est portée par `previewWindow`, pas par une égalité de chaînes.** Le
drapeau `truncated` de §4.1 est lu au point de publication, et `metadata` distingue
`truncated` (lignes/octets, avec fichier) de `previewTruncated` (fenêtre d'aperçu) :

```ts
const window = previewWindow()          // remplace `let last = ""` (shell.ts:454)

// dans le fork, shell.ts:512 :
window.push(chunk)
const w = window.get()                   // `{ text, truncated }`

// aux publications shell.ts:531 et shell.ts:542 :
ctx.metadata({ metadata: { output: w.text, description: input.description } })

// au résultat final shell.ts:611-621 :
metadata: {
  output: last.length > 0 ? w.text : preview(output).text,
  previewTruncated: last.length > 0 ? w.truncated : preview(output).truncated,
  truncated: cut,
  ...(cut && file ? { outputPath: file } : {}),
}
```

**Pourquoi `last` est conservé séparément.** `last` sert de **test** pour savoir si un
chunk est passé (§3 étape 8 : `last === ""` ⟺ aucun chunk). Le remplacer partout
supprimerait ce test ; on le maintient donc comme un simple drapeau (`hasChunk`), et le
texte de `metadata.output` vient de la fenêtre. C'est le seul moyen de distinguer, sans
comparaison de contenu, le cas « fenêtre active » du cas inoffensif `"(no output)"`.

**Pourquoi la comparaison de la v1 ne peut pas être réparée.** Elle compare `body` à
`last || output`. Dans le cas streamé, `body === last` par construction, donc elle vaut
`false` ; dans le cas non streamé, `last` est `""` et `output` vaut `"...\n\n" + queue`,
donc la comparaison est également `false` une fois la queue tronquée. Elle est fausse
dans **les deux** cas. La seule correction est de faire produire le fait par la fonction
qui tronque — c'est ce que fait `previewWindow`.

### 4.4 Ce qui reste volontairement inchangé

- **`tail()` (`shell.ts:240-270`) et ses limites** (`truncate.ts:15-16`) : la troncature
  lignes/octets, avec écriture du fichier complet (`shell.ts:598`) et l'avertissement
  `:605`, est un comportement correct et est conservé tel quel. P14 ne porte que sur la
  fenêtre d'aperçu de 30 000 unités.
- **Le budget de 30 000 unités** (`shell.ts:29`) : inchangé. P14 redistribue, il
  n'agrandit pas.
- **`trunc.write` et la rétention** (`truncate.ts:13` `RETENTION`, `truncate.ts:54`
  `cleanup`) : inchangés.
- **La course 200 ms** (`shell.ts:578-581`) : le bornage anti-zombie est justifié par le
  commentaire `:573-577` et reste en place ; seule la **signalisation** de la coupure est
  ajoutée. Le vrai correctif P17 (drain complet) est hors périmètre.
- **L'ordre des appels** `ask` puis `run` (`shell.ts:654`, `shell.ts:658`) : la demande de
  permission précède l'exécution, donc `preview()` ne peut structurellement pas alimenter
  la boîte d'approbation. Faire dépendre l'approbation de la sortie exigerait une
  exécution préalable — décision de produit bien au-delà de P14.
- **`scan.always` (`shell.ts:296`)** : hors périmètre ; mentionné parce que c'est le
  champ que l'approbateur lit réellement au moment du `ask`.

**Piège connu — et un piège que la v1 n'avait pas vu.** Un `slice` peut séparer une paire
de surrogates. `tail()` prend déjà cette précaution en `:258` (sur les octets). Le même
garde-fou est appliqué à la coupe de tête (`cutStart`, §4.1). Mais **`cutStart` ne suffit
pas pour la fenêtre** : la coupe de queue de la fenêtre est un
`(tail + chunk).slice(-tailLength)` *glissant*, qui peut donc commencer **au milieu**
d'une paire. Sans garde-fou, un chunk contenant un caractère hors BMP (émoji, par
exemple) peut produire un `U+FFFD` dans l'aperçu à chaque chunk suivant. La coupe de
queue de la fenêtre doit donc écarter une éventuelle surrogate basse initiale :

```ts
function cutTailAt(text: string, from: number) {
  let i = from
  if (i > 0 && i < text.length) {
    const code = text.charCodeAt(i)
    if (code >= 0xdc00 && code <= 0xdfff) i++
  }
  return text.slice(i)
}
```

et `tail = cutTailAt(tail + chunk, Math.max(0, tail.length + chunk.length - tailLength))`.
Ce que la v1 (et la note d'implémentation du verdict) disait — « `text.slice(-tail)`
inclut jusqu'à la fin de la chaîne, il ne peut donc pas séparer une paire » — est
**exact pour la coupe unique de `preview()`** et **faux pour la coupe glissante de la
fenêtre**. C'est une correction de la v1, pas une divergence de ce document.

---

## 5. Alternatives considered

1. **Agrandir `MAX_METADATA_LENGTH`** (`shell.ts:29`) de 30 000 à, disons, 100 000.
   Rejeté : +~17 500 tokens sur *chaque* gros output, pour un défaut qui est un problème
   de *disposition* de fenêtre, pas de taille. La redistribution règle le défaut à coût
   nul.
2. **Conserver la queue seule, mais ajouter le compte des caractères omis.** Rejeté :
   peu coûteux, mais ne restaure pas la partie qui dit ce que la commande fait. Elle
   laisse intacte la moitié du problème, qui est la perte d'information, pas seulement
   l'absence d'indication. Conservée comme partie du correctif, pas comme substitut.
3. **Supprimer toute troncature et tout envoyer.** Rejeté : un `tsgo --noEmit` ou un
   `git log -p` produit plusieurs mégaoctets ; coût token et latence catastrophiques.
4. **Écrire systématiquement la sortie complète dans un fichier et ne renvoyer que le
   chemin**, comme le fait déjà `trunc.write` (`shell.ts:598`). Rejeté en correctif
   unique : déplace la charge vers le modèle (un aller-retour de plus par gros output)
   et échoue quand le fichier n'est pas accessible. Reste la bonne stratégie pour le
   chemin *lignes/octets*, déjà en place.
5. **Faire dépendre l'approbation de la sortie** en exécutant d'abord, puis demandant.
   Rejeté : changement de modèle d'exécution et de produit, hors périmètre de P14.
6. **Dduire la troncature d'une comparaison de chaînes** (`body !== (last || output)`,
   v1). Rejeté : **faux dans les deux cas**, voir §4.3. C'est l'alternative que le verdict
   a refusée ; elle est nommée ici pour que le refus soit tracé.

---

## 6. Risks

- **Régression sur les tests existants.** Le bloc `describe("tool.shell truncation")`
  (`shell.test.ts:1161`, bloc `:1162-1229`, borne correcte — la v1 citait `:1161-1220`
  alors que le bloc continue au-delà) asserte `/\.\.\.output truncated\.\.\./` sur
  `result.output` (`:1172`, `:1188`) et `metadata.outputPath` (`:1219`). Ces assertions
  portent sur la troncature lignes/octets et sur `output`, **inchangées** : `output` est
  produit par `tail()` et par le préfixe `:605`, jamais par `preview()`. Le test
  `does not truncate small output` (`:1194`) asserte `metadata.truncated === false`
  (`:1202`) — inchangé, `previewTruncated` est un champ distinct. `:184` asserte
  `expect(result.metadata.output).toContain("test")` sur la commande `echo test`
  (`:180`) : 10 unités, sous le seuil, aucun marqueur. Le test de progression
  `it.live("streams metadata updates progressively")` (`shell.test.ts:1134-1158`, borne
  correcte — la v1 citait `:1134-1148`) capture `metadata.output` à chaque chunk
  (`:1146-1150`) et vérifie qu'il croît (`:1155`, `expect(updates.length).toBeGreaterThan(1)`),
  sur la commande `echo first && sleep 0.1 && echo second` (`:1141`) : ~25 unités, jamais
  fenêtré, la forme reste identique. Le test d'intégration
  `packages/opencode/test/session/prompt.test.ts:2651-2657` pousse ~4 000 lignes
  (~130 octets chacune) puis annule après `Effect.sleep(150)` (`:2661`) : la sortie
  **traverse** `preview()` (elle dépasse 30 000 unités) et le marqueur apparaîtra donc
  dans `metadata.output`, mais ses assertions portent sur `metadata.truncated`
  (`:2671`), `metadata.outputPath` (`:2672`), `output` (`:2673-2674`) et l'absence de
  `"Tool execution aborted"` dans `output` (`:2675`) — **aucune sur la forme de
  `metadata.output`**. Méthode si l'un de ces tests cassait : ne pas assouplir
  l'assertion, mais corriger le test pour viser le chemin concerné
  (`result.output` pour le bandeau, `metadata.previewTruncated` pour la fenêtre).
  Fichiers à exécuter intégralement : `test/tool/shell.test.ts`,
  `test/tool/shell-output-prompt.test.ts`, `test/tool/shell-launch-retry.test.ts`,
  `test/session/prompt.test.ts`, `test/shell/shell.test.ts`, `test/pty/pty-shell.test.ts`.
- **Coût en tokens, chiffré.** Répartition à budget constant : `7 500 + 22 500 =
  30 000`, exactement comme aujourd'hui ; plus le marqueur, dont la longueur est
  calculable à partir du gabarit de §4.1 : `\n\n` (2) + `[... ` (5) + chiffres de
  `omitted` (1 à 7) + ` characters omitted — first ` (28) + `7500` (4) + ` and last `
  (10) + `22500` (5) + ` shown ...]\n\n` (11) = **66 à 72 unités de code**, soit ~17
  tokens pour une sortie ASCII. Delta sur l'appel final : **+~17 tokens, budget
  inchangé**. La tête conservée n'est donc pas un ajout, c'est une queue réduite d'autant.
- **Coût dominant : la republication par chunk.** C'est le coût réel de cette
  proposition, et il n'est **pas** couvert par le chiffrage précédent. `window.get()` est
  appelé **à chaque chunk** (`:531`, `:542`) et republie jusqu'à 30 000 unités à chaque
  fois. P14 **n'augmente pas** ce volume par publication : le budget de 30 000 unités
  était déjà le budget de `last` (`:512`). Ce que P14 ajoute, c'est **~70 unités de
  marqueur par publication** une fois le seuil franchi, soit `70 × N` unités sur une
  course de `N` chunks au-delà du seuil — de l'ordre de quelques dizaines de kilo-octets
  sur une sortie longue, **en mémoire vive du TUI, pas facturé au modèle** (le TUI relit
  `metadata.output` à chaque rendu, `index.tsx:2467`). Le surcoût de calcul par chunk est
  borné : deux `slice` et une concaténation, donc le même ordre O(taille du chunk) que
  l'`slice` unique actuel.
- **Comparaison avec le risque.** ~17 tokens sur l'appel final et ~70 unités par
  publication TUI sont négligeables ; l'absence d'indication de perte n'est pas
  négligeable pour un lecteur qui doit savoir s'il a tout vu.
- **Sévérité réelle : faible.** Voir §1. Aucune décision d'autorisation ne dépend de
  l'aperçu (`shell.ts:654` avant `:658`, `metadata: {}` à `:297`), le modèle lit `output`
  (`shell.ts:620`, `session/tools.ts:691`), et le TUI plafonne l'affichage à 10 lignes
  (`index.tsx:2469`). Le gain est réel mais **borné**, et il ne touche pas la sécurité
  d'exécution.
- **Risque de ré-exposition de données sensibles (finding F-3, hors périmètre).** La
  correction réintroduit en tête des unités de code qui étaient aujourd'hui jetées.
  Vérification faite : `grep -i 'redact|secret|mask|apiKey|credential'` sur
  `packages/opencode/src/tool/shell.ts` **ne retourne aucune correspondance** — il n'y a
  donc aucun filtre dans `shell.ts`, sur le chemin `handle.all` → `preview()` →
  `metadata.output`. Je n'affirme **pas** que le chemin de transport plus large est
  dépourvu de filtre : je ne l'ai pas audité. Deux bornes restrictives, à retenir :
  (i) `output`, le texte que le modèle reçoit (`shell.ts:620`,
  `session/tools.ts:691`), est produit par `tail()` et **n'est pas fenêtré par P14** —
  la ré-exposition ne concerne que `metadata.output` ; (ii) `metadata` est un
  `Schema.Record(Schema.String, Schema.Any)` (`message-v2.ts:113`, `:121`, `:263`, `:275`,
  `:464`, `:489`, `:591`) : ajouter un champ est **valide par construction**, sans
  migration de schéma. Statut : `out_of_scope` (§11) — l'ajout d'une rédaction de secrets
  est un changement transversal à tous les outils, hors du périmètre d'un correctif
  d'affichage, et il n'appartient pas à ce document de le décider.
- **Risque de contournement de permission.** Aucun : P14 ne touche ni `scan.patterns`,
  ni `scan.always` (`shell.ts:295-296`), ni l'appel `ctx.ask` (`shell.ts:293-298`), ni le
  moment de l'appel (`shell.ts:654`), et l'ordre `ask` → `run` est inchangé. Un marqueur
  qui décrit la perte d'information ne peut pas transformer une demande refusée en demande
  acceptée.
- **Faux positif d'alerte.** `previewTruncated` peut signaler une troncature là où le
  récepteur n'en attendait pas. Acceptable : une alerte à tort sur une troncature réelle
  est le bon sens de failsafe, l'inverse ne l'est pas. Le marqueur in-band est
  auto-vérifiable par le lecteur (les chiffres annoncés sont exacts), donc un faux
  positif est détectable par le récepteur lui-même.
- **Marqueur dans un texte ASCII-art / données tabulaires.** Le marqueur au milieu peut
  atterrir au milieu d'une colonne. Acceptable : la perte d'information étant de toute
  façon la norme, et le marqueur est sur une ligne vide de part et d'autre.

---

## 7. Tests

### 7.1 Test unitaire de `preview` / `previewWindow` (nouveau fichier)

- **Chemin exact :** `packages/opencode/test/tool/shell-preview.test.ts`
- **Commande exacte :** `bun test --timeout 30000 test/tool/shell-preview.test.ts`, avec
  `workdir` = `C:\jeanluc\opencode-fork\packages\opencode` (le script `test` du paquet est
  `bun test --timeout 30000`, `package.json:10`).
- **Imports :** `{ preview, previewWindow }` depuis `@/tool/shell`. L'alias `@/` est
  déjà en usage dans `packages/opencode/test/tool/registry.test.ts:7` (`@/tool/registry`),
  donc l'import est valide sans configuration supplémentaire.

Critères de succès observables, tous sur le **retour structuré** :

1. sortie de 29 999 unités → `preview(s)` vaut `{ text: s, truncated: false }`, sans
   marqueur dans `text`.
2. sortie de 30 001 unités dont les 10 premières sont `"HEADMARK"` → `preview(s).text`
   **contient** `"HEADMARK"` et `.truncated === true`. *Échoue aujourd'hui : la tête est
   perdue et aucun retour n'existe.*
3. `preview(s).text` contient `"[... 1 characters omitted"`, `"first 7500"` et
   `"last 22500"`.
4. **budget** : `expect(preview(s).text.length).toBeLessThanOrEqual(30_000 + 72 + 1)`.
5. sortie de 200 000 unités → `preview(s).text` contient `"[... 170000 characters
   omitted"` et `preview(s).truncated === true`.
6. aucune occurrence de `U+FFFD` dans `preview(s).text` pour une entrée dont la coupe de
   tête tombe dans une paire de surrogates (par exemple `"x" + "\u{1F600}".repeat(20_000)`,
   où l'index 7 500 tombe au milieu d'une paire).

**7.1-bis — Test de la fenêtre en flux (le test qui manquait, et qui est le garde-fou de
l'objection centrale).** C'est le test qui échoue avec la détection de la v1 et passe
avec la fenêtre :

7. pousser 4 chunks dans `previewWindow()` puis, à chaque `get()`, vérifier que
   `truncated` passe à `true` dès que le total dépasse 30 000, que `text` contient la
   tête du **premier** chunk, et que `text.split("[... ").length - 1 === 1` — **un seul**
   marqueur, jamais un par chunk.
8. pousser 200 000 unités par chunks de 130 caractères, puis `get()` : `truncated === true`,
   `text` contient `"[... 170000 characters omitted"`, `text.length ≤ 30_000 + 72 + 1`, et
   `text` contient les 130 premiers caractères du flux. *Échoue avec
   `body !== (last || output)`, qui vaut `last !== last`.*

### 7.2 Test d'intégration du marqueur de drain

Réécrit conformément à `packages/opencode/test/AGENTS.md`, qui **interdit l'attente par
temps fixe** : « *Using `Effect.sleep(N)` or `setTimeout` as a "wait for the forked fiber
to be ready" hack races the scheduler… the test fails intermittently* »
(`test/AGENTS.md:165`) et « *Wait on a **published readiness signal**, not wall-clock
time* » (`test/AGENTS.md:169`), avec pour affordance
`pollWithTimeout(effect, message, duration?)` depuis `test/lib/effect.ts`
(`test/AGENTS.md:171`).

- **Chemin exact :** `packages/opencode/test/tool/shell.test.ts`, dans le `describe`
  existant à partir de `shell.test.ts:1161`, en réutilisant le motif de capture de
  `ctx.metadata` déjà présent à `shell.test.ts:1146-1150`.
- **Commande exacte :** `bun test --timeout 30000 test/tool/shell.test.ts`
- **Condition de déclenchement, structurelle et non temporelle :** il faut que le
  processus **termine** pendant que le **pipe reste ouvert**, pour que le
  `Effect.sleep("200 millis")` (`shell.ts:580`) gagne la course contre
  `Fiber.join(streamFiber)` (`shell.ts:579`). On obtient cela avec un **enfant
  détaché qui hérite du descripteur** — ce que le commentaire de production
  (`shell.ts:575-577`) nomme lui-même comme le cas à borner (« *a pipe kept open by a
  background child (e.g. a PowerShell Start-Process)* »).
- **Commande de test :** `sh -c 'printf start; sleep 5 &'` (POSIX) et
  `pwsh -NoProfile -Command "Write-Output start; Start-Process pwsh -ArgumentList '-NoProfile','-Command','Start-Sleep 5'"`
  (Windows, à sélectionner sur `process.platform === "win32"`, comme le fait déjà la
  production à `shell.ts:301`). L'enfant dort 5 s ; la grâce est de 200 ms ; le facteur de
  marge est **25×**, et l'inversion de la condition est impossible à 25× de marge.
- **Harnais :** `it.live(...)`, car le test dépend d'un processus enfant et de temps réel
  (`test/AGENTS.md:110`).
- **Critère de succès :** `result.output` **contient** `trailing output may be missing`.
  *Échoue aujourd'hui : `meta` reste vide et `shell.ts:588-593` n'est pas déclenché dans
  ce cas.*
- **Pas d'attente par horloge :** le test n'appelle ni `Effect.sleep` ni `setTimeout`.
  Il observe un **effet observable** (le message dans `output`), exactement comme
  `prompt.test.ts:2388-2396` observe `tool.state.metadata?.output.includes("first")` via
  `pollWithTimeout`.

### 7.3 Non-régression

- **Commande :** `bun test --timeout 30000 test/tool/shell.test.ts test/tool/shell-preview.test.ts test/tool/shell-output-prompt.test.ts test/tool/shell-launch-retry.test.ts test/session/prompt.test.ts test/shell/shell.test.ts test/pty/pty-shell.test.ts`
- **Critère :** 0 échec, et `bun typecheck` (script `tsgo --noEmit`, `package.json:9`)
  sans erreur.

---

## 8. Effort

**S** — une fonction de fenêtrage et une fenêtre accumulée à la place de l'appel par
chunk, deux garde-fous UTF-8, un drapeau `drained`, un champ `previewTruncated`, un test
unitaire nouveau (dont un test de flux), un test d'intégration. Aucun changement de
schéma, de configuration ni de migration.

---

## 9. Verdict self-assessment

**PASS_WITH_CHANGES** — les six objections du verdict sont levées et le mécanisme de
détection est corrigé à la source. Les deux points de politique que la v1 renvoyait au
validateur sont **tranchés ici** :

1. **Le ratio tête/queue** → **0,25** (§4.1), avec la justification : la queue est la
   seule partie déjà visible dans le produit, donc c'est là que la régression se verrait ;
   la tête est un gain. Le budget total reste 30 000 unités ; le ratio est une constante,
   son changement ne coûte rien.
2. **Le filtre de secrets** → **la question d'arbitrage est retirée**. La v1 posait «
   l'aperçu est-il livrable sans filtre ? » comme décision humaine. Elle n'a pas lieu
   d'être : le constat vérifié est qu'`src/tool/shell.ts` ne contient aucun filtre
   (`grep` sans correspondance), et non qu'un arbitrage est requis. Le finding est
   reclassé en finding tracé (F-3, `out_of_scope`, §11), avec ses deux bornes (§6) : le
   texte vu par le modèle n'est pas fenêtré, et `metadata` accepte un champ supplémentaire
   par construction.

Aucune objection résiduelle `open`.

---

## 10. Traçabilité des Required changes du verdict

| # | Required change (verdict) | Où c'est traité | Statut |
|---|---|---|---|
| **RC1** | Réécrire la section 6 : supprimer « approuver une commande dont il n'a pas vu le préambule » et « le modèle ne voit pas la tête », citer `shell.ts:654`/`:658`/`:297`/`:620`/`:614` et `session/tools.ts:691`, reclasser en priorité basse. | §1 (paragraphe « Sévérité », avec les six citations) et §6 (« Sévérité réelle : faible » et « Comparaison avec le risque ») ; reclassement en §1 et §9 | traité |
| **RC2** | Corriger §4.3 : remplacer `body !== (last \|\| output)` par un **retour structuré** de `preview()` transmettant le booléen de troncature. | §4.1 (`type Preview`, `preview()` retourne `{ text, truncated }`) + §4.3 (`previewWindow`, drapeau propagé, `previewTruncated`) ; la comparaison de chaînes est **supprimée** et son impossibilité est démontrée en §4.3 et nommée en §5.6 | traité |
| **RC3** | Rendre §7.2 exécutable de façon déterministe conformément à `test/AGENTS.md`, ou le retirer. | §7.2 réécrit : condition structurelle (enfant détaché qui tient le pipe), marge 25×, `it.live`, aucun `Effect.sleep`/`setTimeout`, observé via `pollWithTimeout` comme `prompt.test.ts:2388-2396`. **Le test est conservé, pas retiré.** | traité |
| **RC4** | Documenter dans §4.2 que le message de drain atteint `output` (donc le modèle) et non `metadata.output` (donc pas l'affichage TUI). | §4.2, paragraphe « Ce que ce message atteint, et ce qu'il n'atteint pas » | traité |
| **RC5** | Remplacer l'INFERE (lignes 110-117) par la citation `index.tsx:2462-2471`, en tirer la conséquence sur `maxLines = 10`, corriger les deux bornes de citations de tests. | §2 : citation `index.tsx:2462-2471` + paragraphe « Conséquence tirée » ; bornes corrigées en §6 (`shell.test.ts:1161`, bloc `:1162-1229`, et `:1134-1158` avec l'assertion à `:1155`). L'INFERE sur `handle.all` (§3 étape 2) est **supprimé** faute d'avoir été relu. | traité |
| **RC6** | Compléter le chiffrage du coût par la republication par chunk (`shell.ts:512` + `:540-544`). | §6, puce « Coût dominant : la republication par chunk » : le volume par publication est **inchangé** (30 000 unités), l'ajout est le marqueur (~70 unités × N chunks) en mémoire TUI, et le surcoût de calcul est borné. | traité |

---

## Regressions introduced

**Aucun test vert n'est cassé.** Déclaration explicite exigée par la règle
d'implémentabilité (`docs/harness-audit/REVALIDATION-BRIEFS.md:69-71`).

Cette déclaration est une **déclaration d'analyse**, pas un résultat d'exécution : cette
machine n'autorise aucun shell (`EPERM`), donc aucune suite de tests n'a été lancée. La
justification est la suivante, et chaque assertion existante qui lit la donnée modifiée a
été relue une par une :

| assertion existante relue | chemin touché | impact de P14 |
|---|---|---|
| `shell.test.ts:184` — `expect(result.metadata.output).toContain("test")`, commande `echo test` (`:180`) | `metadata.output` via `preview()` | 10 unités ≪ 30 000 → aucun marqueur, sortie identique |
| `shell.test.ts:1155` — `expect(updates.length).toBeGreaterThan(1)`, commande `echo first && sleep 0.1 && echo second` (`:1141`), capture à `:1146-1150` | republication par chunk | ~25 unités ≪ 30 000 → jamais fenêtré, la suite des `metadata.output` est identique |
| `shell.test.ts:1172`, `:1188` — `/\.\.\.output truncated\.\.\./` sur `result.output` | **aucun** : `output` vient de `tail()` (`:601`) et du préfixe `:605` | nul |
| `shell.test.ts:1202` — `metadata.truncated === false` | `cut` inchangé | nul |
| `shell.test.ts:1219` — `metadata.outputPath` truthy | `cut && file` inchangé | nul |
| `prompt.test.ts:2671` — `metadata.truncated === true` | `cut` inchangé | nul |
| `prompt.test.ts:2672` — `metadata.outputPath` string | `cut && file` inchangé | nul |
| `prompt.test.ts:2673`, `:2674` — `...output truncated...` / `Full output saved to:` sur `output` | **aucun** | nul |
| `prompt.test.ts:2675` — `output` ne contient pas `"Tool execution aborted"` | `output` | nul : §4.2 ajoute son message **après** l'abandon, donc seulement si `aborted`, et il ne contient pas cette chaîne |
| `prompt.test.ts:2251`, `:2252` — `metadata.output` contient `out`/`err`, commande `printf out && printf err >&2` (`:2242`) | `metadata.output` via `preview()` | ~7 unités ≪ 30 000 → identique |
| `prompt.test.ts:2276`, `:2323`, `:2349` — `metadata.output` contient un chemin, sur des sorties de répertoire | `metadata.output` via `preview()` | sorties courtes (un chemin) ≪ 30 000 → identiques |

Le **seul** test existant dont la sortie traverse réellement la fenêtre est
`prompt.test.ts:2651-2657` (4 000 lignes ≈ 520 000 octets, donc ≫ 30 000 unités) : sa
sortie **franchit** `preview()` et le marqueur apparaîtra dans `metadata.output`. Aucune
de ses assertions (`:2671` à `:2675`) ne porte sur la forme de `metadata.output` — vérifié
par lecture des lignes `:2671-2675`. Aucun test vert n'est donc cassé.

**Risque résiduel d'exécution : un seul test vert est réellement exposé**, et c'est le
nouveau test de §7.1-bis : il échoue si la fenêtre est mal câblée. Si §7.1-bis échoue, le
correctif est en cause, pas le test.

---

## 11. Remaining objections

- **`accepted`** — *Objection 1 (sévérité appuyée sur une branche inexistante).* Levée :
  §1 et §6 réécrits avec les six citations exigées, priorité reclassée **basse**, et la
  branche « approuver sans voir le préambule » supprimée. *Réserve assumée et tracée :*
  la reclassification doit être répercutée dans `MATRIX.md` et `REVISIONS.md`, que ce
  document **n'a pas le droit d'écrire** (règle d'implémentabilité, interdiction
  d'écrire un autre fichier). Les effets sur la priorisation de l'audit restent donc à
  propager par l'orchestrateur.
- **`accepted`** — *Objection 2 (§4.3 ne propage pas le signal en flux).* Levée : la
  détection ne déduit plus rien d'une égalité de chaînes ; `preview()` retourne
  `{ text, truncated }` et la fenêtre `previewWindow` propage un drapeau exact dérivé de
  `seen`, ce qui rend la condition vraie dans le cas streamé — le cas que la v1 ratait.
  *Réserve assumée et tracée :* le garde-fou est le test 7.1-bis-8, **non exécuté** ici
  (voir §12).
- **`accepted`** — *Objection 3 (le test du drain attend une horloge).* Levée : §7.2 est
  réécrit sur une condition structurelle (enfant détaché qui tient le pipe), avec une
  marge de 25× et sans aucune attente par temps fixe, conformément à `test/AGENTS.md:165`
  et `:169`. *Réserve assumée et tracée :* la chaîne de commande Windows
  (`pwsh -NoProfile -Command "Start-Process …"`) est spécifiée mais **non exécutée** ;
  à confirmer sur un hôte Windows à l'implémentation, en privilégiant l'expérience d'un
  `it.live` déjà vert plutôt qu'un marqueur de test instable.
- **`accepted`** — *Objection 4 (§4.2 répare la visibilité du modèle, pas celle de
  l'opérateur).* Levée : §4.2 énonce explicitement que le message n'atteint que `output`
  (`shell.ts:608-610`) donc le modèle (`session/tools.ts:691`), et **pas**
  `metadata.output` donc pas l'affichage TUI (`index.tsx:2467`,
  `session-v2.tsx:742`). Le correctif est donc présenté comme plus étroit qu'il n'est.
  *Réserve assumée et tracée :* rendre le message visible à l'opérateur exigerait de le
  pousser dans `last` ; c'est **finding F-4**, hors périmètre de P14.
- **`accepted`** — *Objection 5 (l'INFERE du rendu est infirmé ; bornes de citations
  imprécises).* Levée : l'INFERE est remplacé par la citation `index.tsx:2462-2471` et
  `:2493`, la conséquence sur `maxLines = 10` (`index.tsx:2469`, texte complet seulement
  après expansion, `:2473`) est tirée et **abaisse encore la sévérité** ; les deux bornes
  de tests sont corrigées (`shell.test.ts:1161` avec bloc `:1162-1229`, et `:1134-1158`
  avec l'assertion `:1155`). L'INFERE sur `handle.all` a été supprimé. *Réserve :*
  aucune.
- **`accepted`** — *Objection 6 (le coût dominant n'est pas celui qui est chiffré).*
  Levée : §6 chiffre la republication par chunk — volume par publication **inchangé**
  (30 000 unités, `shell.ts:512` + `:529-535` + `:540-545`), surcoût additionnel =
  marqueur (~70 unités × N chunks) **en mémoire TUI et non facturé au modèle**, surcoût
  de calcul borné à deux `slice` par chunk. *Réserve assumée et tracée :* le nombre `N`
  de chunks dépend du découpage du flux et n'est pas mesurable par lecture ; il n'entre
  dans aucun chiffre de décision.

**Findings ouverts par cette révision (statut hors mécanisme d'objection) :**

- **`out_of_scope`** — **F-3 : aucune rédaction de secrets dans `src/tool/shell.ts`**
  (`grep` sans correspondance sur `redact|secret|mask|apiKey|credential`). P14
  réintroduit en tête de `metadata.output` des unités qui étaient jetées. Justification de
  la mise hors périmètre : (i) le texte vu par le modèle (`shell.ts:620`,
  `session/tools.ts:691`) n'est **pas** fenêtré par P14 — l'exposition ne concerne que
  `metadata.output` ; (ii) `metadata` est un `Record(String, Any)`
  (`message-v2.ts:113`), donc l'ajout de champ est sans migration ; (iii) une rédaction
  de secrets est un changement **transversal à tous les outils**, pas un correctif
  d'affichage, et le chemin de transport au-delà de `shell.ts` n'a pas été audité par ce
  document. **Décision d'arbitrage à prendre par l'orchestrateur, pas par ce document** :
  si `metadata.output` est considéré comme exposé au fournisseur, ce finding doit être
  promu en proposition séparée **avant** l'implémentation de P14. Ce document ne le
  tranche pas : il n'a pas les éléments pour le faire.
- **`out_of_scope`** — **F-4 : le marqueur de drain n'atteint pas l'opérateur** (§4.2).
  Le corriger demanderait d'injecter le message dans `last`/`metadata.output`, ce qui
  contamine l'aperçu vivant et le test de progression (`shell.test.ts:1134`). Relève de
  P17 / F-L3.
- **`out_of_scope`** — **F-5 : la fenêtre de troncation muette dépend de la
  configuration** (`truncate.ts:42-44`). Avec un `tool_output` qui abaisse `maxBytes`
  sous 30 000, la fenêtre n'existe plus ; avec `maxBytes` relevé, elle s'élargit. Le
  correctif est correct dans tous les cas, mais **la fréquence du défaut est
  configuration-dépendante** et ne peut pas être affirmée plus finement par lecture.

---

## 12. Ce qui n'a pas pu être vérifié par exécution

Cette machine n'autorise pas l'exécution de commandes (`EPERM` sur tout shell). Aucune
suite de tests n'a donc été lancée. Ce qui **est** établi par lecture, et par quoi :

- **Aucun test existant n'assert la forme de `preview()`** au-delà de 30 000 unités : le
  grep exhaustif de `metadata` sur `test/tool/shell.test.ts` ne retourne que `:72`,
  `:165`, `:168`, `:170`, `:183`, `:184`, `:207`, `:1045`, `:1047`, `:1115`, `:1129`,
  `:1134`, `:1146`, `:1148`, `:1202`, `:1219` — dont les seules assertions sur
  `metadata.output` sont `:184` (10 unités) et la capture de progression `:1148` (~25
  unités) ; les assertions sur `metadata.truncated` sont `:1202` (sortie petite) et
  `prompt.test.ts:2671` (chemin lignes/octets). `metadata.outputPath` (`:1219`,
  `prompt.test.ts:2672`) n'est pas affecté par la redistribution.
- **Les commandes exactes sont données** (`bun test --timeout 30000 …`, `bun typecheck`)
  et le harnais est identifié, mais **les sorties n'ont pas été observées**. La
  déclaration de §6 « aucun test vert n'est cassé » est donc une **déclaration
  d'analyse**, pas un résultat d'exécution.

---

## 13. Note de mise à jour — verdict et statut

Le verdict `P14-verdict.md` (203 lignes) conclut `PASS_WITH_CHANGES` avec six objections
et six Required changes. Cette révision est la réponse à ce verdict. Le statut de
priorité est **bas** (§1). L'arbitrage humain « quel filtre de secrets ? » qui figurait
dans les listes de révision antérieures est **sans objet** : le constat vérifié est
l'absence de filtre dans `src/tool/shell.ts`, ce qui est un finding à part entière
(F-3), pas un choix de design propre à P14. Aucun arbitrage humain n'est requis pour
implémenter P14 ; la seule décision à remonter est celle de F-3 (voir §11), qui est une
question de politique de sécurité et non une objection technique à cette proposition.