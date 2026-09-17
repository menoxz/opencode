// A model can legitimately answer with text and no tool call mid-task, so one
// text-only stop must not end the run. Continuing forever would burn tokens:
// after this many consecutive text-only stops without a tool call the run gives
// up and returns control to the user. Any tool call resets the counter.
export const AUTO_CONTINUE_LIMIT = 4

export const AUTO_CONTINUE_INSTRUCTION = [
  "<auto_continue>",
  "A concrete executable action remains. Continue the work now.",
  "- Do not ask for permission and do not repeat your previous answer.",
  "- If you genuinely need a decision or information, call the question tool instead of stopping.",
  "- If the objective is already fully satisfied, verify it and call complete_objective now.",
  "</auto_continue>",
].join("\n")

/** Whether a text-only assistant stop must be turned into another run step. */
export type NextAction =
  | { kind: "execute"; stepID?: string }
  | { kind: "retry"; fingerprint: string }
  | { kind: "await_tool" }
  | { kind: "ask_user"; fingerprint?: string }
  | { kind: "report"; fingerprint?: string }
  | { kind: "none" }

export function shouldAutoContinue(input: { nextAction: NextAction; idleContinues: number; limit?: number }) {
  if (input.nextAction.kind !== "execute" && input.nextAction.kind !== "retry") return false
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

export type RunDecisionStopReason = "awaiting-user" | "report-delivered" | "no-executable-action"
  | "idle-budget"
  | "step-limit"
  | "autocontinue-disabled"

export type RunDecision =
  | { action: "continue"; reason: "executable-action" | "retry" }
  | { action: "wait"; reason: "pending-tools" }
  | { action: "stop"; reason: RunDecisionStopReason }

/** Decide whether a settled (text-only or waiting) run must continue, wait or stop. */
export function decideRunDecision(input: {
  nextAction: NextAction
  idleContinues: number
  autocontinueEnabled: boolean
  stepLimitReached: boolean
  pendingTools: boolean
  limit?: number
}): RunDecision {
  if (input.pendingTools) return { action: "wait", reason: "pending-tools" }
  if (input.stepLimitReached) return { action: "stop", reason: "step-limit" }
  if (!input.autocontinueEnabled) return { action: "stop", reason: "autocontinue-disabled" }

  if (input.nextAction.kind === "await_tool") return { action: "wait", reason: "pending-tools" }
  if (input.nextAction.kind === "ask_user") return { action: "stop", reason: "awaiting-user" }
  if (input.nextAction.kind === "report") return { action: "stop", reason: "report-delivered" }
  if (input.nextAction.kind === "none") return { action: "stop", reason: "no-executable-action" }
  if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
  return { action: "continue", reason: input.nextAction.kind === "retry" ? "retry" : "executable-action" }
}
