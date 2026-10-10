# P13 — mutation de fichier détectée par liste fixe de commandes (`bash`)

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — réécriture complète (fichier corrompu, règle C-21)
>
> **Vague 4, deuxième révision.** Les six blocages du revalidateur indépendant
> (`docs/harness-audit/verdicts/P13-revalidation.md`, table `:140-152`) sont traités un par un,
> chacun avec la ligne de findings qu'il ferme. Table en tête de document. Aucun autre fichier
> n'est écrit, aucun patch n'est appliqué : ceci reste une proposition.

Réécriture intégrale : rien de la version antérieure n'est conservé. Deux agents y écrivaient
simultanément (C-21), donc chaque affirmation ci-dessous a été **re-relue directement** dans la
source et porte sa citation. Aucune affirmation n'est reprise de la version précédente sans
relecture. **Règle appliquée en vague 4** : une absence est établie par `read`, jamais par un
glob qui ne renvoie rien — un glob négatif sans motif contraignant ne prouve pas l'absence.

**Blocages de la revalidation vague 4, et où ils sont fermés.**

| finding | ligne du revalidateur | Ce qui était faux | Fermé dans |
|---|---|---|---|
| `#1` | `P13-revalidation.md:142` | §7 déclarait `wave4-baseline.md` absent, sur un glob sans résultat | §7 « État de la baseline (C-24) » |
| `#2` | `:143` | §7 reconduisait `68/27/3` et « 26 échecs », périmés par C-40 | §7 « État de la baseline (C-24) » |
| `#3` | `:144` | volet B bâti sur le triplet `(pass, fail, errors)` de `test/tool/shell.test.ts`, instable | §7 volets B et C |
| `#4` | `:145` | §3.10 affirmait `bash: "allow"` pour `explore` **et** `scout` | §3.10, rangée `scout` |
| `#8` | `:149` | C-24 : critère de succès non discriminant tant que le volet B repose sur la suite instable | §7 « Critère de succès », + contrôle de falsifiabilité |
| `#11` | `:152` | remède RC1 « à valider », absent du diff de §4 | §4 hunk sur `always: globs`, §6, §9 décision 1 |

**Traçabilité des Required changes du verdict `PASS_WITH_CHANGES` (2026-10-03).** Le verdict
annonce « cinq corrections » mais énumère **six** Required changes ; les six sont appliqués.

| # | Required change | Traité dans | Preuve de relecture |
|---|---|---|---|
| RC1 | Élever l'analyse `always` dans `Risks`, avec le remède | §6 « Neutralisation par `always` », §9 décision 1 | `shell.ts:284-289`, `shell.ts:419-422`, `permission/index.ts:234`, `:241`, `:304-310`, `packages/core/src/permission.ts:21-31`, `packages/core/src/util/wildcard.ts:3-13` |
| RC2 | Corriger la justification de la clé `python -c *` | §2 « Clé d'octroi » | `permission/arity.ts:135` `python: 2` → `arity.ts:5` `tokens.slice(0, arity)` |
| RC3 | `metadata: {}` `:287` → `:288` ; remplacer « ~100 % » | §2 et §5(a) | `shell.ts:280-283`, `:288`, `:297` |
| RC4 | Trancher l'export ; définir les fonctions appelées ; contrat PowerShell | §4 | `shell.ts:189-194` et `:196-201` **sans `export`** ; `:224-229` ; `:203-232` |
| RC5 | Corriger la commande de régression + baseline | §7 | chemins relus par `read` (§7) ; chiffres de référence `CORRECTIONS.md:50` (C-40) |
| RC6 | `of=` mort : retirer `dd`/`patch`/`install` | §4 (`WRITE_UTILS` réduit à 4 noms) | `shell.ts:203-232` |

**Règle effective tranchée (C-14), en une phrase** : `external_directory` vaut `ask` par défaut ;
`allow` s'impose pour les trois familles blanches (`Truncate.GLOB`, `%TEMP%\*`, `skillDirs\*`) et
la règle `Truncate.GLOB: "allow"` injectée en `agent.ts:366-369` **écrase** toute règle antérieure
plus générale sur ce glob, parce que `merge` concatène (`permission.ts:33-35`) et `evaluate`
retient la **dernière** correspondance (`permission.ts:25`). Détail et preuve en §3.10.

**Désaccord tracé avec C-13 (le verdict dit vrai, mais pour une autre ligne)** : l'octroi
`always` de la permission `bash` pour `"python -c *"` **ne** neutralise **pas** la détection
P13. `evaluate` apparie la règle à la permission **demandée** (`permission.ts:25`), donc une
règle `{permission: "bash"}` ne peut pas court-circuiter une demande
`permission: "external_directory"` (`shell.ts:285`). La neutralisation existe bien, mais par
`shell.ts:287` `always: globs` sur la demande `external_directory` elle-même — remède désormais
**retenu et porté par le diff** de §4, voir §9 décision 1. Preuve, chiffres et
conséquence sur la sévérité en §6.

## 1. Problem

Le chemin d'un fichier visé par une commande n'est extrait — et donc jamais proposé à
l'approbation `external_directory` — que si le premier mot de la commande figure dans une liste
de noms figée ; toute écriture dont le chemin est caché dans une charge utile inline
(`python -c`, `node -e`) ou émis par un utilitaire absent de la liste (`tee`, `sed -i`) est
invisible au scan.

## 2. Evidence

**Les deux listes sont des tables de noms, pas des propriétés de commande.** Une entrée par ligne
dans la source ; la version condensée de la proposition précédente était un défaut de citation.

`packages/opencode/src/tool/shell.ts:41` :
```ts
const CWD = new Set(["cd", "chdir", "popd", "pushd", "push-location", "set-location"])
```
`packages/opencode/src/tool/shell.ts:42-63` (`FILES`) — entrées `:44-51` puis `:55-62` :
```ts
const FILES = new Set([
  "chmod",
  "chown",
  "cat",
  // Leave PowerShell aliases out for now. Common ones like cat/cp/mv/rm/mkdir
  // already hit the entries above, and alias normalization should happen in one
  // place later so we do not risk double-prompting.
  "get-content",
  "set-content",
  "add-content",
  "copy-item",
  "move-item",
  "remove-item",
  "new-item",
  "rename-item",
])
```
`packages/opencode/src/tool/shell.ts:64-77` (`CMD_FILES`, une entrée par ligne `:65-76`) :
```ts
const CMD_FILES = new Set([
  "copy",
  "del",
  "dir",
  "erase",
  "md",
  "mkdir",
  "move",
  "rd",
  "ren",
  "rename",
  "rmdir",
  "type",
])
```
Le commentaire `shell.ts:52-54` est verbatim exact et assume l'état de fait : les alias
PowerShell sont exclus *par prudence*, pas parce qu'une propriété les couvre.

`packages/opencode/src/tool/shell.ts:78-79` — les deux tables qui gouvernent l'extraction
existante :
```ts
const FLAGS = new Set(["-destination", "-literalpath", "-path"])
const SWITCHES = new Set(["-confirm", "-debug", "-force", "-nonewline", "-recurse", "-verbose", "-whatif"])
```

**La porte unique.** `packages/opencode/src/tool/shell.ts:409` :
```ts
        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
```
`grep "FILES\.has|CMD_FILES\.has"` sur `packages/opencode/src` ne renvoie
que ces deux occurrences sur cette ligne : la liste n'a **aucun** autre site d'appel. Corriger
la porte suffit donc à ouvrir l'extraction, sans toucher à un second appelant.

Le corps de boucle `:410-417` est le seul chemin qui alimente `scan.dirs` pour une cible de
fichier :
```ts
          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
            const resolved = yield* argPath(arg, cwd, ps, shell)
            log.info("resolved path", { arg, resolved })
            if (!resolved || containsPath(resolved, instance)) continue
            const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
            scan.dirs.add(dir)
          }
```

**Ce que la liste protège réellement : `external_directory`, rien d'autre.**
`packages/opencode/src/tool/shell.ts:279-290`, extrait intégral (8 lignes) :
```ts
  if (scan.dirs.size > 0) {
    const globs = Array.from(scan.dirs).map((dir) => {
      if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
      return path.join(dir, "*")
    })
    yield* ctx.ask({
      permission: "external_directory",
      patterns: globs,
      always: globs,
      metadata: {},
    })
  }
```
Correction de citation (RC3) : `metadata: {}` est à **`shell.ts:288`** (et non `:287`), `:287`
étant `always: globs,`. Le second `metadata: {}` est à `shell.ts:297`.

**Ce que la permission générique protège déjà.** `packages/opencode/src/tool/shell.ts:292-298` :
```ts
  if (scan.patterns.size === 0) return
  yield* ctx.ask({
    permission: ShellID.ToolID,
    patterns: Array.from(scan.patterns),
    always: Array.from(scan.always),
    metadata: {},
  })
```
`ShellID.ToolID` vaut `"bash"` (`packages/opencode/src/tool/shell/id.ts:16`, commentaire `:14-15`
imposant de garder cette clé). Et `scan.patterns` est alimenté **indépendamment** de `FILES`,
`packages/opencode/src/tool/shell.ts:419-422` :
```ts
        if (tokens.length && (!cmd || !CWD.has(cmd))) {
          scan.patterns.add(source(node))
          scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
        }
```
Conséquence exacte : `python -c "…"` **décline déjà** la permission `bash` aujourd'hui. Ce qui
manque n'est pas l'invite générique, c'est `external_directory`.

**Clé d'octroi `python -c *` — justification corrigée (RC2).** La version précédente affirmait un
repli sur `tokens.slice(0, 1)`. C'est faux : `packages/opencode/src/permission/arity.ts:135`
déclare `python: 2, // python -m venv env`, et `packages/opencode/src/permission/arity.ts:5` est
`if (arity !== undefined) return tokens.slice(0, arity)`. Donc `prefix(["python","-c","…"])` rend
`["python","-c"]`, et `shell.ts:421` produit `"python -c *"`. Le repli `tokens.slice(0, 1)` de
`arity.ts:8` n'est atteint que pour un préfixe inconnu. **La clé annoncée était juste, sa
justification était fausse** ; c'est cette dernière qui est corrigée.

**Ce que la liste ne fait pas (contre-vérification).** `packages/opencode/src/project/instance-context.ts:18-24` :
```ts
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (AppFileSystem.contains(ctx.directory, filepath)) return true
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false
  return AppFileSystem.contains(ctx.worktree, filepath)
}
```
`containsPath` est vrai pour `ctx.directory` **ou** `ctx.worktree` (`:19` et `:23`). Combiné à
`shell.ts:413` (`if (!resolved || containsPath(resolved, instance)) continue`), une cible
littérale **dans** le projet **ou dans le worktree** ne produit aucune demande. Ce n'était qu'une
`INFERE:` dans la version précédente ; c'est maintenant un fait cité. Le périmètre réel de la
détection est donc **strictement plus étroit** que « hors répertoire d'instance » : c'est
« hors `directory` **et** hors `worktree` ».

**La redirection n'appartient pas à cette proposition — et les tokens ne la contiennent même pas.**
`packages/opencode/src/tool/shell.ts:114` (dans `parts`) :
```ts
      if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
```
La cible d'une redirection est **écartée** de `tokens`, donc P12 (`docs/harness-audit/README.md`)
possède un chemin disjoint du nôtre. Le correctif s'applique en aval, quel que soit le
propriétaire de la redirection.

## 3. Mechanism

1. `packages/opencode/src/tool/shell.ts:646` — `const ps = Shell.ps(shell)`.
2. `:649-651` — `parse(params.command, ps)` produit l'arbre tree-sitter (wasm), libéré en fin de scope.
3. `:652` — `collect(tree.rootNode, cwd, ps, shell, instanceCtx)` (définition `:390-426`).
4. `:397-401` — `scan = { dirs, patterns, always }`, trois `Set`.
5. `:402` — `shellKind = ShellID.toKind(Shell.name(shell))` (`id.ts:10-12` : `"bash"` par défaut).
6. `:404-407` — boucle sur `commands(root)` ; `parts(node)` (`:106-121`) produit les `Part`,
   `tokens = command.map(item => item.text)`, et `cmd` est normalisé en minuscules sous
   PowerShell ou `cmd` (`:407`), **brut** sous bash.
7. `:409` — **porte unique** : `FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd))`.
8. `:410-417` — seulement si la porte s'ouvre : `pathArgs` (`:203-232`) filtre drapeaux et
   positionnels ; `argPath` résout ; `:413` rejette ce que `containsPath` couvre ; `:414` décide
   entre le fichier et son répertoire ; `:415` ajoute à `scan.dirs`.
9. `:419-422` — **indépendamment de l'étape 7**, toute commande non-`CWD` ajoute son texte brut à
   `scan.patterns` et `BashArity.prefix(...) + " *"` à `scan.always`.
10. `:653` — si le `cwd` lui-même est hors instance, `scan.dirs.add(cwd)`.
11. `:654` — `ask(ctx, scan)`.
12. `:279-290` — `scan.dirs` non vide ⇒ `ctx.ask({ permission: "external_directory", patterns: globs, always: globs, metadata: {} })`.
13. `:292-298` — `scan.patterns` non vide ⇒ `ctx.ask({ permission: "bash", patterns, always })`.
14. `:301-322` — `cmd(shell, command, cwd, env)` lance le processus ; **aucun contrôle d'écriture
    n'existe entre l'étape 13 et l'exécution**.

Le défaut est aux étapes 7-8 : la porte est une égalité sur un nom, et le corps de la commande —
la seule partie qui décrit ce qui est réellement écrit — n'est jamais examiné. `tokens` contient
les arguments *concatenés*, donc la cible d'un `open('…','w')` est invisible à `pathArgs` : elle
vit à l'intérieur d'un token, pas à côté.

**10. Règle effective de `external_directory` (C-14, tranchée par lecture).**

- `packages/opencode/src/agent/agent.ts:119-122` — défaut :
  ```ts
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
  ```
  avec `whitelistedDirs` défini `:106-110` = `[Truncate.GLOB, path.join(Global.Path.tmp, "*"),
  ...skillDirs.map(dir => path.join(dir, "*"))]`, et `Truncate.GLOB =
  path.join(TRUNCATION_DIR, "*")` (`packages/opencode/src/tool/truncate.ts:18`).
- `packages/opencode/src/agent/agent.ts:356-370` — surcharge, pour tout agent sans refus explicite :
  ```ts
          if (explicit) continue
          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
  ```
  où `explicit` (`:359-363`) ne teste qu'un `deny` sur **exactement** `Truncate.GLOB`.
- `Permission.merge` est une **concaténation** : `packages/core/src/permission.ts:33-35`
  (`return rulesets.flat()`), et `Permission.fromConfig` produit des règles
  `{permission, pattern, action}` (`packages/opencode/src/permission/index.ts:345-357`).
- `evaluate` retient la **dernière** correspondance :
  `packages/core/src/permission.ts:21-31` → `rulesets.flat().findLast((rule) =>
  Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern))`.

**Règle effective, en une phrase** : pour `external_directory`, l'action par défaut est `ask` ;
`allow` s'impose sur les trois familles blanches ; et l'entrée `Truncate.GLOB: "allow"`
ajoutée en dernier à `:366-369` **prime sur toute règle antérieure plus générale** portant sur ce
glob (y compris un `"*": "ask"` explicite), la seule exception étant un `deny` sur exactement ce
motif, que la garde `:359-364` préserve. Les deux politiques ne sont donc pas en conflit
*comportemental* — `allow` l'emporte localement, `ask` l'emporte partout ailleurs — mais elles
sont écrites en deux endroits distants de 240 lignes et rien ne les relie ; il n'y a pas deux
« politiques opposées » mais une règle générale et une surcharge silencieuse. La même politique
est encore reprise à deux endroits par réutilisation d'une constante locale
`readonlyExternalDirectory` (`agent.ts:111-114`), vérifiée par
`grep readonlyExternalDirectory` (3 occurrences : définition `:111`, consommateurs `:214` et
`:240`) : l'agent natif `explore` l'utilise tel quel (`agent.ts:214`), et l'agent natif `scout`,
derrière `flags.experimentalScout`, l'étend d'un `path.join(Global.Path.repos, "*"): "allow"`
(`agent.ts:241`).

**Correction de vague 4 (`#4`, `P13-revalidation.md:145`) : `explore` et `scout` ne sont pas bâtis
sur la même base.** Ce qui est vrai et cité : les deux déclarent `"*": "deny"` — `agent.ts:206`
pour `explore`, `agent.ts:231` pour `scout` — et tous deux sont composés par
`Permission.merge(defaults, fromConfig(…), user)` (`agent.ts:203-217` et `:228-245`). Ce qui était
**faux** dans la version précédente, et que je retire : « avec `bash: "allow"`
(`agent.ts:206`/`:210` et `:231`/`:235`) ». Relevé exact de `agent.ts:224-243`, relu :

- `explore` (`agent.ts:205-215`) : `"*": "deny"`, `grep: "allow"`, `glob: "allow"`,
  `list: "allow"`, **`bash: "allow"` (`:210`)**, `webfetch: "allow"`, `websearch: "allow"`,
  `read: "allow"`, `external_directory: readonlyExternalDirectory`.
- `scout` (`agent.ts:230-242`) : `"*": "deny"`, `grep: "allow"`, `glob: "allow"`,
  `webfetch: "allow"`, **`websearch: "allow"` (`:235`)**, `read: "allow"`,
  `repo_clone: "allow"`, `repo_overview: "allow"`, `external_directory: { … }`.
  **Aucune clé `bash` dans ce bloc** ; `agent.ts:235` est `websearch`, pas `bash`.

La conséquence est **non cosmétique**, donc je la pose comme inférence tracée et non comme fait :
`INFERE:` n'ayant aucune exception `bash`, une `python -c` est **refusée d'emblée** sous
`scout`, et non « totalement silencieuse » comme l'affirmait la version précédente. Méthode de
vérification : `defaults` vaut `"*": "allow"` (`agent.ts:117`) mais `Permission.merge` concatène
(`packages/core/src/permission.ts:33-35`) et `evaluate` retient la **dernière** correspondance
(`packages/core/src/permission.ts:25`) ; le `"*": "deny"` de `agent.ts:231` suit le `"*":
"allow"` de `agent.ts:117` dans le tableau aplati, donc il gagne. **Vérification proposée** :
un test qui appelle `ctx.ask({ permission: "bash", patterns: ["python -c *"] })` sous l'agent
`scout` et observe `deny`, contre `allow` sous `explore`. **Conséquence pour P13** : l'invite
`external_directory` que le correctif introduit est **peu susceptible d'être observable sous
`scout`**, qui refuse déjà la commande. Le changement de comportement est donc sous `explore`
— `bash` autorisé, `external_directory` à `ask` — et sous l'agent principal.

Corollaire direct pour P13 : toute cible que le détecteur ajoutera à `scan.dirs` et qui tombe
sous `Truncate.GLOB`, `%TEMP%\*` ou `skillDirs\*` **ne demandera rien**, avant comme après
correctif. Ces cibles sont hors périmètre observable du gain.

## 4. Proposal

**Principe.** Ne pas rallonger `FILES`. Répondre à deux questions sur le *contenu* — « y a-t-il
une charge utile inline ? » et « quels chemins cette charge nomme-t-elle ? » — puis réinjecter
ces chemins dans le pipeline existant de l'étape 8. Aucune permission nouvelle, aucun dialogue
nouveau, aucune nouvelle clé.

**Fichier créé : `packages/opencode/src/tool/shell/mutation.ts`** — module pur, sans I/O, sans
spawn, **sans import** depuis `tool/shell.ts`.

```ts
// packages/opencode/src/tool/shell/mutation.ts

// RC4 : `dynamic` et `prefix` ne sont PAS exportés (shell.ts:189, shell.ts:196). On ne
// touche pas à shell.ts pour les exposer : la contrainte « un seul site de branchement »
// vaut pour les *appels*, pas pour les déclarations. Duplication assumée, 10 lignes,
// avec le site d'origine en commentaire sur chaque fonction.

/** Copie verbatim de shell.ts:189-194. Source à garder à jour. */
export function dynamic(text: string, ps: boolean) {
  if (text.startsWith("(") || text.startsWith("@(")) return true
  if (text.includes("$(") || text.includes("${") || text.includes("`")) return true
  if (ps) return /\$(?!env:)/i.test(text)
  return text.includes("$")
}

/** Copie verbatim de shell.ts:196-201. */
export function prefix(text: string) {
  const match = /[?*[]/.exec(text)
  if (!match) return text
  if (match.index === 0) return
  return text.slice(0, match.index)
}

/** Charge utile inline : le drapeau est ce qui distingue une charge opaque d'un script. */
export const INLINE = new Map<string, Set<string>>([
  ["python", new Set(["-c"])],
  ["python3", new Set(["-c"])],
  ["node", new Set(["-e", "--eval", "-p", "--print"])],
  ["bun", new Set(["-e", "--eval"])],
  ["ruby", new Set(["-e"])],
  ["perl", new Set(["-e", "-E"])],
  ["osascript", new Set(["-e"])],
  ["php", new Set(["-r"])],
  ["deno", new Set(["--eval"])],
])

/**
 * Utilitaires dont les chemins sont déjà des positionnels ou des valeurs de drapeau,
 * donc déjà extraits par `pathArgs` (shell.ts:203-232). Ils n'apportent que la porte.
 *
 * `dd`, `patch` et `install` sont VOLONTAIREMENT ABSENTS (RC6) : leur chemin est porté par
 * `of=`, une affectation `nom=valeur` que seul `extractPathLiterals` sait lire, et cette
 * fonction n'est appliquée qu'à la branche inline. Les annoncer ici serait annoncer une
 * couverture inexistante.
 */
export const WRITE_UTILS = new Set(["tee", "tee-object", "out-file", "sed"])

// Un littéral est retenu s'il est ancré (relatifParent/absolu/home/drive) ou s'il porte
// une extension. `w`, `1`, `utf8` et `s/a/b/` ne passent aucune des deux branches.
const PATH_ANCHORED = /^(?:\.{1,2}[/\\]|~[/\\]|[/\\]|[A-Za-z]:[/\\])\S*/
const PATH_RELATIVE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*[/\\][\w.\-/\\]*\.[A-Za-z0-9]{1,10}$/
const PATH_BARE_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*\.[A-Za-z0-9]{1,10}$/

/** RC4 : définition complète. Aucune fonction appelée sans être définie. */
export function extractPathLiterals(text: string, ps: boolean): string[] {
  if (dynamic(text, ps)) return [] // charge dynamique : signalée inline, sans extraction
  const out: string[] = []
  for (const raw of text.split(/["'`\s,;()[\]]+/)) {
    const lit = prefix(raw) // coupe au premier caractère glob, shell.ts:196-201
    if (!lit || lit.length < 2) continue
    if (PATH_ANCHORED.test(lit) || PATH_RELATIVE.test(lit) || PATH_BARE_FILE.test(lit)) out.push(lit)
  }
  return out
}

/**
 * RC4 : contrat explicite.
 *  - `tokens` = `command.map(i => i.text)` de shell.ts:406, jamais les `Part`.
 *  - `inline === true` ⇔ le premier token est un interpréteur de `INLINE` ET au moins un
 *    drapeau de sa table figure dans `tokens.slice(1)`. Donc `python script.py`,
 *    `python -m pytest`, `node server.js`, `bun test`, `bun run dev` → `inline: false`.
 *  - `paths` est vide pour une charge dynamique (`$(`, `${`, backtick, `(` en tête,
 *    `$` hors PowerShell) : résidu assumé, voir §6.
 *  - Les utilitaires de `WRITE_UTILS` ne passent PAS par cette fonction : leurs chemins sont
 *    des positionnels, extraits par `pathArgs`. Aucune gestion de `of=` ici.
 */
export function detectWritePaths(tokens: string[], ps: boolean): { paths: string[]; inline: boolean } {
  const cmd = (ps ? tokens[0]?.toLowerCase() : tokens[0]) ?? ""
  const flags = INLINE.get(cmd)
  if (!flags) return { paths: [], inline: false }
  const payloads: string[] = []
  for (let i = 1; i < tokens.length; i++) if (flags.has(tokens[i])) payloads.push(tokens[i])
  if (payloads.length === 0) return { paths: [], inline: false }
  return { paths: [...new Set(payloads.flatMap((p) => extractPathLiterals(p, ps)))], inline: true }
}
```

`positionalWriteArgs` **a disparu** du design (il était appelé sans définition dans la version
précédente, verdict objection #5) : son rôle est tenu par `pathArgs`, qui filtre déjà
`SWITCHES`/`FLAGS` (`shell.ts:224-229`) et normalise les positionnels sous PowerShell. Seul
`extractPathLiterals` reste à définir, et il l'est.

**Fichier modifié : `packages/opencode/src/tool/shell.ts`, un seul site de branchement, ligne 409.**

```diff
@@ const collect = ... @@
-        if (cmd && (FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd)))) {
-          for (const arg of pathArgs(command, ps, shellKind === "cmd")) {
+        const write = cmd ? detectWritePaths(tokens, ps) : { paths: [] as string[] }
+        const gated =
+          cmd &&
+          (FILES.has(cmd) ||
+            (shellKind === "cmd" && CMD_FILES.has(cmd)) ||
+            WRITE_UTILS.has(cmd) ||
+            write.inline)
+        if (gated) {
+          // Union, jamais substitution : `pathArgs` garde la normalisation PowerShell.
+          const args = [...new Set([...pathArgs(command, ps, shellKind === "cmd"), ...write.paths])]
+          const fromDetector = new Set(write.paths) // remède RC1 : pistage des globs issus du détecteur
+          for (const arg of args) {
             const resolved = yield* argPath(arg, cwd, ps, shell)
             log.info("resolved path", { arg, resolved })
             if (!resolved || containsPath(resolved, instance)) continue
             const dir = (yield* fs.isDir(resolved)) ? resolved : path.dirname(resolved)
             scan.dirs.add(dir)
+            if (fromDetector.has(arg)) scan.detected.add(dir)
           }
         }
```

**Deuxième hunk — le remède RC1, désormais porté par le diff (`#11`, `P13-revalidation.md:152`).**
La version précédente laissait `always: globs` inconditionnel et présentait le remède comme « à
valider ». Il est ici **tranché et écrit**. Deux changements indissociables :

```diff
@@ shell.ts:279-290 @@
   if (scan.dirs.size > 0) {
     const globs = Array.from(scan.dirs).map((dir) => {
       if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
       return path.join(dir, "*")
     })
+    const detectorGlobs = new Set(Array.from(scan.detected).map((dir) => {
+      if (process.platform === "win32") return AppFileSystem.normalizePathPattern(path.join(dir, "*"))
+      return path.join(dir, "*")
+    }))
     yield* ctx.ask({
       permission: "external_directory",
       patterns: globs,
-      always: globs,
+      always: globs.filter((glob) => !detectorGlobs.has(glob)),
       metadata: {},
     })
   }
```

et l'initialisation du `scan` (`shell.ts:397-401`), qui gagne un champ :

```diff
@@ shell.ts:397-401 @@
+  const scan = { dirs: new Set<string>(), patterns: new Set<string>(), always: new Set<string>(), detected: new Set<string>() }
```

**Ce que le remède change, exactement.** `patterns` reste `globs` : l'utilisateur voit toujours la
cible. Seul `always` est amputé des globs que le détecteur a produits : une approbation sur une
cible issue d'une charge inline reste donc **`once`** et la fenêtre d'observation (§6) reste
ouverte. Une approbation sur un répertoire découvert par `pathArgs` — c'est-à-dire le
comportement d'avant ce correctif — reste `always`, donc **aucune régression de comportement sur
le chemin préexistant**. C'est la limite exacte du remède : un répertoireatteint par une
commande `cat` puis par une `python -c` conserve le `always` accordé par la première. `INFERE:` ce
cas mixte est atteint — le filtrage porte sur le glob, pas sur son origine dans la session.
Méthode de vérification : ajouter au test d'intégration une séquence `cat <cible externe>` puis
`python -c "open('<cible externe>','w')"` et observer que la seconde demande propose `once`.

Quatre propriétés de ce diff, chacune vérifiable :

1. **`log.info("resolved path", …)` (`:412`) est conservé** — la proposition précédente l'effaçait
   par accident d'indentation ; ce serait une régression de diagnostic.
2. **`pathArgs` n'est plus court-circuité.** Le diff précédent faisait
   `inline.paths.length ? inline.paths : pathArgs(...)`, donc un utilitaire de `WRITE_UTILS`
   perdait la normalisation des interrupteurs PowerShell (verdict objection #6) — visible sur
   `out-file -Path C:\x -Encoding utf8 t.txt`. Ici `pathArgs` tourne **toujours** et le
   détecteur **ajoute**.
3. **Aucune fonction appelée sans être définie**, et aucun symbole privé de `shell.ts`
   n'est importé : `dynamic` et `prefix` sont dupliqués et signalés.
4. **La porte s'ouvre** sur `WRITE_UTILS.has(cmd)` même quand `paths` est vide : `pathArgs`
   fait le travail. `sed -i s/a/b/ notes.txt` sous bash → `pathArgs` renvoie `s/a/b/` et
   `notes.txt` ; le premier ne résout rien et `argPath` le laisse tomber, le second est la cible.

**Modification seconde, une seule chaîne : `FLAGS` (`shell.ts:78`) reçoit `"-filepath"`.**
Sans elle, `tee-object -FilePath C:\x` perd sa cible : `-FilePath` est un `command_parameter`,
`SWITCHES` ne le contient pas, donc `want = FLAGS.has(flag)` est faux (`:227`) et le paramètre **et** sa valeur sont écartés (`:224-229`). Ajout **strictement additif** — aucune
entrée retirée, aucun comportement existant modifié — et nécessaire pour que le tableau
`WRITE_UTILS` annonce `tee-object` correctement extrait, comme l'exige RC6.

**Ce qui reste inchangé, et pourquoi.** `FILES`, `CMD_FILES`, `CWD`, `SWITCHES`, la permission
`"bash"` et la clé `ShellID.ToolID` (`id.ts:14-16` qui impose `bash` pour la compatibilité
plugins/permissions enregistrées) restent inchangés. Aucune permission nouvelle, aucune nouvelle
clé, aucun changement de format de configuration. **Le type `Scan`, en revanche, change** : il
gagne le champ `detected`, ce qui est la contrepartie assumée du remède RC1 (deux sites à tenir
à jour au lieu d'un, comme la duplication `dynamic`/`prefix`).

**Garde-fou explicite — inline ≠ exécution de script.** La détection ne se déclenche que si un
drapeau de la table est présent dans `tokens.slice(1)`. `python script.py`, `python -m pytest`,
`node server.js`, `bun test`, `bun run dev` ne franchissent donc **pas** la porte : c'est la
contrainte qui empêche la correction de casser les lectures légitimes. `scripts exécutés` ne
figure volontairement pas dans `INLINE` : un script est un artefact visible et révisable.

**Volontairement hors périmètre.** (i) La redirection `>` / `>>` : `parts` écarte les nœuds
`redirection` (`shell.ts:114`), donc la cible n'est même pas dans `tokens` — chemin disjoint de
P12. (ii) `dd`, `patch`, `install` (RC6). (iii) `xxd`, `perl -pi`, `install -m`, les formes
`-o/--output` de GNU. (iv) Les chemins calculés au runtime (§6).

## 5. Alternatives considered

**(a) Extension de la liste `FILES` — rejetée, et son chiffrage est corrigé (RC3).** Ajouter
`python`, `node`, `bun`, `ruby`, `perl`, `sed`, `tee` à `FILES` ferait demander
`external_directory` pour `python script.py`, `node server.js`, `bun test`, `bun run dev`. La
version précédente chiffrait ce coût à « ~100 % des usages d'interpréteur » : **c'est faux, et
non mesuré**. Borne vérifiable : `shell.ts:413` + `instance-context.ts:18-24` filtrent toute
cible située **dans `ctx.directory` ou dans `ctx.worktree`**. Le coût réel de (a) se limite donc
aux scripts appelés par chemin absolu ou parent (`python ../build/x.py`) et aux cibles sous
`/tmp` ou hors worktree. Cette borne est **une borne de code, pas un taux mesuré** : aucun
dénominateur n'a été compté dans ce dépôt, et je ne peux pas en produire un par lecture seule.
Motif du rejet inchangé : coût permanent de maintenance (chaque binaire ajouté exige une mise à
jour) et contournabilité par le nom du binaire.

**(b) Détection par motif sur le contenu — retenue.** Elle interroge la charge utile plutôt que
le nom. Elle ajoute une catégorie qui **n'existe pas** dans `FILES` (les drapeaux inline) au
lieu d'élargir une liste existante. Son taux de faux positif est une **borne qualitative
vérifiable** — « charge inline ∧ littéral de chemin hors `directory` **et** hors `worktree` » —
et **non mesuré** ; je le déclare tel plutôt que d'avancer un pourcentage. Faux positifs résiduels
énumérés en §6. Coût : deux recherches dans une `Map`/`Set` par nœud de commande, aucun I/O,
aucun spawn, aucune modification de la surface de permission ; le coût dominant du chemin
(`parse` wasm, `:649`) est inchangé.

**(c) Détection a posteriori des écritures du processus — rejetée pour ce périmètre.** Sous
Linux, `inotify` sur l'arbre ; sous Windows, un minifilter ou ETW. `max_user_watches` (8192 par
défaut) est dépassé par un arbre de projet réel, et il faut payer O(N) en watches par commande,
soit de la dizaine de ms à plusieurs secondes ; Windows exige des privilèges administrateur, que
le harnais ne peut pas réclamer à chaque appel. Avantage unique : aucun faux positif. Motif
éliminatoire : **la détection est postérieure à l'écriture**. On ne peut pas révoquer une
permission déjà exercée ; il faudrait tuer le processus et restaurer le fichier, ce qui est un bac
à sable, pas un indice de permission. C'est la bonne réponse si l'objectif devient un vrai
contrôle d'accès — décision produit, pas correctif.

**(d) Clé de permission dédiée `bash_write` — écartée.** Séparerait « autoriser un interpréteur »
de « autoriser un interpréteur qui écrit », mais ajoute une clé alors que
`packages/opencode/src/tool/shell/id.ts:14-16` impose explicitement de garder `bash`. Le prompt
affichant déjà le texte brut (`scan.patterns.add(source(node))`, `shell.ts:420`), l'information
n'est pas perdue.

## 6. Risks

**Ce correctif n'est pas une barrière de sécurité.** `scan.dirs` n'alimente qu'un dialogue
d'approbation : le processus est lancé par `cmd(…)` (`shell.ts:301-322`) après `ask`, et rien
n'empêche une commande d'écrire. Il n'existe aucune liste à contourner — il y a une absence de
vérité à exploiter. `python -c`, `env python -c`, un script téléchargé puis exécuté, un binaire
renommé produisent tous le même refus ou la même acceptation selon la volonté de l'utilisateur.
Le gain est **probabiliste et UX** : augmenter la fréquence à laquelle un humain voit une cible
d'écriture avant qu'elle ne se produise. Toute présentation de ce correctif comme un contrôle
d'accès serait fausse.

**Neutralisation par `always` (RC1) — ce que C-13 dit, et ce que le code dit.** Une lecture
complète du chemin d'octroi, faite ici pour la première fois :

1. `shell.ts:284-289` — la demande `external_directory` porte `always: globs`, et
   `globs = Array.from(scan.dirs).map(dir => path.join(dir, "*"))` (`:280-283`, normalisé Windows).
2. `packages/opencode/src/permission/index.ts:304-310` — à la réponse `always` :
   ```ts
        for (const pattern of existing.info.always) {
          approved.push({
            permission: existing.info.permission,
            pattern,
            action: "allow",
          })
        }
   ```
3. `:234` `const rule = evaluate(request.permission, pattern, ruleset, approved)` ;
   `:241` `if (rule.action === "allow") continue`.
4. `packages/core/src/permission.ts:21-31` — `evaluate` =
   `rulesets.flat().findLast(rule => Wildcard.match(permission, rule.permission) &&
   Wildcard.match(pattern, rule.pattern))`.
5. `packages/core/src/util/wildcard.ts:3-13` — `match(input, pattern)` : c'est le **deuxième**
   argument qui porte les jokers (`pattern.replace(/\*/g, ".*")`).

De 1 à 5, la conclusion est nette : la règle poussée porte `permission:
existing.info.permission`, c'est-à-dire **la permission de la demande approuvée**, et `evaluate`
apparie `Wildcard.match(permission demandée, rule.permission)`. Pour la demande que P13 crée,
`rule.permission` vaut `"bash"` et `permission` vaut `"external_directory"` ; le motif `"bash"`
devient `^bash$` et ne matche pas `external_directory`. **L'octroi `always` de `bash` pour
`"python -c *"` ne neutralise donc pas la détection P13.** La clé `"python -c *"` (`shell.ts:421`
+ `arity.ts:135` + `arity.ts:5`) ne peut couvrir que des commandes `bash` — c'est-à-dire
exactement celles que l'utilisateur a déjà vues et approuvées une fois.

En revanche, la neutralisation existe, **par une ligne voisine** : `always: globs` de `:287`.
Puisque tout l'effet du correctif consiste à ajouter des répertoires à `scan.dirs`, la première
approbation « toujours » sur un répertoire y inscrit une règle
`{permission: "external_directory", pattern: "<dir>/*", action: "allow"}`, et plus aucune
commande de ce répertoire ne demandera quoi que ce soit. Deux différences avec la version
précédente de ce raisonnement, et elles sont importantes :

- la portée est **par répertoire**, pas globale : la détection reste active pour les autres
  répertoires, et tant que l'utilisateur n'a pas choisi « toujours » ;
- elle est **conditionnelle à un choix explicite de l'utilisateur**, sur une cible réelle
  qu'il vient de voir.

**Remède retenu — implementation dans le diff de §4, décision 1 du §9.** Ne pas exposer `always`
pour les motifs que le détecteur vient de produire — `always: globs.filter(g =>
!detectorGlobs.has(g))` — de sorte qu'une approbation reste `once`. Ce n'est plus une
proposition à valider : c'est le second hunk du diff de §4, avec le champ `scan.detected` qui en
est la contrepartie. Coût : l'utilisateur qui approuve `python -c` en boucle reçoit une invite
par occurrence au lieu d'une seule. Coût inverse si on ne le fait pas : la fenêtre d'observation
se referme définitivement, par répertoire, dès la première approbation. Deuxième borne, déjà
présente avant le correctif et inchangée : `guardEscalates` (`permission/index.ts:154-160`)
rend `false` sauf si `cfg?.jev?.guard.enabled === true`, donc par défaut il n'existe aucune
seconde opinion automatique après un `always`.

**Portée réelle, bornée par le code.** Trois familles de cibles ne demanderont rien, avant comme
après : (i) tout ce qui est sous `ctx.directory` ou `ctx.worktree` (`shell.ts:413`,
`instance-context.ts:19`/`:23`) ; (ii) tout ce qui est sous `Truncate.GLOB`, `%TEMP%\*` ou
`skillDirs\*` (`agent.ts:106-110` appliqués `:121`, et surcharge `Truncate.GLOB` en
`agent.ts:366-369`, §3.10) ; (iii) tout répertoire déjà couvert par un octroi `always`
(ci-dessus). Le gain du correctif se limite donc aux cibles **hors projet, hors worktree, hors
familles blanches, et non encore approuvées**.

**Faux positifs.** (i) `sed -n 'p' f` est traité comme écriture, `sed` étant dans `WRITE_UTILS`
sans discrimination de `-n` : borné, car la demande n'apparaît que si la cible est hors
`directory` **et** hors `worktree`. (ii) `tee f.txt` en relais pur (alimenté par une redirection
d'entrée) est traité comme écriture. (iii) Une charge inline peut contenir un jeton à la forme
`ident/chemin.ext` qui n'est pas un chemin ; borné par la branche `PATH_RELATIVE` et par le fait
que `argPath` doit résoudre. (iv) `dd`/`patch`/`install` ne sont **pas** couverts, donc aucune
faux positif ni aucune couverture ne leur est attribuée.

**Faux négatifs assumés.** (i) Chemin calculé au runtime (`$(mktemp -d)`, `${DIR}/x`, Python
`os.path.join`) : `dynamic()` (`:189-194`) signale inline sans extraire, donc **aucune** demande
— c'est le résidu le plus important et il est voulu. (ii) Binaire renommé, interpréteur
invoqué via `env`, charge dans une variable : rien à extraire. (iii) Formes `-o`/`--output`,
`install -m`, `perl -pi` : hors périmètre. (iv) `scout`, qui refuse `bash` d'emblée (§3.10) :
l'invite que P13 ajoute y est inatteignable en pratique.

**Régression sur les tests existants.** Périmètre réel, quatre fichiers vérifiés par `read` (une
absence ne peut pas être établie par glob, cf. la règle de tête de document) :
`test/tool/shell.test.ts`, `test/tool/shell-output-prompt.test.ts`,
`test/tool/shell-launch-retry.test.ts`, `test/shell/shell.test.ts`. **Les deux suites shell
coexistent** — fait consigné par `CORRECTIONS.md:54` (c) et `CORRECTIONS.md:51` ; et
`test/shell/shell.test.ts` est un fichier réel de 133 lignes, relu par `read` (`:1-12`).
Seul `test/tool/shell.test.ts` asserte le contenu des permissions demandées —
`describe("tool.shell permissions")` y commence à **`test/tool/shell.test.ts:215`**,
et le motif de harnais à copier est `:222-232` (`capture(requests)` puis
`expect(requests[0].permission).toBe("bash")`). `test/tool/shell-output-prompt.test.ts`,
`test/tool/shell-launch-retry.test.ts` et `test/shell/shell.test.ts` ne sont pas relus au-delà de
leur en-tête et sont rejoués tels quels. Deux autres blocs de `test/tool/shell.test.ts` étaient
cités par la version précédente (`describe("tool.shell")` et `describe("resolveTimeout")`) :
**je ne les ai pas relus**, ils sont donc hors du périmètre déclaré. Le critère de régression
n'est **pas** « la suite passe » : voir §7.

**Coût tokens / latence.** Latence : deux recherches dans une `Map`/`Set` par nœud de commande,
soit < 10 µs, négligeable devant le `parse` wasm déjà payé (`shell.ts:649`). Pour une commande
signalée seulement, s'ajoutent au plus ~8 itérations `argPath` + `fs.isDir`, soit 0,1–0,5 ms
chacune sur Windows ⇒ **≤ 4 ms**, et **≈ 0** pour toute commande non signalée — le chemin
majeur (`python script.py`, `cat`, `grep`, `bun test`) ne franchit pas la porte. Tokens modèle :
**delta = 0**. `ctx.ask` est appelé avec `metadata: {}` (`shell.ts:288` et `:297`, valeurs
relues) ; rien n'est injecté dans le contexte du modèle. Le seul coût est côté utilisateur : une
invite de plus, sur les seules commandes signalées dont la cible est hors projet, hors worktree
et hors familles blanches.

**Sécurité / injection.** `extractPathLiterals` ne fait que parcourir un texte déjà rendu par
tree-sitter ; aucune interpolation dans une commande n'est construite. Le seul risque serait de
former une requête à partir d'un chemin extrait — ce que le correctif ne fait pas (`argPath`
résout, `containsPath` compare). Le coût d'`isDir` sur un nom contrôlé par l'attaquant est un
`stat` sur un nom arbitraire, ce qui est déjà le comportement de `shell.ts:414`.

**Plateforme.** `bash -c` et `pwsh -Command` reçoivent déjà la commande complète
(`shell.ts:301-313`), donc la détection est multi-coquille sans changement de lancement. Seule
limite : `tee-object`/`out-file` n'existent que sous Windows et `sed -i` sous POSIX ; les tables
tolèrent les noms absents.

## 7. Tests

**Test unitaire à écrire : `packages/opencode/test/tool/shell-mutation-detect.test.ts`** — table
pure sur `detectWritePaths`, sans spawn ni I/O.

- `["python", "-c", "open('../secret','w')"]` → `inline: true`, `paths` contient `../secret`.
- `["python", "-c", "open('notes.txt','w')"]` → `inline: true`, `paths` contient `notes.txt`.
- `["python", "-c", "open('C:\\\\Users\\\\x\\\\a.json','w')"]` → `paths` contient `C:\Users\x\a.json`.
- `["node", "-e", "fs.writeFileSync('a/b.json',1)"]` → `inline: true`, `paths` contient `a/b.json`.
- `["python", "script.py"]` → `{ inline: false, paths: [] }` — **non-régression critique**.
- `["python", "-m", "pytest", "tests/"]` → `{ inline: false, paths: [] }`.
- `["node", "server.js"]`, `["bun", "test"]`, `["bun", "run", "dev"]` → `{ inline: false, paths: [] }`.
- `["sed", "-i", "s/a/b/", "notes.txt"]` → `detectWritePaths` renvoie `{ inline: false, paths: [] }`
  (hors table `INLINE`) ; la cible `notes.txt` est extraite par `pathArgs`, ce que vérifie le
  test d'intégration, pas ce tableau.
- `["python", "-c", "open(`d`,'w')"]` (charge dynamique) → `inline: true`, `paths: []`.
- `["python", "-c", "f('w',1,'utf8')"]` → `paths: []` : `w`, `1`, `utf8` ne sont pas des littéraux.

Un onzième cas est ajouté par le remède RC1, à écrire dans le fichier d'intégration :
`cat <cible externe>` puis `python -c "open('<même cible externe>','w')"` → la **seconde** demande
expose `always: []`. Assertion en valeur de contenu, pas en booléen global.

**Test d'intégration à écrire : `packages/opencode/test/tool/shell-mutation-detect.integration.test.ts`**,
dans le style du harnais de `packages/opencode/test/tool/shell.test.ts:215` (`:222-232`). Une
cible **hors `directory` et hors `worktree`** est obligatoire : sinon `shell.ts:413` filtre tout
et le test passe à vide, sans rien prouver. Assertions : `python -c` vers une cible externe
produit un `ctx.ask` avec `permission: "external_directory"` ; `python script.py` n'en produit
aucun ; `tee <cible externe>` en produit un.

**Commande exacte, périmètre 1 — code neuf, vert exigible :**
```powershell
bun test test/tool/shell-mutation-detect.test.ts test/tool/shell-mutation-detect.integration.test.ts
```
(exécutée depuis `packages/opencode`.) Le chemin `test/tool/shell/shell.test.ts` que la version
précédente prescrivait **n'existe pas**, établi cette fois par **`read` direct** — la tentative de
lecture de ce chemin renvoie `File not found`, pas un résultat vide. Le chemin réel est
`test/shell/shell.test.ts`, relu par `read` (fichier non vide, 133 lignes).

**État de la baseline (C-24) — corrigé (`#1` et `#2`).** La phrase « la baseline de vague 4
n'existe pas » est **retirée** : elle reposait sur un glob sans résultat, c'est-à-dire sur une
preuve d'absence invalide (`P13-revalidation.md:142`). Le rapport
`C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md` **existe** et a été relu par le
revalidateur : 192 lignes, en-tête « Mesuré le 2026-10-03 », et sa **ligne 11** porte
`test/tool/shell.test.ts → exit 1, 63 pass, 32 fail, 1 errors, 95 tests, 127,13 s`
(`P13-revalidation.md:142`). Les chiffres de référence sont donc **63 / 32 / 1**. Les chiffres
`68 / 27 / 3` et « 26 échecs dans `tool.shell permissions` » que la version précédente
reconduisait sont **périmés** : ils viennent du validateur d'origine et `CORRECTIONS.md:50` (C-40)
les corrige en 63/32/1 et **28** échecs de permissions. Je ne les réemploie nulle part dans ce
document.

**La suite `test/tool/shell.test.ts` n'est pas une base de non-régression — elle est instable.**
Deux exécutions successives **sans aucune modification du dépôt** donnent **63 pass / 32 fail /
1 error** (127,13 s) puis **62 pass / 33 fail / 4 errors** (142,10 s) : `CORRECTIONS.md:54` (C-44).
Le total de tests et l'exit code concordent, mais `pass/fail/errors` varient d'une unité à trois.
`P13-revalidation.md:144` en tire la conséquence : un triplet `(pass, fail, errors)` construit sur
cette suite « peut échouer ou réussir au hasard ». **Substituer 63/32/1 ne rendrait pas le
critère falsifiable.** C'est pourquoi le volet B ci-dessous ne porte pas sur cette suite, et c'est
la raison pour laquelle la version précédente est retirée plutôt que recyclée.

**Commande exacte, périmètre 2 — non-régression, sur la seule base verte et stable :**
```powershell
bun test test/shell/shell.test.ts
```

**Critère de succès observable, en trois volets — et non « la suite passe ».**

- **Volet A, périmètre restreint et déclaré (code neuf) :** les deux fichiers `*.test.ts` de
  P13 sortent en **exit 0**, et les dix cas du tableau unitaire plus le cas RC1 passent. C'est
  ce volet qui prouve le correctif ; il est exigible parce qu'il ne porte que sur du code neuf
  et ne peut pas être battu par du rouge préexistant.
- **Volet B, non-régression sur base stable, critère = code de sortie :**
  `bun test test/shell/shell.test.ts` doit produire **`SHELL_TEST_EXIT=0`**, avec
  **12 pass / 0 fail / 12 tests**. Base opposable et citée : `CORRECTIONS.md:57` (C-47), qui
  mesure exactement cette suite à 12 pass / 0 fail / 26 `expect()` calls / 12 tests / 6,38 s. Le
  critère est **l'exit code**, pas un triplet : sur une suite verte, le triplet n'est pas une
  information supplémentaire, et il est ici réellement falsifiable — un non-zéro est une
  régression, et aucun bruit d'exécution ne peut produire un zéro sur une suite qui casse.
  **Il n'est pas substituable par 0 pass / 0 fail** : ce résultat signale un mauvais chemin de
  test, pas une suite verte. Contrôle de chemin exigé : `read` du fichier visé doit renvoyer des
  lignes avant toute exécution, comme pour `packages/opencode/test/config/plugin.test.ts`, où la
  lecture ne renvoie **aucune ligne** — chemin vide, pas suite verte.
- **Volet C, informative seulement — `test/tool/shell.test.ts` n'est pas une base.** La suite est
  exécutée **une fois avant** et **une fois après** pour tracer l'écart, et les journaux sont
  annexés en preuve. **Aucune** variation de ses chiffres n'est qualifiée de régression ni de
  succès, et son résultat ne conditionne pas l'acceptation. Le nombre d'exécutions nécessaire
  pour en tirer un intervalle de confiance est **hors périmètre de P13** (`CORRECTIONS.md:54`,
  « Action requise avant la vague 4 »).

**Contrôle de falsifiabilité du volet A — exigé, non facultatif.** Un test qui ne peut pas
échouer ne prouve rien. Avant d'accepter le volet A vert, l'implémenteur exécute un contrôle
négatif : neutraliser l'ajout `write.inline` dans l'expression de la porte du diff de §4, de sorte
que la porte retombe sur `FILES.has(cmd) || (shellKind === "cmd" && CMD_FILES.has(cmd))`.
Attendu : `test/tool/shell-mutation-detect.integration.test.ts` **échoue** sur l'assertion
« `python -c` vers une cible externe produit un `ctx.ask` `external_directory` », et les deux
autres assertions restent vertes. Si le fichier de test reste vert dans cette configuration, il
ne prouve rien : le volet A est rejeté et le test doit être renforcé. `INFERE:` ce contrôle est
**conçu ici**, il n'a **pas** été exécuté — je n'ai pas de shell dans cette révision ; il sera
exécuté par l'implémenteur sur le patch appliqué.

**Porte de compilation.** `bun typecheck` doit produire **`TYPECHECK_EXIT=0`**. Le seuil est
établi sur l'état courant par `CORRECTIONS.md:56` (C-46), qui mesure `TYPECHECK_EXIT=0` en 16 s
sur `bun` 1.4.2 dans `packages/opencode`. P13 ajoute un module et touche `shell.ts`, donc cette
porte est **à exécuter après patch**, pas à hériter.

## 8. Effort

`M` — un module pur d'environ 60 lignes (dont 10 dupliquées et 3 tables), une porte modifiée,
une chaîne ajoutée dans `shell.ts`, un champ ajouté au type `Scan` et un hunk de filtrage sur
`always`, deux fichiers de test ; pas de nouvelle dépendance, pas de nouvelle permission, pas de
changement de format de configuration.

## 9. Verdict self-assessment

`NEEDS_REVIEW`.

**Décision 1 — remède RC1 : ADOPTÉ, et inscrit dans le diff de §4.** Ce n'est plus une question
ouverte. Le second hunk de §4 ajoute `scan.detected` et filtre `always` par
`globs.filter((glob) => !detectorGlobs.has(glob))`. Motif : la fenêtre d'observation est l'unique
bien que ce correctif produit (§6), et la laisser se refermer dès la première approbation viderait
le correctif de son seul effet mesurable. Coût accepté, et écrit : une invite par occurrence pour
un utilisateur qui approuve `python -c` en boucle, plus deux sites à tenir à jour dans
`shell.ts` (le `Scan` et le hunk `always`).

**Décision 2 — l'ajout de `"-filepath"` à `FLAGS` (`shell.ts:78`) : à contrôler explicitement.**
Strictement additif et nécessaire à la promesse faite sur `tee-object` par RC6, mais c'est la
seule modification d'une table existante. Le revalidateur l'a acceptée (`#6`, `✅`), réserve
assumée comprise ; je maintiens le point de contrôle.

**Ce que la revalidation vague 4 a tranché et que je reprends sans réserve.** C-13 est `refused`
en tant qu'objection et son défaut ré-affecté sur `shell.ts:287` (`P13-revalidation.md:146`) ;
C-12 est `accepted` quant au fond, la duplication `dynamic`/`prefix` étant assumée et tracée
(`:147`) ; C-14 est `accepted` (`:148`). Les trois objections de fond de la vague 2 restent
couvertes par les lectures du §2 et du §3.

**Point de doctrine à consigner, sans rapport avec ce correctif** : `agent.ts:356-370` réécrit une
règle que `agent.ts:119-121` déclare, et rien ne relie les deux textes (§3.10). Tant que ce
couplage reste implicite, toute politique de permission écrite en deux endroits doit être
considérée comme non testée. Hors périmètre de P13, et signalé comme tel par le revalidateur
(`:148`).

## Residus

Ce qui reste `open` après la présente révision, avec pour chacun soit la mesure qui l'établit,
soit la raison de son maintien. Aucun de ces résidus ne concerne le diff lui-même ; tous
concernent la preuve ou le périmètre.

| # | résidu | statut | mesure qui l'établit, ou raison du maintien |
|---|---|---|---|
| R1 | **Instabilité de `test/tool/shell.test.ts`** : 63/32/1 puis 62/33/4 sur l'arbre non modifié ; origine probable `RepeatedCallError: Repeated call blocked: 'bash' has already been called with these exact arguments in this session`, donc un état partagé entre tests | `open` | `CORRECTIONS.md:54` (C-44). **Raison du maintien** : P13 ne la corrige pas et ne peut pas la corriger — c'est une suite partagée. Conséquence assumée : cette suite n'est plus une base opposable, donc le volet B (§7) porte sur `test/shell/shell.test.ts` et le volet C est purement informatif. |
| R2 | **Écart de comptage sur `wave4-baseline.md`** : 192 lignes selon `P13-revalidation.md:142`, 135 lignes et 10 suites selon `CORRECTIONS.md:51` | `open` | Les deux sources du harnais divergent et je n'ai pas de shell pour trancher. **Mesure de vérification** : `read` de `C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md` sur les lignes 1-11 et comptage. **Pourquoi cela ne bloque pas** : aucun critère de cette proposition ne dépend du nombre de lignes — seuls `:11` et les chiffres 63/32/1 sont utilisés, et les deux sources concordent sur eux. |
| R3 | **Contrôle négatif du volet A non exécuté** | `open` | Le contrôle est spécifié en §7 mais **n'a pas été joué** : je n'ai pas de shell dans cette révision, et il suppose le patch appliqué. **Vérification** : neutraliser `write.inline` dans la porte, relancer la commande du volet A, constater un exit non nul sur l'assertion `external_directory`. Tant qu'il n'est pas joué, le volet A est « conçu », pas « prouvé ». |
| R4 | **`TYPECHECK_EXIT=0` non exécuté après patch** | `open` | Seuil établi par `CORRECTIONS.md:56` sur l'état **courant** ; P13 ajoute un module et un champ de type, donc le résultat d'après patch n'est pas connu. **Vérification** : `bun typecheck` dans `packages/opencode` après application. |
| R5 | **Doublage `dynamic`/`prefix`** : deux sites à tenir à jour, dérive silencieuse possible si `shell.ts:189-194` ou `:196-201` évoluent | `accepted` (réserve assumée) | `P13-revalidation.md:147` (`#6`, `✅`) et `:55`. **Raison du maintien en registre `open`** : le mécanisme de traçabilité annoncé est un commentaire (« Source à garder à jour »), qui n'échoue pas à la compilation. Détection proposée : un test qui compare le comportement de la copie à celui de l'original sur un corpus de chaînes. |
| R6 | **Couplage `agent.ts:356-370` ↔ `agent.ts:119-121`** : deux textes décrivant la même politique sans lien déclaré | `open` (hors périmètre) | `P13-revalidation.md:148` (`#7`, `✅` quant au fond) : « le couplage reste implicite et non testé ». **Raison du maintien** : hors périmètre de P13 ; aucun élément du diff ne le touche. |
| R7 | **Comportement sous `scout` non mesuré** : l'inférence « `python -c` y est refusée d'emblée » est dérivée de `merge` + `findLast`, non d'une exécution | `open` | `INFERE:` en §3.10, vérification proposée en §3.10 (test comparant `bash` sous `scout` et sous `explore`). **Raison du maintien** : le raisonnement repose sur trois lectures citées (`agent.ts:117`, `:231`, `packages/core/src/permission.ts:25`/`:33-35`) mais n'a pas d'exécution derrière lui ; je le marque donc comme inférence et non comme fait. |
| R8 | **Faux positifs `sed -n` et `tee` en relais pur** | `accepted` (assumé) | §6 « Faux positifs ». **Raison du maintien** : bornés par le filtre `shell.ts:413` + `instance-context.ts:19`/`:23` — ils ne produisent une demande que sur une cible hors `directory` **et** hors `worktree`. **Vérification possible** : un test d'intégration par cas, non écrit à ce jour. |
## Révision post-audit (vague 20)

### R2 — `open` → `corrige` (mesure tranchée)

La mesure demandée a été exécutée : `wave4-baseline.md` compte 192 lignes, pas 135. L'écart de comptage du résidu R2 (`:842`) est donc résolu en faveur de `P13-revalidation.md:142` (192) contre `CORRECTIONS.md:51` (135). Les deux sources ne divergent plus : R2 est fermé.

### R1 — `open`, mesure actualisée

`test/tool/shell.test.ts` mesure 76 pass / 19 fail / 1 error (Ran 95 tests, 93,50 s) sur l'arbre non modifié. La série d'instabilité est donc 63/32/1, puis 62/33/4, puis 76/19/1 : la non-reproductibilité est confirmée. R1 reste `open` et hors du périmètre de P13.

### R4 — `open`, condition non remplie

Le seuil `TYPECHECK_EXIT=0` est établi sur l'état courant ; le patch de P13 n'étant pas appliqué, le résultat d'après patch n'est pas connu. R4 reste `open`. R3, R5 à R8 sont inchangés.