import { JevSchema } from "./schema"

/** Jev answers at most this many questions in one compaction pass. */
export const MAX_QUESTIONS = 12
/** Characters of digest and of summary handed to Jev as `state`. */
export const MAX_STATE_CHARS = 8_000
/** Probability at or above which a `noul` answer counts as yes. */
export const DEFAULT_THRESHOLD = 0.5

export type Candidate = {
  id: string
  text: string
}

/**
 * Deterministic anchor extraction, so candidate generation costs no model call.
 * These are exactly the item kinds the anchored summary template promises to
 * preserve: file paths, commands, error strings, and identifiers.
 */
const ANCHORS: readonly RegExp[] = [
  /[A-Za-z]:\\[^\s"'`<>|]+/g,
  /(?:[\w.-]+\/)+[\w.-]+\.\w{1,6}/g,
  /\b(?:ses|msg|prt|call)_[A-Za-z0-9]{8,}\b/g,
  /^(?=[^\n]*(?:exit(?:ed)?\s*(?:code)?\s*[:=]?\s*\d+|échec|Échec|failed|error:|Error:))[^\n]+/gm,
  /^[^\n]*`[^`\n]+`[^\n]*$/gm,
]

const MAX_CANDIDATE_CHARS = 200

function trimCandidate(value: string) {
  return value
    .replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "")
    .trim()
    .slice(0, MAX_CANDIDATE_CHARS)
}

export function candidatesFromText(text: string, max = MAX_QUESTIONS): Candidate[] {
  const seen = new Set<string>()
  const found: Candidate[] = []
  for (const pattern of ANCHORS) {
    for (const match of text.matchAll(pattern)) {
      const value = trimCandidate(match[0])
      const key = value.toLowerCase()
      if (!value || seen.has(key)) continue
      seen.add(key)
      found.push({ id: `c${found.length + 1}`, text: value })
      if (found.length >= max) return found
    }
  }
  return found
}

export function clampState(parts: readonly string[], max = MAX_STATE_CHARS) {
  return parts.join("\n\n").slice(0, max)
}

function noulOf(answer: JevSchema.Answer | undefined) {
  return answer?.type === "noul" ? answer.noul : undefined
}

/** Jev said yes: keep the item. An absent answer never counts as yes. */
export function affirmed(answer: JevSchema.Answer | undefined, threshold = DEFAULT_THRESHOLD) {
  const probability = noulOf(answer)
  return probability !== undefined && probability >= threshold
}

/** Jev said no: the item is missing. An absent answer is unknown, not missing. */
export function refuted(answer: JevSchema.Answer | undefined, threshold = DEFAULT_THRESHOLD) {
  const probability = noulOf(answer)
  return probability !== undefined && probability < threshold
}

/** Pre-summary pass: which anchors are load-bearing and must survive. */
export function checklistQuestions(candidates: readonly Candidate[]): Record<string, JevSchema.Question> {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.id,
      {
        type: "noul" as const,
        instructions: `Below is conversation history from a coding session. Is this item load-bearing — would losing it from the summary break or misdirect later work?\n\nITEM: ${candidate.text}`,
        criteria: {
          true: "Dropping the item would break or misdirect later work",
          false: "The item is incidental and may be dropped",
        },
      },
    ]),
  )
}

/** Post-summary pass: which anchors the produced summary failed to keep. */
export function auditQuestions(candidates: readonly Candidate[]): Record<string, JevSchema.Question> {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.id,
      {
        type: "noul" as const,
        instructions: `The SUMMARY below must preserve this item. Is the item present, exact and still true in the summary?\n\nITEM: ${candidate.text}`,
        criteria: {
          true: "Present in the summary and still true",
          false: "Missing from the summary, altered, or no longer true",
        },
      },
    ]),
  )
}

export function renderChecklist(input: {
  candidates: readonly Candidate[]
  answers: Record<string, JevSchema.Answer>
  threshold?: number
}) {
  const kept = input.candidates.filter((candidate) => affirmed(input.answers[candidate.id], input.threshold))
  if (kept.length === 0) return undefined
  return [
    "Jev read the history above and judged every item below load-bearing. Each one MUST appear in the summary, verbatim where it is an identifier, path, command or error string:",
    ...kept.map((candidate) => `- ${candidate.text}`),
  ].join("\n")
}

export function missingFromSummary(input: {
  candidates: readonly Candidate[]
  answers: Record<string, JevSchema.Answer>
  threshold?: number
}) {
  return input.candidates.filter((candidate) => refuted(input.answers[candidate.id], input.threshold))
}

export function repairPrompt(missing: readonly Candidate[]) {
  return [
    "Jev checked the summary you just wrote against the history and reports these load-bearing items are missing, altered or no longer true:",
    ...missing.map((candidate) => `- ${candidate.text}`),
    "Rewrite the summary so every item above is present and exact, keeping the same section structure and every section. Output the summary only.",
  ].join("\n")
}

export * as JevCompaction from "./compaction"
