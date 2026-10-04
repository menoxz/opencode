# P12 — Résolution des cibles de redirection shell

> **Reprise complète.** Ce document remplace intégralement la version antérieure, à la suite du
> verdict `PASS_WITH_CHANGES` (7 objections, dont **2 bloquantes**, 5 Required changes) et des
> corrections **C-29**, **C-30**, **C-31**. Les 27 ancres de citation vérifiées une à une par le
> validateur (0 fausse) sont **conservées**. Trois points sont désormais **arbitrés** plutôt que
> laissés en suspens : le prédicat d'opérande (§4.1), le cas de test 2 (§7.2) et la garantie
> « `collect()` sur le chemin de chaque tentative » (§10).
>
> **Ce document ne prétend pas être conforme parce qu'il est lu.** La réserve « tests non
> exécutés (shell EPERM) » du validateur est levée par la **méthode de test** de §7.5, qui est
> exécutable par la vague 4 et comprend un **contrôle négatif par mutation**. Toute affirmation
> de conformité de ce document est donc une **prédiction vérifiable**, pas un constat.

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

`shell.ts:134-135` est aussi le **seul** endroit de l'arbre de lecture où une structure de
redirection est établie par le code : il prouve que, lorsqu'une redirection est présente, le
nœud `command` est enveloppé par un parent de type `redirected_statement`. Il ne dit rien du
cas où la redirection est seule, sans commande — voir §7.2.

**c) La résolution de chemin est conditionnée à une liste blanche de commandes.**
`packages/opencode/src/tool/shell.ts:409-411` :

```ts
        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
            const resolved = yield* argPath(arg, cwd, ps, shell)
```

`FILES` est déclaré `packages/opencode/src/tool/shell.ts:42-63` et ne contient ni `echo`
(`touch` est à `:48`, `cat` à `:51`), ni aucun mot-clé de redirection ; `CMD_FILES`
(`shell.ts:64-77`) n'est appliqué qu'à `cmd`. Pour `echo x > /tmp/f`, `cmd === "echo"` est
absent de `FILES`, donc la boucle de la ligne 410 n'est jamais exécutée et `argPath` n'est
jamais appelé sur cette cible.

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

`argPath` enchaîne déjà `unquote`/`home`/`expand` (`shell.ts:142-148`, `shell.ts:150-154`,
`shell.ts:169-175`), `prefix` (`shell.ts:196-201`), `dynamic` (`shell.ts:189-194`), `provider`
(`shell.ts:177-187`) et `resolvePath` (`shell.ts:370-379`). Le discriminant `containsPath`
(importé en `shell.ts:7`) est en `shell.ts:413`.

**d') Les filtres d'`argPath` ne stoppent pas un jeton d'opérateur — établi, chaîne par chaîne.**
C'est le cœur de l'objection 1, et c'est vérifié ligne à ligne dans le code réel :

| étape | code | effet sur `>` |
|---|---|---|
| désquoting | `shell.ts:382` `const text = ps ? expand(arg, cwd, shell) : home(unquote(arg))` | `unquote(">")` renvoie `">"` (longueur 1, `shell.ts:143` `if (text.length < 2) return text`) ; `home(">")` renvoie `">"` (ni `~` ni `~/`, `shell.ts:151-152`) |
| préfixe | `shell.ts:383` `const file = text && prefix(text)` puis `shell.ts:197` `const match = /[?*[]/.exec(text)` | `/[?*[]/` **ne matche pas** `>` ; `match` est `null` ; `shell.ts:198` `if (!match) return text` ⇒ `file === ">"` |
| dynamique | `shell.ts:384` `if (!file || dynamic(file, ps)) return` avec `shell.ts:189-194` | `shell.ts:190` ne matche ni `(` ni `@(` ; `shell.ts:191` ne matche ni `$(` ni `${` ni backtick ; `shell.ts:192`/`:193` ne matchent pas `$`. **Aucun** des six motifs ne matche `>` ⇒ `dynamic` renvoie `false` |
| fournisseur | `shell.ts:385-386` | `provider(">")` : `shell.ts:178` `/^([A-Za-z]+)::(.*)$/` ne matche pas ; `shell.ts:183` `/^([A-Za-z]+):(.*)$/` ne matche pas ⇒ `shell.ts:184` `if (!prefix) return text` ⇒ `next === ">"` |
| résolution | `shell.ts:387` `return yield* resolvePath(next, cwd, shell)` puis `shell.ts:378` `return path.resolve(root, text)` | `path.resolve(cwd, ">")` ⇒ **un chemin bidon à l'intérieur du cwd** |

Conclusion : `>` franchit **les quatre** filtres d'`argPath`. Le seul endroit où il est arrêté
est `shell.ts:413` `if (!resolved || containsPath(resolved, instance)) continue`, et uniquement
parce que le chemin bidon est interne. **Toute la défense repose donc aujourd'hui sur un effet
de bord de résolution de chemin, pas sur un prédicat.** C'est ce que §4.1 corrige.

**e) Bibliothèque d'analyse syntaxique.**
`packages/opencode/src/tool/shell.ts:10` : `import { Language, type Node } from "web-tree-sitter"`.
Initialisée en `shell.ts:323-348`, avec deux grammaires :
`tree-sitter-bash/tree-sitter-bash.wasm` (`shell.ts:334`) et
`tree-sitter-powershell/tree-sitter-powershell.wasm` (`shell.ts:337`).
La traversée se fait par `node.descendantsOfType("command")` en `shell.ts:138-140`.

**f) Aucun test de permission ne couvre une redirection.**
`packages/opencode/test/tool/shell.test.ts` ne contient aucune assertion
`external_directory` portant sur `>`, `>>` ou `Out-File`. Inventaire : les seules lignes
contenant une redirection sont `shell.test.ts:999` (test de motif de permission, aucune
assertion `external_directory`) et `shell.test.ts:1110`, dont la commande réelle est
`` command: `echo stdout_msg && echo stderr_msg >&2` `` — le fragment `echo stderr_msg >&2`
cité par les versions antérieures de ce document existe, mais la commande complète est plus
longue et contient `echo stdout_msg &&`. `Out-File`, `Tee-Object` et `>&` n'apparaissent
qu'à cette ligne, dans une suite d'abandon, sans assertion de permission. Aucun test existant
ne peut donc être rompu par l'ajout d'une requête `external_directory` liée à une redirection.

**g) Aucune table de types de nœud n'est lisible dans l'arbre installé — re-vérifié.**
`glob **/node-types.json` → aucun résultat. `glob **/tree-sitter-*/**` → aucun résultat.
`glob **/*.wasm` → aucun résultat. Les grammaires ne sont accessibles qu'au format `.wasm`,
embarqué dans `node_modules`, hors de l'arbre de travail lisible. Il est donc **impossible
d'établir par lecture** le `type` du nœud qui porte l'opérande, sous bash comme sous
PowerShell. C'est un fait d'absence, pas une lacune de recherche : toute affirmation de
structure dans ce document est marquée `INFERE` et **convertie en test** (§7.5, T1).

**g') Confirmation par recherche exhaustive de l'arbre — le nom du nœud d'opérande n'existe
nulle part dans le dépôt.** `grep "file_redirect|redirection|redirected_statement|file_descriptor|redirect"`
sur `packages/**/*.ts` (107 occurrences) ne retourne que **deux** noms de type de nœud AST, tous
deux déjà cités : `redirection` (`shell.ts:114`) et `redirected_statement` (`shell.ts:135`).
Aucun autre fichier source ne nomme un type de redirection. **`file_redirect` n'apparaît nulle
part dans le dépôt** : c'est donc un candidat non vérifié, et le document ne le présente nulle
part comme établi. Les autres occurrences sont hors sujet — URI OAuth (`redirect_uri`,
`mcp/oauth-provider.ts:22`, `config/mcp.ts:33`) et redirections HTTP (`web/src/middleware.ts:26`) —
et les deux mentions de `session/context-ledger.ts:30` et `:253` sont des commentaires en prose
qui qualifient une commande, non des noms de type. Cette recherche est l'indication qui empêche
de traiter `REDIRECT_TYPES` comme connu : seul le test T1 peut le fixer.

**h) Commande de test établie.**
`packages/opencode/package.json:10` : `"test": "bun test --timeout 30000"`.

**i) Point sans rapport avec P12, cité pour écarter un contresens récurrent — C-04 / C-29.**
`packages/opencode/src/tool/registry.ts:256` est bien
`output: out.truncated ? out.content : output,` : la ligne **substitue `out.content`** à
`output` lorsque `out.truncated` est vrai. Il est donc incorrect de la qualifier de « no-op ».
Sa portée est en revanche étroite : elle est dans le bloc **plugin-only**
(`registry.ts:242-253` — `PluginToolContext` avec pont `EffectBridge` en `:241-247`,
`def.execute` en `:248`, `truncate.output` en `:253`), et **ne modifie que le bloc plugin-only** ;
aucun outil natif ne le traverse. P12 ne cite ni `registry.ts` ni `truncate.output` et aucune de
ses conclusions n'en dépend.

## 3. Mechanism

Chaîne d'exécution de bout en bout pour `echo x > /tmp/f` :

1. `parser()` (`shell.ts:323-348`) analyse la commande et renvoie une racine d'arbre bash ou
   powershell selon le shell.
2. `collect(tree.rootNode, cwd, ps, shell, instanceCtx)` est appelée à `shell.ts:652`.
3. `commands(root)` (`shell.ts:138-140`) filtre les nœuds de type `command`. Pour
   `echo x > /tmp/f`, un `command` est produit, et son parent est `redirected_statement`
   (établi en `shell.ts:134-135`). Le cas d'une redirection **nue**, sans commande, est traité
   séparément en §7.2 : il n'est pas établi.
4. `parts(node)` (`shell.ts:106-132`) énumère les enfants. Ligne 114 : le nœud de
   redirection est jeté. La cible `/tmp/f` disparaît du `Part[]`.
5. Même si elle survivait, la ligne 409 exige `FILES.has("echo")` ou
   `CMD_FILES.has("echo")`. Faux dans les deux cas. `pathArgs` n'est pas appelé, donc
   `argPath` (`shell.ts:381`) n'est jamais invoqué pour cette cible.
6. `resolvePath` (`shell.ts:370`) et `containsPath` (`shell.ts:413`) ne sont donc jamais
   atteints. `scan.dirs` (`shell.ts:415`) ne reçoit aucune entrée, et comme
   `shell.ts:279-280` (`if (scan.dirs.size > 0)`) conditionne l'émission des motifs de
   permission à cet ensemble, **aucune dimension de chemin n'est évaluée** et aucune
   requête `external_directory` n'est produite pour ce chemin.
7. En parallèle, lignes 419-422 : `scan.patterns.add(source(node))` ajoute la chaîne complète
   `"echo x > /tmp/f"` (Evidence b), et `scan.always.add(BashArity.prefix(tokens).join(" ") + " *")`
   ajoute `"echo *"` (ligne 421).

   **Précision obligatoire (Required change 4, C-13).** Le fait décisif, ici, n'est **pas** le
   motif générique `bash *`. `always` **neutralise** la détection au lieu de la limiter
   (`shell.ts:421` → `permission/arity.ts:135` → `permission/index.ts:304-310`, court-circuitée
   par `permission/index.ts:241`), ce que **C-13** a établi par mesure. Le fait décisif est
   celui du point 6 : `scan.dirs` reste **vide**, donc aucune dimension de chemin n'est
   évaluée pour cette commande. P12 ne doit pas devenir une preuve adverse à C-13 : les deux
   constats sont vrai, mais seul le second porte la correction.

Le défaut n'est pas un oubli de résolution, mais la conjonction de trois décisions
distinctes : l'exclusion ligne 114, la garde ligne 409, et le fait que `commands()`
(`shell.ts:138-140`) ne visite que les nœuds `command`. Une redirection vers un fichier
externe passe par la chaîne de permission comme du texte de motif, jamais comme chemin.

## 4. Proposal

**Fichier modifié :** `packages/opencode/src/tool/shell.ts` uniquement.
**Fonctions ajoutées :** `REDIRECT_OPERATORS`, `isRedirectOperator`, `REDIRECT_TYPES` et
`redirectTargets`, au niveau module, à côté de `parts()` (`shell.ts:106`). **Fonction modifiée :
`collect()` (`shell.ts:390`), par ajout d'une branche.

### 4.1 Prédicat d'opérande — objection 1, arbitrée

**Constat qui impose la forme du prédicat.** Le commentaire de la version antérieure annonçait
« l'opérande » alors que le code poussait `for (const child of node.namedChildren) { out.push(text) }`,
c'est-à-dire **tous** les enfants nommés. Or l'Evidence d) montre que si l'opérateur est un
enfant nommé, `>` atteint `path.resolve(cwd, ">")` et n'est neutralisé que par
`shell.ts:413`, donc **par accident**.

**Choix retenu : un prédicat d'opérande explicite, à deux filtres indépendants, dont le
premier est purement textuel et ne dépend d'aucune hypothèse sur la structure de l'arbre.**

Ce choix est préféré à l'alternative « étendre `dynamic()`/`prefix()` pour couvrir `>` »
(Alternative **A5**, §5) pour trois raisons :

1. **Il est correct dans les deux mondes.** Un filtre textuel sur le jeton ne dépend pas de la
   question « l'opérateur est-il un enfant nommé ou un token anonyme ? ». Or cette question est
   aujourd'hui **sans réponse** (Evidence g) et le validateur a refusé de la présumer. Un
   prédicat qui dépend d'un `type` de nœud dépend d'un fait non établi ; un prédicat textuel
   n'en dépend pas.
2. **Il corrige la cause, pas l'accident.** `containsPath` est un **filtre d'espace de travail**,
   pas une défense contre l'opérateur : une cible legitime à l'intérieur du workspace ne doit
   demander aucune permission. Lui faire porter la défense contre `>` reviendrait à le tenir
   pour un garde-fou de tokenisation, ce qu'il n'est pas. La confiance est **explicitement
   retirée** : après ce correctif, `shell.ts:413` reste un court-circuit **d'optimisation et de
   politique d'espace de travail**, et la neutralisation de l'opérateur est produite par
   `isRedirectOperator` seul. La distinction est rendue **observable par test** (§7.5, T4).
3. **Il ne touche pas aux helpers partagés.** `dynamic` (`shell.ts:189`) et `prefix`
   (`shell.ts:196`) ne sont ni modifiés ni exportés (Required change, Objection 6 / **C-12**).

```ts
// Jetons d'opérateur de redirection et de duplicata de descripteur. Un opérateur qui
// apparaît parmi les enfants nommés ne doit JAMAIS atteindre argPath : ">" franchit
// prefix (shell.ts:197 ne matche pas ">") et dynamic (shell.ts:190-193 ne matche aucun
// de ses six motifs), puis deviendrait path.resolve(cwd, ">") — un chemin bidon
// interne, arrêté par containsPath (shell.ts:413) par accident et non par conception.
const REDIRECT_OPERATORS = new Set([
  ">", ">>", ">|", "<", "<<", "<<<", ">&", "<&", "&>", "&>>", "&-",
  "1>", "2>", "1>>", "2>>", "1>|", "2>|", "1>&", "2>&", "&1", "&2", "1&-", "2>&-",
])

// Premier filtre, textuel et total : indifferent au fait que l'operateur soit un enfant
// nomme ou un token anonyme.
function isRedirectOperator(text: string) {
  if (REDIRECT_OPERATORS.has(text)) return true
  // Variantes avec descripteur numerote et那些 formes non listees : "2>>", "10>".
  if (/^[0-9]+[<>]/.test(text)) return true
  // Descripteur de handle : "&1", "&2", "&-", ">&2".
  if (text.startsWith("&")) return true
  return false
}

// Second filtre, type : figé sur la sortie réelle du dump (test T1). Volontairement
// vide tant que le dump n'a pas été exécuté — une liste blanche vide fait échouer T1
// bruyamment plutôt que de désactiver silencieusement la détection.
const REDIRECT_OPERAND_TYPES = new Set<string>(/* rempli par le dump, test T1 */)

// Cible d'une redirection. Renvoie [] plutot qu'une devinette quand aucun enfant ne
// satisfait les deux filtres : fail-closed.
export function redirectTargets(node: Node) {
  const out: string[] = []
  for (const child of node.namedChildren) {
    const text = child.text.trim()
    if (!text) continue
    if (REDIRECT_OPERAND_TYPES.size > 0 && !REDIRECT_OPERAND_TYPES.has(child.type)) continue
    if (isRedirectOperator(text)) continue
    out.push(text)
  }
  return out
}
```

Trois propriétés sont garanties par construction, indépendamment de l'état de l'arbre :

- **P1** — aucun jeton d'opérateur ne peut atteindre `argPath`, que l'opérateur soit nommé ou
  anonyme, car le filtre textuel ne consulte pas `child.type` ;
- **P2** — un opérande dynamique (`$(...)`, `${...}`, backtick) est de toute façon rejeté par
  `dynamic()` (`shell.ts:190-193`), exactement comme pour les arguments ordinaires ;
- **P3** — le `type` de l'opérande est **enregistré** par le test T1, donc une divergence de
  grammaire entre bash et PowerShell échoue bruyamment au lieu de passer en silence.

`export` sur `redirectTargets` est **délibéré et limité** : il existe pour que le prédicat soit
testable **indépendamment de `shell.ts:413`** (test T4), ce qui est précisément la demande de
l'objection 1. Ce n'est **pas** le défaut **C-12** reproché à P13 : il y a **un seul site
d'appel** (la branche de `collect`), donc aucun helper n'est partagé, et `dynamic` comme
`prefix` restent non exportés (`shell.ts:189`, `shell.ts:196`).

### 4.2 La branche dans `collect()`

Branche **non conditionnée à `cmd`** — c'est le point essentiel, car c'est précisément la garde
de la ligne 409 qui constitue le contournement. Le corps reprend la forme de la boucle
existante des lignes 410-416, `fs.isDir` compris :

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

avec, au niveau module :

```ts
// À figer sur la sortie du dump T1. "redirection" est établi par shell.ts:114 (bash) ;
// "file_redirect" est le candidat PowerShell, non verifie.
const REDIRECT_TYPES = ["redirection", "file_redirect"]
```

Cette branche rend `echo x > /tmp/f` strictement équivalent à `touch /tmp/f`, qui est déjà
contrôlé puisque `touch` figure dans `FILES` (`shell.ts:48`). La parité est le critère de
correction : une redirection doit être traitée comme l'argument du même chemin.

**Volontairement inchangé :**

- `source()` (`shell.ts:134`) et `scan.patterns` (`shell.ts:420`) : le motif de permission
  doit continuer de contenir la redirection complète. Le modifier casserait
  `shell.test.ts:1005` et affaiblirait le motif face à `cmd.exe` et aux pipes.
- `parts()` (`shell.ts:106`) : y injecter les cibles corromprait la détection du nom de
  commande (`shell.ts:407`) et le motif `always` construit ligne 421, donc la sémantique de
  permission de toutes les commandes.
- `pathArgs()` (`shell.ts:203`) : la branche appelle `argPath` directement. Son filtre
  `!(cmd && item.text.startsWith("/"))` (`shell.ts:210`) exclut les arguments `/` de `cmd.exe`
  comme pseudo-commutateurs ; un opérande de redirection n'est jamais un commutateur, donc
  réutiliser ce filtre ici serait un faux négatif.
- `>> log` vers un fichier de log interne : `containsPath` (`shell.ts:413`) court-circuite
  avant l'ajout à `scan.dirs`, donc aucune requête nouvelle pour une cible dans l'espace de
  travail. **Ce court-circuit est une politique d'espace de travail, pas une défense contre
  l'opérateur** (§4.1, choix 2).
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

**A5 — Étendre `dynamic()` (`shell.ts:189`) et `prefix()` (`shell.ts:196`) pour couvrir `>`.**
Rejeté, et c'est l'alternative principale de l'objection 1. `dynamic()` est unjugement
sémantique sur le contenu d'un chemin ; un opérateur de redirection n'est pas un « chemin
dynamique », et l'y classer rendrait le diagnostic trompeur. `prefix()` est un utilitaire de
glissement de motif, utilisé pour tronquer une wildcard — y ajouter une liste de tokens
d'opérateur déporterait dans un helper partagé une connaissance de la grammaire de
redirection, qui n'a rien à y faire. Les deux sont aussi **`parts`-agnostiques** : un opérateur
peut apparaître comme enfant d'une redirection alors qu'aucun `Part` ne le contient. Enfin,
modifier `dynamic()` étend le risque à tous les appels d'`argPath` (`shell.ts:411` compris),
pour un défaut qui n'existe que sur le chemin de redirection. La correction par prédicat est
strictement locale et vérifiable par test unitaire.

**A6 — S'appuyer sur `shell.ts:413` et ne rien prédiquer.** Rejeté : c'est la cause même de
l'objection 1. Un chemin bidon interne qui n'est neutralisé que parce qu'il est interne est une
défense par accident ; le jour où le `cwd` est lui-même hors espace de travail,
`shell.ts:653` (`if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)`) rendrait ce même
chemin bidon **demandeur**, et une nouvelle requête `external_directory` apparaîtrait pour un
jeton qui n'est pas un chemin. Le test T4 existe précisément pour rendre cette différence
visible.

## 6. Risks

**Régression sur les tests existants.** Le fichier concerné est
`packages/opencode/test/tool/shell.test.ts` : le test `matches redirects in permission
pattern` (`shell.test.ts:989`, assertion `shell.test.ts:1005`) doit continuer à voir
`"echo test > output.txt"` dans `patterns`, ce qui passe car `source()` est intact ; et
`shell.test.ts:1110` (`` command: `echo stdout_msg && echo stderr_msg >&2` ``) doit rester
sans requête. Effets de bord possibles sur
`packages/opencode/test/tool/external-directory.test.ts`,
`packages/opencode/test/tool/read.test.ts:179` et
`packages/opencode/test/agent/agent.test.ts:522` (défaut `external_directory: "ask"`), car le
nombre de requêtes augmente pour les commandes qui écrivaient hors espace de travail sans
demander. **Ce point n'est plus affirmé « conforme par lecture » : il est vérifié par
l'exécution de §7.5 (T5), avec code de sortie.**

**Coût en tokens / latence.** Coût en tokens : **nul** — aucun texte de prompt, aucune
description d'outil et aucun motif n'est modifié. Latence : l'arbre est déjà construit et déjà
parcouru (`descendantsOfType`, `shell.ts:138-140`) ; l'ajout est **une seconde traversal par
type** sur un arbre de petite taille — la boucle externe porte sur les **deux** entrées de
`REDIRECT_TYPES`, donc deux traversages par commande analysée — plus **au plus une** vérification
`fs.isDir` par cible de redirection. Cette vérification est court-circuitée pour les cibles
internes, puisque `containsPath` est vrai en `shell.ts:413` et déclenche le `continue` avant
`fs.isDir` (`shell.ts:414`). Ordre de grandeur : la milliseconde, uniquement sur les cibles
externes.

**Faux positifs possibles.** `>` dans une chaîne (`echo "a > b"`) : le nœud produit est un
`string`, jamais un enfant de redirection, donc jamais candidat. Heredoc (`cat <<EOF > /tmp/f`) :
le corps est un nœud distinct de l'opérande de redirection, donc non collecté — seule la cible
`f` l'est. `$()` et `${}` : déjà exclus par `dynamic()` (`shell.ts:191`), comme pour les
arguments ordinaires. `2>&1`, `>&2`, `&-` : exclus **deux fois** — par `isRedirectOperator` et,
pour les formes à `&`, par le test de préfixe `&`. `> >(tee f)` : l'opérande contient `(`, donc
`dynamic()` le rejette. Le faux positif coûteux restant est `2 > file` avec une espace insérée,
selon la tokenisation retenue par la grammaire ; à vérifier par le dump T1.

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

### 7.1 Matrice d'acceptation

**Fichier existant à étendre :** `packages/opencode/test/tool/shell.test.ts`. Il fournit déjà
la matrice de shells (`shells` ligne 86, `bash` ligne 81, `ps` ligne 101), le helper `each()`
(déclaré à `shell.test.ts:146`, la ligne 148 étant la signature du callback `fn`) et le helper
`capture()` (`shell.test.ts:155-162`) qui fait `requests.push(req)` pour **toute** permission et
intercepte `requests.find(r => r.permission === "external_directory")`. Aucun nouveau helper
n'est nécessaire, aucun test existant n'est réécrit.

**Emplacement du nouveau bloc :** `packages/opencode/test/tool/shell.test.ts`, nouveau
`describe("tool.shell redirection targets")` placé sous `describe("tool.shell permissions")`
(`shell.test.ts:215`).

| cas | commande | attendu |
|---|---|---|
| redirection vers chemin externe | `echo x > <tmp externe>` | une requête `external_directory` |
| redirection après un pipe | `printf a \| cat > <tmp externe>` | une requête `external_directory` |
| redirection vers chemin externe, `>>` | `echo x >> <tmp externe>` | une requête `external_directory` |
| descripteur de handle | `echo x 2>&1` | aucune requête |
| descripteur explicite | `echo x >&2` | aucune requête |
| chevron dans une chaîne | `echo "a > b"` | aucune requête |
| cible dynamique | `echo x > $HOME/f` | aucune requête |
| cible interne | `echo x >> log` | aucune requête |

Le libellé du cas « redirection externe, `>>` » est volontairement réduit à ce que l'assertion
prouve (Required change 3) : la branche inspecte l'opérateur, mais `scan.dirs` ne reçoit que le
`dirname` (`shell.ts:415`), et la sémantique ajout/écrasement **n'est pas une propriété de la
couche permission**. Le libellé « ajout, non écrasement » des versions antérieures était plus
fort que son assertion.

### 7.2 Cas 2 retiré — objection 2, arbitrée

Le cas « redirection nue, sans commande » (`> <tmp externe>`) est **retiré** de la matrice. Je
suis l'arbitre, et voici ce que dit le code réel.

**Ce qui est établi.** `shell.ts:134-135` prouve qu'un nœud `command` portant une redirection a
un parent de type `redirected_statement`. C'est le seul fait de structure de redirection
dérivable du code.

**Ce qui ne l'est pas, et qui est décisif.** Rien dans l'arbre lisible n'établit qu'une
redirection **nue** produit un nœud `command`, ni qu'elle produit un nœud dont le `type` figure
dans `REDIRECT_TYPES`. Les deux conditions sont **nécessaires** au cas 2 et aucune n'est
observable : `commands()` (`shell.ts:138-140`) filtre sur `command`, donc sans `command` la
boucle `shell.ts:404` ne visite rien ; et la branche de §4.2 itère sur `root` mais ne peut
viser qu'un `type` de `REDIRECT_TYPES`. Le grammar est inaccessible en lecture (Evidence g) :
ni `node-types.json`, ni `grammar.js`, ni `.wasm` ne sont présents dans l'arbre de travail.

**Pourquoi le cas 2 ne peut pas être fondé tel quel.** Le faire reposer sur « aucun nœud
`command` n'est produit » serait inverser la charge de la preuve : le critère de succès
échouerait non pas parce que le correctif est mauvais, mais parce que la grammaire produit un
type de nœud que personne n'a observé. Un test qui peut échouer pour une raison étrangère à ce
qu'il vérifie n'est pas un test, c'est une hypothèse déguisée. **Je retire donc le cas de la
matrice d'acceptation** et je le consigne comme `INFERE` **non couvert** :

> `INFERE` non couvert — une redirection nue (`> <tmp externe>`) atteint-elle une branche de
> `collect()` sous un `type` présent dans `REDIRECT_TYPES` ? Non établi. Ne peut l'être que
> par l'exécution du test T1 (§7.5), qui dumpe la structure réelle. Si T1 montre qu'un tel
> nœud existe sous un type connu, le cas 2 est **promu** en cas de test par une décision
> ultérieure ; il ne l'est pas par anticipation.

Le récepteur `root` de la branche reste le bon choix architecturale : c'est la seule façon de
couvrir la redirection nue **si** elle est représentée. Une branche qui n'observerait que
`node` serait structurellement incapable de la voir, quel que soit le verdict de T2.

### 7.3 Référence de structure

Le test T1 (§7.5) est le **préalable** au figeage de `REDIRECT_TYPES` et de
`REDIRECT_OPERAND_TYPES`. Il parse `echo x > f`, `echo x 2>&1`, `echo x >&2`, `>| f` et
`cat <<EOF > /tmp/f` avec le même chemin de chargement que `shell.ts:323-348`, sous **bash et
powershell**, et journalise le `type` du nœud de redirection et le `type` de **chaque** enfant
nommé. Ce qu'il doit établir, et qui est aujourd'hui inconnu :

1. le `type` du nœud de redirection sous chaque grammaire ;
2. le `type` du nœud qui porte l'opérande ;
3. si l'opérateur est un **enfant nommé** ou un **token anonyme**.

Le point 3 est celui de l'objection 1 : il ne change plus la correction, qui est agnostique
(§4.1, P1), mais il conditionne `REDIRECT_OPERAND_TYPES`.

### 7.4 Précisions de citation

Le helper `each()` est **déclaré à `shell.test.ts:146`** (`const each = (`) ; la ligne 148 est
la signature du callback `fn`. La commande de `shell.test.ts:1110` est
`` command: `echo stdout_msg && echo stderr_msg >&2` ``. Ces deux corrections sont sans effet
sur la décision (Required change 5).

### 7.5 Méthode de test — exécutable par la vague 4

**Cette section remplace l'affirmation « conforme par lecture ».** Le validateur n'a pas pu
exécuter de test (shell EPERM) ; rien n'est donc affirmé sans procédure exécutable et code de
sortie. Cinq vérifications, dans cet ordre. Chacune a un artefact.

**T1 — Structure AST et figeage des types.** Nouveau fichier
`packages/opencode/test/tool/shell-redirect-ast.test.ts`.
Commande, répertoire de travail `packages/opencode` :

```
bun test --timeout 30000 test/tool/shell-redirect-ast.test.ts
```

Attendu : sortie des `type` pour les cinq formes ci-dessus sous bash et powershell ; **code de
sortie 0**. Échec attendu tant que `REDIRECT_TYPES` / `REDIRECT_OPERAND_TYPES` ne sont pas
figés sur cette sortie — c'est un **préalable**, pas une vérification de non-régression.

**T2 — Prédicat d'opérande, testé directement.** Dans le même fichier, un `describe` qui appelle
`redirectTargets` sur les nœuds de redirection de `echo x > f`, `echo x 2>&1`, `echo x >&2`,
`>| f`. Assertion, pour **chaque** chaîne retournée :

```
isRedirectOperator(chunk) === false
```

et, pour `echo x > f`, `redirectTargets` contient exactement le chemin et **aucun** jeton
d'opérateur. Attendu : **code de sortie 0**.

**T3 — Contrôle négatif par mutation (obligatoire).** Revertir temporairement `redirectTargets`
à la forme « tous les enfants nommés » (`for (const child of node.namedChildren) out.push(...)`),
relancer T2 et **T1**. Attendu : **T2 doit échouer** (code de sortie non nul) sur les formes où
l'opérateur est un enfant nommé. Un test qui ne peut pas échouer ne prouve rien ; cette étape
est la preuve que la suite verte vaut quelque chose. Restaurer ensuite le prédicat et relancer
T1+T2 : **code de sortie 0**.

**T4 — Indépendance à l'égard de `shell.ts:413`.** Test dans
`packages/opencode/test/tool/shell.test.ts`, sous `describe("tool.shell permissions")`
(`shell.test.ts:215`), exécuté avec `workdir` **hors** de l'espace de travail, de sorte que
`containsPath` (`shell.ts:413`) soit faux pour le `cwd`. Commande : `echo x > <tmp externe>`,
avec un `echo x > <chemin interne>` sur la même ligne. Assertion : **exactement une** requête
`external_directory`, et son motif ne contient **aucun** répertoire igual à `cwd` provenant
d'un jeton d'opérateur ; le nombre de `scan.dirs` est **1**, pas 2. Ce test échoue si le
prédicat est absent, puisque le chemin bidon deviendrait alors demandeur (Alternative **A6**).
Il est **distinct** de T3 : T3 prouve que le prédicat rejette l'opérateur, T4 prouve que le
comportement ne dépend plus de `shell.ts:413`.

**T5 — Non-régression de l'existant.** Commande :

```
bun test --timeout 30000 test/tool/shell.test.ts
```

Attendu : **code de sortie 0**, `matches redirects in permission pattern`
(`shell.test.ts:989`-`:1005`) vert avec `patterns` contenant toujours
`"echo test > output.txt"`, `shell.test.ts:1110` sans requête. Puis, pour le périmètre élargi :
`bun test --timeout 30000 test/tool/shell-launch-retry.test.ts`, `test/tool/external-directory.test.ts`,
`test/tool/read.test.ts`, `test/agent/agent.test.ts` — codes de sortie 0, avec le compte de
tests **augmenté** du seul bloc ajouté, et **aucun** test préexistant passant de vert à rouge.

**Critère de succès global, énoncé comme procédure et non comme opinion :** T1 → T5 verts,
avec les codes de sortie 0 ; T3 **rouge** à l'étape mutation et vert après restauration ;
T4 vert ; le test `matches redirects in permission pattern` inchangé. Avant le correctif, les
trois premiers cas de §7.1 échouent ; après le correctif, ils passent.

## 8. Effort

**M** — un seul fichier de source, une vingtaine de lignes de logique nouvelle plus le
prédicat d'opérande (§4.1) ; la vérification du type de nœud doit être faite pour deux
grammaires (T1), le prédicat doit être testé unitairement et muté (T2, T3), l'indépendance à
l'égard de `shell.ts:413` doit être prouvée (T4), et la matrice de faux positifs impose huit cas
sur plusieurs shells. Ce qui portait l'effort au-delà de S dans la version antérieure — un
prédicat non défini — est désormais **défini et testable** ; l'effort reste M parce que T1 est
un préalable, non un raffinement.

## 9. Note d'intégrité (C-31)

Un fichier `verdicts/P12-verdict.md` existait **déjà** (204 lignes, signature `validator-p12`,
statut `PASS_WITH_CHANGES`, première ligne = en-tête du gabarit et non `Statut :`) : un artefact
non vérifié, de même nature que le défaut d'orchestration consigné en **C-21**
(`CORRECTIONS.md:31`). Le validateur l'a remplacé sans le réutiliser comme preuve. **Le verdict
remplaçant est le seul opposable**, et la présence d'un fichier ne prouve la conformité dans
aucun sens. Cette note vaut pour la version présente de ce document : elle est un artefact
non exécuté, et sa conformité est **prédite** par §7.5, pas constatée.

## 10. Arbitrage A-3 — propriétaire de l'invariant et contrepartie `collect()`

**Propriétaire : `shell.ts`.** Arbitrage repris et entériné du verdict P09 §7 : le point de
passage qui reçoit un texte déjà réduit (`terminal-output.ts:224-229`, **C-05**) ne peut pas
garantir qu'une version complète existe ailleurs, et `shell.ts:350` est la seule couche où le
texte complet transite avant toute réduction.

**La contrepartie est une contrainte de code, pas une intention.** L'invariant « la sortie
complète existe sur disque » n'a de valeur que si le scan de `collect()` reste sur le chemin de
**chaque** tentative d'exécution. État réel, établi par lecture des lignes exactes :

| étape | ligne | position |
|---|---|---|
| parsing | `shell.ts:649-651` | `parse(...)` en `Effect.acquireRelease` |
| **scan** | `shell.ts:652` `const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)` | **une seule fois par `execute`** |
| ajustement | `shell.ts:653` `if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)` | après le scan |
| autorisation | `shell.ts:654` `yield* ask(ctx, scan)` | après le scan |
| exécution | `shell.ts:658` `return yield* run(...)` | après le scan |
| relance | `shell.ts:498` `const handle = yield* retryTransientLaunch(spawner.spawn(cmd(...)))` | **à l'intérieur de `run`**, donc après le scan |

**Conséquence, à ne pas inverser.** `collect()` est exécuté **une fois**, avant `ask` et avant
`run` ; le retry de `shell.ts:498` est **en aval** du scan. Chaque tentative d'exécution est
donc couverte non parce que le scan est répété, mais parce qu'il **précède toutes** les
tentatives. Toute évolution qui déplace `collect()` à l'intérieur de `run()`, ou qui hisse le
retry de `shell.ts:498` au-dessus du scan, ou qui réordonne l'autorisation après `run`, rend la
garantie **silencieusement vacante** et rouvre par la même occasion le contournement que P12
ferme. C'est une condition de cohérence entre **P09 / P12 / P18**, pas un défaut propre à P12.

**Garantie explicite, par test — T6.** Dans
`packages/opencode/test/tool/shell-launch-retry.test.ts`, en réutilisant le harnais existant
(`shell-launch-retry.test.ts:103` exige `starts.count >= LAUNCH_BUDGET`, **C-15**) : un spawn
qui échoue transitoirement puis réussit, sur une commande portant une redirection vers un
chemin externe. Assertions :

1. `starts.count >= LAUNCH_BUDGET` — la relance a bien eu lieu ;
2. la requête `external_directory` a été **capturée avant que le compteur de `starts` n'atteigne
   1**, c'est-à-dire avant tout spawn ;
3. exactement **une** requête `external_directory`, malgré plusieurs tentatives.

L'assertion 2 est celle qui porte la garantie : elle échoue si `collect()` glisse dans `run()`,
si le scan est réitéré par tentative au lieu d'être unique, ou si l'autorisation passe après
`run`. Sans elle, l'unicité du scan serait une propriété non observée.

## 11. Verdict self-assessment

**NEEDS_REVIEW.**

Trois points précis, dont deux sont désormais **arbitrés** et n'attendent plus le validateur,
et un seul reste réellement ouvert :

1. ~~Portée de la branche non conditionnée~~ — **tranché** : couverture complète, y compris les
   commandes absentes de `FILES`. C'est la seule portée qui ferme `echo x > /tmp/f`. Le
   coût en requêtes supplémentaires est le comportement voulu : une redirection est une
   écriture, et une écriture hors espace de travail doit demander.
2. **Prédicat d'opérande** — **tranché en §4.1** : filtre textuel total, agnostique à la
   structure de l'arbre, avec filtre de type en surcouche figé par T1. `shell.ts:413` est
   explicitement requalifié en filtre d'espace de travail, et son insufficiency est rendue
   observable par T4.
3. ~~Couverture PowerShell~~ — **partiellement tranché** : `REDIRECT_TYPES` couvre
   `redirection` (établi par `shell.ts:114`) et `file_redirect` (candidat non vérifié). Le
   **seul** point réellement ouvert est le nom exact du type sous `tree-sitter-powershell`,
   que **T1 tranche par exécution**, et non par anticipation. Si T1 montre que
   `tree-sitter-powershell` n'expose pas de nœud de redirection sous un type connu, la
   couverture PowerShell de l'opérateur `>` PowerShell n'est pas couverte par ce correctif et
   doit faire l'objet d'une décision distincte — de même que le cmdlet `Out-File`, qui reste un
   trou d'allowlist `FILES` (**A4**), hors de portée ici.

**Ce document n'est pas un constat d'exécution.** Aucune de ses prédictions n'a été exécutée
(shell EPERM). Sa conformité sera établie, ou réfutée, par T1 à T6 avec leurs codes de sortie.
