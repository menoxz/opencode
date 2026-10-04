# P07 — revalidation vague 4 (2ᵉ vague, sur proposition révisée)

Révalidateur indépendant. Je n'ai rédigé ni la proposition initiale, ni le verdict de la vague 3b, ni la révision ;
je n'édite pas la proposition. Aucun `git`, aucun commit, aucun fichier modifié sous `packages/**`.

**Objet exact de cette revalidation.** La revalidation antérieure (`verdicts/P07-revalidation.md`, 338 lignes) a porté
sur une proposition de **638 lignes**. Le texte à valider aujourd'hui en compte **403** et se déclare
« réécriture complète » en `:3`. Les trois résidus `R1`/`R2`/`R3` de la vague 2 — les deux `Required changes`
non traités — sont donc rejoués sur un document qui n'a plus grand-chose en commun avec celui qu'ils visaient.

**Base de mesure, mesurée par moi et non reprise de l'état fourni.** Deux lectures successives de `bun typecheck`
(bun 1.4.2, `packages/opencode`) :

| lecture | exit | sortie |
| --- | --- | --- |
| 1re | `TYPECHECK_EXIT=2` | `src/tool/shell.ts(701,24)` et `src/tool/shell.ts(705,34)` — `TS2339: Property 'length' does not exist on type 'Preview'` |
| 2ᵉ | **`TYPECHECK_EXIT=0`** | aucune erreur |

Les deux erreurs de la 1re lecture sont **toutes deux** dans `src/tool/shell.ts`, le fichier qu'un autre agent
édite en ce moment : **C-62 s'applique intégralement**, je les signale, je ne les corrige pas, et je ne les laisse
pas invalider mon verdict. La 2ᵉ lecture referme le cycle une fois l'édition concaténée. **Zéro erreur dans les
fichiers que P07 touche** (`tool/task.ts`, `session/task-evidence.ts`, `session/session.ts`, `session/prompt.ts`,
`session/system.ts`, `tool/registry.ts`). Je n'ai lancé **aucun** test qui exerce `shell.ts` ; la seule base verte
opposable, `test/shell/shell.test.ts` **12 pass / 0 fail**, est reprise de l'état de mesure fourni et je ne l'ai pas
rejouée. Les trois suites conditionnelles (`test/tool/shell.test.ts` instable, `compaction.test.ts` verte
uniquement avec `--timeout 30000`, `test/plugin` instable à SHA constant) ne sont donc des portes que sous
condition, et ne mesurent aucune régression de P07.

## Proposal

| champ | valeur |
| --- | --- |
| fichier | `docs/harness-audit/proposals/P07-subagent-contract.md` |
| taille validée | **403 lignes** (réécriture complète, `:3`) |
| taille validée par la vague 3b | 638 lignes |
| volet unique | §4(a) `:222-238` — homologuer `tests` du packet vers `goalState.completion.evidence` au point `task.ts:511-513` |
| volets écartés | §4(b) schéma exporté `:240` ; §4(c) héritage du répertoire `:255` |

## Revisions applied

Les trois résidus de la vague 3b, dividés sur le **texte** et non sur l'historique du fichier :

**R1 — traité, par abandon du périmètre et non par réécriture.** La vague 3b exigeait (`:40`) de réécrire §4(a) en
`Schema.Union([LaunchParameters, FollowUpParameters])` + base nommée + garde de décodage conservée, et constatait
trois défauts aggravants (forme variadique `proposal:347`, circularité `{ ...Parameters.fields, … }` `:341`,
« supprimer le `Schema.decodeUnknownEffect` » `:350`). **Aucun de ces trois défauts n'existe plus dans le fichier
courant.** Le durcissement du schéma est devenu §4(b), marqué « *écarté, sur la base de E1* » (`:240`), et le
texte en dissuade activement l'usage : `:250-253` écrit que « la forme variadique à deux arguments n'est pas celle
que cette révision a pu vérifier dans le dossier ». La garde est explicitement conservée, et motivée par son
message actionnable : `:245-248` refuse de déplacer le contrôle dans le schéma parce que `task.ts:391-399` produit
une erreur **nommée** dont le message de `task.ts:396` énumère les trois champs attendus — le déplacement « serait
une **régression d'observabilité** ».

**R2 — traité.** La vague 3b exigeait (`:39`) de rendre T3 discriminant et constatait que le scénario non
discriminant était reproduit mot pour mot, l'instance discriminante n'apparaissant nulle part. Le T3 courant
(`:333-351`) porte exactement cette instance, et je l'ai vérifiée ligne à ligne : `:342` l'agent de test **sans**
`budgetMinutes`, `:343` `OPENCODE_TASK_BUDGET_MINUTES` **non défini**, `:344` la durée demandée par l'appel comme
seule source restante — les trois simultanément, comme demandé. Le mécanisme qu'il combat est le bon : `:336-338`
explique que `task.ts:694-695` est un `??`, et j'ai relu `task.ts:694` — `const minutes = next.budgetMinutes ??
taskBudgetMinutes()` — et `:695` — `withBudget(runTask(), minutes)`. `:347` pose le critère de mutation « le test
échoue sur le code d'origine ».

**R3 — traité par réfutation de sa prémisse.** La vague 3b exigeait (`:41`) que T5 asserte le **cwd effectif** d'un
tool-call, et notait que la prémisse de la révision — une égalité de **colonnes** — était fausse. Le texte courant
ne compare plus aucune colonne : §4(c) est **écarté** (`:255`) sur une lecture que j'ai rejouée. `prompt.ts:719`
retourne le contexte d'instance, `prompt.ts:731` inscrit `path: { cwd: ctx.directory, root: ctx.worktree }` — les
deux lignes sont exactes au caractère près. `session: Session.Info` est bien déstructuré à `prompt.ts:715` et
`:718`, et n'est pas la source du `cwd`, comme affirmé. `system.ts:97` procède de même et `system.ts:103` publie
`  Working directory: ${ctx.directory}`. J'ai ajouté le contrôle qui manquait à la vague 3b : `grep ctx.directory`
sur `src/tool` ne rend **qu'un seul** résultat, `registry.ts:245  directory: ctx.directory` (positif, C-66), et
`grep session.directory` sur `src` rend **10 résultats, tous dans des chemins d'affichage** (`cli/cmd/tui/routes/
session/index.tsx:734`, `session-nav-panel.tsx:162`, `session-nav.ts:178,221,242,243,293,296`,
`acp/agent.ts:652`, `cli/cmd/session.ts:144`) — **aucun** dans le chemin de lancement. Le cwd ne
peut donc pas venir de la colonne.

**R5 — traitement partiel.** La citation `session.ts:942-943` est explicitement retirée en `:11`, `:179-180`, et
remplacée par `session.ts:936-937`, que j'ai relue et qui est exacte (`input.directory` puis
`or(...conds, and(isNull(SessionTable.path), eq(SessionTable.directory, input.directory)))!`). La fausse
affirmation « indexée » a disparu : `grep 'indexée|indexé sur|index sur'` sur `docs/harness-audit/proposals/*.md`
ne rend **aucun** résultat, et le motif est prouvé fonctionnel puisqu'il rend `CORRECTIONS.md:66` dans la même
arborescence (C-66). Mais la correction a **débordé** en une affirmation fausse — voir `N1`.

**Ce que j'ai revérifié sans changement notable.** La couture réelle est celle que le texte décrit :
`task.ts:69-81` exporte bien un `Parameters` laxiste, `task.ts:83-88` porte bien les obligations **hors** du
chemin de validation, `task.ts:391-399` applique `Schema.decodeUnknownEffect(LaunchParameters)` et produit bien la
`Tool.InvalidArgumentsError` au message de `:396`, `task.ts:404` rejette bien le prompt tronqué. Le point de fusion
visé par §4(a) est réel et correctement numéroté : `task.ts:506` est bien `if (!current.goalState ||
packet.findings.length === 0) return`, `:509-517` écrit le `goalState` parent, `:511-513` est bien
`goalState: { …current.goalState, findings,`, et `:514` incrémente bien `version`. Les deux conséquences que §4(a)
exige de traiter dans le même lot (`:232` sur `:506`, `:234` sur `:514`) sont donc correctement ancrées. Les bornes
de troncature de §4(a) (`:225`) et de T2 (`:330`) sont exactes : `task-evidence.ts:40` `item.proof.slice(0, 1_000)`,
`:42` `item.dod.slice(0, 500)`, `:62` `tests: allTests.slice(0, 32)`. `Session.create` (`session.ts:670-690`) ne
prend **pas** `directory` et passe `directory: ctx.directory` en `:682` — le bloc de code cité par P07 `:186-189`
est reproduit au numéro de ligne près. **Les affirmations de la vague 3b qui portaient sur des lignes de code
tiennent toutes.**

## Status

Statuts posés selon la table du gabarit (`REVALIDATION-BRIEFS.md:61-66`) : `open` seul est bloquant. Je n'emploie
pas `refused` pour `R1`/`R2`/`R3` : le gabarit réserve `refused` à une objection **démontrée fausse**, alors que
ces trois objections étaient **fondées** et ont été dépassées par la réécriture — c'est la définition de
`accepted` (« traitée quant au fond, avec une réserve assumée et tracée »), avec la trace que j'en fais ici.

| résidu | exigence de la vague 3b | statut courant | preuve |
| --- | --- | --- | --- |
| **R1** | réécrire §4(a) en `Schema.Union` tableau + base nommée + garde conservée | **`accepted`** | les trois défauts visés ont disparu ; le seul `Schema.Union` de tout `docs/harness-audit/proposals` est la mise en garde `P07:250` (§4(b) écarté `:240`, garde conservée `:245-248`) |
| **R2** | rendre T3 discriminant | **`accepted`** | les trois conditions discriminantes sont écrites `:342-344`, critère de mutation `:347` ; le `??` visceral est relu (`task.ts:694`) |
| **R3** | asserter le cwd effectif, conditionner (d) à la preuve que le cwd vient de la colonne | **`accepted`** | §4(c) écarté `:255` ; cwd prouvé venant du contexte d'instance (`prompt.ts:731`, `system.ts:103`, `registry.ts:245`), **0** lecture de `session.directory` sur le chemin de lancement |
| **R5** | corriger `942-943` → `936-937` ; vérifier `task.ts:236` | **`accepted`** | correction appliquée `:11`/`:179-180`, `936-937` exacte, « indexée » éliminée — **réserve** reportée en `N1` |
| **N1** | (nouveau) | **`open`** | `P07:192` |
| **N2** | (nouveau) | **`open`** | `P07:333-351` contre `:240`/`:349-351` |

## Remaining objections

**`N1` — `open` — `P07:192` affirme une unicité fausse sur le code.**
La ligne écrit : « `session.ts:936-937` est **le seul endroit** du fichier où `input.directory` apparaît ».
`grep input.directory` sur `src/session` rend **6 résultats** : `session.ts:553`, `:936`, `:937`, `:942`, `:943`,
`:984`. Le motif est positif et donc probant (C-66). `936-937` n'est donc pas le seul endroit : `:942-943` existe
toujours et lit le même champ, et `:984` en est une troisième lecture. La conséquence n'est pas cosmétique :
l'argument qui écarte §4(c) repose sur le fait que « le filtre de listage » n'est pas la source du `cwd`, ce qui
reste vrai, mais la proposition **s'appuie sur une affirmation de cardinalité que le code contredit**, et c'est une
citation fausse au sens du brief, donc objection bloquante.
**Remède, une ligne :** supprimer « est le seul endroit du fichier où » à `:192`, ou le remplacer par « est l'un des
trois endroits du fichier qui lisent `input.directory` (`:936-937`, `:942-943`, `:984`), tous dans des filtres de
listage ».

**`N2` — `open` — T3 est conservé contre sa propre condition de suppression.**
`P07:349-351` est explicite : « Ce test ne valide aujourd'hui **aucun** volet de cette proposition, et c'est
volontaire […] **Si le validateur écarte (b), T3 doit être supprimé plutôt que conservé en l'état.** » Or §4(b) est
écarté par le texte lui-même en `:240`. La condition est donc remplie et le texte ne la respecte pas. Je qualifie
ce défaut de mineur en portée de code — un test qui ne prouve rien ne casse rien — mais **je ne le requalifierai pas
en `out_of_scope` pour franchir la porte** : C-22, C-42, C-50 et C-107 l'ont sanctionné chez d'autres, et
l'observation est le livrable. Règle 10 : défaut trouvé dans la proposition ⇒ `open`, avec remède.
**Remède, une ligne :** supprimer le bloc `P07:333-351` (T3), la condition qu'il énonce lui-même étant satisfaite
par l'écartement de §4(b).

**Non vérifié, non faux — signalé sans objection.** `P07:193` cite `session.ts:219` comme relevant du même ensemble
d'appels ; je n'ai pas rouvert cette ligne et je ne la conteste pas. `P07` désigne `task-evidence.ts` par son seul
nom de fichier alors qu'il se trouve dans `src/session/` : les numéros de ligne sont exacts et sans ambiguïté (un
seul fichier de ce nom dans le dépôt), c'est une imprécision de chemin, pas une citation fausse. `task.ts:236`, que
la vague 3b avait acceptée (R6), est reprise en `:212` ; je ne la recertifie pas, sa plage ayant été ouverte par le
validateur de la vague 3b et non par moi.

## Regressions introduced

**Preexistantes — ni introduites par la révision, ni imputables à P07.** Le défaut que P07 combat — une DoD d'enfant
perdue à chaque délégation, faute de fusion de `tests` — est le **sujet** de la proposition, pas une régression
qu'elle aurait créée. Les deux erreurs de typecheck de la 1re lecture sont un artefact de l'édition concurrente de
`src/tool/shell.ts` par un autre agent : **C-62**, signalées, non corrigées, sans effet sur ce verdict, et
disparues à la 2ᵉ lecture. Les trois suites conditionnelles citées dans l'état de mesure sont instables ou
sensibles au timeout **à SHA constant** : elles ne mesurent donc aucune régression de P07.

**Introduites par la réécriture — deux, toutes deux dans le texte.** `N1` et `N2` n'existaient pas dans la version
de 638 lignes : `N1` parce que l'ancien texte citait `942-943`, une ligne qui existe et lit bien `input.directory`,
sans revendiquer d'unicité ; `N2` parce que l'ancien T3 et l'ancien §4(a) vivaient dans le même registre, tandis que
la réécriture a séparé un volet écarté et une condition de suppression non exécutée. **Aucune régression dans le
code** : je n'ai modifié aucun fichier sous `packages/**`, et la proposition elle-même ne propose qu'un ajout au
point `task.ts:511-513` assorti des deux ajustements qu'elle nomme elle-même (`:232`, `:234`).

## Final verdict

**REVALIDATED-PASS_WITH_CHANGES**

Les trois résidus de la vague 3b ne sont pas des lésions refermées par des formulations : la proposition a été
réécrite, et les trois exigences sont satisfaites sur le texte courant — `R1` par l'écartement motivé du volet et
l'abandon explicite de ses trois défauts, `R2` par une instance discriminante enfin écrite, `R3` par une réfutation
mesurée de la prémisse que la vague 3b avait qualifiée de fausse. Le mécanisme décrit est exact là où je l'ai
contrôlé ligne à ligne, et la couture réelle du contrat sous-agent est bien celle que le texte redescrit.

**Non implémentable en l'état** : `N1` et `N2` sont `open`. Le gabarit (`:51-66`, règle d'implémentabilité vague 4)
fait d'un **seul** résidu `open` une interdiction d'implémenter. Les deux sont des corrections de texte d'une
ligne ou d'un bloc, sans effet de conception : `R1`/`R2`/`R3` sont traités, `R5` est traité sous réserve tracée, et
aucune objection ne subsiste sur le fond du mécanisme proposé.

## Handed back to

L'agent de révision de **P07** (vague 4). Aucun nom d'agent n'est enregistré dans les documents que j'ai lus
(`P07:3` ne mentionne que le verdict et la date), je le désigne donc par sa fonction.

Deux corrections, à faire dans la seule proposition, aucune ne touchant `packages/**` :

1. `P07:192` — retirer l'affirmation d'unicité sur `input.directory` (voir `N1`, remède d'une ligne).
2. `P07:333-351` — supprimer le bloc T3, sa condition de suppression étant satisfaite par l'écartement de §4(b)
   (voir `N2`).

Après ces deux retraits, aucun résidu `open` ne subsiste et la proposition redevient implémentable. Je n'ai ni
édité la proposition ni ne le ferai : la main lui revient.

## Grille d'effort

| item | effort | fichier principal | test à écrire | casser un test existant ? |
| --- | --- | --- | --- | --- |
| `N1` — retirer l'unicité fausse de `:192` | 1 ligne | `docs/harness-audit/proposals/P07-subagent-contract.md` | aucun (correction de texte) | non |
| `N2` — supprimer le bloc T3 `:333-351` | 1 bloc | `docs/harness-audit/proposals/P07-subagent-contract.md` | aucun (retrait de test redondant) | non |
| réserve `R5` — reprise avec `N1` | 1 ligne | `docs/harness-audit/proposals/P07-subagent-contract.md` | aucun | non |