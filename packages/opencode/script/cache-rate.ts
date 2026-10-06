// Cache hit rate per session, measured against the structural ceiling an
// append-only conversation can reach.
//
//   bun run script/cache-rate.ts [sessionLimit] [dbPath]
//
// measured = cache.read / (cache.read + input) over every assistant step.
// ceiling  = what the same session would reach if every step re-billed only
//            the content it actually added (context growth since the previous
//            step). Anything below that gap is a cache prefix miss: the request
//            re-sent a prefix it had already paid for.
import { Database } from "bun:sqlite"
import os from "os"
import path from "path"

const limit = Number(process.argv[2] ?? 25)
const explicit = process.argv[3]

function open() {
  // Windows keeps process.env.HOME unset, so the data dir must be resolved from
  // the user profile rather than from HOME.
  const home = os.homedir()
  const variants = ["opencode", "opencodev2"]
  const candidates = [
    explicit,
    process.env.OPENCODE_DB,
    ...variants.flatMap((name) => [
      path.join(home, ".local", "share", name, "opencode.db"),
      path.join(process.env.LOCALAPPDATA ?? "", name, "opencode.db"),
      path.join(process.env.APPDATA ?? "", name, "opencode.db"),
    ]),
  ].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      return new Database(candidate, { readonly: true })
    } catch {}
  }
  console.error(`cache-rate: no opencode database found. Tried:\n  ${candidates.join("\n  ")}`)
  process.exit(2)
}

const db = open()
const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

interface Report {
  id: string
  model: string
  steps: number
  measured: number
  ceiling: number
  gap: number
  medianDelta: number
  finalContext: number
  misses: number
}

const sessions = db.query(`select id from session order by time_created desc limit ?`).all(limit) as any[]
const reports: Report[] = []

for (const session of sessions) {
  const rows = db
    .query(
      `select time_created, json_extract(data,'$.tokens') tokens,
              json_extract(data,'$.modelID') model
       from message
       where session_id = ? and json_extract(data,'$.role') = 'assistant'
       order by time_created asc`,
    )
    .all(session.id) as any[]

  const steps = rows
    .map((row) => {
      const tokens = JSON.parse((row.tokens as string) ?? "{}")
      const input = num(tokens.input)
      const read = num(tokens.cache?.read)
      const context = input + read
      return { input, read, context, rate: context > 0 ? (read / context) * 100 : 0, model: row.model as string }
    })
    .filter((step) => step.context > 0)
  if (steps.length < 6) continue

  const totalInput = steps.reduce((a, step) => a + step.input, 0)
  const totalRead = steps.reduce((a, step) => a + step.read, 0)
  const totalContext = steps.reduce((a, step) => a + step.context, 0)
  const totalAdded = steps.reduce(
    (a, step, index) => a + Math.max(0, index === 0 ? step.context : step.context - steps[index - 1]!.context),
    0,
  )

  const deltas: number[] = []
  for (let i = 1; i < steps.length; i++) {
    const delta = steps[i]!.context - steps[i - 1]!.context
    if (delta > 0) deltas.push(delta)
  }

  reports.push({
    id: String(session.id).slice(0, 10),
    model: String(steps[0]!.model ?? "?"),
    steps: steps.length,
    measured: (totalRead / totalContext) * 100,
    ceiling: ((totalContext - totalAdded) / totalContext) * 100,
    gap: ((totalContext - totalAdded - totalRead) / totalContext) * 100,
    medianDelta: median(deltas),
    finalContext: steps[steps.length - 1]!.context,
    misses: steps.filter((step) => step.rate < 50).length,
  })
}

if (!reports.length) {
  console.log("cache-rate: no session carried enough assistant steps to measure")
  process.exit(0)
}

reports.sort((a, b) => b.gap - a.gap)

const pad = (value: string | number, width: number) => String(value).padStart(width)
console.log("session     model                       steps  measured  ceiling    gap  missSteps  addedMedian  finalCtx")
for (const r of reports) {
  console.log(
    [
      r.id.padEnd(11),
      r.model.slice(0, 26).padEnd(26),
      pad(r.steps, 5),
      pad(r.measured.toFixed(1) + "%", 9),
      pad(r.ceiling.toFixed(1) + "%", 8),
      pad(r.gap.toFixed(1), 7),
      pad(r.misses, 10),
      pad(r.medianDelta, 12),
      pad(r.finalContext, 9),
    ].join(" "),
  )
}

console.log(
  `\nsessions=${reports.length} median measured=${median(reports.map((r) => r.measured)).toFixed(1)}% ` +
    `median ceiling=${median(reports.map((r) => r.ceiling)).toFixed(1)}% ` +
    `median gap=${median(reports.map((r) => r.gap)).toFixed(1)}pt`,
)
console.log("ceiling is the best an append-only conversation can reach; the gap is recoverable cache loss.")