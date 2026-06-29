export * as AutoExecute from "./auto-execute"

import { Effect, Context, Schema, Duration, Layer, Option } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"
import * as Log from "@opencode-ai/core/util/log"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { SessionID, MessageID } from "./schema"
import type { Agent } from "../agent/agent"

const log = Log.create({ service: "auto-execute" })

// --- Schema ---

export const StepSchema = Schema.Struct({
  tool: Schema.String,
  params: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  description: Schema.optional(Schema.String),
  timeout: Schema.optional(PositiveInt),
  on_error: Schema.optional(Schema.Literals(["ignore", "warn", "fail"])),
})
export type Step = Schema.Schema.Type<typeof StepSchema>

// --- Types ---

export interface StepResult {
  step: Step
  success: boolean
  data?: unknown
  error?: string
  durationMs: number
}

export interface PipelineReport {
  results: StepResult[]
  totalDurationMs: number
  failedCount: number
}

// --- Service ---

export interface Interface {
  readonly execute: (agent: Agent.Info) => Effect.Effect<PipelineReport>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AutoExecute") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const toolRegistry = yield* ToolRegistry.Service

    const execute = (agent: Agent.Info): Effect.Effect<PipelineReport> =>
      Effect.gen(function* () {
        const agentOpts = agent.options as Record<string, unknown>
        const stepsRaw = agentOpts["auto_execute"] as Step[] | undefined
        if (!stepsRaw?.length) {
          return { results: [], totalDurationMs: 0, failedCount: 0 } as PipelineReport
        }

        // Validate steps
        const steps: Step[] = []
        let invalidCount = 0
        for (const s of stepsRaw) {
          const decoded = Schema.decodeUnknownOption(StepSchema)(s)
          if (Option.isSome(decoded)) steps.push(decoded.value)
          else {
            invalidCount++
            log.warn("Invalid auto_execute step", { step: s })
          }
        }
        if (steps.length === 0) {
          log.warn("Auto-execute: no valid steps", { provided: stepsRaw.length, invalid: invalidCount })
          return { results: [], totalDurationMs: 0, failedCount: 0 } as PipelineReport
        }

        // Build the tool index once instead of fetching the registry per step.
        const allTools = yield* toolRegistry.all()
        const toolIndex = new Map(allTools.map((t) => [t.id, t] as const))
        log.info("Auto-execute pipeline starting", {
          steps: steps.length,
          invalid: invalidCount,
          tools: toolIndex.size,
        })

        const results: StepResult[] = []
        const startAll = Date.now()

        for (const [idx, step] of steps.entries()) {
          const stepStart = Date.now()
          log.info(`Auto-execute [${idx + 1}/${steps.length}] ${step.description || step.tool}`)

          try {
            const result = yield* Effect.timeout(
              executeToolCall(toolIndex, step),
              Duration.millis(step.timeout ?? 30000),
            ).pipe(
              Effect.catch((err: unknown) =>
                Effect.succeed({ error: `Tool execution failed: ${err}` }),
              ),
            )

            if (result && typeof result === "object" && "error" in result) {
              throw new Error((result as any).error)
            }

            const durationMs = Date.now() - stepStart
            results.push({
              step,
              success: true,
              data: result,
              durationMs,
            })
            log.info(`Auto-execute [${idx + 1}/${steps.length}] ok`, { tool: step.tool, duration: `${durationMs}ms` })
          } catch (err: any) {
            const errorMsg = err?.message ?? String(err)
            results.push({
              step,
              success: false,
              error: errorMsg,
              durationMs: Date.now() - stepStart,
            })

            const onError = step.on_error ?? "warn"
            if (onError === "fail") {
              log.error("Auto-execute step failed (fatal)", { tool: step.tool, error: errorMsg })
              break
            } else if (onError === "warn") {
              log.warn("Auto-execute step failed", { tool: step.tool, error: errorMsg })
            }
          }
        }

        const totalDurationMs = Date.now() - startAll
        const failedCount = results.filter((r) => !r.success).length

        log.info("Auto-execute pipeline completed", {
          total: results.length,
          failed: failedCount,
          duration: `${totalDurationMs}ms`,
        })

        return { results, totalDurationMs, failedCount } as PipelineReport
      })

    return { execute } as Interface
  }),
)

// --- Helpers ---

function executeToolCall(
  toolIndex: ReadonlyMap<string, Tool.Def>,
  step: Step,
): Effect.Effect<Tool.ExecuteResult> {
  return Effect.gen(function* () {
    const toolDef = toolIndex.get(step.tool)
    if (!toolDef) {
      throw new Error(`Tool "${step.tool}" not found in registry`)
    }

    // Minimal context for auto-executed tool calls
    const dummyCtx: Tool.Context = {
      sessionID: SessionID.descending(),
      messageID: MessageID.ascending(),
      agent: "auto-execute",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => Effect.void,
      ask: () => Effect.void,
    }

    const result = yield* toolDef.execute(step.params ?? {}, dummyCtx)
    return result
  })
}

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(ToolRegistry.defaultLayer),
  )
)
