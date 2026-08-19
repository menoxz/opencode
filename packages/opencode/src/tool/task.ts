import * as Tool from "./tool"
import DESCRIPTION from "./task.txt"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import { deriveSubagentSessionPermission } from "../agent/subagent-permissions"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "@/config/config"
import { Cause, Duration, Effect, Exit, Option, Schema, Scope } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { boundSubagentResult, SUBAGENT_RESULT_CONTRACT } from "./subagent-summary"
import { hasTaskResultNotification, taskResultNotificationKey } from "./task-notification"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): Effect.Effect<void>
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<MessageV2.WithParts>
}

const id = "task"
const BACKGROUND_DESCRIPTION = [
  "",
  "",
  [
    "Background mode: background=true launches the subagent asynchronously and returns its task id immediately,",
    "so you never have to sit idle waiting for it. You are notified automatically when it finishes.",
    "Foreground is the default; use it when the very next thing you do depends on the result.",
  ].join(" "),
  "",
  [
    "Follow up on a background task with task_id and action:",
    "action=check reports whether it is still running and returns what it has written so far, without disturbing it;",
    "action=wait blocks until it finishes and returns its result.",
    "Prefer check when you can keep working, wait when you genuinely cannot proceed without it.",
  ].join(" "),
].join("\n")

const BaseParameterFields = {
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
}

export const Parameters = Schema.Struct({
  ...BaseParameterFields,
  background: Schema.optional(Schema.Boolean).annotate({
    description: "Run the agent in the background. You will be notified when it completes.",
  }),
  action: Schema.optional(Schema.Literals(["check", "wait"])).annotate({
    description:
      "Follow up on an existing task_id instead of starting work: check reports its progress so far, wait blocks until it finishes.",
  }),
  timeout_minutes: Schema.optional(Schema.Number).annotate({
    description: "Only with action=wait: give up waiting after this many minutes and report the task as still running.",
  }),
})

function escapeTaskMarkup(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function output(sessionID: SessionID, text: string) {
  return [`<task id="${sessionID}" state="completed">`, "<task_result>", escapeTaskMarkup(text), "</task_result>", "</task>"].join("\n")
}

/**
 * Optional wall-clock ceiling for a subagent.
 *
 * A ceiling was once the answer to a subagent stalling the parent for an hour,
 * but it cut real work in half to solve a waiting problem. The parent no longer
 * has to wait — it can launch in the background, keep working, check progress
 * and be notified on completion — so a long subagent is no longer a stall and
 * needs no ceiling. Set OPENCODE_TASK_BUDGET_MINUTES to reinstate one.
 */
function taskBudgetMinutes() {
  const raw = Number(process.env["OPENCODE_TASK_BUDGET_MINUTES"])
  return Number.isFinite(raw) && raw > 0 ? raw : undefined
}

function withBudget<A, E, R>(effect: Effect.Effect<A, E, R>, minutes: number | undefined) {
  return minutes === undefined
    ? effect.pipe(Effect.map(Option.some))
    : effect.pipe(Effect.timeoutOption(Duration.minutes(minutes)))
}

function budgetOutput(sessionID: SessionID, minutes: number, partial: string) {
  return [
    `<task id="${sessionID}" state="budget_exceeded">`,
    `<summary>Subagent cancelled after its ${minutes}-minute time budget.</summary>`,
    "<task_result>",
    partial.length > 0
      ? escapeTaskMarkup(partial)
      : "The subagent produced no text output before the budget was reached.",
    "</task_result>",
    "<guidance>",
    "This subagent was stopped, not completed — treat the result above as partial and unverified.",
    "Do not simply relaunch the same task: it will hit the same ceiling. Either split it into a smaller, sharper task, or do the remaining work directly.",
    `Its full transcript is preserved in session ${sessionID}.`,
    "</guidance>",
    "</task>",
  ].join("\n")
}

/** Latest text a child has written, used for progress reads and salvage alike. */
const childText = Effect.fn("TaskTool.childText")(function* (sessions: Session.Interface, sessionID: SessionID) {
  const messages = yield* sessions
    .messages({ sessionID })
    .pipe(Effect.catch(() => Effect.succeed([] as MessageV2.WithParts[])))
  return messages
    .flatMap((message) => message.parts.filter((part) => part.type === "text").map((part) => part.text))
    .slice(-3)
    .join("\n\n")
    .slice(-4000)
})

function statusOutput(input: {
  sessionID: SessionID
  status: "running" | "completed" | "error" | "cancelled" | "unknown"
  partial: string
  waited?: boolean
}) {
  const running = input.status === "running"
  return [
    `<task id="${input.sessionID}" state="${running ? "running" : input.status}">`,
    `<summary>${
      running
        ? input.waited
          ? "Still running when the wait expired."
          : "Still running."
        : `Finished with status ${input.status}.`
    }</summary>`,
    "<task_result>",
    input.partial.length > 0 ? escapeTaskMarkup(input.partial) : "The subagent has not written any text yet.",
    "</task_result>",
    ...(running
      ? [
          "<guidance>",
          "This is a progress read, not a result: the work above is unfinished and unverified.",
          "The subagent is still working and will notify you when it finishes — do not relaunch it, and do not poll in a loop.",
          "</guidance>",
        ]
      : []),
    "</task>",
  ].join("\n")
}

function backgroundOutput(sessionID: SessionID) {  return [
    `<task id="${sessionID}" state="running">`,
    "<summary>Background task started</summary>",
    "<task_result>",
    "Background task started. You will be notified automatically when it finishes; do not poll for progress.",
    "Do not duplicate its work. Continue only with non-overlapping work, or stop if there is nothing else useful to do.",
    "</task_result>",
    "</task>",
  ].join("\n")
}

function backgroundMessage(input: {
  sessionID: SessionID
  description: string
  state: "completed" | "error" | "budget_exceeded"
  text: string
}) {
  const tag = input.state === "completed" ? "task_result" : input.state === "error" ? "task_error" : "task_partial"
  const title =
    input.state === "completed"
      ? `Background task completed: ${input.description}`
      : input.state === "error"
        ? `Background task failed: ${input.description}`
        : `Background task stopped at its time budget: ${input.description}`
  return [
    `<task id="${input.sessionID}" state="${input.state}">`,
    `<summary>${escapeTaskMarkup(title)}</summary>`,
    `<${tag}>`,
    escapeTaskMarkup(input.text),
    `</${tag}>`,
    ...(input.state === "budget_exceeded"
      ? [
          "<guidance>",
          "This subagent was stopped, not completed — the result above is partial and unverified.",
          "Do not relaunch the same task unchanged: it will hit the same ceiling.",
          "</guidance>",
        ]
      : []),
    "</task>",
  ].join("\n")
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function validateTaskSession(input: {
  taskID: SessionID
  session: Session.Info
  parentSessionID: SessionID
  subagent: Agent.Info
}) {
  if (input.session.parentID !== input.parentSessionID) {
    return Effect.fail(
      new Error(
        `Cannot resume task ${input.taskID}: it does not belong to parent session ${input.parentSessionID}.`,
      ),
    )
  }
  if (input.session.agent && input.session.agent !== input.subagent.name) {
    return Effect.fail(
      new Error(
        `Cannot resume task ${input.taskID}: it was created for agent ${input.session.agent}, not ${input.subagent.name}.`,
      ),
    )
  }
  return Effect.succeed(input.session)
}

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const background = yield* BackgroundJob.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const flags = yield* RuntimeFlags.Service
    const scope = yield* Scope.Scope

    const run = Effect.fn("TaskTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      const cfg = yield* config.get()

      // Follow-up on an existing task: report progress, or wait for the end.
      // The parent stays free to work while a subagent runs, so it never has to
      // choose between blocking on a child and abandoning it.
      if (params.action) {
        if (!params.task_id)
          return yield* Effect.fail(new Error(`action=${params.action} requires the task_id of an existing task.`))
        const target = SessionID.make(params.task_id)
        const child = yield* sessions.get(target).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (!child || child.parentID !== ctx.sessionID)
          return yield* Effect.fail(new Error(`Task ${target} does not belong to this session.`))

        const job =
          params.action === "wait"
            ? yield* background
                .wait({
                  id: target,
                  ...(params.timeout_minutes ? { timeout: params.timeout_minutes * 60_000 } : {}),
                })
                .pipe(Effect.map((result) => result.info))
            : yield* background.get(target)
        // A finished task reports exactly what the parent would have received;
        // a running one can only offer the transcript it has written so far.
        const rawReport =
          job?.status === "completed" && job.output
            ? job.output
            : job?.status === "error" && job.error
              ? job.error
              : yield* childText(sessions, target)
        const report = flags.experimentalBoundedSubagentResults
          ? boundSubagentResult(rawReport).text
          : rawReport

        // Only a background task can be followed up on: the parent is blocked for
        // a foreground one, so it can never reach this branch.
        const followUpMetadata: { parentSessionId: SessionID; sessionId: SessionID; background?: boolean } = {
          parentSessionId: ctx.sessionID,
          sessionId: target,
          background: true,
        }

        return {
          title: params.description,
          metadata: followUpMetadata,
          output: statusOutput({
            sessionID: target,
            status: job?.status ?? "unknown",
            partial: report,
            waited: params.action === "wait",
          }),
        }
      }

      // A subagent only ever sees this prompt, so an elided one silently starves it.
      // Historical tool inputs replay as structural markers, never as inline text, so
      // an elision here means the model copied a rendering instead of writing a brief.
      if (/(?:… \[\d+ chars\]|\[\+\d+ more items\])\s*$/.test(params.prompt)) {
        return yield* Effect.fail(
          new Error(
            "Prompt is truncated: it contains a context-elision marker instead of the full brief. Resend the complete prompt.",
          ),
        )
      }
      const runInBackground = params.background === true

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      const parent = yield* sessions.get(ctx.sessionID)
      const parentAgent = parent.agent
        ? yield* agent.get(parent.agent).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const session = params.task_id
        ? yield* sessions
            .get(SessionID.make(params.task_id))
            .pipe(
              Effect.catchCause(() =>
                Effect.fail(new Error(`Cannot resume task ${params.task_id}: task_id does not exist.`)),
              ),
              Effect.andThen((item) =>
                validateTaskSession({
                  taskID: SessionID.make(params.task_id!),
                  session: item,
                  parentSessionID: ctx.sessionID,
                  subagent: next,
                }),
              ),
            )
        : undefined
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
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
        }))

      const msg = yield* MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }).pipe(Effect.orDie)
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      const model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }
      const metadata = {
        parentSessionId: ctx.sessionID,
        sessionId: nextSession.id,
        model,
        ...(runInBackground ? { background: true } : {}),
      }

      yield* ctx.metadata({
        title: params.description,
        metadata,
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const runTask = Effect.fn("TaskTool.runTask")(function* () {
        const prompt = flags.experimentalBoundedSubagentResults
          ? params.prompt + SUBAGENT_RESULT_CONTRACT
          : params.prompt
        const parts = yield* ops.resolvePromptParts(prompt)
        const result = yield* ops.prompt({
          messageID: MessageID.ascending(),
          sessionID: nextSession.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          agent: next.name,
          tools: {
            ...(next.permission.some((rule) => rule.permission === "todowrite") ? {} : { todowrite: false }),
            ...(next.permission.some((rule) => rule.permission === id) ? {} : { task: false }),
            ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
          },
          parts,
        })
        return result.parts.findLast((item) => item.type === "text")?.text ?? ""
      })

      // Salvage whatever the child wrote before it was stopped. The transcript
      // is persisted as it goes, so a cancelled subagent still has usable work.
      const partialText = () => childText(sessions, nextSession.id)

      const inject = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error" | "budget_exceeded",
        text: string,
      ) {
        const bounded = flags.experimentalBoundedSubagentResults
          ? boundSubagentResult(text)
          : { text, truncated: false, sticky: [] }
        const notificationKey = taskResultNotificationKey(nextSession.id, state)
        const parentMessages = yield* sessions.messages({ sessionID: ctx.sessionID })
        if (hasTaskResultNotification(parentMessages, notificationKey)) return
        const currentParent = yield* sessions.get(ctx.sessionID)
        yield* ops
          .prompt({
            sessionID: ctx.sessionID,
            agent: currentParent.agent ?? ctx.agent,
            // Persist the report and expose it to the current/next real turn,
            // but never turn each child completion into another model run.
            noReply: true,
            parts: [
              {
                type: "text",
                synthetic: true,
                metadata: { background_notification: true, task_result_key: notificationKey },
                text: backgroundMessage({
                  sessionID: nextSession.id,
                  description: params.description,
                  state,
                  text: bounded.text,
                }),
              },
            ],
          })
          .pipe(Effect.ignore, Effect.forkIn(scope, { startImmediately: true }))
      })

      const existing = yield* background.get(nextSession.id)
      if (existing?.status === "running") {
        return yield* Effect.fail(new Error(`Task ${nextSession.id} is already running.`))
      }

      if (runInBackground) {
        const minutes = taskBudgetMinutes()
        const info = yield* background.start({
          id: nextSession.id,
          type: id,
          title: params.description,
          metadata,
          // A background subagent cannot stall the parent, but it can still burn
          // tokens forever unattended. Same ceiling as the foreground path.
          run: withBudget(runTask(), minutes).pipe(
            Effect.flatMap((text) =>
              Option.isSome(text)
                ? inject("completed", text.value).pipe(Effect.ignore, Effect.as(text.value))
                : ops.cancel(nextSession.id).pipe(
                    Effect.ignore,
                    Effect.andThen(partialText()),
                    Effect.tap((partial) => inject("budget_exceeded", partial).pipe(Effect.ignore)),
                  ),
            ),
            Effect.catchCause((cause) =>
              (Cause.hasInterruptsOnly(cause)
                ? Effect.void
                : inject("error", errorText(Cause.squash(cause))).pipe(Effect.ignore)
              ).pipe(Effect.andThen(Effect.failCause(cause))),
            ),
          ),
        })

        return {
          title: params.description,
          metadata: {
            ...metadata,
            jobId: info.id,
          },
          output: backgroundOutput(nextSession.id),
        }
      }

      const runCancel = yield* EffectBridge.make()
      const cancel = ops.cancel(nextSession.id)

      function onAbort() {
        runCancel.fork(cancel)
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", onAbort)
        }),
        () =>
          Effect.gen(function* () {
            const minutes = taskBudgetMinutes()
            const text = yield* withBudget(runTask(), minutes)

            // Budget exceeded: cancel the child, then salvage whatever it wrote.
            // The transcript is already persisted, so the work is not lost.
            if (Option.isNone(text)) {
              yield* cancel.pipe(Effect.ignore)
              const partial = yield* partialText()
              return {
                title: params.description,
                metadata,
                output: budgetOutput(nextSession.id, minutes ?? 0, partial),
              }
            }

            const bounded = flags.experimentalBoundedSubagentResults
              ? boundSubagentResult(text.value)
              : { text: text.value, truncated: false, sticky: [] }
            return {
              title: params.description,
              metadata: {
                ...metadata,
                ...(bounded.truncated ? { resultTruncated: true } : {}),
                ...(bounded.sticky.length ? { stickyFindings: bounded.sticky } : {}),
              },
              output: output(nextSession.id, bounded.text),
            }
          }),
        (_, exit) =>
          Effect.gen(function* () {
            if (Exit.hasInterrupts(exit)) yield* cancel
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
      description: DESCRIPTION + BACKGROUND_DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
