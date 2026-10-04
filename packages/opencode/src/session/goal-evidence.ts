export type GoalFindingStatus = "open" | "closed" | "residual" | "out_of_scope"
export type GoalFindingSeverity = "info" | "low" | "medium" | "high" | "critical"

export interface GoalFinding {
  id: string
  severity: GoalFindingSeverity
  status: GoalFindingStatus
  summary: string
  scope?: string
  evidence: string[]
  firstSeenAt: number
  updatedAt: number
}

function unique(items: readonly string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

export function mergeGoalFindings(
  existing: readonly GoalFinding[] = [],
  incoming: readonly GoalFinding[] = [],
  now = Date.now(),
): GoalFinding[] {
  const order: string[] = []
  const merged = new Map<string, GoalFinding>()
  for (const item of existing) {
    const id = item.id.trim().toUpperCase()
    if (!merged.has(id)) order.push(id)
    merged.set(id, { ...item, id, evidence: unique(item.evidence) })
  }
  for (const item of incoming) {
    const id = item.id.trim().toUpperCase()
    if (!id) continue
    const previous = merged.get(id)
    const incomingEvidence = unique(item.evidence)
    if (!previous) {
      order.push(id)
      merged.set(id, {
        ...item,
        id,
        status: item.status === "closed" && incomingEvidence.length === 0 ? "open" : item.status,
        evidence: incomingEvidence,
        firstSeenAt: item.firstSeenAt || now,
        updatedAt: now,
      })
      continue
    }
    const evidence = unique([...previous.evidence, ...incomingEvidence])
    let status = previous.status
    if (item.status === previous.status) status = previous.status
    else if (item.status === "closed" && incomingEvidence.length > 0) status = "closed"
    else if ((item.status === "residual" || item.status === "out_of_scope") && incomingEvidence.length > 0) status = item.status
    else if (item.status === "open" && incomingEvidence.length > 0) status = "open"
    const changed = status !== previous.status || evidence.length !== previous.evidence.length || item.summary !== previous.summary || item.scope !== previous.scope
    merged.set(id, changed ? {
      ...previous,
      severity: item.severity,
      status,
      summary: item.summary || previous.summary,
      scope: item.scope ?? previous.scope,
      evidence,
      updatedAt: now,
    } : previous)
  }
  return order.map((id) => merged.get(id)!)
}
