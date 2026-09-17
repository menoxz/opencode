import { describe, expect, test } from "bun:test"
import { AUTO_CONTINUE_LIMIT, decideRunDecision, hasOpenTodos, shouldAutoContinue } from "./continuation"

describe("action-oriented continuation", () => {
  test("continues only executable work", () => {
    expect(shouldAutoContinue({ nextAction: { kind: "execute", stepID: "P2" }, idleContinues: 0 })).toBe(true)
    expect(shouldAutoContinue({ nextAction: { kind: "retry", fingerprint: "r1" }, idleContinues: 1 })).toBe(true)
    expect(shouldAutoContinue({ nextAction: { kind: "ask_user" }, idleContinues: 0 })).toBe(false)
    expect(shouldAutoContinue({ nextAction: { kind: "report" }, idleContinues: 0 })).toBe(false)
    expect(shouldAutoContinue({ nextAction: { kind: "none" }, idleContinues: 0 })).toBe(false)
  })

  test("preserves the idle budget", () => {
    expect(shouldAutoContinue({ nextAction: { kind: "execute" }, idleContinues: AUTO_CONTINUE_LIMIT - 1 })).toBe(true)
    expect(shouldAutoContinue({ nextAction: { kind: "execute" }, idleContinues: AUTO_CONTINUE_LIMIT })).toBe(false)
  })

  test("classifies executable, waiting, user, report, and terminal states", () => {
    const base = { pendingTools: false, stepLimitReached: false, autocontinueEnabled: true, idleContinues: 0 }
    expect(decideRunDecision({ ...base, nextAction: { kind: "execute" } })).toEqual({ action: "continue", reason: "executable-action" })
    expect(decideRunDecision({ ...base, nextAction: { kind: "retry", fingerprint: "r1" } })).toEqual({ action: "continue", reason: "retry" })
    expect(decideRunDecision({ ...base, nextAction: { kind: "await_tool" } })).toEqual({ action: "wait", reason: "pending-tools" })
    expect(decideRunDecision({ ...base, nextAction: { kind: "ask_user" } })).toEqual({ action: "stop", reason: "awaiting-user" })
    expect(decideRunDecision({ ...base, nextAction: { kind: "report" } })).toEqual({ action: "stop", reason: "report-delivered" })
    expect(decideRunDecision({ ...base, nextAction: { kind: "none" } })).toEqual({ action: "stop", reason: "no-executable-action" })
  })
})

describe("hasOpenTodos", () => {
  test("distinguishes open from terminal todo lists", () => {
    expect(hasOpenTodos([{ status: "pending" }])).toBe(true)
    expect(hasOpenTodos([{ status: "in_progress" }])).toBe(true)
    expect(hasOpenTodos([{ status: "completed" }, { status: "cancelled" }])).toBe(false)
  })
})
