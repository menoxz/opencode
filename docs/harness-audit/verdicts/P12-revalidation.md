Statut : REVALIDATED-FAIL

# P12 — Résolution des cibles de redirection shell — revalidation après reprise complète

Revalidateur indépendant : n'a rédigé ni `P12-redirection-path.md`, ni `P12-verdict.md`, ni la
reprise. Aucun fichier sous `packages/**` modifié ; aucun commit ; aucune commande `git`.
Méthode : `read` par tranches sur l'arbre réel, plus **deux mesures par exécution** rendues
possibles parce que le shell est désormais autorisé — ce que le validateur précédent ne pouvait
pas faire.

## Proposal

`P12` — Résolution des cibles de redirection shell.
Document relu : `docs/harness-audit/proposals/P12-redirection-path.md` (**667** lignes).
Verdict d'origine : `docs/harness-audit/verdicts/P12-verdict.md` (**232** lignes, `PASS_WITH_CHANGES`,
7 objections dont 2 bloquantes, 5 Required changes).
Corrections lues : **C-04** (`CORRECTIONS.md:14`), **C-29** (`:39`), **C-30** (`:40`), **C-31** (`:41`),
**C-48** (`:58`).

La reprise est substantiellement différente de la version antérieure : elle ajoute `§4.1`
(choix d'un prédicat d'opérande à deux filtres), `§7.2` (retrait motivé du cas 2), `§7.5`
(méthode de test T1→T5 exécutable) et `§10` (arbitrage A-3 et garantie `collect()`).

## Revisions applied

Chaque Required change du verdict d'origine, point par point, avec la preuve du traitement.

### Required change 1 — fixer structurellement le nœud d'opérande, remplacer « tous les enfants nommés »

**Traité quant à la forme, faux quant au fond.** `§4.1` (`:229-268`) introduit bien un prédicat
explicite à deux filtres, `REDIRECT_OPERATORS` + `isRedirectOperator`, et §4.1:273-274 énonce la
propriété **P1** (« aucun jeton d'opérateur ne peut atteindre `argPath`, que l'opérateur soit nommé ou
anonyme »). Le commentaire obsolète disparaît : le commentaire et le code ne se contredisent plus.

Mais j'ai exécuté le dump que `§7.3` prescrit. La structure réelle est **inverse** de ce que P1
suppose. Bash (`tree-sitter-bash`) :

```
program
  redirected_statement
    command "echo x"
      command_name "echo"
      word "x"
    file_redirect "> f"          <-- type = file_redirect, PAS "redirection"
      >            named=false   <-- opérateur ANONYME
      word "f"      named=true    <-- unique enfant nommé
```

PowerShell (`tree-sitter-powershell`) :

```
program
  statement_list
    pipeline
      pipeline_chain
        command "echo x > f"
          command_name "echo"
          command_elements
            generic_token "x"
            redirection "> f"                              <-- type = redirection, PAS "file_redirect"
              file_redirection_operator ">"   named=true   <-- opérateur NOMME
                >                            named=false
              redirected_file_name " f"      named=true
                command_argument_sep " "
                generic_token "f"            named=true
```

Deux conséquences, chacune un `open` détaillé en `## Remaining objections` :

- **`file_redirect` n'est pas dans `REDIRECT_TYPES`** (`:311` = `["redirection", "file_redirect"]`).
  Bash est donc **hors couverture** de la branche `§4.2` ; PowerShell seul est couvert. C'est
  l'inverse exact de l Affectation de `P12:309-310` (« `"redirection"` est établi par shell.ts:114
  (bash) ; `"file_redirect"` est le candidat PowerShell, non vérifié »).
- **Sous PowerShell l'opérateur est un enfant nommé** (`file_redirection_operator`, `named=true`).
  C'est exactement la branche que P1 déclare « sans réponse » et agnostique, et le filtre textuel
  est donc **nécessaire**, pas décoratif : sans lui, `">"` deviendrait bien
  `path.resolve(cwd, ">")` par `shell.ts:383/384/387`.

### Required change 2 — conditionner ou retirer le cas 2

**Traité, et le retrait est justifié — mais pas pour la raison donnée.** `§7.2` (`:458-490`) retire
le cas et le consigne comme `INFERE` non couvert. C'est le bon geste méthodologique. Mais
l'argument donné — « le grammar est inaccessible en lecture (Evidence g) : ni `node-types.json`, ni
`grammar.js`, ni `.wasm` ne sont présents dans l'arbre de travail » (`:473-474`) — est **faux**, et je
le démontre en §Status. Le retrait reste juste ; sa justification doit être réécrite.

### Required change 3 — aligner l'assertion du cas 4 sur ce qu'il prouve

**Traité.** `§7.1:452-456` réduit explicitement le libellé à ce que l'assertion prouve et rappelle
que `scan.dirs` ne reçoit que le `dirname` (`shell.ts:415`), donc que la sémantique ajout/écrasement
« n'est pas une propriété de la couche permission ». Le libellé de `:445` est désormais « redirection
vers chemin externe, `>>` », sans « ajout, non écrasement ». Accepté.

### Required change 4 — corriger `P12:116-118` (ne pas contredire C-13)

**Traité.** `§3` `:180-186` énonce que le fait décisif n'est pas le motif générique `bash *` mais
`scan.dirs` vide, et cite `shell.ts:421` → `permission/arity.ts:135` → `permission/index.ts:304-310`,
court-circuitée par `permission/index.ts:241`. `shell.ts:419-421` vérifié :
`if (tokens.length && (!cmd || !CWD.has(cmd))) { scan.patterns.add(source(node)); scan.always.add(BashArity.prefix(tokens).join(" ") + " *") }`.
`scan.dirs` reste vide pour `echo x > /tmp/f` parce que `echo` ∉ `FILES` (`shell.ts:42-63`, vérifié :
`touch` à `:48`, `cat` à `:51`, aucun `echo`), donc la boucle `shell.ts:410` n'est pas exécutée.
Et `shell.ts:278-287` vérifié : `ask` n'émet que `if (scan.dirs.size > 0)`. Le diagnostic de `§3`
est exact. Accepté.

### Required change 5 — préciser les deux citations de test

**Traité et vérifié.** `shell.test.ts:146` = `const each = (` ✔ (`:148` = signature `fn`) ;
`shell.test.ts:1110` = `` command: `echo stdout_msg && echo stderr_msg >&2` `` ✔ ;
`package.json:10` = `"test": "bun test --timeout 30000",` ✔ ; `shell.test.ts:81/86/101` = `bash` /
`shells` / `ps` ✔ ; `shell.test.ts:215` = `describe("tool.shell permissions", () => {` ✔ ;
`shell.test.ts:155-162` = `capture` avec `requests.push(req)` pour **toute** permission ✔ ;
`shell.test.ts:989` / `:1005` ✔ (`expect(bashReq!.patterns).toContain("echo test > output.txt")`).
Aucune citation conservée n'est fausse. Vérifié aussi : `shell.ts:7` importe `containsPath` de
`../project/instance-context` ; `shell.ts:10` = `import { Language, type Node } from "web-tree-sitter"` ;
`shell.ts:203`/`:210` = `pathArgs` ✔ ; `shell.ts:323-348` charge bien
`tree-sitter-bash/tree-sitter-bash.wasm` (`:334`) et `tree-sitter-powershell/tree-sitter-powershell.wasm` (`:337`) ;
`registry.ts:248` = `def.execute(args as any, pluginCtx)` ✔, `:253` = `truncate.output` ✔,
`:256` = `output: out.truncated ? out.content : output,` ✔ — **C-04 faux sur le libellé, C-29 exact**.

## Status

`REVALIDATED-FAIL`.

Deux mesures d'exécution. Toutes deux contredisent des affirmations de la reprise.

**M1 — Le dump AST de `§7.3` a été exécuté. Sortie 0.**

| étape | commande | résultat |
|---|---|---|
| sonde | `bun run probe.ts …\dump.txt` depuis `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p12-probe` | `PROBE_EXIT=0`, `DUMP_LINES=363` |
| artefact | `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p12-probe\dump.txt` | 11 formes × 2 grammaires, arbre complet |

La sonde charge les **mêmes** `.wasm** que `shell.ts:334`/`:337` (résolution par chemin absolu vers
`packages/opencode/node_modules`, contournant un bug de junction constaté, sans modifier le dépôt).

**M2 — L'obstacle « externe » de R1/R2 a disparu.** `Get-ChildItem -Recurse -Filter *.wasm` sur
`packages` → **4** résultats, dont deux en `node_modules` :

- `packages/opencode/node_modules/tree-sitter-bash/tree-sitter-bash.wasm` ✔
- `packages/opencode/node_modules/tree-sitter-powershell/tree-sitter-powershell.wasm` ✔
- (+ deux copies build dans `packages/desktop/out/main/chunks/`)

`P12:123-125` (« `glob **/*.wasm` → aucun résultat » ; « hors de l'arbre de travail lisible ») est
**faux**. De plus, `node_modules/tree-sitter-bash/` contient **`grammar.js`** et
**`tree-sitter.json`** — la source de grammaire complète, lisible en clair. `P12:473-474`
(« ni `node-types.json`, ni `grammar.js`, ni `.wasm` ne sont présents ») est **faux sur les trois
termes**. `node-types.json` reste effectivement absent (0 résultat, indiscutable), mais il n'était pas
nécessaire.

**M3 — Décompte grep rejoué.** `packages/**/*.ts` hors `node_modules`, **1938** fichiers,
`Select-String "file_redirect|redirection|redirected_statement|file_descriptor|redirect"` :
**136 lignes** / **155 occurrences**. Les deux valeurs annoncées (107 / « 2 ») tombent juste pour le
sous-ensemble décisif :

| prédicat | annoncé | mesuré |
|---|---|---|
| lignes de `packages/**/*.ts` contenant la regex | 107 | **136** |
| occurrences totales | non annoncé | **155** |
| lignes nommant un **type AST** (`"redirection"` / `"redirected_statement"` entre guillemets) | 2 | **2** ✔ |
| └ `shell.ts:114` | ✔ | `if (!item \|\| item.type === "command_argument_sep" \|\| item.type === "redirection") continue` ✔ |
| └ `shell.ts:135` | ✔ | `return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()` ✔ |
| `file_redirect` | 0 | **0** ✔ |

`MATCH_LINES=136` est un fait. Les 29 lignes d'écart sont des hits hors sujet (`redirect_uri`,
redirections HTTP, prose), ce qui explique la valeur arrondie de 107 — probablement un counting
distinct. **Le prédicat qui décide de l'objection 2 est exact** : aucun autre fichier source ne nomme
un type de redirection. Voir O2 : `refused`.

**M4 — Suite de base, et conflit avec C-47.** `bun test --timeout 30000 test/tool/shell.test.ts`
depuis `packages/opencode` → **`SHELLTEST_EXIT=1`, `72 pass`, `23 fail`, `Ran 95 tests`** en 127 s.
L'état de mesure fourni en consigne « 12 pass / 0 fail, exit 0 — **C-47** » **ne se reproduit pas** sur
`test/tool/shell.test.ts`. Je n'ai pas cherché à réconcilier : aucun test n'a été ajouté ni modifié, la
suite est celle du dépôt telle quelle, et l'écart concerne le harness d'environnement (shells
`pwsh`/`powershell`/`cmd` réels, `it.live`, un test à 30001 ms). **Conséquence directe et bloquante
pour l'implémentation** : le §Risques de la reprise exige « **aucun** test préexistant passant de vert
à rouge » comme critère de succès de T5 (§7.5:569-572). Avec 23 rouges préexistants, ce critère est
**invérifiable en l'état** et `REVALIDATED-PASS_WITH_CHANGES` est structurellement interdit par la
règle 1 du gabarit (« un test déjà rouge qui casse davantage reste un `open` »).

**M5 — Garantie `collect()`, antériorité vérifiée ligne à ligne.** Pas par assertion : par les sites
d'appel, exhaustifs (`Select-String` sur `shell.ts`, un seul site chacun).

```
649:  const tree = yield* Effect.acquireRelease(parse(params.command, ps), …)
652:  const scan = yield* collect(tree.rootNode, cwd, ps, shell, instanceCtx)   <-- UN SEUL site
653:  if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)
654:  yield* ask(ctx, scan)
658:  return yield* run( { shell, command, cwd, env, timeout, description }, ctx, … )   <-- UN SEUL site
498:  const handle = yield* retryTransientLaunch(spawner.spawn(cmd(…)))   <-- à l'intérieur de run
```

- `collect(` : **1** occurrence hors déclaration (`:652`). Une seule fois par `execute`. ✔
- `ask(ctx, scan)` en `:654`, **après** `:652`. ✔
- `run(` : **1** seul site d'appel (`:658`), **après** `:652` et `:654`. ✔
- `retryTransientLaunch` en `:498`, à l'intérieur du `Effect.scoped(Effect.gen(…))` de `run`, donc
  **en aval** du scan : chaque tentative de relance est couverte parce que le scan **précède** toutes
  les tentatives, non parce qu'il est répété. ✔
- `scan.dirs` est alimenté, dans le code, uniquement en `shell.ts:415` et `:653`. OK

**La garantie est structurelle et je la confirme.** C'est le point que l'arbitrage A-3 demandait de
vérifier, et il tient sans dépendre de T6. T6 (`:631-640`) est de toute façon correctement spécifié
pour l'exiger : assertion 1 `starts.count >= LAUNCH_BUDGET` est cohérente avec
`shell-launch-retry.test.ts:103` = `expect(starts.count).toBeGreaterThanOrEqual(LAUNCH_BUDGET)` ✔
(lu) ; assertion 2 (requête capturée avant que `starts` n'atteigne 1) est bien celle qui porte la
garantie, comme `§10:638-640` l'affirme. **Confirmé**, avec une réserve de forme : rien dans `§10`
n'impose que `external_directory` soit la **première** requête capturée ; si `bash` passe d'abord,
`scan.patterns` (`shell.ts:420`) la précède. L'assertion 3 (« exactement **une** requête
`external_directory` ») est correcte et non contradictoire.

**M6 — Requalification de `shell.ts:413` (C-48).** C'est la bonne correction, pas une façade.
`shell.ts:413` = `if (!resolved || containsPath(resolved, instance)) continue`, avec
`containsPath` importé de `../project/instance-context` (`shell.ts:7`) : c'est bien un **filtre
d'espace de travail** au sens fort — il décide « la cible est-elle dans le workspace ? », et `continue`
saute l'ajout à `scan.dirs`. `§4.1:220-225` dit exactement cela et **retire explicitement la
confiance** : après le correctif, `:413` reste « un court-circuit d'optimisation et de politique
d'espace de travail », et « la neutralisation de l'opérateur est produite par `isRedirectOperator`
seul ». **T4 est le test qui rend cette distinction observable** et il est correctement dimensionné
(cwd hors workspace → `containsPath(cwd, instance)` faux → `:653` ajoute `cwd` ; le chemin bidon
`path.resolve(cwd, ">")` serait alors demandeur si le prédicat manquait). Alternative **A6** (`:373-379`)
formule le scénario exactement. **Confirmé** — avec la réserve que le libellé « le chemin bidon
deviendrait alors demandeur » dépend de `cwd` lui-même externe, ce que T4 fournit bien.

## Remaining objections

Statut en tête de chaque ligne, conformément à la règle d'implémentabilité du gabarit.

- **`open` — O1a — `file_redirect` est le type de bash, pas de PowerShell ; il manque à `REDIRECT_TYPES`.**
  `P12:311` = `const REDIRECT_TYPES = ["redirection", "file_redirect"]`, et `P12:309-310` attribue
  `"redirection"` à bash et `"file_redirect"` à PowerShell. Le dump **inverse** : bash produit
  `file_redirect`, PowerShell produit `redirection`. Conséquence : la branche `§4.2` ne voit **aucune**
  redirection bash, et `echo x > /tmp/f` sous bash — le scénario même de `§1` et de `§3` — reste
  non couvert après implémentation. Le correctif ne fermerait pas le contournement qu'il vise, sur la
  grammaire principale du produit. `P12:309-310` doit être inversé et `REDIRECT_TYPES` corrigé.
  *Preuve : `dump.txt`, section `=== bash :: "echo x > f"` → `file_redirect "> f"` ; section
  `=== powershell :: "echo x > f"` → `redirection "> f"`. Croisé avec `shell.ts:114` qui ne cite
  `"redirection"` que pour écarter un type PowerShell, alors que la ligne est dans `parts()` et donc
  commune aux deux grammaires.*

- **`open` — O1b — `isRedirectOperator` contredit la grammaire bash sur les formes à descripteur.**
  `:242-249` : `if (/^[0-9]+[<>]/.test(text)) return true`, et `:235-238` liste `"2>&"`.
  Sur `echo x 2>&1` l'arbre bash est
  `file_redirect("2>&1") → [file_descriptor "2" (named), >& (anonymous), number "1" (named)]`.
  Le second filtre de type laisserait passer `file_descriptor "2"` (type ≠ `number`), puis
  `isRedirectOperator("2")` renvoie `true` **à tort** et l'écarte ; `number "1"` est écarté par le
  type. Le doublet `2>&1` disparaît donc par un chemin **non voulu** — alors que `§7.1:446` exige
  « aucune requête », obtenu ici par la mauvaise raison. Pire : `echo x 2>file` produit
  `file_redirect("> file")` et `cmd` vaut `"echo 2"` ; `FILES.has("echo 2")` est faux, donc
  l'opérande `file` n'est pas collecté, et la redirection sortante vers un chemin externe n'est pas
  vue. L'inverse est vrai pour `echo x 2 > file`, qui donne `command("echo x 2")` + `number "2"` puis
  `file_redirect("> file")` : le descripteur `2` est cette fois un `number`, et `/^[0-9]+[<>]/` ne
  matche pas `"2"` (pas de `<`/`>`), le type non plus → `"2"` atteint `argPath` →
  `path.resolve(cwd, "2")`. **La bascule `>` / `2>` produit un chemin bidon pour le descripteur
  largué par la grammaire.** `§6:412-413` pose la question (« `2 > file` avec une espace insérée … à
  vérifier par le dump T1 ») ; le dump y répond, et la réponse est un défaut, pas une incertitude.

- **`open` — O1c — l'affirmation d'inaccessibilité de la grammaire est fausse ; R1/R2 ne sont plus des
  résidus à obstacle externe.** `:123-125` (« `glob **/*.wasm` → aucun résultat », « hors de l'arbre
  de travail lisible ») et `:473-474` (« ni `node-types.json`, ni `grammar.js`, ni `.wasm` »).
  Mesuré : **4** `.wasm` dans `packages`, dont 2 dans `node_modules` ; `grammar.js` et
  `tree-sitter.json` présents et lisibles dans `node_modules/tree-sitter-bash/`. Le shell étant
  autorisé, l'obstacle a disparu et le dump est **produit ci-dessus**. `P12:666-667` (« aucune de ses
  prédictions n'a été exécutée (shell EPERM) », « sa conformité sera établie … par T1 à T6 ») décrit un
  état de fait caduc pour tout ce qui est structurel. **Ce qui reste réellement hors d'atteinte** :
  rien de structurel. Les deux seules choses que je n'ai pas mesurées sont (i) le comportement runtime
  réel de `collect()` après patch — le correctif n'existe pas, il n'y a rien à exécuter — et (ii) le
  comportement multi-plateforme de `resolvePath` (`shell.ts:370-379`), qui dépend de `cygpath`. Tout le
  reste est atteint.

- **`open` — O1d — T1 est surdimensionné et T3 est impossible tant que R1 reste ouvert.** `§7.5:520-530`
  fait de T1 le « **préalable** » au figeage de `REDIRECT_TYPES` **et** de `REDIRECT_OPERAND_TYPES`.
  Or les deux valeurs sont maintenant connues par exécution (O1a et R1). T1, tel qu'écrit, exige un
  fichier `shell-redirect-ast.test.ts` séparé sous `packages/opencode/test/tool/` qui « échoue
  bruyamment » tant que les listes ne sont pas figées : c'est un test qui échoue sur son propre
  scaffolding, donc non livrable en l'état. Pire, **T3 (`:543-548`) est logiquement circulaire** : il
  exige que la réversion à « tous les enfants nommés » fasse **échouer T2**. Or sous bash — seule
  grammaire où le type du nœud était supposé absent de `REDIRECT_TYPES` — l'opérateur est ** anonyme**,
  donc la forme « tous les enfants nommés » produit **exactement le même résultat** que le prédicat. Sous
  PowerShell au contraire l'opérateur est nommé et la mutation échouerait bien. T3 doit donc être
  commenté sur PowerShell **exclusivement**, ou T3 ne prouve rien de ce qu'il annonce.

- **`open` — O1e — le cas `§7.1:446` « descripteur de handle `echo x 2>&1` → aucune requête » est faux
  sous bash, et dangereux.** L'arbre bash de `2>&1` place `file_descriptor "2"` dans
  `file_redirect`. `parts()` (`shell.ts:106-132`) ne l'écarte que pour `item.type ===
  "command_argument_sep"` ou `"redirection"` (`shell.ts:114`) : sous bash le type est `file_redirect`,
  le nœud **passe**, et `parts` rend `{ type: "file_redirect", text: "2>&1" }`. `cmd` devient `"2>&1"`,
  `FILES.has("2>&1")` est faux, donc la branche `§4.2` l'ignore et aucune requête n'est émise — le test
  passe. **Mais `scan.patterns.add(source(node))` (`:420`) voit désormais la commande**
  `"echo x 2>&1"` comme un motif bash distinct de `"echo x"`, et le `always` de `:421` devient
  `"2>&1 *"`. La politique de permission de toute commande contenant `2>&1` change. Si `REDIRECT_TYPES`
  est corrigé pour couvrir `file_redirect` (O1a) sans exclure les nœuds sans opérande de fichier,
  `redirectTargets(file_redirect)` rend `["2"]` (le `file_descriptor`), `argPath("2")` →
  `path.resolve(cwd, "2")` → `scan.dirs` contient le cwd → **une requête `external_directory`
  apparaît** et le test casse. Le cas tel qu'il est écrit est donc **faux** : il compte sur le fait
  que bash est hors couverture. Il faut un filtre « ne traiter que les redirections dont un opérande de
  fichier est présent », et un cas `2>&1` sous PowerShell en complément.

- **`open` — O1f — le test T2 est inexécutable avec l'interface créée.** `:532-541` : « un `describe`
  qui appelle `redirectTargets` … Assertion, pour **chaque** chaîne retournée : `isRedirectOperator(chunk)
  === false` ». `isRedirectOperator` (`:242`) n'est **pas** exporté — seuls `redirectTargets` (`:258`)
  et les deux constantes (`:235`, `:254`) le sont. T2 exige donc un second export du module
(`export function isRedirectOperator`), et il s'ajoute à celui déjà prévu de `redirectTargets`
  (`:258`). Or `:280-284` justifie cet export par « il n'y a **un seul site** d'appel ». La règle que la
  reprise s'est donnée pour éviter **C-12** (verdict `:150-152` : « un patch qui ne compile pas n'est
  pas une proposition ») est violée par la méthode de test qu'elle propose.

- **`open` — O1g — `REDIRECT_OPERAND_TYPES` n'est pas fail-closed : il est fail-OUVERT, et c'est le
  mécanisme même que `§4.1:275-278` présente comme une garantie (P3).** `:263` :
  `if (REDIRECT_OPERAND_TYPES.size > 0 && !REDIRECT_OPERAND_TYPES.has(child.type)) continue`.
  Une liste **vide** désactive le filtre de type et laisse passer **tout** enfant nommé. Le commentaire
  `:251-253` affirme l'inverse — « une liste blanche vide fait échouer T1 bruyamment plutôt que de
  désactiver silencieusement la détection ». C'est faux : avec la liste vide, `redirectTargets` se
  comporte **exactement comme la forme mutée de T3** (« tous les enfants nommés »), donc elle laisse
  passer l'opérateur sous PowerShell. La `P1` de `:273-274` n'est donc garantie **que** par le filtre
  textuel, et uniquement parce que ce filtre-là est total — ce qui est le bon choix, mais l'argument
  « fail-closed » du §11 et de `:251-253` doit être retiré, ou l'opérateur doit être un cas special
  traité avant le filtre de type.

- **`refused` — O2 — le cas 2 retiré : retrait juste, preuve de décompte fausse sur le décompte.** Le
  critère décisif — « aucun autre fichier source ne nomme un type de redirection » — est **exact** :
  `AST_TYPE_LINES=2`, `shell.ts:114` et `shell.ts:135`, `file_redirect` : **0**. Mais deux valeurs
  annoncées sont fausses : `glob **/*.wasm` → 0 résultat (**mesuré : 4**), et « 107 occurrences »
  (**mesuré : 136 lignes / 155 occurrences**). L'objection **n'est pas** close par démonstration mais
  **close par retrait**, et la justification doit être réécrite sur le fait mesuré, pas sur une absence
  de structure. *Preuve : `MATCH_LINES=136`, `TOTAL_MATCHES=155`, `AST_TYPE_LINES=2`,
  `FILE_REDIRECT_LINES=0`, `WASM_IN_PACKAGES=4`.*

- **`accepted` — O3 / O4 / O5 (Required changes 3, 4, 5) — traitées au fond.** `:452-456` aligne le
  libellé du cas `>>` sur son assertion ; `:180-186` substitue `scan.dirs` vide au motif générique et
  nomme C-13 ; `:507-512` corrige les deux citations de test. Les trois vérifiées dans le code réel
  (voir `## Revisions applied`). Réserve assumée et tracée, aucune.

- **`accepted` — O6 — `shell.ts:413` requalifié en filtre d'espace de travail.** Confirmé par
  `shell.ts:413` + `shell.ts:7`. La confiance est explicitement retirée (`§4.1:220-225`) et T4 rend
  la différence observable. Réserve : T4 dépend de la faisabilité d'un `workdir` hors workspace dans le
  harnais, ce que je n'ai pas exécuté.

- **`accepted` — O7 — garantie `collect()` sur le chemin de chaque tentative.** Confirmée **par les
  sites d'appel**, pas par une assertion (voir M5). Les trois conditions que `§10:610-617` énonce sont
  toutes vraies dans le code actuel : `collect` une fois en `:652`, `ask` en `:654`, `run` en `:658`,
  `retryTransientLaunch` en `:498` donc en aval. Réserve de forme tracée en M5 sur l'ordre de capture
  dans T6. **Aucune obligation nouvelle pour P12.**

- **`accepted` — R1 — type du nœud d'opérande.** `REDIRECT_OPERAND_TYPES` est bien **volontairement
  vide** et la correction **n'en dépend pas** : le filtre textuel est total et suffit (§4.1 P1). La
  valeur est désormais **connue et ne dépend plus d'aucun obstacle** : bash → `word` ;
  PowerShell → `redirected_file_name` ; `>>` bash → `word` ; `>|` bash → `word`. Il n'y a donc plus de
« résiduel » mais une **donnée à inscrire dans le patch**. Statut `accepted` uniquement parce que la
  conception ne dépend pas d'elle ; **elle n'est plus un obstacle externe** (voir O1c).

- **`open` — R2 — type PowerShell : la propriété P1 est démontrée fausse.** `§4.1:273-274` et `§11:654-656`
  affirment que la correction est « agnostique » et que « si l'opérateur est un enfant nommé ou un
  token anonyme » le prédicat tient. Le dump établit que **sous PowerShell l'opérateur est un enfant
  nommé** (`file_redirection_operator`, `named=true`) et que **sous bash il est anonyme**. La question
  posée par l'objection 1 n'est donc pas « sans réponse » : elle a **deux réponses différentes selon la
  grammaire**, et le prédicat textuel est la seule forme qui couvre les deux. `REDIRECT_TYPES`
  (`:311`) nomme pourtant le mauvais type pour chaque grammaire (O1a). `REDIRECT_OPERAND_TYPES` devra
  contenir **deux** types, pas un. Tant que ce couple n'est pas figé sur la sortie réelle, le §11
  qualifie ce point de « seul point réellement ouvert » — c'est exact, et c'est ce qui empêche
  `REVALIDATED-PASS`.

- **`out_of_scope` — R3 — `Out-File` / `Tee-Object` par cmdlet.** Exclusion **réelle**, pas une
  commodité, et vérifiée à trois niveaux. (i) `Out-File` / `Tee-Object` ∉ `FILES` (`shell.ts:42-63`,
  lu intégralement : `rm cp mv mkdir touch chmod chown cat get-content set-content add-content
  copy-item move-item remove-item new-item rename-item` + `CWD`) et ∉ `CMD_FILES`
  (`shell.ts:64-77`) — l'absence est donc un trou d'allowlist, pas une interception manquée. (ii)
  Aucun nœud de redirection n'est produit : ce sont des cmdlets, l'écriture passe par un **argument**,
  que `parts()` conserve. Le dump le confirme par la structure de `powershell :: "echo x > f"` :
  les arguments vivent sous `command_elements` (`generic_token`), **distinct** de `redirection` — un
  `Out-File -Path x` produirait `generic_token`, jamais `file_redirect`. (iii) `§5:356-359` (A4) le pose
  correctement : ajouter `out-file`/`tee` à `FILES` « ne traite pas l'opérateur de redirection, donc ne
  ferme pas `echo x > /tmp/f` » — l'exclusion est **distinguée**, pas esquivée. Le test `§7.1:448`
  (« chevron dans une chaîne », `echo "a > b"` → dump bash : `command → string → string_content
  "a > b"`, jamais enfant d'une redirection) tient sous les deux grammaires. Hors périmètre,
  justification écrite, **implémentable**.

- **`open` — O8 — le critère de succès T5 est invérifiable sur l'état mesuré.** `§7.5:569-572` exige
  « codes de sortie 0 » et « **aucun** test préexistant passant de vert à rouge » pour
  `shell.test.ts`, `shell-launch-retry.test.ts`, `external-directory.test.ts`, `read.test.ts`,
  `agent.test.ts`. L'état mesuré est `72 pass / 23 fail`, `exit 1`. La règle 1 du gabarit est
  explicite : « un test déjà rouge qui casse davantage reste un `open` », et la règle 2 interdit de
  requalifier un résidu `open` en `accepted` pour débloquer. **Il faut une base de référence verte
  avant toute implémentation**, ou T5 doit être reformulé en « delta » (aucun test
  `fail` supplémentaire) avec la liste des 23 rouges de référence consignée en annexe.

## Regressions introduced

**Aucun code n'a été modifié.** Aucun fichier sous `packages/**` n'a été écrit, aucun commit, aucune
commande `git`. La proposition est un document ; elle n'introduit donc par elle-même aucune régression
de code.

**Déclaration explicte exigée par la règle 1 du gabarit** : je ne peux pas déclarer qu'aucun test
**vert** n'est cassé, parce que la suite de référence est **rouge** au moment de la mesure
(`72 pass / 23 fail`, `SHELLTEST_EXIT=1`, `Ran 95 tests across 1 file. [127.29s]`). Les 23 rouges sont
préexistants et sans rapport avec P12 — le correctif n'existe pas encore dans l'arbre — mais le fait
est mesuré et consigné (O8). Les tests rouges incluent
`tool.shell permissions > matches redirects in permission pattern [powershell]` et `[cmd]`, c'est-à-dire
**le test même que P12:385-387 et `§7.5:567-568` exigent vert** : ce test est déjà rouge pour deux
shells sur quatre, indépendamment de toute modification. La branche `§4.2` ne touche ni `source()`
(`shell.ts:134`) ni `scan.patterns` (`:420`), donc elle ne peut pas l'aggraver — mais elle ne peut pas
non plus être utilisée comme preuve de non-régression tant que la base est rouge.

**Conséquence d'lliberation : le §Risques (`:383-394`) n'est pas falsifié par ce que j'ai mesuré.**
Les deux tests cités (`shell.test.ts:989`/`:1005` et `:1110`) sont **textuellement intacts** et
l'affirmation « aucun test ne peut être rompu par l'ajout d'une requête `external_directory` liée à
une redirection » reste **vraie** : `:1005` n'assert que `patterns`, `:1110` n'assert que `output` et
`metadata.exit`. Le défaut que j'ai trouvé (O1b, O1e) ne vient pas de ces tests mais des formes
`2>&1` / `2>file` qu'aucun test existant ne couvre.

## Final verdict

REVALIDATED-FAIL

Neuf résidus `open` (O1a, O1b, O1c, O1d, O1e, O1f, O1g, O8, R2) subsistent. Un seul suffit à
interdire l'implémentation. `REVALIDATED-PASS_WITH_CHANGES` est **doublement** interdit : par la règle 1
du gabarit (résidu `open` unique = bloquant, et interdiction de requalifier pour débloquer) et par la
règle 2 (`REVALIDATED-FAIL` signale des Required changes **intacts**, ce qui est le cas : le
Required change 1 est traité dans sa forme et faux dans son fond).

Les 5 Required changes sont traités quant à la forme ; **la forme est correcte et l'approche est la
bonne**. Ce qui bloque est factuel et mesurable : la reprise fige `REDIRECT_TYPES` sur une hypothèse
de grammaire **inversée** par rapport au réel, et son garde-fou `fail-closed` est en réalité
Rien ici n'est un défaut de diagnostic — le diagnostic de P12 (`§1`, `§3`) est exact et j'en ai
re-vérifié chaque citation. Le correctif est à ~une vingtaine de lignes de distance d'être
implémentable : inverser `REDIRECT_TYPES` (`["file_redirect", "redirection"]`), inscrire deux types dans
`REDIRECT_OPERAND_TYPES` (`word`, `redirected_file_name`), exclure les nœuds sans opérande de fichier,
retirer le cas `2>&1` bash ou l'assumer, rendre T3 powerShell-only, et exporter `isRedirectOperator`
ou réécrire T2 sans lui.

## Grille d'effort — vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| O1a — inverser `REDIRECT_TYPES` sur la structure réelle (`file_redirect` = bash, `redirection` = PowerShell) | S — une constante | `packages/opencode/src/tool/shell.ts` (avec `REDIRECT_TYPES`) | aucun test propre ; couvert par T1 figé | aucun — aucun test existant n'atteint `scan.dirs` via une redirection |
| O1b — `isRedirectOperator` : distinguer redirection **avec** opérande de redirection **sans** opérande (`file_descriptor`) ; gérer `2>` vs `2 >` | M — refonte du prédicat + filtre « opérande de fichier présent » | `packages/opencode/src/tool/shell.ts` | `test/tool/shell.test.ts`, bloc `tool.shell redirection targets` : `echo x 2>&1`, `echo x 2>file`, `echo x 2 > file` sous bash et pwsh | **oui, à relire** : `shell.test.ts:1110` (`echo stdout_msg && echo stderr_msg >&2`) est le seul test existant qui traverse une redirection ; `shell.test.ts:989`/`:1005` doit rester vert (`patterns` inchangé) |
| O1c — réécrire les Evidence g/g' et `§7.2` sur les faits mesurés (4 `.wasm`, `grammar.js` présent, 136/155 lignes) | S — documentation | `docs/harness-audit/proposals/P12-redirection-path.md` | aucun | aucun |
| O1d — T1 : remplacer le test qui échoue sur son scaffolding par un test de **constantes** ; T3 : restreindre la mutation à PowerShell | M — réécriture de `§7.5` | `docs/harness-audit/proposals/P12-redirection-path.md` + `packages/opencode/test/tool/shell-redirect-ast.test.ts` (nouveau) | aucun existant ; `shell-redirect-ast.test.ts` est à créer | aucun |
| O1e — corriger le cas `§7.1:446` : `2>&1` bash n'est pas « aucune requête » par le chemin prévu ; ajouter le cas PowerShell | S — une ligne de matrice + un filtre | `packages/opencode/src/tool/shell.ts` + `shell.test.ts` | `test/tool/shell.test.ts`, bloc `tool.shell redirection targets` | **oui, à relire** : `shell.test.ts:1110` (idem O1b) |
| O1f — exporter `isRedirectOperator` ou réécrire T2 sans lui (retirer le second export) | S — une ligne | `packages/opencode/src/tool/shell.ts` | aucun | aucun |
| O1g — rendre le filtre de type réellement fail-closed (traiter l'opérateur **avant** `REDIRECT_OPERAND_TYPES`, ou ne jamais laisser une liste vide tout accepter) | S — réordonner deux lignes | `packages/opencode/src/tool/shell.ts` | `test/tool/shell-redirect-ast.test.ts` (T2) | aucun |
| O8 — établir une base de référence, ou reformuler T5 en delta sur les 23 rouges | S — réécriture de `§7.5` T5 | `docs/harness-audit/proposals/P12-redirection-path.md` | aucun | aucun — c'est la condition **préalable** à toute mesure de non-régression |
| R2 — figer `REDIRECT_OPERAND_TYPES = { word, redirected_file_name }` et le couple `REDIRECT_TYPES` définitif | S — deux constantes | `packages/opencode/src/tool/shell.ts` | `test/tool/shell-redirect-ast.test.ts` | aucun |
| Garantie `collect()` — ne rien déplacer | **aucun** (déjà vérifiée) | `packages/opencode/src/tool/shell.ts` (`:649-658`, `:498`) | `test/tool/shell-launch-retry.test.ts` : ajouter T6 (assertions 1-3 de `§10:633-637`) | **oui, à relire** : `shell-launch-retry.test.ts:103` exige `starts.count >= LAUNCH_BUDGET` (**C-15**) — la relance ne doit pas être supprimée |
