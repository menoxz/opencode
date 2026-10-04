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

/** A proof has to point at something someone else could re-observe. Approval
 *  words are not proof, and this is exactly the failure mode the gate exists to
 *  catch: the model asserting success in the language of success. */
export const VAGUE_PROOF =
  /^(ok|okay|done|fait|termin[ée]s?|c'?est bon|[çc]a marche|works?|working|fine|good|yes|oui|valid[ée]?|success|r[ée]ussi|conforme|v[ée]rifi[ée]s?|test[ée]s?|no issues?|aucun probl[èe]me)[\s.!]*$/i

/** Local copy of the only re-observable proof predicate of the contract, whose
 *  single branching point is the DoD evidence gate. Until the predicate moves
 *  here, `finding.evidence` — unconstrained by its schema — is never examined,
 *  so `residual` and `out_of_scope` only had to clear a non-empty string. This
 *  copy is what closes it; the contract still owns its own copy. */
export function proofIsSubstantive(proof: string): boolean {
  const value = proof.trim()
  if (value.length < 12) return false
  if (VAGUE_PROOF.test(value)) return false
  // Something re-observable: a command, a path, a number, a status, a URL, a hash.
  return /[\d]|[\\/]|https?:|exit|passed|failed|\bcode\b|\bscore\b|\btest/i.test(value)
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
        status: item.status !== "open" && !incomingEvidence.some(proofIsSubstantive) ? "open" : item.status,
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
    else if (
      (item.status === "residual" || item.status === "out_of_scope") &&
      incomingEvidence.some(proofIsSubstantive)
    )
      status = item.status
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
