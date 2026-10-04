import { describe, expect, test } from "bun:test"
import { JevSkills } from "./skills"

const response = (answers: Record<string, { noul: number }>) =>
  ({
    model: "test",
    answers: Object.fromEntries(
      Object.entries(answers).map(([id, value]) => [id, { type: "noul" as const, confidence: 1, ...value }]),
    ),
  }) as never

describe("JevSkills is opt-in and fail-open", () => {
  test("no configuration means the deterministic ranking runs", () => {
    expect(JevSkills.skillsApplies(undefined, 50)).toBe(false)
    expect(JevSkills.skillsApplies({ enabled: false }, 50)).toBe(false)
  })

  test("an empty catalogue never spends a round-trip", () => {
    expect(JevSkills.skillsApplies({ enabled: true }, 0)).toBe(false)
  })

  test("enabled with candidates lets Jev decide", () => {
    expect(JevSkills.skillsApplies({ enabled: true }, 3)).toBe(true)
  })
})

describe("JevSkills.questions", () => {
  test("asks one closed question per candidate, keyed by name and ordered", () => {
    const { questions, ids } = JevSkills.questions("build a process flow", [
      { name: "bpmn-cartography", description: "BPMN cartography" },
      { name: "xlsx", description: "spreadsheet helper" },
    ])
    expect(ids).toEqual(["bpmn-cartography", "xlsx"])
    expect(Object.keys(questions)).toEqual(["bpmn-cartography", "xlsx"])
    expect(questions["bpmn-cartography"]!.type).toBe("noul")
    expect(questions["xlsx"]!.type).toBe("noul")
  })
})

describe("JevSkills.decide", () => {
  const ids = ["a", "b", "c"]

  test("keeps only the skills Jev affirms at or above the threshold", () => {
    const chosen = JevSkills.decide(response({ a: { noul: 0.9 }, b: { noul: 0.4 }, c: { noul: 0.5 } }), ids)
    expect(chosen).toEqual(["a", "c"])
  })

  test("no usable answer abstains, so the caller keeps the deterministic list", () => {
    expect(JevSkills.decide({ model: "test", answers: {} } as never, ids)).toBeUndefined()
  })

  test("an open request may select every candidate", () => {
    expect(JevSkills.decide(response({ a: { noul: 0.8 }, b: { noul: 0.8 }, c: { noul: 0.8 } }), ids)).toEqual(ids)
  })

  test("a narrow request may select none — a valid, total rejection", () => {
    expect(JevSkills.decide(response({ a: { noul: 0.1 }, b: { noul: 0.1 }, c: { noul: 0.1 } }), ids)).toEqual([])
  })

  test("there is no built-in cap: the selection follows the answers", () => {
    const many = Array.from({ length: 40 }, (_, index) => `s${index}`)
    const all = response(Object.fromEntries(many.map((id) => [id, { noul: 0.7 }])))
    expect(JevSkills.decide(all, many)).toHaveLength(40)
  })
})
