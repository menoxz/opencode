export const SUBAGENT_RESULT_CONTRACT = `

Return a bounded causal report with these headings:
- outcome: completed | partial | blocked
- decisions: what changed and why
- evidence: re-observable commands/tests/artifacts
- changes: exact files or none
- findings: stable ids with OPEN | CLOSED | RESIDUAL | OUT-OF-SCOPE
- residuals/unverified: never omit them
- next: only the dependency the parent still needs
Keep prose concise. A later narrower PASS never erases an earlier finding; mark it CLOSED with independent evidence or keep it RESIDUAL.`

const STICKY = /(?:\bSEC-[A-Z0-9_-]+\b.*\b(?:OPEN|CLOSED|RESIDUAL|OUT-OF-SCOPE)\b|^\s*(?:RESIDUAL|UNVERIFIED|OUT-OF-SCOPE)\b|\b(?:HIGH|CRITICAL)\b.*\b(?:OPEN|RESIDUAL)\b)/i

export function extractStickyFindingLines(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || !STICKY.test(line) || seen.has(line)) continue
    seen.add(line)
    result.push(line.slice(0, 500))
  }
  return result
}

export function boundSubagentResult(text: string, maxChars = 12_000) {
  const sticky = extractStickyFindingLines(text)
  if (text.length <= maxChars) return { text, truncated: false, sticky }

  const marker = "\n... [bounded subagent result; full transcript remains in child session] ...\n"
  const stickyBudget = Math.min(Math.floor(maxChars / 3), 3_000)
  const stickyText = sticky.length ? `\n<sticky_findings>\n${sticky.join("\n").slice(0, stickyBudget)}\n</sticky_findings>\n` : ""
  const remaining = Math.max(200, maxChars - marker.length - stickyText.length)
  const headSize = Math.floor(remaining * 0.4)
  const tailSize = remaining - headSize
  const bounded = text.slice(0, headSize) + marker + stickyText + text.slice(-tailSize)
  return { text: bounded.slice(0, maxChars), truncated: true, sticky }
}

export const LEAN_SUBAGENT_CONTRACT = `
<lean_child>
Correctness, safety, explicit acceptance criteria, and OPEN findings are hard gates.
CONTEXT: batch only known-independent observations. One inspect_batch wave has at most 8 actions, 2,000 characters per result by default, and 16,000 total; use another wave only when prior evidence changes its inputs. Read exact ranges, not whole files.
TERMINAL: never return full terminal output to context. Capture the full log to an artifact, then return exit code + decision-relevant matches + bounded error tail.
MUTATE: once inputs are known, emit one coherent initial patch. A later patch must cite new failed evidence that changed the decision; same-file/dependent writes stay serialized.
VERIFY: batch independent narrow checks. Reuse child evidence while its workspace fingerprint matches; after writes, rerun only checks invalidated by changed files.
Do not make final report/final response wording an evidence-gated DoD item.
Return concise causal sections: outcome; decisions; evidence as claim -> exact command/test/file:line/result; changes or none; findings with stable status; residuals/unverified; next dependency only.
Keep findings OPEN until independently CLOSED; never hide residuals.
</lean_child>
`

export function subagentResultPolicy(parentAgent: string, boundedExperiment: boolean) {
  if (parentAgent === "lean") return { contract: LEAN_SUBAGENT_CONTRACT, maxChars: 4_000 }
  if (boundedExperiment) return { contract: SUBAGENT_RESULT_CONTRACT, maxChars: 12_000 }
  return { contract: "", maxChars: undefined }
}
