import { describe, expect, test } from "bun:test"
import { JevIntake } from "@/jev/intake"

const noise = (n: number) => Array.from({ length: n }, (_, i) => `progress line ${i} ${"-".repeat(30)}`).join("\n")

const noul = (probability: number) => ({ type: "noul" as const, noul: probability })

describe("jev intake segmentation", () => {
  test("splits into at most max blocks covering every line", () => {
    const blocks = JevIntake.blocksFromText(noise(40), 5)
    expect(blocks).toHaveLength(5)
    expect(blocks[0]!.start).toBe(0)
    expect(blocks.at(-1)!.end).toBe(40)
  })

  test("protects a block that carries an anchor", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\packages\\opencode\\src\\jev\\intake.ts:12`
    const blocks = JevIntake.blocksFromText(text, 4)
    expect(blocks.some((block) => block.protected)).toBe(true)
  })

  test("asks no question about a protected block", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:12`
    const blocks = JevIntake.blocksFromText(text, 4)
    const protectedIds = blocks.filter((block) => block.protected).map((block) => block.id)
    const asked = Object.keys(JevIntake.intakeQuestions(blocks))
    expect(protectedIds.length).toBeGreaterThan(0)
    expect(asked.some((id) => protectedIds.includes(id))).toBe(false)
  })

  test("asks about anchor blocks too when intent mode includes them", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:12`
    const blocks = JevIntake.blocksFromText(text, 4)
    const protectedIds = blocks.filter((block) => block.protected).map((block) => block.id)
    const asked = Object.keys(JevIntake.intakeQuestions(blocks, undefined, true))
    expect(protectedIds.length).toBeGreaterThan(0)
    expect(asked.some((id) => protectedIds.includes(id))).toBe(true)
  })

  test("carries the intent into the question", () => {
    const blocks = JevIntake.blocksFromText(noise(12), 3)
    const question = JevIntake.intakeQuestions(blocks, "add intake to the jev block")["b1"]
    expect(JSON.stringify(question)).toContain("add intake to the jev block")
  })
})

describe("jev intake decision", () => {
  const blocks = JevIntake.blocksFromText(noise(12), 3)

  test("prunes only blocks Jev explicitly refuted", () => {
    const decision = JevIntake.decide(blocks, { b1: noul(0.9), b2: noul(0.1) })
    expect(decision.pruned.map((block) => block.id)).toEqual(["b2"])
    expect(decision.kept.map((block) => block.id)).toEqual(["b1", "b3"])
  })

  test("keeps an unanswered block (fail-open)", () => {
    const decision = JevIntake.decide(blocks, { b1: noul(0.1) })
    expect(decision.pruned.map((block) => block.id)).toEqual(["b1"])
    expect(decision.kept.map((block) => block.id)).toEqual(["b2", "b3"])
  })

  test("never prunes a protected block, even when Jev refuted it", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:12`
    const guarded = JevIntake.blocksFromText(text, 4)
    const target = guarded.find((block) => block.protected)!
    const answers = Object.fromEntries(guarded.map((block) => [block.id, noul(0.01)]))
    const decision = JevIntake.decide(guarded, answers)
    expect(decision.pruned.map((block) => block.id)).not.toContain(target.id)
    expect(decision.protectedKept).toBeGreaterThan(0)
  })

  test("drops an anchor only under the stricter anchor threshold", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:12`
    const guarded = JevIntake.blocksFromText(text, 4)
    const target = guarded.find((block) => block.protected)!
    const answers = { ...Object.fromEntries(guarded.map((block) => [block.id, noul(0.9)])), [target.id]: noul(0.3) }
    expect(JevIntake.decide(guarded, answers).pruned.map((block) => block.id)).not.toContain(target.id)
    expect(JevIntake.decide(guarded, answers, 0.5, 0.4).pruned.map((block) => block.id)).toContain(target.id)
  })

  test("keeps a confident anchor even in intent mode", () => {
    const text = `${noise(9)}\nC:\\jeanluc\\opencode-fork\\src\\jev\\intake.ts:12`
    const guarded = JevIntake.blocksFromText(text, 4)
    const target = guarded.find((block) => block.protected)!
    const answers = Object.fromEntries(guarded.map((block) => [block.id, noul(0.01)]))
    answers[target.id] = noul(0.9)
    expect(JevIntake.decide(guarded, answers, 0.5, 0.25).pruned.map((block) => block.id)).not.toContain(target.id)
  })
})

describe("jev intake apply", () => {
  test("removes only the pruned lines and leaves the anchor verbatim", () => {
    const text = `${noise(6)}\nKEEP C:\\jeanluc\\opencode-fork\\src\\a.ts:1\n${noise(6)}`
    const blocks = JevIntake.blocksFromText(text, 3)
    const decision = JevIntake.decide(
      blocks,
      Object.fromEntries(blocks.map((block) => [block.id, noul(0.05)])),
    )
    const filtered = JevIntake.apply(text, blocks, decision)
    expect(filtered).toContain("C:\\jeanluc\\opencode-fork\\src\\a.ts:1")
    expect(filtered).toContain("[intake:")
    expect(filtered.length).toBeLessThan(text.length)
  })

  test("returns the text unchanged when nothing is pruned", () => {
    const text = noise(9)
    const blocks = JevIntake.blocksFromText(text, 3)
    expect(JevIntake.apply(text, blocks, JevIntake.decide(blocks, {}))).toBe(text)
  })

  test("never inflates the result when a marker outweighs the pruned lines", () => {
    const text = "a\nb\nC:\\jeanluc\\opencode-fork\\src\\x.ts:1"
    const blocks = JevIntake.blocksFromText(text, 3)
    const decision = JevIntake.decide(
      blocks,
      Object.fromEntries(blocks.map((block) => [block.id, noul(0.01)])),
    )
    const filtered = JevIntake.apply(text, blocks, decision)
    expect(filtered.length).toBeLessThanOrEqual(text.length)
    expect(filtered).toBe(text)
  })
})
