import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"

/**
 * Jev tool selector — decides which candidates `tool_search` actually surfaces.
 *
 * The tool counterpart of {@link JevSkills}. `tool_search` first retrieves a
 * wide lexical candidate pool (BM25 over id + description via
 * `ToolCatalog.rankMatches`); this module then asks Jev one closed question per
 * candidate — "does completing this request require this tool?" — and keeps only
 * the tools it affirms, so a semantically weak match cannot ride a shared word
 * into the model's catalog. As with skills there is deliberately no fixed cap:
 * the request decides how many tools are worth surfacing.
 *
 * The questions travel through the same `JevClient.decide` call and the same
 * configured provider as every other Jev hook (`jev.base_url`/`model` — the
 * `codiv` preset today, the Command Code GOAT provider long term, or whatever
 * `provider` selects), so there is no second code path to keep coherent.
 *
 * Fail-open by construction: Jev off, no key, an error, a timeout or an
 * unreadable answer yields `undefined`, and the caller keeps the lexical
 * ranking unchanged. A disabled or keyless install is byte-for-byte identical.
 */

/** Probability at or above which a candidate tool is deemed worth surfacing. */
export const DEFAULT_THRESHOLD = 0.5

/** Characters of a tool's description quoted per question, to keep the call cheap. */
export const MAX_TOOL_CHARS = 400

/** Characters of the user query quoted once, shared by every question. */
export const MAX_QUERY_CHARS = 2_000

export type Candidate = {
  readonly id: string
  readonly description: string
}

/**
 * Whether the Jev selector may replace the lexical ranking at all. Pure and
 * exposed so "Jev decides only when explicitly enabled, with candidates to
 * decide between" is testable and cannot silently drift with configuration.
 */
export function toolsApplies(section: { enabled?: boolean } | undefined, count: number): boolean {
  return section?.enabled === true && count > 0
}

function quoted(candidate: Candidate): string {
  const text = candidate.description.trim() || candidate.id
  return text.length > MAX_TOOL_CHARS ? `${text.slice(0, MAX_TOOL_CHARS - 1)}…` : text
}

/** One `noul` per candidate, keyed by tool id so an answer maps back by identity. */
export function questions(
  query: string,
  tools: readonly Candidate[],
): { questions: Record<string, JevSchema.Question>; ids: string[] } {
  const excerpt = query.slice(0, MAX_QUERY_CHARS)
  const ids = tools.map((tool) => tool.id)
  const questions = Object.fromEntries(
    tools.map((tool) => [
      tool.id,
      {
        type: "noul" as const,
        instructions: `A coding agent is answering the user request below. It can reach an extra tool on demand. Does completing THIS request correctly require this tool — would the agent need it to do the job? Answer strictly about this request, not about the tool's general usefulness.\n\nUSER REQUEST:\n${excerpt}\n\nTOOL "${tool.id}":\n${quoted(tool)}`,
        criteria: {
          true: "The agent needs this tool to do this request well",
          false: "This tool is not needed for this request",
        },
      },
    ]),
  )
  return { questions, ids }
}

/**
 * Apply the threshold. `undefined` means Jev answered none of the candidates —
 * an abstention, so the caller falls back — whereas an empty array is a valid
 * "Jev rejected every candidate" and is honoured as such.
 */
export function decide(response: JevSchema.Response, ids: readonly string[], threshold = DEFAULT_THRESHOLD): string[] | undefined {
  const selected: string[] = []
  let answered = false
  for (const id of ids) {
    const answer = response.answers[id]
    if (answer?.type !== "noul") continue
    answered = true
    if (answer.noul >= threshold) selected.push(id)
  }
  return answered ? selected : undefined
}

/**
 * One round-trip shared by every candidate. The caller owns the `catch` that
 * turns a failure into the lexical fallback; this function never invents a
 * verdict.
 */
export const select = Effect.fn("JevTools.select")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: { query: string; tools: readonly Candidate[]; threshold?: number },
) {
  const { questions: asked, ids } = questions(input.query, input.tools)
  const response = yield* JevClient.decide(
    http,
    { state: "Select the tools this request needs.", questions: asked },
    settings,
  )
  return decide(response, ids, input.threshold)
})

export * as JevTools from "./tools"
