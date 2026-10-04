import { describe, expect, test } from "bun:test"
import { JevIntake } from "./intake"

describe("JevIntake.intakeApplies", () => {
  test("a tool result is never pruned, even with the filter enabled in configuration", () => {
    expect(JevIntake.intakeApplies({ enabled: true }, 500_000)).toBe(false)
    expect(JevIntake.intakeApplies({ enabled: true }, 0)).toBe(false)
    expect(JevIntake.intakeApplies(undefined, 500_000)).toBe(false)
  })

  test("no payload size or section can turn the filter back on", () => {
    for (const chars of [0, 1, 8_000, 40_000, 1_000_000]) expect(JevIntake.intakeApplies({ enabled: true }, chars)).toBe(false)
  })
})

describe("JevIntake.decide without answers", () => {
  test("an unanswered block is kept, so nothing can be dropped by omission", () => {
    const text = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join("\n")
    const decision = JevIntake.decide(JevIntake.blocksFromText(text), {})
    expect(decision.pruned.length).toBe(0)
    expect(decision.kept.length).toBeGreaterThan(0)
    expect(JevIntake.apply(text, JevIntake.blocksFromText(text), decision)).toBe(text)
  })

  test("an anchored block is never dropped even when explicitly refuted", () => {
    const text = "noise\nC:\\jeanluc\\opencode-fork\\packages\\opencode\\src\\x.ts\nmore noise"
    const blocks = JevIntake.blocksFromText(text)
    const answers = Object.fromEntries(
      blocks.map((block) => [block.id, { type: "noul", probability: 0, confidence: 1 }] as const),
    )
    const decision = JevIntake.decide(blocks, answers as never)
    expect(decision.pruned.length).toBe(0)
    expect(decision.protectedKept).toBeGreaterThan(0)
  })
})
