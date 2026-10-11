import { expect } from "bun:test"
import { NodeFileSystem } from "@effect/platform-node"
import { APICallError } from "ai"
import { Effect, Layer, Stream } from "effect"
import type { LLMEvent } from "@opencode-ai/llm"
import { LLMClient, RequestExecutor, WebSocketExecutor } from "@opencode-ai/llm/route"
import path from "path"
import type { Agent } from "../../src/agent/agent"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Bus } from "../../src/bus"
import { Config } from "@/config/config"
import { Image } from "@/image/image"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Session } from "@/session/session"
import { LLM, DEFAULT_STREAM_IDLE_TIMEOUT_MS } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { Snapshot } from "../../src/snapshot"
import * as Log from "@opencode-ai/core/util/log"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { SyncEvent } from "@/sync"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Truncate } from "@/tool/truncate"

void Log.init({ print: false })

// H8 — retry non destructif et garde-fous.
//
// 1. A stream that emits content and *then* fails with a retryable error must
//    NOT be reopened from zero: the already-billed text is kept and the turn
//    halts (the stream is opened once, not twice).
// 2. A stream that stalls after its first chunk is bounded by the idle watchdog.
// 3. A retryable error *before* any chunk is still retried (resilience kept).

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const cfg = {
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
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function providerCfg(url: string) {
  return {
    ...cfg,
    provider: {
      ...cfg.provider,
      test: {
        ...cfg.provider.test,
        options: {
          ...cfg.provider.test.options,
          baseURL: url,
        },
      },
    },
  }
}

function agent(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer))
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

function buildEnv(opts: { llm?: Layer.Layer<LLM.Service> } = {}) {
  const deps = Layer.mergeAll(
    Session.defaultLayer,
    Snapshot.defaultLayer,
    AgentSvc.defaultLayer,
    Permission.defaultLayer,
    Plugin.defaultLayer,
    Config.defaultLayer,
    opts.llm ?? LLM.defaultLayer,
    Provider.defaultLayer,
    status,
    SyncEvent.defaultLayer,
    EventV2Bridge.defaultLayer,
  ).pipe(Layer.provideMerge(infra))
  return Layer.mergeAll(
    TestLLMServer.layer,
    SessionProcessor.layer.pipe(
      Layer.provide(summary),
      Layer.provide(Image.defaultLayer),
      Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true, experimentalLeanOutputBudget: true })),
      Layer.provide(Truncate.defaultLayer),
      Layer.provideMerge(deps),
    ),
  )
}

// H8: a fully controlled LLM whose stream already yielded a text-delta and then
// fails with a retryable 5xx. `calls` counts how many times the stream was
// opened — a from-zero retry would open it twice.
let stubCalls = 0
const stubLLM = Layer.succeed(
  LLM.Service,
  LLM.Service.of({
    stream: (): Stream.Stream<LLMEvent, unknown> => {
      stubCalls += 1
      return Stream.concat(
        Stream.make(
          { type: "text-start", providerMetadata: undefined } as unknown as LLMEvent,
          { type: "text-delta", text: "partial" } as unknown as LLMEvent,
        ),
        Stream.fail(
          new APICallError({
            message: "upstream exploded",
            url: "http://localhost/v1/chat/completions",
            requestBodyValues: {},
            statusCode: 500,
            isRetryable: true,
          }),
        ),
      )
    },
  }),
)

// H8: the real LLM layer, but with the idle watchdog wired to `ms`. Its own
// RuntimeFlags is self-provided, so the processor-level override cannot reach
// it — we rebuild the layer with the flag injected.
const llmWithTimeout = (ms: number) =>
  LLM.layer.pipe(
    Layer.provide(RuntimeFlags.layer({ streamTimeoutMs: ms })),
    Layer.provide(Auth.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(
      LLMClient.layer.pipe(Layer.provide(Layer.mergeAll(RequestExecutor.defaultLayer, WebSocketExecutor.layer))),
    ),
  )

const env = buildEnv({})
const guardEnv = buildEnv({ llm: stubLLM })
// A short idle watchdog so the stall case is observable inside a test.
const watchedEnv = buildEnv({ llm: llmWithTimeout(1000) })

const it = testEffect(env)
const itGuard = testEffect(guardEnv)
const itWatched = testEffect(watchedEnv)

const boot = Effect.fn("test.boot")(function* () {
  const processors = yield* SessionProcessor.Service
  const session = yield* Session.Service
  const provider = yield* Provider.Service
  return { processors, session, provider }
})

const user = Effect.fn("TestSession.user")(function* (sessionID: SessionID, text: string) {
  const session = yield* Session.Service
  const msg = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  yield* session.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  })
  return msg
})

const assistant = Effect.fn("TestSession.assistant")(function* (
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
    tokens: {
      total: 0,
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    modelID: ref.modelID,
    providerID: ref.providerID,
    parentID,
    time: { created: Date.now() },
    finish: "end_turn",
  }
  yield* session.updateMessage(msg)
  return msg
})

function chatInput(mdl: LLM.StreamInput["model"], sessionID: SessionID, parent: MessageV2.User, text: string) {
  return {
    user: {
      id: parent.id,
      sessionID,
      role: "user",
      time: parent.time,
      agent: parent.agent,
      model: { providerID: ref.providerID, modelID: ref.modelID },
    } satisfies MessageV2.User,
    sessionID,
    model: mdl,
    agent: agent(),
    system: [],
    messages: [{ role: "user", content: text }],
    tools: {},
  } satisfies LLM.StreamInput
}

itGuard.live("H8: a retryable error after the first chunk does not restart the stream from zero", () =>
  provideTmpdirServer(
    ({ dir }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()
        stubCalls = 0

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "hi")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

        const value = yield* handle.process(chatInput(mdl, chat.id, parent, "hi"))

        const parts = MessageV2.parts(msg.id)
        const text = parts.find((part): part is MessageV2.TextPart => part.type === "text")

        // The stream was opened once only: no restart, no re-billing.
        expect(stubCalls).toBe(1)
        // The text already received is preserved.
        expect(text?.text).toBe("partial")
        // The transient error is surfaced instead of retried.
        expect(value).toBe("stop")
        expect(handle.message.error?.name).toBe("APIError")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

it.live("H8: a retryable error before the first chunk is still retried", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        yield* llm.error(503, { error: "boom" })
        yield* llm.text("after")

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "retry")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

        const value = yield* handle.process(chatInput(mdl, chat.id, parent, "retry"))

        const parts = MessageV2.parts(msg.id)
        // Retried: the second request succeeds and yields text.
        expect(value).toBe("continue")
        expect(yield* llm.calls).toBe(2)
        expect(parts.some((part) => part.type === "text" && part.text === "after")).toBe(true)
        expect(handle.message.error).toBeUndefined()
      }),
    { config: (url) => providerCfg(url) },
  ),
)

itWatched.live("H8: a stream that stalls after its first chunk is bounded by the idle watchdog", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        // Emit a real content chunk, then keep the response open forever: the
        // client receives a chunk and then hears nothing (a stalled provider).
        yield* llm.push(reply().text("partial").hang())

        const chat = yield* session.create({})
        const parent = yield* user(chat.id, "stall")
        const msg = yield* assistant(chat.id, parent.id, path.resolve(dir))
        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({ assistantMessage: msg, sessionID: chat.id, model: mdl })

        const started = Date.now()
        const value = yield* handle.process(chatInput(mdl, chat.id, parent, "stall"))
        const elapsed = Date.now() - started

        // Bounded: the watchdog fires far sooner than the wait would ever resolve.
        expect(elapsed).toBeLessThan(5000)
        expect(value).toBe("stop")
        expect((handle.message.error?.data as { message?: string } | undefined)?.message).toContain("produced no event")
      }),
    { config: (url) => providerCfg(url) },
  ),
)

// Sanity on the default bound: it must be well above a human response window so
// the armed-after-first-event watchdog never cuts a healthy turn.
it.live("H8: the default idle watchdog is bounded and generous", () =>
  Effect.gen(function* () {
    expect(DEFAULT_STREAM_IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000)
  }),
)
