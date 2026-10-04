import { describe, expect, test } from "bun:test"
import { JevTools } from "./tools"

const response = (answers: Record<string, { noul: number }>) =>
  ({
    model: "test",
    answers: Object.fromEntries(
      Object.entries(answers).map(([id, value]) => [id, { type: "noul" as const, confidence: 1, ...value }]),
    ),
  }) as never

describe("JevTools is opt-in and fail-open", () => {
  test("no configuration means the lexical ranking runs", () => {
    expect(JevTools.toolsApplies(undefined, 50)).toBe(false)
    expect(JevTools.toolsApplies({ enabled: false }, 50)).toBe(false)
  })

  test("no candidate never spends a round-trip", () => {
    expect(JevTools.toolsApplies({ enabled: true }, 0)).toBe(false)
  })

  test("enabled with candidates lets Jev decide", () => {
    expect(JevTools.toolsApplies({ enabled: true }, 2)).toBe(true)
  })
})

describe("JevTools.questions", () => {
  test("asks one closed question per candidate, keyed by tool id and ordered", () => {
    const { questions, ids } = JevTools.questions("run the test suite", [
      { id: "bash", description: "Run a shell command" },
      { id: "web-browser_navigate", description: "Open a web page" },
    ])
    expect(ids).toEqual(["bash", "web-browser_navigate"])
    expect(Object.keys(questions)).toEqual(["bash", "web-browser_navigate"])
    expect(questions["bash"]!.type).toBe("noul")
    expect(questions["web-browser_navigate"]!.type).toBe("noul")
  })
})

describe("JevTools.decide", () => {
  const ids = ["bash", "read", "write"]

  test("keeps only the tools Jev affirms at or above the threshold", () => {
    expect(JevTools.decide(response({ bash: { noul: 0.91 }, read: { noul: 0.3 }, write: { noul: 0.5 } }), ids)).toEqual([
      "bash",
      "write",
    ])
  })

  test("no usable answer abstains, so the caller keeps the lexical list", () => {
    expect(JevTools.decide({ model: "test", answers: {} } as never, ids)).toBeUndefined()
  })

  test("an open request may surface every candidate", () => {
    expect(JevTools.decide(response({ bash: { noul: 0.8 }, read: { noul: 0.8 }, write: { noul: 0.8 } }), ids)).toEqual(ids)
  })

  test("a request needing no extra tool may surface none — a valid total rejection", () => {
    expect(JevTools.decide(response({ bash: { noul: 0.1 }, read: { noul: 0.1 }, write: { noul: 0.1 } }), ids)).toEqual([])
  })

  test("there is no built-in cap: the selection follows the answers", () => {
    const many = Array.from({ length: 40 }, (_, index) => `t${index}`)
    const all = response(Object.fromEntries(many.map((id) => [id, { noul: 0.7 }])))
    expect(JevTools.decide(all, many)).toHaveLength(40)
  })
})
