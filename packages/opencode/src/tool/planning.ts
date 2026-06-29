import { Effect } from "effect"
import * as Tool from "./tool"
import { PlanEngine } from "@/plan-engine"
import { Config } from "@/config/config"

const DESCRIPTION = [
  "Validate a structured execution plan (DAG of steps) before execution.",
  "Pass goal, complexity, and an array of steps; each step has id, description,",
  "agent, prompt, depends[], complexity. Returns deterministic parallelGroups",
  "(steps that can run concurrently) or fails on duplicate ids, missing",
  "dependencies, or cycles. Gated by experimental.planning.",
].join(" ")

export const Parameters = PlanEngine.ExecutionPlanSchema

export const PlanningTool = Tool.define(
  "planning",
  Effect.gen(function* () {
    const config = yield* Config.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: typeof Parameters.Type, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          const planning = cfg.experimental?.planning
          const maxNodes = planning?.maxNodes
          if (typeof maxNodes === "number" && params.steps.length > maxNodes) {
            throw new Error(`Plan has ${params.steps.length} steps, exceeding experimental.planning.maxNodes=${maxNodes}`)
          }
          // validateExecutionPlan rebuilds parallelGroups; the input groups/tokens are placeholders.
          const plan = PlanEngine.validateExecutionPlan({
            ...params,
            steps: params.steps.map((s) => ({ ...s, depends: [...s.depends], complexity: 0.5 })),
            parallelGroups: [],
            estimatedTokens: 0,
          })
          const allowParallel = planning?.allowParallel !== false
          const groups = allowParallel ? plan.parallelGroups : plan.steps.map((s) => [s.id])
          return {
            title: `plan: ${params.goal.slice(0, 60)}`,
            metadata: { steps: plan.steps.length, groups: groups.length },
            output: JSON.stringify({ goal: plan.goal, complexity: plan.complexity, parallelGroups: groups }, null, 2),
          }
        }),
    }
  }),
)
