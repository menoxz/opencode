## Report

1. **Objective**: Design MCP management tools for LLM + hot-reload fixes
2. **Files**:
   - `docs/adr/ADR-007-mcp-llm-tools.md` — Accepted, 4 new MCP tools
   - `docs/adr/ADR-008-hot-reload-improvements.md` — Accepted, hotreload skill update + instruction watcher
   - `docs/architecture-mcp-tools-hotreload.md` — Full architecture design with diagrams, data flows, stub code
3. **Decisions**:
   - **ADR-007**: 4 new tools (`mcp_list`, `mcp_connect`, `mcp_disconnect`, `mcp_reload`) in `src/tool/mcp.ts`, registered in `registry.ts`, using existing MCP service interface. `mcp_list` is read-only (no `ask`); the other 3 use `ask` permission.
   - **ADR-008**: Update hotreload skill (remove outdated restart requirement, add MCP tools section). Verify config watcher is sufficient. Add optional instruction watcher for logging only.
4. **Status**: 🟢 Complete

### Design Checklist
| Criterion | Status |
|-----------|--------|
| Minimal (YAGNI) | ✅ 4 single-purpose tools |
| Failure modes documented | ✅ NotFoundError, connection errors |
| Incremental deployment | ✅ Design → Build → Test |
| Observability | ✅ Existing logging + instruction watcher |
| Security boundaries | ✅ `ask` on destructive ops, read-only on list |
| Blast radius | ✅ Tool failure → error to LLM, no session crash |
| Rollback strategy | ✅ Revert registry.ts + remove mcp.ts + revert SKILL.md |
| External dependencies | ✅ No new dependencies |
