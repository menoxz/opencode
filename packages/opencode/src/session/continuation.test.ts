import { describe, expect, test } from "bun:test"
import type { GoalState } from "./goal-state"
import { AUTO_CONTINUE_LIMIT, decideRunDecision, hasOpenTodos, shouldAutoContinue } from "./continuation"

function goal(overrides: Partial<GoalState>): GoalState {
  return {
    status: "draft",
    source: "auto",
    goal: "ship the fix",
    dod: ["fix", "test"],
    outOfScope: [],
    version: 1,
    updatedAt: 1,
    ...overrides,
  } as GoalState
}

describe("shouldAutoContinue", () => {
  test("continues while the anchored objective is still open", () => {
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: "u1" }), userID: "u1", idleContinues: 0 })).toBe(true)
    expect(shouldAutoContinue({ goal: goal({ status: "approved", anchorUserID: "u1" }), userID: "u1", idleContinues: 1 })).toBe(true)
    expect(shouldAutoContinue({ goal: goal({ status: "edited", anchorUserID: "u1" }), userID: "u1", idleContinues: 2 })).toBe(true)
  })

  test("never continues without an objective anchored to the active user", () => {
    expect(shouldAutoContinue({ goal: undefined, userID: "u1", idleContinues: 0 })).toBe(false)
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: "u2" }), userID: "u1", idleContinues: 0 })).toBe(false)
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: undefined }), userID: "u1", idleContinues: 0 })).toBe(false)
  })

  test("stops for terminal or user-waiting objectives", () => {
    for (const status of ["completed", "skipped", "pending_user"] as const)
      expect(shouldAutoContinue({ goal: goal({ status, anchorUserID: "u1" }), userID: "u1", idleContinues: 0 })).toBe(false)
  })

  test("gives up after the idle limit of text-only stops", () => {
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: "u1" }), userID: "u1", idleContinues: AUTO_CONTINUE_LIMIT - 1 })).toBe(true)
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: "u1" }), userID: "u1", idleContinues: AUTO_CONTINUE_LIMIT })).toBe(false)
    expect(shouldAutoContinue({ goal: goal({ anchorUserID: "u1" }), userID: "u1", idleContinues: 2, limit: 2 })).toBe(false)
  })
})

const todo = (status: string) => ({ status })

describe("decideRunDecision", () => {
  const base = {
    userID: "u1",
    todos: [] as { status: string }[],
    idleContinues: 0,
    autocontinueEnabled: true,
    stepLimitReached: false,
    pendingTools: false,
  }

  test("waits while tool calls are pending", () => {
    expect(decideRunDecision({ ...base, goal: undefined, pendingTools: true })).toEqual({ action: "wait", reason: "pending-tools" })
  })

  test("stops on the step limit and when autocontinue is disabled", () => {
    expect(decideRunDecision({ ...base, goal: undefined, stepLimitReached: true })).toEqual({ action: "stop", reason: "step-limit" })
    expect(decideRunDecision({ ...base, goal: undefined, autocontinueEnabled: false })).toEqual({ action: "stop", reason: "autocontinue-disabled" })
  })

  test("continues an anchored open objective", () => {
    expect(decideRunDecision({ ...base, goal: goal({ status: "approved", anchorUserID: "u1" }) })).toEqual({ action: "continue", reason: "open-objective" })
  })

  test("continues on open todos and names the reason", () => {
    expect(decideRunDecision({ ...base, goal: goal({ status: "approved", anchorUserID: "u1" }), todos: [todo("in_progress")] })).toEqual({ action: "continue", reason: "pending-todos" })
    expect(decideRunDecision({ ...base, goal: undefined, todos: [todo("pending")] })).toEqual({ action: "continue", reason: "pending-todos" })
  })

  test("stops on legitimate end states", () => {
    expect(decideRunDecision({ ...base, goal: goal({ status: "completed", anchorUserID: "u1" }) })).toEqual({ action: "stop", reason: "objective-complete" })
    expect(decideRunDecision({ ...base, goal: goal({ status: "blocked", anchorUserID: "u1" }) })).toEqual({ action: "stop", reason: "objective-blocked" })
    expect(decideRunDecision({ ...base, goal: goal({ status: "pending_user", anchorUserID: "u1" }) })).toEqual({ action: "stop", reason: "awaiting-user" })
    expect(decideRunDecision({ ...base, goal: goal({ status: "skipped", anchorUserID: "u1" }) })).toEqual({ action: "stop", reason: "mission-skipped" })
  })

  test("stops with no work and when the idle budget is spent", () => {
    expect(decideRunDecision({ ...base, goal: undefined })).toEqual({ action: "stop", reason: "no-objective" })
    expect(decideRunDecision({ ...base, goal: goal({ anchorUserID: "u1" }), idleContinues: AUTO_CONTINUE_LIMIT })).toEqual({ action: "stop", reason: "idle-budget" })
  })

  test("hasOpenTodos only counts work in flight", () => {
    expect(hasOpenTodos([todo("completed"), todo("cancelled")])).toBe(false)
    expect(hasOpenTodos([todo("pending")])).toBe(true)
  })
})
