import { describe, expect, test } from "bun:test"
import { pendingAssistantID } from "./pending-turn"

describe("TUI pending assistant", () => {
  test("does not keep QUEUED when finish or error closes a stale local assistant", () => {
    expect(pendingAssistantID([{ id: "a", role: "assistant", time: { created: 1 }, finish: "stop" }] as any, true)).toBeUndefined()
    expect(pendingAssistantID([{ id: "b", role: "assistant", time: { created: 1 }, error: { name: "aborted" } }] as any, true)).toBeUndefined()
  })
  test("returns no pending assistant while the session is idle", () => {
    expect(pendingAssistantID([{ id: "stale", role: "assistant", time: { created: 1 } }] as any, false)).toBeUndefined()
  })
  test("returns the latest genuinely open assistant while busy", () => {
    expect(pendingAssistantID([
      { id: "a", role: "assistant", time: { created: 1, completed: 2 }, finish: "stop" },
      { id: "b", role: "assistant", time: { created: 3 } },
    ] as any, true)).toBe("b")
  })
})
