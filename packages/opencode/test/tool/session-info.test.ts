import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { Session } from "../../src/session/session"
import { MessageID, SessionID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionInfoTool } from "../../src/tool/session-info"
import { Service as ToolCacheService } from "../../src/tool/cache"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    AppFileSystem.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    Config.defaultLayer,
    Provider.defaultLayer,
    Session.defaultLayer,
    Truncate.defaultLayer,
    ToolCacheService.defaultLayer,
  ),
)

const ctx = {
  sessionID: SessionID.make("ses_unset"),
  messageID: MessageID.make("msg_unset"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

// The audited session ran on this model through the gateway, which answers
// `context_length: 1000000`, with a global config of `threshold: 0.6` and
// `absolute_trigger: 160000`. The tool must report that same pivot.
const config: Partial<Config.Info> = {
  compaction: { auto: true, prune: true, threshold: 0.6, absolute_trigger: 160_000 },
  provider: {
    "command-code": {
      name: "Command Code",
      id: "command-code",
      env: [],
      npm: "@ai-sdk/anthropic",
      models: {
        "deepseek-v4.1-flash": {
          id: "deepseek-v4.1-flash",
          name: "DeepSeek V4.1 Flash",
          attachment: false,
          reasoning: false,
          temperature: true,
          tool_call: true,
          release_date: "2026-01-01",
          limit: { context: 1_000_000, output: 32_768 },
          cost: { input: 0.15, output: 0.6 },
          options: {},
        },
      },
      options: { apiKey: "test-key", baseURL: "https://api.commandcode.ai/provider/v1" },
    },
  },
}

describe("session_info limits", () => {
  it.instance(
    "observes the compaction pivot of the configured model",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({
          model: { providerID: ProviderID.make("command-code"), id: ModelID.make("deepseek-v4.1-flash") },
        })
        const tool = yield* (yield* SessionInfoTool).init()
        const result = yield* tool.execute({ sessionID: session.id }, { ...ctx, sessionID: session.id })
        const output = JSON.parse(result.output)
        expect(output.model).toMatchObject({ id: "deepseek-v4.1-flash", providerID: "command-code" })
        expect(output.limits).toMatchObject({
          context: 1_000_000,
          maxOutput: 32_000,
          reserved: 20_000,
          usable: 968_000,
          trigger: 160_000,
        })
      }),
    { config },
  )

  it.instance(
    "omits the limits when no model resolves",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create()
        const tool = yield* (yield* SessionInfoTool).init()
        const result = yield* tool.execute({ sessionID: session.id }, { ...ctx, sessionID: session.id })
        expect(JSON.parse(result.output).limits).toBeUndefined()
      }),
    { config },
  )
})
