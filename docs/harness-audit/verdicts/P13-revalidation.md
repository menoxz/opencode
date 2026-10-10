# P13 — revalidation (vague 4)

Revalidateur indépendant. Je n'ai rédigé ni la proposition initiale, ni son verdict, ni la révision.
Ordre de lecture suivi : `P13-verdict.md` → proposition révisée → `CORRECTIONS.md` (C-12, C-13, C-14,
C-24, C-40, C-41, C-46, C-47). Aucun `git` exécuté, aucun fichier sous `packages/**` modifié.

Toutes les citations ci-dessous ont été relues par `read` dans ce dossier, à la tranche citée.

## Proposal

P13 corrige la porte de détection de `packages/opencode/src/tool/shell.ts` : `collect` n'ouvre
`external_directory` que sur une égalité de nom de commande (`FILES.has(cmd)` ou `CMD_FILES`), si bien
qu'une charge utile inline (`python -c "…"`) qui écrit hors arbre ne déclenche rien. Le correctif crée
un module pur `packages/opencode/src/tool/shell/mutation.ts` (détection de charge inline + extraction de
littéraux de chemin), rouvre la porte sur `WRITE_UTILS.has(cmd) || write.inline`, et **unionne** les
chemins détectés à ceux de `pathArgs` au lieu de les substituer.

La proposition révisée a traité les trois objections de fond de la vague 2 (C-12, C-13, C-14) avec des
lectures de code exactes, et a corrigé la commande de régression vers la bonne suite. Elle échoue
néanmoins sur sa propre base de non-régression et sur une citation fausse — deux défauts localisés, tous
deux dans la partie « justification / critère », aucun dans le patch lui-même.

Points du mécanisme vérifiés un par un (§3, étapes 1-12) :

- `shell.ts:646` `const ps = Shell.ps(shell)` ✔ ; `:649-651` `Effect.acquireRelease(parse(...))` ✔ ;
  `:652` `collect(tree.rootNode, cwd, ps, shell, instanceCtx)` ✔ ; `:653`
  `if (!containsPath(cwd, instanceCtx)) scan.dirs.add(cwd)` ✔ ; `:654` `yield* ask(ctx, scan)` ✔.
- `:390-426` définition de `collect` ✔ ; `:397-401` les trois `Set` de `scan` ✔ ; `:402`
  `ShellID.toKind(Shell.name(shell))` ✔ ; `:404-407` boucle + `tokens` + normalisation de `cmd` ✔.
- `:409` la porte unique ✔ ; `:410-417` `pathArgs` → `argPath` → `containsPath` → `scan.dirs` ✔ ;
  `:419-422` l'alimentation de `scan.patterns`/`scan.always` **indépendamment** de la porte ✔.
- `shell/id.ts:10-12` `toKind` retombe sur `"bash"` ✔ ; `:14-16` commentaire de compatibilité + `:16`
  `export const ToolID = "bash"` ✔.
- `shell.ts:114` `item.type === "redirection"` → la cible de redirection est écartée de `tokens` ✔ : le
  chevauchement avec P12 est réellement disjoint, comme annoncé.

Le diff est sain sur ses quatre propriétés annoncées :

- `:388-394` — la porte teste `write.inline`, **pas** l'objet `write` nu : un objet étant toujours
  truthy, la variante naïve aurait ouvert la porte sur toute commande. Le rétrécissement est réel.
- `:397` — `[...new Set([...pathArgs(command, ps, shellKind === "cmd"), ...write.paths])]` : c'est une
  **union**, `pathArgs` tourne toujours, la normalisation PowerShell des drapeaux
  (`shell.ts:224-229`) est préservée. La régression nº 6 du verdict initial est réellement levée.
- `:400` — `log.info("resolved path", { arg, resolved })` conservé.
- Aucune fonction appelée sans être définie : `dynamic`, `prefix`, `extractPathLiterals` et
  `detectWritePaths` sont tous définis dans le module.
- `shell.ts:78` `FLAGS = new Set(["-destination", "-literalpath", "-path"])` : l'ajout de
  `"-filepath"` est strictement additif, et il est annoncé comme la seule modification d'une table
  existante, avec sa justification.

## Revisions applied

| Objection | Traitement dans la révision | Preuve |
| --- | --- | --- |
| C-12 — `shell.ts:189`/`:196` non exportés | `dynamic` et `prefix` sont **dupliqués** dans `shell/mutation.ts` et ré-exportés, chaque copie portant son site d'origine en commentaire ; `shell.ts` n'est pas touché pour les exposer | `shell.ts:189` `function dynamic(`, `:196` `function prefix(` — aucun `export` ✔ ; proposition `:297-303` « Copie verbatim de shell.ts:189-194 », `:305-311` « Copie verbatim de shell.ts:196-201 » ✔ |
| C-12 — `positionalWriteArgs` appelé sans définition | Le symbole a disparu du design ; grep sur la proposition = 5 occurrences, dont **aucun** appel ni définition : `:377` (mention de suppression), `:418`, `:678` | `grep "positionalWriteArgs"` → `:377` seulement comme déclaration d'absence ✔ |
| C-13 — sévérité de `always` | Chaîne relue et **inverse** de l'objection d'origine : l'octroi `always` de `bash` ne neutralise pas la détection | voir « C-13 » dans `## Status` ✔ |
| C-14 — règle effective de `external_directory` | Tranchée par lecture, avec la formulation exacte | voir « C-14 » dans `## Status` ✔ |
| RC2 — clé d'octroi `python -c *` | Justification corrigée : ce n'est pas `tokens.slice(0,1)` mais l'arity table | `arity.ts:135` `python: 2, // python -m venv env` ✔ ; `arity.ts:5` `if (arity !== undefined) return tokens.slice(0, arity)` ✔ ; repli `arity.ts:8` ✔ |
| RC3 — périmètre réel | Resserré à « hors `directory` **et** hors `worktree` », présenté comme fait et non comme inférence | `instance-context.ts:19` `AppFileSystem.contains(ctx.directory, …)` et `:23` `AppFileSystem.contains(ctx.worktree, …)` ✔ |
| RC6 — `of=` mort | `dd`/`patch`/`install` retirés, avec la raison écrite dans le commentaire source | proposition `:330-335`, `WRITE_UTILS = new Set(["tee", "tee-object", "out-file", "sed"])` ✔ |
| C-24 — critère de succès | Remplacé par un volet A / volet B | **insuffisant** — voir `## Remaining objections` |
| C-41 — base de non-régression | Commande corrigée vers `test/shell/shell.test.ts`… mais critère non rebasé | **partiel** — voir `## Remaining objections` |

## Status

**C-13 — l'objection d'origine est réfutée ; le défaut est ré-affecté à `shell.ts:287`.**

La chaîne annoncée par l'agent tient intégralement, sur les quatre liens :

1. `packages/core/src/util/wildcard.ts:3` `export function match(input: string, pattern: string)`, et `:13`
   `return new RegExp("^" + escaped + "$", …)`. L'expression est **ancrée aux deux extrémités** : une
   permission `bash` ne peut donc pas matcher le motif `external_directory`. ✔
2. `packages/core/src/permission.ts:21-31` `evaluate` = `rulesets.flat().findLast((rule) =>
   Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern))`. L'appariement
   porte **sur le nom de permission en premier**, et c'est le **dernier** qui gagne. ✔
3. `packages/opencode/src/permission/index.ts:234` `evaluate(request.permission, pattern, ruleset,
   approved)`, où `request.permission` vaut `"external_directory"` pour la demande de répertoires
   (`shell.ts:285`) et `"bash"` (`ShellID.ToolID`) pour la demande de commande (`shell.ts:294`). ✔
4. `shell.ts:421` `scan.always.add(BashArity.prefix(tokens).join(" ") + " *")` alimente la demande `bash`
   ; `index.ts:304-305` `for (const pattern of existing.info.always) { approved.push({ … }) }` verse ces
   motifs dans le ruleset approuvé. ✔

Conséquence : un `always` accordé sur `bash` produit des règles approuvées dont le champ `permission`
est `bash`. Ces règles **ne peuvent jamais** être atteintes par une évaluation `external_directory`, donc
elles **ne neutralisent pas** la détection que P13 introduit. La neutralisation réelle est
`shell.ts:287` `always: globs`, où les globs sont dérivés de `scan.dirs` (`:280-283`) : elle est donc
**par répertoire**, et seulement après un choix explicite de l'utilisateur
(`index.ts:57` `Reply = ["once", "always", "reject"]`).

**C-13 est donc `refused` en tant qu'objection, et le défaut est ré-affecté sur `shell.ts:287` — que la
révision avait d'ailleurs déjà identifié comme le remède RC1 (§9, décision 1).**

**C-14 — le raisonnement de l'agent est exact, aux quatre points.**

- Défaut `ask`, trois familles blanches : `agent.ts:119-122`
  `external_directory: { "*": "ask", ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])) }`,
  avec `whitelistedDirs` défini `:106-110` = `[Truncate.GLOB, path.join(Global.Path.tmp, "*"),
  ...skillDirs.map(...)]` → **trois** familles. ✔
- Injection en dernier : `agent.ts:356-370`, commentaire `:356` « Ensure Truncate.GLOB is allowed unless
  explicitly configured », puis `Permission.merge(agents[name].permission, Permission.fromConfig({
  external_directory: { [Truncate.GLOB]: "allow" } }))` en `:366-369`. ✔
- `merge` concatène : `core/src/permission.ts:33-35` `return rulesets.flat()`. ✔
- `evaluate` = `findLast` : `core/src/permission.ts:25`. ✔
- La garde préserve le seul `deny` exact : `agent.ts:359-363` teste `r.permission !== "external_directory"`
  → false, `r.action !== "deny"` → false, `r.pattern === Truncate.GLOB` ; `:364` `if (explicit) continue`. ✔
- `Truncate.GLOB = path.join(TRUNCATION_DIR, "*")` : `truncate.ts:18`. ✔

Donc l'entrée `allow` injectée en dernier écrase bien toute règle antérieure plus générale portant sur ce
glob (y compris un `"*": "ask"` explicite), la seule exception étant le `deny` sur exactement ce motif.
La formulation « pas deux politiques opposées, mais une règle générale et une surcharge silencieuse »
est juste.

**Point de doctrine confirmé et hors périmètre, comme annoncé :** `agent.ts:119-122` et `agent.ts:356-370`
sont bien deux textes distants décrivant la même politique, sans lien déclaré entre eux (§9 dernier
paragraphe). Le gain de P13 est aussi borné : toute cible sous `Truncate.GLOB`, `%TEMP%\*` ou
`skillDirs\*` ne demandera rien, avant comme après.

**Les deux décisions de §9 sont tranchées ici.** §9 (`:687-688`) les remet explicitement à un validateur.
1. **Remède RC1 — j'accepte** (`:690-694`). Passer `always: []` quand `scan.dirs` provient de
   `detectWritePaths` afin qu'une approbation reste `once`. Justification : les globs accordés par
   `shell.ts:287` sont des littéraux extraits d'un corps de programme, que l'utilisateur ne peut pas
   toujours prédire (le cas `paths: []` sur charge dynamique, `:621`, en est la preuve) ; un octroi
   `always` y fermerait la fenêtre d'observation — le seul bien que ce correctif produit — dès la
   première approbation, alors que les répertoires issus de `pathArgs` sont, eux, saisis par
   l'utilisateur. J'accepte donc le coût d'une invite par occurrence.
2. **Ajout de `"-filepath"` à `FLAGS` (`shell.ts:78`) — j'accepte** (`:695-697`), la modification étant
   strictement additive et nécessaire à la promesse `tee-object` de RC6. Le « contrôle explicite »
   demandé par la proposition est l'ajout d'un cas `tee-object -FilePath C:\x` au test d'intégration,
   reporté dans la grille ci-dessous.

**Base de mesure.** `test/shell/shell.test.ts` est verte et stable (12 pass / 0 fail,
`SHELL_TEST_EXIT=0`) : c'est bien la bonne base, et `test/tool/shell.test.ts` ne peut pas servir de base
(instabilité 63/32/1 puis 62/33/4 sur arbre non modifié, ~26-28 échecs issus d'un `RepeatedCallError` par
état partagé). `TYPECHECK_EXIT=0` (16 s, bun 1.4.2) fixe le seuil du DoD 4 ; P13 ajoutant un module, le
typecheck devient une porte à exécuter après patch, pas un état hérité.

## Remaining objections

| # | objection | statut | preuve | implémentable ? |
| --- | --- | --- | --- | --- |
| 1 | **§7 `:644-650` affirme que la baseline de vague 4 « n'existe pas » (glob → aucun résultat).** Le fichier existe : `C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md`, 192 lignes, en-tête « Mesuré le 2026-10-03 », ligne 11 `test/tool/shell.test.ts → exit 1, 63 pass, 32 fail, 1 errors, 95 tests, 127,13 s` | **`open`** | read du fichier, `:1-11` ✔ | ❌ bloquant |
| 2 | **§7 `:669-670` reconduit les chiffres périmés 68/27/3 et « 26 échecs ».** C-40 les corrige en 63/32/1 et 28 échecs ; la baseline dit 63/32/1 | **`open`** | `CORRECTIONS.md:50` (C-40) + `wave4-baseline.md:11` ✔ | ❌ bloquant |
| 3 | **Volet B non discriminant sur `test/tool/shell.test.ts`.** Son critère est « triplet `(pass, fail, errors)` et noms en échec **identiques** avant/après ». Sur cette suite l'instabilité 63/32/1 → 62/33/4 est une propriété de l'arbre **non modifié** : la porte déclenche au hasard et ne certifie rien. Substituer 63/32/1 ne la rend pas falsifiable | **`open`** | état de mesure fourni (63/32/1 puis 62/33/4) + `wave4-baseline.md:11` ✔ | ❌ bloquant |
| 4 | **§3.10 `:269-270` est faux sur `scout`** : « Les deux sont bâtis sur `"*": "deny"` avec `bash: "allow"` (`agent.ts:206`/`:210` et `:231`/`:235`) ». Vérifié `agent.ts:230-243` : scout n'a **aucune** clé `bash`, et `:235` vaut `websearch: "allow"`, pas `bash`. Conséquence non cosmétique : scout est bâti sur `"*": "deny"` (`:231`), donc un `python -c` y est **refusé d'emblée**, et non « totalement silencieux » comme l'affirme `:271` ; avec `merge(defaults, …)` et `defaults` = `"*": "allow"` (`:117`), `findLast` rend le `deny` suivant gagnant. L'invite `external_directory` que P13 introduit peut donc être inatteignable sous scout | **`open`** | `agent.ts:231` `"*": "deny"`, `:232-238` aucune clé `bash`, `:235` `websearch: "allow"`, `:239-242` `external_directory` ; `agent.ts:117` `"*": "allow"` ✔ | ❌ bloquant |
| 5 | **C-13 — sévérité de `always` sur la détection** | **`refused`** — objection démontrée fausse ; ré-affectée sur `shell.ts:287` | `wildcard.ts:13` `"^"+escaped+"$"` ; `permission.ts:25` `findLast` ; `index.ts:234` ; `shell.ts:421` ; `index.ts:304-305` ✔ | ✅ |
| 6 | **C-12 — helpers non exportés / `positionalWriteArgs`** | **`accepted`** — traité quant au fond ; réserve assumée et tracée : la duplication de `dynamic`/`prefix` créera une dérive silencieuse si `shell.ts` évolue, deux sites à tenir à jour. Le commentaire « Source à garder à jour » (`:297`) est le mécanisme de traçabilité annoncé | `shell.ts:189`/`:196` sans `export` ; proposition `:297-311` ✔ | ✅ |
| 7 | **C-14 — règle effective de `external_directory`** | **`accepted`** — traité quant au fond ; réserve assumée : le couplage `agent.ts:119-122` ↔ `agent.ts:356-370` reste implicite et non testé (déjà signalé par la révision en §9, hors périmètre) | `agent.ts:106-110`, `:119-122`, `:359-369` ; `core/src/permission.ts:25`, `:33-35` ✔ | ✅ |
| 8 | **C-24 — critère de succès** | **`open`** en l'état. Le remplacement A/B est **juste dans son principe** : volet A est borné aux deux `*.test.ts` neufs, exige `exit 0` et les dix cas du tableau, et ne peut être battu par du rouge préexistant ; volet B doit prouver qu'aucun vert n'a cassé. Mais tant que le volet B porte sur la suite instable (obj. 3), le couple **n'est pas discriminant** : A prouve que le neuf marche, B ne prouve rien. Suffisant **seulement** une fois l'obj. 3 levée | `:662-674` ✔ | ❌ bloquant |
| 9 | **C-40 — chiffres de référence périmés** | **`accepted`** — traité quant au fond : les chiffres corrects existent et sont connus ; seule leur application dans §7 est fautive (obj. 1-2) | `CORRECTIONS.md:50` ✔ | ✅ |
| 10 | **C-46 — seuil typecheck du DoD 4** | **`accepted`** — `TYPECHECK_EXIT=0` en 16 s fixe le seuil sur l'état courant ; P13 ajoute un module, donc typecheck **après** patch est une porte à exécuter | `CORRECTIONS.md:56` ✔ | ✅ |
| 11 | **RC1 — remède du §9 ni tranché ni implémenté.** Je tranche (§Status) et j'accepte le remède : passer `always: []` quand `scan.dirs` provient de `detectWritePaths`, pour qu'une approbation reste `once`. Mais le diff de §4 laisse `scan.always.add` **inconditionnel** en `:419-422`, et §6 comme §9 présentent le remède comme « à valider » — il n'est donc pas implémenté | **`open`** | proposition `:540` « Remède envisagé pour RC1 (à valider, voir §9) », `:419-422`, `:687-688`, `:690-694` ✔ | ❌ bloquant |
| 12 | **C-47 — base de non-régression** | **`accepted`** quant à la mesure (12/0, verte, stable, `SHELL_TEST_EXIT=0`) ; **la consigne de C-47 n'a pas été exécutée** : « Remplace la base fautive partout où elle était utilisée ». `test/shell/shell.test.ts` figure dans la **commande** (`:641`) mais pas dans le **critère** ; `:669-670` et `:655-657` s'en tiennent à `test/tool/shell.test.ts` | `CORRECTIONS.md:57` ; proposition `:641`, `:655`, `:669` ✔ | ✅ (la mesure) |

## Regressions introduced

**Aucun test vert n'est cassé.** Déclaré explicitement, comme l'exige la règle 1 de la vague 4.

- La révision ne modifie **aucun** fichier de test : le diff ne porte que sur un module créé et sur
  `shell.ts`. Aucun test existant, vert ou rouge, n'est touché par le patch lui-même.
- Je n'ai rien modifié sous `packages/**` et n'ai exécuté aucun `git` : cette revalidation n'introduit
  aucune régression.
- Le volet B tel que rédigé introduces en revanche une **régression de procédure** : appliqué à
  `test/tool/shell.test.ts`, il peut conclure « régression » sur un arbre sain (63/32/1 → 62/33/4 sans
  aucune édition), et son inverse — conclure « aucune régression » alors que la suite est instable par
  construction — est tout aussi possible. C'est ce qui fonde l'`open` nº 3.

## Final verdict

`REVALIDATED-PASS_WITH_CHANGES`

**Non implémentable en l'état** : **six** résidus sont `open` (nº 1, 2, 3, 4, 8 et 11). Les nº 1, 2 et 8 se
réduisent à la réécriture du §7 — le nº 8 étant le même objet que le nº 3 ; le nº 4 est indépendant et
porte sur une citation fausse de §3.10. Conformément à la règle 3 de la vague 4, je ne les requalifie pas
en `accepted` pour débloquer.

Ce qui est acquis et ne sera pas repris : C-12, C-13 (ré-affecté), C-14, RC2, RC3, RC6, et le patch lui-même,
dont la porte est correctement rétrécie sur `write.inline` et dont l'union remplace la substitution.

**La nuance C-41 est tranchée ainsi : le volet B est récupérable, mais en changeant de base — pas en
changeant de chiffres.** Son principe (comparaison avant/après, jamais par zéro) est bon et la révision
avait déjà orienté la commande vers `test/shell/shell.test.ts`. Le correctif consiste à faire de cette
suite verte le triplet **opposable**, et à **rétrograder** `test/tool/shell.test.ts` en simple preuve
rapportée dont le triplet ne peut pas gating — précisément parce que son instabilité est mesurée. Une
seule réécriture du §7 traite donc simultanément les quatre `open`.

### Grille d'effort pour la vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| Nouveau module de détection (`INLINE`, `WRITE_UTILS`, `dynamic`, `prefix`, `extractPathLiterals`, `detectWritePaths`) | S | `packages/opencode/src/tool/shell/mutation.ts` (créé) | `test/tool/shell-mutation-detect.test.ts` — les dix cas du tableau unitaire | aucun (fichier neuf, aucun important) |
| Porte + union dans `collect` | S | `packages/opencode/src/tool/shell.ts:388-404` | `test/tool/shell-mutation-detect.integration.test.ts` | **oui** — `test/shell/shell.test.ts` (**vert**, à relire avant patch) et `test/tool/shell-output-prompt.test.ts` ; `test/tool/shell.test.ts` est déjà rouge et instable, ne pas s'en servir de base |
| `FLAGS` reçoit `"-filepath"` | XS | `packages/opencode/src/tool/shell.ts:78` | cas `tee-object -FilePath C:\x` dans le fichier d'intégration | **oui** — même lecture que ci-dessus (ajout additif, mais `pathArgs` est partagé) |
| Réécriture de §7 : base opposable sur `test/shell/shell.test.ts`, `test/tool/shell.test.ts` en preuve rapportée, chiffres 63/32/1 et baseline existante cités | XS | `docs/harness-audit/proposals/P13-mutation-detection.md:641-674` | aucun (document) | aucun |
| Correction de la citation `scout` dans §3.10 | XS | `docs/harness-audit/proposals/P13-mutation-detection.md:269-271` | aucun (document) | aucun |