// A model can legitimately answer with text and no tool call mid-task, so one
// text-only stop must not end the run. Continuing forever would burn tokens:
// after this many consecutive text-only stops without a tool call the run gives
// up and returns control to the user. Any tool call resets the counter.
export const AUTO_CONTINUE_LIMIT = 4

const AUTO_CONTINUE_OBJECTIVE_OPEN = "- If the objective is already fully satisfied, verify it and call complete_objective now."
// Un objectif deja clos ne se reclot pas. La consigne precedente etait servie telle quelle apres
// une completion : le modele rappelait `complete_objective` sur un objectif termine, ce qui ne
// rendait qu'un avertissement « Objective already completed » — un tour brule pour rien, et un
// contresens avec la carte « This objective is achieved. Do not redo it. ».
const AUTO_CONTINUE_OBJECTIVE_CLOSED =
  "- The current objective is already recorded as completed: do not call complete_objective again; act on what remains, or stop."

/** Le rappel d'auto-continuation, dont la derniere consigne depend de l'etat de l'objectif. */
export function autoContinueInstructionFor(input: { objectiveClosed: boolean }): string {
  return [
    "<auto_continue>",
    "A concrete executable action remains. Continue the work now.",
    "- Do not ask for permission and do not repeat your previous answer.",
    "- If you genuinely need a decision or information, call the question tool instead of stopping.",
    input.objectiveClosed ? AUTO_CONTINUE_OBJECTIVE_CLOSED : AUTO_CONTINUE_OBJECTIVE_OPEN,
    "</auto_continue>",
  ].join("\n")
}

export const AUTO_CONTINUE_INSTRUCTION = autoContinueInstructionFor({ objectiveClosed: false })

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
  | { action: "continue"; reason: "executable-action" | "retry" | "declared-intent" }
  | { action: "wait"; reason: "pending-tools" }
  | { action: "stop"; reason: RunDecisionStopReason }

// The lowest-authority signal of the loop: what the turn itself declared it
// would do next, after reconciliation against the real observation. It refines
// only the ambiguous "no executable action" case and can never relax a wait, a
// user question, the step limit or the idle budget. A confirmed declaration
// ("none") is deliberately inert — letting the turn stop is already the default,
// so the harness keeps owning every non-ambiguous outcome.
export type DeclaredIntent = "execute" | "none"

/** Decide whether a settled (text-only or waiting) run must continue, wait or stop. */
export function decideRunDecision(input: {
  nextAction: NextAction
  idleContinues: number
  autocontinueEnabled: boolean
  stepLimitReached: boolean
  pendingTools: boolean
  declaredIntent?: DeclaredIntent
  limit?: number
}): RunDecision {
  if (input.pendingTools) return { action: "wait", reason: "pending-tools" }
  if (input.stepLimitReached) return { action: "stop", reason: "step-limit" }
  if (!input.autocontinueEnabled) return { action: "stop", reason: "autocontinue-disabled" }

  if (input.nextAction.kind === "await_tool") return { action: "wait", reason: "pending-tools" }
  if (input.nextAction.kind === "ask_user") return { action: "stop", reason: "awaiting-user" }
  if (input.nextAction.kind === "report") return { action: "stop", reason: "report-delivered" }
  if (input.nextAction.kind === "none") {
    if (input.declaredIntent !== "execute") return { action: "stop", reason: "no-executable-action" }
    if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
    return { action: "continue", reason: "declared-intent" }
  }
  if (input.idleContinues >= (input.limit ?? AUTO_CONTINUE_LIMIT)) return { action: "stop", reason: "idle-budget" }
  return { action: "continue", reason: input.nextAction.kind === "retry" ? "retry" : "executable-action" }
}
