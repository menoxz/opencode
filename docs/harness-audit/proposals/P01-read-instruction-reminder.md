# P01 — `AGENTS.md` fichier-scoped réinjecté dans chaque résultat de lecture

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — §6 réécrit sur la menace de provenance (C-22), §7 corrigé + test du chemin provenUnchanged ajouté (C-23)

## 1. Problem

À chaque appel de `read`, le contenu intégral des fichiers d'instructions proches du fichier
lu (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`) est réinjecté dans le résultat de l'outil, y
compris quand l'outil n'a rien de nouveau à envoyer, sans aucun dédup ni budget de taille.

## 2. Evidence

**Le défaut exact — `packages/opencode/src/tool/read.ts:356-362`** (7 lignes) :

```ts
356:      const seen = ReadLedger.get(ctx.sessionID, ledgerKey)
357:      const reminder = loaded.length > 0 ? `\n\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>` : ""
358:      const unchanged = (entry: ReadLedger.Seen) => {
359:        ReadLedger.noteWithheld(ctx.sessionID)
360:        return {
361:          title,
362:          output: ReadLedger.stub(filepath, entry) + reminder,
```

`reminder` est calculé avant toute décision de dédup et n'est jamais conditionné au chemin
retenu. Le chemin `unchanged` — c'est-à-dire le chemin dont le but est explicitement de
**retirer** des octets du contexte — concatène le stub avec le corps complet.

**Le même défaut sur les deux autres chemins de retenue — `read.ts:379` et `read.ts:397`** :

```ts
379:          output: ReadLedger.duplicateStub(filepath, where) + reminder,
397:          output: ReadLedger.producedStub(filepath, entry) + reminder,
```

**Le chemin qui envoie le contenu — `read.ts:464-466`** :

```ts
464:      yield* warm(filepath)
465:
466:      output += reminder
```

**D'où vient `loaded` — `read.ts:271`** :

```ts
271:      const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)
```

`loaded` est donc bien le produit de `Instruction.resolve` (`instruction.ts:66-70` pour la
signature, `instruction.ts:287-332` pour l'entrée), et non une fabrication locale à `ReadTool`.

**Le producteur — la chaîne `find → read → renderInstruction`,
`instruction.ts:303` + `instruction.ts:321-325`** :

```ts
303:    // Walk upward from the file being read and attach nearby instruction files once per message.
321:      set.add(found)
322:      const content = yield* read(found)
323:      const rendered = content ? renderInstruction(found, content, rollout.injectionInstructions) : undefined
324:      if (rendered) {
325:        results.push({ filepath: found, content: rendered })
```

**Deux garde-fous existent déjà, mais tous deux sont bornés par la conversation, pas par la
session — `instruction.ts:24-39`** :

```ts
24: function extract(messages: MessageV2.WithParts[]) {
25:   const paths = new Set<string>()
28:       if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
29:         if (part.state.time.compacted) continue
30:         const loaded = part.state.metadata?.loaded
```

`extract` reconstruit le dédup en relisant `metadata.loaded` des appels `read` **terminés**,
et **jette** les turns compactés (ligne 29). `instruction.ts:311-321` ajoute un second garde,
`s.claims`, une `Map<MessageID, Set<string>>` (`instruction.ts:97`) : dédup **une fois par
message assistant**. Conséquence : un nouveau message assistant ré-attache le fichier, et une
compaction fait disparaître toute trace des injections précédentes. `loaded` se repeuple et
`read.ts:357` réémet.

**La signature `(taille, mtime)` existe déjà mais n'est pas exposée — `instruction.ts:131-137`** :

```ts
131:      const mtime = stat.mtime.pipe(
132:        Option.map((time) => time.getTime()),
133:        Option.getOrElse(() => 0),
134:      )
135:      const signature = `${stat.size}:${mtime}`
136:      const store = yield* InstanceState.get(state)
137:      const cached = store.reads.get(filepath)
```

**Mesure terrain fournie** : un `read` de 4 lignes a coûté **6 953 octets** d'instructions ;
**1 738 tokens** par lecture ; **~356 k tokens** sur une session de **205 lectures**.
`INFERE:` le ratio instructions/lecture-dédupliquée est stable tant que le chemin de
fichier ne change pas ; vérification : rejouer la même session avec le correctif et comparer
`ReadLedger.stats(sessionID).withheld` (`read-ledger.ts:534`) avant/après.

**Fiabilité du contenu injecté** — le contenu injecté prescrit `tmux new-session -d` pour
lancer un serveur de dev, sur une plateforme `win32`/`pwsh` où `tmux` n'existe pas, et
contredit la doctrine globale de gestion de serveurs du projet. **Hors périmètre de cette
proposition** : la correction de `packages/opencode/AGENTS.md` lui-même est un autre
travail. Ce que le présent correctif traite, c'est l'**amplification** : un fichier
d'instructions faux est aujourd'hui recopié dans ~205 résultats de lecture ; il le sera une
fois par session et par signature.

## 3. Mechanism

1. `ReadTool.run` récupère `Instruction.Service` (`read.ts:49`) puis appelle
   `instruction.resolve(ctx.messages, filepath, ctx.messageID)` (`read.ts:271`).
2. `Instruction.resolve` monte l'arborescence depuis le fichier lu
   (`instruction.ts:300-304`) et collecte `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md`
   (`instruction.ts:18-22`), en excluant les chemins déjà connus (`instruction.ts:316`).
3. Deux filtres s'appliquent, tous deux limités à la conversation :
   - `already = extract(messages)` (`instruction.ts:295`) reconstruit l'historique
     d'injection depuis `metadata.loaded` des parts `read` **non compactés**
     (`instruction.ts:29`) ;
   - `s.claims` (`instruction.ts:97`, `311-321`) garantit une seule injection par
     `messageID`.
4. Si aucun des deux ne filtre, `results.push({ filepath, content })` (`instruction.ts:325`)
   et `read.ts:357` sérialise **tous** les corps en un seul `<system-reminder>`, sans
   condition sur le chemin d'exécution.
5. `read.ts:466` l'ajoute au rendu complet, puis le résultat complet, reminder inclus, part
   au cache de l'outil.
6. `read.ts:362`, `read.ts:379`, `read.ts:397` l'ajoutent aux trois chemins de retenue.
   Sur `unchanged` et `duplicate`, le modèle reçoit donc ~1 ligne de stub **plus** 1 738
   tokens d'instructions déjà connues.
7. La boucle se referme à chaque nouveau message assistant (`claims` est indexé par
   `messageID`) et à chaque compaction (`extract` saute les parts compactés) : rien ne lie
   la suppression à la durée de vie de la session.

## 4. Proposal

### Fichiers modifiés

| Fichier | Fonction | Changement |
|---|---|---|
| `src/session/instruction.ts` | `read` (l.124), `resolve` (l.287), `Interface` (l.66-70) | exposer la signature `(taille, mtime)` du fichier d'instructions dans le résultat de `resolve` |
| `src/tool/read-ledger.ts` | à côté de `key`/`get`/`put` (l.280-324) | ledger de signatures d'instructions, borné par session, avec la même mécanique de `MAX_ENTRIES` |
| `src/tool/read.ts` | `reminder` (l.357) + 4 sites d'ajout (l.362, l.379, l.397, l.466) | dédup `(chemin, signature)`, budget d'octets, constante de renvoi sur les chemins de retenue |

### 4.1 `instruction.ts` — exposer la signature

Le type de retour de l'interface s'élargit d'un champ (`instruction.ts:66-70`) :

```ts
66:   readonly resolve: (
67:     messages: MessageV2.WithParts[],
68:     filepath: string,
69:     messageID: MessageID,
70:   ) => Effect.Effect<{ filepath: string; content: string; signature: string }[], AppFileSystem.Error>
```

`read` (l.124) retourne déjà `signature` en interne (l.135) ; `resolve` le propage au lieu
de le recalculer. **La signature est calculée sur le fichier brut**, jamais sur le texte
rendu : ainsi un basculement de mode `full` ↔ `summary` (`instruction.ts:41-54`) réinjecte
correctement, alors qu'une signature calculée sur le rendu collapsé les deux modes.

### 4.2 `read-ledger.ts` — magasin de signatures, réutilisé et non inventé

On réutilise le magasin existant : il est déjà indexé par `sessionID`, déjà borné
(`MAX_SESSIONS = 64` l.60, `MAX_ENTRIES = 512` l.63) et déjà doté d'un cycle de vie complet
(`flush` l.458, `reset` l.473, `unload` l.497). On **n'ajoute pas un troisième mécanisme de
cache** dans le projet.

```ts
// read-ledger.ts — API minimale ajoutée
export function instructionSeen(sessionID: string, filepath: string, signature: string): boolean
export function noteInstruction(sessionID: string, filepath: string, signature: string): void
```

**Couplage obligatoire à `reset` / `epoch`.** Le ledger possède déjà la réponse au
risque de compaction, et il faut l'utiliser plutôt que de la rediscuter —
`read-ledger.ts:48-51` :

```
48:  * Epoch: a compaction can drop earlier `read` output from the context, so the
49:  * ledger forgets every entry and increments its epoch (session/compaction.ts
50:  * calls `reset`). That clear is persisted, so a restart can never resurrect a
51:  * stub pointing at bytes a compaction removed.
```

`epoch` (`read-ledger.ts:488`) et `reset` (`read-ledger.ts:473`) effacent déjà, à chaque
compaction, tout ce que le ledger mémorise (`read-ledger.ts:484-488`). Le magasin de
signatures **doit** résider dans la même structure d'état et être vidé par le **même**
`reset`. C'est la condition pour que `POINTER` — qui ne renvoie que vers un message
antérieur — ne puisse pas survivre à l'évacuation de ce message : sinon le modèle lirait
« déjà injecté » pour une instruction qui a quitté le contexte, précisément l'état que
`read-ledger.ts:50-51` interdit au stub. Le correctif ne demande donc **aucune** doctrine
nouvelle ; il étend au couple (instruction, chemin) un mécanisme déjà éprouvé pour le
couple (lecture, chemin).

### 4.3 `read.ts:357` — le correctif

```ts
const MAX_REMINDER_BYTES = 8 * 1024
const POINTER =
  "\n\n<system-reminder>Instructions for this path are already in context above; not repeated. Re-read the instruction file if you need its text.</system-reminder>"

type Loaded = { filepath: string; content: string; signature: string }

const reminderFor = (loaded: Loaded[]) => {
  if (loaded.length === 0) return ""
  const fresh = loaded.filter((i) => !ReadLedger.instructionSeen(ctx.sessionID, i.filepath, i.signature))
  for (const item of fresh) ReadLedger.noteInstruction(ctx.sessionID, item.filepath, item.signature)
  if (fresh.length === 0) return POINTER
  const body = fresh.map((i) => i.content).join("\n\n")
  const bytes = Buffer.byteLength(body)
  if (bytes <= MAX_REMINDER_BYTES) return `\n\n<system-reminder>\n${body}\n</system-reminder>`
  const head = Buffer.from(body).subarray(0, MAX_REMINDER_BYTES).toString("utf8")
  return `\n\n<system-reminder>\n${head}\n[truncated: ${bytes} bytes; re-read the file]\n</system-reminder>`
}
```

`reminderFor` remplace `reminder` à `read.ts:357` et **est appelé aux quatre sites**
(l.362, l.379, l.397, l.466). Le commentaire de `read.ts:445` n'est pas un site d'appel.

Les trois propriétés exigées :

- **Déduplication par `(chemin, signature)`** : la clé est `(sessionID, filepath, signature)`
  où `signature = \`${stat.size}:${mtime}\`` (`instruction.ts:135`). La granularité est donc
  **exactement** celle de `ReadLedger.provenUnchanged` (`read.ts:408`), qui compare le même
  couple `(size, mtime)` : le magasin de signatures ne peut ni désaccorder ni réémettre ce
  que le chemin `unchanged` a déjà prouvé inchangé. Éditer l'`AGENTS.md` en cours de session
  change la signature et **réinjecte** — c'est la garantie de correction qui manque
  aujourd'hui.
- **Aucune réinjection sur le chemin `unchanged`** : `reminderFor` réduit l'ajout à `POINTER`,
  une **constante de ~160 octets ≈ 40 tokens indépendante de la taille du fichier**. Le
  chemin `unchanged` reste donc nettement plus économe que l'envoi complet. Ce chemin
  (`read.ts:362`) n'est pas un cas particulier traité après coup : il est l'un des quatre
  appels de `reminderFor`.
- **Budget** : `MAX_REMINDER_BYTES = 8 192` calculé avec `Buffer.byteLength` (et non
  `length`), donc honnête sur du contenu multi-octets. Le pire cas est borné quelle que soit
  la taille de l'`AGENTS.md`, ce qui n'est pas le cas aujourd'hui.

**La première livraison est préservée.** `reminderFor` n'émet un corps complet que si
`fresh` est non vide, et `fresh` est non vide dès que le magasin ne contient pas encore la
signature. Sur une première lecture, le magasin est vide, donc le corps intégral est
émis : le correctif ne supprime aucune livraison, il supprime les répétitions.

### 4.4 Compatibilité avec le mode d'injection de prompt cache-séparée

Les deux mécanismes sont **disjoints par portée** et le correctif n'en modifie aucun :

- `createPromptInjectionCache()` (`prompt-context-summary.ts:90`) est instancié **dans**
  `SessionPrompt.run` (`prompt.ts:1747`, à l'intérieur de `runLoop` l.1741). Sa durée de vie
  est **une itération de boucle**, pas une session. Son `emitOnce`
  (`prompt-context-summary.ts:112-117`) déduplique sur `${key}:${hashValue(value)}` dans ce
  périmètre étroit. Or P01 duplique **entre** les itérations et **entre** les messages.
  **Conclusion : le cache d'injection de prompt ne peut pas, seul, corriger P01** — c'est le
  bon mécanisme au mauvais niveau. C'est aussi pourquoi le correctif vit dans le
  `ReadLedger`, indexé par `sessionID`.
- Le mode `SessionContextRollout` est **strictement préservé** : à
  `injectionInstructions: "off"`, `resolve` renvoie `[]`, donc `loaded.length === 0`, donc
  `reminderFor` renvoie `""` — **comportement identique à aujourd'hui**, sur les quatre
  sites. En mode `summary` (`instruction.ts:44-54`, 6 lignes), le corps rendu est inférieur au
  budget par construction.
- `INFERE:` aucune régression de prompts en mode cache-séparée. Vérification :
  `bun test test/provider/cache-anchor.test.ts` et `bun test test/session/`.

### 4.5 Volontairement inchangé

- **Le contenu des instructions** n'est ni validé ni corrigé : le mode `full` reste le mode
  par défaut, `instruction.ts:41-43` est intact. Corriger `AGENTS.md` lui-même est hors
  périmètre.
- **`metadata.loaded` reste un tableau de chemins.** Il est consommé par `extract`
  (`instruction.ts:30-34`, exige des `string`) et asserted par
  `test/tool/read.test.ts:666`. On ne le change pas de forme ; la signature voyage dans le
  magasin, pas dans les metadata.
- **`extract` et `s.claims` restent en place** comme plancher. Ils ne sont qu'ajoutés au
  dédup par signature, jamais remplacés : une régression de `extract` ne peut donc pas
  entraîner la perte complète des instructions.

## 5. Alternatives considered

**A. Étendre `metadata.loaded` pour porter la signature (au lieu d'un magasin dédié) — rejetée.**
`extract` exige des chaînes (`instruction.ts:32-33`, `typeof p === "string"`) et
`read.test.ts:666` exige le chemin nu. Changer la forme du champ impose un shim de
compatibilité dans le chemin le plus chaud de l'outil, pour un gain nul.

**B. Déplacer le dédup dans `createPromptInjectionCache` — rejetée.**
Mauvaise portée : le cache vit une itération de `runLoop` (`prompt.ts:1747`) alors que P01
duplique à l'échelle de la session ; il ne dispose pas de `(sessionID, chemin, signature)`
depuis l'intérieur de `ReadTool` ; et il met en cache des chaînes d'assemblage de prompt,
pas de la provenance par résultat d'outil.

**C. Supprimer l'instruction des résultats de `read` et l'émettre une fois par tour dans
`prompt.ts` — rejetée comme correctif principal, retenue comme suite possible.**
C'est l'architecture la plus propre, mais elle casse la sémantique distinctive du mécanisme :
aujourd'hui les instructions sont choisies par **montée d'arborescence depuis le fichier
lu** (`instruction.ts:303`), ce qui est une fonctionnalité. Elle rendrait aussi
`full`/`summary`/`off` caducs pour le cas fichier-scoped. Proposée comme lot 2 si le gain du
présent correctif est jugé insuffisant.

**D. Dédupliquer sur le chemin seul — rejetée, et c'est le piège central.**
`extract` (`instruction.ts:24-39`) compare déjà **les chemins seuls**. Enregistrer « ce chemin
a été injecté » sans la signature rendrait le correctif *incorrect* : une édition de
`AGENTS.md` en cours de session ne serait jamais réinjectée, puisque le chemin est déjà dans
`metadata.loaded`. C'est la raison pour laquelle la signature est dans la clé.

**E. Supprimer purement et simplement `+ reminder` sur les trois chemins de retenue — rejetée
seule, retenue comme composante.**
Correct sur le coût, faux sur la correction : si le modèle crée un `AGENTS.md` *entre* deux
lectures et que la lecture est retenue au motif `selfProduced`/`duplicate`, le modèle
recevrait « déjà chargé plus haut » alors que le texte n'a jamais été injecté. D'où le
`reminderFor` : constante pour ce qui est vraiment déjà vu, corps complet pour ce qui est
vraiment nouveau.

## 6. Risks

**Régression sur les tests existants — fichier principal :**
`packages/opencode/test/tool/read.test.ts:654-668`, bloc `describe("tool.read loaded instructions")` :

```ts
661:      const result = yield* exec(dir, { filePath: path.join(dir, "subdir", "nested", "test.txt") })
662:      expect(result.output).toContain("test content")
663:      expect(result.output).toContain("system-reminder")
664:      expect(result.output).toContain("Test Instructions")
665:      expect(result.metadata.loaded).toBeDefined()
```

C'est le test critique. Il **reste vert** : il s'agit d'une **première** lecture dans un
`tmpdir` frais, donc aucune signature n'est encore enregistrée pour
`<dir>/subdir/AGENTS.md`, donc `fresh` est non vide et le corps complet est émis —
`toContain("Test Instructions")` et `toContain("system-reminder")` restent vrais.
`INFERE:` vérifié par lecture du chemin de code, pas par exécution. Vérification :
`bun test test/tool/read.test.ts` doit sortir en 0 sans modification du test.

Autres fichiers touchés par l'élargissement du type de retour :
`packages/opencode/test/session/instruction.test.ts` (`describe("Instruction.resolve")`) et
`packages/opencode/test/cli/smokes/read-only.test.ts` ne sont affectés que s'ils comptent des
octets. `packages/opencode/test/provider/cache-anchor.test.ts` construit un littéral
`</system-reminder>` dans une fixture et, `INFERE:`, ne passe pas par `ReadTool` : non affecté.
`INFERE:` pour ces trois lignes ; vérification :
`bun test test/tool/read.test.ts test/session/instruction.test.ts test/provider/cache-anchor.test.ts`.

**Coût en tokens / latence — le coût est négatif.**
Sur la session mesurée : 204 des 205 lectures passent de **1 738 tokens** à **~40 tokens**
(`POINTER`, ~160 octets), soit **204 × 1 738 ≈ 354 000 tokens** supprimés contre
**204 × 40 ≈ 8 200 tokens** ajoutés, **net ≈ −346 000 tokens** pour cette session. La
première injection de chaque `(chemin, signature)` reste intégralement payée, comme
aujourd'hui. Latence : le `fs.stat` est **déjà** fait par `instruction.ts:126`, rien n'est
ajouté sur le disque ; une recherche dans une `Map` par lecture, négligeable devant le `stat`
existant. Budget : un `AGENTS.md` de 40 KiB plafonne à 8 192 octets injectés au lieu de
40 960.

### 6.1 Sécurité — la menace est l'absence de contrôle de provenance

Le risque dominant n'est pas « un fichier d'instructions hostile » en général. C'est
qu'`Instruction.resolve` **ne vérifie pas d'où vient un fichier d'instructions**, et que le
correctif ne traite pas ce défaut : il borne la **répétition**. C'est cette absence de
provenance qui rend la répétition grave.

**La chaîne sans filtre de provenance — `instruction.ts:303` + `instruction.ts:305` + `instruction.ts:322-325`** :

```ts
303:    // Walk upward from the file being read and attach nearby instruction files once per message.
305:        const found = yield* find(current)
322:      const content = yield* read(found)
323:      const rendered = content ? renderInstruction(found, content, rollout.injectionInstructions) : undefined
324:      if (rendered) {
325:        results.push({ filepath: found, content: rendered })
```

Trois faits, tous lisibles dans ces lignes :

1. **Le déclencheur est une montée de nom, pas une décision.** `find(current)`
   (`instruction.ts:305`) remonte l'arborescence depuis le répertoire du fichier lu et
   accepte le premier nom d'instructions trouvé. Aucune propriété du fichier n'est
   interrogée : ni son origine, ni son auteur, ni son statut de version contrôlée. Un
   `AGENTS.md` est accepté parce qu'il porte le bon nom.
2. **La lecture et le rendu sont immédiats et sans garde.** `read(found)` puis
   `renderInstruction(...)` (`instruction.ts:322-323`) transforment le contenu du fichier en
   corps de rendu, et `results.push` (`instruction.ts:325`) l'ajoute à `loaded`, qui part
   dans le contexte du modèle.
3. **La seule condition appliquée est le mode d'injection**, validé en amont
   (`renderInstruction`, `instruction.ts:41-43`), et les filtres
   `extract`/`s.claims` (`instruction.ts:24-39`, `97`, `311-321`) portent sur la **répétition**,
   jamais sur l'**origine**.

**Le scénario de menace, nommé.** Un `AGENTS.md` **committé dans le dépôt** — donc versionné,
donc synchronisé par `git clone`, donc présent avant la moindre action de l'utilisateur —
rencontre les trois faits ci-dessus dès qu'un seul `read` vise un fichier de ce dépôt. Sa
présence ne dépend d'aucune action de l'utilisateur : ni téléchargement, ni configuration,
ni consentement. Le dépôt est le vecteur ; `git clone` est le mécanisme de livraison.

Ce que la répétition ajoute à ce scénario : chaque lecture réinjecte le corps
(`read.ts:357`, `read.ts:362`, `read.ts:379`, `read.ts:397`, `read.ts:466`), donc l'instruction
non sollicitée revient dans le contexte à l'échelle de la session (~205 occurrences sur la
session mesurée) au lieu d'une seule. Le modèle est ainsi bombardé de la même consigne à
chaque appel d'outil : chaque répétition est une occasion distincte d'y obéir, et la
redondance rend le motif dominant du contexte plutôt qu'un fait parmi d'autres. Le
correctif ramène cela à **une occurrence par session et par signature**.

**Ce que ce correctif ne fait pas, et qui reste ouvert.** `POINTER` n'examine pas la
provenance du fichier ; il constate seulement que **ce** contenu a déjà été injecté dans
**cette** session. La première injection d'un `AGENTS.md` committé reste donc en clair et
hors bande, une fois. C'est le **résiduel assumé** : le réduire davantage demanderait une
validation des sources d'instructions (par exemple un marqueur de confiance, ou un opt-in
pour les fichiers d'instructions issus du dépôt), ce qui est un travail distinct et hors
périmètre ici.

**Ce qui n'est pas la menace.** Les sources distantes de la config **ne sont pas** un canal
d'injection ici : elles sont explicitement écartées. `instruction.ts:206-211` :

```ts
206:      if (config.instructions) {
207:        for (const raw of config.instructions) {
208:          if (raw.startsWith("https://") || raw.startsWith("http://")) {
209:            log.debug("instruction file skipped", { filepath: raw, source: "config", reason: "remote" })
210:            continue
211:          }
```

Le `continue` de la ligne 210 écarte l'entrée : une URL dans `instructions` est ignorée, pas
chargée. Appuyer la justification du correctif sur ce canal revient à s'appuyer sur le code
qui le neutralise ; la menace est ailleurs, dans le dépôt.

**Effets de bord de sécurité du correctif, dans le bon sens :**

1. Un corps d'instructions ne peut plus être **remplacé** au milieu d'une session par une
   nouvelle copie insérée à l'appel d'un outil : le modèle ne voit pas un texte familier
   réapparaître avec un contenu différent.
2. Le `POINTER` est **borné et constant** (~160 octets) : il ne peut pas lui-même servir de
   vecteur de transport de contenu, ce qui n'aurait pas été vrai si l'on avait laissé
   passer un corps variable sur les chemins de retenue.

**Rayon d'impact d'un faux « déjà injecté »** : le modèle perdrait les instructions de ce
chemin pour le reste de la session. Deux atténuations : (a) `extract` et `s.claims` restent
actifs comme plancher, donc une régression du magasin de signatures ne peut pas ôter
complètement les instructions ; (b) `POINTER` nomme explicitement le chemin et invite à
relire le fichier d'instructions, donc la perte est récupérable par un appel d'outil.
`renderInstruction` préfixe déjà le chemin (`instruction.ts:43`, `instruction.ts:50`), ce qui
permet au pointeur de le citer.

## 7. Tests

Fichier à écrire : `packages/opencode/test/tool/read-instruction-reminder.test.ts`,
en suivant le pattern `exec(dir, {...}, next = ctx)` déjà utilisé par `read.test.ts:98-104`,
avec le fixture `tmpdirScoped` et le `beforeEach(() => ReadLedger.reset())` de
`read.test.ts:44-46`.

**Contrainte de fixture, à respecter par tous les tests T2, T3 et T7.** Le contexte de test
partagé déclare **un seul** `messageID` (`read.test.ts:48-50` :

```ts
48: const ctx = {
49:   sessionID: SessionID.make("ses_test"),
50:   messageID: MessageID.make("msg_test"),
```

Or `s.claims` est indexé par `messageID` (`instruction.ts:97`, `311-321`). Avec le `messageID`
par défaut, la seconde lecture ne réinjecte rien du tout — `loaded` vaut `[]` et
`reminderFor` rend `""` (`if (loaded.length === 0) return ""`) — et le test passerait **à
vide**, sans rien prouver sur le mécanisme. Tout test qui doit observer une **seconde
injection** passe donc un `next` avec un `messageID` **distinct et le même `sessionID`** (le
magasin est indexé par `sessionID`) :

```ts
const nextMessage = { ...ctx, messageID: MessageID.make("msg_test_2") }
```

| # | Test | Critère de succès observable |
|---|---|---|
| T1 | Première lecture dans une session | `output` contient `Test Instructions` et `system-reminder` |
| T2 | Seconde lecture d'un **autre** fichier du même dossier, avec `nextMessage` | `output` **ne contient pas** `Test Instructions`, contient `already in context` (le `POINTER`), et `Buffer.byteLength(output) < 512` |
| T3 | Réécriture de l'`AGENTS.md` (taille + mtime changeants) puis relecture du fichier initial avec `nextMessage` | `output` contient **à nouveau** `Test Instructions` (non-régression de la correction) |
| T4 | `rollback.injectionInstructions: "off"` | `output` ne contient **aucune** occurrence de `system-reminder` |
| T5 | Budget : `AGENTS.md` de 40 KiB | `Buffer.byteLength(output) - Buffer.byteLength(contenuFichier) < 8192 + 256` |
| T6 | Régression | `bun test test/tool/read.test.ts` passe **sans modifier** `read.test.ts:654-668` |
| T7 | **Chemin `provenUnchanged`** : relecture du **même** fichier, non modifié, avec `nextMessage` | voir ci-dessous |
| T8 | Compaction : après `ReadLedger.reset(sessionID)`, relecture du même fichier | `output` contient de nouveau `Test Instructions` — le corps a été réémis, donc `POINTER` n'a jamais survécu à l'évacuation du message porteur |

**T7 — le test qui porte la moitié du coût.** C'est le test qui exerce réellement
`read.ts:408`, c'est-à-dire la branche de rétention que T2 **n'atteint pas**.

*Pourquoi T2 ne suffit pas.* T2 lit un **autre** fichier du même dossier. Les octets rendus
sont différents, donc le digest calculé au moment de l'envoi
(`const contentDigest = ReadLedger.digest(...)`, chemin `read.ts:446`) diffère du digest déjà
enregistré. La branche de détection de duplicat compare ces deux empreintes
(`read.ts:458-459`) et **ne se déclenche pas**. Le rendu part donc en **chemin complet**
(`read.ts:466`) — le chemin que la proposition ne prétend pas prouver. `ReadLedger.duplicateOf`
n'est pas en cause. T2 prouve donc l'absence de réinjection **sur le chemin complet**, et ne
touche pas la branche `unchanged`.

*Ce que T7 doit faire.* Relire **le même** fichier, **sans aucune modification** entre les
deux lectures. La clé du ledger `ReadLedger.get(ctx.sessionID, ledgerKey)`
(`read.ts:356`) est alors retrouvée, et le test est validé par
`if (seen && ReadLedger.provenUnchanged(seen, file.mtime, file.size)) return unchanged(seen)`
(`read.ts:408`). On observe alors `ReadLedger.stub(filepath, entry) + reminder`
(`read.ts:362`), c'est-à-dire `stub + POINTER`.

```ts
it.live("withholds the instruction body on the provenUnchanged path (read.ts:408 -> read.ts:362)", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    yield* put(path.join(dir, "subdir", "AGENTS.md"), "# Test Instructions\nDo something special.")
    yield* put(path.join(dir, "subdir", "nested", "test.txt"), "test content")

    const first = yield* exec(dir, { filePath: join(dir, "subdir", "nested", "test.txt") })
    expect(first.output).toContain("Test Instructions")

    // Same file, untouched: mtime and size are identical, so provenUnchanged holds.
    const second = yield* exec(dir, { filePath: join(dir, "subdir", "nested", "test.txt") }, nextMessage)
    expect(second.output).toContain("Unchanged since your earlier read")
    expect(second.output).toContain("already in context")
    expect(second.output).not.toContain("Test Instructions")
    expect(Buffer.byteLength(second.output)).toBeLessThan(512)
  }).pipe(it))
```

*Critères de succès observables, un par propriété :*

- `Unchanged since your earlier read` présent ⇒ la branche `read.ts:408` a rendu la main
  (`read-ledger.ts:427` est la ligne du stub), donc le chemin de **rétention** est traversé et
  pas seulement le chemin d'envoi.
- `Test Instructions` **absent** ⇒ le corps intégral n'a pas été réinjecté sur ce chemin.
- `already in context` présent ⇒ c'est `POINTER`, la constante, qui a été concaténée à
  `read.ts:362` — et non un corps variable.
- `Buffer.byteLength(output) < 512` ⇒ la rétention retire réellement des octets, ce qui est la
  moitié du gain annoncé. Sans cette borne, un stub + corps complet passerait les deux
  assertions de contenu.

Commandes exactes (cwd `packages/opencode`) :

```
bun test test/tool/read-instruction-reminder.test.ts
bun test test/tool/read.test.ts test/session/instruction.test.ts test/provider/cache-anchor.test.ts
bun typecheck
```

Critère de succès global : les deux `bun test` sortent en **0** et `bun typecheck` sort en
**0**. T1↔T3 prouvent ensemble la dédup *et* sa invalidation sur changement ; **T2 prouve
l'absence de réinjection sur le chemin complet et T7 la prouve sur le chemin de rétention
`read.ts:408 → read.ts:362` — aucun des deux ne peut se substituer à l'autre** ; T4 prouve la
compatibilité `off` ; T5 prouve le budget ; T8 prouve le couplage obligatoire à `reset`.

## 8. Effort

**M** — trois fichiers, un magasin borné ajouté à un ledger existant, un champ de type
élargi, quatre sites d'appel, aucune nouvelle dépendance et aucune migration de données.

## 9. Verdict self-assessment

**READY**

*Auto-évalué sur les preuves de cette session ; aucune affirmation de cette proposition ne
dépend d'une exécution de code non faite.* Trois motifs de READY, deux risques résiduels
assumés.

Trois motifs de READY, tous établis sur du code lu cette session.

1. **La non-régression est structurelle, pas empirique.** Le test qui décide du sort de ce
   correctif (`read.test.ts:654-668`) porte sur une **première** lecture dans un `tmpdir`
   frais. Aucune signature n'est enregistrée, donc `fresh` est non vide, donc le corps
   complet est émis et `toContain("Test Instructions")` reste vrai. Le mécanisme de dédup ne
   peut pas l'atteindre.
2. **La dédup existante est un plancher, pas un remplacement.** `extract` (`instruction.ts:24-39`)
   et `s.claims` (`instruction.ts:97`, `311-321`) restent actifs. Une régression du magasin de
   signatures ne peut donc pas entraîner la perte complète des instructions.
3. **Le risque de compaction n'est pas une doctrine à trancher : il est déjà implémenté.**
   `read-ledger.ts:48-51` énonce qu'une compaction fait oublier *toute* entrée du ledger et
   incrémente son epoch, que `session/compaction.ts` appelle `reset`
   (`read-ledger.ts:473`, epoch `read-ledger.ts:488`), et que ce clear est persisté pour
   qu'un redémarrage ne puisse pas ressusciter un stub pointant vers des octets qu'une
   compaction a supprimés. En rangeant le magasin de signatures dans cet état et en le vidant
   par ce `reset` (section 4.2), `POINTER` ne peut pas survivre à l'évacuation du message qui
   portait le corps. T8 verrouille ce comportement.

**Risque résiduel 1, à ne pas confondre avec un point ouvert.** La **première** injection de
chaque `(chemin, signature)` reste en clair et hors bande : un `AGENTS.md` **committé dans le
dépôt** s'exécute toujours une fois, et `POINTER` ne corrige que la répétition (voir §6.1).
Le présent document réduit l'amplification — de ~205 copies par session à une — mais il **ne
valide pas** les sources d'instructions. Corriger `packages/opencode/AGENTS.md`, qui prescrit
`tmux new-session -d` sur une plateforme win32 où `tmux` n'existe pas, et introduire un
contrôle de provenance sur les fichiers d'instructions trouvés par montée de nom sont deux
travaux distincts, hors périmètre ici. À noter : les sources **distantes** de la config ne
sont pas ce risque, elles sont écartées (`instruction.ts:206-211`).

**Risque résiduel 2, mineur.** `read.ts:445` commente que le digest est calculé sur le contenu
rendu *avant* l'ajout du reminder, et le rappel est ajouté à `read.ts:466`. Il faut vérifier à
l'implémentation que la **consultation du cache** de l'outil a lieu après `reminderFor` et
non avant, sinon un même chemin relu dans la fenêtre du cache serait servi depuis le cache
**avec** son reminder au lieu de repasser par `reminderFor`. L'effet serait borné par la TTL
du cache et par le fait que le cache est indexé par chemin
(`ReadLedger.key(filepath, offset, limit)`, `read-ledger.ts:280`), donc par chemin.
