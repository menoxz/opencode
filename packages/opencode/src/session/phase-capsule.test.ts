import { describe, expect, test } from "bun:test"
import { derivePhaseCapsule } from "./phase-capsule"

const user = (id: string) => ({ info: { id, role: "user" as const }, parts: [{ type: "text", text: "secret" }] })
const assistant = (id: string, mode: string, parts: Array<{ type: string }> = []) => ({
  info: { id, role: "assistant" as const, mode },
  parts,
})

describe("phase capsule shadow", () => {
  test("is deterministic and contains no raw message text", () => {
    const messages = [user("u1"), assistant("a1", "plan")]
    const first = derivePhaseCapsule(messages)
    expect(derivePhaseCapsule(messages)).toEqual(first)
    expect(JSON.stringify(first)).not.toContain("secret")
    expect(first.phase).toBe("discovery")
  })

  test("increments epochs on compaction and explicit plan to build transition", () => {
    const capsule = derivePhaseCapsule([
      user("u1"),
      assistant("a1", "plan"),
      assistant("a2", "plan", [{ type: "compaction" }]),
      assistant("a3", "build"),
    ])
    expect(capsule.epoch).toBe(2)
    expect(capsule.compactions).toBe(1)
    expect(capsule.phase).toBe("implementation")
  })
})
