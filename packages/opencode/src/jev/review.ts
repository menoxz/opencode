import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"
import type { Scores } from "./state"

/**
 * Post-execution review. Jev reads the call and its result and returns three
 * typed scores. They are signal for the next turn, never a replacement for the
 * assistant's own judgement: the tool output is annotated, not rewritten.
 *
 * A `score` answer is a probability-weighted position across the ordered levels
 * and is treated as a 0..1 value; the exact normalisation Jev applies to a
 * score is undocumented, so callers only compare against thresholds and never
 * multiply it by a level count.
 */

export const MAX_REVIEW_CHARS = 6_000

export const LEVELS = ["wrong", "flawed", "unverified", "correct", "verifiable"] as const

const CORRECTNESS = [
  "The result is wrong, failed, or contradicts the call's intent",
  "The result is partly wrong or incomplete, with a visible problem",
  "The result is plausible but not verified",
  "The result is correct and complete for the call's intent",
  "The result is correct and self-evidently verifiable",
]

const COMPLEXITY = [
  "The result closes the step; no further reasoning needed",
  "One small follow-up is implied",
  "A few dependent steps remain before the goal closes",
  "Substantial further work or re-planning is required",
  "The result opens more questions than it answers",
]

const SECURITY = [
  "No security concern in the call or its result",
  "A minor hygiene issue (a secret-adjacent path, a loose permission)",
  "A concerning pattern worth checking (broad deletion, network egress)",
  "A likely security problem (secret exposure, untrusted input executed)",
  "A confirmed security incident or a destructive irreversible action",
]

export function reviewQuestions(input: { tool: string; args: string; output: string }): Record<string, JevSchema.Question> {
  const excerpt = `TOOL: ${input.tool}\nARGUMENTS: ${input.args}\nRESULT:\n${input.output.slice(0, MAX_REVIEW_CHARS)}`
  return {
    correctness: {
      type: "score",
      instructions: `Rate the correctness of the tool call and its result on the ordered scale, lowest first. Consider whether the result achieved the call's intent and whether it contains errors, truncation or contradictions.\n\n${excerpt}`,
      criteria: CORRECTNESS,
    },
    complexity: {
      type: "score",
      instructions: `Rate how much further reasoning this result demands before the user's goal is met, on the ordered scale, lowest first.\n\n${excerpt}`,
      criteria: COMPLEXITY,
    },
    security: {
      type: "score",
      instructions: `Rate the security concern raised by this call and its result, on the ordered scale, lowest first.\n\n${excerpt}`,
      criteria: SECURITY,
    },
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Reads the three axes out of a response. Separated from `review` so a caller
 * that already holds a response — because it merged these questions with
 * another hook's into one round-trip — can decode it without asking again.
 */
export function interpret(response: JevSchema.Response): Scores | undefined {
  const axis = (id: string) => {
    const answer = response.answers[id]
    return answer?.type === "score" ? clamp01(answer.score) : undefined
  }
  const correctness = axis("correctness")
  const complexity = axis("complexity")
  const security = axis("security")
  if (correctness === undefined && complexity === undefined && security === undefined) return undefined
  return { correctness: correctness ?? 0, complexity: complexity ?? 0, security: security ?? 0 } satisfies Scores
}

/** Returns `undefined` when Jev answered none of the three axes, so the caller can abstain. */
export const review = Effect.fn("JevReview.review")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: { tool: string; args: string; output: string },
) {
  const response = yield* JevClient.decide(
    http,
    { state: `Review of the ${input.tool} call.`, questions: reviewQuestions(input) },
    settings,
  )
  return interpret(response)
})

/** One compact block the model reads next to the tool result. */
export function render(scores: Scores, threshold = 0.5): string {
  const flags = [
    scores.correctness <= threshold ? "correctness is low — verify before relying on this result" : undefined,
    scores.complexity >= 1 - threshold ? "further reasoning is required before the goal closes" : undefined,
    scores.security >= 1 - threshold ? "security concern raised — treat the next action with care" : undefined,
  ].filter((flag): flag is string => flag !== undefined)
  const line = `[jev review] correctness=${scores.correctness.toFixed(2)} complexity=${scores.complexity.toFixed(2)} security=${scores.security.toFixed(2)}`
  return flags.length ? `${line}\n${flags.map((flag) => `[jev review] ${flag}`).join("\n")}` : line
}

export * as JevReview from "./review"
