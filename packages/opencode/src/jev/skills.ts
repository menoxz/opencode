import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"
import { decide as decideBounded, makeCircuit, DEFAULT_HOOK_TIMEOUT_MS, type Circuit } from "./decide"

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

/**
 * Bound on the whole selection, in milliseconds.
 *
 * `JevSkills.select` sits on the critical path of every step: the system prompt
 * cannot be assembled until it answers, so an endpoint that accepts the
 * connection and never replies must not be allowed to hold the turn. Measured on
 * a live install: a skill selection whose endpoint answered HTTP 400 after
 * ~126 ms through a bare transport left the step parked for 285 s through the
 * ambient one, with the process pegged at one core and no log line — the session
 * looked frozen and the interrupt key reached nothing.
 *
 * `JevGuard` and `JevRelevance` already ran under a bound (see `./decide`); the
 * two selectors were the ones that did not. The value is the shared hook bound
 * from `./decide`, sized for the slowest transport (the decision model).
 */
export const DEFAULT_TIMEOUT_MS = DEFAULT_HOOK_TIMEOUT_MS

/** Consecutive failures shared by every skill selection in the process. */
const circuit: Circuit = makeCircuit()

/**
 * How many request-sized batches travel at once.
 *
 * The batches are independent questions and the endpoint is stateless, so a
 * ~200-skill catalogue does not have to be ten sequential round-trips. Serialised,
 * a healthy Codiv endpoint needed ~8 s for 194 candidates — more than the bound,
 * which would have silently disabled the selector it was meant to protect.
 * Measured after: the same catalogue answers inside the bound. `10` lets the
 * whole catalogue of a real install travel in one wave, which is also what keeps
 * a chat-model transport (one request per batch) inside its budget.
 */
export const MAX_CONCURRENT_CALLS = 10

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
 * The round-trip. One request per request-sized batch, all candidates, shared
 * prompt. Any failure keeps its typed error so the caller's `catch` turns it
 * into the fallback; this function never invents a verdict.
 *
 * The whole selection runs under `./decide`, so it owns a timeout and a circuit
 * breaker: a hung, unreachable or failing endpoint costs one bounded wait and
 * then a period of no waits at all, and never the step.
 */
export const select = Effect.fn("JevSkills.select")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: {
    prompt: string
    skills: readonly Candidate[]
    threshold?: number
    /** Overrides {@link DEFAULT_TIMEOUT_MS}; tests use a short bound. */
    timeoutMs?: number
    /** Overrides the process-wide breaker; tests use a fresh one. */
    circuit?: Circuit
  },
) {
  const { questions: asked, ids } = questions(input.prompt, input.skills)
  // A call carries at most MAX_QUESTIONS_PER_CALL questions, so a large
  // catalogue is split into batches and the verdicts are merged. The batches are
  // independent and travel concurrently; a batch that fails aborts the whole
  // selection (the caller falls back) and a partial verdict is never invented.
  const outcome = yield* decideBounded<string[] | undefined>({
    label: "skills",
    enabled: true,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    circuit: input.circuit ?? circuit,
    run: Effect.forEach(
      JevClient.chunks(ids),
      (batch) =>
        Effect.gen(function* () {
          const response = yield* JevClient.decide(
            http,
            {
              state: "Select the skills this request needs.",
              questions: Object.fromEntries(batch.map((id) => [id, asked[id]!])),
            },
            settings,
          )
          return decide(response, batch, input.threshold)
        }),
      { concurrency: MAX_CONCURRENT_CALLS },
    ).pipe(
      Effect.map((batches) => {
        const chosen = new Set<string>()
        let answered = false
        for (const decided of batches) {
          if (decided === undefined) continue
          answered = true
          for (const id of decided) chosen.add(id)
        }
        return answered ? [...chosen] : undefined
      }),
    ),
    fallback: () => undefined,
  })
  return outcome.value
})

export * as JevSkills from "./skills"
