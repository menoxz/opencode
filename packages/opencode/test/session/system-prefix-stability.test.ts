// H3 — the cached system segment must not carry live-by-nature values.
//
// `env.runtime` used to embed `Today's date`, and the assembly used to push the
// live MCP readiness line straight into the cached `system` segment. Two
// successive steps therefore differed by bytes whenever midnight passed or an
// MCP server flipped, which invalidates the provider cache prefix and re-bills
// the whole conversation.
//
// This suite drives the real request body (it.instance + prompt.loop + TestLLMServer
// hits, the same observation point as the existing invariant) and asserts:
//   1. byte identity of the system segment across a readiness flip (the fix);
//   2. no information loss — the date and the MCP line appear exactly once, in
//      the volatile tail, never in the cached segment;
//   3. the segment still moves when an instruction file changes (guard against a
//      patch that would make the cached prefix insensitive to real invalidation).
//
// Run: bun test --timeout 30000 ./test/session/system-prefix-stability.test.ts

import { NodeFileSystem } from "@effect/platform-node"
import { FetchHttpClient } from "effect/unstable/http"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import os from "os"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Bus } from "../../src/bus"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "@/provider/provider"
import { Env } from "../../src/env"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"
import { Question } from "../../src/question"
import { Todo } from "../../src/session/todo"
import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionSummary } from "../../src/session/summary"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { empty as emptyGuard } from "../fixture/guard"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { SessionTitle } from "../../src/session/title"
import { SessionStatus } from "../../src/session/status"
import { Skill } from "../../src/skill"
import { SystemPrompt } from "../../src/session/system"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { Service as ToolCacheService } from "@/tool/cache"
import { Service as SearchIndexService } from "@/tool/search-index"
import { Truncate } from "../../src/tool/truncate"
import * as Log from "@opencode-ai/core/util/log"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "../../src/file/ripgrep"
import { Format } from "../../src/format"
import { Reference } from "../../src/reference/reference"
import { RepositoryCache } from "../../src/reference/repository-cache"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { SyncEvent } from "@/sync"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionID } from "../../src/session/schema"

void Log.init({ print: !!process.env.TEST_LOG })

// One DB per test file: the SQLite client is a process singleton, so the DB must
// live in a directory that is not removed while the file runs.
process.env.OPENCODE_DB = path.join(os.tmpdir(), `opencode-system-prefix-${process.pid}.db`)

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

// Live MCP readiness, driven by the test. `undefined` reads as all-ok.
let readiness: Record<string, boolean> | undefined = undefined

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
    startAuth: () => Effect.die("unexpected MCP auth in system-prefix tests"),
    authenticate: () => Effect.die("unexpected MCP auth in system-prefix tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in system-prefix tests"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
    reload: () => Effect.succeed({}),
    readiness: () => Effect.succeed(readiness ?? {}),
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

const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer))
const run = SessionRunState.layer.pipe(Layer.provide(status))
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

function makePrompt() {
  const runtimeFlags = { experimentalEventSystem: true }
  const deps = Layer.mergeAll(
    Session.defaultLayer,
    Snapshot.defaultLayer,
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
    FetchHttpClient.layer,
    // `SessionPrompt.layer` capture `Guard.Service` à sa construction (`prompt.ts:367`).
    emptyGuard,
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
    Layer.provide(RuntimeFlags.layer(runtimeFlags)),
    Layer.provideMerge(todo),
    Layer.provideMerge(question),
    Layer.provideMerge(deps),
  )
  const trunc = Truncate.layer.pipe(Layer.provideMerge(deps))
  const proc = SessionProcessor.layer.pipe(
    Layer.provide(summary),
    Layer.provide(Image.defaultLayer),
    Layer.provide(RuntimeFlags.layer(runtimeFlags)),
    Layer.provideMerge(deps),
  )
  const compact = SessionCompaction.layer.pipe(
    Layer.provide(RuntimeFlags.layer(runtimeFlags)),
    Layer.provideMerge(proc),
    Layer.provideMerge(deps),
  )
  const title = SessionTitle.layer.pipe(Layer.provideMerge(deps))
  return SessionPrompt.layer.pipe(
    Layer.provide(SessionRevert.defaultLayer),
    Layer.provideMerge(title),
    Layer.provide(Image.defaultLayer),
    Layer.provide(Reference.defaultLayer),
    Layer.provide(summary),
    Layer.provideMerge(run),
    Layer.provideMerge(compact),
    Layer.provideMerge(proc),
    Layer.provideMerge(registry),
    Layer.provideMerge(trunc),
    Layer.provide(Instruction.defaultLayer),
    Layer.provide(SystemPrompt.defaultLayer),
    Layer.provide(RuntimeFlags.layer(runtimeFlags)),
    Layer.provideMerge(deps),
    Layer.provide(summary),
  )
}

const it = testEffect(
  Layer.mergeAll(TestLLMServer.layer, makePrompt()) as unknown as Layer.Layer<never, never>,
)

// Config that registers a custom "test" provider with a "test-model" model.
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
      options: { apiKey: "test-key", baseURL: "http://localhost:1/v1" },
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
        options: { ...cfg.provider.test.options, baseURL: url },
      },
    },
  }
}

const writeText = Effect.fn("test.writeText")(function* (file: string, text: string) {
  const fs = yield* AppFileSystem.Service
  yield* fs.writeWithDirs(file, text)
})

const writeConfig = Effect.fn("test.writeConfig")(function* (dir: string, config: Partial<Config.Info>) {
  yield* writeText(
    path.join(dir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", ...config }),
  )
})

/** The cached system segment exactly as the provider receives it, joined to a string. */
function systemOf(body: Record<string, unknown>): string {
  const messages = (body.messages ?? []) as Array<{ role?: string; content?: unknown }>
  return messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content))
    .join("\n")
}

/** Every message (system + conversation + injected tail) as one searchable string. */
function allOf(body: Record<string, unknown>): string {
  const messages = (body.messages ?? []) as Array<{ role?: string; content?: unknown }>
  return messages.map((message) => String(message.content)).join("\n")
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/** Run one full turn on an existing session and return the system segment it sent. */
function capture(sessionID: SessionID, text: string) {
  return Effect.gen(function* () {
    const prompt = yield* SessionPrompt.Service
    const llm = yield* TestLLMServer
    yield* prompt.prompt({
      sessionID,
      agent: "build",
      noReply: true,
      parts: [{ type: "text", text }],
    })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID })
    const hits = yield* llm.hits
    const body = hits.at(-1)!.body as Record<string, unknown>
    return { system: systemOf(body), all: allOf(body) }
  })
}

it.instance(
  "keeps the cached system segment byte-identical across a readiness flip",
  () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      const llm = yield* TestLLMServer
      yield* writeConfig(dir, providerCfg(llm.url))
      const sessions = yield* Session.Service
      const session = yield* sessions.create({
        title: "System prefix",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })

      // Turn A: every MCP server is healthy, so the date is the only volatile value.
      readiness = {}
      const a = yield* capture(session.id, "list the text files")
      // Turn B: a server flips to unhealthy — the live readiness line appears.
      readiness = { memory: false }
      const b = yield* capture(session.id, "list the text files")

      // Positive control: the cached segment is real, not an empty string.
      expect(a.system.length).toBeGreaterThan(1000)

      // §7.1 — strict byte equality, not a threshold.
      expect(Buffer.compare(Buffer.from(a.system, "utf8"), Buffer.from(b.system, "utf8"))).toBe(0)

      // §7.2 — no loss: the MCP line is emitted exactly once, and never inside the
      // cached segment (it rides the volatile tail appended after the history).
      expect(countOccurrences(a.all, "<unavailable_tools>")).toBe(0)
      expect(countOccurrences(b.all, "<unavailable_tools>")).toBe(1)
      expect(b.system).not.toContain("<unavailable_tools>")
      expect(a.system).not.toContain("<unavailable_tools>")

      // The day stamp is present exactly once and outside the cached segment.
      expect(countOccurrences(b.all, "Today's date")).toBe(1)
      expect(b.system).not.toContain("Today's date")
      expect(a.system).not.toContain("Today's date")

      readiness = undefined
    }),
  30_000,
)

it.instance(
  "still moves the system segment when an instruction file changes",
  () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      const llm = yield* TestLLMServer
      yield* writeConfig(dir, {
        ...providerCfg(llm.url),
        instruction_injection: { agents: "full", skills: "summary" },
      })
      const sessions = yield* Session.Service
      const session = yield* sessions.create({
        title: "Instruction invalidation",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })

      yield* writeText(path.join(dir, "AGENTS.md"), "# Project\nRule alpha\n")
      readiness = {}
      const a = yield* capture(session.id, "hello")

      // Same size cannot mask the change: the second body is deliberately longer.
      yield* writeText(path.join(dir, "AGENTS.md"), "# Project\nRule beta, a deliberately longer rule\n")
      const b = yield* capture(session.id, "hello")

      expect(a.system).toContain("Rule alpha")
      expect(b.system).toContain("Rule beta")
      // §7.3 — the guard is not too wide: instruction content still invalidates.
      expect(Buffer.compare(Buffer.from(a.system, "utf8"), Buffer.from(b.system, "utf8"))).not.toBe(0)

      readiness = undefined
    }),
  30_000,
)
