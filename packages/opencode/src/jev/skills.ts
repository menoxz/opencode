import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"

/**
 * Jev skill selector — decides which skills earn a place in the injected catalogue.
 *
 * The deterministic filter this replaces ranked skills by BM25 against the last
 * user message and kept the top 30 unconditionally. Two properties made the
 * result unreliable: BM25 is lexical, so a skill is only reachable when its
 * wording happens to match the request, and the budget was filled to 30 even by
 * skills with no lexical overlap at all, so the catalogue could be mostly noise.
 * Jev reads one closed question per candidate — "does completing this request
 * correctly require this skill?" — a judgement about meaning rather than bytes,
 * answered independently per candidate, so the count is whatever the request
 * justifies: zero, five, or forty. There is deliberately no fixed cap.
 *
 * Fail-open by construction. Every path that cannot reach a verdict — Jev off,
 * no key, an error, a timeout, an unreadable answer — returns `undefined`, and
 * the caller keeps its deterministic ranking. A disabled or keyless install is
 * therefore byte-for-byte unchanged.
 */

/** Probability at or above which a skill is judged relevant enough to inject. */
export const DEFAULT_THRESHOLD = 0.5

/** Characters of a skill's own text quoted per question, so the call stays cheap. */
export const MAX_SKILL_CHARS = 400

/** Characters of the user request quoted once, shared by every question. */
export const MAX_PROMPT_CHARS = 2_000

export type Candidate = {
  readonly name: string
  readonly description?: string
  /** Body excerpt used only to enrich the quoted text; a candidate may omit it. */
  readonly text?: string
}

/**
 * Whether the Jev selector may replace the deterministic ranking at all. Pure
 * and exposed so the guarantee "Jev decides only when explicitly enabled, with
 * candidates to decide between" is testable and cannot silently change by
 * configuration.
 */
export function skillsApplies(section: { enabled?: boolean } | undefined, count: number): boolean {
  return section?.enabled === true && count > 0
}

function quoted(candidate: Candidate): string {
  const text = candidate.description?.trim() || candidate.text?.trim() || "(no description)"
  return text.length > MAX_SKILL_CHARS ? `${text.slice(0, MAX_SKILL_CHARS - 1)}…` : text
}

/**
 * One `noul` question per candidate, keyed by skill name so an answer maps back
 * without a lookup table. `ids` preserves the candidate order for the caller.
 */
export function questions(
  prompt: string,
  skills: readonly Candidate[],
): { questions: Record<string, JevSchema.Question>; ids: string[] } {
  const excerpt = prompt.slice(0, MAX_PROMPT_CHARS)
  const ids = skills.map((skill) => skill.name)
  const questions = Object.fromEntries(
    skills.map((skill) => [
      skill.name,
      {
        type: "noul" as const,
        instructions: `A coding agent is about to answer the user request below. A skill is a set of specialised instructions the agent can load on demand. Does completing THIS request correctly, or doing it well, plausibly require loading the skill described here — would an expert consult it for this task? Answer strictly about this request, not about the skill's general usefulness.\n\nUSER REQUEST:\n${excerpt}\n\nSKILL "${skill.name}":\n${quoted(skill)}`,
        criteria: {
          true: "An expert would plausibly load this skill to do this request well",
          false: "This skill is not needed for this request",
        },
      },
    ]),
  )
  return { questions, ids }
}

/**
 * Apply the threshold to the answers. Returns `undefined` when Jev answered none
 * of the candidates — an abstention, not an empty selection — so the caller can
 * tell "Jev chose nothing" (a valid, total rejection) from "Jev chose nothing
 * it could answer" (fall back to the deterministic ranking).
 */
export function decide(
  response: JevSchema.Response,
  ids: readonly string[],
  threshold = DEFAULT_THRESHOLD,
): string[] | undefined {
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
 * The round-trip. One request, all candidates, shared prompt. Any failure keeps
 * its typed error so the caller's `catch` turns it into the fallback; this
 * function never invents a verdict.
 */
export const select = Effect.fn("JevSkills.select")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: { prompt: string; skills: readonly Candidate[]; threshold?: number },
) {
  const { questions: asked, ids } = questions(input.prompt, input.skills)
  const response = yield* JevClient.decide(
    http,
    { state: "Select the skills this request needs.", questions: asked },
    settings,
  )
  return decide(response, ids, input.threshold)
})

export * as JevSkills from "./skills"
