import type { GoalState } from "./goal-state"

export type TaskEvidenceState = "completed" | "partial" | "blocked" | "error"

export type TaskEvidencePacket = {
  schemaVersion: 1
  id: string
  taskCallID: string
  revision: number
  parentSessionID: string
  childSessionID: string
  state: TaskEvidenceState
  summary: string
  tests: Array<{ command: string; outcome: "passed" | "failed" | "not_run"; summary: string }>
  findings: NonNullable<GoalState["findings"]>
  residuals: Array<{ id: string; summary: string; reason: string }>
  omissions: Array<{ section: "tests" | "findings" | "residuals"; omitted: number; reason: "limit" }>
  source: { transcriptSessionID: string }
}

const severity = { critical: 5, high: 4, medium: 3, low: 2, info: 1 } as const
const status = { open: 4, residual: 3, out_of_scope: 2, closed: 1 } as const

export function buildTaskEvidencePacket(input: {
  taskCallID: string
  revision: number
  parentSessionID: string
  childSessionID: string
  state: TaskEvidenceState
  text: string
  goalState?: Pick<GoalState, "findings" | "completion">
}): TaskEvidencePacket {
  const allFindings = [...(input.goalState?.findings ?? [])].toSorted((a, b) =>
    (status[b.status] - status[a.status]) || (severity[b.severity] - severity[a.severity]) || a.id.localeCompare(b.id),
  )
  const allTests = (input.goalState?.completion?.evidence ?? []).map((item) => ({
    command: item.proof.slice(0, 1_000),
    outcome: "passed" as const,
    summary: item.dod.slice(0, 500),
  }))
  const allResiduals = (input.goalState?.completion?.unverified ?? []).map((item, index) => ({
    id: `UNVERIFIED-${index + 1}`,
    summary: item.dod.slice(0, 500),
    reason: item.reason.slice(0, 500),
  }))
  const omissions: TaskEvidencePacket["omissions"] = []
  if (allFindings.length > 64) omissions.push({ section: "findings", omitted: allFindings.length - 64, reason: "limit" })
  if (allTests.length > 32) omissions.push({ section: "tests", omitted: allTests.length - 32, reason: "limit" })
  if (allResiduals.length > 32) omissions.push({ section: "residuals", omitted: allResiduals.length - 32, reason: "limit" })
  return {
    schemaVersion: 1,
    id: `${input.taskCallID}:${input.revision}`,
    taskCallID: input.taskCallID,
    revision: input.revision,
    parentSessionID: input.parentSessionID,
    childSessionID: input.childSessionID,
    state: input.state,
    summary: (input.goalState?.completion?.summary ?? input.text).slice(0, 1_000),
    tests: allTests.slice(0, 32),
    findings: allFindings.slice(0, 64).map((finding) => ({ ...finding, evidence: finding.evidence.slice(0, 8) })),
    residuals: allResiduals.slice(0, 32),
    omissions,
    source: { transcriptSessionID: input.childSessionID },
  }
}
