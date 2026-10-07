# P09 — `bash` : troncature destructive au plafond, sans chemin de récupération

## 1. Problem

Quand la sortie d'un appel `bash` dépasse le plafond de 4 000 caractères, le harnais en
renvoie seulement un extrait et **destroy la totalité** : sur 36 appels qui ont touché ce
plafond, un seul a produit un fichier contenant la sortie complète, les 35 autres ont été
coupés en place sans qu'aucun chemin de récupération ne soit offert au modèle.

## 2. Evidence

**Le plafond de 4 000 caractères existe et s'applique à `bash`.**

`packages/opencode/src/tool/terminal-output.ts:5` et `:6` :
```ts
const MAX_BYTES = 4_000
const MAX_LINES = 120
```

`packages/opencode/src/tool/terminal-output.ts:224` — le budget réel est **2 000** caractères
quand aucune erreur n'est détectée, et 4 000 sinon :
```ts
const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
```

Cette couche s'applique à **tout** résultat d'outil, `bash` compris, sans condition
d'agent. `packages/opencode/src/session/processor.ts:579` et `:581-583` :
```ts
const terminal = toolCall && isLeanTerminalTool(toolCall.part.tool, toolCall.part.state.input)
if (toolCall) {
  const compact = yield* normalizeTerminalOutput(toolCall.part, rawOutput)
  rawOutput.output = compact.output
```

**La troncature générique ne rattrape pas `bash`.** `packages/opencode/src/tool/tool.ts:188-190` :
```ts
if (result.metadata.truncated !== undefined) {
  return result
}
```
`bash` pose toujours `truncated` (`shell.ts:617`), donc `truncate.output` — le chemin qui écrit
un artefact — n'est **jamais** appelé pour `bash`. La porte de sortie est `shell.ts` seul.

**`bash` tronque en place, sans fichier.** `packages/opencode/src/tool/shell.ts:594-606` :
```ts
const raw = list.map((item) => item.text).join("")
const end = tail(raw, limits.maxLines, limits.maxBytes)
if (end.cut) cut = true
if (!file && end.cut) {
  file = yield* trunc.write(raw)
}
...
if (cut && file) {
  output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
}
```
`list` est un tampon roulant borné à `keep = limits.maxBytes * 2` (`shell.ts:452`), purgé par
la tête à `shell.ts:505-510`. Le `trunc.write(raw)` de la ligne 598 écrit donc un `raw` déjà
amputé : le fichier produit peut ne pas contenir la sortie intégrale.

**La perte de tête est explicite dans le metadata.** `packages/opencode/src/tool/shell.ts:29` :
```ts
const MAX_METADATA_LENGTH = 30_000
```
`packages/opencode/src/tool/shell.ts:235-238` :
```ts
function preview(text: string) {
  if (text.length <= MAX_METADATA_LENGTH) return text
  return "...\n\n" + text.slice(-MAX_METADATA_LENGTH)
}
```
`metadata.output` passe par là à chaque chunk (`shell.ts:512`, `shell.ts:614`) : au-delà de
30 000 caractères, seule la queue survit.

**L'artefact est écrit depuis une sortie déjà réduite.** `packages/opencode/src/tool/terminal-output.ts:232-236` :
```ts
const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
const outputPath = reduced ? yield* input.store.write(raw) : undefined
const footer = [
  referenceText,
  outputPath ? `\nReceived output saved to: ${outputPath}` : "",
```
Quand `reduced` est vrai, le fichier est écrit — mais depuis `raw`, qui pour `bash` est la
sortie **déjà tronquée par `shell.ts`**. Un chemin de récupération vers un fichier incomplet
est pire qu'une absence de chemin : le modèle croit avoir la sortie complète.

**Le harnais sait déjà produire un « Full output saved to » exploitable.**
`packages/opencode/src/tool/shell.ts:604-606` l'émet, et le contrat de reprise existe déjà dans
la troncature générique. `packages/opencode/src/tool/truncate.ts:29-31` :
```ts
export function savedOutputPath(text: string) {
  return text.match(/(?:^|\n|\. )Full output saved to: ([^\r\n]+)/)?.[1]?.trim()
}
```
`packages/opencode/src/tool/truncate.ts:127` :
```ts
const references = [...new Set([options.outputPath, savedOutputPath(text)].filter((value): value is string => value !== undefined))]
```
Ce mécanisme, capable de restituer un chemin fiable, n'a servi qu'une fois sur 36.

**Volume et fréquence.** Parc 7 jours : `bash` = 4 949 appels / 6 955 étapes = 0,712 appel par
étape, premier poste d'appels devant `read`. Session auditée : 445 appels `bash` produisant
672 535 caractères, soit 1 511 caractères de sortie par tour, pour un `max_out` de 4 000
caractères. 36 appels ont touché le plafond ; **un seul** a spilled vers un fichier, les 35
autres ont été tronqués en place.

## 3. Mechanism

Chemin d'exécution d'un appel `bash` dont la sortie dépasse 4 000 caractères :

1. `shell.ts:498` spawn le process ; `shell.ts:501` lit le flux par chunks.
2. `shell.ts:503-510` : chaque chunk est poussé dans `list`, et le tampon est purgé par la
   **tête** dès que `used > keep` (`keep = maxBytes * 2`, `shell.ts:452`). `cut = true`.
   Le texte perdu ici est irrécupérable : rien ne l'a écrit.
3. `shell.ts:512` : `last = preview(last + chunk)` → au-delà de `MAX_METADATA_LENGTH`
   (`shell.ts:29`), `preview` ne garde que la queue (`shell.ts:237`). `metadata.output` est
   donc amputé en continu pendant toute l'exécution.
4. `shell.ts:517-519` : le spill n'a lieu que si `full` dépasse `limits.maxBytes` ; le
   fichier est alors créé et **`cut` passe à `true`** — c'est le seul chemin qui produit un
   « Full output saved to », ce qui explique le 1/36.
5. `shell.ts:594-595` : `raw` est reconstruit depuis `list` (déjà purgé), puis `tail()` le
   ramène à `maxLines` / `maxBytes`. `shell.ts:597-599` n'écrit un fichier que si `end.cut` —
   et il écrit ce `raw` partiel.
6. `shell.ts:604-606` : le pointeur de fichier n'est émis que si `cut && file`.
7. `processor.ts:581` : `normalizeTerminalOutput` recalcule un extrait à
   `budget = 2 000` (cas nominal) ou `4 000` (cas échec) — `terminal-output.ts:224`.
8. `terminal-output.ts:232-233` : `reduced` est vrai, donc `input.store.write(raw)` écrit un
   fichier… **contenu déjà amputé à l'étape 2**, et `terminal-output.ts:236` annonce
   « Received output saved to ».
9. `tool.ts:188-190` : `bash` portant `truncated`, la troncature générique — la seule qui écrit
   un artefact fidèle — est court-circuitée.

**Défaut structurel : deux troncatures en cascade, l'amont perdant la donnée, l'aval
écrivant un artefact qui prétend la restituer.** L'information est perdue à l'étape 2, avant
que quoi que ce soit ne soit écrit sur disque.

## 4. Proposal

### 4.1 Périmètre : ce qui est de l'outillage `bash`, ce qui est de la troncature générique

| Défaut | Fichier | Propriétaire | Inclus dans P09 |
|---|---|---|---|
| Tampon roulant purgé par la tête, `raw` partiel | `shell.ts:452`, `shell.ts:505-510`, `shell.ts:594-599` | outillage `bash` | **oui** |
| `preview()` ne garde que la queue, sans pointeur | `shell.ts:29`, `shell.ts:237`, `shell.ts:614` | outillage `bash` | **oui** |
| Artefact écrit depuis une sortie déjà tronquée | `terminal-output.ts:233` | outillage `bash` (post-traitement) | **oui** |
| Chemin de fichier reconstruit par regex sur du texte non fiable | `truncate.ts:29-31`, `truncate.ts:127` | troncature générique | non → **P16** |
| Deux plafonds coexistants sans invariant (50 102 o / 4 000 c) | `truncate.ts:15-16` vs `lean-output-policy.ts:4` | troncature générique | non → **P17** |
| Court-circuit de la troncature générique pour `bash` | `tool.ts:188-190` | troncature générique | non → **P17** |

**`truncate.ts` n'est pas modifié.** C'est le point de désaccord assumé : corriger P16/P17 dans
la même proposition que P09 mélangerait deux défauts à deux étages et rendrait le patch
invérifiable. La seule interface empruntée à `truncate.ts` est `write()` (`truncate.ts:68-73`),
dont le comportement est déjà correct : il écrit ce qu'on lui donne, sans perte.

### 4.2 Correctif : artifact-first

Invariant : **si une sortie `bash` est réduite, l'octet integral existe sur disque avant que
le résultat ne soit rendu au modèle.**

**Étape 1 — `shell.ts` : un seul artefact, écrit dès le premier octet.**

Dans `ShellTool.run` (`shell.ts:440`), remplacer le tampon roulant puis-spill par un sink
créé au premier chunk, et conserver `last` uniquement pour le metadata.

```ts
// shell.ts — avant (lignes 503-510)
list.push({ text: chunk, size })
used += size
while (used > keep && list.length > 1) {
  const item = list.shift()
  if (!item) break
  used -= item.size
  cut = true
}
```

```ts
// shell.ts — après
if (!sink) {
  const next = yield* trunc.write("")
  sink = createWriteStream(next, { flags: "w" })
  file = next
}
sink.write(chunk)
last = preview(last + chunk)
```

Puis, à `shell.ts:594-606`, `raw` devient le contenu du fichier et le pointeur est émis
**inconditionnellement** dès qu'un fichier existe :

```ts
const raw = yield* fs.readFileString(file ?? "")
const end = tail(raw, limits.maxLines, limits.maxBytes)
if (end.cut) cut = true
if (cut) output = `...output truncated...\n\nFull output saved to: ${file}\n\n` + output
```

**Étape 2 — `terminal-output.ts` : l'artefact ne peut plus être un mensonge.**

`reduced` (`terminal-output.ts:232`) devient la condition d'**émission du pointeur**, plus
celle de l'écriture d'un fichier reconstruit. L'écriture à `terminal-output.ts:233` disparaît
lorsque `input.metadata.outputPath` est déjà fourni (cas `bash` après l'étape 1) : le
post-traitement ne réécrit plus un artefact, il n'ajoute que l'extrait et le pointeur amont.

```ts
// terminal-output.ts:232-233 — après
const upstream = typeof input.metadata.outputPath === "string" ? input.metadata.outputPath : undefined
const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
const outputPath = upstream ?? (reduced ? yield* input.store.write(raw) : undefined)
```

**Étape 3 — `preview()` cesse de mentionner un journal que le modèle ne sait pas lire.**
`terminal-output.ts:58` émet `"[... omitted; see raw journal ...]"` ; le marqueur devient le
chemin réel, sur le modèle de l'instruction déjà éprouvée en `truncate.ts:130`
(`Use Grep to search the full content or Read with offset/limit`).

### 4.3 Ce qui reste volontairement inchangé

- **`MAX_METADATA_LENGTH` et `preview()` (`shell.ts:29`, `shell.ts:237`) sont conservés.**
  `metadata.output` est une vue de confort, pas la source de vérité. Le modifier reviendrait à
  traiter P14 (`preview()` ne conserve que la queue au-delà de 30k) dans P09.
- **Les plafonds `2 000` / `4 000` (`terminal-output.ts:224`) sont conservés.** Ils changent de
  statut : ils deviennent un budget d'**extrait**, non plus une perte de données. Aucun des
  tests existants qui les vérifient ne casse — voir §7.
- **`LEAN_TERMINAL_MAX_CHARS = 4 000` (`lean-output-policy.ts:4`) est inchangé**, et la
  condition `!terminal` de `processor.ts:587` reste telle quelle : le budget lean n'a jamais
  vocation à s'appliquer à `bash`. Ce correctif rend le plafonnement réel, qui est
  `terminal-output.ts:224`, cohérent avec ce que le harnais croyait déjà appliquer.

## 5. Alternatives considered

**A. Élever le plafond de 4 000 caractères.** Rejeté. Les 445 appels ont produit 672 535
caractères, soit 1 511 par tour : un plafond relevé ne change rien à la moyenne, il déplace le
seuil au-delà duquel le comportement redevient destructif. Le défaut est l'absence de
récupération, pas la taille du seuil. Coût tokens :往来 à lui seul, il rendrait le
parcours 7 jours (0,712 appel bash par étape) plus coûteux sans supprimer un seul tour perdu.

**B. Écrire l'artefact mais continuer à perdre la tête du tampon.** Rejeté : c'est l'état
actuel déguisé. `terminal-output.ts:233` écrivant depuis un `raw` déjà amputé, le modèle
reçoit un chemin qui *récompte* moins de lignes que ce qu'il croit. Celadestroy le principe
même d'une preuve sur disque et produit des erreurs de diagnostic difficiles à détecter.

**C. Ne rien changer à `shell.ts`, se contenter d'avertir le modèle dans le texte de sortie.**
Rejeté : un avertissement sans chemin ne permet aucune action. Le modèle ne peut pas
`Read`/`Grep` un fichier qui n'existe pas. Le harnais possède déjà la fabrication du fichier
(`truncate.ts:68-73`) et son contrat de reprise (`truncate.ts:130`) : les réutiliser est
strictement moins coûteux que d'inventer un troisième mécanisme.

## 6. Risks

- **Régression sur les tests existants.** `packages/opencode/test/tool/shell.test.ts`,
  `packages/opencode/test/tool/shell-output-prompt.test.ts`,
  `packages/opencode/test/tool/shell-launch-retry.test.ts` et
  `packages/opencode/src/tool/lean-output-policy.test.ts` sont directement concernés. Le point
  de rupture名义 est `lean-output-policy.test.ts:58` et `:127`, qui vérifient
  `LEAN_TERMINAL_MAX_CHARS === 4_000` et `leanToolOutputBudget("bash") === { maxChars: 4_000,
  direction: "tail" }`. Le §4.3 conserve ces valeurs **et** leur sémantique d'extrait : la
  régression est évitée par construction, non par traitement a posteriori. Le risque réel est
  dans `shell.test.ts`, où des assertions sur la forme exacte de la sortie (marqueur
  `...output truncated...`, présence ou absence de `Full output saved to`) peuvent changer
  puisque le pointeur devient inconditionnel. Ces assertions doivent être mises à jour, pas
  contournées.
- **Latence et I/O ajoutés.** Un fichier est désormais créé et écrit pour **tout** appel
  `bash`, y compris ceux dont la sortie tient sous 2 000 caractères. Sur la session auditée,
  cela représente 445 fichiers au lieu de 1. Coût : une écriture séquentielle par appel, de
  l'ordre de la taille de la sortie, sur un chemin déjà chaud (le spooling existe déjà au-delà
  de `keep`). **Gain tokens net strongly positif** : 36 appels sur 445 récupèrent aujourd'hui
  zéro octet de la sortie tronquée ; le correctif rend ces octets accessibles sans les
  renvoyer dans le contexte. Le surcoût en contexte est nul, le surcoût en tokens l'est aussi :
  le pointeur remplace du texte perdu, il ne s'y ajoute pas.
- **Sécurité : injection et contournement de permission.** Deux risques réels. (a) *Prompt
  injection via l'artefact* : le contenu d'un fichier sur disque n'est pas sanitisé, et
  `truncate.ts:225` marque déjà les références amont comme `Upstream reference (unverified; not
  opened)` précisément pour这一点. Le correctif doit conserver cette mention pour le chemin
  qu'il émet, sinon un fichier contenant des instructionsrafted devient une surface
  d'instruction directe. (b) *Écriture hors périmètre* : `trunc.write` écrit dans
  `TRUNCATION_DIR` (`truncate.ts:17`), répertoire déjà couvert par la rétention
  (`truncate.ts:54-66`) ; écrire pour tout appel augmente le volume disque du répertoire
  purgé et donc la surface du parcours 7 jours. Un appel `bash` qui produit 1 Go écrira 1 Go
  dans ce répertoire : c'est aujourd'hui déjà le cas au-delà de `maxBytes`, mais l'extension à
  100 % des appels mérite une borne de taille par fichier, absente de `trunc.write`
  (`truncate.ts:68-73`).
- **Divergence de l'artefact.** Si l'étape 1 et l'étape 2 s'appliquent toutes deux, deux
  fichiers peuvent coexister pour un même appel. `terminal-output.ts:233` est modifié pour
  préférer `upstream` ; c'est la raison pour laquelle ce correctif est `NEEDS_REVIEW` (§9).

## 7. Tests

**Test unitaire 1 — l'artefact est complet et le pointeur est émis.**

Chemin exact : `packages/opencode/test/tool/shell-artifact-first.test.ts` (à créer).
Il lance `ShellTool.run` sur une commande produisant 200 000 caractères (dont une ligne
d'erreur au milieu), puis vérifie : (1) `metadata.truncated === true`, (2) `metadata.outputPath`
est défini, (3) le fichier lu vaut 200 000 caractères — **le contrôle décisif** : c'est
exactement la propriété manquante aujourd'hui, (4) la sortie rendue contient
`Full output saved to:`.

**Test unitaire 2 — pas de réécriture d'artefact en aval.**

Chemin exact : `packages/opencode/test/tool/terminal-output-no-fake-artifact.test.ts` (à créer).
Appelle `normalizeTerminalOutput` avec `metadata.outputPath` déjà fourni et vérifie que le
`outputPath` retourné est **celui de l'amont**, jamais un nouveau fichier reconstruit depuis un
`raw` plus court.

**Commande exacte d'exécution** (depuis `packages/opencode`) :
```
bun test test/tool/shell-artifact-first.test.ts test/tool/terminal-output-no-fake-artifact.test.ts
```

**Non-régression :**
```
bun test test/tool/shell.test.ts test/tool/shell-output-prompt.test.ts test/tool/shell-launch-retry.test.ts src/tool/lean-output-policy.test.ts
```

**Critère de succès observable.** Les quatre nouveaux tests passent, et la commande de
non-régression rend un exit code 0 avec `0 fail`. Le signal de terrain qui vaut plus que
tout test : sur une session rejouée, le compteur « troncature sans chemin de récupération »
passe de 35/36 à **0/36**. Ce compteur est mesurable sur les artefacts déjà produits —
`metadata.leanOutputBudget.outputPath` (`terminal-output.ts:264-271`) contre
`metadata.terminalOutput.rawBytes` (`terminal-output.ts:260`) : la preuve est que
`rawBytes` du fichier dépasse désormais systématiquement la taille de l'extrait rendu, ce
qui est impossible aujourd'hui pour les 35 appels concernés.

## 8. Effort

**M** — deux fichiers de production modifiés (`shell.ts`, `terminal-output.ts`), le cycle de
vie du flux réécrit, plus deux tests unitaires ; `truncate.ts` reste intact, donc le rayon de
la modification est contenu et le patch independently reviewable.

## 9. Verdict self-assessment

**NEEDS_REVIEW** — le correctif est mechaniquement établi et chaque étape est citée, mais une
décision d'architecture relève du validateur :

**Qui possède l'invariant « la sortie complète existe sur disque » — `shell.ts` (le producteur
écrit l'artefact au fil du flux) ou `terminal-output.ts` (le post-traitement l'impose) ?**

J'ai tranché pour `shell.ts` : c'est le seul endroit où la donnée est encore intacte, tout
écriture plus tard ne fait que recopier une information amputée. Mais ce choix a une
conséquence qui n'appartient pas au rédacteur : si `shell.ts` possède l'invariant, la porte
`tool.ts:188-190` qui court-circuite la troncature générique pour tout outil portant
`truncated` doit être rouverte, faute de quoi la correction de P17 sera impossible à poser
plus tard sans réécrire P09. Le validateur doit trancher entre (a) assumer que `shell.ts`
écrit toujours l'artefact et amender `tool.ts:188-190` dans P17, ou (b) laisser
`terminal-output.ts` propriétaire du fichier et accepter que la perte de tête de
`shell.ts:505-510` devient irrécupérable — ce qui rendrait le correctif de la section 4.2
impossible. L'option (a) est la seule cohérente avec le §4.

**Résiduel à ne pas perdre de vue :** le lien de causalité exact entre « 36 troncatures » et
« 1 seul artefact » n'est **pas** mesuré. Ce que le code établit est que l'artefact n'existe
que sur le chemin `cut && file` (`shell.ts:604`) et que `file` n'est créé que par le spill de
`shell.ts:517-519`. La démonstration que `terminal-output.ts:233` écrit un `raw` amputé est
inférée de l'ordre des étapes, non observée en exécution. Méthode de vérification : poser un
fichier produit par `terminal-output.ts:233` et comparer `rawBytes`
(`terminal-output.ts:260`) à la taille réelle de la sortie du processus ; si `rawBytes` est
égal à la taille de l'extrait et non à celle de la sortie, l'inférence est confirmée. Tant que
cette mesure n'est pas faite, le gain en tours doit être présenté comme un ordre de grandeur,
pas comme un résultat.