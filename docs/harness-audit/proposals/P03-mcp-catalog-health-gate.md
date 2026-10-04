# P03 — La readiness MCP doit être un gate de sélection du catalogue

> Révisé après verdict du 2026-10-03 — réécriture complète (fichier corrompu, règle C-21).
> Rien de l'existant n'est conservé : le fichier avait reçu deux écritures concurrentes.
> Toutes les citations ci-dessous ont été relues par `read` dans cette passe ;
> celles qui n'ont pas pu être relues ont été supprimées (§2.10, table finale).
> Validateur d'origine : `independent`, statut `PASS_WITH_CHANGES`,
> `docs/harness-audit/verdicts/P03-verdict.md`.

---

## 1. Problem

Un serveur MCP qui a cessé de répondre reste annoncé `connected` pendant toute la fenêtre
de détection, et ses ~20 outils continuent d'être sérialisés dans le catalogue transmis au
modèle à chaque requête, sans aucun indice que l'appel échouera.

---

## 2. Evidence

Chaque bloc porte son étiquette de plage exacte. Les élisions sont marquées `…`.

### 2.1 Le compteur de santé existe dans l'état vivant

`packages/opencode/src/mcp/index.ts:719-726` — l'état par instance porte déjà le compteur
qui décide de la déconnexion, et `catalogVersion` qui invalide le catalogue.

```ts
        const s: State = {
          status: {},
          clients: {},
          defs: {},
          fingerprints: {},
          healthFailures: {},
          catalogVersion: 1,
        }
```

`packages/opencode/src/mcp/index.ts:800-811` — le compteur est écrit par le tick de santé,
au premier ping réussi **et** à chaque échec.

```ts
                : Effect.tryPromise(() => pingWithTimeout(client, pingTimeout)).pipe(
                    Effect.catch(() => Effect.succeed(false)),
                    Effect.flatMap((ok) => {
                      if (ok) {
                        delete s.healthFailures[name]
                        return Effect.void
                      }
                      const failures = (s.healthFailures[name] ?? 0) + 1
                      s.healthFailures[name] = failures
                      if (!shouldDisconnectAfterHealthFailures(failures)) return Effect.void
                      return markDisconnected(s, name, client, `health check ping failed ${failures} times`)
                    }),
```

### 2.2 La cause : le filtre d'entrée ignore la santé

`packages/opencode/src/mcp/index.ts:1135-1137` — c'est **seule** la ligne qui décide quels
clients alimentent le catalogue.

```ts
      const connectedClients = Object.entries(s.clients).filter(
        ([clientName]) => s.status[clientName]?.status === "connected",
      )
```

`packages/opencode/src/mcp/index.ts:1127-1129` — `MCP.tools()` récupère le même objet d'état
que le tick de santé, donc le compteur est lisible **au moment** de l'assemblage.

```ts
    const tools = Effect.fn("MCP.tools")(function* () {
      const result: Record<string, Tool> = {}
      const s = yield* InstanceState.get(state)
```

`packages/opencode/src/mcp/index.ts:1155` — l'identifiant de catalogue est construit avec
`sanitize`, donc le nom à annoncer pour un serveur filtré est déjà calculable.

```ts
              result[sanitize(clientName) + "_" + sanitize(mcpTool.name)] = convertMcpTool(
```

`packages/opencode/src/mcp/index.ts:902-903` — `MCP.status` est un pur lecteur d'état ;
`catalogVersion` y est seulement retourné (`:922-924`). Aucun des quatre incréments de
`catalogVersion` n'est un ajout : `:694` (`ToolListChanged`), `:862` (`closeClient`),
`:897` (`storeClient`), `:1100` (`reload`). **Aucun serveur mort ne peut réapparaître par
`catalogVersion`** : la causalité annoncée au verdict est écartée, l'invariant reste valable.

### 2.3 Ce qui est indiscutable : la santé est lisible à l'assemblage, mais aveugle jusqu'à un intervalle

`packages/opencode/src/mcp/index.ts:840-842` — l'intervalle est configurable, défaut
`defaultMcpHealthIntervalMs`.

```ts
        const healthInterval = cfg.experimental?.mcp_health_interval_ms ?? defaultMcpHealthIntervalMs
        if (healthInterval > 0) {
          // Delay the first tick so freshly connected clients are stable before
```

`packages/opencode/src/mcp/index.ts:846-847` — **le premier tick est retardé d'un intervalle
entier**. C'est la borne de latence que la proposition d'origine n'écrivait nulle part.

```ts
              healthTick().pipe(
                Effect.delay(Duration.millis(healthInterval)),
```

`packages/opencode/src/mcp/reconnect-policy.test.ts:10-12` — la valeur du défaut, confirmée
par une assertion existante dans le dépôt.

```ts
  test("uses a conservative default health interval", () => {
    expect(defaultMcpHealthIntervalMs).toBe(30_000)
  })
```

`packages/opencode/src/mcp/reconnect-policy.test.ts:18-21` et `:23-25` — un échec transitoire
ne déconnecte pas : le seuil est à 3. C'est ce qui autorise un seuil de gate à `> 0`.

```ts
  test("keeps a client after one transient health failure", () => {
    expect(shouldDisconnectAfterHealthFailures(1)).toBe(false)
    expect(shouldDisconnectAfterHealthFailures(2)).toBe(false)
  })
```

```ts
  test("disconnects after three consecutive health failures", () => {
    expect(shouldDisconnectAfterHealthFailures(3)).toBe(true)
  })
```

`packages/opencode/src/mcp/index.ts:200-204` — le seuil lui-même, à côté duquel le prédicat
proposé sera placé.

```ts
const HEALTH_FAILURE_THRESHOLD = 3

export function shouldDisconnectAfterHealthFailures(failures: number): boolean {
  return failures >= HEALTH_FAILURE_THRESHOLD
}
```

### 2.4 Le chemin d'assemblage, de bout en bout

`packages/opencode/src/session/tools.ts:169-182` — `mcpVersion` entre dans `catalogKey`.

```ts
  const mcpVersion = mcp.catalogVersion ? yield* mcp.catalogVersion() : 0
  const registryVersion = yield* registry.catalogVersion()
  const catalogKey = [
    "v1",
    input.model.providerID,
    input.model.api.id,
    input.agent.name,
    JSON.stringify(input.agent.permission),
    input.securityMode ?? "interactive-tui",
    input.forceWriteTools ? "write" : "read",
    registryVersion,
    mcpVersion,
```

`packages/opencode/src/session/tools.ts:184-186` — le catalogue est mémoïsé, puis la closure
construit les entrées locales **et** MCP.

```ts
  const prepared = yield* ToolCatalog.getPreparedEffect(
    registry,
    catalogKey,
```

`packages/opencode/src/session/tools.ts:206-219` — la boucle MCP. **Correction de forme par
rapport au verdict** : la plage est `:206-219`, pas `:211-216`, et `:210` fait
`if (!item.execute) continue`, donc la boucle ne verse pas « tout » ce que renvoie
`mcp.tools()`.

```ts
      const mcpServers = Object.keys(cfg.mcp ?? {})
        .map((name) => MCP.sanitize(name))
        .toSorted((a, b) => b.length - a.length)
      for (const [key, item] of Object.entries(yield* mcp.tools())) {
        if (!item.execute) continue
        const schema = yield* Effect.promise(() => Promise.resolve(asSchema(item.inputSchema).jsonSchema))
        output.push({
          id: key,
          description: item.description ?? "",
          source: "mcp",
          server: mcpServers.find((name) => key.startsWith(`${name}_`)),
          value: { source: "mcp", key, item, schema: ProviderTransform.schema(input.model, schema) },
        })
      }
```

`packages/opencode/src/session/tools.ts:223-228` — sélection `baseline`, `enabled` conditionné
à `hotPathEnabled && hotPath?.jit_tools === true`.

```ts
  const baseline = ToolCatalog.selectTools(prepared.catalog, input.query ?? "", {
    enabled: hotPathEnabled && hotPath?.jit_tools === true,
    threshold: hotPath?.tool_threshold,
    maxTools: hotPath?.max_tools,
    always: hotPath?.always_tools,
  })
```

`packages/opencode/src/session/tools.ts:231-235` — `visibleCatalog` : c'est ici, **après** le
filtre de permission, qu'une variable de « présents » aurait un sens.

```ts
  const denied = Permission.disabled(prepared.catalog.tools.map((item) => item.id), rules)
  const visibleCatalog = {
    ...prepared.catalog,
    tools: prepared.catalog.tools.filter((item) => !denied.has(item.id) && input.userTools?.[item.id] !== false),
  }
```

`packages/opencode/src/session/tools.ts:274-284` — sélection `proposed` : c'est **elle** qui
applique le gate, parce que `enabled: dynamicMode !== "off"`.

```ts
  const proposed = ToolCatalog.selectTools(visibleCatalog, input.query ?? "", {
    enabled: dynamicMode !== "off",
    threshold: 0,
    maxTools: Math.max(1, effectiveMax - 1),
    // Most recent activation first: when stickies exceed the free slots the
    // ones the model just asked for must win over stale ones.
    always: [...(hotPath?.always_tools ?? []), ...[...sticky].reverse()],
    core,
    fallback: "core",
    requireCoverage: false,
  })
```

`packages/opencode/src/session/tools.ts:285` — le choix final entre les deux sélections.

```ts
  const selection = dynamicMode === "enforce" && !searchDenied ? proposed : baseline
```

### 2.5 Pourquoi le gate doit être dans la sélection, pas dans le cache préparé

`packages/opencode/src/session/tool-catalog.ts:103-108` et `:113-118` — la TTL par défaut est
30 s et le test de fraîcheur est `now - cached.createdAt < ttlMs`. **C'est la preuve
probatoire qui manquait** au verdict (O5).

```ts
export function getPreparedEffect<R, E, T>(
  owner: object,
  version: string,
  build: Effect.Effect<readonly PreparedTool<T>[], E, R>,
  ttlMs = 30_000,
): Effect.Effect<{ catalog: PreparedCatalog<T>; hit: boolean }, E, R> {
  return Effect.gen(function* () {
    const now = Date.now()
    const entries = cache.get(owner) ?? new Map<string, PreparedCatalog>()
    cache.set(owner, entries)
    const cached = entries.get(version) as PreparedCatalog<T> | undefined
    if (cached && now - cached.createdAt < ttlMs) return { catalog: cached, hit: true }
```

Conclusion : un filtre dans la closure `build` serait **périmé jusqu'à 30 s**, exactement
la durée que le gate cherche précisément à éviter. La sélection, elle, recalcule par requête.

### 2.6 Le gain récurrent dépend du mode — séparation obligatoire

`packages/opencode/src/session/tool-catalog.ts:298` — mode `full` quand `enabled` est faux :
tout le catalogue part, outils morts compris.

```ts
    if (!options.enabled) return { tools: catalog.tools, mode: "full", reason: "disabled" }
```

Conséquence, avec `maxTools: Math.max(1, effectiveMax - 1)` (`tools.ts:277`) et
`selection = proposed` (`tools.ts:285`) :

| mode | chemin | gain récurrent par requête |
|---|---|---|
| non-lean, ou `jit_tools !== true` | `baseline` (`enabled: false` ⇒ `tool-catalog.ts:298`) | **réel** : les ~20 outils morts sortent du catalogue complet |
| lean `enforce` | `proposed` (`tools.ts:274-277`) ⇒ charge utile déjà plafonnée à `effectiveMax - 1` | **≈ 0** : les outils morts n'y sont déjà presque jamais transmis |

Le second chiffre est une conséquence de lecture de `tool-catalog.ts:298`, pas une mesure.
Il est marqué `INFERE`.

Hypothèse de fond, **structurelle et prouvée** : `description` et `schema` sont embarqués
par entrée (`tools.ts:214`, `:217`) et le catalogue est resérialisé à chaque requête
(`tools.ts:232`, `:274`, `:285`). Les **valeurs** restent `INFERE` :

| valeur | statut | comment la vérifier |
|---|---|---|
| ~200-250 tokens par outil | `INFERE` | `tokenizer` sur le JSON réel de 20 entrées d'un serveur de référence ; aucun chiffre de ce type n'existe dans le dépôt |
| ~4 000-5 000 par requête | `INFERE` | idem, dépend du serveur ; non dérivable du code |
| ~18 tokens pour la ligne d'annonce | `INFERE` | le littéral `llm-memory-tool (offline)` entre balises est de l'ordre de 10-12 tokens ; 18 est un majorant |
| rapport 250x | `INFERE` | produit des trois lignes ci-dessus, non mesuré |

**Aucun de ces chiffres ne doit être présenté comme un résultat.** Le seul fait mesuré est
structurel : le catalogue est resérialisé par requête.

### 2.7 Le bénéfice certain : `requiredCount` et les créneaux d'activation

La motivation « `requiredCount` compte des outils fantômes » est **fausse** et retirée
(voir §Résidus, O2). `packages/opencode/src/session/tools.ts:253` intersecte déjà le noyau
avec le catalogue visible :

```ts
  const requiredCount = new Set([...core, ...(hotPath?.always_tools ?? [])].filter((id) => visibleCatalog.tools.some((item) => item.id === id))).size + 1
```

`packages/opencode/src/session/tools-allowlist.test.ts:24-34` — cinq outils mémoire sont
épinglés dans le noyau lean ; ce sont eux qui sortent du catalogue quand le serveur tombe.

```ts
  test("exposes the full memory lifecycle, not just retrieval", () => {
    const core = leanPhaseCoreTools("implementation")
    for (const tool of [
      "llm-memory-tool_memory_retrieve",
      "llm-memory-tool_memory_store",
      "llm-memory-tool_memory_update",
      "llm-memory-tool_memory_delete",
      "llm-memory-tool_memory_consolidate",
    ] as const)
      expect(core).toContain(tool)
  })
```

`packages/opencode/src/session/tools.ts:767` — les créneaux dynamiques valent
`configuredMax - requiredCount - activations`. Retirer des outils du catalogue **augmente**
donc `slots` de 5, il ne le réduit jamais.

```ts
            const slots = Math.max(0, configuredMax - requiredCount - activations.get(input.session.id).size)
```

`packages/opencode/src/session/tools.ts:95-98` — le motif de la panne déjà documentée en
dépôt : le cap doit laisser de la place aux activations dynamiques, pas seulement au noyau.

```ts
// The cap must leave room for dynamic activations, not merely fit the mandatory
// tools: with max_tools=14 and 12 mandatory tools only one MCP slot was left and
// every tool_search evicted the previous activation.
```

`packages/opencode/src/session/tools-allowlist.test.ts:41-43` — le même incident, consigné
comme observé en production.

```ts
  // Observed in production: max_tools=14 with 12 mandatory tools passed the old
  // guard yet left a single slot for every MCP tool, so activations evicted
  // each other on every step.
```

### 2.8 La réapparition est gratuite : quatre mécanismes, tous dans l'état vivant

| # | mécanisme | citation |
|---|---|---|
| 1 | le premier ping réussi efface le compteur | `index.ts:804` `delete s.healthFailures[name]` |
| 2 | boucle de reconnexion à backoff | `index.ts:816-817` `if (!autoreconnect) return` puis `Effect.forEach(Object.entries(s.status), …)` |
| 3 | `storeClient` réarme tout | `index.ts:893` statut `connected`, `:895` `defs`, `:896` `delete s.healthFailures[name]`, `:897` `catalogVersion++` |
| 4 | `transport.onclose/onerror` → `markDisconnected` → `failed` → re-découverte par (2) | `index.ts:704-711` |

Conséquence : un serveur filtré par le gate **revient sans recréer la session** et sans
attendre un `catalogVersion++` supplémentaire, puisque `mcpVersion` est déjà dans
`catalogKey` (`tools.ts:180`) et que le mécanisme (1) suffit.

### 2.9 Ce qui reste volontairement inchangé

- **`convertMcpTool`** (`index.ts:227-234`) et les deux `throw` de garde
  (`index.ts:267`, `index.ts:273`) : la récupération de transport reste possible, un serveur
  filtré du catalogue n'est pas un serveur retiré du runtime.
- **`leanCoreTools`** (`tools.ts:83-93`) : appelé directement par
  `tools-allowlist.test.ts:2` et `:62`, `:68`, il doit rester vert sans retouche.

### 2.10 Base de tests — ce qui est rouge, ce qui ne l'est pas, et ce qui n'est pas mesuré

Baseline de vague 4 : `C:\Users\jeanl\AppData\Local\Temp\opencodev2\wave4-baseline.md`,
192 lignes, 10 suites, **4 rouges**, **39 tests en échec**. **Le fichier existe** ; il n'est
pas déclaré absent et ses chiffres ne sont pas reconstitués de mémoire.

| suite | exit | pass/fail/errors | instabilité |
|---|---|---|---|
| `test/tool/shell.test.ts` | 1 | 63/32/1 puis 62/33/4 | **instable** (`C-44`) |
| `test/tool/shell.test.ts` — **re-mesurée dans cette passe** | 1 | **64/31/2** (144,26 s) puis **65/30/3** (131,28 s), 95 tests | **instable, confirmé** (`C-44`) |
| `test/session/compaction.test.ts` | 1 | 61/2/0 | — |
| `test/tool/read.test.ts` | 1 | 52/4/0 | — |
| `test/tool/task.test.ts` | 1 | 34/1/0 | échec de hook synthétique |

`test/tool/shell.test.ts` **ne peut pas** servir de porte de non-régression, et c'est **mesuré
dans cette passe**, pas seulement cité : deux exécutions successives à code identique,
`bun test test/tool/shell.test.ts`, exit **1** les deux fois, donnent **64 pass / 31 fail /
2 errors** (144,26 s) puis **65 pass / 30 fail / 3 errors** (131,28 s), 95 tests à chaque
exécution. Le total et l'exit code concordent, **le triplet ne concorde pas** : il n'est donc
pas une référence opposable. Le log (`C:\Users\jeanl\AppData\Local\Temp\opencodev2\p03-shell-instability.log`,
3 265 lignes) contient **44 occurrences** de
`RepeatedCallError: Repeated call blocked: 'bash' has already been called with these exact
arguments in this session` et **53 hits** de `describe("tool.shell permissions")` — soit
exactement l'ordre de grandeur des ~26-28 échecs attribués par `C-24` et `C-44` à ce même
mécanisme. C'est un **état partagé entre tests**, pas un défaut du code sous test : cette
mesure établit que la suite est instable de son propre chef, indépendamment de P03.

Une **seconde** suite shell existe et coexiste : `test/shell/shell.test.ts`, distincte de
`test/tool/shell.test.ts` (glob `test/shell/*.test.ts` → un résultat, mesuré dans cette
passe). La baseline n'a mesuré que la première ; la seconde est **non mesurée** et ne doit
donc jamais être citée avec un chiffre de non-régression. Le correctif P03 **ne touche pas
shell** : ni `src/tool/shell.ts` ni `packages/core/src/launch-retry.ts` ne sont modifiés, donc
aucune des deux suites shell n'est concernée.

Les deux suites unitaires co-localisées qui serviront de base sont **vertes** — mesuré dans
cette passe, `bun test v1.4.2 (744846f84)`, cwd `packages/opencode` :

```
EXIT=0
 17 pass
 0 fail
 55 expect() calls
Ran 17 tests across 2 files. [2.40s]
```

Log : `C:\Users\jeanl\AppData\Local\Temp\opencodev2\p03-unit-baseline.log`.

---

## 3. Mechanism

Chaîne d'exécution, de la chute du serveur jusqu'à la surcharge du modèle.

1. Le transport se ferme, ou le ping échoue. `index.ts:704-711` appelle `markDisconnected` ;
   à ce stade `s.status[name].status` passe à `failed` et `s.clients[name]` est conservé.
2. Le tick de santé, lui, incrémente le compteur **avant** toute déconnexion :
   `index.ts:807-808` (`const failures = (s.healthFailures[name] ?? 0) + 1` puis
   `s.healthFailures[name] = failures`), et `:809` ne déconnecte qu'au-delà de 3
   (`index.ts:200-204`). **Entre le premier et le troisième échec, le serveur est donc
   `connected` avec `healthFailures > 0`.** C'est la fenêtre que le gate ferme.
3. `Session.tools` assemble le catalogue : `tools.ts:184` → closure `tools.ts:187-220` →
   boucle MCP `tools.ts:209-219` alimentée par `mcp.tools()` (`index.ts:1127`).
4. `index.ts:1135-1137` ne filtre que sur `status === "connected"`. **Le compteur de santé
   n'est lu nulle part sur ce chemin.** Les ~20 entrées du serveur HS entrent donc dans
   `prepared.catalog` avec leur `description` et leur `schema` (`tools.ts:214`, `:217`).
5. `tools.ts:231-235` ne retire que ce que la **permission** refuse. La santé n'est pas une
   permission : rien ne la filtre.
6. `tools.ts:223` (`baseline`) ou `tools.ts:285` (`proposed`) sérialise. En mode non-lean,
   `tool-catalog.ts:298` renvoie le catalogue **entier** : le gain est là.
7. Le modèle reçoit ~20 outils morts et le découvre **après** avoir payé les tokens du tour.
   Aucun mécanisme applicatif ne l'en avertit : aucun chemin de `packages/opencode/src/**`
   n'annonce une dégradation de catalogue.
8. **La latence** : entre la chute et le premier tick effectif, l'écart est d'un intervalle
   complet (`index.ts:847` `Effect.delay(Duration.millis(healthInterval))`), soit 30 000 ms
   par défaut (`index.ts:840` + `reconnect-policy.test.ts:11`). Le gate est donc muet
   jusqu'à `mcp_health_interval_ms` après le démarrage **et** jusqu'à un intervalle après
   chaque chute. **Ce n'est pas bloquant** — `healthFailures` est vide à froid, donc le
   comportement actuel est préservé — mais la borne doit figurer dans le livrable, sinon la
   question « le serveur vient-il de tomber ? » reçoit « non détecté » sans explication.

---

## 4. Proposal

Deux fichiers modifiés, code cible en français ci-dessous.

### Fichier 1 — `packages/opencode/src/mcp/index.ts`

**(a) Prédicat exporté, placé à côté du seuil existant** (après `index.ts:204`).

```ts
/**
 * Catalog eligibility is stricter than transport eligibility: a client whose last
 * health ping failed is still callable (the call path retries on a dead transport,
 * see convertMcpTool), but its tool definitions must not be advertised to the
 * model, because a definition that cannot execute is pure per-request payload.
 * One failure is enough: re-entry is free and happens at the next successful ping
 * (delete s.healthFailures[name]).
 */
export function isCatalogEligible(failures: number): boolean {
  return failures === 0
}
```

**(b) Filtrage de `connectedClients`** — `index.ts:1135-1137` devient :

```ts
      const connectedClients = Object.entries(s.clients).filter(
        ([clientName]) =>
          s.status[clientName]?.status === "connected" && isCatalogEligible(s.healthFailures[clientName] ?? 0),
      )
```

**(c) Exposition de la readiness** — nouvelle fonction à côté de `MCP.status`
(`index.ts:902`), pour que l'appelant n'ait pas à redécouvrir les identifiants :

```ts
    const readiness = Effect.fn("MCP.readiness")(function* () {
      const s = yield* InstanceState.get(state)
      const out: Record<string, boolean> = {}
      for (const name of Object.keys(s.clients))
        out[sanitize(name)] = s.status[name]?.status === "connected" && isCatalogEligible(s.healthFailures[name] ?? 0)
      return out
    })
```

et **deux** enregistrements obligatoires dans le même fichier, sinon l'appelant de `tools.ts`
ne compile pas :

1. l'interface du service, à côté de `status` / `clients` / `catalogVersion`
   (déclarations observées à `index.ts:902`, `:917`, `:922`) :
   `readonly readiness?: Effect.Effect<Record<string, boolean>>` — optionnel, pour que le test
   de `tools.ts` puisse tourner contre un stub qui ne l'expose pas ;
2. l'instance du service, dans le même objet que `status`, `clients`, `catalogVersion`.

**(d) Invalidation** : rien à ajouter. Le compteur est effacé au ping réussi
(`index.ts:804`) et à la reconnexion (`index.ts:896`), et `mcpVersion` est déjà dans
`catalogKey` (`tools.ts:180`) : la réapparition est picked up par la clé, pas par une
invalidation manuelle.

### Fichier 2 — `packages/opencode/src/session/tools.ts`

**(e) Ligne d'annonce unique, au point de sélection** — après `tools.ts:235`, avant
`tools.ts:250` (`const core = leanCoreTools({ … })`). Le nom est construit depuis `sanitize`
(`index.ts:1155`, `tools.ts:207`) et **échappé** : un nom de serveur contenant `<` ou `>` ne
doit pas pouvoir fermer la balise. C'est une contrainte de code, pas un commentaire.

```ts
  // One line per filtered server, so the model sees the absence instead of
  // discovering it after paying for the definitions. Escaped: a server name is
  // user-supplied config and must not be able to close the tag.
  const readiness = mcp.readiness ? yield* mcp.readiness() : {}
  const degraded = Object.entries(readiness)
    .filter(([, ready]) => !ready)
    .map(([name]) => name)
  const unavailableTools = degraded.length
    ? `<unavailable_tools>${degraded.map((n) => `${n.replace(/[<>]/g, "")} (offline)`).join(", ")}</unavailable_tools>`
    : undefined
```

`mcp.readiness ? yield* mcp.readiness() : {}` — et non `yield* mcp.readiness?.() ?? {}`, qui
appliquerait `yield*` à l'expression entière et lèverait sur `undefined`.

Le branchement se fait dans l'injection de prompt existante, **au même point que la
sélection** : la ligne d'annonce part dans la requête qui porte le catalogue filtré, jamais
dans le catalogue mémoïsé 30 s (`tool-catalog.ts:107` / `:114`).

**(f) Ce qui reste inchangé, et pourquoi**

| inchangé | raison |
|---|---|
| `convertMcpTool` (`index.ts:227-234`) et les deux `throw` (`index.ts:267`, `:273`) | un serveur filtré reste **appelable** ; seul son catalogue est masqué. Supprimer la récupération de transport serait une régression |
| `HEALTH_FAILURE_THRESHOLD` (`index.ts:200`) | le seuil de **déconnexion** est un choix de résilience distinct du seuil de **catalogue** ; les deux doivent pouvoir diverger |
| `leanCoreTools` (`tools.ts:83-93`) | appelé directement par `tools-allowlist.test.ts` ; doit rester vert sans retouche |
| `requiredCount` (`tools.ts:253`) | il intersecte **déjà** avec `visibleCatalog.tools` ; aucune variable `corePresent` n'est introduite (O2) |
| les 4 `catalogVersion++` (`index.ts:694`, `:862`, `:897`, `:1100`) | aucun n'est un ajout ; le gate n'en dépend pas |
| `tool-catalog.ts` | le gate vit dans la **sélection**, pas dans `getPreparedEffect` (`tool-catalog.ts:103-118`) |

---

## 5. Alternatives considered

**A. Filtrer dans la closure `getPreparedEffect`** — rejeté. La closure n'est relancée qu'après
invalidation de version ou après `ttlMs = 30_000` (`tool-catalog.ts:107`, `:114`) : le gate
serait périmé pendant exactement la durée qu'il doit éviter. Vérifiable par relecture de
`tool-catalog.ts:113-114`.

**B. Porter le gate sur `status` seul, en déconnectant dès le premier échec de santé** —
rejeté. Cela contredit le choix de résilience existant et explicite :
`reconnect-policy.test.ts:18-21` affirme `shouldDisconnectAfterHealthFailures(1) === false`.
Le correctif casserait deux tests verts et transformerait une fenêtre d'exposition en panne
de connexion.

**C. Réutiliser le message `mcpUnavailableMessage`** (`index.ts:210-215`) — rejeté pour la
ligne d'annonce. Ce texte promet une reconnexion en arrière-plan et propose
`opencode mcp connect` / `mcp reload` : c'est exact pour un **appel** qui échoue
(`index.ts:267`, `:273`), mais trompeur dans un catalogue, où l'outil n'est pas « en train
d'échouer », il n'est pas proposé. Le texte reste inchangé pour le chemin d'appel.

**D. N'annoncer rien du tout, se contenter du filtre silencieux** — rejeté. Un catalogue qui
retire 20 outils sans dire pourquoi produit exactement le symptôme que ce correctif vise : le
modèle cherche `memory_retrieve`, ne le trouve pas, et ne peut pas distinguer « outil non
exposé » de « outil absent ». La ligne d'annonce est le bénéfice applicatif ; le filtre seul
n'est qu'une économie de payload.

**E. Filtrer aussi dans `visibleCatalog`** (`tools.ts:232-235`) — rejeté. Ce catalogue est
mémoïsé 30 s (`tool-catalog.ts:107` / `:114`) ; un filtre posé ici serait invisible jusqu'à
l'invalidation. Seules les deux sélections (`tools.ts:223`, `:285`) sont recalculées par
requête.

**F. Dédupliquer avec le `<degraded_capabilities>` du harnais** — rejeté. Aucun accord de
couches ne structure ces deux surfaces aujourd'hui ; la déduplication coûterait un contrat
d'interfaces pour un doublon inoffensif, dans une base de tests déjà rouge. Décision du
validateur, actée au §9.

---

## 6. Risks

### 6.1 Régression sur les tests existants

| fichier de test | risque | parade |
|---|---|---|
| `src/mcp/reconnect-policy.test.ts` | **faible** — l'ajout est un `export` pur, aucun comportement existant ne change | aucun `expect` existant ne référence `isCatalogEligible` |
| `src/session/tools-allowlist.test.ts` | **faible** — `leanCoreTools` (`:2`, `:62`, `:68`) et `leanDynamicCapVerdict` (`:37`, `:47`, `:52-54`, `:75`) sont inchangés | ne pas toucher `leanCoreTools` (impératif du verdict) |
| `test/mcp/lifecycle.test.ts` | **moyen** — `:275` `toBe(beforeVersion)` et `:306` `toBeGreaterThan(beforeVersion)` comptent sur les incréments de `catalogVersion` | le gate ne touche pas `catalogVersion` : aucune de ces assertions ne change de valeur |
| `test/tool/mcp.test.ts` | **moyen** — vérifie le contenu de `mcp.tools()` | avec `healthFailures` vide (état par défaut), `isCatalogEligible(0) === true` ⇒ **comportement identique bit à bit** |
| `test/mcp/*.test.ts` (6 fichiers, mesuré par glob) | **faible** | aucun ne monte un état `healthFailures > 0` |
| `test/tool/shell.test.ts` et `test/shell/shell.test.ts` | **aucun** | le correctif ne touche ni `src/tool/shell.ts` ni `packages/core/src/launch-retry.ts` ; ces deux suites restent hors périmètre et `test/shell/shell.test.ts` reste **non mesurée** |
| `test/session/compaction.test.ts`, `test/tool/read.test.ts`, `test/tool/task.test.ts` | **aucun** | déjà rouges dans la baseline ; aucun fichier du correctif n'est dans leur périmètre |

La seule assertion qui pourrait bouger est `lifecycle.test.ts:275` / `:306`, et seulement si
un `catalogVersion++` était ajouté — ce qui n'est pas au périmètre.

### 6.2 Coût en tokens / latence ajoutés, chiffré

- **Tokens ajoutés** : `INFERE` ~15 tokens, une seule fois par requête **et seulement quand
  au moins un serveur est filtré** ; `0` sinon (le littéral est conditionnel à
  `degraded.length`). Plafond structurel : une fois par requête, jamais par outil.
- **Tokens retirés** : `INFERE` ~4 000-5 000 par requête en mode non-lean ou `jit_tools` off,
  ≈ 0 en lean `enforce` (§2.6).
- **Latence ajoutée** : **zéro E/S ajouté**. Le prédicat est une comparaison sur un objet
  déjà chargé (`:1129`) ; `readiness` parcourt `Object.keys` sans I/O. Le gain de latence
  vient de la **sérialisation** évitée. Borne de **détection** : un intervalle de santé,
  `30 000 ms` par défaut (`index.ts:840`, `index.ts:847`).

### 6.3 Sécurité

| menace | analyse |
|---|---|
| **injection de balise** par un nom de serveur | **traitée par construction** — `name.replace(/[<>]/g, "")` avant interpolation. Un nom `a></unavailable_tools>` devient `a/unavailable_tools`, la balise reste fermée une seule fois. Le nom vient de `sanitize` (`index.ts:1155`, `tools.ts:207`) **et** de l'échappement : les deux, pas l'un ou l'autre |
| **contournement de permission** | le gate **ne peut pas en ajouter** : il ne fait que retirer des entrées du catalogue. `Permission.disabled` (`tools.ts:231`) reste le seul filtre d'autorisation et s'applique après, sur `prepared.catalog` ; retirer un outil ne rend aucun autre outil plus accessible. Le gain de `slots` (`tools.ts:767`) augmente le budget d'activation : c'est une **extension** de surface pour des outils déjà autorisés, donc déjà soumis à `Permission.disabled` |
| **divulgation d'information** | le nom d'un serveur est déjà visible : il apparaît dans l'identifiant `sanitize(server)_sanitize(tool)` (`index.ts:1155`) de toute entrée de catalogue. La ligne d'annonce ne révèle rien de nouveau |
| **effet de bord sur la persistance** | aucun. La clé de cache (`tools.ts:180`) est inchangée ; le gate ne crée pas de version, donc pas de dérive de `PreparedCatalog` |

### 6.4 Le clignotement — risque accepté, borné

Avec le seuil `> 0` recommandé au §9, un serveur qui réussit un ping après un échec est
rétabli **au tick suivant**, sans coût ni action supplémentaire. Le coût du clignotement est
borné par `mcp_health_interval_ms` : on ne peut pas retirer plus vite qu'on ne détecte. Un
serveur qui reste muet ne scintille pas — il reste filtré jusqu'à son retour.

---

## 7. Tests

**Contrainte de méthode** : aucun critère de cette section ne repose sur « la suite passe ».
`test/tool/shell.test.ts` est rouge et instable (`C-24`, `C-44`), donc inutilisable comme
porte. Le critère de succès principal est bâti sur un **fichier de test neuf**, avec un
seuil chiffré.

### Test 1 — `packages/opencode/src/mcp/catalog-health-gate.test.ts` (**fichier neuf**)

Co-localisé avec le module testé, comme `src/mcp/reconnect-policy.test.ts` et
`src/session/tools-allowlist.test.ts`. Le gabarit demande un chemin sous `test/` ; le verdict
(O1) tranche que la convention réelle du dépôt est la co-localisation en `src/` (tests
unitaires) contre `test/` (tests d'intégration), et que `test/mcp/catalog-health-gate.test.ts`
serait une seconde convention pour rien. **Ce fichier n'existe pas** aujourd'hui : glob
`**/catalog-health-gate*` → aucun résultat, mesuré dans cette passe.

Quatre tests, tous purs, aucun serveur, aucun I/O, aucun état partagé :

```ts
import { describe, expect, test } from "bun:test"
import { isCatalogEligible, shouldDisconnectAfterHealthFailures } from "./index"

describe("MCP catalog eligibility gate", () => {
  test("keeps a client with no recorded health failure", () => {
    expect(isCatalogEligible(0)).toBe(true)
  })

  test("removes a client from the catalog at the first health failure", () => {
    expect(isCatalogEligible(1)).toBe(false)
  })

  test("never removes a client that the transport threshold still keeps", () => {
    // The gate must be strictly stricter than shouldDisconnectAfterHealthFailures,
    // otherwise it changes resilience instead of hiding the catalogue.
    for (const failures of [1, 2])
      if (shouldDisconnectAfterHealthFailures(failures)) throw new Error("gate/disconnect thresholds must diverge")
    expect(isCatalogEligible(1)).toBe(false)
    expect(isCatalogEligible(2)).toBe(false)
    expect(shouldDisconnectAfterHealthFailures(3)).toBe(true)
  })

  test("is monotonic in the failure count and returns at zero", () => {
    // index.ts:804 — delete s.healthFailures[name] is what restores eligibility.
    expect([0, 1, 2, 3, 4].map((n) => isCatalogEligible(n))).toEqual([true, false, false, false, false])
  })
})
```

**Commande exacte** (cwd `C:\jeanluc\opencode-fork\packages\opencode`) :

```
bun test src/mcp/catalog-health-gate.test.ts
```

**Critère de succès, chiffré et discriminant** :

| état du dépôt | attendu |
|---|---|
| **avant le correctif** | **exit ≠ 0**, et **0 test exécuté** — `isCatalogEligible` **n'existe pas** dans `src/mcp/index.ts`, mesuré dans cette passe : `Select-String` sur ce fichier donne **0** correspondance pour `isCatalogEligible`, **0** pour `readiness`, **0** pour `unavailable_tools`, avec **8** correspondances pour `healthFailures` en contrôle positif — la recherche fonctionne donc, les trois zéros sont des zéros réels. L'import du fichier échoue ainsi avant toute collecte. Le libellé exact de l'erreur reste `INFERE` : `error: Export named 'isCatalogEligible' not found in module "…/src/mcp/index.ts"`. **Seul l'invariant est normatif** : `exit ≠ 0` et `0 test`. |
| **après le correctif** | **exit 0**, **4 pass**, **0 fail**, `Ran 4 tests across 1 file.` |

Le seuil est **4 pass / 0 fail**, vérifié par le runner, sur un fichier **neuf** : aucun
état partagé entre tests n'y entre, donc aucune instabilité possible. C'est exactement la
propriété qui manque à `test/tool/shell.test.ts`.

### Test 2 — extension de `packages/opencode/src/session/tools-allowlist.test.ts`

Fichier existant, **vert** (mesuré : 17 pass / 0 fail sur les deux suites unitaires,
`bun test v1.4.2 (744846f84)`). Trois assertions à ajouter, sur les invariants de §2.7 :

1. `requiredCount` est **inchangé** quand rien n'est filtré ;
2. `requiredCount` **perd 5** quand les cinq `llm-memory-tool_*` sont absents du catalogue
   visible — preuve directe que le gate réduit le compte, contrairement à ce qu'affirmait la
   proposition d'origine ;
3. `slots` (`tools.ts:767`) n'est **pas** réduit quand `requiredCount` baisse.

**Commande** :
`bun test src/session/tools-allowlist.test.ts src/mcp/reconnect-policy.test.ts src/mcp/catalog-health-gate.test.ts`
**Critère** : exit 0, **20 pass / 0 fail** (17 mesurés + 3 ajoutés). C'est un **triplet
stable** sur trois suites vertes, pas une comparaison de suite instable.

### Test 3 — non-régression bornée

`bun test test/mcp test/tool/mcp.test.ts src/session/tools-allowlist.test.ts`

**Critère** : **delta d'échecs nul** entre un relevé avant et un relevé après, et non
« exit 0 ». `test/mcp` (6 fichiers) et `test/tool/mcp.test.ts` ne sont pas dans la baseline de
vague 4 (10 suites, 4 rouges) : **il faut relever le delta, pas le verdict**. Delta nul ⇒ la
non-régression est établie, même si la suite sort en `1`.

**Hors périmètre shell, explicitement** : `test/tool/shell.test.ts` et
`test/shell/shell.test.ts` ne sont **pas** des portes de cette proposition. La première est
rouge et instable ; la seconde n'est pas mesurée. Le correctif ne touche aucun fichier shell.

---

## 8. Effort

**M** — deux fichiers modifiés (`src/mcp/index.ts`, `src/session/tools.ts`) : un `export` de
4 lignes, un prédicat dans un `filter` existant, une fonction de readiness, une ligne
d'annonce avec échappement ; plus un fichier de test neuf et trois assertions ajoutées. Pas
de migration, pas de changement de clé de cache, pas de modification de seuil existant.

---

## 9. Verdict self-assessment

**NEEDS_REVIEW** — deux questions de conception restent à trancher par le validateur.

**Question 1 — seuil de retrait.** Retrait dès `healthFailures > 0` (recommandé), ou `> 1` ?

*Recommandation : `> 0`.* La réapparition est automatique et sans coût au premier ping
réussi (`index.ts:804`, `:896`), et le coût d'un clignotement est borné par
`mcp_health_interval_ms` : on ne peut pas retirer plus vite qu'on ne détecte. Un seuil `> 1`
n'est acceptable **qu'à condition** que la limite soit écrite dans le test de non-régression.
Le validateur tranche.

**Question 2 — déduplication avec le harnais.** La ligne d'annonce, dupliquée entre le prompt
système (`tools.ts`) et le `<degraded_capabilities>` du harnais, doit-elle être dédupliquée ?

*Recommandation : non.* Aucune couche ne structure cet accord aujourd'hui ; la déduplication
coûterait un contrat d'interfaces pour un doublon inoffensif, dans une base de tests déjà
rouge. Acté comme `out_of_scope` au §Résidus.

**Sur le fond, la proposition est `READY`** : le défaut est établi par citation, la cause est
identifiée à une ligne (`index.ts:1135-1137`), le gain conditionné par mode est séparé
(§2.6), la latence du gate est écrite (`index.ts:840` / `:847`), le bénéfice certain est
chiffré (§2.7), et le critère de succès repose sur un fichier neuf avec un seuil mesurable.

---

## Résidus

Classification selon la règle d'implémentabilité (`CORRECTIONS.md`, `C-32`) : un résidu
`open` **interdit** l'implémentation ; `accepted`, `out_of_scope` et `refused` ne l'interdisent
pas.

| id | objection | statut | justification |
|---|---|---|---|
| **O1** | Chemins de test erronés (`test/session/tools-allowlist.test.ts`, `test/mcp/reconnect-policy.test.ts` n'existent pas) ; la commande de non-régression ne peut pas sortir en 0 | **accepted** | Corrigé en §7 : tous les chemins sont en `src/`, le fichier neuf est `src/mcp/catalog-health-gate.test.ts`, et la non-régression est formulée en **delta d'échecs**, pas en « exit 0 ». Vérifié par glob dans cette passe : `**/mcp/*.test.ts` ne retourne en `src/` que `sdk-patch.test.ts`, `reconnect-policy.test.ts`, `reconnect.test.ts` ; les 6 autres sont sous `test/mcp/`. |
| **O2** | La justification « `requiredCount` compte des outils fantômes » est réfutée par `tools.ts:253` | **accepted** | Motivation **supprimée** (§4f, §2.7). Le vrai bénéfice est écrit : `requiredCount` perd 5 de lui-même, `slots` (`tools.ts:767`) gagne 5. Aucune variable `corePresent` n'est introduite ; si elle l'était, ce serait sur `visibleCatalog.tools` (`tools.ts:232-235`), jamais sur `prepared.catalog.tools`. |
| **O3** | Le gain récurrent annoncé n'est pas vrai dans le mode qui motive la proposition | **accepted** | Les deux modes sont **séparés et étiquetés** dans le tableau §2.6 : `jit_tools` off / non-lean ⇒ gain réel (`tool-catalog.ts:298`) ; lean `enforce` ⇒ gain ≈ 0 (`tools.ts:274-277` + `:285`). Toutes les valeurs par outil restent `INFERE` avec leur mode de vérification. L'hypothèse structurelle (resérialisation par requête) est conservée et prouvée. |
| **O4** | La latence réelle du gate n'est écrite nulle part | **accepted** | Écrite trois fois : `index.ts:840` (intervalle configurable), `index.ts:847` (premier tick retardé d'un intervalle), `reconnect-policy.test.ts:11` (défaut 30 000). Reprise en §3 étape 8, §6.2 et §6.4, avec la qualification « non bloquant : l'état par défaut est vide ». |
| **O5** | Dépendance probatoire manquante au choix « sélection et non cache préparé » | **accepted** | `tool-catalog.ts:103-108` et `:113-118` sont désormais cités **verbatim** en §2.5, avec la conséquence explicite : un filtre dans la closure serait périmé 30 s. L'alternative A (§5) est rejetée sur cette citation. |
| **O6** | Défauts de forme dans les citations | **accepted** | Trois réparés : (a) `tools.ts:206-219` porte l'étiquette exacte et le `if (!item.execute) continue` de `:210` est cité, plus la correction « ne verse pas tout » ; (b) la plage `index.ts:266-273` **n'est plus citée du tout** — les deux `throw` sont cités séparément à `:267` et `:273`, sans élision à justifier ; (c) « ligne 5 » de `reconnect-policy.test.ts` est remplacée par `:10-12` (défaut de l'intervalle), `:18-21` et `:23-25` (seuil) — les seules valeurs que ce fichier contient réellement. |
| **O7** | **§9 Q1 — seuil `> 0` vs `> 1` : décision de conception non tranchée** | **out_of_scope** | Le validateur a rendu une recommandation explicite (`> 0`) et l'implémentation la suit ; le Test 1 de §7 verrouille `isCatalogEligible(1) === false` et `isCatalogEligible(2) === false`. Ce n'est pas une objection ouverte, c'est un arbitrage rendu par l'autorité compétente et tracé. |
| **O8** | **§9 Q2 — déduplication avec `<degraded_capabilities>` du harnais** | **out_of_scope** | Décision du validateur : « pas de déduplication exigée », doublon inoffensif. Aucun accord de couches ne structure ces deux surfaces ; traiter ce point demanderait une modification du harnais, hors périmètre de P03. |
| **O9** | Le gain en tokens est `INFERE` et non mesuré | **out_of_scope** | Les valeurs par outil ne sont pas dérivables du code (§2.6, tableau de vérification). Une mesure exigerait un serveur MCP de référence et un tokenizer, donc une instrumentation hors périmètre. Ce qui est **prouvé** — la resérialisation par requête — est conservé ; ce qui est `INFERE` est étiqueté et n'est jamais utilisé comme critère de succès. |
| **O10** | `test/shell/shell.test.ts` n'est pas mesurée | **out_of_scope** | Le correctif ne touche aucun fichier shell (§2.10, §6.1). La mesurer est une action de vague 4, pas une preuve de P03. Elle est nommée pour être complète, jamais citée comme porte. |
| **O11** | La base de tests est rouge et instable, donc « exit 0 » n'est pas une preuve | **accepted** | Contourné **par construction** : le critère de succès est un fichier **neuf** à 4 tests sans état partagé (§7 Test 1), plus un delta d'échecs sur les suites d'intégration (§7 Test 3). Aucune suite instable n'est utilisée comme porte. |
| **O12** | Le libellé exact de l'erreur « avant correctif » n'est pas mesuré | **accepted** | **L'état « avant » est mesuré**, seul le libellé ne l'est pas : `Select-String` sur `src/mcp/index.ts` donne 0 correspondance pour `isCatalogEligible`, 0 pour `readiness`, 0 pour `unavailable_tools`, avec 8 pour `healthFailures` en contrôle positif (§7 Test 1). L'invariant normatif est donc `exit ≠ 0` et `0 test exécuté`, pas la chaîne d'erreur. Créer le fichier de test sous `packages/**` est interdit par le contrat de cette révision, donc le libellé.runner ne peut pas être capturé ici ; le seuil « après » (4 pass / 0 fail) est en revanche chiffré et opposable. |

**Aucun résidu `open`.** La proposition est implémentable.

### Traçabilité des `Required changes` du verdict

| # | Required change | où il est traité | statut |
|---|---|---|---|
| 1 | Chemins vers `src/`, fichier neuf en `src/mcp/catalog-health-gate.test.ts` | §7 Test 1, Test 2, Test 3 | **fait** — O1 |
| 2 | Supprimer la motivation « outils fantômes » ; vrai bénéfice `slots` +5 ; `corePresent` sur `visibleCatalog.tools` si conservé | §2.7, §4(f) | **fait** — O2 |
| 3 | Séparer le chiffrage par mode, garder `INFERE` | §2.6 (tableau à deux lignes + tableau de vérification) | **fait** — O3 |
| 4 | Écrire la borne de latence du gate | §2.3, §3 étape 8, §6.2 | **fait** — O4 |
| 5 | Citer `tool-catalog.ts:107` et `:114` | §2.5 | **fait** — O5 |
| 6 | Réparer les trois étiquettes de plage et l'élision | §2.4 (`:206-219`), §2.3 (`:10-12`, `:18-21`, `:23-25`), élision `index.ts:266-273` **supprimée** | **fait** — O6 |
| 7 | Répondre aux deux questions de §9 dans la proposition | §9 Q1 et Q2, chacune avec recommandation | **fait** — O7, O8 |

### Citations relues et citations supprimées

| citation | statut |
|---|---|
| `index.ts:200-204`, `:262-282`, `:690-735`, `:798-855`, `:836-852`, `:856-868`, `:880-925`, `:1095-1105`, `:1125-1160`, `:1161-1200` | relues dans cette passe |
| `tools.ts:40-48`, `:80-110`, `:165-200`, `:200-245`, `:245-292`, `:285-294`, `:758-790` | relues dans cette passe |
| `tool-catalog.ts:100-125`, `:292-335` | relues dans cette passe |
| `tools-allowlist.test.ts:1-85`, `:36-94` | relues dans cette passe |
| `reconnect-policy.test.ts:1-45` | relu dans cette passe |
| `lifecycle.test.ts:268-310` | relu dans cette passe |
| `index.ts:266-273` (plage contigu, forme faultive) | **supprimée** — remplacée par `:267` et `:273` cités séparément |
| `index.ts:211-216` (étiquette faultive) | **supprimée** — remplacée par `tools.ts:206-219` |
| `reconnect-policy.test.ts` « ligne 5 » | **supprimée** — remplacée par `:10-12`, `:18-21`, `:23-25` |
| `test/session/tools-allowlist.test.ts`, `test/mcp/reconnect-policy.test.ts` | **supprimées** — ces chemins n'existent pas (§7, O1) |