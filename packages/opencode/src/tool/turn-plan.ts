import { Effect, Schema } from "effect"
import { declare } from "@/session/turn-plan"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  intent: Schema.String.annotate({
    description: "The ONE action you will take at the start of your next turn, written as an imperative.",
  }),
  expect: Schema.String.annotate({
    description:
      "The observation that proves the action worked. It is compared against the real observation at the head of the next turn.",
  }),
  on_fail: Schema.optional(Schema.String).annotate({
    description: "The bounded fallback to run when the expectation is not observed.",
  }),
  stop_if: Schema.optional(Schema.String).annotate({
    description: "The condition that ends the turn.",
  }),
})

type Metadata = { declared: boolean }

export const TurnPlanTool = Tool.define<typeof Parameters, Metadata, never>(
  "turn_plan",
  Effect.gen(function* () {
    return {
      description:
        "Declare the next action before ending a turn that still leaves work open. The plan is a prediction held in run state, never in the message history: the harness shows the real observation against `expect` at the head of the next turn, and a contradicting observation invalidates it. Each declaration replaces the previous one. Never declare a plan you will not execute.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const plan = declare(ctx.sessionID, {
            intent: params.intent,
            expect: params.expect,
            onFail: params.on_fail,
            stopIf: params.stop_if,
          })
          if (!plan) {
            return {
              title: "turn_plan needs an intent and an expectation",
              metadata: { declared: false },
              output:
                "`intent` and `expect` are both required and must be non-empty: a declaration without them binds nothing, so nothing was recorded.",
            }
          }
          return {
            title: `Engagement declared: ${plan.intent}`,
            metadata: { declared: true },
            output: [
              `Recorded for this turn: intent "${plan.intent}", expecting "${plan.expect}".`,
              ...(plan.onFail ? [`Fallback if the expectation is not observed: ${plan.onFail}.`] : []),
              ...(plan.stopIf ? [`The turn ends when: ${plan.stopIf}.`] : []),
              "This is a prediction, not a fact. Act on it at the start of your next turn, and treat it as invalidated if the observation contradicts it.",
            ].join("\n"),
          }
        }),
    }
  }),
)
