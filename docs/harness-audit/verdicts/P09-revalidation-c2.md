# P09 — revalidation 2 — `NOT_IMPLEMENTABLE`

Sujet : `bash` — règle d'écriture de l'artefact de troncature.
Proposition évaluée : `docs/harness-audit/proposals/P09-bash-artifact-first.md`.
Verdict de cycle 1 : `docs/harness-audit/verdicts/P09-revalidation.md`.

Revalidateur : **`independent`**. Je n'ai rédigé ni la proposition v1, ni la révision, ni le verdict
de cycle 1. Je ne corrige rien : tout ce que je constate de faux reste un finding. Je n'ai **pas** de
shell — aucune commande exécutée, aucun `git` invoqué, aucun commit. Seul artefact écrit : ce fichier.

Décisions reprises sans rediscussion : **A-3**, **A-4**, règle 7 (shell autorisé), règle 10 (un défaut
trouvé dans la proposition reste `open`), **C-32** (un seul `open` interdit l'implémentation, sans
nuance), **C-62**.

## Final verdict

**`NOT_IMPLEMENTABLE`**

`RESIDUES_REMAINING: 19`

Décomposition exacte du compte, lue dans la **colonne de statut réelle** (3ᵉ colonne) :

- **15** lignes du registre de résidus `### 8.1` — `P09-bash-artifact-first.md:786` à `:800`.
- **4** lignes `open` supplémentaires dans `### 8.3` — `:818`, `:820`, `:822`, `:824`.

Total = 19 cellules de statut portant `open`.

Les deux autres mesures communiquées sont expliquées, et ne sont pas en contradiction :

| mesure | valeur | ce qu'elle compte réellement |
|---|---|---|
| motif strict `\| open \|` | **11** | les lignes dont la cellule est *exactement* `` `open` `` : `:786`-`:793` (8) + `:797`, `:799`, `:800` (3) |
| annonce de l'auteur (§8.1) | **15** | les 15 lignes du registre `:786`-`:800`, y compris les 4 cellules transitoires `` `open` → traité/corrigé `` |

11 + 4 = 15 : l'arithmétique est cohérente. Le compte de l'orchestrateur (11) est **juste mais
incomplet** ; il ignore les 4 lignes `open` → traité/corrigé. L'annonce de l'auteur (15) est **juste
pour §8.1** mais **incomplète pour le fichier** : §8.3 ajoute 4 `open` que le décompte `:802` ne
mentionne pas. Voir finding **C2-09**.

## Titre réel de la section des résidus

L'affirmation « aucun titre `## Residus` dans le fichier » est **réfutée** : un motif littéral
`## Residus` ne matche pas, mais le titre existe et il est **numéroté**.

- `P09-bash-artifact-first.md:777` — `## 8. Residus`
- `:782` — `### 8.1 Résidus \`open\` — 15 lignes`
- `:805` — `### 8.2 Résidus \`out_of_scope\` — 4 lignes`
- `:814` — `### 8.3 Les sept points non mesurés — statut opposable (N-7)`
- `:826` — `### 8.4 Mesures reprises, non rejouées par moi`

Longueur du fichier : **968 lignes** — confirmé. Le compteur interne de lecture rapporte
« Showing lines 742-773 of 968 » pour la dernière tranche de §7, et « 968 » est le total du fichier.

## Findings

Une ligne par résidu. `preuve` porte toujours `fichier:ligne`.

| id | severite | statut | preuve |
|---|---|---|---|
| **#3** — patch d'étape 3 : `effectiveFailed` jamais consommé ; `failed` typé `boolean \| undefined` | high | **open** | Les **deux** sous-défauts sont addressed au niveau du texte, mais l'exigence reste ouverte. `P09-bash-artifact-first.md:499` définit `const effectiveFailed: boolean = signaled \|\| ERROR.test(useful)` ; `:505` substitue `effectiveFailed` dans l'en-tête `:233` ; `:508` remplace `known \|\| failed` à `:244` ; `:510` traite `:258` — soit **trois** consommateurs, contre le « zéro » du cycle 1. La moitié « `boolean \| undefined` » est **retirée et c'est le cycle 1 qui avait tort** : `:154` cite `terminal-output.ts:182-184`, relu, `terminal-output.ts:182` est `const failed =` et les deux membres du `\|\|` sont des `.some(...)` donc `boolean`. **Mais l'exigence 3 reste `open`** : `:789` (R5) déclare que le correctif ne porte l'échec que sur le rendu, que `metadata.exit` et `metadata.truncated` ne sont pas touchés, et que « rien ne prouve que S4 passe ». |
| **#8** — R6 `open`, invariant réécrit, rien de fourni | high | **open** | `:744-773` (titre `## 7. \`Required change\` 8 — R6 : la revendication est **retirée**`). `:756` fournit le seuil `Buffer.byteLength(end.text, "utf-8") > 0`, `:758-759` amende l'invariant en `d < r`. **C'est la seconde branche du remède du cycle 1** (verdict:36 : « Fournir la distribution des tailles, **ou** conditionner l'écriture à un seuil »). Mais `:764-768` avoue que la distribution reste inconnue et que le coût d'I/O n'est pas chiffré ; `:790` maintient R6 `open` ; et `:772-773` — « C'est un résidu nommé, pas un \`open\` laissé en suspens » — **contredit sa propre cellule de statut**. Le seuil fourni vaut `> 0` : ce n'est pas un seuil dérivé d'une distribution. |
| **N-1** — motif « deux seuils disjoints » mathématiquement faux | medium | **open** | `:794` — statut `open` → **traité**, « Le motif est retiré du texte » (§2.8). Le fait sous-jacent est confirmé au code : `terminal-output.ts:242-243` (`Math.max(0, budget - … - 600)`, `MAX_LINES - 10`) puis `:246` `const reduced = incremental \|\| useful !== extracted.text \|\| initial !== useful \|\| (structured && initial !== raw)` — au-delà de 110 lignes `initial !== useful` est forcé, donc `reduced`. Le **motif** est clos (le texte ne l'affirme plus) ; le résidu survit sur « la population réellement touchée n'est pas quantifiée ». |
| **N-2** — étape 2 inopérante, `:265` écrase le chemin amont | high | **open** | `:795` — statut `open` → **corrigé** (« Vérifiable par S3 »). Le diagnostic est confirmé au code : `:561-566` reproduit `terminal-output.ts:263-265`, relu = `metadata: {` / `...input.metadata,` / `...(outputPath ? { outputPath } : {}),` — le mécanisme d'écrasement décrit existe bien. Le patch `:574-577` pose `const upstream = references[0]`, `needsOwnArtifact = references.length === 0 && Buffer.byteLength(raw, "utf-8") > 0`, `outputPath = upstream ?? (reduced && needsOwnArtifact ? yield* input.store.write(raw) : undefined)`, et `:580-584` traite `:265`. Non exécuté ⇒ `open`. |
| **N-3** — `p` mal défini, chiffre-clé « 3 % » | medium | **open** | `:796` — statut `open` → **traité quant au texte** : « Le chiffre "3 %" est **retiré** », §3 nomme `s`, `r`, `d`. Le champ mesuré est bien `terminal-output.ts:274` `rawBytes: Buffer.byteLength(raw)`, ce que le cycle 1 signalait (verdict:180). Reste `open` : « `s`, `r`, `d` ne sont **pas** encore mesurés sur les deux charges ». |
| **N-4** — base verte désignée hors sujet / `Truncate.limits()` citée à `:44` | medium | **open** | **Moitié ancre : close.** `:21-22` et `:226-245` rectifient : `:44` est la déclaration d'interface (citation `:228`, relue : `truncate.ts:44` = `readonly limits: () => Effect.Effect<{ maxLines:` ✓) et l'implémentation est `truncate.ts:75-83`, dont le bloc `:232-240` reproduit `const limits = Effect.fn("Truncate.limits")(function* () {` … ✓ **identique** au relu. La dérive d'ancres est donc bien corrigée. **Moitié base verte : aggravée.** `:797` — « **Maintien, aggravé** » ; `:841-843` désigne `test/tool/shell.test.ts` comme base de non-régression, alors que `:837` enregistre ce même fichier « **non rejouée** — instable : 63/32/1 puis 62/33/4 — **exclue de toute porte** ». La proposition désigne pour porte un fichier qu'elle exclut elle-même de toute porte. |
| **N-5** — restriction de périmètre absente du patch | **high** | **open** — **la clôture annoncée est fausse** | `:798` affirme : « §5.4 insère la garde `normalized !== "bash"` dans le patch, au site `:155` ». **Réfuté par relecture.** (a) Le patch §5.4 occupies `:571-584` et ne contient **que** les éditions de `:246-247` et `:265` — aucune garde. (b) La chaîne `normalized !== ` n'apparaît **qu'une seule fois dans tout le fichier** : `:798` lui-même, la revendication. (c) Le site `:155` ne peut pas la porter : `terminal-output.ts:155` est `if (!isLeanTerminalTool(input.tool, input.args)) return { … }`, tandis que `normalized` est déclaré à `terminal-output.ts:163` — **après** `:155`. La garde proposée à `:155` violerait le TDZ. La déclaration « corrigé » de `:798` est un constat faux sur sa propre proposition. |
| **N-6** — `R11` `accepted` sans preuve, S5 inpassable | medium | **open** | `:799` — « **Maintien** : `scan` n'est pas retourné ; S5 retiré de §9 ; contrepartie transférée à P12 ». Confirmé au code : `shell.ts:741` `const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)` est à l'intérieur de `Effect.scoped(Effect.gen(function* () { … }))` (`shell.ts:736-745`) dont le générateur **ne retourne rien** — il ne produit que des effets (`:738-743`). La garantie est réelle, l'observabilité nulle. `:868` retire S5 ; `:296` et `:739`.transfert. `R11` reste `open` en `:793`. |
| **N-7** — sept « points non mesurés » sans statut | medium | **open** | `:814-824` est bien le remède annoncé (« Statut opposable : voir §8.3 ») : chaque point reçoit un statut. **La fermeture est donc réelle sur le défaut d'énoncé** — mais **4 des 7 statuts sont `open`** : `:818` (site d'appel `terminal-output.ts:156` non isolé), `:820` (`shell.ts:673` / `:598` relus, valeur intermédiaire non instrumentée), `:822` (collision sur `truncate.ts:69` `ToolID.ascending()` non vérifiée), `:824` (retour `bash` POSIX non revalidé). `:800` maintient N-7 `open`. |
| **R2** — base probatoire contradictoire | high | **open** | `:786`. Confirmé : `terminal-output.ts:162` `const raw = input.output` et `:274` `rawBytes: Buffer.byteLength(raw)` — donc `rawBytes` est bien la taille de `raw` ; « 35 129 o écrits » et « `rawBytes = 1 148` » ne peuvent désigner le même `raw`. « Aucune property du code ne peut lever ce résidu » (`:786`). |
| **R3** — artefact non borné par fichier | high | **open** | `:787`, reinforced `:480`. Confirmé : `truncate.ts:68-73` `const write = Effect.fn("Truncate.write")(function* (text: string) {` — signature à un seul paramètre, aucun paramètre de taille, aucun plafond. `:657` et `:686` maintiennent R3 « bloquant ». |
| **R4** — chemin amont absent pour 2 000 – 51 200 o | medium | **open** | `:788` — « §5.1 fournit le mécanisme, §5.4 fournit la propagation. **Maintien** : rien n'est exécuté ». Mécanisme relu : `shell.ts:707` `...(cut && file ? { outputPath: file } : {})` n'est posé que sous `cut && file`. |
| **R5** — `exit === 0` avec marqueur d'erreur non détecté | high | **open** | `:789`. Résidu jumeau de `#3`, avec remède distinct — compté une seule fois comme `#3` ci-dessus, mais **`open` de son côté propre**. |
| **R6** — coût I/O et volume de l'écriture conditionnée | high | **open** | `:790`, développé `:764-773`. Distribution absente, question « mal formulée » (§2.8), coût d'I/O « non chiffré ». Aucune valeur inventée — c'est le point honnête de la proposition. |
| **R7** — double écriture et divergence des artefacts | high | **open** | `:791`. Confirmé : `shell.ts:682` `const raw = list.map((item) => item.text).join("")` puis `:683` `const end = tail(raw, limits.maxLines, limits.maxBytes)`, `:684` `if (end.cut) cut = true`, `:685-686` `if (!file && end.cut) { file = yield* trunc.write(raw) }`, `:707` publication. Un `raw` amputé est donc bien écrit pour toute sortie au-delà de `keep`. |
| **R10** — injection via un artefact dérivé de la sortie du processus | medium | **open** | `:792`. Rétrogradé d'`accepted`. Confirmé : la mitigation `Upstream reference (unverified; not opened)` n'existe qu'à `truncate.ts:130` (relu : template `hint`, `:128` `const file = yield* write(text)`) et ne couvre que `references`, construit à `terminal-output.ts:157-160`. §5.4 restreint l'écriture à `references.length === 0` (`:576`) — réduction de surface, pas fermeture. |
| **R11** — `collect()` : garantie réelle, observabilité nulle | medium | **open** | `:793`. Même ligne que N-6, comptée une seule fois comme `N-6` ci-dessus. Preuve : `shell.ts:741` seul site d'appel. |
| **C2-08** *(nouveau)* — **`#8` : la réconciliation de statut est contradictoire** | medium | **open** | `:772-773` affirme « C'est un résidu nommé, **pas** un \`open\` laissé en suspens », dans le paragraphe même qui maintient R6, dont la cellule de statut est `open` à `:790`. Deux énoncés opposables dans le même fichier, sur le même résidu, sans règle de priorité. Règle 10 : la qualification de l'auteur ne ferme rien. |
| **C2-09** *(nouveau)* — **le décompte `:802` est un sous-compte** | medium | **open** | `:802-803` — « **Décompte : 15 lignes \`open\`** ». Vrai pour §8.1 (`:786`-`:800`), faux pour le fichier : `### 8.3` ajoute 4 cellules `open` (`:818`, `:820`, `:822`, `:824`) jamais comptées. Le total relu est **19**. |
| **C2-10** *(nouveau)* — **le patch §5.4 contient un bloc que l'auteur déclare ne pas écrire** | low | **open** | `:583` `...(upstream ? {} : {}),` figure dans le diff proposé, puis `:597-599` déclare « Le second bloc de \`:265\` est **néant** et ne doit pas être écrit ». Un diff livré contient du code que son auteur interdit d'écrire. |

## Audit de citations

35 citations `fichier:ligne` confrontées au code réel par relecture. **33 vraies, 2 fausses.**

Citations confirmées (échantillon vérifié, code relu) :

| citation | contenu réel relu |
|---|---|
| `truncate.ts:10` | `import { TRUNCATION_DIR } from "./truncation-dir"` |
| `truncate.ts:15` / `:16` / `:17` | `MAX_LINES = 2000` / `MAX_BYTES = 50 * 1024` / `DIR = TRUNCATION_DIR` |
| `truncation-dir.ts:4` | `path.join(Global.Path.data, "tool-output")` |
| `truncate.ts:44` | `readonly limits: () => Effect.Effect<{ maxLines:` — déclaration d'interface |
| `truncate.ts:75-83` | `const limits = Effect.fn("Truncate.limits")(function* () {` … identique au bloc `proposition:232-240` |
| `truncate.ts:68-73` | `write` = `(text: string)`, aucun paramètre de taille |
| `truncate.ts:69` / `:70` | `ToolID.ascending()` / `fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)` |
| `truncate.ts:128` / `:130` | `const file = yield* write(text)` / template `Tool output was truncated. … Upstream reference (unverified; not opened)` |
| `terminal-output.ts:7` / `:8` | `MAX_BYTES = 4_000` / `MAX_LINES = 120` |
| `terminal-output.ts:30` | `const ERROR = /\b(error\|failed\|failure\|fatal\|exception\|panic)\b\|^\s*\(fail\)/i` |
| `terminal-output.ts:151` (proposition) vs `:30` (code) | verbatim identique |
| `terminal-output.ts:155` / `:163` | garde d'entrée / déclaration de `normalized` — **cet ordre fonde C2-10/N-5** |
| `terminal-output.ts:157-160` / `:162` | construction de `references` / `const raw = input.output` |
| `terminal-output.ts:182` | `const failed =` — confirme que `failed` est `boolean`, refute le cycle 1 |
| `terminal-output.ts:212` / `:216` | `const known =` / `const useful = [` |
| `terminal-output.ts:233` / `:238` / `:243` / `:244` / `:246` / `:247` | header `${failed ? "; failed" : ""}` / ligne `budget` / `MAX_LINES - 10` / `known \|\| failed` / `reduced` / `write(raw)` |
| `terminal-output.ts:263-265` / `:266` | spread d'écrasement / `upstreamOutputPaths: references` |
| `terminal-output.ts:274` | `rawBytes: Buffer.byteLength(raw)` |
| `shell.ts:598` / `:605` / `:673` | `window.push(chunk)` / `trunc.write(full)` / `const last = window.get()` |
| `shell.ts:682` / `:683` / `:684` / `:685-686` | `raw` / `tail(...)` / `cut = true` / `if (!file && end.cut) { file = yield* trunc.write(raw) }` |
| `shell.ts:703` / `:705` / `:707` | `exit: code` / `truncated: cut` / `...(cut && file ? { outputPath: file } : {})` |
| `shell.ts:741` | `const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)` — seul site d'appel |

### Citations réfutées par relecture

| # | citation | ce que le code dit | finding |
|---|---|---|---|
| 1 | `proposition:789` — « \`metadata.exit\` (`:178`) », présenté comme le champ de metadata qui ne porte pas l'échec | `terminal-output.ts:178` est `const exit = hostExits.find((value) => value !== 0) ?? hostExits[0] ?? reportedExits.find(…) ?? reportedExits[0]` — une **variable locale** qui alimente l'en-tête. Le champ de metadata est `exit: code`, posé à `shell.ts:703`. La citation est **mal attribuée** : elle pointe sur le mauvais objet. Le raisonnement de R5 reste juste ; la preuve est fausse. | **open**, haute — la table de findings le porte sous `#3`/`R5` |
| 2 | `proposition:798` — « §5.4 insère la garde \`normalized !== "bash"\` dans le patch, au site \`:155\` » | La chaîne n'apparaît qu'à `:798`. Le patch `:571-584` ne la contient pas. `terminal-output.ts:155` précède la déclaration de `normalized` (`:163`). | **N-5 — open**, haute |

### Non vérifié par moi (ni confirmé ni réfuté — pas de shell, fichier non lu)

Je les déclare `unverified`, jamais `open`, et je ne les porte pas comme preuve :

- `proposition:797` et `:841-843` — `test/tool/shell.test.ts:1187`, `:1188`, `:1203`, `:1204`, `:1217`, `:1234`. Fichier de test non lu.
- `proposition:224` — `lean-output-policy.ts:4` (`LEAN_TERMINAL_MAX_CHARS`), `:248` — `lean-output-policy.ts:37-39`, `session/processor.ts:587`.
- `proposition:761` — `session/processor.ts:583`, `:400`.
- `proposition:64` et `:833`-`:839` — toutes les mesures reprises du rapport, jamais rejouées (`:828` : « Aucune commande n'a été exécutée dans cette révision »).

## État des findings de cycle 1

| finding cycle 1 | close ? | ligne du nouveau fichier qui l'établit |
|---|---|---|
| **#3** | **open** | `:789` (R5 maintenu `open`) — sous-défauts corrigés au texte à `:499`, `:505`, `:508`, `:510` ; la moitié « `boolean \| undefined` » était une erreur du **cycle 1** (`:154` contre `terminal-output.ts:182`) |
| **#8** | **open** | `:790` (R6 maintenu `open`) — la seconde branche du remède est fournie à `:756` et `:758-759`, mais `:764-768` avoue l'absence de distribution et de chiffrage |
| **N-1** | **open** | `:794` (`open` → traité ; motif retiré, mesure non faite) |
| **N-2** | **open** | `:795` (`open` → corrigé ; « Vérifiable par S3 », non exécuté) |
| **N-3** | **open** | `:796` (`open` → traité quant au texte ; `s`, `r`, `d` non mesurés) |
| **N-4** | **open** | `:797` (« Maintien, aggravé ») — moitié ancre close à `:21-22` / `:226-245`, confirmée contre `truncate.ts:44` et `:75-83` |
| **N-5** | **open**, clôture annoncée **fausse** | `:798` — le patch `:571-584` ne contient pas la garde ; site `:155` antérieur à `terminal-output.ts:163` |
| **N-6** | **open** | `:799` (« Maintien ») — confirmé par `shell.ts:736-745` |
| **N-7** | **open** | `:800` (« Maintien ») — les statuts existent à `:818`-`:824`, 4 d'entre eux sont `open` |

**Bilan : 0 finding de cycle 1 sur 9 fermé.** Deux moitiés de N-4 sont réellement réparées
(`truncate.ts:44` → `truncate.ts:75-83`, et le tableau de remappage d'ancres `proposition:339-344`
conforme au code relu), et le reproche de type du cycle 1 sur `failed` est **infirmé** — c'est le
seul progrès réel du cycle.

## Handed back to

**Auteur de la révision** (`docs/harness-audit/proposals/P09-bash-artifact-first.md`), pour un cycle 3.
Travail requis, dans cet ordre :

1. **N-5** — insérer réellement la garde `normalized === "bash"` dans le patch, à un site **postérieur**
   à `terminal-output.ts:163`, ou retirer la revendication de `:798`.
2. **#3 / R5** — étendre le correctif à `metadata` (propager l'échec dans un champ consumed par le
   pointeur), ou justifier que le rendu suffit. En attendant, S4 reste non démontré.
3. **C2-09** — corriger le décompte `:802` : 15 en §8.1, 19 sur le fichier.
4. **C2-08** — choisir entre la cellule `open` de `:790` et la phrase de `:772-773`.
5. **N-4** — désigner une base de non-régression **stable**, ou assumer explicitement que la base
   désignée est la porte et qu'elle est instable.
6. **C2-10** — retirer `...(upstream ? {} : {}),` du diff de `:583`.

Rien n'est réparable de mon côté : je n'ai pas écrit la proposition et je ne la corrige pas. Ce fichier
est mon seul artefact. Il n'est pas commité et je n'ai invoqué aucun `git`.
