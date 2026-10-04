import { beforeEach, describe, expect, test } from "bun:test"
import {
  MAX_IDENTICAL_REPEATS,
  ProgressLedger,
  STAGNATION_LIMIT,
  buildProgressCapsule,
  fingerprint,
  progressCapsule,
  progressFor,
  resetProgress,
} from "./progress"

const action = (name: string, args: unknown) => ({ name, args })
const outcome = (input: { name: string; args: unknown; scope: string; truth: "observed" | "unknown" | "error"; summary: string; at: number }) => input

describe("fingerprint", () => {
  test("is stable across argument key order", () => {
    expect(fingerprint("click", { a: 1, b: "x" })).toBe(fingerprint("click", { b: "x", a: 1 }))
    expect(fingerprint("click", { a: 1 })).not.toBe(fingerprint("click", { a: 2 }))
    expect(fingerprint("click", { a: 1 })).not.toBe(fingerprint("type", { a: 1 }))
  })
})

describe("ProgressLedger.guard", () => {
  let ledger: ProgressLedger
  beforeEach(() => {
    ledger = new ProgressLedger()
  })

  test("allows a first or different action", () => {
    expect(ledger.guard(action("browser_use", { url: "a" }))).toEqual({ kind: "allow", repeats: 0 })
    ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "a", truth: "observed", summary: "home", at: 1 }))
    expect(ledger.guard(action("browser_use", { url: "b" }))).toEqual({ kind: "allow", repeats: 0 })
  })

  test("warns when the previous identical action had an unknown outcome", () => {
    ledger.observe(outcome({ name: "desktop_click", args: { x: 1 }, scope: "app", truth: "unknown", summary: "outcome unknown", at: 1 }))
    const decision = ledger.guard(action("desktop_click", { x: 1 }))
    expect(decision.kind).toBe("warn")
    expect(decision.repeats).toBe(1)
    expect(decision.message).toContain("unknown")
  })

  test("blocks a repeated action once recovery is exhausted", () => {
    const same = { name: "desktop_click", args: { x: 1 }, scope: "app", truth: "observed" as const, summary: "same", at: 1 }
    for (let index = 0; index < STAGNATION_LIMIT + 1; index++) ledger.observe({ ...same, at: index })
    const decision = ledger.guard(action("desktop_click", { x: 1 }))
    expect(decision.kind).toBe("block")
    expect(decision.repeats).toBeGreaterThanOrEqual(MAX_IDENTICAL_REPEATS)
    expect(decision.message).toContain("change strategy")
  })
})

describe("ProgressLedger.observe verdicts", () => {
  let ledger: ProgressLedger
  beforeEach(() => {
    ledger = new ProgressLedger()
  })

  test("reports progress when the state changes without an expectation", () => {
    ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "a", truth: "observed", summary: "home", at: 1 }))
    const record = ledger.observe(outcome({ name: "browser_use", args: { url: "b" }, scope: "a", truth: "observed", summary: "cart", at: 2 }))
    expect(record.verdict).toBe("progress")
  })

  test("reports no-progress when the same scope yields the same summary", () => {
    ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "a", truth: "observed", summary: "home", at: 1 }))
    const record = ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "a", truth: "observed", summary: "home", at: 2 }))
    expect(record.verdict).toBe("no-progress")
  })

  test("compares the observation against a declared expectation", () => {
    ledger.expect({ name: "browser_use", scope: "tab:cart", summary: "cart page with 3 items" })
    const expected = ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "tab:cart", truth: "observed", summary: "cart page with 3 items and a checkout button", at: 1 }))
    expect(expected.verdict).toBe("expected")
    expect(expected.expectation).toBe("cart page with 3 items")

    ledger.expect({ name: "browser_use", scope: "tab:cart", summary: "payment complete" })
    const different = ledger.observe(outcome({ name: "browser_use", args: { url: "a" }, scope: "tab:cart", truth: "observed", summary: "address form", at: 2 }))
    expect(different.verdict).toBe("different")
  })

  test("maps a clean failure and an unknown outcome to distinct verdicts", () => {
    const failed = ledger.observe(outcome({ name: "desktop_click", args: {}, scope: "app", truth: "error", summary: "error: not found", at: 1 }))
    expect(failed.verdict).toBe("failed")
    const unknown = ledger.observe(outcome({ name: "desktop_click", args: {}, scope: "app", truth: "unknown", summary: "outcome unknown", at: 2 }))
    expect(unknown.verdict).toBe("unknown")
  })

  test("tracks stagnation and resets it on real progress", () => {
    ledger.observe(outcome({ name: "click", args: {}, scope: "app", truth: "observed", summary: "same", at: 1 }))
    ledger.observe(outcome({ name: "click", args: {}, scope: "app", truth: "observed", summary: "same", at: 2 }))
    expect(ledger.status().stagnant).toBe(1)
    ledger.observe(outcome({ name: "click", args: {}, scope: "app", truth: "observed", summary: "changed", at: 3 }))
    expect(ledger.status().stagnant).toBe(0)
  })
})

describe("progress capsule", () => {
  test("is empty until something is tracked", () => {
    expect(buildProgressCapsule(new ProgressLedger())).toBe("")
  })

  test("reports the last verdict, stagnation and harness guidance", () => {
    const ledger = new ProgressLedger()
    ledger.observe(outcome({ name: "browser_use", args: {}, scope: "tab", truth: "observed", summary: "home", at: 1 }))
    ledger.guard(action("desktop_click", { x: 1 }))
    ledger.observe(outcome({ name: "desktop_click", args: { x: 1 }, scope: "app", truth: "unknown", summary: "outcome unknown", at: 2 }))
    ledger.guard(action("desktop_click", { x: 1 }))
    const capsule = buildProgressCapsule(ledger)
    expect(capsule).toContain("<progress_state>")
    expect(capsule).toContain("last: desktop_click on app → unknown")
    expect(capsule).toContain("Warning: the previous")
    expect(capsule.endsWith("</progress_state>")).toBe(true)
  })
})

describe("progress registry", () => {
  test("isolates per session and resets", () => {
    resetProgress()
    progressFor("ses_a").observe(outcome({ name: "a", args: {}, scope: "s", truth: "observed", summary: "x", at: 1 }))
    expect(progressCapsule("ses_a")).toContain("<progress_state>")
    expect(progressCapsule("ses_b")).toBe("")
    resetProgress("ses_a")
    expect(progressCapsule("ses_a")).toBe("")
    resetProgress()
  })
})
