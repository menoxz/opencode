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

/**
 * Decision pruning.
 *
 * A compaction summary loses the arguments and results of individual tool
 * calls. Some of them are load-bearing and some are noise; a model call can
 * tell them apart, and the decision is cheaper and more reliable than asking
 * for a rewrite of every call. A pair is one tool call joined to its result;
 * pairs from the same assistant turn form a parallel batch and are asked about
 * in a single Jev request (the questions map is the batch). Pruning is
 * deterministic — it only removes what Jev refuted — and anything kept is
 * carried through verbatim, never paraphrased.
 */

export type ToolPair = {
  /** Assistant turn the call belongs to; calls sharing it ran in parallel. */
  batch: string
  callId: string
  tool: string
  /** Verbatim call rendering (tool name and arguments). */
  call: string
  /** Verbatim result rendering, absent when the call never completed. */
  result?: string
}

export type ToolEvent = {
  callId: string
  tool: string
  call: string
  result?: string
  batch?: string
}

/** Join calls and results into pairs, preserving order. */
export function pairTurns(events: readonly ToolEvent[]): ToolPair[] {
  return events.map((event, index) => ({
    batch: event.batch ?? `b${index + 1}`,
    callId: event.callId,
    tool: event.tool,
    call: event.call,
    result: event.result,
  }))
}

/** Pair ids whose question was answered yes are kept; both axes are asked at once. */
export function keepQuestions(pairs: readonly ToolPair[]): Record<string, JevSchema.Question> {
  return Object.fromEntries(
    pairs.flatMap((pair) => [
      [
        `call:${pair.callId}`,
        {
          type: "noul" as const,
          instructions: `Below is a tool call from a coding session that is about to be compacted. Are its arguments load-bearing — would losing them misdirect later work? (An argument that names a path, a target, a flag or a value the next step needs is load-bearing.)\n\nCALL: ${pair.call}`,
          criteria: {
            true: "The arguments must survive compaction to avoid misdirecting later work",
            false: "The arguments are incidental and may be dropped",
          },
        },
      ],
      [
        `result:${pair.callId}`,
        {
          type: "noul" as const,
          instructions: `Below is the result of a tool call from a coding session that is about to be compacted. Is the result load-bearing — would losing it misdirect later work? (A result carrying an outcome, an error, a path or a value the next step needs is load-bearing.)\n\nCALL: ${pair.call}\nRESULT: ${(pair.result ?? "(no result)").slice(0, 2_000)}`,
          criteria: {
            true: "The result must survive compaction to avoid misdirecting later work",
            false: "The result is incidental and may be dropped",
          },
        },
      ],
    ]),
  )
}

/**
 * Drop what Jev refuted, keep the rest byte-for-byte. When Jev answered none of
 * the questions the input is returned unchanged, so a failed call falls back to
 * the default compaction instead of silently emptying the transcript.
 */
export function prune(pairs: readonly ToolPair[], answers: Record<string, JevSchema.Answer>, threshold = DEFAULT_THRESHOLD): ToolPair[] {
  const keep = (id: string) => {
    const answer = answers[id]
    return answer?.type === "noul" ? answer.noul >= threshold : undefined
  }
  const answered = pairs.some((pair) => keep(`call:${pair.callId}`) !== undefined || keep(`result:${pair.callId}`) !== undefined)
  if (!answered) return [...pairs]
  return pairs.flatMap((pair) => {
    const call = keep(`call:${pair.callId}`) !== false
    const result = keep(`result:${pair.callId}`) !== false
    if (!call && !result) return []
    return [{ ...pair, call: call ? pair.call : "", result: result ? pair.result : undefined }]
  })
}

export * as JevCompaction from "./compaction"
