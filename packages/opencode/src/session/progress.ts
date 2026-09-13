// Progress controller for computer-use style tasks (Lot 2).
//
// The environment ledger (Lot 1) says what the tools currently see. This module
// turns that into adaptation: it lets an expectation be declared before an
// action, classifies the outcome after it, warns before a dangerous repeat,
// bounds recovery, and reports stagnation. Deterministic bookkeeping stays in
// the harness; planning stays with the model.

export type ProgressVerdict = "expected" | "progress" | "different" | "no-progress" | "failed" | "unknown"

export interface ProgressAction {
  readonly name: string
  readonly args: unknown
}

export interface ProgressOutcome extends ProgressAction {
  readonly scope: string
  readonly truth: "observed" | "inferred" | "unknown" | "error"
  readonly summary: string
  readonly at: number
}

export interface ProgressRecord {
  readonly name: string
  readonly scope: string
  readonly fingerprint: string
  readonly at: number
  readonly truth: ProgressOutcome["truth"]
  readonly summary: string
  readonly verdict: ProgressVerdict
  readonly expectation?: string
}

export interface ProgressExpectation {
  readonly name: string
  readonly scope: string
  readonly summary: string
}

export interface GuardDecision {
  readonly kind: "allow" | "warn" | "block"
  readonly repeats: number
  readonly message?: string
}

// Two identical repeats are allowed (a transient failure is plausible); the
// third with no progress is where repetition stops being recovery.
export const MAX_IDENTICAL_REPEATS = 2
export const STAGNATION_LIMIT = 3
const MAX_RECORDS = 40

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
    .join(",")}}`
}

export function fingerprint(name: string, args: unknown): string {
  return `${name}:${stable(args)}`
}

function matches(summary: string, expectation: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim()
  const haystack = normalize(summary)
  const needle = normalize(expectation)
  if (!needle || !haystack) return false
  if (haystack.includes(needle) || needle.includes(haystack)) return true
  const tokens = needle.split(" ").filter((token) => token.length >= 4)
  if (tokens.length === 0) return false
  const hits = tokens.filter((token) => haystack.includes(token)).length
  return hits >= Math.ceil(tokens.length / 2)
}

export class ProgressLedger {
  #records: ProgressRecord[] = []
  #expectation?: ProgressExpectation
  #stagnant = 0
  #guidance?: string

  expect(input: ProgressExpectation) {
    this.#expectation = { name: input.name, scope: input.scope, summary: input.summary }
  }

  /** Decided before a tool call: allow, warn, or block a dangerous repeat. */
  guard(input: ProgressAction): GuardDecision {
    const previous = this.#records.at(-1)
    const repeats = this.#trailing(fingerprint(input.name, input.args))
    if (!previous || previous.fingerprint !== fingerprint(input.name, input.args)) return { kind: "allow", repeats: 0 }

    if (repeats >= MAX_IDENTICAL_REPEATS && this.#stagnant >= STAGNATION_LIMIT) {
      const message = `Blocked: "${input.name}" was repeated ${repeats} times without progress (last verdict: ${previous.verdict}). Re-observe the target (environment state/anchor) or change strategy instead of repeating the same call.`
      this.#guidance = message
      return { kind: "block", repeats, message }
    }
    if (previous.truth === "unknown") {
      const message = `Warning: the previous "${input.name}" outcome is unknown; it may already have taken effect. Re-observe (environment state) before repeating it, to avoid a double effect.`
      this.#guidance = message
      return { kind: "warn", repeats, message }
    }
    const message = `Warning: "${input.name}" is repeating with no new state (x${repeats}). Prefer a different approach or re-observe before retrying.`
    this.#guidance = message
    return { kind: "warn", repeats, message }
  }

  /** Recorded after a tool call, with the normalized observation it produced. */
  observe(input: ProgressOutcome): ProgressRecord {
    const expectation = this.#expectation
    this.#expectation = undefined
    const previous = [...this.#records].reverse().find((record) => record.scope === input.scope)
    const verdict = this.#verdict(input, expectation, previous)
    const record: ProgressRecord = {
      name: input.name,
      scope: input.scope,
      fingerprint: fingerprint(input.name, input.args),
      at: input.at,
      truth: input.truth,
      summary: input.summary,
      verdict,
      expectation: expectation?.summary,
    }
    this.#records.push(record)
    if (this.#records.length > MAX_RECORDS) this.#records = this.#records.slice(-MAX_RECORDS)
    this.#guidance = undefined
    if (verdict === "expected" || verdict === "progress" || verdict === "different") this.#stagnant = 0
    else this.#stagnant += 1
    return record
  }

  #verdict(
    input: ProgressOutcome,
    expectation: ProgressExpectation | undefined,
    previous: ProgressRecord | undefined,
  ): ProgressVerdict {
    if (input.truth === "error") return "failed"
    if (input.truth === "unknown") return "unknown"
    if (previous && previous.summary === input.summary) return "no-progress"
    if (expectation) return matches(input.summary, expectation.summary) ? "expected" : "different"
    return "progress"
  }

  #trailing(fp: string): number {
    let count = 0
    for (let index = this.#records.length - 1; index >= 0; index--) {
      if (this.#records[index].fingerprint !== fp) break
      count++
    }
    return count
  }

  status() {
    return {
      last: this.#records.at(-1),
      stagnant: this.#stagnant,
      expectation: this.#expectation,
      guidance: this.#guidance,
      records: this.#records,
    }
  }

  reset() {
    this.#records = []
    this.#expectation = undefined
    this.#stagnant = 0
    this.#guidance = undefined
  }
}

const ledgers = new Map<string, ProgressLedger>()
const MAX_SESSIONS = 200

export function progressFor(sessionID: string): ProgressLedger {
  const existing = ledgers.get(sessionID)
  if (existing) return existing
  const created = new ProgressLedger()
  ledgers.set(sessionID, created)
  while (ledgers.size > MAX_SESSIONS) {
    const oldest = ledgers.keys().next().value
    if (oldest === undefined) break
    ledgers.delete(oldest)
  }
  return created
}

export function resetProgress(sessionID?: string) {
  if (sessionID === undefined) ledgers.clear()
  else ledgers.delete(sessionID)
}

export function buildProgressCapsule(ledger: ProgressLedger, options: { maxChars?: number } = {}): string {
  const status = ledger.status()
  if (!status.last && !status.guidance && !status.expectation) return ""
  const lines = ["<progress_state>"]
  if (status.last) {
    const expected = status.last.expectation ? ` (expected: ${status.last.expectation})` : ""
    lines.push(`last: ${status.last.name} on ${status.last.scope} → ${status.last.verdict}${expected}`)
  }
  if (status.expectation) {
    lines.push(`pending expectation: ${status.expectation.name} on ${status.expectation.scope} → ${status.expectation.summary}`)
  }
  if (status.stagnant > 0) {
    lines.push(`no measurable progress for ${status.stagnant} action(s); re-observe or change strategy before repeating.`)
  }
  if (status.guidance) lines.push(status.guidance)
  lines.push("</progress_state>")
  const capsule = lines.join("\n")
  const maxChars = options.maxChars ?? 900
  if (capsule.length <= maxChars) return capsule
  const body = lines.slice(1, -1)
  while (body.length > 0 && [...lines.slice(0, 1), ...body, "</progress_state>"].join("\n").length > maxChars) body.pop()
  return ["<progress_state>", ...body, "</progress_state>"].join("\n")
}

export function progressCapsule(sessionID: string, options?: { maxChars?: number }): string {
  return buildProgressCapsule(progressFor(sessionID), options)
}

export * as Progress from "./progress"
