import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"
import type { Plan } from "./state"

/**
 * Pre-turn plan. Jev reads the user's request before the loop starts and says
 * which phases the turn needs, so the model runs them in order and batches the
 * calls inside each one instead of discovering the shape of the work one tool
 * call at a time. It is the one hook that attacks the turn count itself: a
 * request that needs no tool is answered immediately, and a request that edits
 * is verified in the same pass rather than three turns later.
 *
 * Cost is one round-trip per user turn — the caller keeps the plan while the
 * request is unchanged — and any failure leaves the prompt untouched.
 */

export const MAX_PROMPT_CHARS = 4_000

/** Probability at or above which a `noul` answer counts as yes. */
export const PLAN_THRESHOLD = 0.5

/** Phases a coding turn can need, in the order they normally run. */
export const PLAN_STEPS = ["read", "edit", "verify", "build", "deploy", "commit"] as const

const SHAPES: Record<string, string> = {
  answer: "Nothing needs to be read or written; the request is answered from what is already known",
  retrieve: "Material is located and read; nothing is written",
  change: "Something is written or edited and then checked",
  deliver: "A shippable artifact is produced: build, deploy or release",
}

const MEANING: Record<(typeof PLAN_STEPS)[number], string> = {
  read: "open a file, read a log or search the workspace",
  edit: "write or change a file",
  verify: "run a test, a typecheck or a check command",
  build: "compile or package an artifact",
  deploy: "install, publish or release what was built",
  commit: "version the result in git",
}

export function planQuestions(prompt: string): Record<string, JevSchema.Question> {
  const excerpt = prompt.slice(0, MAX_PROMPT_CHARS)
  return {
    shape: {
      type: "choice",
      instructions: `Classify the user request below by the shape of the work it needs.\n\nREQUEST:\n${excerpt}`,
      criteria: SHAPES,
    },
    ...Object.fromEntries(
      PLAN_STEPS.map((step) => [
        `step_${step}`,
        {
          type: "noul" as const,
          instructions: `Below is a user request. Does completing it correctly necessarily require this phase: ${step} — to ${MEANING[step]}? Answer strictly about necessity: what the request cannot be completed without, not what would be helpful.\n\nREQUEST:\n${excerpt}`,
          criteria: {
            true: `The request cannot be completed correctly without the ${step} phase`,
            false: `The request does not require the ${step} phase`,
          },
        },
      ]),
    ),
  }
}

/** Returns `undefined` when Jev gave no usable shape, so the caller keeps the plain prompt. */
export const plan = Effect.fn("JevPlan.plan")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: { prompt: string; fingerprint: string },
) {
  const response = yield* JevClient.decide(
    http,
    { state: "Plan the next turn.", questions: planQuestions(input.prompt) },
    settings,
  )
  const shape = response.answers["shape"]
  if (shape?.type !== "choice") return undefined
  return {
    fingerprint: input.fingerprint,
    shape: shape.choice,
    steps: PLAN_STEPS.filter((step) => {
      const answer = response.answers[`step_${step}`]
      return answer?.type === "noul" && answer.noul >= PLAN_THRESHOLD
    }),
  } satisfies Plan
})

export function render(plan: Plan): string {
  const phases = plan.steps.length > 0 ? plan.steps.join(" -> ") : "none"
  return `[jev plan] shape=${plan.shape}; required phases=${phases}. Run the phases in order, batch every independent call inside a phase, and do not stop between them to report progress.`
}

export * as JevPlan from "./plan"
