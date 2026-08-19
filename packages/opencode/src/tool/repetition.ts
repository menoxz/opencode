/**
 * Cycle brake for tool calls.
 *
 * Measured problem (see AUDIT-opencodev2.md, D1): a single session spent 98
 * turns and $44.52 issuing 129 `edit` calls against the same file, 127 of them
 * failing with the identical error, interleaved with 111 byte-identical `read`
 * calls. Zero files were modified. Nothing in the harness ever cut the loop —
 * every iteration was a real model round-trip.
 *
 * This module is the frein: it refuses to run a tool call that has already been
 * proven unproductive, and returns a blocking error that names the repetition
 * and forces a change of strategy.
 *
 * Two rules, both deliberately narrow so that legitimate repetition (re-running
 * a test suite after a fix, re-listing a directory that changed) is never
 * blocked:
 *
 *  1. FAILURE rule — the same (tool, arguments) pair has already failed
 *     `FAILURE_LIMIT - 1` times in the window. A third attempt with byte-identical
 *     arguments cannot succeed where two identical attempts failed.
 *
 *  2. IDLE-OUTPUT rule — the same (tool, arguments) pair has already returned
 *     byte-identical output `REPEAT_LIMIT - 1` times in a row. Calling it again
 *     is guaranteed to spend a round-trip to learn nothing.
 *
 * Crucially, a repeated call whose output *changes* is progress and is never
 * blocked: `bash: bun test` may run as often as it likes as long as the result
 * moves.
 *
 * State is a module-level, session-keyed ledger rather than an Effect service on
 * purpose: the guard must be unconditionally active on every tool call path with
 * no layer wiring to forget. A guard that silently no-ops because a layer was
 * missing is exactly the "decoration" this audit criticises.
 */

/** Number of recent distinct call signatures retained per session. */
export const WINDOW = 24

/** Identical calls returning identical output tolerated before blocking. */
export const REPEAT_LIMIT = 3

/** Identical calls failing before blocking. */
export const FAILURE_LIMIT = 3

/** Sessions retained before the oldest ledger is evicted. */
export const MAX_SESSIONS = 64

export type Outcome = {
  ok: boolean
  /** Digest of the tool output, used to detect a call that learned nothing. */
  digest: string
}

export type Verdict =
  | { blocked: false }
  | { blocked: true; reason: "failure" | "idle-output"; tool: string; count: number; detail: string }

type Entry = {
  tool: string
  args: string
  failures: number
  /** Consecutive identical-output successes. */
  idle: number
  digest: string | undefined
}

type Ledger = Map<string, Entry>

const sessions = new Map<string, Ledger>()

/** Deterministic serialisation: key order must not change the signature. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
}

/** Signature of one tool call: the tool identity plus its exact arguments. */
export function signature(tool: string, args: unknown): string {
  return `${tool}\u0000${stableStringify(args)}`
}

/** Cheap, allocation-light digest of tool output. */
export function digest(output: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < output.length; i++) {
    const c = output.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13)
  }
  return `${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${output.length}`
}

function ledger(sessionID: string): Ledger {
  const hit = sessions.get(sessionID)
  if (hit) return hit
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next()
    if (!oldest.done) sessions.delete(oldest.value)
  }
  const next: Ledger = new Map()
  sessions.set(sessionID, next)
  return next
}

function preview(args: string): string {
  const flat = args.replaceAll("\u0000", " ")
  return flat.length > 240 ? `${flat.slice(0, 240)}…` : flat
}

/**
 * Decide whether this call may run. Pure with respect to the ledger — call
 * `record` afterwards with the outcome.
 */
export function inspect(sessionID: string, tool: string, args: unknown): Verdict {
  const entry = ledger(sessionID).get(signature(tool, args))
  if (!entry) return { blocked: false }

  if (entry.failures >= FAILURE_LIMIT - 1)
    return {
      blocked: true,
      reason: "failure",
      tool,
      count: entry.failures,
      detail: preview(entry.args),
    }

  if (entry.idle >= REPEAT_LIMIT - 1)
    return {
      blocked: true,
      reason: "idle-output",
      tool,
      count: entry.idle + 1,
      detail: preview(entry.args),
    }

  return { blocked: false }
}

/** Record the outcome of a call that was allowed to run. */
export function record(sessionID: string, tool: string, args: unknown, outcome: Outcome): void {
  const book = ledger(sessionID)
  const key = signature(tool, args)
  const existing = book.get(key)

  // Refresh recency: re-inserting moves the key to the end of the Map order.
  if (existing) book.delete(key)

  const entry: Entry = existing ?? {
    tool,
    args: stableStringify(args),
    failures: 0,
    idle: 0,
    digest: undefined,
  }

  if (!outcome.ok) {
    entry.failures += 1
    entry.idle = 0
  } else {
    entry.failures = 0
    entry.idle = entry.digest === outcome.digest ? entry.idle + 1 : 0
    entry.digest = outcome.digest
  }

  book.set(key, entry)

  while (book.size > WINDOW) {
    const oldest = book.keys().next()
    if (oldest.done) break
    book.delete(oldest.value)
  }
}

/** Model-facing prose explaining the block and what to do instead. */
export function explain(verdict: Extract<Verdict, { blocked: true }>): string {
  const shared = [
    `Repeated call blocked: \`${verdict.tool}\` has already been called with these exact arguments in this session.`,
    ``,
    `Arguments: ${verdict.detail}`,
    ``,
  ]

  if (verdict.reason === "failure")
    return [
      ...shared,
      `The previous ${verdict.count} identical attempts all failed. A further attempt with byte-identical arguments will fail the same way.`,
      ``,
      `Change strategy now. Do not retry this call as-is. Re-read the current state of the target if your assumption about it may be stale, widen or narrow the arguments, or take a different route to the goal.`,
    ].join("\n")

  return [
    ...shared,
    `The previous ${verdict.count} identical calls returned byte-identical output, so this call would tell you nothing new.`,
    ``,
    `The information you are asking for is already in this conversation. Use it, or change the arguments to ask a genuinely different question.`,
  ].join("\n")
}

/** Test/maintenance hook: drop a session's ledger (or all of them). */
export function reset(sessionID?: string): void {
  if (sessionID === undefined) sessions.clear()
  else sessions.delete(sessionID)
}

export * as ToolRepetition from "./repetition"
