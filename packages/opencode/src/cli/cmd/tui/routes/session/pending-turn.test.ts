import { describe, expect, test } from "bun:test"
import { pendingAssistantID } from "./pending-turn"

describe("TUI pending assistant", () => {
  test("does not keep QUEUED when finish or error closes a stale local assistant", () => {
    expect(pendingAssistantID([{ id: "a", role: "assistant", time: { created: 1 }, finish: "stop" }] as any)).toBeUndefined()
    expect(pendingAssistantID([{ id: "b", role: "assistant", time: { created: 1 }, error: { name: "aborted" } }] as any)).toBeUndefined()
  })
  test("returns the latest genuinely open assistant", () => {
    expect(pendingAssistantID([
      { id: "a", role: "assistant", time: { created: 1, completed: 2 }, finish: "stop" },
      { id: "b", role: "assistant", time: { created: 3 } },
    ] as any)).toBe("b")
  })
})
