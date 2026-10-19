/**
 * Display state of a `task` tool call that follows up on an existing subagent
 * (action: check | wait | cancel) instead of launching a new one.
 *
 * Those follow-ups carry no `description`, so the generic launch labels
 * ("Delegating...", empty spinner) would otherwise be shown and make a poll
 * look like a second delegation.
 *
 * Two rules the row obeys: a real glyph stands where a bare vertical bar used
 * to read as a stray `|`, and the finished row swaps its wording — repeating
 * "Waiting..." after the wait is over would describe a state that no longer
 * holds.
 */
export type TaskFollowUp = {
  /** The glyph shown at the start of the row, in place of the old `│`. */
  icon: string
  /** Wording while the follow-up runs. */
  pending: string
  /** Wording once it has finished: the outcome, not the action. */
  done: string
}

const FOLLOW_UPS: Record<string, TaskFollowUp> = {
  wait: { icon: "◷", pending: "Waiting for subagent...", done: "Subagent finished" },
  check: { icon: "⌕", pending: "Checking subagent...", done: "Subagent checked" },
  cancel: { icon: "■", pending: "Stopping subagent...", done: "Subagent stopped" },
}

/** Display state of a follow-up, or `undefined` for a launch (no `action`). */
export function taskFollowUp(action: string | undefined): TaskFollowUp | undefined {
  if (!action) return undefined
  return FOLLOW_UPS[action]
}

/** The label to show: the action while it runs, its outcome once it is done. */
export function taskFollowUpText(action: string | undefined, done: boolean): string {
  const followUp = taskFollowUp(action)
  if (!followUp) return ""
  return done ? followUp.done : followUp.pending
}

/** The row glyph: the follow-up's own icon, or `fallback` for a plain delegation. */
export function taskFollowUpIcon(action: string | undefined, fallback: string): string {
  return taskFollowUp(action)?.icon ?? fallback
}
