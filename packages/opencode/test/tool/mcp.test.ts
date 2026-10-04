import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect } from "bun:test"
import { Agent } from "@/agent/agent"
import { MCP } from "@/mcp"
import { MessageID, SessionID } from "@/session/schema"
import { McpConnectTool, McpDisconnectTool, McpReloadTool } from "@/tool/mcp"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"

const calls: string[] = []
let connectStatus: MCP.Status = { status: "connected" }
const layer = Layer.mergeAll(
  Layer.mock(MCP.Service, {
    status: () => Effect.succeed({ "memory-server": { status: "disabled" } }),
    connect: (name) => {
      calls.push(`connect:${name}`)
      return Effect.succeed({ status: connectStatus, toolCount: connectStatus.status === "connected" ? 20 : 0 })
    },
    disconnect: (name) => {
      calls.push(`disconnect:${name}`)
      return Effect.succeed({ status: { status: "disabled" }, toolCount: 0 })
    },
    reload: (options) => {
      calls.push(`reload:${options?.reconnect === true}`)
      return Effect.succeed({ "memory-server": { status: { status: "connected" }, toolCount: 20 } })
    },
  }),
  Layer.mock(Truncate.Service, { output: (content) => Effect.succeed({ content, truncated: false }) }),
  Layer.mock(Agent.Service, {
    get: () => Effect.succeed({ name: "build", mode: "primary", permission: [], options: {} }),
  }),
)
const it = testEffect(layer)
const context = {
  sessionID: SessionID.make("ses_mcp_control"),
  messageID: MessageID.make("msg_mcp_control"),
  agent: "build",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
} satisfies Tool.Context

describe("MCP control tools", () => {
  it.effect("connect and disconnect report the observed lifecycle result", () =>
    Effect.gen(function* () {
      calls.length = 0
      connectStatus = { status: "connected" }
      const connect = yield* Tool.init(yield* McpConnectTool)
      const disconnect = yield* Tool.init(yield* McpDisconnectTool)
      const connected = yield* connect.execute({ name: "memory-server" }, context)
      const disconnected = yield* disconnect.execute({ name: "memory-server" }, context)
      expect(calls).toEqual(["connect:memory-server", "disconnect:memory-server"])
      expect(connected.metadata).toMatchObject({ status: { status: "connected" }, toolCount: 20 })
      expect(connected.output).toContain("exposed 20 tool(s)")
      expect(disconnected.metadata).toMatchObject({ status: { status: "disabled" }, toolCount: 0 })
    }),
  )

  it.effect("reload forces reconnection and reports rediscovered tools", () =>
    Effect.gen(function* () {
      calls.length = 0
      const reload = yield* Tool.init(yield* McpReloadTool)
      const result = yield* reload.execute({}, context)
      expect(calls).toEqual(["reload:true"])
      expect(result.metadata.servers["memory-server"]?.toolCount).toBe(20)
      expect(result.output).toContain("reconnected (`connected`, 20 tool(s))")
    }),
  )

  it.effect("connect fails instead of claiming success for a failed transport", () =>
    Effect.gen(function* () {
      connectStatus = { status: "failed", error: "Connection refused" }
      const connect = yield* Tool.init(yield* McpConnectTool)
      const exit = yield* connect.execute({ name: "memory-server" }, context).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toHaveProperty("message", expect.stringContaining("Connection refused"))
    }),
  )
})
