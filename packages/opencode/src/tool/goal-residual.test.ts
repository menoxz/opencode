import { describe, expect, test } from "bun:test"
import { blockingResidualFindings, sessionRunningJobs } from "./goal-contract"
import type { GoalFinding } from "@/session/goal-evidence"

const finding = (over: Partial<GoalFinding> = {}): GoalFinding => ({
  id: "F1",
  severity: "high",
  status: "residual",
  summary: "connection leak under load",
  evidence: ["probe exit 1"],
  firstSeenAt: 0,
  updatedAt: 0,
  ...over,
})

// Regression context: TS-1..TS-7 were flipped from open to residual in the same
// completion call and the objective was accepted. For an implementation mission
// that is a renamed defect, not a finished job.
describe("blockingResidualFindings", () => {
  test("blocks high and critical residual findings on an implementation objective", () => {
    expect(blockingResidualFindings("implementation", [finding({ severity: "critical" })])).toHaveLength(1)
    expect(blockingResidualFindings("implementation", [finding({ severity: "high" })])).toHaveLength(1)
  })

  test("allows low/medium residual and non-residual findings", () => {
    expect(blockingResidualFindings("implementation", [finding({ severity: "medium" })])).toHaveLength(0)
    expect(blockingResidualFindings("implementation", [finding({ severity: "low" })])).toHaveLength(0)
    expect(blockingResidualFindings("implementation", [finding({ status: "open" })])).toHaveLength(0)
    expect(blockingResidualFindings("implementation", [finding({ status: "closed" })])).toHaveLength(0)
    expect(
      blockingResidualFindings("implementation", [finding({ status: "out_of_scope", severity: "critical" })]),
    ).toHaveLength(0)
  })

  test("never blocks audits, plans, answers or legacy contracts", () => {
    for (const deliverable of ["audit", "plan", "answer", undefined] as const)
      expect(blockingResidualFindings(deliverable, [finding({ severity: "critical" })])).toHaveLength(0)
  })
})

const job = (over: Record<string, unknown> = {}) => ({
  id: "ses_child",
  type: "explore",
  status: "running",
  started_at: 0,
  metadata: { parentSessionId: "ses_parent" } as Record<string, unknown>,
  ...over,
})

describe("sessionRunningJobs", () => {
  test("keeps a running job owned by the session", () => {
    expect(sessionRunningJobs([job()], "ses_parent")).toHaveLength(1)
  })

  test("ignores jobs of another session, finished jobs and unowned jobs", () => {
    expect(sessionRunningJobs([job()], "ses_other")).toHaveLength(0)
    expect(sessionRunningJobs([job({ status: "completed" })], "ses_parent")).toHaveLength(0)
    expect(sessionRunningJobs([job({ metadata: {} })], "ses_parent")).toHaveLength(0)
  })
})
