import { describe, expect, test } from "bun:test"
import type { GoalState } from "@opencode-ai/sdk/v2"
import { buildGoalEditTemplate, nextGoalStateFromEdit, parseGoalEditInput } from "./goal-edit-format"

const previous: GoalState = {
  status: "approved",
  source: "auto",
  goal: "old goal",
  dod: ["old dod"],
  outOfScope: ["old oos"],
  compressed: "GOAL: old goal\n",
  anchorUserID: "msg_anchor",
  findings: [
    {
      id: "f1",
      severity: "high",
      status: "open",
      summary: "finding survives the edit",
      evidence: ["goal-state.ts:1"],
      firstSeenAt: 1,
      updatedAt: 2,
    },
  ],
  completion: { summary: "was completed", evidence: [], unverified: [], completedAt: 3 },
  deliverable: "implementation",
  version: 4,
  updatedAt: 10,
}

describe("nextGoalStateFromEdit", () => {
  test("preserves every runtime field the dialog does not edit", () => {
    const next = nextGoalStateFromEdit(previous, { goal: "new goal", dod: ["a"], outOfScope: ["b"] })

    expect(next.anchorUserID).toBe("msg_anchor")
    expect(next.findings).toEqual(previous.findings)
    expect(next.completion).toEqual(previous.completion)
    expect(next.deliverable).toBe("implementation")
    expect(next.goal).toBe("new goal")
    expect(next.dod).toEqual(["a"])
    expect(next.outOfScope).toEqual(["b"])
    expect(next.status).toBe("edited")
    expect(next.source).toBe("user")
  })

  test("bumps the version and drops the derived compressed block for server regeneration", () => {
    const next = nextGoalStateFromEdit(previous, { goal: "g", dod: [], outOfScope: [] })

    expect(next.version).toBe(previous.version + 1)
    expect(next.compressed).toBeUndefined()
    expect(next.updatedAt).toBeGreaterThanOrEqual(previous.updatedAt)
  })

  test("starts at version 1 when the session has no contract yet", () => {
    const next = nextGoalStateFromEdit(undefined, { goal: "first goal", dod: ["d"], outOfScope: [] })

    expect(next.version).toBe(1)
    expect(next.status).toBe("edited")
    expect(next.source).toBe("user")
    expect(next.goal).toBe("first goal")
  })

  test("edited contract round-trips through the dialog template", () => {
    const next = nextGoalStateFromEdit(previous, { goal: "renamed", dod: ["one", "two"], outOfScope: ["never"] })
    const parsed = parseGoalEditInput(buildGoalEditTemplate(next))

    expect(parsed).toEqual({ goal: "renamed", dod: ["one", "two"], outOfScope: ["never"] })
  })
})
