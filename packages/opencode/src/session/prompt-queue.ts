import { MessageV2 } from "./message-v2"

// A user turn is closed once one of its assistant children finished (normal
// completion) or errored/aborted (interrupted turn the user moved on from).
// Pending turns are the ones the agent loop must still serve.
export const turnClosed = (msgs: MessageV2.WithParts[], userID: MessageV2.User["id"]) =>
  msgs.some(
    (m) =>
      m.info.role === "assistant" &&
      m.info.parentID === userID &&
      (m.info.finish !== undefined || m.info.error !== undefined),
  )

// Internal user-shaped messages belong to the runtime, not to the user's prompt
// queue: compaction continues the run that created it, while a background-task
// notification is data for the next real turn — never a request for a new one.
const isRunInternalUser = (m: MessageV2.WithParts) =>
  m.parts.some(
    (p) =>
      p.type === "compaction" ||
      (p.type === "text" &&
        ((p as { metadata?: { compaction_continue?: unknown } }).metadata?.compaction_continue === true ||
          (p as { metadata?: { background_notification?: unknown } }).metadata?.background_notification === true)),
  )

// Oldest user prompt whose turn is not closed (FIFO over queued prompts).
export const pendingUserID = (msgs: MessageV2.WithParts[]): MessageV2.User["id"] | undefined =>
  msgs
    .filter((m) => m.info.role === "user" && !isRunInternalUser(m) && !turnClosed(msgs, m.info.id))
    .sort((a, b) => (a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0))[0]?.info.id

// Restrict a run's message view to the anchored turn. Run-internal users
// (compaction + auto-continue) are kept so the run can serve them; any user
// prompt queued while the run is active is invisible until a fresh run anchors
// to it.
export const boundToRun = (msgs: MessageV2.WithParts[], anchorUserID: MessageV2.User["id"]) => {
  const internal = new Set(
    msgs.filter((m) => m.info.role === "user" && isRunInternalUser(m)).map((m) => m.info.id),
  )
  return msgs.filter((m) => {
    if (m.info.role === "user") return m.info.id <= anchorUserID || internal.has(m.info.id)
    const parent = m.info.role === "assistant" ? m.info.parentID : undefined
    return parent === undefined || parent <= anchorUserID || internal.has(parent)
  })
}

export * as PromptQueue from "./prompt-queue"
