# ADR-007: MCP LLM Tools — In-Session MCP Server Management

## Status
**Accepted** — 2026-06-14

## Context
The opencode fork currently exposes MCP (Model Context Protocol) server tools to the LLM via session injection in `session/tools.ts` (lines 118-203). However, there is no way for the LLM to **manage** the MCP servers themselves during a session. The MCP service (`src/mcp/index.ts`) already has all the necessary operations:
- `status()` → returns `Record<string, Status>` (connected, disabled, failed, needs_auth, needs_client_registration)
- `connect(name)` → connects a configured but disconnected server
- `disconnect(name)` → disconnects a connected server
- `reload()` → re-reads `opencode.json` and syncs all MCP server state

These operations are only available programmatically (via Effect) or through daemon restart. The LLM has no agency to:
1. List which MCP servers are configured and their connection status
2. Connect a server that failed to start or was manually disconnected
3. Disconnect a problematic server mid-session
4. Reload MCP config after `opencode.json` changes

The hotreload skill currently tells users "Config MCP changes (add/remove server) require daemon restart" — this is **outdated** since `MCP.reload()` handles runtime config changes, but the LLM has no tool to invoke it.

## Decision
We will create **4 new built-in tools** in `src/tool/mcp.ts` and register them in `src/tool/registry.ts`:

### Tool 1: `mcp_list`
- **ID**: `mcp_list`
- **Purpose**: List all configured MCP servers with their current status
- **Parameters**: none
- **Returns**: JSON/markdown summary with server name, type (local/remote), status, tools count, error message (if any)
- **Permissions**: No user confirmation required (read-only)
- **MCP call**: `MCP.status()`
- **Implementation notes**: Also needs to count tools per server. The `MCP.defs` state has `Record<string, MCPToolDef[]>` — but this is internal state. Either expose a method on the MCP interface or derive tool counts from the status plus defs lookup.

### Tool 2: `mcp_connect`
- **ID**: `mcp_connect`
- **Purpose**: Connect to a specific MCP server by name
- **Parameters**: `name` (Schema.String, required)
- **Returns**: Success/error message with server name
- **Permissions**: `ask` (user confirmation required) — connecting servers can be disruptive
- **MCP call**: `MCP.connect(name)`
- **Error handling**: Uses `NotFoundError` from MCP service. If the server fails to connect, return a clear error message.

### Tool 3: `mcp_disconnect`
- **ID**: `mcp_disconnect`
- **Purpose**: Disconnect a specific MCP server by name
- **Parameters**: `name` (Schema.String, required)
- **Returns**: Success message listing the tools that were removed, or error
- **Permissions**: `ask` (user confirmation required)
- **MCP call**: `MCP.disconnect(name)`
- **Implementation notes**: Before disconnecting, capture the list of tool names from `defs[name]` to report what tools were removed.

### Tool 4: `mcp_reload`
- **ID**: `mcp_reload`
- **Purpose**: Reload all MCP servers from config (re-reads opencode.json)
- **Parameters**: none
- **Returns**: Summary of changes: which servers connected/disconnected/changed status
- **Permissions**: `ask` (user confirmation required) — may disrupt active connections
- **MCP call**: `MCP.reload()`
- **Implementation notes**: Capture the status map before and after reload to produce a meaningful diff.

### Tool Definition Pattern
All four tools follow the existing `Tool.define("id", Effect.gen(function* () { ... }))` pattern:
```typescript
export const Parameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the MCP server" }),
})

export const McpConnectTool = Tool.define(
  "mcp_connect",
  Effect.gen(function* () {
    const mcp = yield* MCP.use

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: [params.name],
            always: [params.name],
            metadata: { operation: "connect" },
          })
          yield* mcp.connect(params.name)
          return {
            title: `Connected to MCP server: ${params.name}`,
            metadata: {},
            output: `✅ Successfully connected to MCP server \`${params.name}\``,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

### Registration in Registry
In `registry.ts`:
1. **Import** the 4 tools from `./mcp`
2. **Init** them via `Tool.init()` alongside existing tools (around line 241-267)
3. **Add** to the `builtin` array (around line 271-296) — placed near the `skill` and `subagent` tools
4. **Add** `MCP.Service` to the registry's layer dependencies

### Permission Category
We introduce a new permission category `"mcp"`. The permission parameter in `ctx.ask()` is set to:
- `"mcp"` for all MCP management operations (connect, disconnect, reload)
- `"*"` as the **always** pattern (always prompt the user for these destructive operations)

This follows the pattern used by shell/task tools where `permission` is a string identifier and `patterns`/`always` control prompting behavior.

### Description Files
Each tool gets a `.txt` description file:
- `mcp_list.txt`
- `mcp_connect.txt`
- `mcp_disconnect.txt`
- `mcp_reload.txt`

These follow the existing convention (e.g., `skill.txt`).

## Consequences

### Positive
1. **LLM autonomy**: The LLM can diagnose and fix MCP connectivity issues without human intervention
2. **No restart needed**: Users no longer need to restart the daemon for MCP changes
3. **Self-healing sessions**: The LLM can reconnect failed servers mid-conversation
4. **Observability**: `mcp_list` gives the LLM visibility into which servers and tools are available
5. **Consistent pattern**: Follows existing tool conventions perfectly

### Negative
1. **Surface area**: Adds 4 new tools to the LLM's already-large tool set
2. **Permission prompts**: Connecting/disconnecting/reloading will prompt the user, adding friction
3. **Error complexity**: MCP servers can fail in many ways (OAuth, network, process crash) — error messages must be informative

### Neutral
1. Permission category `"mcp"` needs to be documented in any ruleset configuration
2. The `mcp_disconnect` tool needs to capture the tool list before closing the client (since `closeClient` deletes `defs`)

## Alternatives Considered

### Alternative A: Expose MCP management as part of the existing hot-reload config watcher only
- **Rejected**: This provides no LLM agency. The LLM cannot respond to MCP failures during a session.

### Alternative B: Single `mcp_manage` meta-tool with sub-commands
- **Rejected**: This deviates from the existing tool pattern where each tool has a single purpose. Single-responsibility tools are easier for the LLM to reason about.

### Alternative C: Auto-connect all configured servers on startup (no tools needed)
- **Rejected**: This is already what MCP.reload() does. The issue is that failures, disconnections, and config changes happen mid-session and need reactive management.

### Alternative D: Skip `ask` permission for `mcp_list` (read-only)
- **Accepted**: `mcp_list` is read-only and should not require user confirmation. The other three tools use `ask` for destructive operations.
