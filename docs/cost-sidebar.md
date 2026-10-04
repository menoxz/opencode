# Sidebar context and estimated cost

All dollar amounts are stored USD **estimates, not a provider bill**. Zero is valid;
missing, negative or non-finite costs are unavailable, never silently zero.

## Scopes

- **Context (last call)** is the last recorded, matching `step-finish` usage in
  loaded message/part order. Recorded usage remains valid even when the assistant
  later errors or is still streaming. Without steps, the latest completed,
  non-error assistant's stored tokens are shown as **Context (stored usage)**;
  its cumulative message cost is never substituted for a call cost.
- **Tokens / % used** estimate the last call footprint: input + output + reasoning
  - cache read + cache write, divided by that call's model context limit. Unknown
    limits stay unknown; values above 100% are not clamped. This is not an exact
    tokenizer measurement of the current prompt.
- **Processed** sums every unique loaded `step-finish` (including multiple steps
  within one assistant). Repeated assistant/part IDs count once; foreign-session
  or foreign-message parts are ignored. No steps means unavailable, not zero.
  **Loaded history: partial** is always explicit: the public state API does not
  certify full history. Missing-msg counts identify loaded assistants without
  any steps, not a count of every missing call. Even zero missing msgs cannot
  certify completeness. Duplicate counts are displayed when present.
- **55,000 tokens** footprint versus **749,000 processed** is expected when the
  preceding call processed 694,000 tokens and the latest processed 55,000: a
  per-call size and repeated processing over history are different quantities.
- **Read/input** = cache read / (non-cache input + cache read + cache write).
  **Prev read/input** compares only the previous recorded loaded step, including
  one in the same assistant. Zero input gives n/a. A lower ratio is an observation,
  not proof of cache eviction, prefix changes, provider billing or any guessed cause.
- **Last call** is only the last recorded step's cost. **Parent total** is the
  selected session's stored cumulative cost, including calls outside loaded
  history. It is not summed with that session's messages or step costs again.
- **Desc. loaded** sums reachable child and deeper descendant session costs once
  per session ID. **All loaded** adds that sum to the parent once. Cycles,
  duplicate rows and unrelated roots cannot double-count the parent or children.
  Parent `4.637405` + child `3.99026` = combined `8.627665`.
- **Tree: partial snapshot** means only descendants reachable in a bounded
  snapshot are known, not the whole tree or all sessions. The plugin state API
  exposes get/count, not enumeration: one SDK `session.list({limit: 200})` runs
  per selected-session mount/change with a five-second timeout and no polling.
  Returned rows are capped at 200; known rows use live state session values when
  available. Session create/update/delete events supplement that snapshot without
  polling; listeners are disposed with the view, with at most 200 recent updates
  and 200 deletion markers retained. Unobserved/older branches can still be absent. Snapshot
  failure/loading is explicit and never an empty-tree zero. Zero loaded descendants
  means unavailable, not proof of no descendants. Any known descendant missing a
  valid cost makes descendant and combined estimates unavailable; a known subtotal
  is separately labeled. No snapshot certifies a global total.

## Verification

From `packages/opencode`:

```sh
bun test test/cli/tui/sidebar-context.test.ts test/cli/tui/sidebar-context.view.test.tsx
bun typecheck
```

Tests exercise real OpenTUI Solid rendering (24/40/48 columns), reactive cost and
part updates, parent-child-grandchild, cycles/duplicates, partial history, failed
queries, zero/missing/invalid amounts and recorded usage on failed/streaming calls.
This is a UI-only interpretation: accounting, persistence, pricing and runtime
behavior are unchanged. No build, deployment or commit is required.
