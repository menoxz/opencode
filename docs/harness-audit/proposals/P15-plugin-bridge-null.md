# P15 — Pont plugin nullable déréférencé dans le chemin de rechargement à chaud

## 1. Problem

Le pointeur non optionnel `bridge!` déréférencé dans le callback de rechargement à chaud des plugins
ne peut pas s'exécuter aujourd'hui, mais il est rendu possible par un `as any` qui fait disappear
l'erreur de type que le compilateur devrait signaler.

## 2. Evidence

Cartographie exhaustive des sites du pont dans `packages/opencode/src/plugin/index.ts` :

**(a) Déclaration du pont nullable — `plugin/index.ts:280`**

```ts
    let bridge: EffectBridge.Shape | null = null
    let watchingStarted = false
```

**(b) Producteur du `null` — `plugin/index.ts:312-313`**

```ts
      if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))
      if (!bridge) return
```

**(c) Le seul déréférencement du pont nullable — `plugin/index.ts:356-361`**

```ts
                  setTimeout(() => {
                    timers.delete(evt.path)
                    log.info("plugin file changed, reloading", { file: evt.path })
                    bridge!.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
                  }, DEBOUNCE_MS),
```

**(d) `plugin/index.ts:366` — `pending` n'est PAS le pont**

```ts
          const pending = parcelWatcher.subscribe(
            dir,
            (err, evts) => {
```

`pending` est la valeur de retour de `parcelWatcher.subscribe(...)`, de type
`Promise<ParcelWatcher.AsyncSubscription>` (cf. `plugin/index.ts:338` pour le type de l'élément
poussé : `const subs: ParcelWatcher.AsyncSubscription[] = []`). Ce n'est ni le pont nullable, ni un
type optionnel : `.catch` couvre bien le rejet. **L'affirmation de la matrice (« même forme, même
défaut ») est donc inexacte pour la ligne 366** ; le défaut réel qui s'y cache est différent et est
traité au § 4 (correctif B).

**(e) Le pont `Shape` non-null du même fichier — `plugin/index.ts:137-141`**

```ts
        const bridge = yield* EffectBridge.make()

        function publishPluginError(message: string) {
          bridge.fork(bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() }))
```

C'est un **second pont**, non nullable, immunisé contre le défaut : `make()` est appelé directement, sans
`catchCause`. Toute lacune de `EffectBridge.make()` fait donc échouer l'init d'instance, pas le
rechargement à chaud.

**(f) Le canal d'erreur de `EffectBridge.make()` est `never` — `src/effect/bridge.ts:54`**

```ts
export function make(): Effect.Effect<Shape> {
  return Effect.gen(function* () {
    const ctx = yield* Effect.context()
    const captured = captureSync()
    const instance = (yield* InstanceRef) ?? captured.instance
```

Aucun `require`, aucun accès disque, aucun réseau, aucun code utilisateur dans ce corps.

**(g) Les deux références ne sont pas obligatoires — `src/effect/instance-ref.ts:5-10`**

```ts
export const InstanceRef = Context.Reference<InstanceContext | undefined>("~opencode/InstanceRef", {
  defaultValue: () => undefined,
...
export const WorkspaceRef = Context.Reference<WorkspaceID | undefined>("~opencode/WorkspaceRef", {
  defaultValue: () => undefined,
```

**INFERE:** `EffectBridge.make()` est donc infaillible en pratique (canal `never` + deux références à
valeur par défaut). *Vérification :* test unitaire `packages/opencode/test/plugin/bridge-non-null.test.ts`
(T1 du § 7) qui construit un pont sans contexte et échoue si le résultat est nul ou si l'effet échoue.

**(h) Le style du dépôt est le pont non-null : 20 sites sur 22** — `src/session/llm.ts:243`,
`src/tool/registry.ts:241`, `src/plugin/index.ts:137`, `src/mcp/index.ts:717,891,1004,1096,1153`,
`src/provider/provider.ts:1276`, `src/bus/index.ts:101,242`, `src/skill/index.ts:308`,
`src/daemon/file-watcher.ts:103`, `src/sync/index.ts:107,149`,
`src/server/routes/instance/httpapi/handlers/pty.ts:169`, `.../global.ts:73`,
`src/pty/index.ts:186`, `src/file/watcher.ts:92`, `src/command/index.ts:74` — tous de la forme
`const bridge = yield* EffectBridge.make()`. Les **deux seuls** outliers sont
`src/plugin/index.ts:280` et `src/agent/agent.ts:421`.

**(i) Les deux seuls sites d'écriture du pont nullable** sont `plugin/index.ts:280` (initialisation)
et `plugin/index.ts:312`. Aucune affectation entre `313` et `359`, donc aucune fermeture capturée ne
peut observer une valeur écrite après `312`.

## 3. Mechanism

Chemin d'exécution de bout en bout de `ensureWatching()` :

1. `Project.run` appelle `yield* plugin.init()` à chaque bootstrap d'instance —
   `src/project/bootstrap.ts:44`. Ce chemin est **non protégé** : les neuf autres services du même
   `Effect.forEach` ont chacun `Effect.catchCause(...)` (`bootstrap.ts:49`), pas `plugin.init()`.
2. `init()` (`plugin/index.ts:397-400`) appelle `ensureWatching()` (`399`).
3. `ensureWatching` retourne immédiatement si `watchingStarted` est vrai
   (`plugin/index.ts:309-310`), **avant** toute création de pont. Le drapeau est mis à `true` en 310
   et n'est jamais remis à zéro dans le fichier.
4. Retour immédiat en mode pur : `plugin/index.ts:311`.
5. Création du pont : `plugin/index.ts:312`. En cas de lacune de `make()`, `catchCause` renvoie
   `null`, `bridge` reste `null`.
6. **Garde de narrowing : `if (!bridge) return` — `plugin/index.ts:313`.** Si le pont est nul,
   l'exécution s'arrête ici.
7. L'armement des callbacks n'a lieu qu'après 313 : `subscribe` est appelé en
   `plugin/index.ts:344`, le callback d'événement en `346`, le `setTimeout` en `356`, et la
   fermeture qui lit `bridge` en `359`.
8. À l'exécution du timer, `bridge!` (`plugin/index.ts:359`) est lu.

**Conclusion du chemin : le pointeur nul est inatteignable par construction.** Les closure
`346`/`356`/`359` ne sont créées que si `313` est franchi avec `bridge` non nul ; le drapeau
`watchingStarted` interdit une seconde passe ; et aucune écriture n'intervient entre 313 et 359.
Le `.catch` de `359` ne couvre ni un échec synchrone (il est attaché à une promesse qui n'est jamais
créée si `bridge!.promise` lève) ni un pont déjà consommé — mais ces deux scénarios sont inatteignables
ici. **Le défaut est un trou de type, pas une panne vivante.**

**Pourquoi le pont nul est-il un état légitime — cas normal ou erreur ?** Ni l'un ni l'autre : c'est un
état mort. `EffectBridge.make()` échouer dans cette couche n'est pas récupérable, parce que le même
appel est fait sans `catchCause` en `plugin/index.ts:137` (§ 2e) : la lacune remonterait déjà dans
l'init d'instance, et de là dans `plugin.init()` (`398`), puis dans le bootstrap
(`bootstrap.ts:44`). Avaler l'échec en 312 n'achète aucune survie — il achète seulement le silence.

**Question 4 du mandat — chemin de rechargement à chaud et blast radius :** oui, c'est exactement le
chemin de rechargement à chaud, et `plugin.reload()` a bien des appelants externes
(`src/server/routes/instance/httpapi/handlers/plugin.ts:45,52,59` pour `reload`,
`src/project/bootstrap.ts:44` pour `init`). Une exception à `plugin/index.ts:359` ne surviendrait pas
dans une fibre Effect : elle est levée dans un callback `setTimeout` (356), donc hors de tout
`Effect.run*`. Elle deviendrait un `uncaughtException`. Il existe des gestionnaires de niveau processus
— `src/index.ts:67` (`uncaughtException`) et `src/index.ts:61` (`unhandledRejection`), plus
`src/cli/cmd/tui/worker.ts:30,36` et `src/cli/cmd/tui/thread.ts:176-177` — dont le comportement exact
(journalisation ou sortie) n'a pas été lu.
**INFERE:** le processus survit grâce à ce gestionnaire, mais l'abandon silencieux du rechargement à
chaud et l'absence de trace exploitable restent plausibles. *Vérification :* lire
`src/index.ts:55-80`, puis provoquer un `reload()` avec `flags.pure` forcé et observer le code de
sortie du processus.

## 4. Proposal

Deux correctifs ciblés dans `packages/opencode/src/plugin/index.ts`. Aucun autre fichier n'est
touché.

### Correctif A — sceller le type du pont (traite `280`, `312`, `313`, `359`)

```diff
--- a/packages/opencode/src/plugin/index.ts
+++ b/packages/opencode/src/plugin/index.ts
@@ -309,8 +309,11 @@
       if (watchingStarted) return
       watchingStarted = true
       if (flags.pure) return
-      if (!bridge) bridge = yield* EffectBridge.make().pipe(Effect.catchCause(() => Effect.succeed(null as any)))
-      if (!bridge) return
+      // EffectBridge.make() has a `never` error channel (src/effect/bridge.ts:54) and the very
+      // same call is already made bare at line 137, so a defect is not a state this layer can
+      // survive: swallowing it here would only hide a failure the instance init hits anyway.
+      if (!bridge) bridge = yield* EffectBridge.make()
+      const b = bridge // narrowed to EffectBridge.Shape, captured immutably below
       if (watcherCleanup) {
@@ -356,7 +359,7 @@
                     timers.delete(evt.path)
                     log.info("plugin file changed, reloading", { file: evt.path })
-                    bridge!.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
+                    b.promise(reload()).catch((err) => log.error("plugin reload error", { err }))
```

Ce qui change, précisément :

- `as any` disparaît : l'affectation de 312 redevient `EffectBridge.Shape`, et le narrowing de la
  ligne suivante est produit par le contrôle de flux du compilateur, pas par une assertion.
- `Effect.catchCause(() => Effect.succeed(null as any))` disparaît : une lacune de `make()` remonte
  en tant qu'échec Effect typé, exactement comme au site `137`. Le type et le comportement deviennent
  cohérents avec le reste du module.
- `if (!bridge) return` (313) devient du code mort et est supprimé ; `bridge` est désormais non nul
  après l'affectation.
- `bridge!` (359) devient `b` : plus d'assertion non-null, et la fermeture capture une liaison
  immuable au lieu d'une `let` mutable. C'est ce qui rend la lecture de 359 stable même si quelqu'un
  réintroduit plus tard une affectation dans la portée.
- Le type de `bridge` (280) reste `EffectBridge.Shape | null` : il continue de porter l'état
  « pas encore armé » tant que 312 n'a pas tourné. Le type somme est conservé, mais il n'est plus
  *atteignable* au moment où il est déréférencé.

### Correctif B — couvrir l'échec synchrone de `subscribe()` (traite le site réel de `366`)

Le `.catch` de `plugin/index.ts:366` ne couvre que le rejet. Un `subscribe()` qui lève de façon
synchrone s'échappe de la boucle `342-367`, donc de `ensureWatching()`, donc de `init()` (399), donc
du bootstrap (`bootstrap.ts:44`) : l'échec est total et non journalisé.

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
+            dir, // … corps d'arguments identique, ligne pour ligne …
             { backend },
             )
+          } catch (err) {
+            log.error("plugin watch subscribe threw", { dir, err })
+            continue
+          }
           pending.then((s) => subs.push(s)).catch((err) => log.error("plugin watch subscribe failed", { dir, err }))
```

Comportement : un répertoire non abonnable est journalisé et sauté ; les autres répertoires sont
toujours armés. `watcherCleanup` (370) n'est pas affecté.

### Ce qui reste volontairement inchangé

- `src/agent/agent.ts:421,445,446,464` porte le défaut **identique** (`let bridge: Shape | null`,
  `Effect.succeed(null as any)`, `bridge!.promise(reload())`). Il n'est **pas** corrigé ici : le
  contrat de l'audit impose un fichier de proposition par problème, et P15 pointe
  `src/plugin/index.ts:359`. C'est une proposition jumelle à créer, pas un oubli.
- Le garde-fou métier de `reload()` (`plugin/index.ts:409-413`, rollback sur échec de génération) est
  intact : il est correct et sans rapport avec la nullabilité.
- Le `if (flags.pure) return` de 311 est intact : il protège `test/` et les sandboxes.
- La déclaration `bridge: EffectBridge.Shape | null` (280) est conservée (voir ci-dessus).

## 5. Alternatives considered

1. **Remplacer `as any` par un type somme explicite `EffectBridge.Shape | null` et garder `bridge!`.**
   Rejeté : c'est l'état actuel déguisé. Le type reste nullable, `bridge!` reste une assertion qui
   désactive la vérification, et le compilateur ne peut toujours rien dire si l'invariant de 313 est
   un jour violé. On paie la complexité d'un type somme pour un trou qui reste.
2. **Garder le `catchCause` et ajouter une garde runtime `if (b) b.promise(...)` en 359.** Rejeté :
   cela rend le pont nullable *définitivement* et déplace le défaut vers une branche muerte. Le
   `.catch` de 359 reste alors dans le faux — le code continue d'affirmer « je recharge », il ne
   recharge pas, et rien ne le signale. C'est la stratégie « gérer null » demandée en option 3 du
   mandat ; elle est rejetée parce que l'état `null` est lui-même illégitime (§ 3) et que 20 des 22 sites du
   dépôt ne l'utilisent pas.
3. **Supprimer entièrement le champ `bridge` et l'inliner dans `ensureWatching`.** Rejeté : bien que
   `watchingStarted` mémorise déjà la passe, cela changerait plus de lignes que nécessaire et
   effacerait le type somme de 280, qui reste informatif.
4. **Corriger aussi `agent/agent.ts` dans le même patch.** Rejeté pour cette proposition (contrat
   d'audit, § 4), mais **signalé comme finding ouvert** : tant que P15-jumeau n'est pas traité, le
   dépôt conserve deux bridges nullable au lieu de zéro.

## 6. Risks

- **Régression sur les tests existants.** Fichiers concernés : `packages/opencode/test/config/plugin.test.ts`,
  `packages/opencode/test/agent/plugin-agent-regression.test.ts`,
  `packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`,
  `packages/opencode/test/cli/tui/plugin-loader.test.ts`,
  `packages/opencode/test/cli/tui/plugin-loader-pure.test.ts`,
  `packages/opencode/test/cli/tui/plugin-loader-entrypoint.test.ts`,
  `packages/opencode/test/cli/tui/plugin-install.test.ts`, `.../plugin-add.test.ts`,
  `.../plugin-toggle.test.ts`, plus les fixtures `packages/opencode/test/fixture/plugin.ts` et
  `tui-plugin.ts`. Aucun de ces tests n'observe `bridge` : le comportement observable du chemin
  armé est identique après le correctif A, puisque la branche avalée était inatteignable. La
  surface à risque réel est le mode pur (`plugin-loader-pure.test.ts`), où 311 sort avant 312 — donc
  **avant** la zone modifiée, ce qui rend la régression structurellement impossible.
- **Disponibilité — c'est le vrai risque du correctif A.** Aujourd'hui, une lacune de `make()` en 312
  dégrade silencieusement le rechargement à chaud. Après le correctif, elle devient un échec Effect
  qui remonte par `init()` (`plugin/index.ts:399`) vers `plugin.init()` (`bootstrap.ts:44`) et
  **fait échouer le bootstrap d'instance** ; les routes `POST /plugin/{reload,add,remove}` renvoient
  une erreur 500 au lieu d'un statut trompeur. Ce changement est délibéré (une instance sans pont ne
  peut pas servir les plugins), mais il doit être assumé par le validateur : c'est la seule variation
  de comportement du patch.
- **Coût en tokens / latence.** runtime : **0 allocation, 0 appel réseau, 0 ms** ajoutés — le
  correctif remplace une construction d'effet par un appel direct et supprime un `Effect.catchCause`.
  Le correctif B ajoute un `try/catch` sans coût sur le chemin nominal. Le seul coût mesurable est
  **une exécution de `bun typecheck`** (~60 s d'après le budget du projet) : supprimer `as any`
  restaure la vérification stricte et peut révéler des erreurs de type préexistantes jusque-là
  masquées dans ce fichier. C'est le seul poste à chiffrer.
- **Sécurité.** Aucun risque d'injection ni de contournement de permission : aucune entrée utilisateur
  n'atteint ces lignes, les répertoires surveillés proviennent de `Global.Path.config` et des origines
  `file://` de la configuration (`plugin/index.ts:319-322`). Le déclencheur est un changement de
  fichier local. Le correctif B ne modifie pas la liste des répertoires. Aucun secret en jeu.
- **Dérive possible.** Une fois `as any` retiré, `bridge` est non nul après 312 ; une affectation
  ultérieure dans la portée deviendrait une erreur de compilation. C'est exactement l'effet recherché.

## 7. Tests

**T1 — `packages/opencode/test/plugin/bridge-non-null.test.ts`** (nouveau ; le répertoire
`packages/opencode/test/plugin/` n'existe pas encore)

- Constat : `EffectBridge.make()` sur un effet nu, hors de tout contexte d'instance, et sur un effet
  fournissant `InstanceRef`/`WorkspaceRef`.
- Critère de succès observable : les deux effets **se terminent en `Success`** et `EffectBridge.Shape`
  est non nul (les quatre membres `promise`, `fork`, `run`, `bind` sont des fonctions). Un
  `Exit.Failure` fait échouer le test.
- Commande : `bun test test/plugin/bridge-non-null.test.ts` depuis `packages/opencode`.

**T2 — test de type, la vraie régression de P15.** Un test en `expectTypeOf` / `@ts-expect-error`
prouvant qu'une lecture non gardée d'un pont nullable est désormais refusée. Si le compilateur accepte
toujours la lecture, le trou n'est pas scellé.

- Commande : `bun typecheck` depuis `packages/opencode`.

**T3 — garde de non-régression sur le texte source**, preuve mécanique que `as any` et `bridge!` ont
disparu du chemin :

```
rg -n "bridge!|null as any" packages/opencode/src/plugin/index.ts
```

Critère de succès : **exit 1** (aucune correspondance) ; `rg` retourne 0 tant qu'une occurrence
subsiste.

**T4 — non-régression fonctionnelle du rechargement à chaud.** Étendre
`packages/opencode/test/cli/tui/plugin-lifecycle.test.ts` : écrire un `.ts` dans le répertoire plugin,
attendre le debounce (300 ms, `plugin/index.ts:340`), observer `Plugin.version()` (`427-430`)
s'incrémenter et le log `plugin file changed, reloading` (`358`).
Commande : `bun test test/cli/tui/plugin-lifecycle.test.ts`.
Critère : `generation` passe de N à N+1, aucun `plugin reload error` au log.

## 8. Effort

`XS` — deux diffs dans un seul fichier de 451 lignes, aucune dépendance nouvelle, aucun test existant
à réécrire ; le correctif B est un `try/catch` de six lignes.

## 9. Verdict self-assessment

`NEEDS_REVIEW`.

Deux questions précises à trancher par le validateur :

1. **Portée.** `src/agent/agent.ts:445,464` porte exactement le même défaut (`Effect.succeed(null as any)`
   puis `bridge!.promise(...)`). P15 doit-il rester limité à `src/plugin/index.ts`, ou le validateur
   exige-t-il un correctif jumellé avant de statuer ? Tant que ce n'est pas tranché, le dépôt garde
   deux ponts nullable sur 22.
2. **Comportement à l'échec.** Le correctif A supprime l'avalement de 312 : une lacune de
   `EffectBridge.make()` fera désormais échouer `plugin.init()` et donc le bootstrap d'instance
   (`bootstrap.ts:44`) au lieu de dégrader silencieusement le rechargement à chaud. Est-ce le
   comportement voulu, ou faut-il conserver une dégradation gracieuse avec un chemin de repli explicite
   et journalisé (rechargement à chaud désactivé, instance servie) ?
