/**
 * Label for a `task` tool call that follows up on an existing subagent
 * (action: check | wait | cancel) instead of launching a new one.
 *
 * Those follow-ups carry no `description`, so the generic launch labels
 * ("Delegating...", empty spinner) would otherwise be shown and make a poll
 * look like a second delegation.
 */
export function taskFollowUpLabel(action: string | undefined) {
  if (action === "wait") return "Waiting for subagent..."
  if (action === "check") return "Checking subagent..."
  if (action === "cancel") return "Stopping subagent..."
  return ""
}
