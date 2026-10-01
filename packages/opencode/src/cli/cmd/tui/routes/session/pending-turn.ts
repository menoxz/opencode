// Delivery status of a user prompt in the transcript.
//
// The backend queue (src/session/prompt-queue.ts) does not run a queued prompt
// until the active run finishes its turns, and only an explicit steer rides the
// running run at its next step. The transcript has to show the same state, so
// this mirrors those predicates locally — small, pure, and testable without
// mounting the TUI.
//
// QUEUED means "submitted while a turn was already in flight", nothing else.
// The prompt that OPENED the active run is being served right now, never queued:
// it waits for nobody. Its turn stays open for the whole run (its step assistant
// carries `finish: "tool-calls"` between steps), so `turnClosed` alone would
// keep badging it QUEUED from submit to completion — the regression that made
// every submitted prompt look queued. Excluding the oldest open turn (the prompt
// the active run is anchored on) is what separates "waiting" from "running".
//
// That anchor must be read in the run's own view, not the whole transcript:
// `visibleFrom` bounds the scan to MessageV2.filterCompacted's cut, so a turn
// left open by an interrupted run from before a compaction cannot hold the
// anchor and badge every later submit.
//
// `queued`: an older prompt's turn is still open (the run is serving someone
// ahead of this one) AND this prompt's own turn has not closed.
//
// `steer`: the prompt carries the steer flag and no assistant has been written
// after it yet — the running run serves it at its next step.
type MessageLike = {
  id: string
  role: string
  time?: { created?: number; completed?: number }
  finish?: string
  error?: unknown
  parentID?: string
}
type PartLike = { type: string; metadata?: { [key: string]: unknown }; tail_start_id?: unknown }

export type QueuedStatus = "queued" | "steer" | undefined

// A step assistant carries `finish: "tool-calls"` (or "unknown") while it keeps
// working; any other finish is terminal, matching PromptQueue.turnClosed.
const isTerminalFinish = (finish?: string) => finish !== undefined && !["tool-calls", "unknown"].includes(finish)

// Mirrors PromptQueue.turnClosed: a user turn is closed once one of its
// assistant children finished or errored.
const turnClosed = (messages: readonly MessageLike[], userID: string) =>
  messages.some(
    (m) => m.role === "assistant" && m.parentID === userID && (isTerminalFinish(m.finish) || m.error !== undefined),
  )

// Mirrors PromptQueue.steerServed: a steer is delivered once any assistant is
// written after it.
const steerServed = (messages: readonly MessageLike[], steerID: string) =>
  messages.some((m) => m.role === "assistant" && m.id > steerID)

// The prompt the active run is serving: the oldest user prompt whose turn is
// still open. It is the head of the FIFO the run is anchored on, so it is
// running — not waiting — and must never carry a delivery badge. Compared by id
// rather than position so a transcript rendered out of order still agrees.
//
// The scan is bounded by `visibleFrom`, the newest retained compaction tail.
// The run anchors on MessageV2.filterCompacted's view, so a turn left open
// BEFORE that cut — an interrupted run from before a compaction — is invisible
// to the run and can never be the prompt being served. Counting it as the
// anchor pinned it forever and badged every later submit QUEUED.
const servingUserID = (messages: readonly MessageLike[], visibleFrom?: string) => {
  let oldest: string | undefined
  for (const message of messages) {
    if (message.role !== "user") continue
    if (visibleFrom !== undefined && message.id < visibleFrom) continue
    if (turnClosed(messages, message.id)) continue
    if (oldest === undefined || message.id < oldest) oldest = message.id
  }
  return oldest
}

// The oldest message the active run can still see: the start of the newest
// retained compaction tail. MessageV2.filterCompacted drops everything before
// it, so the run can neither be serving nor waiting behind a turn older than
// this. Comparing the cut by max id keeps it correct whatever order the
// compacted transcript is rendered in.
export function visibleFromID(
  messages: readonly MessageLike[],
  partsOf: (messageID: string) => readonly PartLike[],
): string | undefined {
  let cut: string | undefined
  for (const message of messages) {
    if (message.role !== "user") continue
    for (const part of partsOf(message.id)) {
      if (part.type !== "compaction") continue
      const tail = part.tail_start_id
      if (typeof tail !== "string") continue
      if (cut === undefined || tail > cut) cut = tail
    }
  }
  return cut
}

export function queuedUserStatus(input: {
  message: MessageLike
  parts: readonly PartLike[]
  messages: readonly MessageLike[]
  busy: boolean
  // Oldest message the active run can still see — the newest compaction tail
  // start (MessageV2.filterCompacted). Undefined means no compaction ran, so
  // the whole transcript is in view.
  visibleFrom?: string
}): QueuedStatus {
  if (input.message.role !== "user") return undefined
  // An idle session never shows a delivery badge: a stale marker must not
  // survive a settled or interrupted run.
  if (!input.busy) return undefined
  // Nothing is waiting: no open turn means no run to queue behind.
  const serving = servingUserID(input.messages, input.visibleFrom)
  if (serving === undefined) return undefined
  // At or before the served prompt this submit is not waiting for anything:
  // either the run is serving it right now, or a later turn already closed it.
  if (input.message.id <= serving) return undefined

  const steer = input.parts.some(
    (part) => part.type === "text" && (part.metadata as { steer?: unknown } | undefined)?.steer === true,
  )
  if (steer) return steerServed(input.messages, input.message.id) ? undefined : "steer"
  return turnClosed(input.messages, input.message.id) ? undefined : "queued"
}
