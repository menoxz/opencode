import * as Tool from "./tool"
import { BackgroundJob } from "@/background/job"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Identifier } from "@/id/id"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { PositiveInt } from "@opencode-ai/core/schema"
import { Cause, Effect, Exit, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<MessageV2.WithParts>
}

const id = "swarm"

// ── Schema ────────────────────────────────────────────────────────────────

export const SwarmTaskSchema = Schema.Struct({
  id: Schema.String.annotate({ description: "Unique task id within this swarm (e.g. 'research-apis')" }),
  description: Schema.String.annotate({ description: "Short description of the task" }),
  prompt: Schema.String.annotate({
    description:
      "Self-contained instructions for the sub-agent: goal, exact work, required output format, what NOT to touch. The sub-agent cannot ask questions, so include paths and expectations.",
  }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to run this task" }),
  depends: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Ids of tasks that must succeed before this one runs. Tasks without depends run in the first wave, in parallel.",
  }),
  optional: Schema.optional(Schema.Boolean).annotate({
    description: "If true, a failure of this task does not block its dependents.",
  }),
})
export type SwarmTask = Schema.Schema.Type<typeof SwarmTaskSchema>

export const Parameters = Schema.Struct({
  objective: Schema.String.annotate({
    description: "The shared goal the whole swarm works toward. Used in the report and progress events.",
  }),
  tasks: Schema.Array(SwarmTaskSchema).annotate({
    description:
      "The work items. Independent tasks run in parallel waves; tasks with `depends` run after their dependencies succeed.",
  }),
  concurrency: Schema.optional(PositiveInt).annotate({
    description: "Max number of sub-agents running at once per wave (default 4).",
  }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "Run the whole swarm in the background. You will be notified when it completes.",
  }),
})
export type SwarmParameters = Schema.Schema.Type<typeof Parameters>

// ── Bus events (observability: server/TUI can stream swarm progress) ─────

export const SwarmStarted = BusEvent.define(
  "swarm.started",
  Schema.Struct({
    swarmId: Schema.String,
    objective: Schema.String,
    taskCount: Schema.Number,
  }),
)

export const SwarmTaskEvent = BusEvent.define(
  "swarm.task",
  Schema.Struct({
    swarmId: Schema.String,
    taskId: Schema.String,
    sessionId: Schema.optional(Schema.String),
    status: Schema.Literals(["running", "success", "failed", "skipped"]),
    durationMs: Schema.optional(Schema.Number),
    error: Schema.optional(Schema.String),
  }),
)

export const SwarmCompleted = BusEvent.define(
  "swarm.completed",
  Schema.Struct({
    swarmId: Schema.String,
    status: Schema.Literals(["success", "failed", "interrupted"]),
    durationMs: Schema.Number,
    failed: Schema.Array(Schema.String),
    skipped: Schema.Array(Schema.String),
  }),
)

// ── Pure planning helpers (unit-testable) ─────────────────────────────────

export interface SwarmPlan {
  waves: SwarmTask[][]
  problems: string[]
}

/**
 * Topological wave planning for a swarm: independent tasks share a wave and
 * run in parallel; `depends` edges push tasks into later waves. Returns the
 * ordered waves, or a list of validation problems (duplicate ids, unknown
 * depends, dependency cycles) when the graph cannot be planned.
 */
export function planSwarm(tasks: readonly SwarmTask[]): SwarmPlan {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const task of tasks) {
    if (seen.has(task.id)) problems.push(`duplicate task id: ${task.id}`)
    seen.add(task.id)
  }
  const byId = new Map(tasks.map((task) => [task.id, task]))
  for (const task of tasks) {
    for (const dep of task.depends ?? []) {
      if (!byId.has(dep)) problems.push(`task ${task.id} depends on unknown task: ${dep}`)
    }
  }
  if (problems.length > 0) return { waves: [], problems }

  const level = new Map<string, number>()
  const visiting = new Set<string>()
  const CYCLIC = Infinity
  const visit = (taskID: string): number => {
    const existing = level.get(taskID)
    if (existing !== undefined) return existing
    if (visiting.has(taskID)) return CYCLIC
    visiting.add(taskID)
    const deps = (byId.get(taskID)?.depends ?? []).map(visit)
    visiting.delete(taskID)
    if (deps.includes(CYCLIC)) {
      level.set(taskID, CYCLIC)
      return CYCLIC
    }
    const taskLevel = Math.max(0, ...deps.map((depth) => depth + 1))
    level.set(taskID, taskLevel)
    return taskLevel
  }
  const cyclic: string[] = []
  for (const task of tasks) {
    if (visit(task.id) === CYCLIC) cyclic.push(task.id)
  }
  if (cyclic.length > 0) return { waves: [], problems: [`dependency cycle detected: ${cyclic.join(", ")}`] }

  const maxLevel = Math.max(...level.values())
  const waves: SwarmTask[][] = Array.from({ length: maxLevel + 1 }, () => [])
  for (const task of tasks) waves[level.get(task.id)!]!.push(task)
  return { waves, problems: [] }
}

// ── Output rendering ──────────────────────────────────────────────────────

function escapeMarkup(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export interface SwarmTaskResult {
  task: SwarmTask
  sessionID?: SessionID
  status: "success" | "failed" | "skipped"
  output?: string
  error?: string
  reason?: string
  durationMs: number
}

export function renderSwarmReport(input: {
  swarmId: string
  objective: string
  results: SwarmTaskResult[]
  waves: number
  durationMs: number
}) {
  const succeeded = input.results.filter((r) => r.status === "success").length
  const lines = [
    `<swarm id="${input.swarmId}" objective="${escapeMarkup(input.objective)}" state="completed">`,
    "<summary>",
    `Swarm "${escapeMarkup(input.objective)}" completed: ${succeeded}/${input.results.length} tasks succeeded in ${input.waves} wave(s) (${input.durationMs}ms).`,
    "</summary>",
  ]
  for (const result of input.results) {
    const attrs = [`id="${escapeMarkup(result.task.id)}"`, `state="${result.status}"`]
    if (result.sessionID) attrs.push(`session="${result.sessionID}"`)
    if (result.durationMs > 0) attrs.push(`duration="${result.durationMs}ms"`)
    lines.push(`<swarm_task ${attrs.join(" ")}>`)
    if (result.status === "skipped") {
      lines.push(escapeMarkup(result.reason ?? "skipped"))
    } else if (result.status === "failed") {
      lines.push(`<error>${escapeMarkup(result.error ?? "unknown error")}</error>`)
    } else {
      lines.push(escapeMarkup(result.output ?? ""))
    }
    lines.push("</swarm_task>")
  }
  lines.push("</swarm>")
  return lines.join("\n")
}

function renderBackgroundStarted(input: { swarmId: string; objective: string }) {
  return [
    `<swarm id="${input.swarmId}" objective="${escapeMarkup(input.objective)}" state="running">`,
    "<summary>Background swarm started</summary>",
    "<task_result>",
    "Background swarm started. You will be notified automatically when it finishes; do not poll for progress.",
    "Do not duplicate its work. Continue only with non-overlapping work, or stop if there is nothing else useful to do.",
    "</task_result>",
    "</swarm>",
  ].join("\n")
}

function renderBackgroundCompleted(input: { swarmId: string; objective: string; state: "completed" | "error"; text: string }) {
  const tag = input.state === "completed" ? "task_result" : "task_error"
  const title =
    input.state === "completed"
      ? `Background swarm completed: ${input.objective}`
      : `Background swarm failed: ${input.objective}`
  return [
    `<swarm id="${input.swarmId}" objective="${escapeMarkup(input.objective)}" state="${input.state}">`,
    `<summary>${escapeMarkup(title)}</summary>`,
    `<${tag}>`,
    escapeMarkup(input.text),
    `</${tag}>`,
    "</swarm>",
  ].join("\n")
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

// ── Tool ──────────────────────────────────────────────────────────────────

interface SwarmMetadata {
  swarmId: string
  objective: string
  parentSessionId: SessionID
  background?: boolean
  sessionIds?: SessionID[]
  failed?: string[]
  skipped?: string[]
  sessionId?: SessionID
  jobId?: string
}

export const SwarmTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const bus = yield* Bus.Service
    const scope = yield* Scope.Scope
    const flags = yield* RuntimeFlags.Service

    const run = Effect.fn("SwarmTool.execute")(function* (
      params: SwarmParameters,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()
      const runInBackground = params.background === true
      if (runInBackground && !flags.experimentalBackgroundSubagents) {
        return yield* Effect.fail(
          new Error("Background swarms require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"),
        )
      }

      if (!ctx.extra?.bypassAgentCheck) {
        const types = [...new Set(params.tasks.map((task) => task.subagent_type))]
        yield* ctx.ask({
          permission: id,
          patterns: ["*"],
          always: ["*"],
          metadata: { description: params.objective, taskCount: params.tasks.length },
        })
        yield* ctx.ask({
          permission: "task",
          patterns: types,
          always: ["*"],
          metadata: { description: params.objective, subagent_types: types },
        })
      }

      const plan = planSwarm(params.tasks)
      if (plan.problems.length > 0) {
        return yield* Effect.fail(new Error(`Cannot plan swarm: ${plan.problems.join("; ")}`))
      }

      const resolved = new Map<string, Agent.Info>()
      for (const task of params.tasks) {
        if (resolved.has(task.subagent_type)) continue
        const info = yield* agent.get(task.subagent_type)
        if (!info) {
          return yield* Effect.fail(
            new Error(`Unknown agent type: ${task.subagent_type} is not a valid agent type (task ${task.id})`),
          )
        }
        resolved.set(task.subagent_type, info)
      }

      const parent = yield* sessions.get(ctx.sessionID)
      const parentAgent = parent.agent
        ? yield* agent.get(parent.agent).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(Effect.orDie)
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))
      // Narrowed at top level so closures (runTask) keep the model fields.
      const assistantMsg = msg.info

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("SwarmTool requires promptOps in ctx.extra"))

      const swarmId = Identifier.create("swarm", "ascending")
      const concurrency = params.concurrency ?? 4
      const swarmStart = Date.now()
      const results = new Map<string, SwarmTaskResult>()
      const created: SessionID[] = []
      const failed = new Set<string>()
      const skipped = new Set<string>()

      const publishTaskEvent = Effect.fnUntraced(function* (
        task: SwarmTask,
        status: "running" | "success" | "failed" | "skipped",
        extra?: Partial<{ sessionId: SessionID; durationMs: number; error: string; reason: string }>,
      ) {
        yield* bus.publish(SwarmTaskEvent, {
          swarmId,
          taskId: task.id,
          sessionId: extra?.sessionId,
          status,
          durationMs: extra?.durationMs,
          error: extra?.error ?? extra?.reason,
        })
      })

      const runTask = Effect.fn("SwarmTool.runTask")(function* (task: SwarmTask) {
        const taskStart = Date.now()
        const deps = task.depends ?? []
        const depFailed = deps.some((dep) => failed.has(dep) && !(params.tasks.find((t) => t.id === dep)?.optional))
        if (depFailed) {
          const blockers = deps.filter((dep) => failed.has(dep))
          const result: SwarmTaskResult = {
            task,
            status: "skipped",
            reason: `dependency failed: ${blockers.join(", ")}`,
            durationMs: 0,
          }
          results.set(task.id, result)
          skipped.add(task.id)
          yield* publishTaskEvent(task, "skipped", { reason: result.reason })
          return
        }

        const next = resolved.get(task.subagent_type)!
        const nextSession = yield* sessions.create({
          parentID: ctx.sessionID,
          title: `[swarm] ${task.description} (@${next.name})`,
          agent: next.name,
          permission: [
            ...deriveSubagentSessionPermission({
              parentSessionPermission: parent.permission ?? [],
              parentAgent,
              subagent: next,
            }),
            ...(cfg.experimental?.primary_tools?.map((item) => ({
              pattern: "*",
              action: "allow" as const,
              permission: item,
            })) ?? []),
          ],
        })
        created.push(nextSession.id)
        yield* publishTaskEvent(task, "running", { sessionId: nextSession.id })

        const model = next.model ?? {
          modelID: assistantMsg.modelID,
          providerID: assistantMsg.providerID,
        }
        const parts = yield* ops.resolvePromptParts(task.prompt)
        const exit = yield* ops
          .prompt({
            messageID: MessageID.ascending(),
            sessionID: nextSession.id,
            model: {
              modelID: model.modelID,
              providerID: model.providerID,
            },
            agent: next.name,
            tools: {
              ...(next.permission.some((rule) => rule.permission === "todowrite") ? {} : { todowrite: false }),
              ...(next.permission.some((rule) => rule.permission === "task") ? {} : { task: false }),
              ...(next.permission.some((rule) => rule.permission === id) ? {} : { swarm: false }),
              ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
            },
            parts,
          })
          .pipe(Effect.exit)

        const durationMs = Date.now() - taskStart
        if (Exit.isFailure(exit)) {
          const error = errorText(Cause.squash(exit.cause))
          const result: SwarmTaskResult = {
            task,
            sessionID: nextSession.id,
            status: "failed",
            error,
            durationMs,
          }
          results.set(task.id, result)
          failed.add(task.id)
          yield* publishTaskEvent(task, "failed", { sessionId: nextSession.id, durationMs, error })
          return
        }

        const output =
          exit.value.parts.findLast((part: MessageV2.Part) => part.type === "text")?.text ?? ""
        const result: SwarmTaskResult = {
          task,
          sessionID: nextSession.id,
          status: "success",
          output,
          durationMs,
        }
        results.set(task.id, result)
        yield* publishTaskEvent(task, "success", { sessionId: nextSession.id, durationMs })
      })

      const runSwarm = Effect.fn("SwarmTool.runSwarm")(function* () {
        yield* bus.publish(SwarmStarted, {
          swarmId,
          objective: params.objective,
          taskCount: params.tasks.length,
        })
        for (const wave of plan.waves) {
          yield* Effect.forEach(wave, runTask, { concurrency: Math.min(concurrency, wave.length) })
        }
        const durationMs = Date.now() - swarmStart
        const finalResults = params.tasks
          .map((task) => results.get(task.id))
          .filter((result): result is SwarmTaskResult => result !== undefined)
        yield* bus.publish(SwarmCompleted, {
          swarmId,
          status: failed.size === 0 ? "success" : "failed",
          durationMs,
          failed: [...failed],
          skipped: [...skipped],
        })
        return renderSwarmReport({
          swarmId,
          objective: params.objective,
          results: finalResults,
          waves: plan.waves.length,
          durationMs,
        })
      })

      const injectBackgroundResult = Effect.fn("SwarmTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            parts: [
              {
                type: "text",
                synthetic: true,
                text: renderBackgroundCompleted({
                  swarmId,
                  objective: params.objective,
                  state,
                  text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const metadata: SwarmMetadata = {
        swarmId,
        objective: params.objective,
        parentSessionId: ctx.sessionID,
        ...(runInBackground ? { background: true } : {}),
      }

      yield* ctx.metadata({
        title: `swarm: ${params.objective}`,
        metadata,
      })

      if (runInBackground) {
        const container = yield* sessions.create({
          parentID: ctx.sessionID,
          title: `[swarm] ${params.objective}`,
          agent: ctx.agent,
        })
        const info = yield* background.start({
          id: container.id,
          type: id,
          title: params.objective,
          metadata: { ...metadata, sessionId: container.id },
          run: runSwarm().pipe(
            Effect.tap((text) => injectBackgroundResult("completed", text).pipe(Effect.ignore)),
            Effect.catchCause((cause) =>
              (Cause.hasInterruptsOnly(cause)
                ? Effect.void
                : injectBackgroundResult("error", errorText(Cause.squash(cause))).pipe(Effect.ignore)
              ).pipe(Effect.andThen(Effect.failCause(cause))),
            ),
          ),
        })

        const bgMetadata: SwarmMetadata = {
          ...metadata,
          sessionId: container.id,
          jobId: info.id,
        }
        return {
          title: `swarm: ${params.objective}`,
          metadata: bgMetadata,
          output: renderBackgroundStarted({ swarmId, objective: params.objective }),
        }
      }

      const runCancel = yield* EffectBridge.make()
      const cancelCreated = Effect.gen(function* () {
        for (const sessionID of created) {
          yield* ops.cancel(sessionID).pipe(Effect.ignore)
        }
      })
      function onAbort() {
        runCancel.fork(cancelCreated)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            const output = yield* runSwarm()
            const resultMetadata: SwarmMetadata = {
              ...metadata,
              sessionIds: created,
              failed: [...failed],
              skipped: [...skipped],
            }
            return {
              title: `swarm: ${params.objective}`,
              metadata: resultMetadata,
              output,
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit)) {
              yield* cancelCreated
              yield* bus
                .publish(SwarmCompleted, {
                  swarmId,
                  status: "interrupted",
                  durationMs: Date.now() - swarmStart,
                  failed: [...failed],
                  skipped: [...skipped],
                })
                .pipe(Effect.ignore)
            }
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                ctx.abort.removeEventListener("abort", onAbort)
              }),
            ),
          ),
      )
    })

    return {
      description:
        "Run a swarm of sub-agents: decompose a goal into independent tasks, execute them in parallel waves (respecting `depends`), and return an aggregated report. Use for goals with several independent work items. Each task runs a specialized sub-agent in its own session; tasks in the same wave run concurrently.",
      parameters: Parameters,
      execute: (params: SwarmParameters, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
