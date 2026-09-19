/**
 * Per-session JEV memory shared by the pre-tool guard and the post-tool review.
 *
 * A tool result is the untrusted boundary of the loop: an instruction found in
 * one must reach the guard that screens the *next* call, and the scores of one
 * call must inform the next. JEV itself is stateless, so the small amount of
 * cross-call state lives here. In-process and non-persistent by design — a new
 * session starts clean and nothing leaks between workspaces.
 */

export type UntrustedHit = {
  /** Tool whose result carried the suspicious content. */
  tool: string
  /** Stable marker id (see `untrusted.ts`), or `jev-injection` when Jev confirmed it. */
  marker: string
  /** Short verbatim excerpt so the guard can quote the provenance it saw. */
  excerpt: string
}

export type Scores = {
  correctness: number
  complexity: number
  security: number
}

export type Route = {
  model: "lite" | "build"
  complexity: number
  /** Guard threshold this turn should use; harder tasks ask sooner. */
  threshold: number
}

export type Plan = {
  /** Hash of the request the plan was drawn for; another request needs another plan. */
  fingerprint: string
  /** Request shape Jev picked: answer, retrieve, change or deliver. */
  shape: string
  /** Phases the request needs, in the order they run. Empty means none is required. */
  steps: readonly string[]
}

export type SessionState = {
  untrusted: UntrustedHit[]
  /** Incremented on every fresh marker; cached guard verdicts stop applying across it. */
  untrustedVersion: number
  /** Guard verdicts already computed, keyed by tool + args + threshold + untrusted version. */
  verdicts: Map<string, unknown>
  scores?: { tool: string; scores: Scores }
  route?: Route
  plan?: Plan
}

/** Bounded so a hostile tool result cannot grow session state without limit. */
export const MAX_UNTRUSTED_HITS = 20

/** Bounded so a long session cannot cache an unbounded number of verdicts. */
export const MAX_CACHED_VERDICTS = 64

const states = new Map<string, SessionState>()

function state(sessionID: string): SessionState {
  const existing = states.get(sessionID)
  if (existing) return existing
  const created: SessionState = { untrusted: [], untrustedVersion: 0, verdicts: new Map() }
  states.set(sessionID, created)
  return created
}

export function untrusted(sessionID: string): readonly UntrustedHit[] {
  return state(sessionID).untrusted
}

export function markUntrusted(sessionID: string, hits: readonly UntrustedHit[]) {
  if (hits.length === 0) return
  const current = state(sessionID)
  const known = new Set(current.untrusted.map((hit) => `${hit.tool}\u0000${hit.marker}`))
  const fresh = hits.filter((hit) => !known.has(`${hit.tool}\u0000${hit.marker}`))
  if (fresh.length === 0) return
  current.untrusted = [...current.untrusted, ...fresh].slice(-MAX_UNTRUSTED_HITS)
  current.untrustedVersion += 1
  current.verdicts.clear()
}

export function recordScores(sessionID: string, tool: string, scores: Scores) {
  state(sessionID).scores = { tool, scores }
}

export function lastScores(sessionID: string): { tool: string; scores: Scores } | undefined {
  return state(sessionID).scores
}

export function setRoute(sessionID: string, route: Route) {
  state(sessionID).route = route
}

export function currentRoute(sessionID: string): Route | undefined {
  return state(sessionID).route
}

export function untrustedVersion(sessionID: string): number {
  return state(sessionID).untrustedVersion
}

/**
 * A guard verdict already computed for this exact call. Replaying it costs no
 * round-trip and changes nothing: the key carries the args, the threshold and
 * the untrusted version, and a fresh marker clears the cache outright.
 */
export function cachedVerdict<T>(sessionID: string, key: string): T | undefined {
  return state(sessionID).verdicts.get(key) as T | undefined
}

export function cacheVerdict(sessionID: string, key: string, verdict: unknown) {
  const current = state(sessionID)
  if (current.verdicts.size >= MAX_CACHED_VERDICTS) current.verdicts.clear()
  current.verdicts.set(key, verdict)
}

export function setPlan(sessionID: string, plan: Plan) {
  state(sessionID).plan = plan
}

export function currentPlan(sessionID: string): Plan | undefined {
  return state(sessionID).plan
}

/** Stable short hash of a value, so a decision can be keyed on the bytes it was taken on. */
export function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/** Drop a session's state when the session ends. */
export function clear(sessionID: string) {
  states.delete(sessionID)
}

/** Test hook: forget every session. */
export function reset() {
  states.clear()
}
