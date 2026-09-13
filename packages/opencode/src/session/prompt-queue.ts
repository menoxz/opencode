import { MessageV2 } from "./message-v2"

// A user turn is closed once one of its assistant children finished (normal
// completion) or errored/aborted (interrupted turn the user moved on from).
// Pending turns are the ones the agent loop must still serve.
export const turnClosed = (msgs: MessageV2.WithParts[], userID: MessageV2.User["id"]) =>
  msgs.some(
    (m) =>
      m.info.role === "assistant" &&
      m.info.parentID === userID &&
      ((m.info.finish !== undefined && !["tool-calls", "unknown"].includes(m.info.finish)) ||
        m.info.error !== undefined),
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
          (p as { metadata?: { compaction_replay?: unknown } }).metadata?.compaction_replay === true ||
          (p as { metadata?: { background_notification?: unknown } }).metadata?.background_notification === true ||
          // v1.18.88 and older persisted completion reports without metadata.
          // Recognise their exact synthetic envelope so opening an old session
          // cannot resurrect the FIFO and replay one model turn per child.
          (p.synthetic === true && p.text.startsWith("<task ") && p.text.includes("<summary>Background task ")))),
  )

export const compactionTaskParentID = (task: MessageV2.CompactionPart) => task.messageID

const isCompactionReplayUser = (m: MessageV2.WithParts) =>
  m.info.role === "user" &&
  m.parts.some(
    (part) =>
      part.type === "text" &&
      (part as { metadata?: { compaction_replay?: unknown } }).metadata?.compaction_replay === true,
  )

// A steering message is a user prompt delivered to the run already in progress:
// it must be visible to that run (boundToRun keeps it) but must not open a
// second turn. Once an assistant is written after it, the active run has served
// it, so pendingUserID skips it. If that run settled before consuming it, no
// assistant follows it and it falls back to a normal pending turn instead of
// being lost.
export const isSteerUser = (m: MessageV2.WithParts) =>
  m.info.role === "user" &&
  m.parts.some(
    (part) => part.type === "text" && (part as { metadata?: { steer?: unknown } }).metadata?.steer === true,
  )

const steerServed = (msgs: MessageV2.WithParts[], steerID: MessageV2.User["id"]) =>
  msgs.some((m) => m.info.role === "assistant" && m.info.id > steerID)

export const resolveAnchorUserID = (
  msgs: MessageV2.WithParts[],
  anchorUserID: MessageV2.User["id"],
): MessageV2.User["id"] | undefined => {
  if (msgs.some((m) => m.info.role === "user" && m.info.id === anchorUserID)) return anchorUserID
  return msgs.findLast(isCompactionReplayUser)?.info.id
}

// At the start of a fresh runner, no assistant from a prior process can still
// be executing. Persisted assistants without a terminal state are therefore
// interrupted leftovers that must be reconciled before queue selection.
export const staleAssistantsAtRunStart = (msgs: MessageV2.WithParts[]) =>
  msgs.filter(
    (m) =>
      m.info.role === "assistant" &&
      m.info.time.completed === undefined &&
      m.info.finish === undefined &&
      m.info.error === undefined,
  ) as Array<MessageV2.WithParts & { info: MessageV2.Assistant }>

// Oldest user prompt whose turn is not closed (FIFO over queued prompts).
export const pendingUserID = (msgs: MessageV2.WithParts[]): MessageV2.User["id"] | undefined =>
  msgs
    .filter((m) => {
      if (m.info.role !== "user") return false
      if (isRunInternalUser(m)) return false
      if (isSteerUser(m)) return !steerServed(msgs, m.info.id)
      return !turnClosed(msgs, m.info.id)
    })
    .sort((a, b) => (a.info.id < b.info.id ? -1 : a.info.id > b.info.id ? 1 : 0))[0]?.info.id

// Restrict a run's message view to the anchored turn. Run-internal users
// (compaction + auto-continue) are kept so the run can serve them; any user
// prompt queued while the run is active is invisible until a fresh run anchors
// to it.
export const boundToRun = (msgs: MessageV2.WithParts[], anchorUserID: MessageV2.User["id"]) => {
  const internal = new Set(
    msgs
      .filter((m) => m.info.role === "user" && (isRunInternalUser(m) || isSteerUser(m)))
      .map((m) => m.info.id),
  )
  return msgs.filter((m) => {
    if (m.info.role === "user") return m.info.id <= anchorUserID || internal.has(m.info.id)
    const parent = m.info.role === "assistant" ? m.info.parentID : undefined
    return parent === undefined || parent <= anchorUserID || internal.has(parent)
  })
}

export * as PromptQueue from "./prompt-queue"
