export const SUBAGENT_RESULT_CONTRACT = `

Return a causal report with these headings:
- outcome: completed | partial | blocked
- decisions: what changed and why
- evidence: re-observable commands/tests/artifacts
- changes: exact files or none
- findings: stable ids with OPEN | CLOSED | RESIDUAL | OUT-OF-SCOPE
- residuals/unverified: never omit them
- next: only the dependency the parent still needs
Keep prose useful and proportional. A later narrower PASS never erases an earlier finding; mark it CLOSED with independent evidence or keep it RESIDUAL.`

export const LEAN_SUBAGENT_CONTRACT = `
<lean_child>
Correctness, safety, explicit acceptance criteria, and OPEN findings are hard gates.
CONTEXT: batch only known-independent observations. One inspect_batch wave has at most 16 actions, 2,000 characters per result by default, and 16,000 total; use another wave only when prior evidence changes its inputs. Read exact ranges, not whole files.
TERMINAL: never return full terminal output to context. Capture the full log to an artifact, then return exit code + decision-relevant matches + bounded error tail.
MUTATE: once inputs are known, emit one coherent initial patch. A later patch must cite new failed evidence that changed the decision; same-file/dependent writes stay serialized.
VERIFY: batch independent narrow checks. Reuse child evidence while its workspace fingerprint matches; after writes, rerun only checks invalidated by changed files.
Do not make final report/final response wording an evidence-gated DoD item.
Return causal sections: outcome; decisions; evidence as claim -> exact command/test/file:line/result; changes or none; findings with stable status; residuals/unverified; next dependency only.
Keep findings OPEN until independently CLOSED; never hide residuals.
</lean_child>
`

export function subagentResultPolicy(parentAgent: string, boundedExperiment: boolean) {
  if (parentAgent === "lean") return { contract: LEAN_SUBAGENT_CONTRACT }
  if (boundedExperiment) return { contract: SUBAGENT_RESULT_CONTRACT }
  return { contract: "" }
}
