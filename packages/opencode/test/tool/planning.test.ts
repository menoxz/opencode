import { describe, expect } from "bun:test"
import path from "path"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { testEffect } from "../lib/effect"
import { TestConfig } from "../fixture/config"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Plugin } from "@/plugin"
import { Question } from "@/question"
import { Todo } from "@/session/todo"
import { Skill } from "@/skill"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Provider } from "@/provider/provider"
import { Git } from "@/git"
import { LSP } from "@/lsp/lsp"
import { Instruction } from "@/session/instruction"
import { Bus } from "@/bus"
import { FetchHttpClient } from "effect/unstable/http"
import { Format } from "@/format"
import { Ripgrep } from "@/file/ripgrep"
import * as Truncate from "@/tool/truncate"
import { InstanceState } from "@/effect/instance-state"
import { Reference } from "@/reference/reference"
import { RepositoryCache } from "@/reference/repository-cache"
import { SessionID, MessageID } from "@/session/schema"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Orchestrator } from "@/orchestrator"
import { MCP } from "@/mcp"
import { Service as ToolCacheService } from "@/tool/cache"

const node = CrossSpawnSpawner.defaultLayer

type Planning = { enabled?: boolean; maxNodes?: number; allowParallel?: boolean }

const registryLayer = (planning?: Planning) =>
  ToolRegistry.layer
    .pipe(
      Layer.provide(
        TestConfig.layer({
          directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".opencode")])),
          get: () => Effect.succeed(planning ? { experimental: { planning } } : {}),
        }),
      ),
      Layer.provide(Plugin.defaultLayer),
      Layer.provide(Question.defaultLayer),
      Layer.provide(Todo.defaultLayer),
      Layer.provide(Skill.defaultLayer),
      Layer.provide(Agent.defaultLayer),
      Layer.provide(Session.defaultLayer),
      Layer.provide(Layer.mergeAll(SessionStatus.defaultLayer, BackgroundJob.defaultLayer)),
      Layer.provide(Provider.defaultLayer),
      Layer.provide(Layer.mergeAll(Git.defaultLayer, RepositoryCache.defaultLayer)),
      Layer.provide(Reference.defaultLayer),
      Layer.provide(LSP.defaultLayer),
      Layer.provide(Instruction.defaultLayer),
      Layer.provide(AppFileSystem.defaultLayer),
      Layer.provide(Bus.layer),
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Format.defaultLayer),
      Layer.provide(node),
      Layer.provide(Ripgrep.defaultLayer),
      Layer.provide(
        Layer.mergeAll(
          Truncate.defaultLayer,
          Layer.succeed(Orchestrator.Service, {
            plan: () =>
              Effect.succeed({ success: true, results: [], totalDurationMs: 0, failedSteps: [], totalSteps: 0, parallelRounds: 0 }),
          }),
        ),
      ),
    )
    .pipe(Layer.provide(MCP.defaultLayer))
    .pipe(Layer.provide(ToolCacheService.defaultLayer))
    .pipe(Layer.provide(RuntimeFlags.layer({})))

const off = testEffect(Layer.mergeAll(registryLayer(), node, Agent.defaultLayer) as unknown as Layer.Layer<never, never>)
const on = testEffect(
  Layer.mergeAll(registryLayer({ enabled: true }), node, Agent.defaultLayer) as unknown as Layer.Layer<never, never>,
)
const cap = testEffect(
  Layer.mergeAll(registryLayer({ enabled: true, maxNodes: 1 }), node, Agent.defaultLayer) as unknown as Layer.Layer<never, never>,
)
const serial = testEffect(
  Layer.mergeAll(registryLayer({ enabled: true, allowParallel: false }), node, Agent.defaultLayer) as unknown as Layer.Layer<never, never>,
)

const ctx = (): Tool.Context => ({
  sessionID: SessionID.make("ses_planning_test"),
  messageID: MessageID.ascending(),
  agent: "build",
  abort: new AbortController().signal,
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

const PLAN = {
  goal: "ship feature",
  complexity: "complex",
  steps: [
    { id: "research", description: "Research", agent: "explore", prompt: "Research", depends: [] },
    { id: "tests", description: "Tests", agent: "build", prompt: "Tests", depends: ["research"] },
    { id: "docs", description: "Docs", agent: "build", prompt: "Docs", depends: ["research"] },
    { id: "final", description: "Final", agent: "build", prompt: "Final", depends: ["tests", "docs"] },
  ],
}

describe("tool.planning", () => {
  off.instance("planning tool hidden by default", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      expect(yield* registry.ids()).not.toContain("planning")
    }),
  )

  on.instance("registered when enabled, builds deterministic parallel groups", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const planning = (yield* registry.all()).find((t) => t.id === "planning")
      if (!planning) throw new Error("planning tool not found")
      const result = yield* planning.execute(PLAN, ctx())
      const parsed = JSON.parse(result.output) as { parallelGroups: string[][] }
      expect(parsed.parallelGroups).toEqual([["research"], ["docs", "tests"], ["final"]])
    }),
  )

  cap.instance("rejects plans exceeding maxNodes", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const planning = (yield* registry.all()).find((t) => t.id === "planning")!
      const exit = yield* planning.execute(PLAN, ctx()).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
    }),
  )

  serial.instance("allowParallel=false flattens groups", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const planning = (yield* registry.all()).find((t) => t.id === "planning")!
      const result = yield* planning.execute(PLAN, ctx())
      const parsed = JSON.parse(result.output) as { parallelGroups: string[][] }
      expect(parsed.parallelGroups).toEqual([["research"], ["tests"], ["docs"], ["final"]])
    }),
  )
})
