/**
 * H4 — one git capture per step (not two).
 *
 * Before H4 a step paid two `git write-tree` captures: a pre-call capture in
 * `processor.create` and another at `step-finish`. A turn of N steps therefore
 * paid 2N captures. The fix reuses the previous step's end-of-step hash (carried
 * across steps by a mutable carrier owned by `prompt.ts`), so a step pays one
 * capture and a turn of N steps pays at most N+1.
 *
 * The counter instruments `Snapshot.track()` — the only path that runs
 * `git write-tree`. `snapshot.patch()` (`git diff --cached`) is deliberately NOT
 * counted: H4 keeps it (`H4.md` §7.1).
 */
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import path from "path"
import { NodeFileSystem } from "@effect/platform-node"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Git } from "../../src/git"
import { Bus } from "../../src/bus"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "@/provider/provider"
import { ProviderID, ModelID } from "../../src/provider/schema"
import { Env } from "../../src/env"
import { Question } from "../../src/question"
import { Image } from "../../src/image/image"
import { Skill } from "../../src/skill"
import { SystemPrompt } from "../../src/session/system"
import { Todo } from "../../src/session/todo"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionTitle } from "../../src/session/title"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { Service as ToolCacheService } from "../../src/tool/cache"
import { Service as SearchIndexService } from "../../src/tool/search-index"
import { Truncate } from "@/tool/truncate"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "../../src/file/ripgrep"
import { Format } from "../../src/format"
import { Reference } from "../../src/reference/reference"
import { RepositoryCache } from "../../src/reference/repository-cache"
import { SyncEvent } from "@/sync"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionSummary } from "../../src/session/summary"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import * as Log from "@opencode-ai/core/util/log"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

void Log.init({ print: false })

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.succeed({ status: { status: "connected" as const }, toolCount: 0 }),
    disconnect: () => Effect.succeed({ status: { status: "disabled" as const }, toolCount: 0 }),
    restart: () => Effect.succeed({ status: { status: "disabled" as const }, toolCount: 0 }),
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth"),
    authenticate: () => Effect.die("unexpected MCP auth"),
    finishAuth: () => Effect.die("unexpected MCP auth"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
    reload: () => Effect.succeed({}),
  }),
)

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

// Capture counter. `track` is the only caller of `git write-tree`.
const captured = { track: 0 }

const countingSnapshot = Layer.effect(
  Snapshot.Service,
  Effect.gen(function* () {
    const real = yield* Snapshot.Service
    return Snapshot.Service.of({
      init: real.init,
      cleanup: real.cleanup,
      track: Effect.fn("TestSnapshot.track")(function* () {
        captured.track += 1
        return yield* real.track()
      }),
      patch: real.patch,
      restore: real.restore,
      revert: real.revert,
      diff: real.diff,
      diffFull: real.diffFull,
    })
  }),
).pipe(Layer.provide(Snapshot.defaultLayer))

const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer))
const run = SessionRunState.layer.pipe(Layer.provide(status))
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer, FetchHttpClient.layer)

const ref = { providerID: ProviderID.make("test"), modelID: ModelID.make("test-model") }

function makeHttp() {
  const deps = Layer.mergeAll(
    Session.defaultLayer,
    countingSnapshot,
    LLM.defaultLayer,
    Env.defaultLayer,
    AgentSvc.defaultLayer,
    Command.defaultLayer,
    Permission.defaultLayer,
    Plugin.defaultLayer,
    Config.defaultLayer,
    ProviderSvc.defaultLayer,
    lsp,
    mcp,
    AppFileSystem.defaultLayer,
    BackgroundJob.defaultLayer,
    status,
    SyncEvent.defaultLayer,
    EventV2Bridge.defaultLayer,
    ToolCacheService.defaultLayer,
  ).pipe(Layer.provideMerge(infra))
  const question = Question.layer.pipe(Layer.provideMerge(deps))
  const todo = Todo.layer.pipe(Layer.provideMerge(deps))
  const registry = ToolRegistry.layer.pipe(
    Layer.provide(Skill.defaultLayer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
    Layer.provide(RepositoryCache.defaultLayer),
    Layer.provide(Git.defaultLayer),
    Layer.provide(Reference.defaultLayer),
    Layer.provide(Ripgrep.defaultLayer),
    Layer.provide(SearchIndexService.defaultLayer),
    Layer.provide(Format.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(todo),
    Layer.provideMerge(question),
    Layer.provideMerge(deps),
  )
  const trunc = Truncate.layer.pipe(Layer.provideMerge(deps))
  const proc = SessionProcessor.layer.pipe(
    Layer.provide(SessionSummary.defaultLayer),
    Layer.provide(Image.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(deps),
  )
  const compact = SessionCompaction.layer.pipe(
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(proc),
    Layer.provideMerge(deps),
  )
  const title = SessionTitle.layer.pipe(Layer.provideMerge(deps))
  return Layer.mergeAll(
    TestLLMServer.layer,
    SessionSummary.defaultLayer,
    Layer.merge(proc, title),
    SessionPrompt.layer.pipe(
      Layer.provide(SessionRevert.defaultLayer),
      Layer.provide(Image.defaultLayer),
      Layer.provide(Reference.defaultLayer),
      Layer.provide(SessionSummary.defaultLayer),
      Layer.provideMerge(run),
      Layer.provideMerge(compact),
      Layer.provideMerge(title),
      Layer.provideMerge(proc),
      Layer.provideMerge(registry),
      Layer.provideMerge(trunc),
      Layer.provide(Instruction.defaultLayer),
      Layer.provide(SystemPrompt.defaultLayer),
      Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
      Layer.provideMerge(deps),
    ),
  )
}

const it = testEffect(makeHttp() as unknown as Layer.Layer<never, any>)

const providerCfg = (url: string) => ({
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: { apiKey: "test-key", baseURL: url },
    },
  },
})

// ---------------------------------------------------------------------------
// §8 case 1 — capture counter on an N-step turn
// ---------------------------------------------------------------------------

it.live("a 3-step turn pays at most N+1 git captures", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir, llm }) {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      captured.track = 0

      const session = yield* sessions.create({
        title: "h4 captures",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })

      // Three mutating steps (one bash write each) then a final text step.
      yield* llm.tool("bash", { command: `echo one > ${path.join(dir, "h4-1.txt")}`, description: "w1" })
      yield* llm.tool("bash", { command: `echo two > ${path.join(dir, "h4-2.txt")}`, description: "w2" })
      yield* llm.tool("bash", { command: `echo three > ${path.join(dir, "h4-3.txt")}`, description: "w3" })
      yield* llm.text("done")

      yield* prompt.prompt({
        sessionID: session.id,
        agent: "build",
        noReply: true,
        parts: [{ type: "text", text: "do three writes" }],
      })

      const result = yield* prompt.loop({ sessionID: session.id })
      expect(result.info.role).toBe("assistant")

      const msgs = yield* MessageV2.filterCompactedEffect(session.id)
      const steps = msgs.flatMap((m) => m.parts).filter((p) => p.type === "step-finish").length
      const patches = msgs.flatMap((m) => m.parts).filter((p) => p.type === "patch").length

      // 3 mutating tool steps + 1 final text step.
      expect(steps).toBe(4)
      // §7.1 acceptance: captures (write-tree) <= N+1; baseline was 2N.
      expect(captured.track).toBeLessThanOrEqual(steps + 1)
      // The fix's exact behaviour: N+1 captures — step 1 pays a pre-capture plus
      // its finish capture; every later step reuses the previous finish hash and
      // pays only its own finish capture. Strictly better than the 2N baseline.
      expect(captured.track).toBe(steps + 1)
      // `patch()` is kept and untouched (one per step).
      expect(patches).toBeGreaterThanOrEqual(1)
    }),
    { git: true, config: providerCfg },
  ),
)

// ---------------------------------------------------------------------------
// §8 case 3 — mutation guard: reuse is what saves the spawn, not an
// under-counting counter. With a carrier hash, `create` captures nothing; without
// one, it captures once per step (the pre-H4 behaviour).
// ---------------------------------------------------------------------------

it.live("carrier hash is reused instead of recaptured", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir }) {
      const processors = yield* SessionProcessor.Service
      const session = yield* Session.Service
      const provider = yield* ProviderSvc.Service
      const chat = yield* session.create({})
      const parent = yield* yieldUser(chat.id)
      const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
      const root = path.resolve(dir)

      captured.track = 0
      const carried: { snapshot?: string } = { snapshot: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }
      yield* processors.create({
        assistantMessage: yield* yieldAssistant(chat.id, parent, root),
        sessionID: chat.id,
        model: mdl,
        carrier: carried,
      })
      expect(captured.track).toBe(0)

      yield* processors.create({
        assistantMessage: yield* yieldAssistant(chat.id, parent, root),
        sessionID: chat.id,
        model: mdl,
      })
      expect(captured.track).toBe(1)
    }),
    { git: true, config: providerCfg },
  ),
)

const yieldUser = Effect.fn("TestSession.user")(function* (sessionID: SessionID) {
  const session = yield* Session.Service
  const msg = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user" as const,
    sessionID,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text" as const,
    text: "hi",
  })
  return msg.id
})

const yieldAssistant = Effect.fn("TestSession.assistant")(function* (
  sessionID: SessionID,
  parentID: MessageID,
  root: string,
) {
  const session = yield* Session.Service
  const msg: MessageV2.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "build",
    agent: "build",
    path: { cwd: root, root },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  }
  yield* session.updateMessage(msg)
  return msg
})
