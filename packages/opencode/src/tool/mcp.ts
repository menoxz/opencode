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
    const mcp = yield* MCP.Service
    return {
      description: MCP_LIST_DESCRIPTION,
      parameters: Schema.Struct({}),
      execute: (_params: Record<string, never>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const statusMap = yield* mcp.status()
          const lines = Object.entries(statusMap).map(([name, st]) => {
            const base = `- **${name}**: \`${st.status}\``
            if ("error" in st) {
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
    const mcp = yield* MCP.Service
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
          const result = yield* mcp.connect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          if (result.status.status !== "connected") {
            const detail = "error" in result.status ? `: ${result.status.error}` : ""
            return yield* Effect.fail(new Error(`MCP server "${params.name}" is ${result.status.status}${detail}`))
          }
          return {
            title: `Connected MCP: ${params.name}`,
            metadata: result,
            output: `✅ Connected to MCP server \`${params.name}\` and exposed ${result.toolCount} tool(s).`,
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
    const mcp = yield* MCP.Service
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
          const result = yield* mcp.disconnect(params.name).pipe(
            Effect.catchTag("MCP.NotFoundError", () =>
              Effect.fail(new Error(`MCP server "${params.name}" not found in configuration`))),
          )
          return {
            title: `Disconnected MCP: ${params.name}`,
            metadata: result,
            output: `✅ Disconnected MCP server \`${params.name}\`. All tools from this server are no longer available.`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)

// ─── mcp_reload ─────────────────────────────────────────────────────

function buildReloadSummary(
  before: Record<string, { status: string; error?: string }>,
  results: Record<string, MCP.LifecycleResult>,
): string {
  const lines: string[] = ["**MCP Reload Summary:**"]
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(results)])]
  for (const key of allKeys) {
    const b = before[key]
    const a = results[key]?.status
    if (!b && a) lines.push(`- **${key}**: new (\`${a.status}\`)`)
    else if (b && !a) lines.push(`- **${key}**: removed`)
    else if (b && a)
      lines.push(
        `- **${key}**: reconnected (\`${a.status}\`, ${results[key].toolCount} tool(s))${"error" in a ? ` — ${a.error}` : ""}`,
      )
  }
  return lines.join("\n")
}

export const McpReloadTool = Tool.define(
  "mcp_reload",
  Effect.gen(function* () {
    const mcp = yield* MCP.Service
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
          const servers = yield* mcp.reload({ reconnect: true })
          const after = yield* mcp.status()
          const output = buildReloadSummary(before, servers)
          return {
            title: "MCP Reload Complete",
            metadata: { before, after, servers },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
