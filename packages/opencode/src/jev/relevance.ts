import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { decide as decideBounded, makeCircuit, type Circuit } from "./decide"

/** Round-trip bound. The observed median is ~830 ms with a 4.3 s tail. */
export const DEFAULT_TIMEOUT_MS = 5_000

/** Process-wide breaker: endpoint reachability is a process property, not a call property. */
const processCircuit = makeCircuit()
import { JevSchema } from "./schema"

/**
 * Relevance judge — the start-of-step half of the loop.
 *
 * The deterministic half already answers the easy case: `ContextLedger`
 * returns a slot when the world provably did not move, and `ToolRepetition`
 * refuses a call proven unproductive. What neither can decide is the *near*
 * repeat, where the arguments differ but the information does not: `git status`
 * after `git status --short`, a page fetched again through a different tool, a
 * directory listed once more after an unrelated edit. That is a judgement about
 * meaning, not bytes, and it is the one question worth a round-trip.
 *
 * Jev is stateless and text-only, so it only sees the observed surface the
 * caller passes. It therefore cannot know what survived compaction or elision
 * in the context window: presence is the harness's business, and this module
 * never claims it. Its answer only says whether the call is likely to add
 * information, and the caller keeps the decision to act on it.
 *
 * The judge is advisory by construction. It never refuses a call, never asks
 * the user for permission and never rewrites a result; a verdict below the
 * redundant threshold lets the caller answer from the ledger, anything else
 * lets the call run, and any failure abstains.
 */

/** Bounded surface quoted to Jev, so one round-trip stays cheap. */
export const MAX_SURFACE_CHARS = 4_000

/** At or below this probability of new information, the call is redundant. */
export const DEFAULT_REDUNDANT_AT = 0.25

/** Below this, the call is doubtful: it runs, but the result is flagged. */
export const DEFAULT_AMBIGUOUS_AT = 0.6

export type Verdict = "redundant" | "ambiguous" | "useful"

export type Assessment = {
  readonly verdict: Verdict
  readonly probability: number
  readonly reason: string
}

/** One already-observed target, as the ledger projects it. */
export type Surface = {
  readonly tool: string
  readonly target: string
  readonly step: number
  readonly summary: string
}

export type QuestionInput = {
  readonly tool: string
  readonly args: string
  readonly observed: readonly Surface[]
  readonly request?: string
}

export function observedSurface(observed: readonly Surface[], maxChars = MAX_SURFACE_CHARS): string {
  if (observed.length === 0) return "(nothing observed yet)"
  const text = observed
    .map((entry) => `- ${entry.tool} ${entry.target} (observed at step ${entry.step}): ${entry.summary}`)
    .join("\n")
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

export function relevanceQuestions(input: QuestionInput): Record<string, JevSchema.Question> {
  const observed = observedSurface(input.observed)
  const request = input.request ? `\n\nUSER REQUEST:\n${input.request.slice(0, 1_000)}` : ""
  return {
    new_information: {
      type: "noul",
      instructions: `An agent loop has ALREADY OBSERVED everything listed below. It is about to make the CALL below. Will that call return information that is absent from what it has already observed — new bytes, a changed state, or a genuinely different view?\n\nAnswer no when the call would only reproduce information already listed, even if the arguments differ (a shorter form of the same command, the same page through another tool, the same file range again). Answer yes when it would reveal something the list does not contain, even if it overlaps.\n\nALREADY OBSERVED:\n${observed}\n\nCALL:\n${input.tool} ${input.args.slice(0, 1_000)}${request}`,
      criteria: {
        true: "The call returns information the agent does not already have",
        false: "The call only reproduces information the agent already has",
      },
    },
  }
}

/** Pure policy, so the thresholds are unit-testable without a network call. */
export function assess(
  probability: number,
  options: { redundantAt?: number; ambiguousAt?: number } = {},
): Assessment {
  const redundantAt = options.redundantAt ?? DEFAULT_REDUNDANT_AT
  const ambiguousAt = options.ambiguousAt ?? DEFAULT_AMBIGUOUS_AT
  const percent = `${(probability * 100).toFixed(1)}%`
  if (probability <= redundantAt)
    return {
      verdict: "redundant",
      probability,
      reason: `Jev put only ${percent} on new information, at or below the ${redundantAt.toFixed(2)} redundant threshold: the call repeats what is already observed`,
    }
  if (probability < ambiguousAt)
    return {
      verdict: "ambiguous",
      probability,
      reason: `Jev put ${percent} on new information, between the ${redundantAt.toFixed(2)} and ${ambiguousAt.toFixed(2)} thresholds: the call may add little`,
    }
  return {
    verdict: "useful",
    probability,
    reason: `Jev put ${percent} on new information, at or above the ${ambiguousAt.toFixed(2)} threshold`,
  }
}

/** Reads the answer; an absent or mistyped answer abstains rather than guessing. */
export function interpret(
  response: JevSchema.Response,
  options: { redundantAt?: number; ambiguousAt?: number } = {},
): Assessment | undefined {
  const answer = response.answers["new_information"]
  if (answer?.type !== "noul") return undefined
  return assess(answer.noul, options)
}

export function render(assessment: Assessment): string {
  const line = `[jev relevance] new_information=${assessment.probability.toFixed(2)} verdict=${assessment.verdict}`
  return assessment.verdict === "useful" ? line : `${line}\n[jev relevance] ${assessment.reason}`
}

export const judge = Effect.fn("JevRelevance.judge")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: QuestionInput,
  options: { readonly enabled?: boolean; readonly timeoutMs?: number; readonly circuit?: Circuit } = {},
) {
  // Fail-open, and deliberately the opposite of the guard: a redundant call is
  // wasted work, never damage. When the model cannot answer, the call proceeds
  // exactly as it would with relevance switched off, so an outage costs a little
  // wasted context rather than the loop. The fallback is `undefined` — an
  // abstention, not a verdict — so the hook declines to judge and returns early.
  const outcome = yield* decideBounded<Assessment | undefined>({
    label: "relevance",
    circuit: options.circuit ?? processCircuit,
    enabled: options.enabled !== false,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fallback: () => undefined,
    run: JevClient.decide(
      http,
      { state: `Relevance check before the ${input.tool} call.`, questions: relevanceQuestions(input) },
      settings,
    ).pipe(Effect.map(interpret)),
  })
  return outcome.value
})

export * as JevRelevance from "./relevance"
