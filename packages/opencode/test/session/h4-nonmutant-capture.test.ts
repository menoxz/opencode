/**
 * H4 — non-regression guard for the real-session contradiction.
 *
 * Diagnosed 2026-10-11: `step-finish` cleared `ctx.snapshot` (`processor.ts:787`)
 * while the `step-start` handler only checked `ctx.snapshot` (`:706`) and never
 * the carrier. Since H1 chains a whole turn into a single `processor.create`,
 * every step >= 2 paid a fresh `git write-tree` on an identical tree: 2N captures
 * per turn instead of N+1. A real headless session observed 6 captures for a
 * 3-step turn, reproducing the defect.
 *
 * The fix makes `step-start` consult `input.carrier?.snapshot` before capturing.
 * These cases now assert the N+1 ceiling; the diagnostics stay for future triage.
 * `step-git-spawn.test.ts` guards the same property and did catch the regression
 * once re-run — it simply was not re-run after H1 landed.
 *
 * This file reuses the exact harness of the passing test, but:
 *   - the tools are NON-MUTANT (`read` on a seeded file), so the worktree is
 *     untouched between steps (hypothesis 3);
 *   - the counter records the CALLER LINE of every `track()` (stack frame under
 *     `session/processor`), so the budget is attributed to `processor.ts:161`,
 *     `:706` or `:734` instead of being an anonymous total;
 *   - `llm.calls` records the provider-invocation count, so a per-step `create`
 *     (hypothesis 1) or a second `loop` (hypothesis 4) is visible.
 *
 * No files under `src/` are touched. Diagnostic only.
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
// `byCaller` attributes each call to its frame under `session/processor`.
const captured = { track: 0, byCaller: {} as Record<string, number>, hashes: [] as (string | undefined)[] }

const callerOf = () => {
  const stack = new Error().stack ?? ""
  for (const raw of stack.split("\n")) {
    const line = raw.trim()
    if (line.includes("session/processor") || line.includes("session\\processor")) return line
  }
  return "unknown"
}

const countingSnapshot = Layer.effect(
  Snapshot.Service,
  Effect.gen(function* () {
    const real = yield* Snapshot.Service
    return Snapshot.Service.of({
      init: real.init,
      cleanup: real.cleanup,
      track: Effect.fn("TestSnapshot.track")(function* () {
        captured.track += 1
        const caller = callerOf()
        captured.byCaller[caller] = (captured.byCaller[caller] ?? 0) + 1
        const hash = yield* real.track()
        captured.hashes.push(hash)
        return hash
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

// Spy on `SessionProcessor.create`: record the carrier state observed at each
// step entry, so we can tell whether `processor.ts:161`
// (`input.carrier?.snapshot ?? trackSnapshot`) short-circuits.
const creates: { hasCarrier: boolean; snapshotBefore?: string; carrierRef?: object }[] = []

const spyWrap = (base: Layer.Layer<SessionProcessor.Service, any, any>) =>
  Layer.effect(
    SessionProcessor.Service,
    Effect.gen(function* () {
      const real = yield* SessionProcessor.Service
      return SessionProcessor.Service.of({
        create: (input: any) =>
          Effect.gen(function* () {
            creates.push({
              hasCarrier: !!input?.carrier,
              snapshotBefore: input?.carrier?.snapshot,
              carrierRef: input?.carrier,
            })
            return yield* real.create(input)
          }),
      })
    }),
  ).pipe(Layer.provide(base))

function makeHttp(wrapProc: (p: Layer.Layer<SessionProcessor.Service, any, any>) => Layer.Layer<SessionProcessor.Service, any, any> = (p) => p) {
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
  const baseProc = SessionProcessor.layer.pipe(
    Layer.provide(SessionSummary.defaultLayer),
    Layer.provide(Image.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(deps),
  )
  const proc = wrapProc(baseProc)
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
const itSpy = testEffect(makeHttp(spyWrap) as unknown as Layer.Layer<never, any>)

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

const reset = () => {
  captured.track = 0
  captured.byCaller = {}
  captured.hashes = []
}

const report = (label: string, steps: number, calls: number) => {
  const lines = Object.entries(captured.byCaller)
    .map(([caller, n]) => `${n}x ${caller}`)
    .join(" | ")
  console.log(
    `H4-DIAG[${label}] steps=${steps} track=${captured.track} calls=${calls} ` +
      `distinctHashes=${new Set(captured.hashes).size} byCaller=${lines}`,
  )
}

// ---------------------------------------------------------------------------
// Case A — non-mutant tools (read only). Hypothesis 3: does a read-only step
// differ from a mutating step in capture count?
// ---------------------------------------------------------------------------

it.live("H4-A non-mutant 3-step turn", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir, llm }) {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service

      yield* Effect.promise(() => Bun.write(path.join(dir, "seed.txt"), "a\nb\nc\n"))

      const session = yield* sessions.create({
        title: "h4 non mutant",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })

      reset()
      const file = path.join(dir, "seed.txt")
      // Three read-only steps: `read` never touches the worktree.
      yield* llm.tool("read", { filePath: file })
      yield* llm.tool("read", { filePath: file })
      yield* llm.tool("read", { filePath: file })
      yield* llm.text("done")

      yield* prompt.prompt({
        sessionID: session.id,
        agent: "build",
        noReply: true,
        parts: [{ type: "text", text: "read the file three times" }],
      })
      const result = yield* prompt.loop({ sessionID: session.id })
      expect(result.info.role).toBe("assistant")

      const msgs = yield* MessageV2.filterCompactedEffect(session.id)
      const steps = msgs.flatMap((m) => m.parts).filter((p) => p.type === "step-finish").length
      const calls = yield* llm.calls
      report("A", steps, calls)
      expect(steps).toBe(4)
      // H4 acceptance (post-fix): captures <= N+1. Pre-fix this harness measured 2N.
      expect(captured.track).toBeLessThanOrEqual(steps + 1)
    }),
    { git: true, config: providerCfg },
  ),
)

// ---------------------------------------------------------------------------
// Case B — the original mutating 3-step control, same harness, for comparison.
// ---------------------------------------------------------------------------

it.live("H4-B mutant 3-step turn (control)", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir, llm }) {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service

      const session = yield* sessions.create({
        title: "h4 mutant control",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })

      reset()
      yield* llm.tool("bash", { command: `echo one > ${path.join(dir, "h4b-1.txt")}`, description: "w1" })
      yield* llm.tool("bash", { command: `echo two > ${path.join(dir, "h4b-2.txt")}`, description: "w2" })
      yield* llm.tool("bash", { command: `echo three > ${path.join(dir, "h4b-3.txt")}`, description: "w3" })
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
      const calls = yield* llm.calls
      report("B", steps, calls)
      expect(steps).toBe(4)
      // H4 acceptance (post-fix): captures <= N+1. Pre-fix this harness measured 2N.
      expect(captured.track).toBeLessThanOrEqual(steps + 1)
    }),
    { git: true, config: providerCfg },
  ),
)

itSpy.live("H4-D instrumented create carrier", () =>
  provideTmpdirServer(
    Effect.fnUntraced(function* ({ dir, llm }) {
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      yield* Effect.promise(() => Bun.write(path.join(dir, "seed.txt"), "a\nb\nc\n"))
      const session = yield* sessions.create({
        title: "h4 D",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })
      reset()
      creates.length = 0
      const file = path.join(dir, "seed.txt")
      yield* llm.tool("read", { filePath: file })
      yield* llm.tool("read", { filePath: file })
      yield* llm.tool("read", { filePath: file })
      yield* llm.text("done")
      yield* prompt.prompt({
        sessionID: session.id,
        agent: "build",
        noReply: true,
        parts: [{ type: "text", text: "read the file three times" }],
      })
      yield* prompt.loop({ sessionID: session.id })
      const msgs = yield* MessageV2.filterCompactedEffect(session.id)
      const steps = msgs.flatMap((m) => m.parts).filter((p) => p.type === "step-finish").length
      const refs = new Map<object, number>()
      const detail = creates
        .map((c, i) => {
          let ref = "none"
          if (c.carrierRef) {
            if (!refs.has(c.carrierRef)) refs.set(c.carrierRef, refs.size)
            ref = String(refs.get(c.carrierRef))
          }
          return `#${i}{hasCarrier=${c.hasCarrier},snap=${c.snapshotBefore ?? "undef"},ref=${ref}}`
        })
        .join(" ")
      console.log(
        `H4-DIAG[D] steps=${steps} track=${captured.track} calls=${yield* llm.calls} creates=${creates.length} ${detail}`,
      )
      expect(steps).toBe(4)
      // H4 acceptance (post-fix): captures <= N+1. Pre-fix this harness measured 2N.
      expect(captured.track).toBeLessThanOrEqual(steps + 1)
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

void yieldUser
