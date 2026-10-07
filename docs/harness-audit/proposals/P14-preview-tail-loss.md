# P14 — Aperçu d'une commande : la tête de la sortie disparaît sans marqueur

## 1. Problem

Quand la sortie d'une commande dépasse 30 000 caractères, l'aperçu envoyé au modèle ne
garde que les 30 000 derniers caractères : le début du texte disparaît en silence, sans
marqueur et sans que l'indicateur `truncated` ne le signale, si bien que l'approbateur ou
le modèle peut se fier à un aperçu dont il ne voit plus la partie qui dit ce que la
commande a réellement fait.

## 2. Evidence

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

`packages/opencode/src/tool/shell.ts:512` — la même fonction appliquée à chaque chunk du flux,
donc la tête perdue l'est définitivement et ne revient jamais :

```ts
last = preview(last + chunk)
```

`packages/opencode/src/tool/shell.ts:614` — le champ final qui alimente l'aperçu :

```ts
output: last || preview(output),
```

`packages/opencode/src/tool/shell.ts:596` et `:617` — `truncated` ne reflète que la troncature
lignes/octets de `tail()`, jamais celle de `preview()` :

```ts
if (end.cut) cut = true
```

```ts
truncated: cut,
```

`packages/opencode/src/tool/shell.ts:604-605` — le seul avertissement existant concerne le
fichier complet, il n'est émis que si `cut` est vrai :

```ts
if (cut && file) {
  output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
```

`packages/opencode/src/tool/shell.ts:240-242` — les limites de `tail()` sont bien plus
généreuses que le plafond de `preview()`, d'où une sortie possiblement non marquée :

```ts
function tail(text: string, maxLines: number, maxBytes: number) {
  const lines = text.split("\n")
  if (lines.length <= maxLines && Buffer.byteLength(text, "utf-8") <= maxBytes) {
```

`packages/opencode/src/tool/truncate.ts:15-16` — ces limites valent 2 000 lignes et 50 KiB,
soit environ 1,7 fois le plafond de 30 000 caractères :

```ts
export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
```

`packages/opencode/src/tool/shell.ts:573-581` — le drain borné à 200 ms coupe le consommateur
de flux sans produire de signal (cas connexe P17 / F-L3) :

```ts
yield* Effect.raceAll([
  Fiber.join(streamFiber).pipe(Effect.asVoid, Effect.ignore),
  Effect.sleep("200 millis"),
]).pipe(Effect.ignore)
```

`packages/opencode/src/tool/shell.ts:566` et `:570` — les **seuls** cas où `meta` reçoit
un message aujourd'hui : l'abort et le timeout, tous deux suivis d'un `kill` identique.

`packages/opencode/src/tool/shell.ts:566` (abort) :

```ts
yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
```

`packages/opencode/src/tool/shell.ts:570` (timeout) :

```ts
yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
```

`packages/opencode/src/tool/shell.ts:608-610` — les messages de `meta` n'atteignent que
`output`, jamais le champ `metadata` affiché pendant l'exécution :

```ts
if (meta.length > 0) {
  output += "\n\n<shell_metadata>\n" + meta.join("\n") + "\n</shell_metadata>"
```

`INFERE:` le composant TUI qui rend `metadata.output` pendant l'exécution n'a pas été
localisé : le grep `metadata\??\.output` sur `packages/opencode/src` ne retourne que
`src/session/message-v2.ts:1089` et `src/tool/terminal-output.ts:144` (qui lit
`metadata.outputPath`). Le rendu de l'aperçu vivant est donc probablement dans
`packages/app`. Vérification : grep `output` sur les composants de carte d'outil de
`packages/app/src` et lecture du rendu de `metadata`. Cette inférence ne change pas le
correctif proposé, qui porte sur la production de la chaîne, mais elle conditionne la
section 6 (l'aperçuigrant-il est-il visible à l'écran pendant la course ?).

## 3. Mechanism

1. `execute` (`shell.ts:636`) parse la commande, puis `ask` (`shell.ts:654`) demande la
   permission. À ce moment `ctx.ask` reçoit `metadata: {}` (`shell.ts:293-298`), donc
   l'aperçu de sortie **n'est pas** transmis à la boîte d'approbation : la surface
   d'approbation est alimentée par `scan.patterns` et `scan.always`
   (`shell.ts:295-296`), pas par `preview()`.
2. `run` (`shell.ts:658`) démarre le processus et fork le consommateur de flux
   (`shell.ts:500-501`) sur `handle.all`. `INFERE:` `handle.all` fusionne stdout et stderr
   en un seul flux, donc la troncature de `preview()` ne distingue pas les deux, et une
   erreur, comme la sortie standard, peut être coupée par la fenêtre de 30 000 caractères.
   Vérification : lire l'implémentation de `all` dans `effect/unstable/process`, ou lever un
   `child.stdout` et un `child.stderr` séparés sur un `stdio: ["pipe","pipe","pipe"]` et
   comparer `list` à la sortie observée.
3. À chaque chunk, `last = preview(last + chunk)` (`shell.ts:512`) concatène puis retranche.
   Dès que `last` dépasse 30 000 caractères, `preview()` ne renvoie plus que la queue : la
   tête est définitivement perdue, et le préfixe `"...\n\n"` (`shell.ts:237`) ne dit ni
   combien de caractères ont disparu, ni où.
3. Le même `last` est poussé vers le canal de progression à chaque chunk
   (`shell.ts:540-545`), donc l'aperçu vivant pendant l'exécution est déjà amputé de sa tête
   bien avant la fin.
4. `ctx.metadata` est aussi appelé au moment du basculement vers un fichier
   (`shell.ts:529-535`), donc le premier `metadata` publié peut déjà être tronqué.
5. À la fin, `tail()` (`shell.ts:595`) applique les limites lignes/octets ; si la sortie
   respecte 2 000 lignes et 50 KiB mais dépasse 30 000 caractères, `end.cut` est `false`
   (`shell.ts:242`), donc `cut` reste `false`, donc `truncated: false` (`shell.ts:617`) et
   aucun `outputPath` (`shell.ts:618`), et l'avertissement `:605` n'est pas émis.
6. Le résultat part avec `title: input.description` (`shell.ts:612`) et
   `metadata.output = last || preview(output)` (`shell.ts:614`) : `title` ne porte que la
   description fournie par le modèle, jamais la sortie ; c'est donc bien `metadata.output`
   qui est l'aperçu, et il est amputé de sa tête sans qu'aucun champ ne l'indique.
   Le récepteur ne peut distinguer « la commande n'a produit que ces 30 000 derniers
   caractères » de « 200 000 caractères ont été produits et les 170 000 premiers ont été
   jetés ».
7. Cas connexe P17 / F-L3 : à la fin, la course `Fiber.join(streamFiber)` contre
   `Effect.sleep("200 millis")` (`shell.ts:578-581`) se termine au bout de 200 ms quoi qu'il
   arrive. Si le sleep gagne, le consommateur de flux est interrompu à la fermeture du scope
   (commentaire `:577`) et les derniers octets sont perdus **sans aucun signal** :
   `meta` (`:587-593`) ne reçoit rien dans ce cas, et même quand il reçoit quelque chose il
   n'atteint pas `metadata` (`:608-610`).

## 4. Proposal

Un seul fichier source modifié : `packages/opencode/src/tool/shell.ts`. Aucun changement de
schéma, de configuration, ni de format de sortie persisté.

### 4.1 `preview()` conserve tête et queue, avec le compte exact des caractères omis

`preview` devient une répartition du **même** budget de 30 000 caractères, pas un ajout.
Le marqueur est explicite et chiffré, et il est placé **au milieu**, entre les deux
fragments conservés.

```ts
const HEAD_SHARE = 0.25

export function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  const head = Math.floor(MAX_METADATA_LENGTH * HEAD_SHARE)
  const tail = MAX_METADATA_LENGTH - head
  const omitted = text.length - head - tail
  const marker = `\n\n[... ${omitted} characters omitted — first ${head} and last ${tail} shown ...]\n\n`
  return text.slice(0, head) + marker + text.slice(-tail)
}
```

Points de conception :

- **Aucun agrandissement du budget.** `head + tail === MAX_METADATA_LENGTH` ; seul le
  marqueur (~90 caractères) s'ajoute, soit +0,3 % au pire cas. Le coût token maximal d'un
  appel reste donc celui d'aujourd'hui.
- **La tête est celle qui porte le sens.** Les premières lignes d'une sortie de commande
  contiennent l'invocation, la version, le contexte, ou la première erreur — précisément ce
  qui manque aujourd'hui. `HEAD_SHARE = 0.25` (7 500 caractères) est un plancher prudent ;
  le ratio est le point à trancher en section 9.
- **Le marqueur est au milieu, pas en tête.** C'est la seule forme qui dit *où* l'information
  manque. Un préfixe `"..."` en tête est indistinguable d'une sortie dont le début a
  simplement été omis par l'outil en amont.
- **Le compte est exact**, en caractères, et les deux tailles conservées sont annoncées :
  l'approbateur peut vérifier que 7 500 + 22 500 + N = longueur d'origine.
- `export` est ajouté pour rendre la fonction testable unitairement (elle est aujourd'hui
  privée, `shell.ts:235`) ; c'est le seul changement de surface de l'API du module.

**Frontière UTF-8.** `slice` découpe par unités de code et peut séparer une paire de
surrogates. `tail()` prend déjà une précaution équivalente à `shell.ts:258`. Le même garde-fou
est ajouté sur la coupe de tête :

```ts
function cutStart(text: string, at: number) {
  let i = at
  while (i > 0 && i < text.length) {
    const code = text.charCodeAt(i)
    if (code >= 0xdc00 && code <= 0xdfff) i--
    else break
  }
  return text.slice(0, i)
}
```

### 4.2 Marqueur pour le drain 200 ms coupé (P17 / F-L3)

Correction minimale, sans changer la course existante. Un drapeau `let drained = false`
est positionné à la fin du `Stream.runForEach` (`shell.ts:501-546`) ; après la course de
`shell.ts:578-581`, le drapeau est lu et, s'il est `false`, un message est ajouté à `meta`
(`shell.ts:587-593`), qui atteint déjà `output` via `shell.ts:608-610`.

```ts
let drained = false
// ... shell.ts:500, le fork se termine par :
.pipe(Effect.andThen(Effect.sync(() => { drained = true })))

// ... après la course de shell.ts:578-581 :
if (!drained) {
  meta.push(
    `output stream was still open when the 200 ms drain grace period expired; trailing output may be missing — re-run with a larger timeout or redirect to a file to capture it completely`,
  )
}
```

### 4.3 Rendre `truncated` honnête

Puisque `metadata.output` peut désormais être amputé même quand `cut` est `false`
(`shell.ts:596`, `:617`), `metadata` distingue les deux causes de troncature au lieu de
réutiliser un seul booléen qui ment. Au minimum, `preview()` signale s'il a tronqué, et
`:614` propage ce signal :

```ts
const body = last || preview(output)
// metadata : { ..., truncated: cut, outputTruncated: body !== (last || output) }
```

### 4.4 Ce qui reste volontairement inchangé

- **`tail()` (`shell.ts:240-270`) et ses limites** (`truncate.ts:15-16`) : la troncature
  lignes/octets, avec écriture du fichier complet (`shell.ts:598`) et l'avertissement
  `:605`, est un comportement correct et doit être conservé tel quel. P14 ne porte que sur
  la fenêtre d'aperçu de 30 000 caractères.
- **Le budget de 30 000 caractères** (`shell.ts:29`) : inchangé. P14 redistribue, il
  n'agrandit pas. Une augmentation du plafond est traitée en section 5.
- **La course 200 ms** (`shell.ts:578-581`) : le bornage anti-zombie est justifié par le
  commentaire `:573-577` et reste en place ; seule la **signalisation** de la coupure est
  ajoutée. Le vrai correctif P17 (drain complet) est hors périmètre.
- **L'ordre des appels** `ask` puis `run` (`shell.ts:654`, `:658`) : la demande de
  permission précède l'exécution, donc `preview()` ne peut structurellement pas alimenter la
  boîte d'approbation. Faire dependre l'approbation de la sortie exigerait une exécution
  préalable, ce qui est une décision de produit bien au-delà de P14.
- **`scan.always` (`shell.ts:296`)** : la logique d'autorisation persistante est hors
  périmètre ; elle est mentionnée ici parce que c'est le champ que l'approbateur lit
  réellement au moment du `ask`.

## 5. Alternatives considered

1. **Agrandir `MAX_METADATA_LENGTH`** (`shell.ts:29`) de 30 000 à, disons, 100 000.
   Rejeté : cela augmente le coût token de *chaque* gros output de ~17 500 tokens, sur
   toutes les sessions, pour un défaut qui est un problème de *disposition* de la fenêtre,
   pas de taille. La redistribution règle le défaut à coût nul.
2. **Conserver la queue seule, mais ajouter le compte des caractères omis.** Rejeté :
   peu coûteux, et c'était l'option de repli ; mais elle ne restaure pas la partie qui dit ce
   que la commande fait. Elle laisse intacte la moitié du problème, qui est la perte
   d'information, pas seulement l'absence d'indication. Conservée comme partie du correctif,
   pas comme substitut.
3. **Supprimer toute troncature et tout envoyer.** Rejeté : un `tsc --noEmit` ou un
   `git log -p` produit plusieurs mégaoctets ; le coût en tokens et en latence serait
   catastrophique, et le plafond existe pour une raison.
4. **Écrire systématiquement la sortie complète dans un fichier et ne renvoyer que le
   chemin**, comme le fait déjà `trunc.write` (`shell.ts:598`). Rejeté en correctif unique :
   cela déplace la charge vers le modèle (un `read` de plus par gros output, donc un aller-
   retour et des tokens bien supérieurs à 20) et échoue précisément quand le fichier n'est
   pas accessible. Reste la bonne stratégie pour le chemin *lignes/octets*, déjà en place.
5. **Faire dépendre l'approbation de la sortie** en exécutant d'abord, puis demandant.
   Rejeté : changement de modèle d'exécution et de produit, hors périmètre de P14.

## 6. Risks

- **Régression sur les tests existants.** Le bloc `describe("tool.shell truncation")` de
  `packages/opencode/test/tool/shell.test.ts:1161-1220` asserte
  `/\.\.\.output truncated\.\.\./` sur `result.output` (`:1172`, `:1188`) et
  `metadata.outputPath` (`:1219`) : ces assertions portent sur la troncature
  lignes/octets, inchangée, et restent vertes. `:184` asserte
  `expect(result.metadata.output).toContain("test")` sur une sortie courte : non Concernée.
  Le test de progression `it.live("streams metadata updates progressively")`
  (`shell.test.ts:1134-1148`) capture `metadata.output` à chaque chunk et vérifie qu'il
  croît : il faut confirmer qu'il continue de croître sous la forme tête+queue, ce qui est
  vrai tant que la sortie streamée n'atteint pas 30 000 caractères, et c'est précisément ce
  que le nouveau test fixe. Fichiers à exécuter intégralement :
  `packages/opencode/test/tool/shell.test.ts`,
  `packages/opencode/test/tool/shell-output-prompt.test.ts`,
  `packages/opencode/test/tool/shell-launch-retry.test.ts`,
  `packages/opencode/test/shell/shell.test.ts`,
  `packages/opencode/test/pty/pty-shell.test.ts`.
- **Coût en tokens, chiffré.** Répartition à budget constant : `head + tail` vaut
  exactement 30 000 caractères, comme aujourd'hui. Sortie ASCII majoritaire, donc
  ~4 caractères par token : le pire cas reste **~7 500 tokens** par appel, inchangé. Le
  marqueur ajoute ~90 caractères, soit **~23 tokens**. Delta net : **zéro à l arrondi près**,
  plus 23 tokens. Le coût n'est donc pas une tête conservée en plus, c'est une queue
  réduite d'autant.
- **Comparaison avec le risque.** 23 tokens sont négligeables ; l'inspection d'un
  aperçu amputé de ses 170 000 premiers caractères ne l'est pas. Concrètement, si le modèle
  ou l'approbateur ne voit pas la tête d'une sortie de 200 000 caractères, il peut soit
  approuver une commande dont il n'a pas vu le préambule (donnée perdue, action
  irréversible), soit relire le fichier complet — un aller-retour de 7 500 à 50 000 tokens,
  soit **100 à 2 000 fois** le coût du marqueur. Le rapport est d plusieurs ordres de
  grandeur en faveur du correctif.
- **Latence.** Nulle : `preview()` reste une opération de découpe sur une chaîne déjà en
  mémoire. Le drapeau `drained` et le test associé sont O(1). Le `slice` de tête ne change
  pas le caractère O(n) par chunk de `preview(last + chunk)` (`shell.ts:512`), inchangé.
- **Risque de sécurité : ré-exposition de secrets.** C'est le risque principal et il est
  réel. La troncature queue-seule agit aujourd'hui comme une **expurgation accidentelle** :
  si une clé ou un jeton est imprimé dans les premières lignes d'un dump verbeux, il est
  aujourd'hui jeté par `preview()` ; le réintroduire réexpose un secret vers le modèle et le
  fournisseur. Le correctif doit donc être accompagné d'une vérification que le chemin de
  sortie de la commande applique bien un filtre de secrets. `INFERE:` aucun filtre de
  secrets n'a été trouvé sur le chemin `handle.all` → `preview()` → `metadata.output` dans
  les lignes lues. Vérification : grep `redact|secret|mask|apiKey` sur
  `packages/opencode/src/tool/shell.ts` et sur le constructeur de `handle.all` ; si aucun
  filtre n'existe, ce risque doit être traité comme un finding séparé et le validateur doit
  décider si P14 est livrable sans lui.
- **Risque de contournement de permission.** Aucun : P14 ne touche ni
  `scan.patterns`, ni `scan.always` (`shell.ts:295-296`), ni l'appel `ctx.ask`
  (`shell.ts:293-298`), ni le moment de l'appel (`shell.ts:654`). Un marqueur qui décrit la
  perte d'information ne peut pas transformer une demande refusée en demande acceptée.
- **Faux positif d'alerte.** Le marqueur 4.3 peut signaler une troncature là où le
  récepteur n'en attendait pas. Acceptable : une alerte à tort sur une troncature réelle est
  le bon sens de failsafe, l'inverse ne l'est pas.

## 7. Tests

### 7.1 Test unitaire de `preview` (nouveau fichier)

- **Chemin exact :** `packages/opencode/test/tool/shell-preview.test.ts`
- **Commande exacte :** `bun test --timeout 30000 test/tool/shell-preview.test.ts`,
  exécutée avec `workdir` = `C:\jeanluc\opencode-fork\packages\opencode`
  (le script `test` du paquet est `bun test --timeout 30000`).
- Le test importe `{ preview }` depuis `@/tool/shell`, ce qui suppose l'ajout de `export`
  proposé en 4.1.

Critères de succès observables :

1. sortie de 29 999 caractères → renvoyée **identique**, sans marqueur
   (`expect(preview(s).toBe(s)`).
2. sortie de 30 001 caractères dont les 10 premiers sont `"HEADMARK"` → le résultat
   **contient** `"HEADMARK"` (échoue aujourd'hui : la tête est perdue).
3. le résultat contient un marqueur et le nombre exact
   `1` (`expect(out).toContain("[... 1 characters omitted")`), plus `"first 7500"` et
   `"last 22500"`.
4. **longueur** : `expect(out.length).toBeLessThanOrEqual(30_000 + 120)` — prouve que le
   budget n'a pas été agrandi.
5. sortie de 200 000 caractères → `expect(out.length).toBe(30_000 + out.slice(...marker...)...)`
   et le nombre omis vaut `200000 - 30000 = 170000`
   (`expect(out).toContain("[... 170000 characters omitted")`).
6. sortie dont la tête coupe une paire de surrogates → aucun caractère de substitution
   `U+FFFD` dans le résultat (`expect(out).not.toContain("\uFFFD")`).

### 7.2 Test d'intégration du marqueur de drain (à ajouter)

- **Chemin exact :** `packages/opencode/test/tool/shell.test.ts`, dans le `describe` existant
  à partir de `shell.test.ts:1161`, en réutilisant le motif de capture de
  `ctx.metadata` déjà présent à `shell.test.ts:1146-1148`.
- **Commande exacte :** `bun test --timeout 30000 test/tool/shell.test.ts`
- **Critère de succès :** une commande qui écrit sur stdout puis garde le pipe ouvert
  (par exemple `pwsh -c "Write-Output start; Start-Sleep 5"` sous Windows) doit produire un
  `result.output` **contenant** la chaîne `trailing output may be missing`. Échoue
  aujourd'hui : aucun message n'est produit, car `meta` reste vide et
  `shell.ts:588-593` n'est pas déclenché dans ce cas.

### 7.3 Non-régression

- **Commande :** `bun test --timeout 30000 test/tool/shell.test.ts test/tool/shell-output-prompt.test.ts test/tool/shell-launch-retry.test.ts test/shell/shell.test.ts test/pty/pty-shell.test.ts`
- **Critère :** 0 échec, et `bun typecheck` (script `tsgo --noEmit`) sans erreur.

## 8. Effort

**S** — une fonction de 8 lignes à modifier en deux points d'appel, une fonction utilitaire
de garde-fou UTF-8, un drapeau booléen pour le drain, une ligne dans `metadata`, et un
fichier de test ; aucun changement de schéma, de configuration ni de migration.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — le mécanisme, le correctif et son coût sont établis et vérifiés
(lisiblement, sur les lignes citées), mais deux points de politique doivent être tranchés
par le validateur :

1. **Le ratio tête/queue.** `HEAD_SHARE = 0.25` est un choix, pas une dérivation. Les
   apologies de 7 500 caractères (≈ 1 875 tokens) couvrent la bannière et la première
   erreur ; un ratio de 0,5 (≈ 3 750 tokens) est plus sûr pour les sorties dont la
   conclusion est au milieu, au prix du même budget pris sur la queue. Le budget total
   restant à 30 000 caractères, le validateur peut trancher le ratio sans effet sur le coût.
2. **Le risque de ré-exposition de secrets.** Le correctif réintroduit en tête des
   caractères qui étaient aujourd'hui jetés, et aucun filtre de secrets n'a été trouvé sur
   ce chemin (voir 6, `INFERE:`). Si cette vérification est confirmée, le validateur doit
   dire si P14 est livrable sans filtre, ou si le filtre doit être une condition préalable.