import { Effect, Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"
import * as Tool from "./tool"
import { ReadTool } from "./read"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"

const Common = {
  id: Schema.String.annotate({ description: "Unique action id within this batch" }),
  dependsOn: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Action ids that must complete successfully before this action runs",
  }),
}

const ReadAction = Schema.Struct({
  ...Common,
  type: Schema.Literal("read"),
  filePath: Schema.String,
  offset: Schema.optional(PositiveInt),
  limit: Schema.optional(PositiveInt),
})
const GlobAction = Schema.Struct({
  ...Common,
  type: Schema.Literal("glob"),
  pattern: Schema.String,
  path: Schema.optional(Schema.String),
})
const GrepAction = Schema.Struct({
  ...Common,
  type: Schema.Literal("grep"),
  pattern: Schema.String,
  path: Schema.optional(Schema.String),
  include: Schema.optional(Schema.String),
})

export const InspectActionSchema = Schema.Union([ReadAction, GlobAction, GrepAction])
export type InspectAction = Schema.Schema.Type<typeof InspectActionSchema>

export const Parameters = Schema.Struct({
  actions: Schema.Array(InspectActionSchema).annotate({
    description: "At most 16 read-only actions. Independent actions run together; dependsOn creates barriers.",
  }),
  maxConcurrency: Schema.optional(PositiveInt).annotate({ description: "Concurrency cap, clamped to 1..8" }),
  maxCharsPerResult: Schema.optional(PositiveInt).annotate({
    description: "Per-action output cap, clamped to 1000..20000 characters",
  }),
})

function firstByID(actions: readonly InspectAction[]) {
  const map = new Map<string, InspectAction>()
  for (const action of actions) if (!map.has(action.id)) map.set(action.id, action)
  return map
}

function dependencyCycle(actions: readonly InspectAction[]): string[] | undefined {
  const byID = firstByID(actions)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  function visit(id: string): string[] | undefined {
    if (visiting.has(id)) {
      const start = stack.indexOf(id)
      return [...stack.slice(start), id]
    }
    if (visited.has(id)) return undefined
    const action = byID.get(id)
    if (!action) return undefined
    visiting.add(id)
    stack.push(id)
    for (const dep of action.dependsOn ?? []) {
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return undefined
  }

  for (const action of actions) {
    const cycle = visit(action.id)
    if (cycle) return cycle
  }
  return undefined
}

export function validateInspectActions(actions: readonly InspectAction[]): string[] {
  const errors: string[] = []
  if (actions.length === 0) errors.push("At least one action is required")
  if (actions.length > 16) errors.push("At most 16 actions are allowed")
  const seen = new Set<string>()
  for (const action of actions) {
    if (seen.has(action.id)) errors.push(`Duplicate action id: ${action.id}`)
    seen.add(action.id)
  }
  for (const action of actions) {
    for (const dep of action.dependsOn ?? []) {
      if (!seen.has(dep)) errors.push(`Action ${action.id} depends on unknown action: ${dep}`)
    }
  }
  const cycle = dependencyCycle(actions)
  if (cycle) errors.push(`Dependency cycle detected: ${cycle.join(" -> ")}`)
  return errors
}

export function planInspectRounds(actions: readonly InspectAction[]): InspectAction[][] {
  const errors = validateInspectActions(actions)
  if (errors.length) throw new Error(errors.join("; "))
  const pending = new Map(actions.map((action) => [action.id, action]))
  const completed = new Set<string>()
  const rounds: InspectAction[][] = []
  while (pending.size > 0) {
    const ready = actions.filter(
      (action) => pending.has(action.id) && (action.dependsOn ?? []).every((dep) => completed.has(dep)),
    )
    if (ready.length === 0) throw new Error("Dependency graph cannot make progress")
    rounds.push(ready)
    for (const action of ready) {
      pending.delete(action.id)
      completed.add(action.id)
    }
  }
  return rounds
}

type ActionResult = {
  id: string
  type: InspectAction["type"]
  status: "success" | "error" | "skipped"
  title?: string
  output?: string
  error?: string
  truncated?: boolean
}

export const InspectBatchTool = Tool.define(
  "inspect_batch",
  Effect.gen(function* () {
    const readInfo = yield* ReadTool
    const globInfo = yield* GlobTool
    const grepInfo = yield* GrepTool
    const read = yield* Tool.init(readInfo)
    const glob = yield* Tool.init(globInfo)
    const grep = yield* Tool.init(grepInfo)

    return {
      description: [
        "Run a bounded read-only inspection DAG in one tool call.",
        "Supports read, glob and grep only; at most 16 actions; dependencies must be explicit.",
        "Permissions are checked per action, errors stay local, and outputs are capped with provenance.",
      ].join(" "),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const actions = [...params.actions]
          const errors = validateInspectActions(actions)
          if (errors.length > 0) throw new Error(errors.join("\n"))
          const rounds = planInspectRounds(actions)
          const concurrency = Math.max(1, Math.min(8, params.maxConcurrency ?? 4))
          const maxChars = Math.max(1000, Math.min(20_000, params.maxCharsPerResult ?? 8_000))
          const results = new Map<string, ActionResult>()

          for (const round of rounds) {
            const completed = yield* Effect.forEach(
              round,
              (action) => {
                const blocked = (action.dependsOn ?? []).find((dep) => results.get(dep)?.status !== "success")
                if (blocked) {
                  return Effect.succeed<ActionResult>({
                    id: action.id,
                    type: action.type,
                    status: "skipped",
                    error: `Dependency ${blocked} did not complete successfully`,
                  })
                }
                const run = (() => {
                  if (action.type === "read") {
                    return read.execute(
                      { filePath: action.filePath, offset: action.offset, limit: action.limit },
                      ctx,
                    )
                  }
                  if (action.type === "glob") {
                    return glob.execute({ pattern: action.pattern, path: action.path }, ctx)
                  }
                  return grep.execute({ pattern: action.pattern, path: action.path, include: action.include }, ctx)
                })()
                return run.pipe(
                  Effect.match({
                    onFailure: (cause): ActionResult => ({
                      id: action.id,
                      type: action.type,
                      status: "error",
                      error: String(cause),
                    }),
                    onSuccess: (result): ActionResult => {
                      const truncated = result.output.length > maxChars
                      return {
                        id: action.id,
                        type: action.type,
                        status: "success",
                        title: result.title,
                        output: truncated ? result.output.slice(0, maxChars) + "\n... [inspect_batch result truncated]" : result.output,
                        truncated,
                      }
                    },
                  }),
                )
              },
              { concurrency },
            )
            for (const result of completed) results.set(result.id, result)
          }

          const ordered = actions.map((action) => results.get(action.id)!)
          const failed = ordered.filter((result) => result.status === "error").length
          const skipped = ordered.filter((result) => result.status === "skipped").length
          return {
            title: `inspect_batch: ${ordered.length} action(s), ${failed} error(s), ${skipped} skipped`,
            metadata: {
              actions: ordered.length,
              rounds: rounds.length,
              failed,
              skipped,
              truncated: ordered.filter((result) => result.truncated).map((result) => result.id),
              readOnly: true,
            },
            output: JSON.stringify({ readOnly: true, rounds: rounds.length, results: ordered }, null, 2),
          }
        }),
    }
  }),
)
