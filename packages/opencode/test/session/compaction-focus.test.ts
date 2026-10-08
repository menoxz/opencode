import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { formatCompactionFocus } from "@/session/compaction"
import { CompactionProfile, GoalState } from "@/session/goal-state"

// The compaction summarizer keeps a FIXED output contract (section template,
// verbatim DoD/finding copy, fallback rules). The agent only steers the *focus*
// through the `compact` tool, and those directives must be additive: no profile,
// no block. This suite pins that boundary without touching the LLM loop.
describe("compaction focus", () => {
  test("an absent or empty profile injects nothing", () => {
    expect(formatCompactionFocus(undefined)).toBe("")
    expect(formatCompactionFocus({ focus: "   ", mustKeep: [] })).toBe("")
  })

  test("focus and mustKeep become directives while the template stays authoritative", () => {
    const block = formatCompactionFocus({
      focus: "Prioritize the migration plan and the rejected alternatives",
      mustKeep: ["src/session/compaction.ts", "ERR_STREAM_RESET"],
    })
    expect(block).toContain("<compaction-focus>")
    expect(block).toContain("Prioritize the migration plan and the rejected alternatives")
    expect(block).toContain("Never drop: src/session/compaction.ts; ERR_STREAM_RESET")
    expect(block).toContain("</compaction-focus>")
    // The directive explicitly defers to the fixed template rather than replacing it.
    expect(block).toContain("fixed output template")
    expect(block).toContain("verbatim")
  })

  test("blank mustKeep entries are dropped", () => {
    const block = formatCompactionFocus({ focus: "keep the goal", mustKeep: [" ", "a.ts", ""] })
    expect(block).toContain("Never drop: a.ts")
    expect(block).not.toContain("Never drop: ;")
  })

  test("CompactionProfile rides on the session goalState carrier", () => {
    const state = Schema.decodeUnknownSync(GoalState)({
      status: "skipped",
      source: "auto",
      goal: "",
      dod: [],
      outOfScope: [],
      version: 0,
      updatedAt: 1,
      compaction: { focus: "f", mustKeep: ["x"], version: 1, updatedAt: 2 },
    })
    expect(state.compaction?.mustKeep).toEqual(["x"])
    // A goalState without the field stays valid (backward compatible).
    const legacy = Schema.decodeUnknownSync(GoalState)({
      status: "skipped",
      source: "auto",
      goal: "",
      dod: [],
      outOfScope: [],
      version: 0,
      updatedAt: 1,
    })
    expect(legacy.compaction).toBeUndefined()
    expect(Schema.decodeUnknownSync(CompactionProfile)({ focus: "f", mustKeep: [], version: 1, updatedAt: 2 })).toBeTruthy()
  })
})
