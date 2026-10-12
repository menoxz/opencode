import { Effect, Option, Schema } from "effect"
import { Tool } from "./tool"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import type { GoalState } from "@/session/goal-state"

type Metadata = {
  focus: string
  mustKeep: string[]
  triggered: boolean
  version: number
}

const Parameters = Schema.Struct({
  focus: Schema.String.annotate({
    description:
      "What the summary must prioritize to keep the rest of this session productive: the goal, the decisions taken, the open threads, the constraints that still bind.",
  }),
  mustKeep: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "Facts, file paths, error strings or decisions that must survive summarization verbatim. Kept as a defensive list: never dropped.",
  }),
  reason: Schema.optional(Schema.String).annotate({
    description: "Why compaction is needed now (recorded with the focus).",
  }),
  compact: Schema.optional(Schema.Boolean).annotate({
    description:
      "Also trigger a compaction immediately after saving the focus (default: true). Set false to only update the focus for the next compaction.",
  }),
})

/**
 * The session's summarization prompt keeps a FIXED output contract: the section
 * template, the verbatim DoD/finding copy and the fallback rules are owned by the
 * harness (see session/compaction.ts). This tool lets the agent supply the part
 * that genuinely belongs to it — the *focus* and the *must-keep* list — and, by
 * persisting it on the session, applies the same steering to automatic compaction.
 */
export const CompactTool = Tool.define(
  "compact",
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    return {
      description:
        "Steer how this session is summarized before the context fills: save a persistent compaction focus (plus must-keep items) that the fixed summary template will honor, and compact now. The output structure stays fixed; only what it prioritizes changes.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const focus = params.focus.trim()
          const mustKeep = (params.mustKeep ?? []).map((item) => item.trim()).filter(Boolean)
          // One uniform result type: a union of per-branch metadata literals makes
          // `Tool.define` infer a narrower M per branch and reject the tool.
          const reply = (triggered: boolean, output: string, version: number): Tool.ExecuteResult<Metadata> => ({
            title: "compact",
            metadata: { focus, mustKeep, triggered, version },
            output,
          })
          if (!focus && mustKeep.length === 0) {
            return reply(false, "Provide a non-empty `focus` or `mustKeep`; nothing was changed.", 0)
          }

          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const previous = session.goalState ?? null
          const version = (previous?.compaction?.version ?? 0) + 1
          const profile = {
            focus,
            mustKeep,
            reason: params.reason?.trim() || undefined,
            version,
            updatedAt: Date.now(),
          }

          // The focus rides on the session's JSON contract carrier: a goalState may
          // be absent (no auto-goal) or hold an unrelated objective, so we keep a
          // skipped carrier rather than fabricating an objective.
          const base: GoalState = previous ?? {
            status: "skipped",
            source: "auto",
            goal: "",
            dod: [],
            outOfScope: [],
            version: 0,
            updatedAt: Date.now(),
          }
          yield* sessions.setGoalState({
            sessionID: ctx.sessionID,
            goalState: { ...base, compaction: profile, version: base.version + 1, updatedAt: Date.now() },
          })

          const shouldCompact = params.compact !== false
          if (!shouldCompact) {
            return reply(false, `Compaction focus saved (v${version}). It will steer the next compaction.`, version)
          }

          if (!session.model) {
            return reply(
              false,
              `Compaction focus saved (v${version}), but this session has no model bound, so no compaction was triggered.`,
              version,
            )
          }

          // Optional dependency: the registry must not gain a hard requirement on
          // the compaction service (it would ripple through every layer that builds
          // the tool catalogue). In a live session it is always in scope.
          const compaction = yield* Effect.serviceOption(SessionCompaction.Service)
          if (Option.isNone(compaction)) {
            return reply(
              false,
              `Compaction focus saved (v${version}), but no compaction service is available here; it will steer the next automatic compaction.`,
              version,
            )
          }

          yield* compaction.value.create({
            sessionID: ctx.sessionID,
            agent: ctx.agent,
            model: { providerID: session.model.providerID, modelID: session.model.id },
            // This tool is called by the agent from inside a turn. `auto: false`
            // keeps the part non-auto (the threshold did not fire), but without
            // `autocontinue` the run would end here and the agent would abandon
            // the very turn it compacted to protect.
            auto: false,
            autocontinue: true,
          })

          return reply(
            true,
            `Compaction focus saved (v${version}) and a compaction was queued; the summary will honor it. Your turn resumes automatically once the summary lands — do not ask the user to continue.`,
            version,
          )
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
