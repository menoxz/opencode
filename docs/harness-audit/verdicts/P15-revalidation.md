# Revalidation P15 — `plugin-bridge-null`

Revalidateur indépendant. Ni la proposition initiale, ni son verdict, ni la révision n'ont été
rédigés par moi. **Aucun fichier sous `packages/**` n'a été modifié** ; **aucune commande `git`**.

---

## Proposal

`docs/harness-audit/proposals/P15-plugin-bridge-null.md` (546 lignes, version révisée).

Objet : supprimer le champ nullable `let bridge: EffectBridge.Shape | null` de
`packages/opencode/src/plugin/index.ts`, afin de fermer le trou de type `TS18047` relevé en C-08
et de supprimer le `Effect.succeed(null as any)` associé. Verdict d'origine `P15-verdict.md` :
`PASS_WITH_CHANGES`.

**Vérification du patch prescrite par le typecheck.** Je l'ai faite **hors du dépôt**, par
mesure, et je le déclare explicitement comme le demande le DoD. Protocole : copie de
`packages/opencode/src` vers `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p15-verify`, puis
config `@tsconfig/bun` recopiée à l'identique dans un `tsconfig.verify.json` local avec
`"strict": true` (vérifié : le fichier source du dépôt n'a pas été touché). La base de
comparaison est **le même fichier non patché dans la même copie**, ce qui élimine toute
dérive d'environnement.

| # | État du fichier `plugin/index.ts` copié | exit | erreurs totales | erreurs dans `plugin/index.ts` | diagnostic décisif |
|---|---|---|---|---|---|
| 0 | **non patché** (référence) | 2 | **1094** | **7** | les 7 sont Environmental (`@opencode-ai/plugin`, `@opencode-ai/sdk`, global `Bun` absent dans la copie) |
| 1 | **contrôle C-18** : `const b = bridge` dans la closure + `b.promise` | 2 | **1095** | **8** | **`TS18047: 'b' is possibly 'null'` (360,7)** — **+1** |
| 2 | **patch révisé** tel que prescrit | 2 | **1094** | **7** | **aucun** — jeu de diagnostics *identique* à la référence |
| 3 | **contrôle négatif** : `: Shape` muté en `: number` | 2 | 1097 | 10 | **`TS2322: Type 'Shape' is not assignable to type 'number'` (319,13)** |

Les courses 1 et 3 sont ce qui rend la course 2 signifiante. Sans la course 1, « aucune nouvelle
erreur » serait **vide de sens** : le harnais pourrait ne pas voir le défaut. La course 1 le voit.
Sans la course 3, l'assertion pourrait être **vacuement satisfaite** (si `Shape` s'était
dégradé en `any` dans la copie) ; la course 3 prouve que l'annotation est réellement vérifiée.
Copie restaurée à l'identique : `RESTORED_DIFF=0`.

`bun typecheck` lancé dans le dépôt réel, sans modification : **`TYPECHECK_EXIT=0`** (bun 1.4.2).

**Conclusion du résidu 1 : la compilation est établie par exit code, pas par raisonnement.** Le
patch compilé ne produit aucun diagnostic ; le contrôle C-18 en produit exactement un, du bon
code.

## Revisions applied

Les huit objections du verdict, re-vérifiées une à une contre le code.

| id | statut annoncé par la révision | vérification indépendante | statut réel |
|---|---|---|---|
| `P15-O1` | closed | `const b: EffectBridge.Shape = yield* EffectBridge.make()` sur un `const` non nullable, champ `:280` supprimé. Confirmé par la course 2 (aucun diagnostic) | **closed, prouvé par mesure** |
| `P15-O2` | closed | sémantique d'échec vers `bootstrap.ts:44`, vérifié : `:44` est `yield* plugin.init()` **nu**, contre `:47-51` enrobés de `Effect.catchCause(... Effect.logWarning)`. Aucun `throw` JS ajouté | **closed** |
| `P15-O3` | closed | `makeOptional()` écarté ; ni `as any`, ni `Effect.succeed(null …)`, ni `Effect.as` réintroduits dans le diff | **closed** |
| `P15-O4` | closed | T1 corrigé, T2 sans `expect-type` | **closed quant au fond** ; voir objection 4 |
| `P15-O5` | closed | T3 élargi | **closed** |
| `P15-O6` | closed | `test/plugin/watch-subscribe-throw.test.ts` ajouté (T5) | **closed** |
| `P15-O7` | **open** | jumeau `agent/agent.ts` — voir objection 5 | **→ `out_of_scope`** (reclassé) |
| `P15-O8` | **open, hors périmètre** | `captureSync()` / durée de vie de la closure de layer | **→ `out_of_scope`** (reclassé) |

**Citations re-vérifiées une à une — toutes exactes.** Aucune citation fausse n'a été trouvée.

- `plugin/index.ts:280` = `let bridge: EffectBridge.Shape | null = null` ✔ ; `:279` = `watcherCleanup`, `:281` = `watchingStarted` ✔ (conforme à « 281, 309, 310 »).
- `:308` `ensureWatching` ✔, `:309` `if (watchingStarted) return` ✔, `:310` `watchingStarted = true` ✔, `:311` `if (flags.pure) return` ✔, `:312` la ligne `catchCause` ✔, `:313` `if (!bridge) return` ✔.
- `:137` `const bridge = yield* EffectBridge.make()` ✔ et `:140` `bridge.fork(...)` ✔ — le précédent exact du patch, sans assertion.
- `:397-400` `init` ✔, dont `:398` `yield* InstanceState.get(state)` puis `:399` `yield* ensureWatching()` ✔.
- Occurrences exhaustives de `bridge` : `24`, `137`, `140`, `280`, `312`, `313`, `359` — **et aucune autre**. Le champ n'a bien qu'un consommateur.
- **C-08 avait raison** sur un point que la révision ne tranche pas explicitement : `:366` est `pending.then(...)`, la promesse de `parcelWatcher.subscribe` — **pas** le pont.
- `bridge.ts:54` = `export function make(): Effect.Effect<Shape>` — sans paramètre d'erreur, le canal est `never` ✔. `instance-ref.ts:5-10`, les deux références ont `defaultValue: () => undefined` ✔.

**La chaîne causale — cœur du dossier — est vérifiée.** Elle est exacte et tient bout en bout :
la garde `:313` sort **avant** `log.info("plugin hot-reload watchers active")` **`:329`** et
`log.info("plugin hot-reload watchers armed", { armed: subs.length })` **`:369`** (les deux
lignes de log lues) ; `watchingStarted` est déjà `true` (`:310`), donc le passage est mémorisé
et **irréarmable**. Hot reload éteint, muet, sans réarmement possible. Et le filet ne
protégeait aucune disponibilité : `init` matérialise déjà l'état via `:137`, **une ligne avant**
`:399`. `bootstrap.ts:44` n'enveloppe pas `plugin.init()`. Le raisonnement est correct.

## Status

Le correctif A est **prouvé** : il compile (exit code, avec contrôle positif et contrôle négatif),
il supprime effectivement le seul et unique producteur du type `Shape | null`, et il n'altère
aucun comportement observable. Le correctif B est cohérent avec `AGENTS.md:88`.

Trois affirmations de la révision ne résistent pas à la vérification : le bannissement de
`Effect.succeed`, l'utilité des en-têtes de hunk, et le pouvoir discriminant du plan de
tests. Aucune n'est bloquante ; toutes sont corrigées ci-dessous avec la correction fournie.

## Remaining objections

**1. `refused` — « `packages/opencode/AGENTS.md` banni littéralement `Effect.succeed` ».**
Citation exacte, `packages/opencode/AGENTS.md:88`, sous `# opencode Effect rules` → `## Core` :

> Use `Effect.void` instead of `Effect.succeed(undefined)` or `Effect.succeed(void 0)`.

C'est une règle **étroite**, portant sur l'idiome qui renvoie `undefined` — **pas** un bannissement
de `Effect.succeed`. Contre-exemple dans le dépôt : `bridge.ts:72` lui-même écrit
`Effect.succeed(exit.value)`. La proposition cite la règle correctement (`:297-298`) puis en
tire une conclusion fausse (`:389`, « `Effect.succeed` banni »), et s'en sert pour présenter la
suppression de `:312` comme **contrainte**. Elle ne l'est pas. **Conséquence : la suppression de
`:312` doit être justifiée par (f)+(g)+(h), pas par `AGENTS.md` — et elle l'est** : `make()` a un
canal d'erreur `never` (`bridge.ts:54`), `init` échoue déjà à `:398` via `:137` non protégé, et
`:313` est le seul consommateur de la valeur `null`. Une réécriture aurait produit une valeur
morte ; l'agent de la vague 4 n'a pas à suivre la fausse contrainte.

**2. `accepted` — les en-têtes de hunk sont faux, dans les départs *et* dans les comptages.**
La proposition qualifie ses en-têtes d'« indicatifs » (§Résidus). Ils sont mesurablement faux, et
`git apply` valide **aussi** les comptages. Réponse à la question posée : **un tel patch n'est pas
directement applicable** ; il serait rejeté bruyamment. Headers corrects, mesurés :

| hunk | en-tête publié | en-tête correct | défaut |
|---|---|---|---|
| 1 | `@@ -277,7 +277,6 @@` | `@@ -279,4 +279,3 @@` | départ décalé de 2 ; corps 4/3 |
| 2 | `@@ -308,9 +307,15 @@` | `@@ -308,7 +307,14 @@` | départ juste ; corps 7/14 |
| 3 | `@@ -354,9 +359,9 @@` | `@@ -353,8 +359,8 @@` | départ ancien décalé de 1 ; corps 8/8 |

Résultat mesuré : **451 → 457 lignes** (−3 +9), `const b` en **319**, `b.promise(reload())` en
**365**. Le contenu des trois hunks est exact. **Implémentable en vague 4** : le jeu d'édition est
non ambigu (3 suppressions, 1 remplacement, 8 ajouts de commentaire) et l'échec d'application est
bruyant, jamais silencieux. Non bloquant, mais **`:312` ne doit pas être supprimée sur un offset
erroné** : avec le header publié, l'agent supprimerait `:312-313` puis `+:359`, décalant tout le
reste du fichier d'une ligne et produisant un fichier incohérent.

**3. `accepted` — l'argument de non-régression de la §6 est trop large.** La révision écrit
qu'« une suite rouge ne prouve donc pas une régression ». Sur le chemin concerné par ce patch,
c'est faux : `bun test test/plugin` donne **123 pass / 1 fail**, 124 tests, 14 fichiers, 45,28 s,
l'unique échec étant `plugin.install.concurrent > serializes concurrent server+tui config
updates across processes` — **rouge avant toute implémentation**. La suite est donc un instrument
plus fin que « 8 tests rouges » (`CORRECTIONS.md:17`) ne le suggère : toute nouvelle erreur sur
ce chemin est **attribuable au patch**. L'agent ne doit pas invoquer l'excuse de la « suite rouge ».

**4. `accepted` — le plan de tests T1 est insatisfaisable et T2 est vacu.**
`captureSync()` (`bridge.ts:19-25`) n'a **aucun chemin de levée** : `Fiber.getCurrent()`, puis
des lectures de références gardées par null. `make()` n'a pas d'autre source d'échec. Donc
`Effect.catchCause` à `:312` ne peut se déclencher que sur un defect qu'**aucun test ne peut
provoquer** sans patcher `bridge.ts`. T1 exige pourtant « le test **échoue** sur le code d'avant
patch (la garde donne `watchers armed: 0`) » — or sur le code d'avant patch, `ensureWatching`
arme les watchers exactement comme après. **Le critère de T1 est inatteignable.** T2, qui déclare
`acceptShape(possiblyNullBridge)` sous `@ts-expect-error`, est vrai **avant comme après** : il
prouve que le système de types *peut* attraper le trou, pas que le patch l'a fermé.
**Ce qui discrimine réellement, c'est T0 (exit code) et T3 (`rg` sans occurrence).** T1 et T2 sont
à réécrire, sans toucher au patch :

- **T1' (comportemental, non discriminant assumé)** — un changement de fichier sous
  `test/plugin/` déclenche bien un `reload()` via le pont capturé. Il **passe avant et après** :
  c'est un test de non-régression, et il faut le dire dans son nom pour qu'on ne le prenne pas
  pour une preuve du correctif.
- **T2' (niveau type, réellement discriminant)** — dans le fichier de test, `const x = bridge`
  produit `TS18047` **avant** le patch et disparaît **après** ; c'est la régression de typage
  elle-même qui est assertionnée, via `@ts-expect-error` sur la ligne d'origine.

**5. `out_of_scope` — `P15-O7`, le site jumeau.** `agent/agent.ts:421` (champ), `:445`
(`catchCause`), `:446` (garde), `:464` (`bridge!.promise`) : les quatre citations sont exactes. Le
motif est identique. Mais une **mesure tranche la question posée** : **il n'y a aucun `log.info`
entre la garde `:446` et le déréférencement `:464`** (lignes `447-463` relues). Le jumeau ne partage
donc **pas** la signature de P15 — « désactivation silencieuse qui masquerait un faux
« watchers armed » ». C'est un **trou de type pur**, sans le mensonge de journalisation qui rend
`:312` inacceptable. Le périmètre de P15 (retirer les deux ponts nullables de
`plugin/index.ts`) est atteint ; la proposition jumelle est **requise** — comme le dit la
révision, le gain est de 1 sur 2 — mais son absence ne fait pas échouer ce correctif.
Classification `out_of_scope` et non `open`.

**6. `out_of_scope` — `P15-O8`.** La révision l'annonce « **open, hors périmètre** », formulation
auto-contradictoire qui, selon la règle 4 du gabarit, serait traitée comme `open` et donc
**bloquante**. Reclassée `out_of_scope` : la justification est écrite (§4), et le patch ne
touche que `:280`, `:312`, `:313`, `:359` — ni `captureSync()` (`bridge.ts:19-25`) ni la durée de
vie de la closure de layer (`:126-443`).

**7. `accepted` — le patch *tel qu'imprimé* ne passerait pas `bun typecheck`.** Précision
nécessaire pour ne pas surinterpréter le résultat de la §Proposal : la **transformation de type**
compile (course 2, zéro diagnostic), mais le **patch tel que publié ne s'applique pas** (objection
2) — donc il n'atteint jamais le typecheck. Les deux faits sont vrais et distincts ; c'est la
raison pour laquelle les headers corrigés sont fournis.

## Regressions introduced

**Aucun test vert n'est cassé.** Déclaré explicitement, comme l'exige le gabarit.

Justification : le champ `:280` n'a qu'un écrivain (`:312`) et un lecteur (`:359`), tous deux à
l'intérieur de `ensureWatching` et tous deux après le franchissement de `:313` — fait vérifié par
inventaire exhaustif des occurrences de `bridge`. La branche supprimée est **inatteignable en
test** (`captureSync()` n'a pas de chemin de levée), donc sa disparition ne peut rien changer
d'observable. Le commentaire de huit lignes et `const b` n'ajoutent aucun effet de bord : le nombre
d'appels à `EffectBridge.make()` est inchangé (`:137` et `:319` restent distincts et ne sont pas
fusionnés).

Réserve explicite : je n'ai **pas** exécuté la suite **après** patch, puisque cela aurait exigé de
modifier `packages/**`, ce que le contrat interdit. La compilation est établie par exit code hors
dépôt ; la non-régression comportementale reste à confirmer **en vague 4**, sur le chemin
`bun test test/plugin` — où tout nouvel échec serait attribuable au patch (objection 3).

## Final verdict

REVALIDATED-PASS_WITH_CHANGES

Aucun résidu n'est `open`. Les sept objections restantes sont `refused` (1), `accepted` (2, 3, 4,
7) ou `out_of_scope` (5, 6). Le correctif est implémentable en vague 4 **à condition d'appliquer
les en-têtes corrigés du tableau de l'objection 2** et de réécrire T1/T1'/T2/T2' selon l'objection
4 — deux écritures de rapport, aucune modification de patch.

## Grille d'effort — vague 4

| item | effort | fichier principal | test à écrire | casser un test existant ? |
|---|---|---|---|---|
| Correctif A — supprimer `:280`, `:312`, `:313` ; `const b: EffectBridge.Shape` ; `:359` → `b.promise` | faible — 3 suppressions, 1 remplacement, 8 lignes de commentaire, **headers `:279,4→:279,3` / `:308,7→:307,14` / `:353,8→:359,8`** (objection 2) | `packages/opencode/src/plugin/index.ts` | T0 `bun typecheck` exit 0 ; T3 `rg -n "bridge!\|null as any\|Effect.succeed\(null"` sans occurrence | aucun — inventaire `bridge` = `{24,137,140,280,312,313,359}`, tous dans le chemin patché |
| Correctif B — rendre `subscribe` nu tolérant | faible | `packages/opencode/src/plugin/index.ts:344-367` | `test/plugin/watch-subscribe-throw.test.ts` (T5) : `subscribe` lève → répertoire skippé, bootstrap debout | aucun trouvé qui attend la propagation de l'erreur ; relire `test/plugin/hot-reload.test.ts` |
| T1' — test comportemental de non-régression (passe avant **et** après) | faible | `packages/opencode/test/plugin/bridge-non-null.test.ts` | changement de fichier → `reload()` via le pont capturé ; **nommer explicitement** la non-discrimination | aucun — vert attendu avant et après |
| T2' — preuve de non-nullabilité au niveau type | faible | `packages/opencode/test/plugin/bridge-non-null.test.ts` | `@ts-expect-error` sur la ligne d'origine ; rouge avant patch, vert après | aucun |
| Non-régression du chemin plugin | faible — **relire avant de patcher** | `packages/opencode/src/plugin/index.ts` | `bun test test/plugin` : **123 pass / 1 fail** avant patch ; viser le même résultat après | **1 test déjà rouge** : `plugin.install.concurrent > serializes concurrent server+tui config updates across processes` — ne pas l'attribuer au patch |
| Proposition jumelle (`P15-O7`, hors périmètre de P15) | moyenne — même patch sur 4 lignes, mais sans `log.info` à préserver | `packages/opencode/src/agent/agent.ts:421,445,446,464` | T0 + T2' équivalents | aucun — aucun `log.info` entre `:446` et `:464`, donc aucune signature de désactivation silencieuse à reconstruire |