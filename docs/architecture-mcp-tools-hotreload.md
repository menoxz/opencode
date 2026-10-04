# Architecture Design: MCP LLM Tools + Hot-Reload Improvements

> **Status**: 🟢 Complete (design + ADR)
> **Author**: Architect Agent
> **Date**: 2026-06-14

---

## 1. Objective

Design the architecture for:
1. **MCP management tools** exposed to the LLM (connect/disconnect/list/reload MCP servers from within a session)
2. **Hot-reload improvements** for agents, skills, instructions, and config

Deliverable: Design document + ADR-007 + ADR-008. No code.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        LLM Provider                              │
│  Receives: Tool.Def[] from ToolRegistry + MCP tools from mcp()   │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                    session/tools.ts (resolve)                     │
│  - Gets builtin Tool.Def[] from ToolRegistry.tools()             │
│  - Gets MCP tools from mcp.tools() (AI SDK dynamicTool[])        │
│  - Wraps both with: plugin hooks, permission, truncation         │
└────┬──────────────────────────────────┬──────────────────────────┘
     │                                  │
┌────▼──────────────┐    ┌──────────────▼──────────────────────────┐
│ tool/registry.ts  │    │ tool/mcp.ts  ◄── NEW FILE                │
│ Built-in tools:   │    │                                         │
│ - shell, read,    │    │ 4 new tools:                            │
│   write, edit,    │    │ - mcp_list     (read-only)              │
│   skill, subagent │    │ - mcp_connect  (ask permission)         │
│   ...             │    │ - mcp_disconnect (ask permission)        │
│ + mcp_list        │    │ - mcp_reload   (ask permission)         │
│   mcp_connect     │    │                                         │
│   mcp_disconnect  │    │ Each uses: Tool.define(id, Effect.gen)  │
│   mcp_reload      │    │ Each acquires: yield* MCP.use           │
└──────────────────┘    └──────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ mcp/index.ts│
                    │ (Service)   │
                    │ status()    │
                    │ connect()   │
                    │ disconnect()│
                    │ reload()    │
                    └─────────────┘
```

---

## 3. Detailed Design

### 3.1 New File: `packages/opencode/src/tool/mcp.ts`

This file contains all 4 MCP management tools. Each follows the existing `Tool.define()` pattern:

```typescript
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { MCP } from "../mcp"
// Description text imports:
import MCP_LIST_DESCRIPTION from "./mcp_list.txt"
import MCP_CONNECT_DESCRIPTION from "./mcp_connect.txt"
import MCP_DISCONNECT_DESCRIPTION from "./mcp_disconnect.txt"
import MCP_RELOAD_DESCRIPTION from "./mcp_reload.txt"
```

#### Tool Definitions

**`mcp_list`** (no parameters, read-only):
```typescript
export const McpListTool = Tool.define(
  "mcp_list",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_LIST_DESCRIPTION,
      parameters: Schema.Struct({}), // no params
      execute: (_params, _ctx) =>
        Effect.gen(function* () {
          const status = yield* mcp.status()
          // Also get defs to count tools per server
          // Format: server name, type, status, tools count, error
          const lines = Object.entries(status).map(([name, st]) => {
            const type = st.status === "connected" ? "local/remote" : "unknown"
            const tools = st.status === "connected" ? "(from defs)" : "0"
            const error = st.status === "failed" ? st.error : ""
            return `- ${name}: ${st.status} | tools: ${tools}${error ? ` | error: ${error}` : ""}`
          })
          return {
            title: "MCP Server Status",
            metadata: { servers: status },
            output: lines.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

**`mcp_connect`** (name parameter, ask permission):
```typescript
export const McpConnectTool = Tool.define(
  "mcp_connect",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_CONNECT_DESCRIPTION,
      parameters: Schema.Struct({
        name: Schema.String.annotate({ description: "The name of the MCP server to connect" }),
      }),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: [params.name],
            always: [params.name],
            metadata: { operation: "connect" },
          })
          yield* mcp.connect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          return {
            title: `Connected MCP: ${params.name}`,
            metadata: {},
            output: `✅ Successfully connected to MCP server \`${params.name}\`.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

**`mcp_disconnect`** (name parameter, ask permission):
```typescript
export const McpDisconnectTool = Tool.define(
  "mcp_disconnect",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_DISCONNECT_DESCRIPTION,
      parameters: Schema.Struct({
        name: Schema.String.annotate({ description: "The name of the MCP server to disconnect" }),
      }),
      execute: (params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: [params.name],
            always: [params.name],
            metadata: { operation: "disconnect" },
          })
          yield* mcp.disconnect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          return {
            title: `Disconnected MCP: ${params.name}`,
            metadata: {},
            output: `✅ Disconnected MCP server \`${params.name}\`. Tools from this server are no longer available.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

> **Note for build phase**: The `disconnect` tool ideally reports which tools were removed. However, `MCP.disconnect()` currently doesn't return the tool list. Options:
> - Option A: Modify `MCP.disconnect()` to return the defs before clearing them
> - Option B: Read `s.defs[name]` before calling `mcp.disconnect()` (not possible if access is through the interface only)
> - Option C: Keep it simple — report server name only, since the LLM can infer which tools were removed
>
> **Recommendation**: Option C for simplicity. The LLM knows what tools each server provides.

**`mcp_reload`** (no parameters, ask permission):
```typescript
export const McpReloadTool = Tool.define(
  "mcp_reload",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_RELOAD_DESCRIPTION,
      parameters: Schema.Struct({}), // no params
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: ["*"],
            always: ["*"],
            metadata: { operation: "reload" },
          })
          // Capture status before
          const before = yield* mcp.status()
          yield* mcp.reload()
          // Capture status after
          const after = yield* mcp.status()
          // Build diff
          const summary = buildReloadSummary(before, after)
          return {
            title: "MCP Reload Complete",
            metadata: { before, after },
            output: summary,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

#### Helper: `buildReloadSummary`
This function compares the `before` and `after` status maps to produce a human-readable summary:
- Newly connected servers: status went from disabled/failed → connected
- Disconnected servers: status went from connected → disabled
- Unchanged servers

---

### 3.2 Modified File: `packages/opencode/src/tool/registry.ts`

#### Changes:

1. **Add imports** (near line 15-16):
```typescript
import { McpListTool, McpConnectTool, McpDisconnectTool, McpReloadTool } from "./mcp"
import { MCP } from "@/mcp"
```

2. **Add MCP.Service to layer dependencies** (near line 91-116, and line 393-418):
```typescript
Layer.provide(MCP.defaultLayer),
```

This ensures the MCP service is available in the Effect context when tools run.

3. **Init tools** (near line 241-267):
```typescript
const tool = yield* Effect.all({
  // ... existing tools ...
  mcp_list: Tool.init(mcpListTool),
  mcp_connect: Tool.init(mcpConnectTool),
  mcp_disconnect: Tool.init(mcpDisconnectTool),
  mcp_reload: Tool.init(mcpReloadTool),
})
```

4. **Add to builtin array** (near line 271-296):
```typescript
tool.mcp_list,
tool.mcp_connect,
tool.mcp_disconnect,
tool.mcp_reload,
```

These should be placed after `skill` and `subagent` but before the experimental tools.

---

### 3.3 New Description Files

Each tool gets a `.txt` description file in `src/tool/`:

**`mcp_list.txt`**:
```
List all configured MCP servers with their connection status, type (local or remote), number of tools available, and any error messages. Use this to check which MCP servers are available and their health.
```

**`mcp_connect.txt`**:
```
Connect to a specific MCP server by name. Use this when a server is disconnected and you want to re-establish the connection. Requires user confirmation. The server must be configured in opencode.json.
```

**`mcp_disconnect.txt`**:
```
Disconnect a specific MCP server by name. Use this to gracefully disconnect a server and free its resources. All tools from the disconnected server will be removed from the session. Requires user confirmation.
```

**`mcp_reload.txt`**:
```
Reload all MCP servers from the opencode.json configuration. This re-reads the MCP configuration and connects/disconnects servers as needed. Use this after modifying opencode.json to apply changes without restarting the daemon. Requires user confirmation.
```

---

### 3.4 MCP Service Interface (no changes needed)

The existing MCP service in `src/mcp/index.ts` already has the methods we need:

| Method | Signature | Used By |
|--------|-----------|---------|
| `status()` | `Effect<Record<string, Status>>` | `mcp_list` |
| `connect(name)` | `Effect<void, NotFoundError>` | `mcp_connect` |
| `disconnect(name)` | `Effect<void, NotFoundError>` | `mcp_disconnect` |
| `reload()` | `Effect<void>` | `mcp_reload` |

**No changes** to the MCP service itself are required for the tools to work. The `Status` type with its 5 variants (connected, disabled, failed, needs_auth, needs_client_registration) provides sufficient information.

---

### 3.5 Permission Design

We introduce a new permission category `"mcp"`:

```typescript
ctx.ask({
  permission: "mcp",       // permission category
  patterns: [params.name], // specific server name
  always: [params.name],   // always prompt for this server
  metadata: { operation: "connect" }, // what operation
})
```

This means:
- `"mcp"` is the permission key used in `opencode.json` permission rulesets
- For destructive operations (connect/disconnect/reload), the `ask` permission prompt is shown
- For `mcp_list`, NO `ask` is used — it's read-only
- The `always` field with `[params.name]` ensures the user is always prompted (never auto-approved)

---

### 3.6 Updated Hotreload Skill

The hotreload skill at `~/.config/opencode/skills/hotreload/SKILL.md` needs these changes:

1. **Remove** line 31: `- Config MCP changes (add/remove server) require daemon restart`
2. **Update** line 25 from: `opencode.json — config reloaded, MCP changes take effect on next server start`
   To: `opencode.json — config reloaded, MCP changes picked up immediately`
3. **Add** a new section after "What reloads without restart" documenting the MCP management tools
4. Replace "Critical Constraints" section with accurate information

---

## 4. Data Flow

### mcp_list flow:
```
LLM → mcp_list tool → mcp.status()
                     ↓
              Record<string, Status>
                     ↓
              Format as markdown/json → LLM
```

### mcp_connect flow:
```
LLM → mcp_connect("serverA") → ctx.ask() [user confirms]
                              → mcp.connect("serverA")
                              → mcp.tools() (re-fetched by session/tools.ts)
                              → new tools appear in next LLM turn
```

### mcp_reload flow:
```
LLM → mcp_reload() → ctx.ask() [user confirms]
                    → mcp.reload()
                    → re-reads opencode.json
                    → syncs all server connections
                    → session/tools.ts re-resolves mcp.tools()
                    → MCP tool set updates in next LLM turn
```

---

## 5. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   LLM Session                                      │  │
│  │                                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │
│  │  │ mcp_list │  │mcp_connec│  │mcp_discon│  │mcp_reload│          │  │
│  │  │ (read)   │  │t (write) │  │nect(write│  │ (write)  │          │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘          │  │
│  └───────┼──────────────┼─────────────┼─────────────┼────────────────┘  │
│          │              │             │             │                    │
│  ┌───────▼──────────────▼─────────────▼─────────────▼────────────────┐  │
│  │                       tool/registry.ts                             │  │
│  │  Built-in: shell, read, write, edit, skill, subagent,             │  │
│  │            mcp_list, mcp_connect, mcp_disconnect, mcp_reload      │  │
│  └────────────────────────────┬──────────────────────────────────────┘  │
│                               │                                         │
│  ┌────────────────────────────▼──────────────────────────────────────┐  │
│  │                     mcp/index.ts (Service)                        │  │
│  │                                                                    │  │
│  │  status() → Record<string, Status>                                │  │
│  │  connect(name) → void                                             │  │
│  │  disconnect(name) → void                                          │  │
│  │  reload() → void (syncs from opencode.json)                       │  │
│  │                                                                    │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                  │  │
│  │  │ Status     │  │ MCPClient  │  │ MCPToolDef │                  │  │
│  │  │ connected  │  │ (SDK)      │  │ []         │                  │  │
│  │  │ disabled   │  │            │  │            │                  │  │
│  │  │ failed     │  │            │  │            │                  │  │
│  │  │ needs_auth │  │            │  │            │                  │  │
│  │  └────────────┘  └────────────┘  └────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               Config File Watchers                                 │  │
│  │                                                                    │  │
│  │  opencode.json change ──── 300ms debounce ──── MCP.reload()       │  │
│  │                                                                    │  │
│  │  agents/*.md change ──── 300ms debounce ──── Agent.reload()       │  │
│  │                                                                    │  │
│  │  skills/*.md change ──── 300ms debounce ──── Skill.reload()       │  │
│  │                                                                    │  │
│  │  AGENTS.md change ──── (NEW) log informational message             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependencies

### New Dependencies
- None. All tools use the existing `MCP` service interface.

### Modified Dependencies (in registry.ts)
- Add `MCP.Service` to the registry's layer dependencies
- Add `MCP.defaultLayer` to the registry's `defaultLayer`

---

## 7. Migration / Rollout

**Phase 1 (Design) — Current**
- ✅ Architecture design
- ✅ ADR-007: MCP LLM Tools
- ✅ ADR-008: Hot-Reload Improvements

**Phase 2 (Build) — Next**
1. Create `src/tool/mcp.ts` with 4 tool definitions
2. Create `src/tool/mcp_list.txt`, `mcp_connect.txt`, `mcp_disconnect.txt`, `mcp_reload.txt`
3. Modify `src/tool/registry.ts`: imports, init, registration, layer deps
4. Update `~/.config/opencode/skills/hotreload/SKILL.md`
5. Add instruction watcher in `src/session/instruction.ts` (optional)
6. Build and test

**Rollback**: Remove the 4 tool defs and revert registry.ts changes. The MCP service is unchanged.

---

## 8. Design Review Checklist

- [x] Is the design minimal? (YAGNI) — 4 tools, each single-purpose
- [x] Are failure modes documented? — NotFoundError, connection failures, permission rejections
- [x] Can it be deployed incrementally? — Yes, Phase 1 (design) → Phase 2 (build)
- [x] Is monitoring/observability built in? — Hooks into existing logging; instruction watcher adds logging
- [x] Are security boundaries clear? — `ask` permission for destructive ops; `mcp_list` is read-only
- [x] What's the blast radius of a failure? — Tool execution failure returns error to LLM, doesn't crash session
- [x] Is there a rollback strategy? — Revert registry.ts, remove mcp.ts, revert SKILL.md
- [x] Are external dependencies justified? — No new external dependencies

---

## Appendices

### A. File: `src/tool/mcp.ts` — Stub Structure

```typescript
// SPDX-License-Identifier: MIT

import { Effect, Schema } from "effect"
import { MCP } from "../mcp"
import * as Tool from "./tool"

// Description text imports
import MCP_LIST_DESCRIPTION from "./mcp_list.txt"
import MCP_CONNECT_DESCRIPTION from "./mcp_connect.txt"
import MCP_DISCONNECT_DESCRIPTION from "./mcp_disconnect.txt"
import MCP_RELOAD_DESCRIPTION from "./mcp_reload.txt"

// ─── mcp_list ───────────────────────────────────────────────────────

export const McpListTool = Tool.define(
  "mcp_list",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_LIST_DESCRIPTION,
      parameters: Schema.Struct({}),
      execute: (_params: Record<string, never>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const statusMap = yield* mcp.status()
          const lines = Object.entries(statusMap).map(([name, st]) => {
            const base = `- **${name}**: \`${st.status}\``
            if (st.status === "failed" && "error" in st) {
              return `${base} — ${st.error}`
            }
            return base
          })
          return {
            title: "MCP Server Status",
            metadata: { servers: statusMap },
            output: lines.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

// ─── mcp_connect ────────────────────────────────────────────────────

export const McpConnectParameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the MCP server to connect" }),
})

export const McpConnectTool = Tool.define(
  "mcp_connect",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_CONNECT_DESCRIPTION,
      parameters: McpConnectParameters,
      execute: (params: Schema.Schema.Type<typeof McpConnectParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: [params.name],
            always: [params.name],
            metadata: { operation: "connect" },
          })
          yield* mcp.connect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          return {
            title: `Connected MCP: ${params.name}`,
            metadata: {},
            output: `✅ Connected to MCP server \`${params.name}\`.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

// ─── mcp_disconnect ─────────────────────────────────────────────────

export const McpDisconnectParameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the MCP server to disconnect" }),
})

export const McpDisconnectTool = Tool.define(
  "mcp_disconnect",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_DISCONNECT_DESCRIPTION,
      parameters: McpDisconnectParameters,
      execute: (params: Schema.Schema.Type<typeof McpDisconnectParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: [params.name],
            always: [params.name],
            metadata: { operation: "disconnect" },
          })
          yield* mcp.disconnect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          return {
            title: `Disconnected MCP: ${params.name}`,
            metadata: {},
            output: `✅ Disconnected MCP server \`${params.name}\`. All tools from this server are no longer available.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

// ─── mcp_reload ─────────────────────────────────────────────────────

function buildReloadSummary(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const lines: string[] = ["**MCP Reload Summary:**"]
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  for (const key of allKeys) {
    const b = (before as any)[key] as { status: string } | undefined
    const a = (after as any)[key] as { status: string } | undefined
    if (!b && a) lines.push(`- **${key}**: new (\`${a.status}\`)`)
    else if (b && !a) lines.push(`- **${key}**: removed`)
    else if (b && a && b.status !== a.status) lines.push(`- **${key}**: \`${b.status}\` → \`${a.status}\``)
    else if (b && a) lines.push(`- **${key}**: unchanged (\`${a.status}\`)`)
  }
  return lines.join("\n")
}

export const McpReloadTool = Tool.define(
  "mcp_reload",
  Effect.gen(function* () {
    const mcp = yield* MCP.use
    return {
      description: MCP_RELOAD_DESCRIPTION,
      parameters: Schema.Struct({}),
      execute: (_params: Record<string, never>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "mcp",
            patterns: ["*"],
            always: ["*"],
            metadata: { operation: "reload" },
          })
          const before = yield* mcp.status()
          yield* mcp.reload()
          const after = yield* mcp.status()
          const output = buildReloadSummary(before as any, after as any)
          return {
            title: "MCP Reload Complete",
            metadata: { before, after },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
```

### B. Registry Changes (Stub)

In `registry.ts`:

```typescript
// --- Import additions ---
import {
  McpListTool,
  McpConnectTool,
  McpDisconnectTool,
  McpReloadTool,
} from "./mcp"
import { MCP } from "@/mcp"

// --- Init additions (inside Effect.gen function, alongside other Tool.init calls) ---
mcp_list: Tool.init(mcpListTool),
mcp_connect: Tool.init(mcpConnectTool),
mcp_disconnect: Tool.init(mcpDisconnectTool),
mcp_reload: Tool.init(mcpReloadTool),

// --- Builtin array additions ---
tool.mcp_list,
tool.mcp_connect,
tool.mcp_disconnect,
tool.mcp_reload,

// --- Layer dependency addition (in defaultLayer) ---
Layer.provide(MCP.defaultLayer),
```
