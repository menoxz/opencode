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
// That anchor must be read in the run's own view, not the whole transcript, and
// it must never be a turn the run already passed. Two bounds enforce that:
// `visibleFrom` (MessageV2.filterCompacted's compaction cut) drops everything
// before the run's retained tail, and the FIFO frontier — the newest turn the
// run already closed — drops an abandoned head left open even after the last
// compaction (its steps all stopped at `tool-calls`, no terminal step landed).
// Either bound alone leaves a stale head able to pin the anchor and badge every
// later submit QUEUED.
//
// `queued`: an older prompt's turn is still open (the run is serving someone
// ahead of this one) AND this prompt's own turn has not closed.
//
// `steer`: the prompt carries the steer flag and the run has not read it yet. The badge is a
// delivery indicator, not a label: it disappears the moment the steer is handed to the model
// (the server's receipt, or the first agent part started after the prompt), and the message
// then reads as an ordinary prompt in the stream.
//
// A queued prompt is RENDERED immediately with its QUEUED badge: a waiting
// prompt has to stay visible so the user can see (and manage) the queue, and it
// loses the badge once the run serves it. Runtime-shaped user messages
// (compaction, background notifications) are not prompts and are never badged.
type MessageLike = {
  id: string
  role: string
  time?: { created?: number; completed?: number }
  finish?: string
  error?: unknown
  parentID?: string
}
type PartLike = {
  type: string
  text?: string
  synthetic?: boolean
  metadata?: { [key: string]: unknown }
  tail_start_id?: unknown
  // Parts do not share one clock shape: a text/tool part carries `start`/`end`, a retry part
  // carries `created`. Both are optional here so a real `Part` can be passed as-is.
  time?: { start?: number; end?: number; created?: number }
}

// A steering message carries the steer flag on a text part
// (PromptQueue.isSteerUser).
export const hasSteerFlag = (parts: readonly PartLike[]) =>
  parts.some((part) => part.type === "text" && (part.metadata as { steer?: unknown } | undefined)?.steer === true)

// Mirrors PromptQueue.isRunInternalUser: runtime-shaped user messages — a
// compaction continue/replay, a background-task notification, or a v1 legacy
// completion report — belong to the runtime, never to the user's prompt queue.
// They are never the prompt a run is anchored on, and they never carry a badge.
const isInternalParts = (parts: readonly PartLike[]) =>
  parts.some(
    (part) =>
      part.type === "compaction" ||
      (part.type === "text" &&
        ((part.metadata as { compaction_continue?: unknown } | undefined)?.compaction_continue === true ||
          (part.metadata as { compaction_replay?: unknown } | undefined)?.compaction_replay === true ||
          (part.metadata as { background_notification?: unknown } | undefined)?.background_notification === true ||
          (part.synthetic === true &&
            typeof part.text === "string" &&
            part.text.startsWith("<task ") &&
            part.text.includes("<summary>Background task ")))),
  )

export type QueuedStatus = "queued" | "steer" | undefined

// A steer the run has already taken: it reached the model, so it must leave the transcript.
//
// It is not a turn — the run answered it inside the turn that was already open — and it is not
// a message either: showing it anywhere (inline, or at the tail of the assistant) duplicates a
// prompt the model has already consumed, and the placement depends on provider step boundaries
// the client cannot observe reliably. While it is still pending the badge is the feedback; once
// delivered, nothing is left to say about it.
export const isDeliveredSteer = (
  messages: readonly MessageLike[],
  message: MessageLike,
  partsOf: (messageID: string) => readonly PartLike[],
) => {
  if (message.role !== "user") return false
  const parts = partsOf(message.id)
  if (!hasSteerFlag(parts)) return false
  // `steerServed` also covers a steer served as the anchor of its own run: the previous run
  // settled before reading it, so an assistant was written after it and it is ordinary history.
  if (steerServed(messages, message.id)) return true
  return hasSteerDelivered(parts) || steerActedAfter(messages, message, partsOf)
}

// The run already answered this prompt: its own turn is closed (a terminal assistant
// child, or an error). Exported because the instructions line uses it — an injection
// that never wrote its carrier must stop animating once the answer exists, instead of
// spinning for the whole session.
export const turnAnswered = (messages: readonly MessageLike[], userID: string) => turnClosed(messages, userID)

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

// A steer the server has already handed to the model carries this receipt on its part
// (PromptQueue.isSteerDelivered). It is the authoritative signal and it survives a reload.
export const hasSteerDelivered = (parts: readonly PartLike[]) =>
  parts.some(
    (part) => part.type === "text" && (part.metadata as { steerDelivered?: unknown } | undefined)?.steerDelivered === true,
  )

// The run has acted after the steer: some part of an agent message started later than the
// prompt. This is what makes the badge detach at the right moment. `steerServed` compares
// message ids and is blind to a chained turn — the SDK writes ONE assistant per provider
// invocation, created before the steer arrives, and every later ReAct step appends its parts
// to that same message. Parts carry their own clock, and those updates already stream to the
// client, so the badge drops on the step that reads the steer instead of at the end of the
// turn.
export const steerActedAfter = (
  messages: readonly MessageLike[],
  steer: MessageLike,
  partsOf?: (messageID: string) => readonly PartLike[],
) => {
  if (partsOf === undefined) return false
  const since = steer.time?.created
  if (since === undefined) return false
  for (const message of messages) {
    if (message.role !== "assistant") continue
    for (const part of partsOf(message.id)) {
      const started = part.time?.start ?? part.time?.end
      if (started !== undefined && started > since) return true
    }
  }
  return false
}

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
const servingUserID = (
  messages: readonly MessageLike[],
  visibleFrom?: string,
  partsOf?: (messageID: string) => readonly PartLike[],
) => {
  // The newest turn the run already finished. Prompts are served in FIFO order,
  // so the run never walks back behind a turn it closed: an open turn older than
  // this frontier was passed — an abandoned head (every step stopped at
  // `tool-calls`, no terminal step ever landed) — never the prompt in flight.
  // This bounds the anchor without depending on the client holding the
  // compaction part, which an older/oddly-synced session may not.
  let frontier: string | undefined
  for (const message of messages) {
    if (message.role !== "user") continue
    if (!turnClosed(messages, message.id)) continue
    if (frontier === undefined || message.id > frontier) frontier = message.id
  }
  // The turn the run is writing right now has a step with no terminal finish.
  // An abandoned head cannot be told from the served prompt by order alone — it
  // is open exactly like the served one — but its step stopped at `tool-calls`,
  // so it is NOT in flight, while the served turn's step is. Preferring the
  // in-flight turn keeps a stale open head from badging every later submit
  // QUEUED, the residual case the compaction tail and FIFO frontier do not cover
  // when neither a compaction nor a closed turn exists.
  const inFlight = (userID: string) =>
    messages.some(
      (m) => m.role === "assistant" && m.parentID === userID && m.finish === undefined && m.error === undefined,
    )
  let oldest: string | undefined
  let oldestInFlight: string | undefined
  for (const message of messages) {
    if (message.role !== "user") continue
    if (visibleFrom !== undefined && message.id < visibleFrom) continue
    if (frontier !== undefined && message.id < frontier) continue
    if (partsOf !== undefined) {
      const parts = partsOf(message.id)
      // Runtime-shaped messages are not prompts; a served steer is no longer
      // pending either (PromptQueue.pendingUserID skips both).
      if (isInternalParts(parts)) continue
      if (hasSteerFlag(parts) && (hasSteerDelivered(parts) || steerServed(messages, message.id))) continue
    }
    if (turnClosed(messages, message.id)) continue
    if (inFlight(message.id) && (oldestInFlight === undefined || message.id < oldestInFlight)) oldestInFlight = message.id
    if (oldest === undefined || message.id < oldest) oldest = message.id
  }
  return oldestInFlight ?? oldest
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
  // Parts of any message, needed to recognise the runtime-shaped and steering
  // messages the anchor scan must skip. Optional: without it the scan keeps the
  // pre-existing behaviour.
  partsOf?: (messageID: string) => readonly PartLike[]
}): QueuedStatus {
  if (input.message.role !== "user") return undefined
  // An idle session never shows a delivery badge: a stale marker must not
  // survive a settled or interrupted run.
  if (!input.busy) return undefined
  // A runtime-shaped message is not a user prompt: it never carries a badge.
  if (isInternalParts(input.parts)) return undefined

  // A steer is decided by its own flag, not by the anchor scan. It rides the
  // running run, and until the run reads it the badge means "not delivered yet".
  // Delivery ends the badge: the server receipt (authoritative, survives a reload)
  // or the first agent part started after the prompt (the chained-turn case, where
  // no assistant id is ever newer than the steer). Keying it on the anchor alone
  // dropped the badge whenever the anchor's turn had already closed while the run
  // kept going.
  if (hasSteerFlag(input.parts)) {
    if (hasSteerDelivered(input.parts)) return undefined
    if (steerServed(input.messages, input.message.id)) return undefined
    if (steerActedAfter(input.messages, input.message, input.partsOf)) return undefined
    return "steer"
  }

  // Nothing is waiting: no open turn means no run to queue behind.
  const serving = servingUserID(input.messages, input.visibleFrom, input.partsOf)
  if (serving === undefined) return undefined
  // At or before the served prompt this submit is not waiting for anything:
  // either the run is serving it right now, or a later turn already closed it.
  if (input.message.id <= serving) return undefined
  return turnClosed(input.messages, input.message.id) ? undefined : "queued"
}
