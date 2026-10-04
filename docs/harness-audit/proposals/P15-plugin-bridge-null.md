# P15 — `null as any` puis `bridge!` : trou de type du pont de rechargement à chaud des plugins

> Révisé après verdict PASS_WITH_CHANGES du 2026-10-03 — correctif rendu compilable (C-18), branche catchCause revue (C-08)

## 1. Problem

Le pont `EffectBridge` du rechargement à chaud des plugins est déclaré nullable, rendu nullable par
une assertion `null as any` qui fait disparaître l'erreur de type du compilateur, puis déréférencé
par une assertion `bridge!` ; dans la même fonction, l'abonnement au watcher n'est pas protégé
contre une levée synchrone.

**Deux prémisses initiales sont corrigées** (C-08, `CORRECTIONS.md:18`). Le déréférencement de
`plugin/index.ts:359` est **inatteignable aujourd'hui** (§ 3) : le défaut qui y subsiste est un
**trou de type**, pas une panne vivante. Et `plugin/index.ts:366` **n'est pas** un pont : `pending`
est une `Promise<ParcelWatcher.AsyncSubscription>` dont le `.catch` couvre le rejet.

## 2. Evidence

Toutes les citations de cette section ont été relues dans le code réel pendant cette révision :
`packages/opencode/src/plugin/index.ts` lu **en entier** (451 lignes), `src/effect/bridge.ts` lu en
entier (84 lignes), `src/effect/instance-ref.ts` lu en entier (11 lignes), `src/project/bootstrap.ts:30-60`,
et le répertoire `packages/opencode/test/plugin/`. Les affirmations héritées du verdict sont marquées
**[hérité]** et citent leur source.

**(a) Le champ nullable — `plugin/index.ts:279-281`**

```ts
let watcherCleanup: (() => void) | null = null
let bridge: EffectBridge.Shape | null = null
let watchingStarted = false
```

**(b) Le producteur du `null` — `plugin/index.ts:311-313`**

```ts
if (flags.pure) return
if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))
if (!bridge) return
```

**(c) Le seul déréférencement — `plugin/index.ts:356-360`**

```ts
setTimeout(() => {
  timers.delete(evt.path)
  log.info("plugin file changed, reloading", { file: evt.path })
  bridge!.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
}, DEBOUNCE_MS),
```

**(d) `plugin/index.ts:366` — ce n'est pas le pont** (prémisse réfutée)

```ts
pending.then((s) => subs.push(s)).catch((err) => log.error("plugin watch subscribe failed", { dir, err }))
```

`pending` est la valeur de retour de `parcelWatcher.subscribe(...)` (`:344`), de type
`Promise<ParcelWatcher.AsyncSubscription>` — le même type que les éléments de
`const subs: ParcelWatcher.AsyncSubscription[] = []` (`:338`). Ce n'est ni le pont nullable, ni un
type optionnel, et `.catch` couvre le rejet. **La ligne 366 n'est pas le pont.**

**(e) Le vrai défaut vivant est en amont, `plugin/index.ts:341-344`** — `subscribe` est appelé sans
`try` dans la boucle `341-368` :

```ts
if (parcelWatcher) {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    const pending = parcelWatcher.subscribe(
```

Une levée synchrone de `subscribe` s'échappe de `ensureWatching` (`:308`) → `init` (`:397-400`) →
`bootstrap.ts:44`.

**(f) Le pont est infaillible — `src/effect/bridge.ts:54-59`**

```ts
export function make(): Effect.Effect<Shape> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context()
    const captured = captureSync()
    const instance = (yield* InstanceRef) ?? captured.instance
```

Canal d'erreur `never`, `R = never` : la signature ne déclare aucun paramètre de type après `Shape`.
Le corps (55-81) ne fait que `Effect.context()`, `captureSync()`, et lire deux `Context.Reference`
dont les deux valeurs par défaut existent — `src/effect/instance-ref.ts:5-10` :

```ts
export const InstanceRef = Context.Reference<InstanceContext | undefined>("~opencode/InstanceRef", {
  defaultValue: () => undefined,
})
```

Ni disque, ni `require`, ni réseau. Un `Effect.catchCause` placé au-dessus de `make()` ne peut donc
produire `null` que pour un **defect**, pas pour un échec typé.

**(g) Le même appel est déjà nu dans ce fichier, une ligne AVANT `ensureWatching`** —
`plugin/index.ts:133-140` :

```ts
const state = yield* InstanceState.make<State>(
  Effect.fn("Plugin.state")(function* (ctx) {
    const hooks: Hooks[] = []
    const failures: string[] = []
    const bridge = yield* EffectBridge.make()

    function publishPluginError(message: string) {
      bridge.fork(bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() }))
```

`init` (`:397-400`) matérialise cet état **avant** d'appeler `ensureWatching` :

```ts
const init = Effect.fn("Plugin.init")(function* () {
  yield* InstanceState.get(state)
  yield* ensureWatching()
})
```

Conséquence décisive (§ 4, correctif A) : **une lacune de `make()` échoue déjà `init` à `:398`, via
`:137`, sans filet** — une ligne avant `:399`. Le `catchCause` de `:312` ne protége donc rien qui ne
soit déjà perdu. `:140` prouve de plus que le résultat de `yield* EffectBridge.make()` est bien de
type `Shape` sans aucune assertion : c'est le précédent exact du patch proposé.

**(h) Le champ `bridge` n'a aucun autre consommateur.** Occurrences exhaustives du mot `bridge` dans
`plugin/index.ts` (fichier lu en entier) : `24` (import), `137` et `140` (**un autre pont**, `const`
local dans le closure d'`InstanceState`), `280`, `312`, `313`, `359`. Rien après `359` : ni
`reload()` (`:402-425`), ni le finaliseur (`:432-439`), ni `Service.of` (`:441`) ne le lisent.
`watchingStarted` n'apparaît qu'en `281`, `309`, `310`. Supprimer `280`, `312` et `313` n'a donc
aucun effet de bord dans ce fichier. _INFERE :_ re-vérifiable par
`rg -n "bridge" packages/opencode/src/plugin/index.ts`.

**(i) Le site jumeau existe et est identique — `src/agent/agent.ts:421,445,446,464`** **[hérité]**
(cité par `P15-verdict.md:135` et `CORRECTIONS.md:19`) :

```ts
let bridge: EffectBridge.Shape | null = null      // 421
…
if (flags.pure) return                                                                    // 444
if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))  // 445
if (!bridge) return                                                                       // 446
```

et `464` : `bridge!.promise(reload()).catch((err) => console.error("agent reload error", err))`.

**(j) `plugin.init()` est le seul `init()` non protégé du bootstrap — `src/project/bootstrap.ts:44`
contre `:47-51`**

```ts
yield* plugin.init()
yield* Effect.forEach(
  [reference, lsp, shareNext, format, file, fileWatcher, vcs, snapshot, project],
  (s) => s.init().pipe(Effect.catchCause((cause) => Effect.logWarning("init failed", { cause }))),
  { concurrency: "unbounded", discard: true },
).pipe(Effect.withSpan("InstanceBootstrap.init"))
```

**(k) Le répertoire de test existe déjà** — `packages/opencode/test/plugin/` contient **14
fichiers** : `auth-override.test.ts`, `cloudflare.test.ts`, `codex.test.ts`,
`github-copilot-models.test.ts`, `hot-reload.test.ts`, `install-concurrency.test.ts`,
`install.test.ts`, `loader-shared.test.ts`, `meta.test.ts`, `reload-rollback.test.ts`,
`shared.test.ts`, `trigger.test.ts`, `workspace-adapter.test.ts`, `xai.test.ts`. La version
précédente de cette proposition affirmait le contraire : c'est faux, et c'est corrigé ici (§ 7, T1).

## 3. Mechanism

Chemin d'exécution complet, `ensureWatching` (`:308-376`) et ses appelants — chaque étape citée :

1. `Project.run` appelle `yield* plugin.init()` à **chaque** bootstrap d'instance
   (`src/project/bootstrap.ts:44`). Ce chemin est non protégé (j).
2. `init` (`:397-400`) matérialise d'abord l'état d'instance : `InstanceState.get(state)` (`:398`).
3. Cette matérialisation exécute le closure `:134-…`, dont `const bridge = yield* EffectBridge.make()`
   (`:137`) — **non protégé**, hors de `ensureWatching` (g).
4. Puis seulement `yield* ensureWatching()` (`:399`). `reload()` (`:419`) la rappelle aussi.
5. `ensureWatching` sort immédiatement si `watchingStarted` est vrai (`:309`), **avant** toute
   création de pont. Le drapeau est mis à `true` en `:310` et n'est jamais remis à zéro dans le
   fichier (h) : **au plus une passe par layer**, donc `ensureWatching` crée au plus un pont.
6. Retour immédiat en mode pur (`:311`).
7. Production du pont : `:312`, puis garde `if (!bridge) return` (`:313`).
8. L'armement n'a lieu qu'après `:313` : `subscribe` en `:344`, le callback en `:346`, le
   `setTimeout` en `:356`, la fermeture qui lit `bridge` en `:359`.

**Pourquoi `:359` est inatteignable** (relevé de première main sur le fichier entier) : (i) les
seules écritures du champ sont `:280` (null) et `:312`, et aucune écriture n'intervient entre `:313`
et `:359` (h) ; (ii) les fermetures `:346`/`:356`/`:359` ne sont créées qu'après le franchissement
de `:313`, à l'intérieur de la boucle `:341-368` ; (iii) `watchingStarted` interdit une seconde
passe (5) — ce qui rend du reste le bloc `watcherCleanup()` de `:314-317` **mort** : ce n'est pas une
réinitialisation, il ne faut pas s'en servir comme preuve que le pont peut être réarmé ;
(iv) `reload()` (`:402-425`) ne lit ni n'écrit `bridge`. Enfin la branche avalée en `:312` est
elle-même inatteignable **au sens des types** (f) : `make()` déclare un canal d'erreur `never`.

**Ce que la branche `catchCause` atteint réellement — réponse à C-08.** Elle n'atteint rien, et le
préciser est le point du correctif :

- **Statique : rien.** `Effect.Effect<Shape>` (f) n'a pas de canal d'erreur, donc le gestionnaire
  `catchCause` n'a rien à capturer. Le `null` qu'il aurait produit n'a **qu'un seul consommateur** :
  la garde `if (!bridge) return` de `:313`. Si ce `null` existait, l'effet observable serait :
  `ensureWatching` sort en silence **avant** `log.info("plugin hot-reload watchers active", …)`
  (`:329`) et `log.info("plugin hot-reload watchers armed", …)` (`:369`). **Aucun warning, aucune
  erreur, aucune trace** : le rechargement à chaud serait simplement éteint, et `watchingStarted`
  étant déjà `true` (`:310`), il ne pourrait plus jamais être réarmé.
- **À l'exécution : seulement un defect.** `catchCause` intercepte toute `Cause`, y compris un `Die`,
  que `never` n'exclut pas statiquement — par exemple une `captureSync()` qui lèverait sur une
  référence absente (`bridge.ts:19-25`). C'est le seul scénario où `null` peut apparaître, et c'est
  le pire : il transforme un bug en désactivation silencieuse.
- **Et ce n'était de toute façon pas un filet.** Le même `make()` échoue déjà `init` à `:398` via
  `:137`, non protégé (g). Une dégradation « gracieuse » en `:312` est donc **inatteignable en tant
  que disponibilité** : l'instance est déjà perdue une ligne avant.

**Conclusion :** le défaut est un trou de type et une branche morte, pas une panne vivante. Ce qui
reste vivant dans la même fonction est l'échec synchrone de `subscribe` (e), non protégé nulle part.

## 4. Proposal

Un seul fichier source modifié : `packages/opencode/src/plugin/index.ts`.

### Correctif A — sceller le type du pont (traite `:280`, `:311-313`, `:359`)

Forme retenue : **pont local typé, suppression du champ**, c'est-à-dire la deuxième forme
explicitement acceptée par le verdict (Objection 1, `P15-verdict.md:108-114`) : *« plus simple et
sans variable intermédiaire : `const b = yield* EffectBridge.make()` — abandonnera le champ 280 et le
cache »*.

```diff
--- a/packages/opencode/src/plugin/index.ts
+++ b/packages/opencode/src/plugin/index.ts
@@ -277,7 +277,6 @@
     let watcherCleanup: (() => void) | null = null
-    let bridge: EffectBridge.Shape | null = null
     let watchingStarted = false

@@ -308,9 +307,15 @@
     const ensureWatching = Effect.fnUntraced(function* () {
       if (watchingStarted) return
       watchingStarted = true
       if (flags.pure) return
-      if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))
-      if (!bridge) return
+      // `make()` has a `never` error channel (src/effect/bridge.ts:54): it only reads
+      // Effect.context() and two Context.Reference that both default to undefined
+      // (src/effect/instance-ref.ts:5-10). The former
+      // `Effect.catchCause(() => Effect.succeed(null as any))` could therefore yield `null`
+      // only for a defect, and its sole consumer was `if (!bridge) return` below: hot reload
+      // silently off, no warning, unrecoverable since `watchingStarted` is already true.
+      // It bought no availability anyway — init() runs the same make() unprotected one line
+      // earlier via InstanceState.get(state) (plugin/index.ts:398 -> :137).
+      const b: EffectBridge.Shape = yield* EffectBridge.make()
       if (watcherCleanup) {

@@ -354,9 +359,9 @@
                 clearTimeout(timers.get(evt.path))
                 timers.set(
                   evt.path,
                   setTimeout(() => {
                     timers.delete(evt.path)
                     log.info("plugin file changed, reloading", { file: evt.path })
-                    bridge!.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
+                    b.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
                   }, DEBOUNCE_MS),
```

_Note :_ les en-têtes de hunk de ce diff sont **indicatifs** (ils n'ont pas été recalculés par un
outil de diff) ; appliquer le patch au **contexte** des lignes montrées, pas à un offset.

**Pourquoi ce patch compile — la réponse précise à C-18 (`CORRECTIONS.md:28`).**

- **La variable nullable et son usage sont deux déclarations distinctes, et la variable nullable
  disparaît.** Le champ `let bridge: EffectBridge.Shape | null` (`:280`) est **supprimé**, donc
  l'union `Shape | null` n'est plus construite nulle part dans ce fichier. Aucun `as any`, aucun
  `@ts-ignore`, aucune affirmation de type : le trou n'est pas **refermé** par un mensonge, il est
  **supprimé à sa racine**, puisque le producteur de `null` — le `catchCause` — disparaît avec lui.
  Le canal `never` de `make()` devient une garantie du système de types, au lieu d'être une
  hypothèse contredite par `null as any`.
- **L'assertion porte sur la valeur produite par l'effet, pas sur l'effet.** `make()` est un
  **effet** : `const b: EffectBridge.Shape = EffectBridge.make()` serait un `TS2322`
  (`Effect<Shape>` n'est pas assignable à `Shape`). Le type est donc porté par le `yield*`, qui
  évalue l'effet et lie son résultat. L'annotation `: EffectBridge.Shape` est explicite et **exacte**
  (ni élargissement, ni rétrécissement) ; elle est redondante avec l'inférence — comme le prouve le
  site jumeau `:137`/`:140`, qui n'a besoin d'aucune assertion — et elle documente l'intention au
  lecteur.
- **Aucun narrowing n'est requis, donc aucun narrowing n'est simulé.** La forme écartée
  (`const b = bridge` après une affectation) échouait en `TS18047` parce que le contrôle de flux ne
  propage pas la narrowness à travers une affectation (`P15-verdict.md:23` et `:96`). Ici `b` est un
  `const` de type `Shape` **sans condition** : il n'y a plus de branche nulle à éliminer, donc plus
  rien à prouver au compilateur. `:359` devient `b.promise(...)` — plus de `bridge!`.
- **Le `if (!bridge) return` de `:313` disparaît avec le champ**, et c'est cohérent : garder une
  garde sur une variable qui n'existe plus serait du code mort supplémentaire. Le cache
  `if (!bridge)` était déjà mort (5) : il ne coûtait rien et ne servait à rien.
- **Aucun `throw` JavaScript n'est introduit.** `ensureWatching` reste un effet rattrapable par un
  `Effect.catchCause` ajouté en aval — exigence de l'Objection 2 (`P15-verdict.md:116-120`).

**Ce que devient la branche `catchCause` (réponse à C-08).** Elle est **supprimée, pas réécrite** —
première des deux branches du mandat. Le motif est établi au § 3 : une fois le champ `:280`
supprimé, un `null` produit par `catchCause` **n'aurait plus aucun consommateur** (`:313` est
supprimé, `:359` lit un `const` non nullable) ; le laisser en place produirait une valeur morte que
rien ne lit. _INFERE :_ `packages/opencode/AGENTS.md` (« Use `Effect.void` instead of
`Effect.succeed(undefined)` or `Effect.succeed(void 0)` ») banni littéralement `Effect.succeed`
appliqué à `undefined` ; l'appliquer à `null` est une extrapolation d'après l'intention de la règle
(fabriquer une valeur de succès factice), pas une citation littérale. La règle du dépôt est de toute
façon respectée par la suppression : le motif disparaît du fichier. Supprimer plutôt que réécrire
est enfin la seule option qui n'ajoute pas de `makeOptional()` dans un module partagé pour rendre
lisible une branche morte (Objection 3, `P15-verdict.md:122-126`). Le coût de ce choix est
explicité en § 6.

**Sémantique d'échec, tranchée et écrite ici comme l'exige l'Objection 2.** Mode **dur vers
`bootstrap.ts:44`**, sur la base de la preuve (g) : supprimer le `catchCause` **n'ajoute aucun échec
atteignable**, puisque la même lacune de `make()` échoue déjà `init` à `:398` via `:137`, non
protégé. Les deux sites de `make()` dans ce fichier sont désormais d'accord. Ce qui change n'est pas
la disponibilité mais la **visibilité** : un defect devient un échec d'effet nommé, au lieu d'une
désactivation silencieuse. Conséquences à assumer, mesurées :

- `plugin.init()` est le seul `init()` non protégé du bootstrap (j) : un échec de `ensureWatching`
  fait échouer `InstanceBootstrap.run` **[hérité : `P15-verdict.md:24` et `:62`]**.
- `src/index.ts:61-71` ne fait que `Log.Default.error(...)` — il **ne sort pas** du processus
  **[hérité : `P15-verdict.md:67`]** : le processus survit, le rechargement à chaud est abandonné.
- `watchingStarted` reste `true` après l'échec (`:310`), donc aucun réarmement ultérieur n'est
  possible — **identique** au comportement d'aujourd'hui, puisque `:313` sortait aussi avec le
  drapeau déjà mis à `true`.

### Correctif B — protéger l'échec synchrone de `subscribe()` (traite le site réel `:344`)

```diff
@@ -341,8 +341,14 @@
       if (parcelWatcher) {
         for (const dir of dirs) {
           if (!fs.existsSync(dir)) continue
-          const pending = parcelWatcher.subscribe(
+          // `.catch` below only covers rejection; a synchronous throw would escape
+          // ensureWatching, fail Plugin.init() and take the instance bootstrap down.
+          let pending: Promise<ParcelWatcher.AsyncSubscription>
+          try {
+            pending = parcelWatcher.subscribe(
             dir, // … corps d'arguments identique, ligne pour ligne …
             { backend },
             )
+          } catch (err) {
+            log.error("plugin watch subscribe threw", { dir, err })
+            continue
+          }
           pending.then((s) => subs.push(s)).catch((err) => log.error("plugin watch subscribe failed", { dir, err }))
```

Comportement : un répertoire non abonnable est journalisé et sauté ; les autres répertoires sont
toujours armés. `watcherCleanup` (`:370-375`) n'est pas affecté. **C'est le défaut vivant** de ce
fichier : `subscribe` est le seul appel de `:308-376` qui puisse faire tomber `bootstrap.ts:44`.

### Ce qui reste volontairement inchangé

- **`src/agent/agent.ts:421,445,446,464` n'est pas corrigé ici** — voir § 5.6 ; finding `P15-O7`.
- Le garde-fou métier de `reload()` (`:409-413`, rollback sur génération incomplète) est intact : il
  est correct et sans rapport avec la nullabilité.
- Le `if (flags.pure) return` de `:311` est intact : il protège `test/` et les sandboxes.
- `watchingStarted` (`:309-310`) est intact, y compris son caractère non réinitialisable ; le bloc
  `watcherCleanup()` de `:314-317` reste du code mort, volontairement non traité (hors périmètre).
- `src/effect/bridge.ts` n'est **pas** touché : pas de `makeOptional()` (§ 5.4).
- Le partage du pont entre instances (`P15-O8`) n'est **pas** modifié : `ensureWatching` étant défini
  dans le closure de `layer` (`:126-443`) et ne s'exécutant qu'une fois (5), `b` reste créé une fois
  par layer — exactement comme le champ `let` l'était. `captureSync()` n'est pas touché.

## 5. Alternatives considered

1. **`if (!bridge) bridge = yield* EffectBridge.make()` puis `const b = bridge`** (forme de la
   version précédente de cette proposition, `P15-verdict.md:89-94`). **Rejetée : elle ne compile
   pas.** Le type déclaré reste `EffectBridge.Shape | null` (`:280`), `make()` renvoie
   `Effect.Effect<Shape>` (`bridge.ts:54`), et le contrôle de flux ne propage **aucune** narrowness à
   travers une affectation — d'où `TS18047: 'b' is possibly 'null'` sur `b.promise(...)`, et
   `tsgo --noEmit` en échec (C-18). Elle est de plus *doublement* fausse : elle affirme que `bridge`
   est non nul après l'affectation, alors qu'il vaut `null` au premier appel ; et elle conserve
   l'union `Shape | null`, donc ne ferme pas le trou.
2. **Garder le champ nullable et ajouter `if (bridge === null) throw new Error(…)` avant
   `const b: EffectBridge.Shape = bridge`** (première forme acceptée par le verdict,
   `P15-verdict.md:102-106`). **Rejetée :** elle introduit une exception JavaScript nue dans une
   library, dont les seules portes de sortie (`unhandledRejection` / `uncaughtException`) ne font que
   journaliser **[hérité : `P15-verdict.md:116-120`]** — donc non rattrapable par un
   `Effect.catchCause` ajouté en aval, dans une fonction du chemin de démarrage. Elle conserve en
   outre le champ `:280` et son cache mort.
3. **Garder le `catchCause` et produire `EffectBridge.Shape | null` via
   `Effect.as(null as EffectBridge.Shape | null)`** (correctif de la version précédente de cette
   proposition). **Rejeté :** (a) c'est la réécriture de la branche morte, alors que la preuve (g)
   établit qu'aucune dégradation n'est atteignable ; (b) `null as EffectBridge.Shape | null` reste une
   affirmation de type, même sans `any` ; (c) l'effet construit reste infaillible, donc le
   compilateur n'apprend rien de nouveau ; (d) cela introduirait `Effect.as` sur un effet de
   journalisation uniquement pour fabriquer un `null` que rien ne consommerait.
4. **Ajouter `EffectBridge.makeOptional(): Effect.Effect<Shape | null>` à `src/effect/bridge.ts`**
   (Objection 3, `P15-verdict.md:126`, explicitement facultative). **Rejetée :** nouvelle API dans un
   module partagé pour rendre lisible une branche morte ; `make()` n'a aucune raison d'être
   infaillible-nulle, et le dépôt n'a pas d'exception à son canal `never`
   (`packages/opencode/AGENTS.md` : `Effect.void` exigé, `Effect.succeed` banni).
5. **Garder le `catchCause` et ajouter une garde à l'exécution `if (b) b.promise(…)` en `:359`.**
   Rejetée : rend le pont nullable définitivement et déplace le défaut vers une branche morte ; le
   `.catch` de `:359` resterait dans le faux — le code continuerait d'affirmer « je recharge » sans le
   faire. C'est la stratégie « gérer `null` » du mandat, rejetée parce que l'état `null` est
   illégitime (§ 3) et que les autres sites du dépôt ne l'utilisent pas (`plugin/index.ts:137`, et le
   même motif jumeau en `src/agent/agent.ts` **[hérité : `P15-verdict.md:71`]**).
6. **Élargir P15 à `src/agent/agent.ts` (un seul patch pour les deux ponts).** Rejeté : le jumeau
   n'est pas le même problème.
   - **Rayon d'impact différent.** Dans `plugin/index.ts`, `ensureWatching` est atteint par
     `plugin.init()` → `bootstrap.ts:44`, un `init()` **nu** (j). Dans `src/agent/agent.ts`, les
     sites d'appel observés sont des **accesseurs** (`Agent.get`, `Agent.list`,
     `Agent.defaultInfo`), donc un échec s'y propage vers l'appelant, pas vers un bootstrap
     d'instance **[hérité : `P15-verdict.md:294-300`]**.
   - **Correctif B sans équivalent.** `agent.ts` arme ses watchers par `fs.watch`, pas par
     `@parcel/watcher` : il n'y a pas d'abonnement à protéger, donc `watch-subscribe-throw.test.ts`
     n'aurait pas d'objet **[hérité : `P15-verdict.md:301-303`]**.
   - **Conséquence : le dépôt garde 2 ponts nullable tant que la jumelle n'est pas traitée.** C'est
     pourquoi `P15-O7` reste **ouvert** : la proposition jumelle est requise, pas optionnelle. Sans
     elle, le gain de P15 est de 1 sur 2.

### Findings repris du verdict (`P15-verdict.md:154-163`)

| id | sévérité | statut après cette révision |
|---|---|---|
| `P15-O1` | high | **closed** — correctif A : `const b: EffectBridge.Shape = yield* EffectBridge.make()` sur un `const` non nullable, champ `:280` supprimé ; plus aucune narrowness à prouver, donc plus aucun `TS18047` possible. Preuve exigée : `bun typecheck` exit 0 (§ 7, T0) |
| `P15-O2` | high | **closed** — sémantique d'échec tranchée explicitement en § 4 (« mode dur vers `bootstrap.ts:44` ») et reprise en § 6, avec la preuve (g) qu'aucun échec atteignable n'est ajouté ; aucun `throw` JavaScript |
| `P15-O3` | low | **closed** — `makeOptional()` écarté (§ 5.4) ; ni `as any`, ni `Effect.succeed(null …)`, ni `Effect.as` réintroduits ; la branche `catchCause` est supprimée, pas réécrite |
| `P15-O4` | medium | **closed** — T1 corrigé (§ 2 (k) : le répertoire existe, 14 fichiers) ; T2 sans `expect-type` (§ 7) |
| `P15-O5` | low | **closed** — T3 élargi à `bridge!\.\|null as any\|Effect.succeed\(null` (§ 7) |
| `P15-O6` | medium | **closed** — `test/plugin/watch-subscribe-throw.test.ts` ajouté (§ 7, T5) |
| `P15-O7` | medium | **open** — proposition jumelle `src/agent/agent.ts` à créer (§ 5.6) |
| `P15-O8` | low | **open, hors périmètre** — le pont reste une closure de **layer** (`:126-443`) figeant le contexte de la première instance via `captureSync()` (`bridge.ts:19-25`). Ce patch **ne touche pas** à `captureSync()` ni à la durée de vie du pont (§ 4) |

## 6. Risks

- **Régression sur les tests existants.** Le correctif A ne modifie aucun comportement observable :
  le champ `:280` était écrit une fois (`:312`) et lu une fois (`:359`), tous deux après le
  franchissement de `:313` (h). Fichiers de test couvrant le chemin :
  `packages/opencode/test/plugin/hot-reload.test.ts`, `packages/opencode/test/plugin/reload-rollback.test.ts`,
  `packages/opencode/test/plugin/trigger.test.ts`, `packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`,
  `packages/opencode/test/config/plugin.test.ts`, `packages/opencode/test/agent/plugin-agent-regression.test.ts`
  **[hérité : `P15-verdict.md:83`]**. Le correctif B change le comportement de `subscribe` qui lève :
  un répertoire est sauté au lieu de faire tomber le bootstrap — c'est le but, mais un test qui
  attendrait la propagation (aucun trouvé) échouerait. **Base de comparaison obligatoire :** 8 tests
  échouent **avant** toute implémentation (`CORRECTIONS.md:17`, `BASELINE.md`) ; une suite rouge ne
  prouve donc pas une régression de ce patch.
- **Coût ajouté, chiffré.** **0 allocation supplémentaire, 0 appel réseau, 0 ms au runtime** : le
  diff retire trois lignes exécutables et en ajoute une (plus huit lignes de commentaire et une
  ligne de contexte) ; le nombre d'appels à `EffectBridge.make()` est inchangé (les sites `:137` et
  `:312` restent distincts et ne sont pas fusionnés). Le `try/catch` du correctif B n'alloue rien :
  `pending` est une variable de la boucle, pas une closure créée par répertoire. Le seul coût
  mesurable est une exécution supplémentaire de `bun typecheck` (~60 s **[hérité :
  `P15-verdict.md:26`]**).
- **Risque de sécurité : aucun.** Ni surface d'injection, ni contournement de permission, ni entrée
  non fiable : le patch ne touche aucun parseur, aucune permission, aucun appel réseau. Le seul
  élément de sécurité du fichier est le rollback de `:409-413`, laissé intact.
- **Risque résiduel assumé — le seul vrai.** `Effect.catchCause` intercepte aussi les **defects**,
  que le canal `never` n'exclut pas statiquement (f). Supprimer la branche transforme donc un defect
  hypothétique de `make()` — par exemple une `captureSync()` qui lèverait (`bridge.ts:19-25`) — en
  échec d'effet qui remonte à `bootstrap.ts:44` (j), puis n'est **que journalisé** par
  `src/index.ts:61-71` **[hérité : `P15-verdict.md:67`]** : le processus survit, le rechargement à
  chaud est abandonné, et la trace porte désormais le nom de la cause. Ce changement est **délibéré**
  et **couvert** : (a) le même defect échoue déjà `init` à `:398` via `:137` non protégé (g), donc il
  n'est pas nouveau ; (b) un defect masqué en désactivation silencieuse est plus coûteux à diagnostiquer
  qu'un échec visible. Si un validateur juge ce compromis inacceptable, la variante est de déplacer le
  filet de `:137` **et** de `:312` vers un `Effect.logWarning` commun — mais cela sort de P15 (deux
  sites, un test supplémentaire) et justifierait une proposition distincte.
- **Non-régression du correctif B à prouver, pas à supposer** : voir T5 (§ 7).

## 7. Tests

Plan exécutable et vérifiable. Commandes à lancer depuis `packages/opencode`.

**T0 — compilation (preuve principale de C-18).**

- Commande : `bun typecheck` (script `tsgo --noEmit`, `packages/opencode/package.json:9`
  **[hérité : `P15-verdict.md:23`]**).
- Critère de succès : **exit 0**, et aucun diagnostic `TS18047` sur `plugin/index.ts`.
- À exécuter **après** le correctif A seul (ordre imposé par `P15-verdict.md:148`).

**T1 — le pont n'est plus nullable au point d'usage.**

- Fichier à écrire : `packages/opencode/test/plugin/bridge-non-null.test.ts` — **dans le répertoire
  existant** (14 fichiers, § 2 (k)), aligné sur `packages/opencode/test/plugin/reload-rollback.test.ts`.
- Commande : `bun test test/plugin/bridge-non-null.test.ts`
- Critère de succès : le test **échoue** sur le code d'avant patch (la garde `if (!bridge) return`
  donne `watchers armed: 0` et aucune relance) et passe après (le callback du watcher déclenche une
  relance via le pont capturé). Un test qui passe dans les deux mondes ne prouve rien.

**T2 — le type ne peut plus être blanchi.**

- Fichier : `packages/opencode/test/plugin/bridge-non-null.test.ts` (même fichier que T1).
- Contenu : une assertion **`@ts-expect-error`** — *pas* `expectTypeOf` : `expect-type` n'est une
  dépendance d'aucun `package.json` du dépôt et aucun test ne l'utilise **[hérité :
  `P15-verdict.md:131`]**. Forme retenue, en appel plutôt qu'en affectation, pour ne dépendre ni de
  `noUnusedLocals` ni d'un lint d'une variable inutilisée :
  ```ts
  declare function acceptShape(s: EffectBridge.Shape): void
  declare const possiblyNullBridge: EffectBridge.Shape | null
  // @ts-expect-error — the nullable bridge must not be assignable to a required Shape
  acceptShape(possiblyNullBridge)
  ```
- Commande : `bun typecheck`
- Critère de succès : exit 0 **avec** le `@ts-expect-error` — donc l'erreur existe bien. Si TypeScript
  ne signalait rien sous la directive, `@ts-expect-error` deviendrait lui-même `TS2578` et le
  typecheck échouerait : la preuve détecte les deux sens.

**T3 — les motifs bannis ont disparu du fichier.**

- Commande :
  `rg -n "bridge!\.|null as any|Effect.succeed\(null" packages/opencode/src/plugin/index.ts; echo "exit=$LASTEXITCODE"`
- Critère de succès : **aucune ligne imprimée et `exit=1`**. Le motif est volontairement élargi par
  rapport à la version précédente (`null as any` seul), qui aurait laissé passer `bridge!.`
  **[hérité : `P15-verdict.md:143`]**.

**T4 — non-régression fonctionnelle du cycle de vie plugin.**

- Commande : `bun test test/cli/tui/plugin-lifecycle.test.ts` **[hérité : `P15-verdict.md:25`]**
- Critère de succès : exit 0, et **conforme à la base** (`CORRECTIONS.md:17`).

**T5 — non-régression du correctif B (défaut vivant, `P15-O6`).**

- Fichier à écrire : `packages/opencode/test/plugin/watch-subscribe-throw.test.ts`.
- Contenu : forcer le binding `@parcel/watcher` à lever **de façon synchrone** depuis `subscribe`, puis
  vérifier que le bootstrap d'instance survit et que le répertoire fautif est journalisé
  (`plugin watch subscribe threw`) et sauté.
- Commande : `bun test test/plugin/watch-subscribe-throw.test.ts`
- Critère de succès : le test **échoue** sur le code d'avant patch (le bootstrap tombe) et passe
  après. C'est la seule preuve que le défaut vivant de `:344` est réellement fermé.

**Ordre d'exécution (conformément à `P15-verdict.md:148`) :** T0 → T3 → T1 → (correctif B) T5 → T4.

## 8. Effort

`S` — trois lignes supprimées et une ajoutée dans un seul fichier, plus six lignes de `try/catch` dans
le même fichier, deux fichiers de test à écrire et une exécution de `bun typecheck` ; aucune
migration, aucun nouveau module, aucun changement de contrat d'API.

## 9. Verdict self-assessment

`READY`.

Les deux objections bloquantes sont traitées par construction, et non par argumentation : le correctif A
n'a plus de variable nullable à prouver (`const b: EffectBridge.Shape = yield* EffectBridge.make()`,
champ `:280` supprimé, `b.promise(…)` sans assertion), et la branche `catchCause` est supprimée avec
son seul consommateur, sur la preuve de première main que le même `make()` échoue déjà `init` à `:398`
via `:137`. Aucun `as any`, aucun `throw` JavaScript, aucune API ajoutée, aucune sémantique d'échec
nouvelle introduite.

Réserves explicites, qui n'appartiennent pas au correctif : `P15-O7` (jumeau `src/agent/agent.ts`) et
`P15-O8` (pont partagé entre instances via `captureSync()`) restent **ouverts** et ne sont pas traités
ici — le premier est une proposition jumelle requise, le second est hors portée par construction, ce
patch ne touchant pas à la durée de vie du pont. Le seul arbitrage qui reste au validateur est celui du
§ 6, « risque résiduel assumé » : accepter qu'un **defect** de `make()` devienne un échec d'effet
visible au lieu d'une désactivation silencieuse, ou ouvrir une proposition distincte pour déplacer le
filet commun à `:137` et `:312`. Cet arbitrage ne bloque pas le correctif A, qui est indépendant de la
branche supprimée.