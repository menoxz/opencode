# Plugin hot-reload for production

Design and implementation plan for letting community members add, update and remove opencodev2
plugins — **code included** — on a live server, without ever restarting the harness.

Status: plan validated, implementation in progress. Source of truth for the phases below.

## Verdict of the feasibility study

The infrastructure was **armed but inoperative**: the plugin file watcher runs in production and its
comment promised something that never happened.

| Operation | State before this work | Evidence |
|---|---|---|
| Add a plugin | partially viable, unmeasured | watcher armed in `src/plugin/index.ts`, `ensureWatching()` at `:372` (`list`) and `:381` (`reload`) |
| Update a plugin's code | **impossible** | `HOTRELOAD_OBSERVATION first=["v1"] second=["v1"]` after `Plugin.reload()` |
| Remove a plugin | partial | dropped from hooks; tool catalogue possibly frozen |
| Add/remove plugin tools | frozen | `registry.ts:317-322` vs `index.ts:378` |
| npm install at runtime | not exposed | `store.ts:20-27` (interface unrouted) |

Correction of the initial hypothesis: the watcher is **not** disabled in production — the only gate is
`flags.pure` (`OPENCODE_PURE`, `runtime-flags.ts:18`). The `OPENCODE_NO_DAEMON_WATCH` gate belongs to
the *daemon* file watcher (`watch.ts:100`), not to plugins.

## Locks to remove

| # | Lock | Evidence |
|---|---|---|
| L1 | ESM import cache: the same specifier returns the cached module | `LOADER_OBSERVATION {"first":"v1","second":"v1"}`; `CACHE_BUST_OBSERVATION … queryBusted=v1 copied=v2` — a distinct **path** reloads, a `?v=` query does not |
| L2 | Tool catalogue memoised, never invalidated by a plugin reload | `registry.ts:207+` (`InstanceState`), `version: ++catalogSequence`, plugin tools `:317-322`; `index.ts:378` invalidates only the *plugin* state |
| L3 | Project plugins ignored → "every member" impossible | `config/plugin.ts:30-45`, `config/config.ts:672-681`; measured effect: `test/plugin/trigger.test.ts` 0 pass / 2 fail |
| L4 | Watcher armed but ineffective = false contract | `index.ts:275-279` promises the opposite of what is measured |
| L5 | No plugin management surface (HTTP/SDK/CLI) | no `plugin` HTTP group; SDK only has `plugin?: Array<string>` (`types.gen.ts`) |
| L6 | npm install at boot instead of at runtime | `store.ts:95` |
| L7 | Hooks executed with no protection | `index.ts:357-361`: `yield* Effect.promise(async () => fn(input, output))` — no try, timeout or quota |
| L8 | Two plugin systems | hooks: `packages/opencode/src/plugin`; core: `packages/core/src/plugin/boot.ts` |

Reusable assets already present: `tui/worker.ts` (`Rpc.listen`) as an isolation precedent, and
`handlers/global.ts:87-96` which already disposes every instance after a global config change.

## Target architecture

1. **Plugin supervisor** — the core never loads third-party code into its own module graph.
2. **Immutable generations** — `{id, contentHash, generation, capabilities, health}`; every write
   produces a new generation while the previous one keeps serving.
3. **Load by content-hashed artifact path** — removes L1 without relying on a query string.
4. **Generation-keyed tool catalogue** — `ToolRegistry` rebuilt on swap; removes L2.
5. **Atomic swap** — a session captures its generation at the start of a turn and keeps it; only new
   interactions see the new generation. A failed load rolls back to the previous generation, then
   quarantines the plugin and emits a bus event.
6. **Management surface** — HTTP group `plugin` (`list|add|remove|reload|update|status`) + generated
   SDK + CLI, plus a `plugin.changed` SSE event; removes L5.
7. **Multi-project** — global and per-project plugin origins watched (enumeration already exists at
   `index.ts:291-300`); removes L3.
8. **Runtime npm** — install into a versioned directory, bundle to a hashed artifact, then swap;
   removes L6.
9. **Core PluginV2** — `PluginBoot.add` accepts dynamic, replayable plugins under the same
   supervisor; removes L8.

## Phases

| Phase | Content | Effort |
|---|---|---|
| P0 | Measure and pin the existing behaviour; repair `trigger.test.ts`; fix the false comment | 1 d |
| P1 | **L1** — content-hashed artifact loader + regression tests | 2–3 d |
| P2 | **L2** — generation-keyed catalogue + add/remove tool test | 1 d |
| P3 | **L7 + isolation** — plugin host worker, supervisor, RPC hooks/tools, atomic swap + rollback + quarantine | 4–6 d |
| P4 | **L3 + L5** — HTTP group + SDK + CLI + SSE + multi-project trust policy | 2–3 d |
| P5 | **L6** — runtime npm (bundle + hashed artifact) | 1–2 d |
| P6 | **L8** — dynamic PluginV2 | 1–2 d |

Critical path: P1 → P2 → P3. Quick win of 3–4 days (P0+P1+P2): hook plugins become hot-updatable
without isolation, which validates the value before the heavy P3 effort.

## Risks

1. **Memory leaks** — each generation accumulates non-collectable ESM modules; bound the generation
   count and recycle the worker.
2. **Serializable RPC is the main P3 cost** — hooks currently receive enriched closures (SDK `client`,
   `Bun.$`, `serverUrl`); keep a legacy in-process adapter for trusted local plugins or compatibility
   breaks.
3. **Worker isolation is not an OS sandbox** — a worker shares the OS user. Hostile multi-tenancy
   needs one user/container per tenant, beyond the validated option.
4. **A surface that writes code must be authorised** — the server currently only has
   `OPENCODE_SERVER_PASSWORD`; otherwise the plugin API is an arbitrary-code-execution path.
5. **L8 double maintenance** — converge on PluginV2 in the medium term.
6. **Long sessions** — the "generation captured at turn start" semantics must be decided per hook.

## Validated decisions (user)

- Execution: **isolated multi-tenant** — process/worker per plugin, granted capabilities, kill
  switch, limits, quarantine.
- Scope: **both** plugin systems (hooks + core PluginV2).
- In-flight sessions: **atomic swap**, no broken session (rollback + quarantine on failure).
- Plugin intake: **watched local directory + API + npm**.
