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
import { generateObject, jsonSchema, type LanguageModel } from "ai"
import { Plugin } from "@/plugin"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"
import crypto from "crypto"
import path from "path"

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

// Helper to compute local plan cache path
function getPlanCachePath(task: string): string {
  const hash = crypto.createHash("sha256").update(task).digest("hex")
  return path.join(Global.Path.config, "cache", "plans", `${hash}.json`)
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const provider = yield* Provider.Service
    const plugin = yield* Plugin.Service
    const afs = yield* AppFileSystem.Service

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

      // Try local plan cache first
      const cachePath = getPlanCachePath(task)
      const cachedText = yield* afs.readFileStringSafe(cachePath)
      if (cachedText) {
        try {
          const cachedPlan = JSON.parse(cachedText) as ExecutionPlan
          log.info("plan cache hit", { taskLength: task.length, path: cachePath })
          return cachedPlan
        } catch (e) {
          log.warn("failed to parse cached plan, falling back to generation", { error: String(e) })
        }
      }

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
        ? { providerID: options.providerId as ProviderID, modelID: options.modelId as ModelID }
        : yield* provider.defaultModel()

      const resolved = yield* provider.getModel(modelInfo.providerID, modelInfo.modelID)
      const language = yield* provider.getLanguage(resolved)

      // Available agents for plan steps
      const agentsStr = ["build", "plan", "general", "explore", "orchestrator"].join(", ")

      const systemPrompt = `You are a senior software architect. Your job is to break down coding tasks into an optimal execution plan.

Rules:
1. Analyze the task and split it into parallelizable steps
2. Each step must include ALL required fields: id, description, agent, prompt, depends
3. The "prompt" field must contain the full instructions for the agent to execute
4. Group independent steps together for parallel execution
5. Use dependency tracking (depends) to express ordering constraints
6. For research/exploration, use agent "explore"
7. For implementation, use agent "build"
8. Keep step prompts focused — each step should produce ONE concrete outcome
9. Prefer more smaller steps over fewer large ones (better parallelism)
10. Identify the goal clearly
11. Set complexity to one of: "simple", "moderate", "complex"

Available agents: ${agentsStr}

The task is:
${task}

Return ONLY valid JSON. Do not include markdown, backticks, or any text outside the JSON object.`

      // Call the LLM for structured plan generation
      const schemaJSON = Schema.toStandardJSONSchemaV1(ExecutionPlanSchema)
      const genResult = yield* Effect.promise(async () => {
        return await generateObject({
          model: language,
          schema: jsonSchema(schemaJSON as unknown as Record<string, unknown>),
          system: systemPrompt,
          prompt: `Create an execution plan in JSON format for this task. Include ALL required fields: each step must have id, description, agent, prompt, and depends. The plan must have goal, steps (array), and complexity ("simple"/"moderate"/"complex"). Break it into parallelizable steps where possible.`,
          temperature: 0.3,
        })
      })

      // 4. Extract and normalize plan with fallbacks for missing LLM fields
      const rawPlan = (genResult.object as Record<string, unknown>) ?? {}
      const rawSteps = (rawPlan.steps as Array<Record<string, unknown>> | undefined) ?? []
      const rawStepsTyped: Array<{
        id: string; description: string; agent?: string; prompt: string;
        depends?: string[]; optional?: boolean
      }> = rawSteps.map((s) => ({
        id: String(s.id ?? ""),
        description: String(s.description ?? ""),
        agent: s.agent as string | undefined,
        prompt: String(s.prompt ?? ""),
        depends: Array.isArray(s.depends) ? (s.depends as string[]) : [],
        optional: Boolean(s.optional),
      }))
      const stepsData = rawStepsTyped.length > 0 ? rawStepsTyped : [{
        id: "step-1",
        description: task.slice(0, 100),
        agent: "build",
        prompt: task,
        depends: [] as string[],
      }]

      // Compute parallel groups from dependencies
      const stepMap = new Map(stepsData.map((s: any) => [s.id, s]))
      const depthMap = new Map<string, number>()
      function computeDepth(id: string): number {
        if (depthMap.has(id)) return depthMap.get(id)!
        const step = stepMap.get(id) as any
        if (!step || !step.depends || step.depends.length === 0) {
          depthMap.set(id, 0)
          return 0
        }
        const maxDepth = Math.max(...step.depends.map(computeDepth as any)) + 1
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
        goal: (rawPlan.goal as string) ?? task.slice(0, 200),
        steps: stepsData.map((s) => ({
          id: s.id,
          description: s.description,
          agent: s.agent || "build",
          prompt: s.prompt || s.description || task,
          depends: s.depends ?? [],
          complexity: 0.5,
          optional: s.optional,
        })),
        parallelGroups,
        estimatedTokens: estimateTokens(task, stepsData.length),
        complexity: (rawPlan.complexity as ExecutionPlan["complexity"]) ?? complexity,
      }

      log.info("plan generated", {
        steps: plan.steps.length,
        parallelGroups: plan.parallelGroups.length,
        complexity: plan.complexity,
      })

      // Write to cache
      yield* afs.writeWithDirs(cachePath, JSON.stringify(plan, null, 2)).pipe(
        Effect.catch((err: unknown) => {
          log.warn("failed to write plan cache", { error: String(err) })
          return Effect.void
        })
      )

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
    Layer.provide(AppFileSystem.defaultLayer),
  )
)

export const use = serviceUse(Service)

export * as PlanEngine from "."
