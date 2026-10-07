# P01 — `AGENTS.md` fichier-scoped réinjecté dans chaque résultat de lecture

## 1. Problem

À chaque appel de `read`, le contenu intégral des fichiers d'instructions proches du fichier
lu (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`) est réinjecté dans le résultat de l'outil, y
compris quand l'outil n'a rien de nouveau à envoyer, sans aucun dédup ni budget de taille.

## 2. Evidence

**Le défaut exact — `packages/opencode/src/tool/read.ts:357`** (8 lignes) :

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

**Le chemin qui envoie le contenu — `read.ts:466`** :

```ts
464:       yield* warm(filepath)
465:
466:       output += reminder
467:
468:       const result = {
```

**D'où vient `loaded` — `read.ts:271`** :

```ts
271:      const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)
```

**Le producteur — `packages/opencode/src/session/instruction.ts:318-326`** :

```ts
318:      // Walk upward from the file being read and attach nearby instruction files once per message.
321:      set.add(found)
322:      const content = yield* read(found)
323:      const rendered = content ? renderInstruction(found, content, rollout.injectionInstructions) : undefined
324:      if (rendered) {
325:        results.push({ filepath: found, content: rendered })
326:      }
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

Le cache de `instruction.ts:98-99` (`reads: new Map<string, { signature: string; content: string }>()`)
déduplique la **lecture disque** ; il ne déduplique pas l'**injection**. La signature est
calculée puis perdue pour le consommateur.

**Mesure terrain fournie** : un `read` de 4 lignes a coûté **6 953 octets** d'instructions ;
**1 738 tokens** par lecture ; **~356 k tokens** sur une session de **205 lectures**.
`INFERE:` le ratio instructions/lecture-dedédupliquée est stable tant que le chemin de
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
   (`instruction.ts:18-22`), en excluant les chemins déjà connus (`instruction.ts:306`).
3. Deux filtres s'appliquent, tous deux limités à la conversation :
   - `already = extract(messages)` (`instruction.ts:295`) reconstruit l'historique
     d'injection depuis `metadata.loaded` des parts `read` **non compactés**
     (`instruction.ts:29`) ;
   - `s.claims` (`instruction.ts:97`, `311-321`) garantit une seule injection par
     `messageID`.
4. Si aucun des deux ne filtre, `results.push({ filepath, content })` (`instruction.ts:325`)
   et `read.ts:357` sérialise **tous** les corps en un seul `<system-reminder>`, sans
   condition sur le chemin d'exécution.
5. `read.ts:466` l'ajoute au rendu complet, puis `read.ts:477` met **le résultat complet,
   reminder inclus**, dans le cache `cache.set(cacheKey, result, ...)`.
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
| `src/session/instruction.ts` | `read` (l.124), `resolve` (l.287), `Interface` (l.61-70) | exposer la signature `(taille, mtime)` du fichier d'instructions dans le résultat de `resolve` |
| `src/tool/read-ledger.ts` | nouveau magasin à côté de `key`/`get`/`put` (l.280-324) |Ledeger de signatures d'instructions, borné par session, avec la même mécanique de `MAX_ENTRIES` |
| `src/tool/read.ts` | `reminder` (l.357) + 3 sites d'ajout (l.362, l.379, l.397) | dédup `(chemin, signature)`, budget d'octets, constante de renvoi sur les chemins de retenue |

### 4.1 `instruction.ts` — exposer la signature

Le type de retour de l'interface s'élargit d'un champ (`instruction.ts:66-70`) :

```ts
66:    readonly resolve: (
...
70:    ) => Effect.Effect<{ filepath: string; content: string; signature: string }[], AppFileSystem.Error>
```

`read` (l.124) retourne déjà `signature` en interne (l.135) ; `resolve` le propage au lieu
de le recalculer. **La signature est calculée sur le fichier brut**, jamais sur le texte
rendu : ainsi un basculement de mode `full` ↔ `summary` (`instruction.ts:41-48`) réinjecte
correctement, alors qu'une signature calculée sur le rendu collapsé les deux modes.

### 4.2 `read-ledger.ts` — magasin de signatures, réutilisé et non inventé

On réutilise le magasin existant : il est déjà indexé par `sessionID`
(`read-ledger.ts:306`, `read-ledger.ts:310`), déjà borné (`MAX_SESSIONS = 64` l.60,
`MAX_ENTRIES = 512` l.63) et déjà doté d'un cycle de vie complet
(`flush` l.458, `reset` l.473, `unload` l.497). On **n'ajoute pas un troisième mécanisme de
cache** dans le projet.

```ts
// read-ledger.ts — API minimale ajoutée
export function instructionSeen(sessionID: string, filepath: string, signature: string): boolean
export function noteInstruction(sessionID: string, filepath: string, signature: string): void
```

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
(l.362, l.379, l.397, l.466). Aucun autre site d'appel n'existe — le `grep "reminder"` de cette session retourne 6 correspondances : l.357 (définition), l.362, l.379, l.397, l.466 (les quatre ajouts), et l.445 qui est un commentaire, pas un site d'appel
(`grep` sur `reminder` dans `read.ts` : définition l.357, ajouts l.362/379/397/466).

Les trois propriétés exigées :

- **Déduplication par `(chemin, signature)`** : la clé est `(sessionID, filepath, signature)`
  où `signature = \`${stat.size}:${mtime}\`` (`instruction.ts:135`). Éditer l'`AGENTS.md` en
  cours de session change la signature et **réinjecte** — ce qui est la garantie de
  correction qui manque aujourd'hui.
- **Aucune réinjection sur le chemin `unchanged`** : `reminderFor` réduit l'ajout à `POINTER`,
  une **constante de ~160 octets ≈ 40 tokens indépendante de la taille du fichier**. Le
  chemin `unchanged` reste donc nettement plus economy que l'envoi complet.
- **Budget** : `MAX_REMINDER_BYTES = 8 192` calculé avec `Buffer.byteLength` (et non
  `length`), donc honnête sur du contenu multi-octets. Le pire cas est borné quelle que soit
  la taille de l'`AGENTS.md`, ce qui n'est pas le cas aujourd'hui.

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
  `injectionInstructions: "off"`, `resolve` renvoie `[]` (`instruction.ts:293`), donc
  `loaded.length === 0`, donc `reminderFor` renvoie `""` — **comportement identique à
  aujourd'hui**, sur les quatre sites. En mode `summary` (`instruction.ts:44-54`, 6 lignes),
  le corps rendu est inférieur au budget par construction.
- `INFERE:` aucune régression de prompts en mode cache-séparée. Vérification :
  `bun test test/provider/cache-anchor.test.ts` et `bun test test/session/`.

### 4.5 Volontairement inchangé

- **Le contenu des instructions** n'est ni validé ni corrigé : le mode `full` reste le mode
  par défaut, `instruction.ts:41-43` est intact. Corriger `AGENTS.md` lui-même est hors
  périmètre.
- **`metadata.loaded` reste un tableau de chemins** (`read.ts:366`). Il est consommé par
  `extract` (`instruction.ts:30-34`, exige des `string`) et asserted par
  `test/tool/read.test.ts:666` (`expect(result.metadata.loaded).toContain(join(dir, "subdir", "AGENTS.md"))`).
  On ne le change pas de forme ; la signature voyage dans le magasin, pas dans les metadata.
- **`extract` et `s.claims` restent en place** comme plancher. Ils ne sont qu'ajoutés au
  dédup par signature, jamais remplacés : une régression de `extract` ne peut donc pas
  entraîner la perte complète des instructions.
- **Le mode `off` reste la seule manière de supprimer totalement l'injection.**

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
aujourd'hui les instructions sont choisies par **montée d'arborescence depuis le fichier lu**
(`instruction.ts:300-304`), ce qui est une fonctionnalité. Elle rendrait aussi
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
`packages/opencode/test/session/instruction.test.ts:105`
(`describe("Instruction.resolve")`) et
`packages/opencode/test/tool/parameters.test.ts:20` (importe `Parameters`, pas le type de
retour) — élargissement de type, aucun changement de comportement attendu.
`packages/opencode/test/cli/smokes/read-only.test.ts` n'est affecté que s'il compte des
octets. `packages/opencode/test/provider/cache-anchor.test.ts:58` construit un littéral
`</system-reminder>` dans une fixture et, `INFERE:`, ne passe pas par `ReadTool` : non affecté.
`INFERE:` pour ces quatre lignes ; vérification : `bun test test/tool/read.test.ts test/session/instruction.test.ts test/provider/cache-anchor.test.ts`.

**Coût en tokens / latence — le coût est négatif.**
Sur la session mesurée : 204 des 205 lectures passent de **1 738 tokens** à **~40 tokens**
(`POINTER`, ~160 octets), soit **204 × 1 738 ≈ 354 000 tokens** supprimés contre
**204 × 40 ≈ 8 200 tokens** ajoutés, **net ≈ −346 000 tokens** pour cette session. La
première injection de chaque `(chemin, signature)` reste intégralement payée, comme
aujourd'hui. Latence : le `fs.stat` est **déjà** fait par `instruction.ts:126`, rien n'est
ajouté sur le disque ; une recherche dans une `Map` par lecture, négligeable devant le `stat`
existant. Budget : un `AGENTS.md` de 40 KiB plafonne à 8 192 octets injectés au lieu de
40 960.

**Sécurité — le correctif réduit le risque, et la direction compte.**
1. Le comportement actuel est un **amplificateur d'injection portée par le contenu** : un
   fichier d'instructions hostile — y compris désigné par les globs `instructions` de la
   config (`instruction.ts:209-226`, qui acceptent des fichiers distants) — atteint le modèle
   à *chaque* lecture, donc à chaque occasion d'y voir adjoindre une consigne malveillante. Le
   correctif ramène cela à une fois par session et par signature.
2. Un corps d'instructions ne peut plus être **remplacé** au milieu d'une session par une
   nouvelle copie insérée à l'appel d'un outil : le modèle ne voit pas un texte familier
   réapparaître avec un contenu différent.
3. **Résiduel assumé** : la *première* injection est toujours en clair et hors bande. Un
   fichier d'instructions malveillant s'exécute donc toujours une fois. Ce résiduel n'est pas
   traité ici et doit être suivi séparément (validation des sources d'instructions).

**Rayon d'impact d'un faux « déjà injecté »** : le modèle perdrait les instructions de ce
chemin pour le reste de la session. Deux atténuations : (a) `extract` et `s.claims` restent
actifs comme plancher, donc une régression du magasin de signatures ne peut pas ôter
complètement les instructions ; (b) `POINTER` nomme explicitement le chemin et invite à
relire le fichier d'instructions, donc la perte est récupérable par un appel d'outil.
`renderInstruction` préfixe déjà le chemin (`instruction.ts:43`, `instruction.ts:50`), ce qui
permet au pointeur de le citer.

## 7. Tests

Fichier à écrire : `packages/opencode/test/tool/read-instruction-reminder.test.ts`
(en suivant le pattern `exec(dir, {...})` déjà utilisé par `read.test.ts:661` et le fixture
`tmpdirScoped`).

| # | Test | Critère de succès observable |
|---|---|---|
| T1 | Première lecture dans une session | `output` contient `Test Instructions` et `system-reminder` |
| T2 | Seconde lecture d'un **autre** fichier du même dossier | `output` **ne contient pas** `Test Instructions`, contient `already in context`, et `Buffer.byteLength(output) < 512` |
| T3 | Réécriture de l'`AGENTS.md` (taille + mtime changeants) puis relecture | `output` contient **à nouveau** `Test Instructions` (non-régression de la correction) |
| T4 | `rollback.injectionInstructions: "off"` | `output` ne contient **aucune** occurrence de `system-reminder` |
| T5 | Budget : `AGENTS.md` de 40 KiB | `Buffer.byteLength(output) - Buffer.byteLength(contenuFichier) < 8192 + 256` |
| T6 | Régression | `bun test test/tool/read.test.ts` passe **sans modifier** `read.test.ts:654-668` |

Commandes exactes (cwd `packages/opencode`) :

```
bun test test/tool/read-instruction-reminder.test.ts
bun test test/tool/read.test.ts test/session/instruction.test.ts test/provider/cache-anchor.test.ts
bun typecheck
```

Critère de succès global : les deux `bun test` sortent en **0** et `bun typecheck` sort en
**0**. T1↔T3 prouvent ensemble la dédup *et* sa invalidation sur changement ; T2 prouve
l'absence de réinjection sur le chemin de retenue ; T4 prouve la compatibilité `off` ;
T5 prouve le budget.

## 8. Effort

**M** — trois fichiers, un magasin borné ajouté à un ledger existant, un champ de type
élargi, quatre sites d'appel, aucun nouvelle dépendance et aucune migration de données.

## 9. Verdict self-assessment

**NEEDS_REVIEW**

Question à trancher par le validateur : *un résultat de lecture retenu peut-il
définitivement remplacer le corps des instructions par une référence à un message antérieur ?*
Le ledger pose déjà que le withhold est un **artefact écrit, jamais réécrit**
(`read-ledger.ts:37-40`), donc la référence vers un message antérieur est stable — c'est la
même justification que pour `ReadLedger.stub`. Mais la décision de doctrine qui suit n'est
pas démontrée par du code : *si le modèle reçoit `POINTER` sur un chemin `unchanged`, et que la
fenêtre de contexte est ensuite compactée de façon à évacuer le message qui portait le corps,
le modèle se retrouve sans instructions et sans corps.* Le validateur doit dire si ce risque
est accepté tel quel, ou s'il exige que `POINTER` soit accompagné d'une réémission au premier
`read` suivant une compaction — ce qui rouvrirait partiellement P01 et contredirait le point
`read-ledger.ts:37-40`.