Statut : PASS_WITH_CHANGES

# P12 — Résolution des cibles de redirection shell

## Proposal

`P12` — Résolution des cibles de redirection shell.
Fichier validé : `docs/harness-audit/proposals/P12-redirection-path.md` (331 lignes).
Gabarit : `docs/harness-audit/VERDICT-TEMPLATE.md`.

## Validator

`validator-independent-p12` — `independent` : n'a pas rédigé la proposition. Aucun fichier sous
`packages/**` modifié ; aucun commit. Source unique : `read` et `glob` sur l'arbre réel. Le shell
et `git` sont indisponibles (EPERM) sur cette machine, donc **aucun test n'a été exécuté** ; la
ligne « tests exécutables » est établie par lecture de code et de test, pas par exécution, et
est marquée comme telle.

Note d'intégrité : `verdicts/P12-verdict.md` existait **déjà** (204 lignes, signature
`validator-p12`, statut `PASS_WITH_CHANGES`, première ligne = en-tête du gabarit et non `Statut :`).
C'est un artefact non vérifié, de même nature que le défaut d'orchestration consigné en **C-21**
(`CORRECTIONS.md:31`) : deux agents écrivant le même fichier. Je ne l'ai pas réutilisé comme
preuve ; je l'ai remplacé par le présent verdict, écrit depuis le code.

## Status

`PASS_WITH_CHANGES`

Le diagnostic central est **vérifié vrai** dans le code réel : la cible d'une redirection n'atteint
jamais `argPath`, et la garde de `shell.ts:409` est bien le contournement. La cible du correctif est
la bonne, et le récepteur `root` (et non `node`) est le bon choix. **Aucune citation de la
proposition n'est fausse** : les 27 ancres vérifiées tombent toutes sur le code décrit. Aucun test
existant n'est cassé, et les neuf tests proposés s'écrivent **sans réécrire** un test existant.

Ce qui empêche `PASS` est de nature interne au correctif, pas à son diagnostic : le prédicat de
sélection de `redirectTargets` est **indéfini** et contredit son propre commentaire, alors que la
proposition déclare elle-même ne pas connaître la structure des enfants ; un des neuf cas de test
repose sur une affirmation qu'elle reconnaît ne pas avoir observée ; un libellé de cas est plus
fort que son assertion. Ces trois points sont **additifs** et se corrigent sans changer
l'approche — d'où `PASS_WITH_CHANGES` et non `FAIL`.

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok | 27 ancres vérifiées une à une, toutes tombent sur le code décrit. `shell.ts:10` = `import { Language, type Node } from "web-tree-sitter"`. `shell.ts:114` = `if (!item \|\| item.type === "command_argument_sep" \|\| item.type === "redirection") continue` (verbatim). `shell.ts:134-135` = `source()` avec `redirected_statement` (verbatim). `shell.ts:138-140` = `descendantsOfType("command")`. `shell.ts:142-148/150-154/169-175` = `unquote`/`home`/`expand`. `shell.ts:177-187` = `provider`. `shell.ts:189-194` = `dynamic`, avec `:191` = `if (text.includes("$(") \|\| text.includes("${") \|\| text.includes("`")) return true`. `shell.ts:196-201` = `prefix`. `shell.ts:203` = `pathArgs`, `:210` = `!(cmd && item.text.startsWith("/")) &&`. `shell.ts:323-348` = `parser`, `:334` = `bashWasm`, `:337` = `psWasm`. `shell.ts:370-379` = `resolvePath`. `shell.ts:381-388` = `argPath` (verbatim). `shell.ts:390-426` = `collect`, `:404` = `for (const node of commands(root))`, `:407` = `cmd`, `:409-411` (verbatim), `:413` = `if (!resolved \|\| containsPath(resolved, instance)) continue`, `:415` = `scan.dirs.add(dir)`, `:419-422`, `:420`, `:421`. `shell.ts:42-63` = `FILES` avec `"touch"` à `:48`, `"cat"` à `:51`, **aucun `echo`**; `shell.ts:64-77` = `CMD_FILES`. `package.json:10` = `"test": "bun test --timeout 30000",`. `shell.test.ts:81/86/101` = `bash`/`shells`/`ps`; `shell.test.ts:155` = `capture`; `shell.test.ts:215` = `describe("tool.shell permissions", () => {`; `shell.test.ts:989` = `each("matches redirects in permission pattern", () =>`; `shell.test.ts:1005` = `expect(bashReq!.patterns).toContain("echo test > output.txt")` (verbatim). **Deux imprécisions, non bloquantes** : `P12:80` décrit `shell.test.ts:1110` par `echo stderr_msg >&2` alors que la ligne est `` command: `echo stdout_msg && echo stderr_msg >&2` `` (le fragment existe, la commande complète est plus longue) ; `P12:268` situe `each()` « ligne 148 » alors que la déclaration est `const each = (` à `shell.test.ts:146`. Aucune des deux ne dévie vers le mauvais code. |
| le correctif supprime vraiment la cause | ok | La cause est la conjonction de deux garde-fous, tous deux vérifiés : `shell.ts:114` écarte explicitement `item.type === "redirection"` de `parts()`, donc `pathArgs` (`:410`) ne voit jamais l'opérande ; et `shell.ts:409` court-circuite la boucle pour `echo`, absent de `FILES` (`:42-63`). La branche proposée (`P12:164-174`) est **non conditionnée à `cmd`** et itère sur `root`, donc elle frappe les deux contournements. La branche reproduit fidèlement la forme des lignes `410-416`, `fs.isDir` compris, ce qui est le bon choix pour l'ordre des effets. Le défaut résiduel porte sur le *prédicat* d'extraction, pas sur le branchement — voir Objection 1. |
| le correctif ne casse pas un comportement existant | ok | Aucun test existant n'est rompu. `source()` (`shell.ts:134`) et `scan.patterns` (`:420`) sont explicitement laissés intacts (`P12:181-188`), donc `shell.test.ts:1005` reste vert : la ligne 420 continue d'ajouter la chaîne complète `"echo test > output.txt"`. Inventaire exhaustif des redirections dans `shell.test.ts` : `grep 'command:.*>'` ne renvoie que **deux** lignes, `999` (test de motif, aucune assertion `external_directory`) et `1110` (suite d'abandon, aucune assertion de permission) ; `grep 'Out-File\|Tee-Object\|>&'` ne renvoie qu'`1110`. Aucun test ne peut donc être cassé par l'ajout d'une requête `external_directory` liée à une redirection : c'est aussi la **preuve directe** de l'Evidence f) de la proposition, qui est donc confirmée. Les neuf cas nouveaux exigent **zéro réécriture**. |
| tests proposés sont exécutables dans ce dépôt | KO | Le harnais est réel et réutilisable tel quel : `capture()` (`shell.test.ts:155-162`) fait `requests.push(req)` pour **toute** permission, donc les cas « aucune requête » s'écrivent sans nouveau helper, et `each()` (`shell.test.ts:146-153`) fournit la matrice de shells. Mais deux cas ne tiennent pas. Le cas 2 (`P12:278`, `> <tmp externe>`) exige « aucun nœud `command` » (`P12:105-107`) : c'est une affirmation **non observée**, la proposition le reconnaît elle-même (`P12:82-85` : aucune table de types lisible ; `P12:90-95` : INFERE assumé). Si la grammaire produit un nœud différent, le cas échoue **après** un correctif parfaitement valable, pour une raison étrangère au correctif. Le cas 4 (`P12:280`) est étiqueté « ajout, non écrasement » alors que l'assertion annoncée (`P12:301-305`) ne demande qu'« une requête `external_directory` » : une branche qui tirerait `>` pour un `>>` passerait à l'identique. Les sept autres cas sont exécutables en l'état. |
| effort et coût annoncés réalistes | ok | Coût en tokens « nul » (`P12:236`) : exact, aucun prompt, aucune description, aucun motif n'est modifié. Latence « milliseconde » (`P12:242`) et « une **seconde traversal par type** » (`P12:238`) : formulation exacte — la boucle externe porte sur les **deux** entrées de `REDIRECT_TYPES`, donc deux traversaux par commande analysée, ce que le texte dit bien. Le court-circuit `containsPath` avant `fs.isDir` (`shell.ts:413` puis `:414`) est réel. §8 « M » (`P12:310-312`) est justifié : le dump à deux grammaires n'est pas un raffinement mais un prérequis, et la proposition le reconnaît en le conditionnant (`P12:287-292`, `P12:326-331`). Le seul effort **non** chiffré est le durcissement du prédicat (Objection 1), quelques lignes. |

## Objections

### 1. `redirectTargets` n'a pas de prédicat de sélection défini, et son code contredit son propre commentaire — bloquante

- Le commentaire annonce « **l'opérande** de `>`, `>>`, `>|` » (`P12:147-148`).
- Le code pousse **tous** les enfants nommés : `for (const child of node.namedChildren) { ... out.push(text) }` (`P12:151-153`). Rien n'identifie l'opérande.
- La proposition déclare ne pas connaître cette structure : « le nom du nœud fils qui porte l'opérande **n'est pas établi**, ni pour bash ni pour PowerShell » (`P12:90-92`).

Conséquence traçable dans le code réel, **si** l'opérateur est un enfant nommé (hypothèse que le
commentaire de `P12:147` pose et que la proposition ne tranche pas) : `out` contient `>`.

- `shell.ts:382` `home(unquote(">"))` → `">"`
- `shell.ts:383` `prefix(">")` → `">"` — le motif `/[?*[]/` de `shell.ts:197` ne matche pas `>`
- `shell.ts:384` `dynamic(">", ps)` → `false` — `shell.ts:190-193` ne matche ni `(`, ni `@(`, ni
  `$(`, ni `${`, ni backtick, ni `$`
- `shell.ts:387` `resolvePath(">", cwd, shell)` → `shell.ts:378` `path.resolve(root, ">")` → un
  **chemin bidon à l'intérieur du cwd**

Ce chemin bidon n'est neutralisé que par `shell.ts:413` `containsPath(...)` → `continue`, c'est-à-dire
**parce qu'il est interne**. Le code dépend donc d'un effet de bord de résolution de chemin, pas du
prédicat qu'il prétend implémenter. Même raisonnement pour `>|`, que `P12:147` liste lui-même
comme opérateur traité.

`INFERE:` le nœud de redirection a pour enfants nommés l'opérateur et l'opérande.
**Méthode de vérification** : exécuter le script de dump de `P12:287-292` et lire, pour
`echo x > f`, `echo x 2>&1`, `echo x >&2` et `cat <<EOF > f`, le `type` du nœud de redirection et
le `type` de **chaque** enfant nommé. Non exécuté ici (shell indisponible, EPERM) ; c'est
précisément le dump que la proposition prescrit déjà. Si l'opérateur est un token **anonyme**, la
sélection par `namedChildren` est correcte et l'objection tombe — mais cela doit être **constaté**,
pas présumé.

### 2. Le cas de test 2 repose sur une affirmation que la proposition reconnaît ne pas avoir observée — bloquante pour le test, pas pour l'approche

`P12:278` exige « une requête `external_directory` » pour `> <tmp externe>`, et `P12:105-107`
pose que « **aucun** nœud `command` n'est produit » dans ce cas. Aucune preuve : l'Evidence g)
(`P12:82-85`) constate qu'aucune table de types de nœud n'est lisible dans l'arbre installé, et
l'INFERE de `P12:90-95` se déclare en suspens. Le critère de succès `P12:301-305` (« les quatre
premiers cas passent ») dépend donc d'un fait non établi. Le récepteur `root` de la branche est la
bonne réponse architecturale à cette incertitude — mais la branche **observe** `root`, elle ne peut
pas garantir qu'un `> /tmp/f` nu y apparaisse sous un type présent dans `REDIRECT_TYPES`.

### 3. Le libellé du cas 4 est plus fort que son assertion

`P12:280` nomme le cas « ajout, non écrasement ». L'assertion annoncée (`P12:301-305`) ne vérifie
qu'« une requête `external_directory` ». Or la branche (`P12:164-174`) n'inspecte **pas**
l'opérateur : elle itère `REDIRECT_TYPES` et pousse dans `scan.dirs` (`shell.ts:415`) le `dirname`
de la cible. Une implémentation qui traiterait `>` et `>>` à l'identique satisferait le test.
La sémantique ajout/écrasement n'est de toute façon pas une propriété de la couche permission.

### 4. `P12:116-118` attribue le laissez-passer au motif générique — contredit par C-13

`P12:116-118` : « la commande est donc couverte par le motif générique `bash *` et s'exécute sans
contrôle de chemin ». **C-13** (`CORRECTIONS.md:23`) a établi par mesure que `always` **neutralise**
la détection au lieu de la limiter : `shell.ts:421` + `permission/arity.ts:135` produisent la clé
`"python -c *"`, que `permission/index.ts:304-310` pousse en règle `allow`, court-circuitée par
`permission/index.ts:241`. `shell.ts:421` est bien `scan.always.add(BashArity.prefix(tokens).join(" ") + " *")`.

La conclusion de P12 est juste, son mécanisme ne l'est pas. Le fait décisif est ailleurs et il est
plus fort : `scan.dirs` (`shell.ts:415`) reste vide, donc **aucune dimension de chemin n'est
évaluée** pour cette commande. P12 ne doit pas devenir une preuve adverse à C-13.

### 5. Deux citations de test imprécises — non bloquante

- `P12:80` : « `shell.test.ts:1110` utilise `echo stderr_msg >&2` ». La ligne réelle est
  `` command: `echo stdout_msg && echo stderr_msg >&2` `` (`shell.test.ts:1110`). Le fragment cité
  existe ; la commande complète contient `echo stdout_msg &&`.
- `P12:268` : « le helper `each()` (ligne 148) ». La déclaration est `const each = (` à
  `shell.test.ts:146` ; la ligne 148 est la signature du callback `fn`.

### 6. Points établis, confirmés ou contradiés

**C-04 — `registry.ts:256` est un no-op : confirmé sur la portée, **contredit** sur le libellé.**
`registry.ts:256` est bien `output: out.truncated ? out.content : output,` : ce n'est pas
littéralement un no-op, car quand `out.truncated` est vrai la ligne substitue `out.content` à
`output`. En revanche C-04 a raison sur ce qui décide ici : le bloc est **plugin-only**.
`registry.ts:242-247` construit un `PluginToolContext` avec un pont `EffectBridge` Effect→Promise,
`registry.ts:248` exécute `def.execute(args as any, pluginCtx)`, `registry.ts:253` appelle
`truncate.output(output, {}, info)`. Aucun outil natif ne traverse ce chemin.
**Effet sur P12 : nul.** P12 ne cite ni `registry.ts` ni `truncate.output`, et aucune de ses
conclusions n'en dépend. Le libellé « no-op » de C-04 reste à corriger dans CORRECTIONS.md.

**C-05 — plafond de 4 000 caractères : confirmé intégralement.**
`terminal-output.ts:5` est `const MAX_BYTES = 4_000`, et `terminal-output.ts:224` est
`const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES`, consommé par
`preview(useful, ...)` à `terminal-output.ts:226-229`. Le plafond vient bien de là, pas de
`truncate.ts`.
**Effet sur P12 : nul.** P12:236-237 déclare un coût en tokens nul et ne revendique aucun plafond
de caractères ; il ne cite ni `truncate.ts` ni `terminal-output.ts`. Inversement, P12 ne peut pas
être invoqué comme preuve sur la couche de troncature. Le constat de P12 « aucune couche de
troncature n'est touchée » est confirmé.

**Réintroduction d'un finding déjà corrigé ailleurs : aucun.**
`shell.ts` est visé par P09, P13, P14 et P18 ; `truncate.ts` par P16 et P17. P12 ne touche
`truncate.ts` (`P12:127` : « `packages/opencode/src/tool/shell.ts` uniquement ») et n'ajoute dans
`scan.dirs` que des **répertoires de contrôle**, aucun artefact disque — donc **aucune collision
avec l'invariant de sortie complète sur disque**. Le danger d'orchestration serait d'**exporter**
`dynamic`/`prefix` pour partager le helper : `shell.ts:189` est `function dynamic(text: string, ps: boolean) {`
et `shell.ts:196` est `function prefix(text: string) {`, **sans `export`**. Les exporter est
exactement le défaut que **C-12** (`CORRECTIONS.md:22`) a reproché à P13 : « un patch qui ne compile
pas n'est pas une proposition ». Le correctif P12 doit rester à **un seul site**, comme `P12:128-130`
le prescrit.

### 7. Arbitrage croisé P09 — propriétaire de l'invariant « la sortie complète existe sur disque » : **`shell.ts`**

Le verdict P09 a délégué cette décision. Je la tranche : **`shell.ts` est le propriétaire.** Motif :

1. **`terminal-output.ts` ne peut pas le posséder, et C-05 en donne la démonstration
   structurelle.** `terminal-output.ts:224` calcule un `budget` à partir de `useful`, une chaîne
   **déjà réduite**, et `:226-229` appelle `preview(useful, ...)`. Un point de passage qui reçoit
   un texte déjà tronqué ne peut pas garantir qu'une version complète existe ailleurs : par
   construction, l'information y est perdue avant d'arriver. Lui confier l'invariant le rendrait
   non implémentable, pas seulement mal placé.
2. **`shell.ts` est la seule couche où la donnée est encore intacte.** Le flux est produit par le
   processus enfant et collecté dans `ShellTool` (`shell.ts:350`) ; c'est le seul endroit où le
   texte complet transite avant toute réduction.
3. **Portée pour P12 : aucune obligation nouvelle.** Le correctif P12 est entièrement
   **antérieur** à l'exécution, dans `collect()` (`shell.ts:390-426`), et n'écrit rien sur disque.
   P12 est compatible avec cet ownership comme avec n'importe quel déplacement ultérieur du sink.
4. **Obligation croisée que j'impose à P09 et P18.** Cet ownership n'a de valeur que si le scan de
   `collect()` reste sur le chemin de **chaque** tentative d'exécution. Tout correctif qui supprime
   le retry de `shell.ts:498` (portée de P18 ; **C-15**, `CORRECTIONS.md:25` : le test
   `shell-launch-retry.test.ts:103` exige `starts.count >= LAUNCH_BUDGET` et casse), ou qui réordonne
   l'autorisation par rapport à `collect()`, rend la garantie de P09 **silencieusement vacante** et
   réouvre par la même occasion le contournement que P12 ferme. C'est une condition de cohérence
   entre P09/P12/P18, pas un défaut propre à P12.
5. **`truncate.ts` reste hors périmètre** pour les deux : P16 et P17 le visent, P12 ne le cite pas.

## Required changes

1. **Ne pas livrer `redirectTargets` avant d'avoir fixé structurellement le nœud d'opérande**, et
   remplacer la sélection « tous les enfants nommés » (`P12:151-153`) par une sélection **typée** qui
   exclut explicitement le token d'opérateur. Le dump de `P12:287-292` doit avoir fixé trois choses :
   le `type` du nœud de redirection, le `type` du nœud qui porte l'opérande, et si l'opérateur est un
   enfant nommé ou un token anonyme.
   *Citation : `P12:147-148` (annonce « l'opérande ») contre `P12:151-153` (pousse tout) contre
   `P12:90-92` (structure inconnue) ; effet si l'opérateur est nommé : `shell.ts:383` `prefix(">")`
   ne matche pas `/[?*[]/` (`shell.ts:197`), `shell.ts:384` `dynamic(">", ps)` est `false`
   (`shell.ts:190-193`), `shell.ts:387` → `shell.ts:378` `path.resolve(root, ">")` produit un chemin
   bidon interne, neutralisé seulement par `shell.ts:413`.*
2. **Conditionner le cas de test 2 au résultat du dump, ou le retirer de la matrice d'acceptation
   et le consigner comme `INFERE` non couvert.** Corriger en conséquence `P12:301-305`, qui exige
   aujourd'hui « les quatre premiers cas passent ».
   *Citation : `P12:278` et `P12:105-107` (« aucun nœud `command` n'est produit ») face à `P12:82-85`
   (aucune table de types lisible) et `P12:90-95` (INFERE assumé).*
3. **Aligner l'assertion du cas 4 sur ce qu'il prouve**, ou ajouter une assertion qui discrimine
   `>>` de `>`. En l'état, le libellé promet une sémantique que l'assertion ne teste pas.
   *Citation : `P12:280` (« ajout, non écrasement ») contre `P12:301-305` (« une requête
   `external_directory` ») et `P12:164-174` (branche indifférente à l'opérateur) avec `shell.ts:415`
   (`scan.dirs.add(dir)`, qui ne reçoit que le `dirname`).*
4. **Corriger `P12:116-118`** : le fait décisif est `scan.dirs` vide, donc l'absence d'évaluation
   de toute dimension de chemin — pas le motif générique `bash *`. Ne pas laisser P12 contredire C-13.
   *Citation : `shell.ts:415` (jamais atteint pour cette cible) contre `shell.ts:421`
   (`scan.always.add(BashArity.prefix(tokens).join(" ") + " *")`) ; **C-13**, `CORRECTIONS.md:23`
   (`always` neutralise : `permission/arity.ts:135` → `permission/index.ts:304-310`, court-circuité
   par `permission/index.ts:241`).*
5. **Préciser les deux citations de test.** Sans effet sur la décision.
   *Citation : `P12:80` (commande réelle `shell.test.ts:1110` =
   `` `echo stdout_msg && echo stderr_msg >&2` ``) et `P12:268` (déclaration réelle de `each` à
   `shell.test.ts:146`, la ligne 148 étant la signature du callback).*

## Implementation guidance

Ordre des patches : (1) exécuter le dump de §7 sur `echo x > f`, `echo x 2>&1`, `echo x >&2`,
`> /tmp/f` et `cat <<EOF > /tmp/f`, sous **bash et powershell**, en réutilisant `parser()`
(`shell.ts:323-348`) ; (2) figer `REDIRECT_TYPES` **et** le prédicat d'opérande à partir de la sortie
réelle, puis seulement écrire `redirectTargets` ; (3) ajouter la branche sur `root` dans `collect()` —
`root` et non `node` est le bon receveur, c'est la seule façon de couvrir la redirection nue, et P12 a
raison sur ce point ; (4) tests dans `packages/opencode/test/tool/shell.test.ts`, nouveau
`describe("tool.shell redirection targets")` sous `describe("tool.shell permissions")`
(`shell.test.ts:215`), en réutilisant `each()` (`shell.test.ts:146-153`) et `capture()`
(`shell.test.ts:155-162`) : `capture` intercepte déjà `requests.push(req)` pour **toute** permission,
donc les neuf cas s'écrivent sans nouveau helper et sans réécrire un test existant.

Piège connu : la branche ne doit pas être placée dans la boucle `commands()` (`shell.ts:404`) — un
`> /tmp/f` nu n'y passe pas, et c'est tout l'intérêt de itérer sur `root`. second piège : ne pas
exporter `dynamic` (`shell.ts:189`) ni `prefix` (`shell.ts:196`) pour partager le helper ; les garder
à un seul site, sinon on reproduit **C-12**.

Commande : `bun test --timeout 30000 test/tool/shell.test.ts` depuis `packages/opencode`
(`package.json:10`). Non exécutée par ce validateur (shell indisponible, EPERM) : la conformité
« aucun test existant cassé » est établie par lecture, pas par exécution.