# ADR-008: Hot-Reload Improvements

## Status
**Accepted** — 2026-06-14

## Context
The opencode fork has a hot-reload system that watches files and invalidates caches automatically. However, there are several gaps between the current implementation and the documentation:

### Current State

| Component | Watcher? | Cache Invalidation | Notification |
|-----------|----------|-------------------|--------------|
| Skills (`src/skill/index.ts`) | ✅ fs.watch, 300ms debounce | ✅ `Skill.reload()` | Next LLM turn |
| Agents (`src/agent/agent.ts`) | ✅ fs.watch, 300ms debounce (wired in ADR-009) | ✅ `Agent.reload()` (wired in ADR-009) | Next LLM turn |
| Instructions (`src/session/instruction.ts`) | ❌ No watcher | ✅ `Instruction.system()` re-reads every turn | N/A |
| Config (`opencode.json`) | ✅ fs.watch (multiple watchers) | ✅ Triggers `MCP.reload()` | Next LLM turn |
| MCP servers | ✅ `setupMcpWatchers()` in `mcp/index.ts` | ✅ Calls `reload()` | Next LLM turn |

### Known Issues
1. **Hotreload skill (`SKILL.md`)** contains outdated statements:
   - "Config MCP changes (add/remove server) require daemon restart" — this is **false** since `MCP.reload()` handles runtime config changes
   - No documentation about the new MCP management tools (mcp_list, mcp_connect, mcp_disconnect, mcp_reload)
   - "opencode.json — config reloaded, MCP changes take effect on next server start" — misleading, should say "take effect immediately via MCP.reload()"
2. **Config watcher**: Multiple watchers watch `opencode.json`. The MCP config watcher in `mcp/index.ts` (lines 670-716) already calls `MCP.reload()` when config files change. But there are also higher-level config watchers — we need to verify no conflict.
3. **Instruction watcher** (optional): Instructions re-read every turn without explicit notification. Could add an fs.watch for AGENTS.md/CLAUDE.md to log when they change (informational only).

## Decision

### A. Update Hotreload Skill
Update `~/.config/opencode/skills/hotreload/SKILL.md`:

**Changes:**
1. Remove the line: `- Config MCP changes (add/remove server) require daemon restart`
2. Update the `opencode.json` line to reflect immediate MCP reload:
   - Before: `opencode.json — config reloaded, MCP changes take effect on next server start`
   - After: `opencode.json — config reloaded, MCP changes picked up immediately`
3. Add MCP management tools section documenting that the LLM can now manage MCP servers during a session using `mcp_list`, `mcp_connect`, `mcp_disconnect`, `mcp_reload`
4. Add a new section: "### New: LLM MCP Management Tools"

### B. Verify Config Watcher Sufficiency
The config watcher in `mcp/index.ts` (lines 670-716) watches all config directories for `opencode.json` changes and calls `MCP.reload()` on change. This is sufficient — no changes needed.

However, verify that:
- The `isConfigFile()` function (imported from `@/hotreload`) correctly identifies `opencode.json` across all config directories
- The debounce (300ms) is sufficient to batch rapid saves

**Decision**: No code changes needed. The existing watcher is correct.

### C. Add Instruction Watcher (Optional Enhancement)
Add an informational fs.watch for AGENTS.md and CLAUDE.md files. This is purely for logging — instructions already re-read every turn via `Instruction.system()`.

**Design:**
- Add a `setupInstructionWatcher()` function in `src/session/instruction.ts`
- Watch the same directories as the config watcher (derived from `Config.directories()`)
- Watch project root directory
- Filter for `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` filenames
- On change: log an info message like `"instruction file changed: {path}"`
- No cache invalidation needed (instructions re-read every turn)
- Clean up watchers on `clear()`

**Implementation notes:**
- This is purely observability — it helps users (and the LLM) understand when instruction context might have changed
- Can be scoped under an `experimentalInstructionWatcher` flag if desired, but the overhead is minimal

**Decision**: Implement as informational logging only. No functional change.

## Consequences

### Positive
1. **Accurate documentation**: The hotreload skill no longer contains false statements about daemon restarts
2. **LLM awareness**: The hotreload skill now documents MCP management tools, so LLM agents know they exist
3. **Instruction visibility**: Changes to AGENTS.md/CLAUDE.md are logged, making it easier to debug context issues
4. **Zero behavioral change**: All existing hot-reload behavior is preserved

### Negative
1. **Instruction watcher adds minor overhead**: ~1 fs.watch per config directory + project root
2. **Maintenance burden**: The SKILL.md must be kept updated as the MCP tool set evolves

## Alternatives Considered

### Alternative A: Remove instruction re-read per turn (rely on watcher only)
- **Rejected**: Instructions must always be fresh. Re-reading every turn is the correct conservative default.

### Alternative B: Auto-trigger tool re-registration on instruction change
- **Rejected**: Instructions are injected as system prompts, not tool definitions. No tool re-registration is needed.

### Alternative C: Don't update the hotreload skill (leave the outdated info)
- **Rejected**: Outdated documentation causes confusion and wasted debugging time.

### Alternative D: Add fs.watch for instructions with full cache invalidation
- **Rejected**: Over-engineering. The current behavior (re-read every turn) is simpler and already correct.

## Files Changed (Build Phase)

| File | Change |
|------|--------|
| `~/.config/opencode/skills/hotreload/SKILL.md` | Update outdated MCP restart info, add MCP tools section |
| `packages/opencode/src/session/instruction.ts` | Add optional instruction watcher with logging |

## Verification
1. Modify `opencode.json` to add/remove an MCP server → verify `mcp_list` shows the change immediately (no restart)
2. Run `mcp_reload` tool → verify servers reconnect/disconnect as expected
3. Modify `AGENTS.md` → verify log message appears (if watcher enabled)
