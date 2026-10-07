# P12 — Résolution des cibles de redirection shell

## 1. Problem

Une commande shell peut écrire un fichier n'importe où sur le disque sans jamais déclencher
la permission `external_directory`, parce que la cible d'une redirection (`>`, `>>`, `>|`)
n'est jamais transformée en chemin contrôlé.

## 2. Evidence

**a) La redirection est explicitement écartée du scan d'arguments.**
`packages/opencode/src/tool/shell.ts:114` (dans `parts`, `shell.ts:106-132`) :

```ts
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j)
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
        out.push({ type: item.type, text: item.text })
```

`redirection` est donc absent du `Part[]` : la cible n'entre jamais dans la liste examinée
par `pathArgs`.

**b) La redirection reste pourtant dans la chaîne de permission.**
`packages/opencode/src/tool/shell.ts:134-135` :

```ts
function source(node: Node) {
  return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
```

`source()` remonte à l'énoncé parent, donc `scan.patterns` reçoit la chaîne **complète**
incluant `> /tmp/f`. Ce comportement est verrouillé par un test existant :
`packages/opencode/test/tool/shell.test.ts:1005` attend
`expect(bashReq!.patterns).toContain("echo test > output.txt")`.

**c) La résolution de chemin est conditionnée à une liste blanche de commandes.**
`packages/opencode/src/tool/shell.ts:409-411` :

```ts
        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
            const resolved = yield* argPath(arg, cwd, ps, shell)
```

`FILES` est déclaré `packages/opencode/src/tool/shell.ts:42-63` et ne contient ni `echo`,
ni aucun mot-clé de redirection ; `CMD_FILES` (`shell.ts:64-77`) n'est appliqué qu'à `cmd`.
Pour `echo x > /tmp/f`, `cmd === "echo"` est absent de `FILES`, donc la boucle de la ligne
410 n'est jamais exécutée et `argPath` n'est jamais appelé sur cette cible.

**d) Le pipeline à réutiliser existe déjà et est correct.**
`packages/opencode/src/tool/shell.ts:381-388` :

```ts
    const argPath = Effect.fn("ShellTool.argPath")(function* (arg: string, cwd: string, ps: boolean, shell: string) {
      const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))
      const file = text && prefix(text)
      if (!file || dynamic(file, ps)) return
      const next = ps ? provider(file) : file
      if (!next) return
      return yield* resolvePath(next, cwd, shell)
    })
```

`argPath` enchaîne déjà `unquote`/`home`/`expand` (`shell.ts:142-175`), `prefix`
(`shell.ts:196-201`), `dynamic` (`shell.ts:189-194`), `provider` (`shell.ts:177-187`) et
`resolvePath` (`shell.ts:370-379`). Le discriminant `containsPath` est en `shell.ts:413`.

**e) Bibliothèque d'analyse syntaxique.**
`packages/opencode/src/tool/shell.ts:10` : `import { Language, type Node } from "web-tree-sitter"`.
Initialisée en `shell.ts:323-348`, avec deux grammaires :
`tree-sitter-bash/tree-sitter-bash.wasm` (`shell.ts:334`) et
`tree-sitter-powershell/tree-sitter-powershell.wasm` (`shell.ts:337`).
La traversée se fait par `node.descendantsOfType("command")` en `shell.ts:138-140`.

**f) Aucun test de permission ne couvre une redirection.**
`packages/opencode/test/tool/shell.test.ts` ne contient aucune assertion
`external_directory` portant sur `>`, `>>` ou `Out-File`. Les occurrences de redirection
dans ce fichier concernent la troncature et l'abandon ; `shell.test.ts:1110` utilise
`echo stderr_msg >&2` dans la suite d'abandon, sans assertion de permission.

**g) Aucune table de types de nœud n'est lisible dans l'arbre installé.**
Recherche sans résultat sur `**/tree-sitter-{bash,powershell}/**/node-types.json`, et
`rg` sur `node_modules/tree-sitter-bash/src/node-types.json` sort en code 2 (chemin
inexistant). Les grammaires ne sont disponibles qu'au format `.wasm`.

**h) Commande de test établie.**
`packages/opencode/package.json:10` : `"test": "bun test --timeout 30000"`.

INFERE: le nom exact du nœud portant l'opérateur de redirection et son opérande diffère
entre les deux grammaires. `redirection` est prouvé en `shell.ts:114` pour le chemin déjà
emprunté par `parts()`, mais le nom du nœud fils qui porte l'opérande n'est pas établi, ni
pour bash ni pour PowerShell. Vérification : exécuter le script de la section 7, qui dumpe
`node.type` et les enfants nommés pour `echo x > f`, `2>&1`, `cat <<EOF` sous les deux
grammaires, et aligner `REDIRECT_TYPES` sur la sortie avant de figer le correctif.

## 3. Mechanism

Chaîne d'exécution de bout en bout pour `echo x > /tmp/f` :

1. `parser()` (`shell.ts:323-348`) analyse la commande et renvoie une racine d'arbre bash ou
   powershell selon le shell.
2. `collect(root, cwd, ps, shell, instance)` est appelée (`shell.ts:390-426`).
3. `commands(root)` (`shell.ts:138-140`) filtre les nœuds de type `command`. Pour
   `echo x > /tmp/f`, un seul `command` est produit. Pour une redirection nue `> /tmp/f`,
   **aucun** nœud `command` n'est produit : la boucle `for (const node of commands(root))`
   (`shell.ts:404`) ne visitera rien.
4. `parts(node)` (`shell.ts:106-132`) énumère les enfants. Ligne 114 : le nœud de
   redirection est jeté. La cible `/tmp/f` disparaît du `Part[]`.
5. Même si elle survivait, la ligne 409 exige `FILES.has("echo")` ou
   `CMD_FILES.has("echo")`. Faux dans les deux cas. `pathArgs` n'est pas appelé, donc
   `argPath` (`shell.ts:381`) n'est jamais invoqué pour cette cible.
6. `resolvePath` (`shell.ts:370`) et `containsPath` (`shell.ts:413`) ne sont donc jamais
   atteints. `scan.dirs` (`shell.ts:415`) ne reçoit aucune entrée et aucune requête
   `external_directory` n'est produite pour ce chemin.
7. En parallèle, lignes 419-422 : `scan.patterns.add(source(node))` ajoute la chaîne complète
   `"echo x > /tmp/f"` (Evidence b). La commande est donc couverte par le motif générique
   `bash *` et s'exécute sans contrôle de chemin.

Le défaut n'est pas un oubli de résolution, mais la conjonction de trois décisions
distinctes : l'exclusion ligne 114, la garde ligne 409, et le fait que `commands()`
(`shell.ts:139`) ignore les énoncés dépourvus de commande. Une redirection vers un fichier
externe passe par la chaîne de permission comme du texte de motif, jamais comme chemin.

## 4. Proposal

**Fichier modifié :** `packages/opencode/src/tool/shell.ts` uniquement.
**Fonctions ajoutées :** `REDIRECT_TYPES` et `redirectTargets`, au niveau module, à côté de
`parts()` (`shell.ts:106`). **Fonction modifiée :** `collect()` (`shell.ts:390`), par ajout
d'une branche.

Le correctif repose sur trois distinctions, dont la troisième est la partie délicate :

1. **Descripteur de handle, pas fichier.** Une cible commençant par `&` (`&1`, `&2`, `&-`)
   duplique un descripteur, jamais un chemin. À traiter explicitement, sinon `2>&1` et `>&2`
   déclencheraient une permission fantôme sur chaque redirection de stderr du dépôt.
2. **Cible dynamique.** Rejetée par le filtre `dynamic()` déjà présent
   (`shell.ts:189-194`) : `$(...)`, `${...}`, backtick. Rien de neuf à écrire.
3. **Cible fichier.** Tout le reste : passe par `argPath`, donc même `unquote`/`home`/
   `expand`, même `prefix`, même `provider`, même `resolvePath`, même `containsPath`.

```ts
const REDIRECT_TYPES = ["redirection", "file_redirect"]

// Cible d'une redirection : l'opérande de `>`, `>>`, `>|`. Un opérande commençant par
// `&` est un duplicata de descripteur (`2>&1`, `>&2`), jamais un chemin.
function redirectTargets(node: Node) {
  const out: string[] = []
  for (const child of node.namedChildren) {
    const text = child.text.trim()
    if (text && !text.startsWith("&")) out.push(text)
  }
  return out
}
```

Et dans `collect()`, branche **non conditionnée à `cmd`** — c'est le point essentiel, car
c'est précisément la garde de la ligne 409 qui constitue le contournement. Le corps reprend
la forme de la boucle existante des lignes 410-416, `fs.isDir` compris :

```ts
      for (const type of REDIRECT_TYPES) {
        for (const redirect of root.descendantsOfType(type)) {
          for (const target of redirectTargets(redirect)) {
            const resolved = yield* argPath(target, cwd, ps, shell)
            log.info("resolved redirect target", { target, resolved })
            if (!resolved || containsPath(resolved, instance)) continue
            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
            scan.dirs.add(dir)
          }
        }
      }
```

Cette branche rend `echo x > /tmp/f` strictement équivalent à `touch /tmp/f`, qui est déjà
contrôlé puisque `touch` figure dans `FILES` (`shell.ts:48`). La parité est le critère de
correction : une redirection doit être traitée comme l'argument du même chemin.

**Volontairement inchangé :**

- `source()` (`shell.ts:134`) et `scan.patterns` (`shell.ts:420`) : le motif de permission
  doit continuer de contenir la redirection complète. Le modifier casserait
  `shell.test.ts:1005` et affaiblirait le motif `bash *` face à `cmd.exe` et aux pipes.
- `parts()` (`shell.ts:106`) : y injecter les cibles corromprait la détection du nom de
  commande (`shell.ts:407`) et le motif `always` construit ligne 421, donc la sémantique de
  permission de toutes les commandes.
- `pathArgs()` (`shell.ts:203`) : la branche appelle `argPath` directement. Son filtre
  `!(cmd && item.text.startsWith("/"))` (`shell.ts:210`) exclut les arguments `/` de `cmd.exe`
  comme pseudo-commutateurs ; un opérande de redirection n'est jamais un commutateur, donc
  réutiliser ce filtre ici serait un faux négatif.
- `>> log` vers un fichier de log interne : `containsPath` (`shell.ts:413`) court-circuite
  avant l'ajout à `scan.dirs`, donc aucune requête nouvelle pour une cible dans l'espace de
  travail.
- Les pipes : `a | b > f` produit deux nœuds `command` ; la branche étant non conditionnée,
  `f` est résolu pour `b` même si `b` n'est pas dans `FILES`. Le tube ne crée pas de nœud de
  redirection propre, donc il n'y a rien à traiter.

## 5. Alternatives considered

**A1 — Faire émettre les cibles par `parts()` (`shell.ts:106`).** Rejeté. `parts()` alimente
trois consommateurs : le nom de commande (`shell.ts:407`), la résolution de chemins
(`shell.ts:410`) et `BashArity.prefix(tokens)` (`shell.ts:421`). Y ajouter des cibles
changerait le motif `always` de `echo x > f` de `echo *` à `echo x *`, et décalerait `cmd`
dès qu'une redirection précède. Rayon de régression sur toutes les permissions shell, pour un
défaut ponctuel.

**A2 — Regex sur `source(node)`, par exemple `/>\s*(\S+)/g`.** Rejeté. Ne distingue pas `2>&1`
de `> /tmp/f`, ne voit pas l'intérieur des guillemets (`echo "a > b"`), confond le délimiteur
d'un heredoc avec une cible, et réimplémente un analyseur déjà chargé en `shell.ts:323-348`.
Faux positifs garantis.

**A3 — Interdire toute redirection en amont de l'exécution.** Rejeté. Détruit `>> log` et les
patrons `2>&1`, qui sont des usages légitimes et fréquents. Remplace un modèle de permission
par une interdiction, ce qui n'est pas l'objet de P12.

**A4 — Ajouter `out-file` et `tee` à `FILES` (`shell.ts:42-63`).** Rejeté comme correctif de
P12 : ne traite pas l'opérateur de redirection, donc ne ferme pas `echo x > /tmp/f`. Ces
cmdlets sont un trou d'allowlist distinct, consigné en finding résiduel. `Out-File` et
`Tee-Object` écrivant par cmdlet, ils ne relèvent pas de ce correctif.

## 6. Risks

**Régression sur les tests existants.** Le fichier concerné est
`packages/opencode/test/tool/shell.test.ts` : le test `matches redirects in permission
pattern` (lignes 989-1005) doit continuer à voir `"echo test > output.txt"` dans `patterns`,
ce qui passe car `source()` est intact ; et `shell.test.ts:1110`
(`echo stderr_msg >&2`) doit rester sans requête. Effets de bord possibles sur
`packages/opencode/test/tool/external-directory.test.ts`,
`packages/opencode/test/tool/read.test.ts:179` et
`packages/opencode/test/agent/agent.test.ts:522` (défaut `external_directory: "ask"`), car le
nombre de requêtes augmente pour les commandes qui écrivaient hors espace de travail sans
demander.

**Coût en tokens / latence.** Coût en tokens : **nul** — aucun texte de prompt, aucune
description d'outil et aucun motif n'est modifié. Latence : l'arbre est déjà construit et déjà
parcouru (`descendantsOfType`, `shell.ts:139`) ; l'ajout est une seconde traversal par type sur
un arbre de petite taille, plus **au plus une** vérification `fs.isDir` par cible de
redirection. Cette vérification est de toute façon court-circuitée pour les cibles internes,
puisque `containsPath` est vrai en ligne 413 et déclenche le `continue` avant `fs.isDir`.
Ordre de grandeur : la milliseconde, uniquement sur les cibles externes.

**Faux positifs possibles.** `>` dans une chaîne (`echo "a > b"`) : le nœud produit est un
`string`, jamais un enfant de redirection, donc jamais candidat. Heredoc (`cat <<EOF > /tmp/f`) :
le corps est un nœud distinct de l'opérande de redirection, donc non collecté — seule la cible
`f` l'est. `$()` et `${}` : déjà exclus par `dynamic()` (`shell.ts:191`), comme pour les
arguments ordinaires. `2>&1`, `>&2`, `&-` : exclus par le test de préfixe `&`. `> >(tee f)` :
l'opérande contient `(`, donc `dynamic()` le rejette. Le faux positif coûteux restant est
`2 > file` avec une espace insérée, selon la tokenisation retenue par la grammaire ; à vérifier
par le dump de la section 7.

**Risque de sécurité — ce que ce correctif ne ferme pas.** Le correctif ferme une classe
précise : l'écriture directe par l'opérateur de redirection d'une commande analysée. Il ne
ferme pas le contournement. Un agent peut encore écrire hors espace de travail par
`python -c "open(r'C:\\x','w')"`, `tee /tmp/f`, `node -e`, `Start-Process`, `cmd /c`,
`dd of=`, `curl -o`, `find -exec`, ou en invoquant `bash -c` depuis un shell déjà autorisé.
Aucun de ces vecteurs ne passe par un nœud de redirection. Une clôture réelle de cette classe
suppose un sandbox au niveau du système d'exploitation ou une restriction d'écriture du
processus, hors de portée d'un correctif à cette couche. Cette proposition fait passer une
exploitation triviale par `echo x > /tmp/f` dans la catégorie « demande une permission », ce
qui n'est pas la même chose que « écriture impossible ».

## 7. Tests

**Fichier existant à étendre :** `packages/opencode/test/tool/shell.test.ts`. Il fournit déjà
la matrice de shells (`shells` ligne 86, `bash` ligne 81, `ps` ligne 101), le helper `each()`
(ligne 148) et le helper `capture()` (ligne 155) qui intercepte
`requests.find(r => r.permission === "external_directory")`.

**Emplacement du nouveau bloc :** `packages/opencode/test/tool/shell.test.ts`, nouveau
`describe("tool.shell redirection targets")` placé sous `describe("tool.shell permissions")`
(ligne 215), avec les cas suivants :

| cas | commande | attendu |
|---|---|---|
| redirection vers chemin externe | `echo x > <tmp externe>` | une requête `external_directory` |
| redirection nue, sans commande | `> <tmp externe>` | une requête `external_directory` |
| redirection après un pipe | `printf a \| cat > <tmp externe>` | une requête `external_directory` |
| ajout, non écrasement | `echo x >> <tmp externe>` | une requête `external_directory` |
| descripteur de handle | `echo x 2>&1` | aucune requête |
| descripteur explicite | `echo x >&2` | aucune requête |
| chevron dans une chaîne | `echo "a > b"` | aucune requête |
| cible dynamique | `echo x > $HOME/f` | aucune requête |
| cible interne | `echo x >> log` | aucune requête |

**Script de vérification du type de nœud** (à écrire dans le test ou dans un script jetable,
puisque `node-types.json` n'est pas disponible, cf. Evidence g) : parser `echo x > f`,
`echo x 2>&1` et `cat <<EOF > f` avec le même `parser()` que `shell.ts:323-348`, puis
`console.log` le `type` et les enfants nommés de chaque nœud de redirection. Sortie attendue :
un nœud portant l'opérateur et l'opérande, l'opérande de `2>&1` commençant par `&`.
Aligner `REDIRECT_TYPES` sur cette sortie.

**Commande exacte**, répertoire de travail `packages/opencode`, d'après
`packages/opencode/package.json:10` :

```
bun test --timeout 30000 test/tool/shell.test.ts
```

**Critère de succès observable :** les neuf cas passent, `bun test` se termine avec un code de
sortie 0, aucune requête `external_directory` n'est émise pour les cinq cas « aucune requête »
(descripteur de handle, descripteur explicite, chevron dans une chaîne, cible dynamique,
cible interne), et le test `matches redirects in permission pattern` (ligne 989) reste vert
avec `patterns` contenant toujours `"echo test > output.txt"`. Avant le correctif, les quatre
premiers cas échouent ; après le correctif, ils passent.

## 8. Effort

**M** — un seul fichier de source et une vingtaine de lignes de logique nouvelle, mais la
vérification du type de nœud doit être faite pour deux grammaires et la matrice de faux
positifs impose neuf cas sur plusieurs shells, ce qui dépasse XS et S.

## 9. Verdict self-assessment

**NEEDS_REVIEW.**

Deux points précis à trancher par le validateur :

1. **Portée de la branche non conditionnée.** Le correctif résout la cible pour *toute*
   commande, y compris celles absentes de `FILES`. C'est nécessaire pour fermer
   `echo x > /tmp/f`, mais cela introduit des requêtes `external_directory` là où il n'y en
   avait pas, sur des commandes d'écriture courantes. Le validateur doit trancher entre cette
   couverture complète, et une variante qui exempte de requête certaines redirections — au prix
   d'une voie de contournement rouverte.
2. **Couverture PowerShell.** Le nom de nœud de redirection sous `tree-sitter-powershell` n'est
   pas établi (Evidence g et INFERE en section 2). Le correctif tel quel ne couvre que ce que
   `REDIRECT_TYPES` décrit. Le validateur doit décider si la couverture PowerShell est exigée
   dans le même correctif — auquel cas le dump de la section 7 conditionne l'implémentation —
   ou si l'on livre la couverture bash en nota bene et si le cmdlet `Out-File` fait l'objet
   d'une proposition distincte (trou d'allowlist `FILES`, cf. A4 en section 5).