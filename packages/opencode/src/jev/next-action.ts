import { JevSchema } from "./schema"

/**
 * Next-action selector — the end-of-step half of the loop.
 *
 * The post-execution hook already asks Jev to score the result it just
 * produced. This module asks the question that follows from those scores:
 * given what the loop has just observed, is the best next move to continue the
 * current phase, re-observe, change strategy, verify, answer or stop? The
 * answer is one closed choice over a fixed option set, rendered as a single
 * line of guidance next to the tool result.
 *
 * It is deliberately *not* another round-trip. The caller merges these
 * questions into the request it is already making for the review, so a step
 * costs at most one Jev call whichever hooks are enabled, and a step where both
 * are off costs none. The guidance never replaces the model's plan: it is
 * signal attached to the result, and the model stays the planner.
 *
 * The option set is closed on purpose. A free-form suggestion would compete
 * with the model's own reasoning and cannot be validated; six named moves can
 * be tested, logged and counted.
 */

/** Bounded state quoted to Jev. */
export const MAX_STATE_CHARS = 4_000

export const ACTIONS = ["continue", "reobserve", "switch_strategy", "verify", "answer", "blocked"] as const

export type Action = (typeof ACTIONS)[number]

export const MEANING: Record<Action, string> = {
  continue: "keep going in the current phase with the next call it implies",
  reobserve: "look again at the state, because the last observation is missing, stale or unreadable",
  switch_strategy: "stop repeating the current approach and try a different one",
  verify: "prove the current result before building anything on it",
  answer: "the request is satisfied; stop calling tools and answer the user",
  blocked: "a decision, credential or permission is needed from the user before any further call is useful",
}

export type QuestionInput = {
  readonly tool: string
  readonly verdict: string
  readonly stagnant: number
  readonly summary: string
  readonly phase?: string
  readonly steps?: readonly string[]
  readonly goal?: string
  readonly observed?: string
}

export type Guidance = {
  readonly action: Action
  readonly reason: string
}

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value)
}

export function nextActionQuestions(input: QuestionInput): Record<string, JevSchema.Question> {
  const context = [
    `LAST CALL: ${input.tool}`,
    `LAST VERDICT: ${input.verdict}`,
    `RESULT: ${input.summary.slice(0, 1_000)}`,
    `STAGNATION: ${input.stagnant} action(s) without measurable progress`,
    input.phase ? `CURRENT PHASE: ${input.phase}` : undefined,
    input.steps?.length ? `PLANNED PHASES: ${input.steps.join(", ")}` : undefined,
    input.goal ? `OBJECTIVE: ${input.goal.slice(0, 1_000)}` : undefined,
    input.observed ? `ALREADY OBSERVED:\n${input.observed.slice(0, MAX_STATE_CHARS)}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")
  return {
    next_action: {
      type: "choice",
      instructions: `Choose the single best next action for this agent loop. Judge against the objective, not against the effort already spent.\n\n${context}`,
      criteria: MEANING,
    },
  }
}

/** Reads the answer; an unknown option abstains rather than inventing a move. */
export function interpret(response: JevSchema.Response): Guidance | undefined {
  const answer = response.answers["next_action"]
  if (answer?.type !== "choice" || !isAction(answer.choice)) return undefined
  const confidence = answer.probabilities?.[answer.choice]
  const detail = confidence === undefined ? "" : ` (p=${confidence.toFixed(2)})`
  return { action: answer.choice, reason: `${MEANING[answer.choice]}${detail}` }
}

/** One compact line, same channel as the review annotation. */
export function render(guidance: Guidance): string {
  return `[jev next action] ${guidance.action} — ${guidance.reason}`
}

export * as JevNextAction from "./next-action"
