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

export type SessionState = {
  untrusted: UntrustedHit[]
  scores?: { tool: string; scores: Scores }
  route?: Route
}

/** Bounded so a hostile tool result cannot grow session state without limit. */
export const MAX_UNTRUSTED_HITS = 20

const states = new Map<string, SessionState>()

function state(sessionID: string): SessionState {
  const existing = states.get(sessionID)
  if (existing) return existing
  const created: SessionState = { untrusted: [] }
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

/** Drop a session's state when the session ends. */
export function clear(sessionID: string) {
  states.delete(sessionID)
}

/** Test hook: forget every session. */
export function reset() {
  states.clear()
}
