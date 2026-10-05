import { describe, expect, test } from "bun:test"
import { JevBrowserActionSpace } from "./action-space"
import { JevBrowserValidate } from "./validate"

const choice = (choice: string, probabilities: Record<string, number>) =>
  ({ type: "choice" as const, choice, confidence: 0.9, probabilities }) as never

const elements = [
  { index: 1, role: "combobox", label: "Where from?", value: "", actionable: true },
  { index: 2, role: "combobox", label: "Where to?", value: "London", actionable: true },
  { index: 3, role: "button", label: "Search", actionable: true },
  { index: 4, role: "button", label: "Clear", actionable: false },
]

// The real operation set, not a restatement: a divergence between the tests and
// the action space would then fail here instead of hiding.
const operations = JevBrowserActionSpace.OPERATIONS

describe("JevBrowserValidate.target", () => {
  test("accepts a normalized choice that is the argmax", () => {
    const result = JevBrowserValidate.target(choice("1", { "1": 0.72, "2": 0.2, "3": 0.08 }), elements)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.index).toBe(1)
    expect(result.element.label).toBe("Where from?")
    expect(result.confidence).toBeCloseTo(0.72)
  })

  test("rejects a choice that is not the argmax", () => {
    const result = JevBrowserValidate.target(choice("3", { "1": 0.72, "3": 0.28 }), elements)
    expect(result).toMatchObject({ ok: false, reason: "not_argmax" })
  })

  test("rejects probabilities that do not sum to 1", () => {
    const result = JevBrowserValidate.target(choice("1", { "1": 0.5, "2": 0.2 }), elements)
    expect(result).toMatchObject({ ok: false, reason: "not_normalized" })
  })

  test("accepts a sum inside the tolerance", () => {
    const result = JevBrowserValidate.target(choice("1", { "1": 0.7, "2": 0.31 }), elements)
    expect(result.ok).toBe(true)
  })

  test("rejects an id that is not in the offered table", () => {
    const result = JevBrowserValidate.target(choice("99", { "99": 0.9, "1": 0.1 }), elements)
    expect(result).toMatchObject({ ok: false, reason: "unknown_id" })
  })

  test("rejects an observed but non-actionable element", () => {
    const result = JevBrowserValidate.target(choice("4", { "4": 0.9, "1": 0.1 }), elements)
    expect(result).toMatchObject({ ok: false, reason: "unknown_id" })
    expect(result.ok === false && result.detail).toContain("not actionable")
  })

  test("a missing head abstains rather than deciding", () => {
    expect(JevBrowserValidate.target(undefined, elements)).toMatchObject({ ok: false, reason: "head_absent" })
  })

  test("a non-choice head is refused", () => {
    const noul = { type: "noul" as const, noul: 0.9 } as never
    expect(JevBrowserValidate.target(noul, elements)).toMatchObject({ ok: false, reason: "not_choice" })
  })

  test("a missing probability table is refused", () => {
    const bare = { type: "choice" as const, choice: "1", confidence: 0.9 } as never
    expect(JevBrowserValidate.target(bare, elements)).toMatchObject({ ok: false, reason: "no_probabilities" })
  })

  test("an empty action space never decides", () => {
    expect(JevBrowserValidate.target(choice("1", { "1": 1 }), [])).toMatchObject({ ok: false, reason: "empty_space" })
  })
})

describe("JevBrowserValidate.decision", () => {
  /**
   * A well-formed operation head: the chosen operation holds the mass and the rest
   * shares what is left, so the table sums to exactly 1. Hand-built tables that
   * sum to 1.02 fail on `not_normalized` before the case under test is reached.
   */
  const head = (chosen: string, share = 0.9) => {
    const others = operations.length - 1
    const remainder = (1 - share) / others
    return choice(
      chosen,
      Object.fromEntries(operations.map((operation) => [operation.id, operation.id === chosen ? share : remainder])),
    )
  }

  const pick = (chosen: string, targetId: string) => ({
    operation: head(chosen),
    [`${targetId}_target`]: choice("1", { "1": 0.8, "2": 0.2 }),
  })

  test("only the target head matching the chosen operation may act", () => {
    const result = JevBrowserValidate.decision(pick("CLICK", "CLICK"), operations, elements)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operation).toBe("CLICK")
    expect(result.index).toBe(1)
  })

  test("an operation outside the action space is refused", () => {
    // The stray id holds the mass and the real operations share the rest, so the
    // table sums to 1 and the rejection is about the id, not the normalization.
    const share = 0.88
    const rest = (1 - share) / operations.length
    const stray = choice(
      "DRAG",
      Object.fromEntries([...operations.map((operation) => [operation.id, rest]), ["DRAG", share]]),
    )
    const result = JevBrowserValidate.decision({ operation: stray }, operations, elements)
    expect(result).toMatchObject({ ok: false, reason: "unknown_id" })
  })

  test("an operation that is not the argmax is refused", () => {
    const rest = (1 - 0.9) / (operations.length - 1)
    const table = Object.fromEntries(operations.map((op) => [op.id, op.id === "DONE" ? 0.9 : rest]))
    // CLICK is the reported choice but DONE scores higher, so the pair is not a decision.
    const result = JevBrowserValidate.decision({ operation: choice("CLICK", table) }, operations, elements)
    expect(result).toMatchObject({ ok: false, reason: "not_argmax" })
  })

  test("DONE needs no target and is accepted without one", () => {
    const result = JevBrowserValidate.decision({ operation: choice("DONE", { DONE: 0.9, CLICK: 0.1 }) }, operations, elements)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operation).toBe("DONE")
    expect(result.index).toBeUndefined()
  })

  test("CLICK without its target head abstains", () => {
    const result = JevBrowserValidate.decision({ operation: choice("CLICK", { CLICK: 1 }) }, operations, elements)
    expect(result).toMatchObject({ ok: false, reason: "head_absent" })
  })

  test("headFor names the authoritative head of the chosen operation", () => {
    expect(JevBrowserValidate.headFor({ id: "TYPE_TEXT", takesTarget: true })).toBe("TYPE_TEXT_target")
    expect(JevBrowserValidate.headFor({ id: "WAIT", takesTarget: false })).toBeUndefined()
  })
})