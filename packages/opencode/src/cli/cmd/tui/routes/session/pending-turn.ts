// Delivery status of a user prompt in the transcript.
//
// The backend queue (src/session/prompt-queue.ts) does not run a queued prompt
// until the active run finishes its turns, and only an explicit steer rides the
// running run at its next step. The transcript has to show the same state, so
// this mirrors those predicates locally — small, pure, and testable without
// mounting the TUI.
//
// `queued`: the prompt's own turn has not closed — no assistant child reached a
// terminal state. This deliberately does NOT look at the "latest open
// assistant": between two steps of the running turn that assistant carries
// `finish: "tool-calls"`, and keying on it dropped the badge mid-run, making a
// still-queued prompt look already injected.
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
type PartLike = { type: string; metadata?: { [key: string]: unknown } }

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

export function queuedUserStatus(input: {
  message: MessageLike
  parts: readonly PartLike[]
  messages: readonly MessageLike[]
  busy: boolean
}): QueuedStatus {
  if (input.message.role !== "user") return undefined
  // An idle session never shows a delivery badge: a stale marker must not
  // survive a settled or interrupted run.
  if (!input.busy) return undefined

  const steer = input.parts.some(
    (part) => part.type === "text" && (part.metadata as { steer?: unknown } | undefined)?.steer === true,
  )
  if (steer) return steerServed(input.messages, input.message.id) ? undefined : "steer"
  return turnClosed(input.messages, input.message.id) ? undefined : "queued"
}
