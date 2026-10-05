import { Effect } from "effect"
import type { HttpClient } from "effect/unstable/http"
import { JevBrowserActionSpace } from "./action-space"
import { JevClient } from "./client"
import { JevBrowserValidate } from "./validate"
import type { Element } from "./validate"

/**
 * One browser step: observe the page, ask one System One question set, decide.
 *
 * The point of composing here rather than in a caller is the failure shape. A
 * step can only come back `decided` or `abstained`, and an abstention always
 * carries a reason. There is no third path in which the loop receives a
 * half-decided answer and has to guess — the refusal cases (no key, refused
 * endpoint, malformed probabilities, unknown element index) all land in the same
 * place, where the caller's own deterministic policy applies and is correct on
 * its own.
 *
 * This is the property that lets the layer sit beside the existing LLM tool loop
 * without replacing it: `abstained` is not an error, it is the layer declining.
 */

export interface Step {
  readonly goal: string
  readonly observed: JevBrowserActionSpace.Observation
  readonly rules?: readonly string[]
}

export type AbstainReason = "not_configured" | "call_failed" | "rejected"

export interface Decided {
  readonly kind: "decided"
  readonly space: JevBrowserActionSpace.Space
  readonly operation: string
  readonly confidence: number
  readonly index?: number
  readonly element?: Element
}

export interface Abstained {
  readonly kind: "abstained"
  readonly space: JevBrowserActionSpace.Space
  readonly reason: AbstainReason
  readonly detail: string
}

export type Outcome = Decided | Abstained

/** The request this step would send, without sending it. Cheap and pure. */
export function preview(step: Step): JevBrowserActionSpace.Space {
  return JevBrowserActionSpace.space(step.goal, step.observed, step.rules ?? [])
}

/**
 * The number of questions a call may carry, as the locked provider accepts it.
 *
 * The action space emits one head per targetable operation, so a future operation
 * that nobody re-checked against the endpoint cap would turn every step into a
 * silent fallback. Keeping the assertion next to the composition makes the cap a
 * compile-time-ish invariant rather than a comment.
 */
export function questionCount(step: Step): number {
  return Object.keys(preview(step).questions).length
}

/**
 * Ask one System One question set about the page and validate the answer.
 *
 * `settings` are the harness' own Jev settings: the provider is pinned by
 * `JevClient`, so the only thing a caller can still influence is an explicit
 * Command Code host or model, and an explicit key for an environment without one.
 */
/**
 * Turn any failure of the call into an abstention, whatever channel it arrived in.
 *
 * `JevClient.decide` raises `Schema.TaggedErrorClass` failures, which effect v4
 * routes to the defect channel, so a typed-error handler never sees them. Reading
 * `_tag` and `message` off an `unknown` keeps the distinction that matters to a
 * caller — "no key configured" is a configuration state, anything else is a
 * failure — without pretending the failure carries more structure than it does.
 */
function abstain(space: JevBrowserActionSpace.Space, failure: unknown): Abstained {
  const record = typeof failure === "object" && failure !== null ? (failure as Record<string, unknown>) : {}
  const tag = typeof record._tag === "string" ? record._tag : undefined
  const message = typeof record.message === "string" ? record.message : String(failure)
  return {
    kind: "abstained",
    space,
    reason: tag === "JevNotConfiguredError" ? "not_configured" : "call_failed",
    detail: message,
  }
}

export const run = Effect.fn("JevBrowserPolicy.run")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  step: Step,
) {
  const space = preview(step)

  const answered = yield* JevClient.decide(http, { state: space.state, questions: space.questions }, settings).pipe(
    Effect.catch((failure) =>
      Effect.gen(function* () {
        const result = abstain(space, failure)
        yield* JevBrowserValidate.logRejection({ ok: false, reason: "head_absent", detail: result.detail })
        return result
      }),
    ),
  )

  // `in` rather than comparing a discriminant: the success branch is a decoded
  // System One response, which carries no `kind`, so reading one off the union is
  // a type error while `in` narrows it.
  if ("kind" in answered) return answered

  const outcome = JevBrowserValidate.decision(answered.answers, space.operations, space.state.elements)

  if (!outcome.ok) {
    yield* JevBrowserValidate.logRejection(outcome)
    return { kind: "abstained", space, reason: "rejected", detail: `${outcome.reason}: ${outcome.detail}` } satisfies
      Abstained
  }

  return {
    kind: "decided",
    space,
    operation: outcome.operation,
    confidence: outcome.confidence,
    index: outcome.index,
    element: outcome.element,
  } satisfies Decided
})

export * as JevBrowserPolicy from "./policy"