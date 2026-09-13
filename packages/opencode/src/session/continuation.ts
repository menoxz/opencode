import type { GoalState } from "./goal-state"

// The agent only owns the objective while it is still being worked on. A
// `pending_user` contract is explicitly waiting for the user, and the terminal
// statuses must never be revived, so all of them stop the run.
const CONTINUABLE_STATUSES = new Set(["draft", "approved", "edited"])

// A model can legitimately answer with text and no tool call mid-task, so one
// text-only stop must not end the run. Continuing forever would burn tokens:
// after this many consecutive text-only stops without a tool call the run gives
// up and returns control to the user. Any tool call resets the counter.
export const AUTO_CONTINUE_LIMIT = 4

export const AUTO_CONTINUE_INSTRUCTION = [
  "<auto_continue>",
  "You stopped while the objective is still open. Continue the work now.",
  "- Do not ask for permission and do not repeat your previous answer.",
  "- If you genuinely need a decision or information, call the question tool instead of stopping.",
  "- If the objective is already fully satisfied, verify it and call complete_objective now.",
  "</auto_continue>",
].join("\n")

/** Whether a text-only assistant stop must be turned into another run step. */
export function shouldAutoContinue(input: {
  goal: GoalState | undefined
  userID: string
  idleContinues: number
  limit?: number
}) {
  if (!input.goal || input.goal.anchorUserID !== input.userID) return false
  if (!CONTINUABLE_STATUSES.has(input.goal.status)) return false
  return input.idleContinues < (input.limit ?? AUTO_CONTINUE_LIMIT)
}

// ── Unified run decision ─────────────────────────────────────────────────────
// The objective alone is not enough to decide whether the run may stop: a model
// can leave open todos without a formal contract, or hold pending tool calls.
// This single function crosses every signal so the loop never stops for a reason
// it cannot name, and never keeps running after a legitimate end state.

const OPEN_TODO_STATUSES = new Set(["pending", "in_progress"])

export function hasOpenTodos(todos: readonly { status: string }[]) {
  return todos.some((todo) => OPEN_TODO_STATUSES.has(todo.status))
}

export type RunDecisionStopReason =
  | "no-objective"
  | "awaiting-user"
  | "objective-blocked"
  | "objective-complete"
  | "mission-skipped"
  | "no-open-work"
  | "idle-budget"
  | "step-limit"
  | "autocontinue-disabled"

export type RunDecision =
  | { action: "continue"; reason: "open-objective" | "pending-todos" }
  | { action: "wait"; reason: "pending-tools" }
  | { action: "stop"; reason: RunDecisionStopReason }

/** Decide whether a settled (text-only or waiting) run must continue, wait or stop. */
export function decideRunDecision(input: {
  goal: GoalState | undefined
  userID: string
  todos: readonly { status: string }[]
  idleContinues: number
  autocontinueEnabled: boolean
  stepLimitReached: boolean
  pendingTools: boolean
  limit?: number
}): RunDecision {
  if (input.pendingTools) return { action: "wait", reason: "pending-tools" }
  if (input.stepLimitReached) return { action: "stop", reason: "step-limit" }
  if (!input.autocontinueEnabled) return { action: "stop", reason: "autocontinue-disabled" }

  const goal = input.goal
  const anchored = goal !== undefined && goal.anchorUserID === input.userID
  if (!anchored) {
    // No contract bound to this turn: only a still-open todo list justifies
    // autonomous continuation, and only within the idle budget.
    if (!hasOpenTodos(input.todos)) return { action: "stop", reason: "no-objective" }
    if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
    return { action: "continue", reason: "pending-todos" }
  }

  if (goal.status === "pending_user") return { action: "stop", reason: "awaiting-user" }
  if (goal.status === "blocked") return { action: "stop", reason: "objective-blocked" }
  if (goal.status === "completed") return { action: "stop", reason: "objective-complete" }
  if (goal.status === "skipped") return { action: "stop", reason: "mission-skipped" }

  if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
  if (hasOpenTodos(input.todos)) return { action: "continue", reason: "pending-todos" }
  return { action: "continue", reason: "open-objective" }
}
