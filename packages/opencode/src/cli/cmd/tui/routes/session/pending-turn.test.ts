import { describe, expect, test } from "bun:test"
import { queuedUserStatus, type QueuedStatus } from "./pending-turn"

// Message ids sort lexicographically in real life (MessageID.ascending); these
// fixtures preserve that so the `assistant.id > steer.id` comparison is
// meaningful.
const user = (id: string, opts: { steer?: boolean } = {}) => ({
  id,
  role: "user",
  sessionID: "s",
  parts: [{ type: "text", text: "hi", ...(opts.steer ? { metadata: { steer: true } } : {}) }],
})
const assistant = (id: string, parentID: string, extra: Record<string, unknown> = {}) => ({
  id,
  role: "assistant",
  sessionID: "s",
  parentID,
  time: { created: 1 },
  ...extra,
})
const status = (
  message: ReturnType<typeof user> | ReturnType<typeof assistant>,
  parts: readonly { type: string; metadata?: { [key: string]: unknown } }[],
  messages: readonly unknown[],
  busy = true,
): QueuedStatus => queuedUserStatus({ message, parts, messages, busy } as never)

describe("TUI user prompt delivery status", () => {
  test("a default submit stays queued across the running turn's steps (anomaly: badge vanished mid-run)", () => {
    const q = user("03")
    // Running run anchored on "01"; its step assistant keeps tool-calling.
    expect(status(q, q.parts, [user("01"), assistant("02", "01", { finish: "tool-calls" }), q])).toBe("queued")
    // Between two steps the step assistant is momentarily completed and none is
    // open: the old "latest open assistant" test dropped the badge here.
    const between = [user("01"), assistant("02", "01", { finish: "tool-calls", time: { created: 1, completed: 2 } }), q]
    expect(status(q, q.parts, between)).toBe("queued")
  })

  test("a queued prompt stops being queued once its own turn closes", () => {
    const q = user("03")
    const messages = [
      user("01"),
      assistant("02", "01", { finish: "stop", time: { created: 1, completed: 2 } }),
      q,
      assistant("04", "03", { finish: "stop", time: { created: 3, completed: 4 } }),
    ]
    expect(status(q, q.parts, messages)).toBeUndefined()
  })

  test("a steer submit is labelled steer, never queue, until the run serves it (anomaly: shown as Queue)", () => {
    const s = user("03", { steer: true })
    const before = [user("01"), assistant("02", "01", { finish: "tool-calls" }), s]
    expect(status(s, s.parts, before)).toBe("steer")
    // An assistant written after the steer means the running run has served it.
    const after = [...before, assistant("04", "01")]
    expect(status(s, s.parts, after)).toBeUndefined()
  })

  test("the steer flag is only honoured on text parts", () => {
    const s = user("03")
    const parts = [{ type: "file", metadata: { steer: true } }]
    expect(status(s, parts, [user("01"), assistant("02", "01", { finish: "tool-calls" }), s])).toBe("queued")
  })

  test("an idle session never carries a delivery badge", () => {
    const q = user("03")
    expect(status(q, q.parts, [user("01"), q], false)).toBeUndefined()
  })

  test("assistant messages are never badged", () => {
    const a = assistant("02", "01", { finish: "tool-calls" })
    expect(status(a, [], [a])).toBeUndefined()
  })
})
