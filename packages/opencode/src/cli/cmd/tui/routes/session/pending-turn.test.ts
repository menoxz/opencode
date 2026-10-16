import { describe, expect, test } from "bun:test"
import { queuedUserStatus, visibleFromID, type QueuedStatus } from "./pending-turn"

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
  visibleFrom?: string,
  partsOf?: (messageID: string) => readonly { type: string; metadata?: { [key: string]: unknown } }[],
): QueuedStatus => queuedUserStatus({ message, parts, messages, busy, visibleFrom, partsOf } as never)

describe("TUI user prompt delivery status", () => {
  test("an abandoned open head does not badge the in-flight prompt (anomaly: badge stuck QUEUED)", () => {
    // u1's run was interrupted: its step stopped at `tool-calls`, no terminal
    // step landed and no compaction ran, so order alone cannot separate it from
    // the served turn. u2's step is streaming, which is the distinguisher.
    const u1 = user("1")
    const a1 = assistant("2", "1", { finish: "tool-calls" })
    const u2 = user("3")
    const a2 = assistant("4", "3") // no finish: in flight
    expect(status(u2, [], [u1, a1, u2, a2], true, undefined)).toBeUndefined()
    // The stale head itself is still the anchor when nothing is in flight.
    expect(status(u1, [], [u1, a1], true, undefined)).toBeUndefined()
  })

  test("an interrupted turn from before a compaction cannot hold the anchor (anomaly: every submit showed QUEUED)", () => {
    // The real shape: one abandoned turn left open at the head of the session
    // (its steps all finished `tool-calls`, no terminal step ever landed), a
    // compaction cut much later, and every turn after it properly closed.
    const abandoned = user("01")
    const compaction = user("09")
    const closed = user("11")
    const running = user("13")
    const messages = [
      abandoned,
      assistant("02", "01", { finish: "tool-calls", time: { created: 1, completed: 2 } }),
      compaction,
      assistant("10", "09", { finish: "stop", time: { created: 3, completed: 4 } }),
      closed,
      assistant("12", "11", { finish: "stop", time: { created: 5, completed: 6 } }),
      running,
      assistant("14", "13", { finish: "tool-calls" }),
    ]
    // The abandoned head is older than the newest closed turn ("11"), so the
    // FIFO frontier already drops it: the served prompt is never queued, cut or
    // not. The compaction cut keeps the same guarantee when the client holds
    // the compaction part.
    expect(status(running, running.parts, messages, true, undefined)).toBeUndefined()
    expect(status(running, running.parts, messages, true, "09")).toBeUndefined()
    // A genuine queue behind it is still queued.
    const queued = user("15")
    expect(status(queued, queued.parts, [...messages, queued], true, "09")).toBe("queued")
    // And the abandoned pre-cut turn never shows anything.
    expect(status(abandoned, abandoned.parts, messages, true, "09")).toBeUndefined()
  })

  test("the cut is the newest retained compaction tail, whatever order parts come in", () => {
    const partsOf = (id: string) =>
      id === "03"
        ? [{ type: "compaction", tail_start_id: "07" }]
        : id === "09"
          ? [{ type: "text" }, { type: "compaction", tail_start_id: "11" }]
          : []
    const messages = [user("01"), user("03"), user("09")]
    expect(visibleFromID(messages, partsOf)).toBe("11")
    expect(visibleFromID(messages, () => [])).toBeUndefined()
  })

  test("the compaction cut holds the anchor when no closed turn bounds it", () => {
    // The only closed turn ("01") is older than the abandoned open turn ("03"),
    // so the FIFO frontier does not exclude it; only the compaction cut does.
    const earlyClosed = user("01")
    const abandoned = user("03")
    const running = user("13")
    const messages = [
      earlyClosed,
      assistant("02", "01", { finish: "stop", time: { created: 1, completed: 2 } }),
      abandoned,
      assistant("04", "03", { finish: "tool-calls", time: { created: 3, completed: 4 } }),
      running,
      assistant("14", "13", { finish: "tool-calls" }),
    ]
    expect(status(running, running.parts, messages, true, undefined)).toBe("queued")
    expect(status(running, running.parts, messages, true, "09")).toBeUndefined()
  })

  test("an abandoned head after the last compaction is dropped by the FIFO frontier (anomaly: badge stuck QUEUED)", () => {
    // The head is past the cut, so only a later closed turn can prove the run
    // moved on — the real shape of the live regression.
    const stale = user("11")
    const closedTurn = user("13")
    const served = user("15")
    const messages = [
      stale,
      assistant("12", "11", { finish: "tool-calls", time: { created: 1, completed: 2 } }),
      closedTurn,
      assistant("14", "13", { finish: "stop", time: { created: 3, completed: 4 } }),
      served,
      assistant("16", "15", { finish: "tool-calls" }),
    ]
    expect(status(served, served.parts, messages, true, "09")).toBeUndefined()
    const queued = user("17")
    expect(status(queued, queued.parts, [...messages, queued], true, "09")).toBe("queued")
  })

  test("the prompt that opened the running turn is never queued (anomaly: every submit showed QUEUED)", () => {
    // Submitted to an idle session: the run starts on it, it waits for nobody.
    const first = user("01")
    expect(status(first, first.parts, [first])).toBeUndefined()
    // Same prompt once its own run is stepping: still not queued.
    const stepping = [first, assistant("02", "01", { finish: "tool-calls" })]
    expect(status(first, first.parts, stepping)).toBeUndefined()
    // And once the run is between two steps.
    const between = [first, assistant("02", "01", { finish: "tool-calls", time: { created: 1, completed: 2 } })]
    expect(status(first, first.parts, between)).toBeUndefined()
  })

  test("only the prompts behind the served one are queued", () => {
    const first = user("01")
    const second = user("03")
    const third = user("05")
    const running = [first, assistant("02", "01", { finish: "tool-calls" }), second, third]
    expect(status(first, first.parts, running)).toBeUndefined()
    expect(status(second, second.parts, running)).toBe("queued")
    expect(status(third, third.parts, running)).toBe("queued")
  })

  test("the badge follows the FIFO: a queued prompt stops being queued once the run serves it", () => {
    const first = user("01")
    const second = user("03")
    const running = [first, assistant("02", "01", { finish: "tool-calls" }), second]
    expect(status(second, second.parts, running)).toBe("queued")
    // First turn closed: the run now serves the second prompt.
    const served = [first, assistant("02", "01", { finish: "stop", time: { created: 1, completed: 2 } }), second]
    expect(status(second, second.parts, served)).toBeUndefined()
    expect(status(first, first.parts, served)).toBeUndefined()
  })

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

  test("a queued prompt keeps its badge until its own turn is served", () => {
    const q = user("03")
    const running = [user("01"), assistant("02", "01", { finish: "tool-calls" }), q]
    expect(status(q, q.parts, running)).toBe("queued")
    // Its own turn served: the badge goes, like any other prompt.
    const served = [...running, assistant("04", "03", { finish: "stop", time: { created: 1, completed: 2 } })]
    expect(status(q, q.parts, served)).toBeUndefined()
  })

  test("a steer keeps STEER even when the anchor turn already closed (anomaly: badge vanished)", () => {
    // The anchor landed its terminal step while the run keeps going on pending
    // tool calls: the anchor scan then has no open turn and would mistake the
    // steer for the one being served.
    const s = user("04", { steer: true })
    const messages = [
      user("01"),
      assistant("02", "01", { finish: "tool-calls" }),
      assistant("03", "01", { finish: "stop", time: { created: 1, completed: 2 } }),
      s,
    ]
    expect(status(s, s.parts, messages)).toBe("steer")
  })

  test("a runtime-shaped user message is neither badged nor taken as the anchor", () => {
    const partsOf = (id: string) =>
      id === "01"
        ? [{ type: "text", text: "bg", metadata: { background_notification: true } }]
        : id === "03"
          ? [{ type: "compaction" }]
          : []
    const messages = [user("01"), user("03"), user("05"), assistant("06", "05", { finish: "tool-calls" })]
    // The notification and the compaction are skipped, so the run serves "05".
    expect(status(user("05"), [], messages, true, undefined, partsOf)).toBeUndefined()
    // Neither runtime message carries a badge.
    expect(
      queuedUserStatus({
        message: { id: "01", role: "user" },
        parts: [{ type: "text", text: "bg", metadata: { background_notification: true } }],
        messages,
        busy: true,
        partsOf,
      } as never),
    ).toBeUndefined()
    // A real prompt behind the served one is still queued.
    const q = user("07")
    expect(status(q, q.parts, [...messages, q], true, undefined, partsOf)).toBe("queued")
  })
})
