type GoalLike = { goal?: string; dod?: readonly string[] }

const UI_REQUIRED = /\b(?:ui|browser|chromium|journey|interface|parcours|e2e|end-to-end)\b/i

export function buildQaProofAdvisory(goal: GoalLike): string {
  const corpus = [goal.goal ?? "", ...(goal.dod ?? [])].join(" ")
  if (!UI_REQUIRED.test(corpus)) return ""
  return [
    "<qa_proof_advisory>",
    "Advisory path: UI → network → persistence → security → stop.",
    "- UI evidence: re-observable state in the real interface, including loading/empty/error where required.",
    "- Network evidence: relevant request count, method, endpoint and status; do not treat HTTP success alone as UI proof.",
    "- Persistence evidence: grouped DB/storage assertion bound to the same tenant and entities.",
    "- Security evidence: independent audit closes every sticky finding or reports it RESIDUAL/OUT-OF-SCOPE.",
    "Stop when all required evidence is present; on unexpected state, leave the path and investigate rather than forcing PASS.",
    "</qa_proof_advisory>",
  ].join("\n")
}

export function buildRiskAdvisory(goal: GoalLike, stickyFindings: readonly string[]): string {
  const requirements = (goal.dod ?? []).map((item) => `- mandatory requirement: ${item}`)
  const findings = stickyFindings.map((item) => `- sticky finding: ${item}`)
  if (requirements.length === 0 && findings.length === 0) return ""
  return [
    "<risk_advisory>",
    "This is advisory only: it cannot downgrade user requirements, security gates, failures or unverified evidence.",
    ...requirements,
    ...findings,
    "Reuse proof only when its git/file/environment freshness still matches; uncertainty invalidates rather than skips it.",
    "</risk_advisory>",
  ].join("\n")
}

export function collectStickyFindings(messages: readonly { parts: readonly unknown[] }[]): string[] {
  const result = new Set<string>()
  const pattern = /(?:\bSEC-[A-Z0-9_-]+\b.*\b(?:OPEN|RESIDUAL)\b|^\s*(?:RESIDUAL|UNVERIFIED)\b|\b(?:HIGH|CRITICAL)\b.*\b(?:OPEN|RESIDUAL)\b)/i
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part || typeof part !== "object" || !("text" in part) || typeof part.text !== "string") continue
      for (const raw of part.text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line && pattern.test(line)) result.add(line.slice(0, 500))
      }
    }
  }
  return [...result]
}
