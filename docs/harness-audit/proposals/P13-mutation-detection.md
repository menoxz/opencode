# P13 — mutation de fichier détectée par liste fixe de commandes (`bash`)

## 1. Problem

La permission de mutation de fichier n'est demandée que si le premier mot de la commande
figure dans deux listes de noms figées ; tout interpréteur lancé en mode inline
(`python -c`, `node -e`, `bun -e`) ou toute écriture par un utilitaire absent des listes
(`tee`, `sed -i`, `xxd`) échappe silencieusement à la demande d'accès au fichier visé.

## 2. Evidence

**Les deux listes sont des tables de noms, pas des propriétés de la commande.**

`packages/opencode/src/tool/shell.ts:42-63` :
```ts
const FILES = new Set([
  ...CWD,
  "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat",
  get-content, set-content, add-content, copy-item, move-item,
  remove-item, new-item, rename-item,
])
```
`packages/opencode/src/tool/shell.ts:64-77` :
```ts
const CMD_FILES = new Set([
  "copy", "del", "dir", "erase", "md", "mkdir", "move",
  "rd", "ren", "rename", "rmdir", "type",
])
```
Aucune propriété déclarative : rien ne dit *ce que* ces commandes font, seulement
*quelles* noms sont connus. Le commentaire `packages/opencode/src/tool/shell.ts:52-54`
assume l'état de fait :
```ts
  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir
  // already hit the entries above, and alias normalization should happen in one
  // place later so we do not risk double-prompting.
```

**La liste est le seul garde-fou de l'extraction des chemins.**

`packages/opencode/src/tool/shell.ts:409-416` :
```ts
        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
            const resolved = yield* argPath(arg, cwd, ps, shell)
            if (!resolved || containsPath(resolved, instance)) continue
            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
            scan.dirs.add(dir)
          }
        }
```
`cmd` est le premier token normalisé (`packages/opencode/src/tool/shell.ts:407`). Hors de
`FILES`/`CMD_FILES`, `pathArgs` (`packages/opencode/src/tool/shell.ts:203-213`) n'est jamais
appelé, donc aucun chemin n'atteint `scan.dirs`.

**Ce que la liste protège réellement : la permission `external_directory`.**

`packages/opencode/src/tool/shell.ts:278-290` :
```ts
  if (scan.dirs.size > 0) {
    const globs = Array.from(scan.dirs).map((dir) => { ... })
    yield* ctx.ask({
      permission: "external_directory",
      patterns: globs,
      always: globs,
      metadata: {},
    })
  }
```

**Ce que la permission générique ne protège pas.**

`packages/opencode/src/tool/shell.ts:292-298` :
```ts
  if (scan.patterns.size === 0) return
  yield* ctx.ask({
    permission: ShellID.ToolID,
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {},
  })
```
`ShellID.ToolID` vaut `"bash"` (`packages/opencode/src/tool/shell/id.ts:16`).
Or `packages/opencode/src/tool/shell.ts:419-422` alimente `scan.patterns` pour *toute*
commande hors `CWD`, indépendamment de `FILES` :
```ts
        if (tokens.length && (!cmd || !CWD.has(cmd))) {
          scan.patterns.add(source(node))
          scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
        }
```
Conséquence exacte : `python -c "…"` **décline déjà** la permission `bash`, dont la clé
d'octroi est `python -c *` (`BashArity.prefix` retombe sur `tokens.slice(0, 1)` puis sur
le premier préfixe connu, `packages/opencode/src/permission/arity.ts:1-9`). Ce qui manque
n'est pas l'invite générique, c'est `external_directory` : le chemin inscrit dans la charge
utilitaire inline n'est jamais résolu, donc un `open('../secret','w')` hors répertoire
d'instance ne déclenche aucune demande de répertoire externe.

**Chaîne d'appel complète.**

`packages/opencode/src/tool/shell.ts:649-654` :
```ts
                  const tree = yield* Effect.acquireRelease(parse(params.command, ps), ...)
                  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)
                  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)
                  yield* ask(ctx, scan)
```

**INFERE:** `containsPath(resolved, instance)` est vrai pour tout chemin sous le répertoire
d'instance, donc une écriture inline *dans* le projet est déjà couverte par la seule
permission `bash`. Vérification : `rg -n "export function containsPath" packages/opencode/src/project/instance-context.ts`
puis lecture de la fonction ; non exécuté ici faute de budget de lecture.

## 3. Mechanism

1. `packages/opencode/src/tool/shell.ts:636-646` — `execute` normalise `workdir`, le délai,
   et `ps = Shell.ps(shell)`.
2. `packages/opencode/src/tool/shell.ts:649` — `parse(params.command, ps)` produit l'arbre
   tree-sitter (bash **ou** powershell, `packages/opencode/src/tool/shell.ts:272-276`,
   `packages/opencode/src/tool/shell.ts:323-348`).
3. `packages/opencode/src/tool/shell.ts:652` → `collect(tree.rootNode, cwd, ps, shell, instanceCtx)`
   (`packages/opencode/src/tool/shell.ts:390-426`), qui initialise
   `scan = { dirs, patterns, always }` (`packages/opencode/src/tool/shell.ts:397-401`).
4. `packages/opencode/src/tool/shell.ts:402` — `shellKind = ShellID.toKind(Shell.name(shell))`.
5. `packages/opencode/src/tool/shell.ts:404-407` — boucle sur `commands(root)`, `parts(node)`
   produit les tokens, `cmd = tokens[0]` (bash, non normalisé) ou `tokens[0].toLowerCase()`
   (powershell, cmd).
6. `packages/opencode/src/tool/shell.ts:409` — **porte unique** :
   `FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd))`.
7. `packages/opencode/src/tool/shell.ts:410-416` — si la porte s'ouvre seulement,
   `pathArgs` filtre les drapeaux et renvoie les positionnels ; `argPath` résout, `containsPath`
   rejette ce qui est sous l'instance, `fs.isDir` décide entre le fichier et son répertoire,
   et `scan.dirs` reçoit le répertoire.
8. `packages/opencode/src/tool/shell.ts:419-422` — **indépendamment de l'étape 6**, toute
   commande non-`CWD` ajoute son texte brut à `scan.patterns` et une clé d'octroi
   `BashArity.prefix(...) + " *"` à `scan.always`.
9. `packages/opencode/src/tool/shell.ts:653` — si le `cwd` lui-même est hors instance,
   `scan.dirs.add(cwd)`.
10. `packages/opencode/src/tool/shell.ts:654` — `ask(ctx, scan)`.
11. `packages/opencode/src/tool/shell.ts:279-290` — `scan.dirs` non vide ⇒
    `ctx.ask({ permission: "external_directory", patterns: globs, always: globs })`.
12. `packages/opencode/src/tool/shell.ts:292-298` — `scan.patterns` non vide ⇒
    `ctx.ask({ permission: "bash", patterns, always })`.
13. `packages/opencode/src/tool/shell.ts:301-322` — `cmd()` lance le processus ; aucun
    contrôle d'écriture n'existe entre l'étape 12 et l'exécution.

Le défaut est aux étapes 6 et 7 : la porte est une recherche d'égalité sur un nom, et le
corps de la commande — la seule partie qui décrit ce qui est réellement écrit — n'est jamais
examiné.

## 4. Proposal

**Principe.** Ne pas rallonger `FILES`. Remplacer la question « le nom est-il connu ? » par
deux questions qui portent sur le *contenu* : « y a-t-il une charge utile inline ? » et
« quels chemins cette charge utile nomme-t-elle ? ». Les chemins extraits rejoignent le
pipeline existant de l'étape 7 ; aucune permission nouvelle, aucun nouveau dialogue.

**Fichier créé : `packages/opencode/src/tool/shell/mutation.ts`** (nouveau module, sans
dépendance, fonction pure testable sans spawn).

Table d'interpréteurs en mode inline — le drapeau est ce qui distingue une charge utile
opaque d'un fichier script :

```ts
export const INLINE = new Map<string, Set<string>>([
  ["python", new Set(["-c"])], ["python3", new Set(["-c"])],
  ["node", new Set(["-e", "--eval", "-p", "--print"])],
  ["bun", new Set(["-e", "--eval"])],
  ["ruby", new Set(["-e"])], ["perl", new Set(["-e", "-E"])],
  ["osascript", new Set(["-e"])], ["php", new Set(["-r"])],
  ["deno", new Set(["--eval"])],
])
```

`scripts exécutés` (fichier script) ne figure **volontairement** pas dans cette table :
`python script.py` est une *lecture* jusqu'à preuve du contraire, et le contenu du script
est un artefact visible et révisable par l'utilisateur.

Table d'utilitaires d'écriture dont le chemin est déjà nommé par un paramètre ou un
positionnel — ils entrent dans le gate mais pas par leur nom seul :

```ts
export const TAIL_PATH = new Set(["sed", "perl", "xxd"])   // dernier positionnel = fichier
export const WRITE_UTILS = new Set(["tee", "tee-object", "out-file", "dd", "patch", "install"])
```

Extraction (fonction pure, sans I/O) :

```ts
export function detectWritePaths(tokens: string[], ps: boolean): { paths: string[]; inline: boolean } {
  const cmd = (ps ? tokens[0]?.toLowerCase() : tokens[0]) ?? ""
  const flags = INLINE.get(cmd)
  const inline = Boolean(flags && tokens.slice(1).some((t) => flags.has(t)))
  const payloads = inline ? tokens.slice(1).filter((t) => flags!.has(t)) : []
  const literal = inline ? payloads.map(extractPathLiterals).flat() : positionalWriteArgs(tokens)
  return { paths: TAIL_PATH.has(cmd) ? literal.slice(-1) : literal, inline }
}
```

`extractPathLiterals` retient les littéraux de type chemin (`/…`, `C:\…`, `./…`, `../…`,
`~/…`) apparaissant dans la charge, y compris après `open(`, `writeFile(`, `of=`,
`FilePath`. Il réutilise `prefix()` (`packages/opencode/src/tool/shell.ts:196-201`) pour
couper au premier caractère glob, et `dynamic()`
(`packages/opencode/src/tool/shell.ts:189-194`) pour **ne pas** faire confiance à une
charge contenant `$(`, `${` ou un backtick : une charge dynamique est signalée `inline: true`
sans extraction, donc sans `external_directory` (résidu assumé, voir Risks).

**Fichier modifié : `packages/opencode/src/tool/shell.ts`, un seul site, ligne 409.**

```diff
@@ const collect = ... @@
-        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
-          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
+        const inline = cmd ? detectWritePaths(tokens, ps) : { paths: [], inline: false }
+        const gated =
+          cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)) || WRITE_UTILS.has(cmd) || inline.inline)
+        if (gated) {
+          const args = inline.paths.length ? inline.paths : pathArgs(command, ps, shellKind === "cmd")
+          for (const arg of args) {
             const resolved = yield* argPath(arg, cwd, ps, shell)
             if (!resolved || containsPath(resolved, instance)) continue
             const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
             scan.dirs.add(dir)
```

Le corps de la boucle (résolution, `containsPath`, `isDir`, `scan.dirs.add`) est
**inchangé** : le correctif ne fait qu'ouvrir la porte 6 et alimenter 7 avec des chemins
obtenus autrement. `FILES`, `CMD_FILES`, `CWD`, `FLAGS`, `SWITCHES`, `Scan`, `ask`,
`BashArity.prefix` et la permission `"bash"` restent inchangés.

**Garde-fou explicite — inline ≠ exécution de script.** La détection ne se déclenche que si
un drapeau de la table est présent dans `tokens.slice(1)`. Conséquences vérifiables :
`python script.py`, `python -m pytest`, `node server.js`, `bun test`, `bun run dev` ne
déclenchent **aucune** nouvelle demande, car `-m` n'est pas dans la table Python et `-e`
est absent de `bun test` ; seule `python -c` l'ouvre. C'est la contrainte qui empêche la
correction de casser les lectures légitimes.

**Volontairement hors périmètre.** La redirection `>` / `>>` n'est pas traitée ici : la cible
de redirection est un problème distinct et déjà assigné à P12
(`docs/harness-audit/README.md:34`, `src/tool/shell.ts:114`). Faire les deux ici créerait
deux propriétaires sur le même code. Le correctif s'applique en aval, quel que soit le
propriétaire de la redirection.

## 5. Alternatives considered

**(a) Extension de la liste `FILES` — rejetée.**
Ajouter `python`, `node`, `bun`, `ruby`, `perl`, `sed`, `tee` raise le taux de faux positifs
à ~100 % des usages d'interpréteur : `python script.py`, `node server.js`, `bun test`,
`bun run dev` demanderaient tous `external_directory`. Coût permanent : chaque outil ajouté
exige une mise à jour de la liste, et la liste reste contournable par le nom du binaire.
Ajouter seulement les drapeaux d'écriture n'est pas une option de cette stratégie — c'est
exactement la stratégie (b).

**(b) Détection par motif sur les arguments — retenue.**
Interroge le contenu de la commande plutôt que son nom.
Faux positifs : bornés à `charge inline ∧ littéral de chemin hors instance`, mesurable et
régressable ; `python script.py`, `cat`, `grep`, `bun test` ne sont jamais concernés.
Faux négatifs résiduels : chemins calculés au runtime.
Coût : deux tests de motif par nœud de commande ; aucun I/O, aucun spawn, aucun changement
de surface de permission. Le coût dominant du chemin (`parse`, packages/opencode/src/tool/shell.ts:649,
wasm tree-sitter) est inchangé.

**(c) Détection a posteriori des écritures du processus — rejetée pour ce périmètre.**
Sous Linux, `fanotify` en mode `FAN_MARK_MOUNT` ou `inotify` sur l'arbre ; sous Windows,
un minifilter ou ETW/Process Monitor.
Coût : `max_user_watches` (souvent 8192 par défaut) est dépassé par un arbre de projet réel ;
il faut agrandir le `sysctl` et payer O(N) en watches par commande, soit de la dizaine de ms
à plusieurs secondes. Windows exige des privilèges administrateur, ce que le harnais ne peut
pas réclamer à chaque appel.
Faux positifs : aucun (une écriture est une écriture), ce qui est son seul avantage.
Décision éliminatoire : **la détection est postérieure à l'écriture**. On ne peut pas
révoquer une permission déjà exercée ; il faudrait tuer le processus et restaurer le fichier,
ce qui est un bac à sable, pas un indice de permission. Elle est hors sujet pour une
permission d'approbation et reste la bonne réponse si l'objectif devient un vrai contrôle
d'accès — ce qui est une décision produit, pas un correctif.

**Sous-option écartée : clé de permission dédiée `bash_write`.**
Séparerait « autoriser un interpréteur » de « autoriser un interpréteur qui écrit », mais
ajoute une clé alors que `packages/opencode/src/tool/shell/id.ts:14-16` impose
explicitement de garder `bash` pour la compatibilité des plugins et des permissions
enregistrées. Une nouvelle clé obligerait les utilisateurs à réapprouver le périmètre
existant. Le prompt affichant déjà le texte brut de la commande
(`scan.patterns.add(source(node))`, packages/opencode/src/tool/shell.ts:420), l'information
n'est pas perdue.

## 6. Risks

**Ce correctif n'est pas une barrière de sécurité.** `scan.dirs` n'alimente qu'un dialogue
d'approbation : le processus est lancé à `packages/opencode/src/tool/shell.ts:301-322`
après `ask`, et rien n'empêche une commande d'écrire. Un attaquant qui contrôle la chaîne
n'a aucun besoin de la liste — il n'en existe aucune à contourrer, il y a une absence de
vérité à exploiter. `python -c`, `env python -c`, une variable contenant `-c`, un script
téléchargé puis exécuté, ou un binaire renommé produisent tous le même refus ou la même
acceptation selon la volonté de l'utilisateur. Le gain est **probabiliste et UX** :
augmenter la fréquence à laquelle un humain voit une cible de écriture avant
qu'elle se produise. Toute présentation de ce correctif comme un contrôle d'accès serait
fausse ; c'est un indice de permission, au même titre que les 20 autres listes du harnais.

**Faux positifs.**
`tee f.txt` en relais pur (`tee` alimenté par une redirection d'entrée) et `sed -n 'p' f` sont classés
en écriture : `sed` est dans `TAIL_PATH` sans discrimination de `-n`. Coût accepté : ces
commandes sont rares et la demande `external_directory` ne s'affiche que si la cible est
hors répertoire d'instance. `sed -i s/x/y/ f` fait passer `s/x/y/` pour un chemin dans
`pathArgs` ; le correctif contourne ce cas en ne retenant que le dernier positionnel.

**Régression sur les tests existants.**
`packages/opencode/test/tool/shell.test.ts` — bloc `describe("tool.shell permissions")`
(ligne 215) et `describe("tool.shell")` (ligne 174) : ce sont les seuls points qui
asserment le contenu de `scan.dirs` / les permissions demandées, donc le seul site de
régression réel. `describe("resolveTimeout")` (lignes 1233-1246, tests aux lignes 1234,
1238, 1242, 1246) est indépendant du scan et ne doit pas bouger.
`packages/opencode/test/tool/shell-output-prompt.test.ts` et
`packages/opencode/test/tool/shell-launch-retry.test.ts` couvrent respectively l'invite et
le relancement, sans chemin d'écriture : risque faible, à rejouer tel quel.
`packages/opencode/test/shell/shell.test.ts` et `packages/opencode/test/pty/pty-shell.test.ts`
touchent le shell sous-jacent, pas le scan : non concernés.

**Coût tokens / latence.**
Latence : deux recherches dans une `Map`/`Set` par nœud de commande, soit < 10 µs, négligeable
devant le `parse` wasm déjà paid (packages/opencode/src/tool/shell.ts:649). Pour une commande
signalée uniquement, s'ajoutent au plus ~8 appels `argPath` + `fs.isDir`, soit 0,1–0,5 ms
chacun sur Windows ⇒ **≤ 4 ms**, et **0 ms** pour toute commande non signalée (le chemin
majeur, `python script.py`, ne franchit pas la porte).
Tokens modèle : **delta = 0**. `ctx.ask` est appelé avec `metadata: {}`
(packages/opencode/src/tool/shell.ts:287 et :297) ; rien n'est injecté dans le contexte du
modèle. Le seul coût est côté utilisateur : une invite de plus sur les seules commandes
signalées dont la cible est hors instance.

**Sécurité / injection.**
`extractPathLiterals` ne fait que parcourir le texte déjà rendu par tree-sitter ; aucune
interpolation dans une commande. Le seul risque d'injection serait de construire une
requête à partir d'un chemin extrait — ce que le correctif ne fait pas (`argPath` résout,
`containsPath` compare). Le coût d'`isDir` sur un chemin attacker-controlled est un `stat`
sur un nom arbitraire, ce qui est déjà le comportement actuel de
`packages/opencode/src/tool/shell.ts:414`.

**Plateforme.**
`bash -c` et `pwsh -Command` reçoivent déjà la commande complète
(packages/opencode/src/tool/shell.ts:301-313), donc la détection est multi-coquille sans
changement de lancement. Seule limite : `tee-object` / `out-file` n'existent que sous
Windows et `sed -i` sous POSIX ; la table est tolérante aux noms absents.

## 7. Tests

**Test unitaire à écrire : `packages/opencode/test/tool/shell-mutation-detect.test.ts`.**
Table-driven sur `detectWritePaths`, sans spawn ni I/O.

- `["python", "-c", "open('../secret','w')"]` → `{ inline: true }` et `paths` contient `../secret`.
- `["python", "script.py"]` → `{ inline: false, paths: [] }` — **critère de non-régression**.
- `["python", "-m", "pytest", "tests/"]` → `{ inline: false, paths: [] }` — `-m` n'est pas un drapeau inline.
- `["node", "server.js"]` → `{ inline: false, paths: [] }`.
- `["node", "-e", "fs.writeFileSync('a/b.json',1)"]` → `inline: true`, `paths` contient `a/b.json`.
- `["bun", "test"]` et `["bun", "run", "dev"]` → `inline: false, paths: []`.
- `["sed", "-i", "s/a/b/", "notes.txt"]` → `paths` ne contient **que** `notes.txt`.
- `["python", "-c", "open(`d`,$x)"]` (charge dynamique) → `inline: true`, `paths: []`.

**Test d'intégration à écrire : `packages/opencode/test/tool/shell-mutation-detect.integration.test.ts`**,
dans le style du harness de permissions de `packages/opencode/test/tool/shell.test.ts:215` :
une commande `python -c` dont la cible est hors répertoire d'instance doit produire un
`ctx.ask` avec `permission: "external_directory"`, et `python script.py` ne doit en produire
aucun.

**Commande exacte :**
```powershell
cd packages/opencode; bun test test/tool/shell-mutation-detect.test.ts test/tool/shell-mutation-detect.integration.test.ts
```
Régression de la suite existante, obligatoire :
```powershell
cd packages/opencode; bun test test/tool/shell/shell.test.ts test/tool/shell-output-prompt.test.ts test/tool/shell-launch-retry.test.ts
```

**Critère de succès observable.** Les deux fichiers de test passent (exit code 0) ; aucune
des quatre assertions de non-régression (`script.py`, `-m pytest`, `server.js`, `bun test`)
ne déclenche de demande ; le bloc `describe("tool.shell permissions")` existant passe sans
modification de ses assertions.

## 8. Effort

`M` — un module pur de ~60 lignes, une modification d'une porte dans un seul fichier de 673
lignes, et deux fichiers de test ; pas de nouvelle dépendance, pas de nouvelle permission,
pas de changement de format de configuration.

## 9. Verdict self-assessment

`NEEDS_REVIEW`.

Question à trancher par le validateur : **la correction doit-elle rester confinée à
`external_directory` (option retenue, delta de tokens nul, aucune nouvelle clé), ou
introduire une clé de permission dédiée qui distingue « interpréteur autorisé » de
« interpréteur autorisé à écrire » ?** Le premier choix préserve la compatibilité imposée par
`packages/opencode/src/tool/shell/id.ts:14-16` et ne coûte rien en tokens ; le second est
plus strict mais ajoute une clé et impose une réapprouvation du périmètre existant. Je
recommande le premier, sous réserve du constat que `always: "python -c *"`
(packages/opencode/src/tool/shell.ts:421) couvre alors aussi les charges inline en écriture —
un octroi large reste un octroi large.