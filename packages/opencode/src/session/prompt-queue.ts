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

const isCompactionRecoveryUser = (m: MessageV2.WithParts) =>
  m.info.role === "user" &&
  m.parts.some(
    (part) =>
      part.type === "text" &&
      ((part as { metadata?: { compaction_replay?: unknown } }).metadata?.compaction_replay === true ||
        (part as { metadata?: { compaction_continue?: unknown } }).metadata?.compaction_continue === true),
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

export const steerServed = (msgs: MessageV2.WithParts[], steerID: MessageV2.User["id"]) =>
  msgs.some((m) => m.info.role === "assistant" && m.info.id > steerID)

// A steer the running turn has not answered yet. It is already persisted as a user
// message newer than the run's anchor, so it belongs to THIS run: stopping the loop
// here handed it to a fresh run, which opened a second turn instead of injecting the
// interjection into the one in flight.
export const hasPendingSteer = (msgs: MessageV2.WithParts[]) =>
  msgs.some((m) => isSteerUser(m) && !steerServed(msgs, m.info.id))

// A steer this run must deliver as an interjection (`<system-reminder>`) rather than as a
// new user turn: newer than the anchor and not yet answered. Such a message stays in the
// run's view so the loop can see it arrive, but it is excluded from the history sent to
// the model — otherwise its text would reach the model twice, once as a user turn and once
// as the reminder. A steer that became the anchor of a run (the previous one settled before
// consuming it) is a normal prompt and is deliberately not "pending".
export const isPendingSteerFor = (
  msgs: MessageV2.WithParts[],
  message: MessageV2.WithParts,
  anchorUserID: MessageV2.User["id"],
) => isSteerUser(message) && message.info.id > anchorUserID && !steerServed(msgs, message.info.id)

export const resolveAnchorUserID = (
  msgs: MessageV2.WithParts[],
  anchorUserID: MessageV2.User["id"],
): MessageV2.User["id"] | undefined => {
  if (msgs.some((m) => m.info.role === "user" && m.info.id === anchorUserID)) return anchorUserID
  return msgs.findLast(isCompactionRecoveryUser)?.info.id
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

// A prompt the run has NOT served yet — one queued behind the active turn, or a
// steer that no assistant has answered — can be cancelled while the run is in
// flight. It never reached the model, so cancelling it is a **deletion**, not a
// revert: there is no file change to undo and no snapshot to take. Excluded: the
// prompt the run is serving (`pendingUserID`, the FIFO anchor), anything that
// already has an assistant child (that turn is being written right now), a steer
// the run already answered, and the runtime-shaped users that are not prompts.
export const withdrawableUserID = (
  msgs: MessageV2.WithParts[],
  messageID: MessageV2.User["id"],
  busy: boolean,
): boolean => {
  // An idle session keeps the classic revert: the banner, `unrevert`, and the
  // snapshot restore. Withdrawing there would delete the prompt outright with no
  // way back, while a prompt only needs withdrawing because a run is about to
  // serve it.
  if (!busy) return false
  const target = msgs.find((m) => m.info.id === messageID)
  if (!target || target.info.role !== "user") return false
  if (isRunInternalUser(target)) return false
  if (msgs.some((m) => m.info.role === "assistant" && m.info.parentID === messageID)) return false
  if (isSteerUser(target) && steerServed(msgs, messageID)) return false
  if (pendingUserID(msgs) === messageID) return false
  return true
}

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
