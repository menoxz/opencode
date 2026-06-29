# ADR-009: Live Agent Hot-Reload & Self-Modification Extension Points

## Status
**Accepted** — 2026-06-29

## Context
ADR-008 asserted that agents already had a working `Agent.reload()` wired to an
fs.watch (its table claimed "✅ fs.watch, 300ms debounce / ✅ Agent.reload()").
On inspection this was **aspirational, not real**:

- `Agent.reload()` existed but was **never called** — only `MCP.reload()` was
  triggered by the config watcher. The agent watcher was effectively dormant.
- The system prompt *is* rebuilt every turn with a fresh agent lookup
  (`agents.get(lastUser.agent)` in `session/prompt.ts`, and again in
  `session/processor.ts` for permission checks). So the only thing missing to
  propagate an edited agent definition into a **running** session was cache
  invalidation — no per-turn re-read of the file was required beyond that.
- `Config.invalidate()` only called `invalidateGlobal`, which did **not** clear
  the assembled `InstanceState` that actually holds the `.md`-defined agents.

This ADR records what was actually built (commit `93cdfb686`) and, per the task
contract, documents the extension points an agent would use to **modify its own
instruction file** at runtime.

## Decision

### A. Wire `Agent.reload()` to a lazy, debounced watcher
`packages/opencode/src/agent/agent.ts`:

- A `started` flag + `ensureWatching` (mirrors the proven `Skill.ensureStarted`
  pattern). The watcher is **armed lazily on first access** from
  `get`/`list`/`defaultInfo`/`defaultAgent`, not at layer construction.
- `ensureWatching` is gated `if (flags.pure) return` so tests/sandbox never spawn
  real fs.watch side-effects.
- It filters changed paths through `isAgentFile` / `isConfigFile` (from
  `@/hotreload`), debounces 300ms, and self-rearms.
- On a relevant change it calls `reload()`, which is now just invalidation:
  `config.invalidate()` + `InstanceState.invalidate(state)` + a `list()` to
  re-prime. The next turn's `agents.get()` re-parses the file from disk.
- A `Effect.addFinalizer` closes the watcher on layer teardown (no leaked handle).

### B. Make `Config.invalidate()` clear the assembled state
`packages/opencode/src/config/config.ts`: `invalidate()` now also calls
`InstanceState.invalidate(state)`. Without this, `.md`-defined agents survived
invalidation because they live in the assembled state, not the global cache.

### C. Skip the detached plugin install under pure mode
The assembly path forks a **detached** `@opencode-ai/plugin` npm install
(`Effect.forkDetach`). Re-running assembly via `invalidate()` re-spawned this
fiber; orphaned, it hung test/sandbox teardown. It is now skipped when
`Flag.OPENCODE_PURE` is set — consistent with the documented intent that pure
mode skips external plugin discovery/install.

### D. Verification (live reload, not just unit)
`packages/opencode/test/agent/agent.test.ts` adds a pure-mode test: write an
agent file with `ORIGINAL INSTRUCTIONS`, `reload()`, assert the next access
surfaces `UPDATED INSTRUCTIONS`. This exercises the exact path a running session
takes when it re-resolves its agent each turn.

## Reload Chain (verified)
```
edit .opencode/agent/<name>.md
  → fs.watch fires (isAgentFile filter, 300ms debounce)
  → Agent.reload()
      → Config.invalidate()  → InstanceState.invalidate (global + assembled)
      → InstanceState.invalidate(agent state)
      → list()  (re-prime)
  → next LLM turn: agents.get(name) re-parses disk
  → new agent.prompt → system prompt rebuilt → new instructions in context
```
No process restart. No daemon bounce.

## Extension Points for Agent Self-Modification

The long-term vision is an agent that **rewrites its own instruction file** and
sees the change take effect on its very next turn. The mechanism above already
makes that possible read-side; the remaining work is a **write path + a guarded
trigger**. The seams are:

1. **Write surface — the agent definition file.**
   `config/agent.ts` `load()` does a `Glob.scan` of `*.md` and reads fresh from
   disk every assembly (no internal cache). An agent can therefore self-modify by
   writing its own `.opencode/agent/<self>.md` (frontmatter + body). This is the
   single source of truth; nothing else needs to change for the edit to be seen.

2. **Invalidation hook — `Agent.reload()`.**
   Already public on the Agent service. A self-modification tool can call it
   directly after writing, instead of waiting on the 300ms fs.watch debounce, to
   make the change deterministic within the same turn boundary.

3. **Watcher gate — `ensureWatching` / `flags.pure`.**
   In normal runtime the watcher auto-catches the self-write; no explicit
   `reload()` call is even required. The gate is the place to add policy (e.g.
   "only self-edits under `.opencode/agent/` auto-reload").

4. **Re-resolution point — `agents.get(lastUser.agent)`** in `session/prompt.ts`
   (and `session/processor.ts`). Because the running session looks the agent up
   by name **every turn**, a mid-session identity change is picked up with zero
   session plumbing. A future "switch to my updated self" needs nothing here.

5. **Safety boundary (to build next, intentionally out of scope here).**
   A self-modification tool should: validate the new frontmatter against the
   existing agent schema (`config/agent.ts` schemas) before writing; keep a
   backup/diff of the prior version for rollback; and gate writes behind a
   permission (reuse the `Permission.evaluate` path already used for external
   directories). Self-edits should be append-or-replace on body text, not
   arbitrary frontmatter (e.g. don't let an agent silently grant itself new
   tool permissions without review).

## Consequences

### Positive
- Editing an agent file now actually reloads into the live session (ADR-008's
  claim becomes true).
- `.md`-defined agents refresh correctly (assembled-state bug fixed).
- Test/sandbox teardown no longer hangs on an orphaned install fiber.
- The self-modification path is reduced to "write file + (optional) reload" —
  the hard part (live re-injection) is done.

### Negative
- One fs.watch per agent/config directory while a session is active (same cost
  profile as the existing skill watcher).
- The self-modification safety boundary (point 5) is **not** implemented here;
  shipping a self-edit tool without it would let an agent change its own
  permissions unreviewed.

## Files Changed
| File | Change |
|------|--------|
| `packages/opencode/src/agent/agent.ts` | `started` flag, `ensureWatching`, real `reload()`, finalizer |
| `packages/opencode/src/config/config.ts` | `invalidate()` clears assembled state; pure-mode skips detached install |
| `packages/opencode/test/agent/agent.test.ts` | pure-mode live-reload test |

## Verification
1. `bun test test/agent/agent.test.ts` → reload test passes, no teardown hang.
2. `bun run typecheck --filter=opencode` → clean.
3. Live: edit a `.opencode/agent/<name>.md` body during a session → next turn
   reflects the new instruction without restart.
