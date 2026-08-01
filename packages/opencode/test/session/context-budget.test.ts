// Context budget instrumentation.
//
// Measures the size of every data entry point into the agent context exactly
// as the running app builds it: PROMPT_CORE, environment block, instructions
// (AGENTS.md), skills list, task contract, goal reminder, step-1 guidance
// (adaptive prompt / personality / daemon) and the resolved tool payload.
//
// The LLM request captured by TestLLMServer is the final, provider-shaped
// payload (`prepare()` in session/llm/request.ts), so the numbers here are
// the real bytes a model sees, not an estimate of intermediate buffers.
//
// Two scenarios:
//   - bare:   no AGENTS.md, no skills — measures the fixed base context.
//   - loaded: user-like config (instruction_injection agents=full, skills=full),
//             an AGENTS.md in the instance and 35 installed skills — measures
//             the variable context every turn in a typical rich install.
//
// Budgets are intentionally loose (safety net, not a floor) so the suite
// stays green on any platform while still catching a doubling of any section.

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
import { Truncate } from "@/tool/truncate"
import * as Log from "@opencode-ai/core/util/log"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "../../src/file/ripgrep"
import { Format } from "../../src/format"
import { Reference } from "../../src/reference/reference"
import { RepositoryCache } from "../../src/reference/repository-cache"
import { Global } from "@opencode-ai/core/global"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { SyncEvent } from "@/sync"
import { EventV2Bridge } from "@/event-v2-bridge"

void Log.init({ print: !!process.env.TEST_LOG })

// One DB per test file: the SQLite client is a process singleton, so the DB
// must live in a directory that is not removed while the file runs.
process.env.OPENCODE_DB = path.join(os.tmpdir(), `opencode-context-budget-${process.pid}.db`)

const ref = { providerID: "test" as const, modelID: "test-model" as const }

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth in context-budget tests"),
    authenticate: () => Effect.die("unexpected MCP auth in context-budget tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in context-budget tests"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
    reload: () => Effect.void,
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
    Layer.provide(summary),
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
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
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

const writeSkill = Effect.fn("test.writeSkill")(function* (dir: string, name: string, description: string) {
  yield* writeText(
    path.join(dir, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody of the ${name} skill.\n`,
  )
})

type RequestHit = { body: Record<string, unknown> }

/** Split the joined system prompt into its known sections by marker. */
function analyzeSystem(system: string) {
  const sections: Array<[string, string]> = []
  const markers: Array<[string, RegExp]> = [
    ["core", /<opencode_agent_prompt[\s\S]*?<\/opencode_agent_prompt>/],
    ["env", /You are powered by the model named[\s\S]*?<\/env>/],
    ["shellAndTasks", /<shell-and-tasks>[\s\S]*?<\/shell-and-tasks>/],
    ["skillsIntro", /Skills provide specialized instructions[\s\S]*?its description\./],
    ["skillsList", /(?:## Available Skills|<available_skills>)[\s\S]*?(?=\n(?:<|Instructions from:|\w)|$)/],
    ["taskContract", /<task-contract[\s\S]*?(?=<goal_reminder|<task_context|$)/],
    ["goalReminder", /<goal_reminder>[\s\S]*?<\/goal_reminder>/],
    ["toolAvailability", /<tool_availability[\s\S]*?<\/tool_availability>/],
    ["taskContext", /<task_context[\s\S]*?<\/task_context>/],
    ["personality", /<personality_context[\s\S]*?<\/personality_context>/],
  ]
  let rest = system
  for (const [name, re] of markers) {
    const match = rest.match(re)
    if (!match || match.index === undefined) continue
    sections.push([name, match[0]])
    rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length)
  }
  // Instructions blocks: "Instructions from: <path>" followed by content.
  const instructionBlocks: string[] = []
  const instructionRe = /Instructions from: [^\n]+\n(?:<summary>[\s\S]*?<\/summary>|[\s\S]*?(?=\nInstructions from:|$))/g
  let instrMatch: RegExpExecArray | null
  while ((instrMatch = instructionRe.exec(system)) !== null) instructionBlocks.push(instrMatch[0])
  sections.push(["instructions", instructionBlocks.join("\n---\n")])
  sections.push(["unclassified", rest.trim()])
  return sections
}

function breakdown(label: string, hit: RequestHit) {
  const body = hit.body
  const messages = (body.messages ?? []) as Array<{ role: string; content: unknown }>
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => String(m.content))
    .join("\n")
  const userMessageText = messages
    .filter((m) => m.role !== "system")
    .map((m) => String(m.content))
    .join("\n")
  const toolsText = JSON.stringify(body.tools ?? {})
  const sections = analyzeSystem(systemText)

  const chars = (value: string) => value.length
  const tokens = (value: string) => Math.round(value.length / 4)
  const pad = (value: string, width: number) => value.padEnd(width)

  console.log(`\n=== context budget: ${label} ===`)
  console.log(pad("section", 20) + pad("chars", 10) + pad("~tokens", 10) + "preview")
  let total = 0
  for (const [name, part] of sections) {
    if (!part) continue
    total += chars(part)
    console.log(pad(name, 20) + pad(String(chars(part)), 10) + pad(String(tokens(part)), 10) + part.slice(0, 55).replace(/\n/g, " "))
  }
  console.log(
    pad("SYSTEM TOTAL", 20) + pad(String(total), 10) + pad(String(tokens(systemText)), 10) + "joined system prompt chars",
  )
  console.log(
    pad("user message(s)", 20) + pad(String(chars(userMessageText)), 10) + pad(String(tokens(userMessageText)), 10) + "non-system message parts",
  )
  console.log(
    pad("tools payload", 20) +
      pad(String(chars(toolsText)), 10) +
      pad(String(tokens(toolsText)), 10) +
      `tool definitions (${(Object.keys(body.tools ?? {}) as string[]).length})`,
  )
  console.log(
    pad("REQUEST TOTAL", 20) +
      pad(String(chars(systemText) + chars(userMessageText) + chars(toolsText)), 10) +
      pad(String(tokens(systemText) + tokens(userMessageText) + tokens(toolsText)), 10) +
      "everything the model sees",
  )
  return {
    systemTotal: total,
    requestTotal: chars(systemText) + chars(userMessageText) + chars(toolsText),
    toolCount: (Object.keys(body.tools ?? {}) as string[]).length,
    sections: Object.fromEntries(sections.map(([name, part]) => [name, chars(part)])),
  }
}

const runOneTurn = Effect.fn("test.runOneTurn")(function* (promptText: string, extra: Partial<Config.Info> = {}) {
  const { directory: dir } = yield* TestInstance
  const llm = yield* TestLLMServer
  // Hermetic per-test environment: config dir isolated in the instance dir so
  // instructions/skills resolve inside it. The DB is file-scoped (see below)
  // because the SQLite client is a process singleton and must not be pointed
  // at a directory that gets deleted mid-file.
  const prevConfigDir = process.env.OPENCODE_CONFIG_DIR
  process.env.OPENCODE_CONFIG_DIR = dir

  yield* writeConfig(dir, { ...providerCfg(llm.url), ...extra })
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({
    title: "Budget",
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  })
  yield* prompt.prompt({
    sessionID: chat.id,
    agent: "build",
    noReply: true,
    parts: [{ type: "text", text: promptText }],
  })
  yield* llm.text("done")
  const result = yield* prompt.loop({ sessionID: chat.id })
  if (prevConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
  else process.env.OPENCODE_CONFIG_DIR = prevConfigDir

  if (result.info.role !== "assistant") throw new Error("expected assistant message")
  const hits = yield* llm.hits
  if (hits.length === 0) throw new Error("no LLM request captured")
  return hits[0] as RequestHit
})

it.instance(
  "bare config: fixed base context stays within budget",
  () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      const hit = yield* runOneTurn("hello", {
        instruction_injection: { agents: "summary", skills: "summary" },
      }).pipe(Effect.provide(Global.layerWith({ config: dir, home: dir })))
      const stats = breakdown("bare (no AGENTS.md, no skills)", hit)
      expect(stats.toolCount).toBeGreaterThan(20)
      // PROMPT_CORE + env + shell/tasks + goal + reminder + step-1 guidance.
      expect(stats.systemTotal).toBeLessThan(20000)
      expect(stats.requestTotal).toBeLessThan(200000)
    }),
  30_000,
)

it.instance(
  "loaded config: AGENTS.md + skills stay within budget",
  () =>
    Effect.gen(function* () {
      const { directory: dir } = yield* TestInstance
      yield* writeText(
        path.join(dir, "AGENTS.md"),
        [
          "# Project instructions",
          "",
          "This repository is a measurement fixture.",
          "- Rule one: keep changes small.",
          "- Rule two: verify before claiming success.",
          "- Rule three: never break the build.",
          "",
          "## Conventions",
          "Use the project style guide for all new code.",
        ].join("\n"),
      )
      for (let i = 0; i < 35; i++) {
        yield* writeSkill(dir, `skill-${String(i).padStart(2, "0")}`, `Skill number ${i} for measurement.`)
      }
      const hit = yield* runOneTurn("hello", {
        instruction_injection: { agents: "full", skills: "full" },
      }).pipe(Effect.provide(Global.layerWith({ config: dir, home: dir })))
      const stats = breakdown("loaded (AGENTS.md full, skills verbose)", hit)
      expect(stats.sections["instructions"] ?? 0).toBeGreaterThan(50)
      expect(stats.sections["skillsList"] ?? 0).toBeGreaterThan(100)
      // The full skills list in verbose mode is the largest variable section.
      expect(stats.sections["skillsList"] ?? 0).toBeLessThan(30000)
      expect(stats.systemTotal).toBeLessThan(60000)
      expect(stats.requestTotal).toBeLessThan(300000)
    }),
  30_000,
)
