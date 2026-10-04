export * as JevCompact from "./compact"

import { Option, Schema } from "effect"
import { JevIntake } from "./intake"

/**
 * A window is the unit the model may cut *inside*. The extractive filter decides a
 * whole block at once, which is why it cannot keep three lines out of four hundred:
 * this one is asked for line ranges instead.
 */
export type Window = {
  readonly id: string
  /** Half-open line range `[start, end)` in the original text. */
  readonly start: number
  readonly end: number
  readonly text: string
}

/** 1-based inclusive line span, local to one window. */
const Span = Schema.Struct({
  window: Schema.String,
  from: Schema.Number,
  to: Schema.Number,
})

/**
 * The model answers with the lines to keep. `data` is its explicit "precise data
 * output, keep everything" signal, so the caller can leave the result untouched.
 */
const PlanSchema = Schema.Struct({
  keep: Schema.Array(Span),
  data: Schema.optional(Schema.Boolean),
})

export type Plan = Schema.Schema.Type<typeof PlanSchema>

/** Chars per window. Larger than `MAX_BLOCK_CHARS` so a window can hold a real region. */
export const WINDOW_CHARS = 4_000

/** Windows per result. Caps the prompt on huge outputs; the tail beyond them is never compacted. */
export const MAX_WINDOWS = 24

/** Below this the round-trip cannot pay for itself. */
export const MIN_CHARS = 8_000

export const marker = (lines: number) => `[intake-compact: removed ${lines} line(s); raw in ledger]`

/**
 * Deterministic split into contiguous windows covering every line, none exceeding
 * `maxChars` unless a single line does. Only the first `max` windows are returned:
 * everything past them is copied verbatim by `applyPlan`.
 */
export function windowsFromText(text: string, maxChars = WINDOW_CHARS, max = MAX_WINDOWS): Window[] {
  const lines = text.split("\n")
  const all: Window[] = []
  let start = 0
  let chars = 0
  for (let i = 0; i < lines.length; i++) {
    const cost = lines[i]!.length + 1
    if (i > start && chars + cost > maxChars) {
      all.push({ id: `w${all.length + 1}`, start, end: i, text: lines.slice(start, i).join("\n") })
      start = i
      chars = 0
    }
    chars += cost
  }
  if (start < lines.length || all.length === 0)
    all.push({ id: `w${all.length + 1}`, start, end: lines.length, text: lines.slice(start).join("\n") })
  return all.slice(0, max)
}

/**
 * A numeric or JSON payload is precise data: never compacted, without spending a
 * round-trip to be told so.
 */
export function looksLikeData(text: string): boolean {
  const sample = text.slice(0, 20_000)
  const trimmed = sample.trimStart()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true
  const tokens = sample.split(/\s+/)
  if (tokens.length < 40) return false
  const numeric = tokens.filter((token) => /^[-+]?\d[\d.,%:/-]*$/.test(token)).length
  // Three tokens in five carrying only digits and separators is a table or a dump,
  // not prose that happens to mention numbers.
  return numeric / tokens.length > 0.6
}

/** Line numbers are 1-based and local to their window, matching the numbers shown. */
export function buildCompactionPrompt(opts: { tool: string; intent?: string; windows: readonly Window[] }) {
  const windows = opts.windows
    .map((window) => {
      const numbered = window.text
        .split("\n")
        .map((line, index) => `${index + 1}: ${line}`)
        .join("\n")
      return `WINDOW ${window.id} (rows 1-${window.end - window.start} of a result starting at line ${window.start + 1}):\n${numbered}`
    })
    .join("\n\n")
  return [
    `A ${opts.tool} tool result is about to enter a coding agent's context.`,
    `CURRENT TASK: ${opts.intent ? opts.intent.slice(0, JevIntake.MAX_INTENT_CHARS) : "(not stated)"}`,
    "",
    "Return only the line ranges worth keeping for that task.",
    "- Code: keep the lines the task is about, plus enough surrounding context to read them.",
    "- Test output: keep failures, their names and the final summary; drop passing noise.",
    "- Precise data output (tables, measurements, lists of values): keep everything and set data=true.",
    "Rows are numbered per window; use those numbers, not line numbers of the whole result.",
    'Reply with JSON only: {"keep":[{"window":"w1","from":10,"to":40}],"data":false}',
    "",
    windows,
  ].join("\n")
}

/**
 * A malformed answer yields `undefined`, which the caller treats as "do not
 * compact": a parse failure must never delete information.
 */
export function parsePlan(raw: string): Plan | undefined {
  const text = raw.trim().replace(/```(?:json)?/gi, "")
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text.slice(start, end + 1))
  if (Option.isNone(decoded)) return undefined
  const plan = Schema.decodeUnknownOption(PlanSchema)(decoded.value)
  return Option.isNone(plan) ? undefined : plan.value
}

/**
 * Splice back only the kept lines, replacing each dropped run with one marker.
 *
 * Three guarantees, in the order they apply: a span is clamped to its window, an
 * anchored line is kept whatever the model said, and a marker never costs more
 * than the lines it replaces (so a "compaction" can never inflate the context).
 */
export function applyPlan(text: string, windows: readonly Window[], plan: Plan): string {
  if (plan.data) return text
  if (plan.keep.length === 0) return text
  const lines = text.split("\n")
  const covered = windows.at(-1)?.end ?? 0
  const keep = new Set<number>()
  let matched = 0
  for (const span of plan.keep) {
    const window = windows.find((candidate) => candidate.id === span.window)
    if (!window) continue
    const from = Math.max(window.start, window.start + span.from - 1)
    const to = Math.min(window.end, window.start + span.to)
    if (to <= from) continue
    matched += 1
    for (let index = from; index < to; index++) keep.add(index)
  }
  // A plan whose spans resolve to nothing must not delete every window.
  if (matched === 0) return text
  // An anchor is a path, a command, an identifier or an error string: never dropped.
  for (let index = 0; index < covered; index++) if (JevIntake.hasAnchor(lines[index] ?? "")) keep.add(index)
  for (let index = covered; index < lines.length; index++) keep.add(index)

  const out: string[] = []
  let removed = 0
  let cursor = 0
  while (cursor < lines.length) {
    if (keep.has(cursor)) {
      out.push(lines[cursor]!)
      cursor += 1
      continue
    }
    let stop = cursor
    while (stop < lines.length && !keep.has(stop)) stop += 1
    removed += stop - cursor
    out.push(marker(stop - cursor))
    cursor = stop
  }
  const filtered = out.join("\n")
  return removed > 0 && filtered.length < text.length ? filtered : text
}
