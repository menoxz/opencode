# P13 — revalidation, cycle 2

Revalidateur de cycle 2. Je n'ai **pas** écrit la proposition, je n'ai pas de shell, **aucun `git`
exécuté**, aucun fichier sous `packages/**` modifié, aucun autre fichier écrit que celui-ci. Je juge,
je ne corrige pas : tout ce que je constate de faux reste un finding.

Sources lues : `docs/harness-audit/proposals/P13-mutation-detection.md` (848 lignes),
`docs/harness-audit/verdicts/P13-revalidation.md` (195 lignes), puis les ancres citées dans le code
réel. Mesures de l'orchestrateur reprises sans être rediscutées : 848 lignes, titre `## Residus`
présent, 5 lignes `| open |`, `test/config/plugin.test.ts` à 0/0, instabilité de
`test/tool/shell.test.ts`, absence établie par `read` et non par glob.

## 1. Les six blocages du cycle 1, un par un

**`#1` — preuve d'absence invalide fondée sur un glob : FERMÉ.**
La phrase « la baseline de vague 4 n'existe pas » est explicitement retirée et l'auto-règle est
énoncée en tête de document. Le nouveau §7 écrit : « La phrase […] est **retirée** : elle reposait
sur un glob sans résultat, c'est-à-dire sur une preuve d'absence invalide
(`P13-revalidation.md:142`) » — `P13-mutation-detection.md:731-733`. La baseline est désormais citée
comme **existant** : `:734-736`. Et la règle elle-même est appliquée au cas d'absence du chemin de
test, par `read` : `:726-729` « Le chemin `test/tool/shell/shell.test.ts` que la version précédente
prescrivait **n'existe pas**, établi cette fois par **`read` direct** — la tentative de lecture de ce
chemin renvoie `File not found`, pas un résultat vide. » Je n'ai pas d'absence non établie par glob
dans le fichier.

**`#2` — chiffres périmés reconduits : FERMÉ.**
`:737-741` : « Les chiffres de référence sont donc **63 / 32 / 1**. Les chiffres `68 / 27 / 3` et
« 26 échecs dans `tool.shell permissions` » que la version précédente reconduisait sont **périmés**
[…] `CORRECTIONS.md:50` (C-40) les corrige en 63/32/1 et **28** échecs de permissions. Je ne les
réemploie nulle part dans ce document. » Je n'ai trouvé aucune reprise de `68/27/3` ni de « 26
échecs » comme référence opposable ; les deux occurrences sont des citations du périmé, marquées
comme telles.

**`#3` — critère non discriminant sur une suite instable : FERMÉ.**
`:743-750` retire explicitement le triplet : « Deux exécutions successives **sans aucune
modification du dépôt** donnent **63 pass / 32 fail / 1 error** […] puis **62 pass / 33 fail / 4
errors** […] **Substituer 63/32/1 ne rendrait pas le critère falsifiable.** C'est pourquoi le volet B
ci-dessous ne porte pas sur cette suite ». Le report est effectif : le volet B porte sur
`test/shell/shell.test.ts` (`:752-755`, `:763-764`) et `test/tool/shell.test.ts` est rétrogradé en
volet C « informative seulement […] **Aucune** variation de ses chiffres n'est qualifiée de régression
ni de succès, et son résultat ne conditionne pas l'acceptation » (`:774-779`). La base instable ne
porte plus aucun critère.

**`#4` — affirmation fausse sur la composition des permissions : FERMÉ, et vérifié contre le code.**
Le bloc `scout` est réécrit. `:288` annonce « Relevé exact de `agent.ts:224-243`, relu », puis `:293-296`
donne le bloc `scout` (`agent.ts:230-242`) : `"*": "deny"`, `grep`/`glob`/`webfetch`, **`websearch:
"allow"` (`:235`)**, `read`, `repo_clone`, `repo_overview`, `external_directory`, puis « **Aucune clé
`bash` dans ce bloc** ; `agent.ts:235` est `websearch`, pas `bash` ». Vérification par `read` de
`agent.ts:226-246` : `:231` `"*": "deny"` ✔, `:235` `websearch: "allow"` ✔, `:232-238` aucune clé
`bash` ✔, `:239-242` `external_directory` ✔, `:228-245` `Permission.merge(defaults, fromConfig(…), user)`
✔. `:291` donne `explore` avec `bash: "allow"` (`agent.ts:210`) ✔ et `:284-285` `"*": "deny"` en
`agent.ts:206` (explore) et `agent.ts:231` (scout) ✔. La conséquence est tirée et assumée : `:300-308`
« scout […] et non « totalement silencieuse » comme l'affirmait la version précédente », avec
`defaults = "*": "allow"` (`agent.ts:117`, vérifié) et `findLast` (`packages/core/src/permission.ts:25`,
vérifié). Le défaut `#4` du cycle 1 est corrigé sur le fond, et la correction est exacte.

**`#8` — critère de succès C-24 `open` : FERMÉ.**
`:757-762` redéfinit le critère comme une tripartition et non « la suite passe » ; `:763-773` fixe le
volet B sur l'**exit code** d'une base verte et stable, avec `SHELL_TEST_EXIT=0` et 12 pass / 0 fail,
et interdit explicitement la substitution par un zéro : « **Il n'est pas substituable par 0 pass / 0
fail** : ce résultat signale un mauvais chemin de test, pas une suite verte » (`:770-771`). Le
traitement du cas `plugin.test.ts` y est correct et vérifiable : `:771-773` « Contrôle de chemin
exigé : `read` du fichier visé doit renvoyer des lignes avant toute exécution, comme pour
`packages/opencode/test/config/plugin.test.ts`, où la lecture ne renvoie **aucune ligne** ». Mon `read`
sur ce fichier renvoie bien un fichier de **0 ligne** — la vérification est honnête. S'y ajoute un
**contrôle de falsifiabilité exigé** (`:781-790`) : neutraliser `write.inline`, exiger l'échec du test
d'intégration, et `:788-790` déclare `INFERE:` / « pas été exécuté » plutôt que de le présenter comme
fait. Le critère est désormais discriminant sur du neuf et sur une base stable.

**`#11` — remède RC1 ni tranché ni implémenté : FERMÉ.**
Le second hunk existe et est écrit dans le diff, pas seulement annoncé : `:446-465`. `:451`
`@@ shell.ts:279-290 @@`, `:457-459` création de `detectorGlobs` depuis `scan.detected`, `:464-465`
`-      always: globs,` / `+      always: globs.filter((glob) => !detectorGlobs.has(glob)),`.
Le premier hunk pose la contrepartie : `:434` `const fromDetector = new Set(write.paths) // remède
RC1` et `:441` `+            if (fromDetector.has(arg)) scan.detected.add(dir)`. La formulation
« à valider » a disparu : `:622` « Ce n'est plus une proposition à valider : c'est le second hunk du
diff de §4 », `:808` « **Décision 1 — remède RC1 : ADOPTÉ, et inscrit dans le diff de §4.** Ce n'est
plus une question ouverte », avec son coût écrit (`:812-814`). Le onzième cas de test qui l'exerce est
écrit : `:711-713`. Le remède est donc, cette fois, **tranché et porté par le diff**.

**Bilan des six : 6/6 fermés.** Aucun n'est requalifié par l'auteur : chacun l'est par un
texte précis, et pour quatre d'entre eux par une relecture contre le code réel.

## 2. Audit de citations de la nouvelle proposition

Recherche methodique sur les quatre familles signalées à risque, plus le harnais de test. **34
citations confirmées, 18 ancres périmées** (et non fausses quant au fond : dans 15 cas sur 18 le
**contenu cité existe bien à la ligne réelle**, seule l'ancre est décalée — voir le tableau C1).

Confirmées par `read` : `shell.ts:41` (`CWD`) ✔ ; `shell.ts:78-79` (`FLAGS`, `SWITCHES`) ✔ ;
`shell.ts:114` (`item.type === "redirection"`) ✔ ; `shell.ts:189-194` (`function dynamic`, sans
`export`) ✔ ; `shell.ts:196-201` (`function prefix`, sans `export`) ✔ ; `shell.ts:203-232`
(`function pathArgs`) ✔ ; **`shell.ts:224-229`** ✔ (dans `pathArgs` : `:226` `SWITCHES.has(flag)`,
`:227` `want = FLAGS.has(flag)` — la citation est juste) ; `shell/id.ts:16` `ToolID = "bash"` et
commentaire `:14-15` ✔ ; `truncate.ts:18` `GLOB = path.join(TRUNCATION_DIR, "*")` ✔ ;
`instance-context.ts:18-24` / `:19` / `:23` ✔ (`ctx.worktree === "/"` court-circuit bien en `:22`) ;
`packages/core/src/permission.ts:21-31` / `:25` `findLast` / `:33-35` `merge` ✔ ;
`wildcard.ts:3-13` et l'ancrage `"^" + escaped + "$"` en `:13` ✔ ; `arity.ts:5` `tokens.slice(0, arity)`
et repli `:8` ✔ ; `arity.ts:135` `python: 2` ✔ ; `permission/index.ts:234` `evaluate(...)` ✔ ;
`:241` `if (rule.action === "allow") continue` ✔ ; `:304-310` versement de `existing.info.always` ✔ ;
`:345-357` `fromConfig` ✔ ; `:154-160` `guardEscalates` ✔ ; `agent.ts:106-110`, `:111-114`, `:117`,
`:119-122`, `:203-217`, `:206`, `:210`, `:214`, `:226-245`, `:230-242`, `:231`, `:235`, `:239-242`,
`:241`, `:356-370`, `:359-364`, `:366-369` ✔ (bloc relu en entier) ; `test/shell/shell.test.ts` =
133 lignes ✔ ; `test/config/plugin.test.ts` = 0 ligne ✔.

Périmées — finding C1, toutes en `packages/opencode/src/tool/shell.ts` :

| ancre citée | ligne réelle vérifiée | cité en (nouvelle proposition) |
|---|---|---|
| `:646` `const ps = Shell.ps(shell)` | `:735` | `:214` |
| `:649` parse wasm | `:738` | `:673` |
| `:646`-`:654` (bloc `ps`/`parse`/`collect`/`ask`) | `:735`-`:743` | `:214`-… (étapes 1-3) |
| `:390-426` définition de `collect` | `:476` | `:213` (étape 3) |
| `:397-401` les trois `Set` de `scan` | `:483-487` | `:471`, `:474` (hunk `@@`) |
| `:409` la porte unique | `:495` | `:117`, `:418`, `:421` |
| `:410-417` `pathArgs` → `argPath` | `:496`-`:502` | étape 4 (bloc `:213`-…) |
| `:419-422` `scan.patterns` / `scan.always` | `:505-507` | `:32`, `:168`, `:182`, `:606` |
| `:421` `scan.always.add(… prefix …)` | `:507` | `:182`, `:606` |
| `:413` `containsPath(resolved, instance)` | `:499` | `:197`, `:534`, `:634`, `:717`, `:848` |
| `:414` `fs.isDir` | `:502` | `:686` |
| `:420` `scan.patterns.add(source(node))` | `:506` | `:564` |
| `:406` `tokens = command.map(i => i.text)` | `:492` | `:393` |
| `:279-290` demande `external_directory` | `:365-374` | `:138`, `:230`, `:451` (hunk `@@`) |
| `:284-289` / `:285` / `:287` / `:288` | `:371`/`:371`/`:373`/`:374` | `:32`, `:34`, `:49`, `:50`, `:153`, `:581`, `:610`, `:822` |
| `:297` second `metadata: {}` | `:383` | `:34`, `:154`, `:677` |
| `:292-298` permission générique | `:378-383` | `:156` |
| `:301-313` / `:301-322` lancement | `:388-399` / `:387` | `:570`, `:689` |

Conséquence non cosmétique, et c'est ce qui justifie la sévérité haute : le diff est écrit contre des
numéros de ligne faux. `:418` annonce « un seul site de branchement, **ligne 409** », et les en-têtes
`@@ shell.ts:279-290 @@` (`:451`) et `@@ shell.ts:397-401 @@` (`:474`) ne peuvent pas s'appliquer sur
`shell.ts`. Un implémenteur qui suit le document à la lettre ne pose pas le patch. Le remède est
mécanique — recalculer les ancres sur `shell.ts:365-374`, `:378-383`, `:483-487`, `:495-507`,
`:735-743` — mais il est **requis** tant que le diff n'est pas re-ancré. C'est le même défaut que
`#4` du cycle 1, dans une autre famille de fichiers, et il avait été annoncé comme le point de
vigilance.

Finding C2, dans le harnais de test : `:663` et `:716` citent
`packages/opencode/test/tool/shell.test.ts:215` pour le début de `describe("tool.shell permissions")`
et `:222-232` pour le motif à copier (`capture(requests)` puis l'assertion `permission`). Mon `read` de
`test/tool/shell.test.ts:211-234` : le bloc qui se termine `:228` appartient à `describe("tool.shell")`,
`describe("tool.shell permissions")` commence à **`:230`**, et le premier `test` est `:231` — donc
l'ancre est décalée d'au moins 15 lignes, et la « copie du motif » dérive sur un test voisin. Même
cause, fichier différent.

## 3. Comptage exact des résidus `open`

J'ai lu la **colonne de statut**, pas le motif. La table `## Residus` (`:839-848`) contient huit
lignes, dont :

- `| open |` au caractère près, exactement : **5** — R1 (`:841`), R2 (`:842`), R3 (`:843`), R4 (`:844`),
  R7 (`:847`). Ce chiffre **concorde** avec la mesure de l'orchestrateur.
- `| open (hors périmètre) |` : **1** — R6 (`:846`). Résidu `open` à part entière, avec une mention
  d'exclusion de périmètre qui n'a rien enlevé au statut.
- `| accepted (réserve assumée) |` : R5 (`:845`) ; `| accepted (assumé) |` : R8 (`:848`). **Ces deux
  lignes ne sont pas des résidus `open`**, et R5 le confirme par son texte — « Raison du maintien **en
  registre `open`** » (`:845`) — ce qui est en contradiction avec sa propre colonne `statut`.

**Comptage exact par la colonne de statut : 6 résidus `open` sur 8 (R1, R2, R3, R4, R6, R7).**
L'annonce de l'auteur — « 8 résidus dont 6 `open` » — est donc juste, mais elle **n'est atteignable que
par lecture de la colonne de statut**. Le décompte par motif `| open |` en donne 5. L'écart n'est pas
une faute de l'auteur sur ses propres résidus : c'est un défaut de méthode de comptage, et il est
prévisible (le motif est aussi un motif de recherche, donc une preuve d'absence par motif est
exactement le vice que `#1` condemne chez les autres — même famille, autre chemin). Finding C3.

Reste que **6 résidus `open`** sont déclarés par la proposition elle-même, dont deux sont des portes de
acceptation non jouées : R3 (le contrôle négatif du volet A n'a pas été exécuté, `:843`) et R4
(`TYPECHECK_EXIT=0` après patch non exécuté, `:844`). À quoi s'ajoutent les trois findings `open` de
la présente revalidation : C1, C2 et C3.

## Final verdict

`NOT_IMPLEMENTABLE`

RESIDUES_REMAINING: 6

6 résidus `open` subsistent dans la proposition, lus dans leur colonne de statut (R1, R2, R3, R4, R6,
R7) — dont le motif de recherche `| open |` n'en compte que 5. Deux d'entre eux (R3, R4) sont des
portes de succès que la proposition reconnaît n'avoir pas jouées. S'y ajoutent 3 findings `open`
issus de cette revalidation (C1, C2, C3). Règle C-32 appliquée sans nuance : il reste au moins un
résidu `open`, donc le verdict est `NOT_IMPLEMENTABLE`.

Ce que la vague 2 a acquis et qui ne sera pas repris : les six blocants du cycle 1 sont réellement
fermés, dont `#4` par une relecture exacte de `agent.ts:226-246` et `#11` par un second hunk écrit dans
le diff. Le patch lui-même n'a pas été réexaminé comme code exécutable — c'est une proposition, sans
shell, sans application — et je n'ai rien à redire sur son fond.

| id | severite | statut | preuve |
|---|---|---|---|
| `#1` preuve d'absence par glob | — | **closed** | `P13-mutation-detection.md:731-733` retire la phrase et nomme le vice ; `:734-736` cite la baseline comme existante ; `:726-729` applique `read` → `File not found` pour le chemin de test |
| `#2` chiffres périmés | — | **closed** | `P13-mutation-detection.md:737-741` fixe 63/32/1 et 28, et déclare ne pas réemployer `68/27/3` |
| `#3` critère non discriminant | — | **closed** | `P13-mutation-detection.md:743-750` (instabilité citée, substitution rejetée) ; `:752-755` et `:763-764` (base stable) ; `:774-779` (volet C non bloquant) |
| `#4` composition des permissions | — | **closed** | `P13-mutation-detection.md:288`, `:293-296` ; relu contre `agent.ts:231` `"*": "deny"`, `agent.ts:232-238` aucune clé `bash`, `agent.ts:235` `websearch: "allow"`, `agent.ts:239-242` `external_directory` |
| `#8` critère de succès C-24 | — | **closed** | `P13-mutation-detection.md:757-762` (volet A) ; `:763-773` (volet B sur exit code, 0/0 explicitement non substituable) ; `:781-790` (contrôle de falsifiabilité, `INFERE:` non exécuté) |
| `#11` remède RC1 | — | **closed** | `P13-mutation-detection.md:446-465` (second hunk : `:457`, `:464-465`) ; `:434` et `:441` (contrepartie `scan.detected`) ; `:622` et `:808` (tranché, plus « à valider ») |
| R1 instabilité de `test/tool/shell.test.ts` | moyenne | **open** | `P13-mutation-detection.md:841` ; cause `RepeatedCallError` ; non corrigible par P13, assumée |
| R2 écart de comptage sur `wave4-baseline.md` | faible | **open** | `P13-mutation-detection.md:842` (192 lignes selon `P13-revalidation.md:142` vs 135 lignes / 10 suites selon `CORRECTIONS.md:51`) |
| R3 contrôle négatif du volet A non exécuté | haute | **open** | `P13-mutation-detection.md:843` ; spécifié en `:781-790`, jamais joué |
| R4 `TYPECHECK_EXIT=0` après patch non exécuté | haute | **open** | `P13-mutation-detection.md:844` ; seuil sur l'état courant, `CORRECTIONS.md:56` |
| R6 couplage `agent.ts` non testé | moyenne | **open** | `P13-mutation-detection.md:846` ; `agent.ts:356-370` réécrit une règle que `agent.ts:119-121` déclare ; hors périmètre assumé |
| R7 comportement sous `scout` non mesuré | moyenne | **open** | `P13-mutation-detection.md:847` ; inférence depuis `agent.ts:117`, `agent.ts:231`, `packages/core/src/permission.ts:25`/`:33-35`, sans exécution |
| R5 doublage `dynamic`/`prefix` | faible | **accepted** | `P13-mutation-detection.md:845` ; original `shell.ts:189-194` et `:196-201` sans `export`, copies en `:333` et `:341` |
| R8 faux positifs `sed -n` / `tee` relais | faible | **accepted** | `P13-mutation-detection.md:848` ; bornés par `shell.ts:413` (**réel : `shell.ts:499`**) + `instance-context.ts:19`/`:23` |
| C1 ancres `shell.ts` périmées (18) | **haute** | **open** | `P13-mutation-detection.md:418` (« ligne 409 ») et `:451` / `:474` (en-têtes `@@`) ; réel `shell.ts:495`, `:365-374`, `:483-487` — voir le tableau du §2 |
| C2 ancre du harnais de test périmée | haute | **open** | `P13-mutation-detection.md:663` et `:716` (`test/tool/shell.test.ts:215` / `:222-232`) ; réel `test/tool/shell.test.ts:230` (début de `describe`) et `:231` (premier `test`) |
| C3 décompte des résidus non reproductible par motif | moyenne | **open** | `P13-mutation-detection.md:846` (`open (hors périmètre)`) et `:845` (`accepted` alors que le texte dit « registre `open` ») ; motif `\| open \|` = 5 (`:841`, `:842`, `:843`, `:844`, `:847`) contre 6 par la colonne de statut |

### Handed back to

À l'auteur de `docs/harness-audit/proposals/P13-mutation-detection.md`, pour une vague 5 limitée à
quatre objets, tous mécaniques :

1. Ré-ancrer le diff de §4 sur les lignes réelles de `shell.ts` — `:365-374` (demande
   `external_directory`), `:378-383` (permission générique), `:483-487` (`scan`), `:495-507` (porte et
   `scan.always`), `:735-743` (bloc `ps`/`parse`/`collect`/`ask`) — et corriger en conséquence `:117`,
   `:138`, `:153-156`, `:168`, `:182`, `:197`, `:214`, `:230`, `:393`, `:418`, `:451`, `:471`, `:474`,
   `:534`, `:564`, `:570`, `:581`, `:606`, `:610`, `:634`, `:673`, `:677`, `:686`, `:689`, `:717`.
   Le diff doit redevenir applicable tel qu'écrit (C1).
2. Corriger `:663` et `:716` sur `test/tool/shell.test.ts:230` et suivants (C2).
3. Uniformiser la table `## Residus` : soit R5 passe en `open` — son texte le demande —, soit sa
   colonne preuve cesse de dire « registre `open` » ; et décider une fois pour toutes si
   `open (hors périmètre)` est un statut ou une note, pour que le décompte soit reproductible en
   lisant la seule colonne de statut, sans motif de recherche (C3).
4. Exécuter R3 et R4, qui ne sont pas des discussions : ce sont les deux portes qui manquent.

Les six blocants du cycle 1 ne sont pas à rouvrir. C-12, C-13, C-14, RC2, RC3, RC6 restent acquis, et
le mécanisme du patch (porte rétrécie sur `write.inline`, union et non substitution, copie assumée de
`dynamic`/`prefix`) n'a fait l'objet d'aucune contestation de ma part.
