/**
 * Orchestrator — DAG-based parallel task execution engine.
 *
 * Executes a Directed Acyclic Graph (DAG) of steps, running independent
 * steps in parallel for optimal throughput. Supports retries, timeouts,
 * optional steps, and dependency resolution.
 *
 * Architecture:
 * ┌──────────┐     ┌──────────────┐     ┌──────────────┐
 * │ DAGStep  │────▶│ Topological  │────▶│ Parallel     │
 * │ Array    │     │ Sort + Group │     │ Execution    │
 * └──────────┘     └──────────────┘     │ (forEachPar) │
 *                                        └──────────────┘
 *                                               │
 *                                        ┌──────▼──────┐
 *                                        │ Step Runner │
 *                                        │ with retry   │
 *                                        │ & timeout    │
 *                                        └──────────────┘
 */

import { Effect, Exit, Cause, Context, Layer, Schema, Duration } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"
import * as Log from "@opencode-ai/core/util/log"
import { SessionID, MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import type { MessageV2 } from "@/session/message-v2"

const log = Log.create({ service: "orchestrator" })

// --- Schema ---

export const DAGStepSchema = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  agent: Schema.String,
  prompt: Schema.String,
  depends: Schema.optional(Schema.Array(Schema.String)),
  timeout: Schema.optional(PositiveInt),
  retries: Schema.optional(PositiveInt),
  optional: Schema.optional(Schema.Boolean),
  access: Schema.optional(Schema.Literal("read-only")).annotate({
    description: "Required by the guarded runtime; writer DAG execution is intentionally unavailable.",
  }),
})
export type DAGStep = Schema.Schema.Type<typeof DAGStepSchema>

export interface DAGResult {
  stepId: string
  status: "success" | "failure" | "skipped"
  result?: unknown
  error?: string
  durationMs: number
  output?: string
}

export interface DAGReport {
  success: boolean
  results: DAGResult[]
  totalDurationMs: number
  failedSteps: string[]
  totalSteps: number
  parallelRounds: number
}

export interface Interface {
  /** Execute a DAG of steps with parallel execution of independent branches. */
  readonly plan: (steps: DAGStep[]) => Effect.Effect<DAGReport>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Orchestrator") {}

export function dagRuntimeGuard(flags: {
  experimentalDagOrchestration: boolean
  experimentalDagReadOnly?: boolean
}): string | undefined {
  if (!flags.experimentalDagOrchestration) {
    return "DAG orchestration runtime is disabled. Set OPENCODE_EXPERIMENTAL_DAG_ORCHESTRATION=true to opt in."
  }
  if (!flags.experimentalDagReadOnly) {
    return "Writer DAG execution is unavailable without path locks. Set OPENCODE_EXPERIMENTAL_DAG_READ_ONLY=true for the strict read-only runtime."
  }
  return undefined
}

export function validateDagSteps(steps: readonly DAGStep[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const first = new Map<string, DAGStep>()
  for (const step of steps) {
    if (seen.has(step.id)) errors.push(`Duplicate DAG step id: ${step.id}`)
    seen.add(step.id)
    if (!first.has(step.id)) first.set(step.id, step)
  }
  for (const step of steps) {
    for (const dep of step.depends ?? []) {
      if (!seen.has(dep)) errors.push(`DAG step ${step.id} depends on unknown step: ${dep}`)
    }
    if (step.access !== "read-only") errors.push(`DAG step ${step.id} must declare access=read-only`)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  function visit(id: string): string[] | undefined {
    if (visiting.has(id)) return [...stack.slice(stack.indexOf(id)), id]
    if (visited.has(id)) return undefined
    const step = first.get(id)
    if (!step) return undefined
    visiting.add(id)
    stack.push(id)
    for (const dep of step.depends ?? []) {
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return undefined
  }
  for (const step of steps) {
    const cycle = visit(step.id)
    if (cycle) {
      errors.push(`DAG dependency cycle detected: ${cycle.join(" -> ")}`)
      break
    }
  }
  return errors
}

export const READ_ONLY_DAG_TOOLS = ["read", "glob", "grep", "repo_overview", "session_context", "session_info"] as const

export function readOnlyDagPermissions() {
  return [
    { permission: "*", pattern: "*", action: "deny" as const },
    ...READ_ONLY_DAG_TOOLS.map((permission) => ({ permission, pattern: "*", action: "allow" as const })),
  ]
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const sessions = yield* Session.Service
    const prompt = yield* SessionPrompt.Service
    const runtimeFlags = yield* RuntimeFlags.Service

    // ---- Execute a single step with retries ----
    const executeStep = (step: DAGStep, parentSessionID: SessionID): Effect.Effect<DAGResult> => {
      const stepStart = Date.now()
      log.info(`executing step: ${step.id} (${step.description})`)

      function doAttempt(remainingRetries: number): Effect.Effect<DAGResult> {
        return Effect.gen(function* () {
          const agentInfo = yield* agent.get(step.agent as any).pipe(
            Effect.catch(() => Effect.succeed({} as any)),
          )

          const subSession = yield* sessions.create({
            parentID: parentSessionID,
            title: step.description,
            permission: readOnlyDagPermissions(),
          })

          const model = (agentInfo as any).model
          const promptInput: any = {
            sessionID: subSession.id,
            messageID: MessageID.ascending(),
            parts: [{ type: "text", text: step.prompt }],
            agent: step.agent,
          }
          if (model) {
            promptInput.model = { providerID: model.providerID, modelID: model.modelID }
          }

          const timedOut = yield* Effect.timeout(
            (prompt.prompt as any)(promptInput),
            Duration.seconds(step.timeout ?? 120),
          ).pipe(Effect.exit) as any
          const exit = timedOut as Exit.Exit<any, any>

          if (Exit.isFailure(exit)) {
            const error = Cause.squash(exit.cause)
            const errorMsg = error instanceof Error ? error.message : String(error)

            if (remainingRetries > 0) {
              log.info(`retrying step ${step.id} (${remainingRetries} retries left)`)
              return yield* doAttempt(remainingRetries - 1)
            }

            return {
              stepId: step.id,
              status: "failure" as const,
              error: errorMsg,
              durationMs: Date.now() - stepStart,
            } as DAGResult
          }

          const lastText = (exit.value as any)?.parts?.findLast?.((p: any) => p.type === "text")
          const output = lastText?.text ?? ""

          log.info(`step ${step.id} completed`, { duration: `${Date.now() - stepStart}ms` })
          return {
            stepId: step.id,
            status: "success" as const,
            result: output,
            output,
            durationMs: Date.now() - stepStart,
          } as DAGResult
        }) as Effect.Effect<DAGResult>
      }

      return doAttempt(step.retries ?? 0)
    }

    // ---- Execute the full DAG with parallel group execution ----
    const plan = Effect.fn("Orchestrator.plan")(function* (steps: DAGStep[]) {
      const guardError = dagRuntimeGuard(runtimeFlags)
      if (guardError) return yield* Effect.fail(new Error(guardError))
      log.info(`starting orchestration with ${steps.length} steps`)
      const startAll = Date.now()
      const results = new Map<string, DAGResult>()
      const completed = new Set<string>()
      const failed = new Set<string>()

      // Build dependency map (convert readonly arrays to mutable)
      const stepMap = new Map(steps.map((s) => [s.id, s]))
      const dependsOn = new Map<string, string[]>()
      for (const step of steps) {
        dependsOn.set(step.id, [...(step.depends ?? [])])
      }

      // Compute topological levels (parallel groups)
      const levelMap = new Map<string, number>()
      function computeLevel(id: string): number {
        if (levelMap.has(id)) return levelMap.get(id)!
        const deps = dependsOn.get(id) ?? []
        if (deps.length === 0) {
          levelMap.set(id, 0)
          return 0
        }
        const maxLevel = Math.max(...deps.map(computeLevel)) + 1
        levelMap.set(id, maxLevel)
        return maxLevel
      }

      for (const step of steps) computeLevel(step.id)

      // Group by level for parallel execution
      const levelGroups = new Map<number, DAGStep[]>()
      for (const step of steps) {
        const level = levelMap.get(step.id) ?? 0
        if (!levelGroups.has(level)) levelGroups.set(level, [])
        levelGroups.get(level)!.push(step)
      }

      const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b)
      let parallelRounds = 0

      // Execute each level group in parallel
      for (const level of sortedLevels) {
        const group = levelGroups.get(level)!
        parallelRounds++

        log.info(`executing parallel round ${parallelRounds}`, {
          steps: group.map((s) => s.id),
          level,
        })

        // Create a parent session for this round
        const dagRoot = yield* sessions.create({
          title: `DAG round ${parallelRounds}: ${group.map((s) => s.id).join(", ")}`,
        })

        // Execute all steps in this level IN PARALLEL
        const groupResults = yield* Effect.forEach(
          group,
          (step: DAGStep) => Effect.gen(function* () {
            // Check if dependencies are satisfied
            const deps = dependsOn.get(step.id) ?? []
            const allDepsCompleted = deps.every((d) => completed.has(d))
            const anyDepFailed = deps.some((d) => failed.has(d))

            if (!allDepsCompleted) {
              log.warn(`step ${step.id} dependencies not met`)
              return {
                stepId: step.id,
                status: "skipped" as const,
                error: `Dependencies not completed: ${deps.filter((d) => !completed.has(d)).join(", ")}`,
                durationMs: 0,
              } as DAGResult
            }

            if (anyDepFailed && !step.optional) {
              return {
                stepId: step.id,
                status: "skipped" as const,
                error: `Dependency failed: ${deps.filter((d) => failed.has(d)).join(", ")}`,
                durationMs: 0,
              } as DAGResult
            }

            return yield* executeStep(step, dagRoot.id)
          }),
          { concurrency: group.length } as any,
        )

        // Process results
        for (const result of groupResults) {
          results.set(result.stepId, result)
          if (result.status === "success") {
            completed.add(result.stepId)
          } else if (result.status === "failure") {
            failed.add(result.stepId)
          }
        }

        // If a non-optional step failed, skip remaining groups
        if (failed.size > 0) {
          const nonOptionalFailed = Array.from(failed.values()).some((f) => {
            const step = stepMap.get(f)
            return step && !step.optional
          })
          if (nonOptionalFailed) {
            log.warn("non-optional step failed, aborting remaining steps")
            // Mark remaining steps as skipped
            for (const remainingLevel of sortedLevels.slice(sortedLevels.indexOf(level) + 1)) {
              const remainingGroup = levelGroups.get(remainingLevel)!
              for (const step of remainingGroup) {
                results.set(step.id, {
                  stepId: step.id,
                  status: "skipped",
                  error: "Aborted: previous required step failed",
                  durationMs: 0,
                })
              }
            }
            break
          }
        }
      }

      const totalDurationMs = Date.now() - startAll
      const failedSteps = Array.from(results.values())
        .filter((r) => r.status === "failure")
        .map((r) => r.stepId)

      log.info("orchestration complete", {
        total: steps.length,
        completed: completed.size,
        failed: failedSteps.length,
        parallelRounds,
        duration: `${totalDurationMs}ms`,
      })

      return {
        success: failedSteps.length === 0,
        results: Array.from(results.values()),
        totalDurationMs,
        failedSteps,
        totalSteps: steps.length,
        parallelRounds,
      } as DAGReport
    })

    return Service.of({ plan: plan as any })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(SessionPrompt.defaultLayer),
    Layer.provide(RuntimeFlags.defaultLayer),
  )
)

// Re-export types and helpers
export * as Orchestrator from "."
