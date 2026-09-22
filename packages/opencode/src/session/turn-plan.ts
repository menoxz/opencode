import { Schema, Types } from "effect"
import { expectationMatches } from "./progress"

// Brique 1 — engagement borné, transitoire, réconcilié, à autorité basse.
//
// A turn that leaves work open declares four bounded fields: the one action it
// will take next, the observation that proves it worked, a fallback, and what
// ends the turn. The plan is a *prediction*, not a fact, so it never enters the
// message history: it lives in session-keyed module state, is replaced at each
// turn instead of accumulating, and is consumed exactly once.
//
// The lifecycle has two stages because of when the prediction becomes testable.
// A plan declared on step K predicts step K+1, whose observation only exists on
// step K+2. Comparing it any earlier would face it with what the model already
// held when it declared — unfalsifiable. So the next turn *reminds* the plan as
// the standing commitment, and the turn after *settles* it against the
// observation its action actually produced.
//
// State is module-level and session-keyed rather than an Effect service, for the
// same reason as `ContextLedger`: reconciliation must run on every turn path with
// no layer wiring to forget.
//
// Authority is the lowest of the loop. The plan may only refine the ambiguous
// "no executable action" case while the idle budget allows; it can never relax a
// wait, a user question, the step limit, or a safety stop.

export const MAX_FIELD_CHARS = 240
export const MAX_CAPSULE_CHARS = 1_200
export const MAX_SALIENT_TOKENS = 12

export const TurnPlanSchema = Schema.Struct({
  intent: Schema.String,
  expect: Schema.String,
  onFail: Schema.optional(Schema.String),
  stopIf: Schema.optional(Schema.String),
}).annotate({ identifier: "TurnPlan" })
export type TurnPlan = Types.DeepMutable<Schema.Schema.Type<typeof TurnPlanSchema>>

/** Retained sessions before the oldest plan is evicted; a long run must not grow one map without bound. */
export const MAX_SESSIONS = 200

type Entry = { plan: TurnPlan; step?: number; declaredAt: number; reminded: boolean }

const plans = new Map<string, Entry>()

function clip(value: string | undefined, max = MAX_FIELD_CHARS): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function bounded(capsule: string): string {
  return capsule.length > MAX_CAPSULE_CHARS ? `${capsule.slice(0, MAX_CAPSULE_CHARS - 1)}…` : capsule
}

/** A plan without both an intent and an expected observation is not an engagement. */
export function normalize(plan: TurnPlan): TurnPlan | undefined {
  const intent = clip(plan.intent)
  const expect = clip(plan.expect)
  if (!intent || !expect) return undefined
  return { intent, expect, onFail: clip(plan.onFail), stopIf: clip(plan.stopIf) }
}

/**
 * Record the turn's engagement, replacing any plan already held for the session.
 * Returns the normalized plan, or `undefined` when the declaration is too
 * incomplete to bind anything.
 */
export function declare(sessionID: string, plan: TurnPlan, step?: number): TurnPlan | undefined {
  const normalized = normalize(plan)
  if (!normalized) return undefined
  // Re-insert so the eviction order below follows recency, not first write.
  plans.delete(sessionID)
  if (plans.size >= MAX_SESSIONS) {
    const oldest = plans.keys().next()
    if (!oldest.done) plans.delete(oldest.value)
  }
  plans.set(sessionID, { plan: normalized, step, declaredAt: Date.now(), reminded: false })
  return normalized
}

export function current(sessionID: string): Entry | undefined {
  return plans.get(sessionID)
}

export function clear(sessionID: string): void {
  plans.delete(sessionID)
}

/**
 * First sighting of the plan declared on the previous step: the turn's own
 * commitment, restated before the model acts on it. Returns `undefined` once it
 * has been reminded, which is what hands the plan over to `settle`.
 */
export function reminder(sessionID: string): TurnPlan | undefined {
  const entry = plans.get(sessionID)
  if (!entry || entry.reminded) return undefined
  entry.reminded = true
  return entry.plan
}

export type ReconcileVerdict = "no-plan" | "missed" | "confirmed"

const SALIENT = /\p{L}{4,}/gu

/** Display-only derivation of what was not seen; the verdict itself is `expectationMatches`. */
function unobservedTokens(plan: TurnPlan, observation: string): readonly string[] {
  const text = observation.toLowerCase()
  return [...new Set(plan.expect.toLowerCase().match(SALIENT) ?? [])]
    .filter((token) => !text.includes(token))
    .slice(0, MAX_SALIENT_TOKENS)
}

/**
 * Settle a reminded plan against the observation its action produced. The verdict
 * delegates to the single comparator the session layer already uses, so "the
 * expectation held" has exactly one definition. Consuming the plan here is what
 * keeps it transient: it answers exactly one turn. An unreminded entry is left
 * alone — it still owes its own reminder.
 */
export function settle(
  sessionID: string,
  observation: string,
): { verdict: ReconcileVerdict; plan?: TurnPlan; missed: readonly string[] } {
  const entry = plans.get(sessionID)
  if (!entry || !entry.reminded) return { verdict: "no-plan", missed: [] }
  plans.delete(sessionID)
  const verdict = expectationMatches(observation, entry.plan.expect) ? "confirmed" : "missed"
  return {
    verdict,
    plan: entry.plan,
    missed: verdict === "confirmed" ? [] : unobservedTokens(entry.plan, observation),
  }
}

/**
 * The plan's only influence on the loop decision. It refines `none` — the
 * ambiguous "no executable action" — and nothing else: a confirmed expectation
 * lets the turn stop, an unmet one keeps the declared work actionable within the
 * idle budget. `undefined` leaves the harness's own inference untouched.
 */
export function declaredIntent(
  verdict: ReconcileVerdict,
  plan: TurnPlan | undefined,
): "execute" | "none" | undefined {
  if (!plan || verdict === "no-plan") return undefined
  return verdict === "confirmed" ? "none" : "execute"
}

const VERDICT_TEXT: Record<"confirmed" | "missed", string> = {
  confirmed: "confirmed — the declared expectation was observed.",
  missed: "missed — the declared expectation was NOT observed.",
}

/** Bounded restatement of the standing commitment, injected on the turn it predicts. */
export function renderCommitment(plan: TurnPlan): string {
  return bounded(
    [
      `<turn-plan authority="inferred" stage="commitment">`,
      "You declared this engagement for the current step. It is a prediction, not a fact.",
      `- Intent: ${plan.intent}`,
      `- Expected: ${plan.expect}`,
      ...(plan.onFail ? [`- Declared fallback: ${plan.onFail}`] : []),
      ...(plan.stopIf ? [`- Declared stop condition: ${plan.stopIf}`] : []),
      "Take that action now. If the observation contradicts the expectation, run the fallback or re-plan.",
      "</turn-plan>",
    ].join("\n"),
  )
}

/** Bounded reconciliation of a reminded plan against the observation it produced. */
export function render(input: {
  plan: TurnPlan
  verdict: "confirmed" | "missed"
  missed: readonly string[]
}): string {
  return bounded(
    [
      `<turn-plan authority="inferred" stage="reconciliation">`,
      "The engagement you declared two steps ago is now reconciled against the real observation. The plan was a prediction, not a fact.",
      `- Declared intent: ${input.plan.intent}`,
      `- Declared expectation: ${input.plan.expect}`,
      `- Reconciliation: ${VERDICT_TEXT[input.verdict]}`,
      ...(input.missed.length > 0 ? [`- Not observed: ${input.missed.join(", ")}`] : []),
      ...(input.plan.onFail ? [`- Declared fallback: ${input.plan.onFail}`] : []),
      input.verdict === "confirmed"
        ? "The expectation held: treat the declared action as done unless new evidence contradicts it."
        : "The expectation did not hold: run the declared fallback or re-plan from the real observation, and never assume success.",
      "</turn-plan>",
    ].join("\n"),
  )
}

/** The protocol the model is asked to follow before ending a turn. */
export function instruction(): string {
  return [
    "<turn_plan_protocol>",
    "Before ending a turn that leaves work open, declare the next action with the `turn_plan` tool:",
    "- `intent`: the ONE action you will take next.",
    "- `expect`: the observation that proves it worked.",
    "- `on_fail`: the bounded fallback if it does not (optional).",
    "- `stop_if`: what ends the turn (optional).",
    "This is a prediction, not a fact: the harness restates it next turn, then shows the real observation against it.",
    "Never declare a plan you will not execute.",
    "</turn_plan_protocol>",
  ].join("\n")
}
