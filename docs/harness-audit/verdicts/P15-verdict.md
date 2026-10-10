# P15 — Pont plugin nullable déréférencé dans le chemin de rechargement à chaud

## Proposal

`P15` — Pont plugin nullable déréférencé dans le chemin de rechargement à chaud.
Fichier validé : `docs/harness-audit/proposals/P15-plugin-bridge-null.md` (345 lignes).

## Validator

`opencodev2 / agent principal`, rôle **validateur indépendant** — `independent` :
n'a pas rédigé la proposition. Toutes les vérifications ci-dessous sont faites par
lecture du code réel du dépôt, aucun fichier source n'a été modifié.

## Status

`PASS_WITH_CHANGES`

## Checks

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok (22/22 vérifiées) | `plugin/index.ts:280` = `let bridge: EffectBridge.Shape \| null = null` ; `:312` = `if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))` ; `:359` = `bridge!.promise(reload()).catch((err) => log.error("plugin reload error", { err }))` ; `src/effect/bridge.ts:54` = `export function make(): Effect.Effect<Shape>` ; `src/project/bootstrap.ts:44` = `yield* plugin.init()` ; `src/agent/agent.ts:421` = `let bridge: EffectBridge.Shape \| null = null` |
| le correctif supprime vraiment la cause | **KO** | Correctif A (`proposal:171-172`) : `if (!bridge) bridge = yield* EffectBridge.make()` puis `const b = bridge`. Sous `strict: true` (`node_modules/@tsconfig/bun/tsconfig.json:22`), le type déclaré de `bridge` reste `EffectBridge.Shape \| null` (`plugin/index.ts:280`) et `make()` renvoie `Effect.Effect<Shape>` — `b` est donc `EffectBridge.Shape \| null`, non `Shape`. `b.promise(...)` en `proposal:178` est **TS18047** (`'b' is possibly 'null'`). `tsconfig` ne désactive pas `strict` (`packages/opencode/tsconfig.json:4-16` ne fixe que `jsx`, `lib`, `types`, `noUncheckedIndexedAccess: false`, `customConditions`, `paths`) et le script est `tsgo --noEmit` (`packages/opencode/package.json:9`). L'affirmation « le narrowing de la ligne suivante est produit par le contrôle de flux du compilateur » (`proposal:184`) et « `bridge` est désormais non nul après l'affectation » (`proposal:188`) est fausse : seul le contrôle de flux après un **garde** (`if (bridge === null) throw`, ou `if (!bridge) return`) le produit, pas une affectation. |
| le correctif ne casse pas un comportement existant | KO | Le retrait de `Effect.catchCause` transforme une lacune de `make()` en échec propagé : `ensureWatching` (309-376) ← `init` (397-400, sans garde) ← `plugin.init()` (`bootstrap.ts:44`, **hors** du `Effect.forEach` protégé de `bootstrap.ts:47-50`) ← `InstanceBootstrap.run` échoue. La proposition reconnaît ce changement (`proposal:271-277`) mais le présente comme « délibéré » sans contrepartie ni garde ; voir Objection 2. |
| tests proposés sont exécutables dans ce dépôt | **KO** | T1 (`proposal:293-294`) affirme « le répertoire `packages/opencode/test/plugin/` n'existe pas encore » : **faux**, il contient 14 fichiers (`hot-reload.test.ts`, `reload-rollback.test.ts`, `shared.test.ts`, …). T2 (`proposal:303-307`) propose `expectTypeOf` : `expect-type` n'est une dépendance d'aucun `package.json` du dépôt (recherche `expect-type\|expectTypeOf` sur tous les `package.json` → aucune occurrence) et aucun fichier de test ne l'utilise ; T2 n'est pas exécutable en l'état. T3 (`proposal:312-317`) est exécutable et mécanique. T4 (`proposal:319-323`) est exécutable : `test/cli/tui/plugin-lifecycle.test.ts` existe. |
| effort et coût annoncés réalistes | ok | `proposal:278-283` annonce 0 allocation / 0 appel réseau / 0 ms au runtime et une seule exécution `bun typecheck` (~60 s). Cohérent avec le diff : `Effect.catchCause` est supprimé, aucun appel added. Le coût **non chiffré** est correctif B (six lignes de `try/catch`), ce que la proposition dit (`proposal:329`). |

### Vérification décisive — question 2 : `Effect.succeed(null as any)` produit-il un pont `null` dans un cas NORMAL ou sur un chemin d'erreur ?

**Ni l'un ni l'autre : le pont `null` est un état mort, et le chemin d'erreur que ce code couvre est lui aussi inatteignable.**

Trace, `packages/opencode/src/plugin/index.ts` :

```
308:  const ensureWatching = Effect.fnUntraced(function* () {
309:    if (watchingStarted) return          ← retour immédiat sur toute 2e passe
310:    watchingStarted = true               ← jamais remis à false dans le fichier
311:    if (flags.pure) return
312:    if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))
313:    if (!bridge) return                  ← garde de narrowing
...
341:    if (parcelWatcher) {
342:      for (const dir of dirs) {
344:          const pending = parcelWatcher.subscribe(
346:            (err, evts) => {
356:                setTimeout(() => {
359:                  bridge!.promise(reload()).catch(...)
```

1. **Les écritures du pont** : `plugin/index.ts:280` (initialisation à `null`) et `plugin/index.ts:312` (seule affectation). Recherche exhaustive sur le fichier : aucune autre écriture (`watchingStarted` n'apparaît qu'en 281, 309, 310 ; `watcherCleanup` en 279, 314-316, 370, 434-436). Aucune affectation entre `313` et `359`.
2. **Les fermetures `346`/`356`/`359` ne sont créées qu'après `313`** : `subscribe` est appelé en `344`, à l'intérieur de la boucle `342-367`, elle-même après le garde `313`.
3. **`watchingStarted` interdit une seconde passe** (309), et rien dans le fichier ne le remet à `false`. Le bloc `watcherCleanup()` de `314-317` est donc lui aussi inatteignable — du code mort, pas une réinitialisation.
4. **`reload()` (402-425) ne touche jamais `bridge`** : il invalide l'`InstanceState` et swappe `active`.
5. **Le chemin d'erreur de `catchCause` est lui-même vide** : `src/effect/bridge.ts:54` déclare `export function make(): Effect.Effect<Shape>` — canal d'erreur `never`, `R = never`. Le corps (55-81) ne fait que `yield* Effect.context()`, `captureSync()`, et lire `InstanceRef`/`WorkspaceRef`, dont les deux références ont une valeur par défaut : `defaultValue: () => undefined` (`src/effect/instance-ref.ts:5-10`). Aucun `require`, aucun disque, aucun réseau. `catchCause` est donc du code mort.

**Conséquence pour le correctif** : la question du mandat (« si c'est normal, fallback réel ; si c'est une erreur, propager ») se tranche ainsi — il n'y a **ni cas normal ni cas d'erreur** où `bridge` est nul. La réponse correcte est de **propager** (supprimer `as any` et le `catchCause`), ce que fait la proposition, mais pas pour la raison qu'elle donne : elle justifie la suppression de `catchCause` par la cohérence avec le site `137`, pas par le fait que `make()` est infaillible. Le raisonnement est correct, la justification est quantitativement fausse.

### Question 3 — hot reload / démarrage du serveur, et rayon d'impact

`plugin.init()` est appelé à **chaque bootstrap d'instance** (`src/project/bootstrap.ts:44`), donc le chemin du pont est dans le **démarrage**, pas seulement dans le rechargement à chaud. Deux faits caractéristiques :

- `plugin.init()` est le **seul** `init()` non protégé de `bootstrap.ts` : les neuf autres services passent par `(s) => s.init().pipe(Effect.catchCause((cause) => Effect.logWarning("init failed", { cause })))` (`bootstrap.ts:47-50`), alors que `yield* plugin.init()` est nu en `44`. Un échec de `ensureWatching` fait donc échouer `InstanceBootstrap.run` entier.
- Le pont lui-même est infaillible (§ question 2), donc le correctif A ne peut pas, en pratique, faire tomber le bootstrap. Le risque réel reste théorique.

Réponse à « une exception ici peut-elle empêcher le serveur de démarrer ? » : **non par le pont ; oui par `subscribe`**. `plugin/index.ts:344` appelle `parcelWatcher.subscribe(...)` sans `try` ; un `subscribe` qui lève de façon synchrone s'échappe de `ensureWatching` → `init` (397-400) → `bootstrap.ts:44` → échec du bootstrap de l'instance. C'est exactement le défaut du **correctif B**, et il est un défaut **vivant**, pas théorique. Le correctif B est donc la partie la plus utile de la proposition, malgré son statut secondaire.

Réponse à « l'état incohérent » : le `.catch` de `src/index.ts:61` (`unhandledRejection`) et `src/index.ts:67` (`uncaughtException`) ne font que `Log.Default.error(...)` — **ils ne sortent pas le processus**. Une exception levée dans le `setTimeout` de `356` deviendrait un `uncaughtException` journalisé, processus vivant, rechargement à chaud silencieusement abandonné. C'est le seul scénario d'incohérence réelle du fichier, et il est fermé par le correctif A (plus de `bridge!`) **et** par le correctif B (plus de `subscribe` synchrone qui remonte au bootstrap).

### Question 4 — `bridge!.promise(...)` : le non-null assertion masque-t-il d'autres cas que `null` ?

**Non, et la proposition a raison sur ce point.** Le non-null assertion ne masque que `null` ici, parce que :

- `EffectBridge.Shape` n'a que des membres `readonly` non optionnels (`promise`, `fork`, `run`, `bind` — `src/effect/bridge.ts:7-12`) ; aucune déstructuration ni lecture de propriété optionnelle.
- `undefined` n'est **jamais** affecté : `bridge` est déclaré `Shape | null` (280) et n'est écrit qu'en 312 ; `watchingStarted` n'étant jamais remis à `false`, le pont n'est jamais recréé après `watcherCleanup` — donc aucun « pont `undefined` après un rechargement » n'existe.
- `bridge.promise(effect)` n'est pas consommable : `wrap` capture `ctx`, `instance`, `workspace` par valeur (`bridge.ts:60-61`) et `Effect.runPromise` (65) est sans état. Une réutilisation illimitée est sûre.

Point relevé en marge, hors périmètre P15 mais réel : `bridge` est une `let` de **closure de layer** (280), créée une fois pour `Plugin.layer` (126) et donc **partagée entre toutes les instances**, alors que `captureSync()` fige le contexte de la première instance (`bridge.ts:19-25`). Un pont construit pour l'instance A sert ensuite l'instance B. C'est un finding ouvert, pas une objection à P15.

### Question 5 — test exécutable et fichier de test analogue

- Le répertoire **`packages/opencode/test/plugin/` existe déjà** (14 fichiers, dont `hot-reload.test.ts` et `reload-rollback.test.ts`). L'affirmation `proposal:293-294` est fausse.
- Le fichier **`packages/opencode/test/plugin/bridge-non-null.test.ts` (T1) n'existe pas** — vérifié, il est absent du `glob` du répertoire.
- Les fichiers de test cités au §6 existent tous : `test/config/plugin.test.ts`, `test/agent/plugin-agent-regression.test.ts`, `test/cli/tui/plugin-lifecycle.test.ts`, `test/cli/tui/plugin-loader.test.ts`, `plugin-loader-pure.test.ts`, `plugin-loader-entrypoint.test.ts`, `plugin-install.test.ts`, `plugin-add.test.ts`, `plugin-toggle.test.ts`, et les fixtures `test/fixture/plugin.ts` + `test/fixture/tui-plugin.ts`.

## Objections

### Objection 1 — Le correctif A ne compile pas : `const b = bridge` n'est pas narrowed (KO `citations`/correction)

Proposition (`proposal:171-172`) :

```ts
+      if (!bridge) bridge = yield* EffectBridge.make()
+      const b = bridge // narrowed to EffectBridge.Shape, captured immutably below
```

Preuve que `b` reste nullable : le type déclaré est `EffectBridge.Shape | null` (`plugin/index.ts:280`), et `EffectBridge.make()` renvoie `Effect.Effect<Shape>` (`src/effect/bridge.ts:54`). Après `if (!bridge) bridge = <Shape>`, le type de `bridge` à la sortie du bloc est l'union des deux branches — la branche `if` est éliminée, mais la branche « `bridge` était déjà non nul » **n'existe pas** : `bridge` est `null` au premier appel puisque `watchingStarted` interdit toute seconde passe (§ question 2). Le compilateur voit néanmoins `let bridge: Shape | null` et **ne propage aucune narrowness** à travers une affectation ; `const b = bridge` a le type `EffectBridge.Shape | null`. `b.promise(...)` (`proposal:178`) déclenche alors `TS18047: 'b' is possibly 'null'`, et `tsgo --noEmit` (`package.json:9`) échoue. Le dépôt est en `strict: true` (`@tsconfig/bun/tsconfig.json:22`) sans désactivation de `strictNullChecks` (`packages/opencode/tsconfig.json:4-16`).

Corollaire : `proposal:184` (« le narrowing de la ligne suivante est produit par le contrôle de flux du compilateur ») et `proposal:194` (« il n'est plus *atteignable* au moment où il est déréférencé ») décrivent un état que le système de types ne garantit pas.

**Ce qui change** : faire produire le narrowing par un garde explicite, et non par une affectation. Deux formes acceptables, la première étant celle qui colle au style du dépôt :

```ts
      if (!bridge) bridge = yield* EffectBridge.make()
      if (bridge === null) throw new Error("plugin watcher armed without a bridge")   // defect, pas Failure
      const b: EffectBridge.Shape = bridge
```

ou, plus simple et sans variable intermédiaire :

```ts
      const b = yield* EffectBridge.make()   // abandonnera le champ 280 et le cache
```

Si `b` est gardé localement **sans** `bridge`, il faut supprimer le champ `let bridge: EffectBridge.Shape | null` (280) et son test `if (!bridge)` (312) — c'est l'alternative 3 de `proposal:250-252`, que la proposition rejette à tort : aujourd'hui le cache `if (!bridge)` est **mort** (309 rend toute 2e passe impossible), il ne coûte rien et ne sert à rien.

### Objection 2 — La suppression de `catchCause` n'a aucune contrepartie : un `throw` nu dans une library, et un bootstrap sans filet (KO correction)

Si l'on applique l'Objection 1 tel quelle (`throw new Error(...)`), on introduit une exception JavaScript dans `ensureWatching`, dont la seule porte de sortie est `unhandledRejection`/`uncaughtException` qui journalisent sans arrêter le processus (`src/index.ts:61-71`). Or `ensureWatching` est **dans le chemin de démarrage** : `plugin.init()` en `bootstrap.ts:44` est le seul `init()` sans `Effect.catchCause` (`bootstrap.ts:47-50` protège les neuf autres). Un `throw` plutôt qu'un échec Effect rend la panne non rattrapable par le `Effect.catchCause` qu'un appelant pourrait ajouter, et la proposition ne le dit nulle part : `proposal:271-277` ne parle que de « échec Effect typé ».

**Ce qui change** : soit conserver une dégradation contrôlée et **journalisée** de `ensureWatching` (`Effect.catchCause((cause) => Effect.logWarning("plugin hot-reload unavailable", { cause }))` autour de la seule création du pont en 312, en documentant que la branche avalée est inatteignable), soit assumer explicitement le mode dur **et** le dire dans § 6. Le choix est de l'auteur ; ce qui est inacceptable est de le présenter comme un simple alignement de type alors qu'il déplace la sémantique d'échec vers le bootstrap d'instance.

### Objection 3 — `Effect.void` vs `Effect.succeed(null as any)` : la proposition rate la règle du dépôt (KO mineure)

`packages/opencode/AGENTS.md` impose : « Use `Effect.void` instead of `Effect.succeed(undefined)` or `Effect.succeed(void 0)` ». La proposition supprime bien `Effect.succeed(null as any)` (elle cite `AGENTS.md` § 4), mais aucune alternative n'est évaluée pour un pont *optionnel légitime* : le dépôt n'a pas d'exception au canal `never` de `EffectBridge.make()`.

**Ce qui change** : ajouter une variante `EffectBridge.makeOptional(): Effect.Effect<Shape | null, never>` dans `src/effect/bridge.ts` si l'on veut conserver le champ nullable, plutôt que de dépendre d'un `as any`. Cela reste optionnel si l'on suit l'Objection 1.

### Objection 4 — Deux affirmations factuellement fausses dans la proposition (KO citations)

1. `proposal:293-294` : « le répertoire `packages/opencode/test/plugin/` n'existe pas encore » — **faux**, il existe et contient 14 fichiers.
2. `proposal:303-307` : T2 « un test en `expectTypeOf` / `@ts-expect-error` », commande `bun typecheck` — `expect-type` n'est une dépendance d'aucun `package.json` du dépôt (recherche sur l'ensemble des `package.json` → aucune occurrence) ; aucun test du dépôt ne l'utilise. T2 tel quel n'est pas exécutable. La variante `@ts-expect-error` est valide et ne demande aucune dépendance : c'est celle qu'il faut retenir.

### Objection 5 — Le sibling `src/agent/agent.ts` n'est pas traité et le contrat de la proposition le reconnaît (finding, pas blocage)

`src/agent/agent.ts:421` `let bridge: EffectBridge.Shape | null = null`, `:445` `Effect.succeed(null as any)`, `:446` `if (!bridge) return`, `:464` `bridge!.promise(reload())` — même motif, même `if (!bridge) return` qui rend la branche morte. La proposition le déclare hors périmètre (`proposal:229-232`, `proposal:253-255`) et l'a marqué comme finding ouvert : c'est la bonne pratique d'audit. Je le confirme et je l'ajoute comme **finding ouvert**, sans effet sur le statut.

## Required changes

1. **Rendre le correctif A compilable.** Remplacer `const b = bridge` (`proposal:172`) par un narrowing explicite — `if (bridge === null) throw …` avant la déclaration de `b`, ou `const b = yield* EffectBridge.make()` avec suppression du champ `let bridge` (280) et du test `if (!bridge)` (312). Preuve exigée : `bun typecheck` (== `tsgo --noEmit`, `packages/opencode/package.json:9`) exit 0.
2. **Trancher explicitement la sémantique d'échec de `ensureWatching`** et l'écrire dans § 6 : dégradation journalisée avec `Effect.logWarning`, ou échec dur vers `bootstrap.ts:44`. Dans le cas dur, mentionner que `plugin.init()` est le seul `init()` non protégé (`bootstrap.ts:44` vs `bootstrap.ts:47-50`) et que `src/index.ts:61-71` ne fait que journaliser. Une exception Java nue est exclue.
3. **Réécrire T1** : supprimer « le répertoire `packages/opencode/test/plugin/` n'existe pas encore » (faux — 14 fichiers) et créer `packages/opencode/test/plugin/bridge-non-null.test.ts` **dans le répertoire existant**, en s'alignant sur `test/plugin/reload-rollback.test.ts`.
4. **Réécrire T2** : remplacer `expectTypeOf` par `@ts-expect-error` (aucune dépendance `expect-type` dans le dépôt) ou par un test de type sur `Shape | null` compilé par `tsgo --noEmit`.
5. **Compléter T3** : `rg -n "bridge!\.|null as any" packages/opencode/src/plugin/index.ts` doit retourner **exit 1** ; le motif proposé (`proposal:313`) est trop étroit.
6. **Ajouter une preuve de non-régression pour le correctif B** : `packages/opencode/test/plugin/watch-subscribe-throw.test.ts` — forcer `subscribe` à lever de façon synchrone et vérifier que le bootstrap de l'instance survit. Le correctif B corrige un défaut vivant (`plugin/index.ts:344`, sans `try`) ; il mérite un test dédié et pas seulement un diff.

## Implementation guidance

Ordre : correctif A (lignes 280, 312-313, 359) seul d'abord, avec `tsgo --noEmit` vert, puis T3 (`rg … ; echo exit=$LASTEXITCODE`) et T1 ; ensuite le correctif B (lignes 342-367) avec `watch-subscribe-throw.test.ts` ; enfin T4 (`bun test test/cli/tui/plugin-lifecycle.test.ts`) comme non-régression fonctionnelle.

Pièges connus : (a) `Effect.succeed` est interdit par `packages/opencode/AGENTS.md` — ne pas le réintroduire sous une autre forme ; (b) `AGENTS.md` interdit `Effect.fork`/`Effect.forkDaemon` (v4 : utiliser `Effect.forkIn(scope)`) — sans rapport ici, mais le fichier `index.ts` contient déjà des occurrences ; (c) le bloc `watcherCleanup()` de `plugin/index.ts:314-317` est du code **mort** (309 retourne avant) — ne pas s'en servir pour « prouver » que le pont peut être réarmé ; (d) le pont est une `let` de closure de **layer** (280), partagée entre instances — si le patch touche à `captureSync()` ou à la durée de vie du pont, ouvrir un finding séparé plutôt que d'élargir P15.

## Findings

| id | sévérité | statut | résumé |
|---|---|---|---|
| P15-O1 | high | closed par Required change 1 | `const b = bridge` n'est pas narrowed sous `strict: true` ; `tsgo --noEmit` échoue |
| P15-O2 | high | closed par Required change 2 | sémantique d'échec de `ensureWatching` non tranchée ; `bootstrap.ts:44` est sans filet ; `throw` nu exclu |
| P15-O3 | low | closed par Required change 2 (ou 1) | pas de `EffectBridge.makeOptional()` ; `Effect.succeed` interdit par `AGENTS.md` |
| P15-O4 | medium | closed par Required changes 3-4 | T1 affirme un répertoire inexistant ; T2 dépend de `expect-type`, absent du dépôt |
| P15-O5 | low | closed par Required change 5 | motif T3 trop étroit (`null as any` au lieu de `null as any\|bridge!`) |
| P15-O6 | medium | open | correctif B (défaut vivant : `subscribe` synchrone non protégé) sans test de non-régression |
| P15-O7 | medium | open | `src/agent/agent.ts:421,445,446,464` porte le motif identique ; proposition jumelle à créer |
| P15-O8 | low | open | `bridge` (closure de layer, 280) fige le contexte de la première instance via `captureSync()` (`bridge.ts:19-25`) et est partagé entre instances |