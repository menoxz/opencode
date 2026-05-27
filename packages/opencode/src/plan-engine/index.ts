/**
 * PlanEngine — Automatic task decomposition and plan generation.
 *
 * Analyzes a user request and generates a structured execution plan (DAG).
 * The plan breaks complex tasks into smaller, parallelizable steps that can
 * be executed concurrently via the Orchestrator.
 *
 * Architecture:
 * ┌──────────┐    ┌────────────┐    ┌──────────────┐    ┌──────────────┐
 * │ Request  │───▶│ Complexity │───▶│ PlanGen LLM  │───▶│ DAG Steps    │
 * │          │    │ Analyzer   │    │ (structured) │    │              │
 * └──────────┘    └────────────┘    └──────────────┘    └──────────────┘
 *                                                              │
 *                                                              ▼
 *                                                     ┌──────────────┐
 *                                                     │ Orchestrator │
 *                                                     │ (parallel    │
 *                                                     │  execution)  │
 *                                                     └──────────────┘
 *
 * Module shape: single-namespace directory with self-reexport at bottom.
 */

import { Effect, Context, Layer, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { ModelID, ProviderID } from "@/provider/schema"
import { generateObject, type LanguageModel } from "ai"
import { Plugin } from "@/plugin"

const log = Log.create({ service: "plan-engine" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string
  description: string
  agent: string
  prompt: string
  depends: string[]
  /** Estimated complexity (0.0-1.0) */
  complexity: number
  /** Whether this step is optional (can fail without aborting the plan) */
  optional?: boolean
}

export interface ExecutionPlan {
  goal: string
  steps: PlanStep[]
  parallelGroups: string[][]
  estimatedTokens: number
  complexity: "simple" | "moderate" | "complex"
}

export const Complexity = {
  /** Task can be handled in a single response */
  SIMPLE: "simple" as const,
  /** Task needs 2-3 sequential steps */
  MODERATE: "moderate" as const,
  /** Task benefits from decomposition and parallel execution */
  COMPLEX: "complex" as const,
}

export interface Interface {
  /** Analyze a task and determine if planning is beneficial. */
  readonly analyzeComplexity: (task: string, options?: {
    modelId?: string
    providerId?: string
  }) => Effect.Effect<{ complexity: string; reason: string }>

  /** Generate a structured execution plan for a task. */
  readonly generatePlan: (task: string, options?: {
    modelId?: string
    providerId?: string
    contextFiles?: string[]
  }) => Effect.Effect<ExecutionPlan>

  /** Quick heuristic check — no LLM call needed. */
  readonly heuristicComplexity: (task: string) => string
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/PlanEngine") {}

// ---------------------------------------------------------------------------
// Heuristic complexity analysis (zero LLM cost)
// ---------------------------------------------------------------------------

function estimateTokens(task: string, steps: number): number {
  // Rough: 1 token ≈ 4 chars, plus overhead for plan structure
  return Math.ceil((task.length + steps * 100) / 4)
}

const COMPLEXITY_KEYWORDS = {
  high: [
    "refactor", "architect", "design pattern", "microservice", "migration",
    "rearchitecture", "multi-step", "module", "component", "end-to-end",
    "pipeline", "orchestrat", "parallel", "distributed", "scalab",
    "comprehensive", "full stack", "frontend", "backend", "API",
    "database", "authentication", "authorization", "deploy", "CI/CD",
  ],
  moderate: [
    "implement", "feature", "add", "create", "build", "develop",
    "function", "method", "class", "test", "integration",
    "multiple", "several", "various", "different",
  ],
  simple: [
    "fix", "bug", "typo", "rename", "remove", "delete",
    "change", "update", "simple", "minor", "small",
    "quick", "trivial", "single",
  ],
}

export function heuristicComplexity(task: string): string {
  const lower = task.toLowerCase()
  const words = lower.split(/\s+/)

  let highScore = 0
  let moderateScore = 0
  let simpleScore = 0

  // Score based on keyword matches
  for (const word of words) {
    if (COMPLEXITY_KEYWORDS.high.some((k) => word.includes(k) || k.includes(word))) highScore++
    if (COMPLEXITY_KEYWORDS.moderate.some((k) => word.includes(k))) moderateScore++
    if (COMPLEXITY_KEYWORDS.simple.some((k) => word.includes(k))) simpleScore++
  }

  // Score based on task length (longer tasks tend to be more complex)
  if (words.length > 50) highScore += 2
  else if (words.length > 20) moderateScore += 2
  else if (words.length < 5) simpleScore += 1

  // Score based on references to multiple files/areas
  const fileRefs = (lower.match(/\.(ts|js|tsx|jsx|py|go|rs|java|json|yml|yaml|md|css|html)\b/g) || []).length
  if (fileRefs > 5) highScore += 2
  else if (fileRefs > 2) moderateScore += 1

  // Look for bullet points or numbered lists (multiple sub-tasks)
  const listItems = (lower.match(/^[\-\*\#\d]/gm) || []).length
  if (listItems > 5) highScore += 2
  else if (listItems > 2) moderateScore += 1

  if (highScore > moderateScore && highScore > simpleScore) return Complexity.COMPLEX
  if (moderateScore >= simpleScore) return Complexity.MODERATE
  return Complexity.SIMPLE
}

// ---------------------------------------------------------------------------
// LLM-based structured plan generation schema
// ---------------------------------------------------------------------------

const PlanStepSchema = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  agent: Schema.String,
  prompt: Schema.String,
  depends: Schema.Array(Schema.String),
  optional: Schema.optional(Schema.Boolean),
})

const ExecutionPlanSchema = Schema.Struct({
  goal: Schema.String,
  steps: Schema.Array(PlanStepSchema),
  complexity: Schema.Literals(["simple", "moderate", "complex"]),
})

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service

    const analyzeComplexity = Effect.fn("PlanEngine.analyzeComplexity")(function* (
      task: string,
      options?: { modelId?: string; providerId?: string },
    ) {
      // Use heuristic first (fast path)
      const heuristic = heuristicComplexity(task)
      log.info("complexity heuristic", { heuristic, taskLength: task.length })

      // For clearly simple or clearly complex tasks, trust the heuristic
      // For moderate tasks, we could optionally verify with LLM
      return {
        complexity: heuristic,
        reason: heuristic === "simple"
          ? "Task appears to be a simple, well-scoped change"
          : heuristic === "complex"
            ? "Task involves multiple areas, files, or concerns"
            : "Task has moderate scope with some decomposition potential",
      }
    })

    const generatePlan = Effect.fn("PlanEngine.generatePlan")(function* (
      task: string,
      options?: { modelId?: string; providerId?: string },
    ) {
      log.info("generating execution plan", { taskLength: task.length })

      // 1. Determine complexity
      const { complexity } = yield* analyzeComplexity(task, options)

      // 2. For simple tasks, return a single-step plan
      if (complexity === Complexity.SIMPLE) {
        return {
          goal: task.slice(0, 200),
          steps: [{
            id: "step-1",
            description: task.slice(0, 100),
            agent: "build",
            prompt: task,
            depends: [],
            complexity: 0.2,
          }],
          parallelGroups: [["step-1"]],
          estimatedTokens: estimateTokens(task, 1),
          complexity: Complexity.SIMPLE,
        } satisfies ExecutionPlan
      }

      // 3. For complex tasks, generate structured plan via LLM
      const modelInfo = options?.providerId && options?.modelId
        ? { providerID: options.providerId as any, modelID: options.modelId as any }
        : yield* provider.defaultModel()

      const resolved = yield* provider.getModel(modelInfo.providerID, modelInfo.modelID)

      // Available agents for plan steps
      const agentsStr = ["build", "plan", "general", "explore"].join(", ")

      const systemPrompt = `You are a senior software architect. Your job is to break down coding tasks into an optimal execution plan.

Rules:
1. Analyze the task and split it into parallelizable steps
2. Each step should be independent and focused on ONE deliverable
3. Group independent steps together for parallel execution
4. Use dependency tracking (depends) to express ordering constraints
5. For research/exploration, use agent "explore"
6. For implementation, use agent "build"
7. Keep step prompts focused — each step should produce ONE concrete outcome
8. Prefer more smaller steps over fewer large ones (better parallelism)
9. Identify the goal clearly

Available agents: ${agentsStr}

The task is:
${task}`

      // Call the LLM for structured plan generation
      const stepsData: Array<{
        id: string; description: string; agent?: string; prompt: string;
        depends?: string[]; optional?: boolean
      }> = yield* Effect.promise(async () => {
        const genResult = await generateObject({
          model: resolved.api as unknown as LanguageModel,
          schema: Object.assign(
            Schema.toStandardSchemaV1(ExecutionPlanSchema),
            Schema.toStandardJSONSchemaV1(ExecutionPlanSchema),
          ) as any,
          system: systemPrompt,
          prompt: `Create an execution plan for this task. Break it into parallelizable steps where possible.`,
          temperature: 0.3,
        })
        return (genResult.object as any).steps ?? []
      })

      // 4. Compute parallel groups from dependencies
      const stepMap = new Map(stepsData.map((s) => [s.id, s]))
      const dependsOn = new Map<string, Set<string>>()
      for (const step of stepsData) {
        dependsOn.set(step.id, new Set(step.depends ?? []))
      }

      // Group steps that can run in parallel (same depth level)
      const depthMap = new Map<string, number>()
      function computeDepth(id: string): number {
        if (depthMap.has(id)) return depthMap.get(id)!
        const step = stepMap.get(id)
        if (!step || !step.depends || step.depends.length === 0) {
          depthMap.set(id, 0)
          return 0
        }
        const maxDepth = Math.max(...step.depends.map(computeDepth)) + 1
        depthMap.set(id, maxDepth)
        return maxDepth
      }

      for (const step of stepsData) computeDepth(step.id)

      const groups = new Map<number, string[]>()
      for (const [id, depth] of depthMap) {
        if (!groups.has(depth)) groups.set(depth, [])
        groups.get(depth)!.push(id)
      }
      const parallelGroups = Array.from(groups.entries())
        .sort(([a], [b]) => a - b)
        .map(([, steps]) => steps)

      const plan: ExecutionPlan = {
        goal: task.slice(0, 200),
        steps: stepsData.map((s) => ({
          id: s.id,
          description: s.description,
          agent: s.agent || "build",
          prompt: s.prompt,
          depends: s.depends ?? [],
          complexity: 0.5,
          optional: s.optional,
        })),
        parallelGroups,
        estimatedTokens: estimateTokens(task, stepsData.length),
        complexity: complexity as "simple" | "moderate" | "complex",
      }

      log.info("plan generated", {
        steps: plan.steps.length,
        parallelGroups: plan.parallelGroups.length,
        complexity: plan.complexity,
      })

      return plan
    })

    return Service.of({
      analyzeComplexity: analyzeComplexity as any,
      generatePlan: generatePlan as any,
      heuristicComplexity,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
  )
)

export const use = serviceUse(Service)

export * as PlanEngine from "."
