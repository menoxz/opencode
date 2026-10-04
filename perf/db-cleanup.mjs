import { Database } from "bun:sqlite"

const dbPath = "C:/Users/jeanl/.local/share/opencodev2/opencode.db"
const d = new Database(dbPath)

const LIMIT = 1_000_000 // parts > 1 MB of JSON
const OUTPUT_KEEP = 4_000
const INPUT_KEEP = 50_000
const DIAG_FILES = 5
const DIAG_PER_FILE = 20

// bun:sqlite (baseline, Windows) ignores params passed to query(); only
// prepare(...).get/run with positional values works. Use that everywhere.

// 1. Find giant parts (inline literal: numeric param binding is broken too)
const big = d.query(`SELECT id FROM part WHERE length(data) > ${LIMIT}`).all()
console.log("giant parts (>1MB):", big.length)

const getPart = d.prepare("SELECT data FROM part WHERE id = ?")
const updatePart = d.prepare("UPDATE part SET data = ?, time_updated = ? WHERE id = ?")

// 2. Truncate each one
let truncated = 0
let totalBefore = 0
let totalAfter = 0
const truncateDiagnostics = (diag) => {
  if (typeof diag !== "object" || diag === null) return diag
  const entries = Object.entries(diag)
  const kept = entries.slice(0, DIAG_FILES).map(([f, issues]) => [f, Array.isArray(issues) ? issues.slice(0, DIAG_PER_FILE) : issues])
  return Object.fromEntries(kept)
}
const now = Date.now()
for (const { id } of big) {
  const row = getPart.get(id)
  if (!row) continue
  const before = row.data.length
  totalBefore += before
  let j
  try { j = JSON.parse(row.data) } catch { continue } // unparseable: leave as-is
  const state = j.state ?? {}
  if (typeof state.output === "string" && state.output.length > OUTPUT_KEEP) {
    state.output = state.output.slice(0, OUTPUT_KEEP) + "\n...[output truncated by DB cleanup]"
    state.outputTruncated = true
  }
  if (state.metadata && typeof state.metadata === "object") {
    const md = state.metadata
    if (md.diagnostics && typeof md.diagnostics === "object") {
      md.diagnostics = truncateDiagnostics(md.diagnostics)
      md.diagnosticsTruncated = true
    }
  }
  j.state = state
  let next = JSON.stringify(j)
  if (next.length > 200_000 && typeof state.input?.content === "string" && state.input.content.length > INPUT_KEEP) {
    state.input.content = state.input.content.slice(0, INPUT_KEEP) + "\n...[input truncated by DB cleanup]"
    j.state = state
    next = JSON.stringify(j)
  }
  totalAfter += next.length
  updatePart.run(next, now, id)
  truncated++
  if (truncated % 100 === 0) console.log("  ...", truncated, "truncated")
}
console.log("truncated parts:", truncated)
console.log("bytes before:", totalBefore, "after:", totalAfter, "freed:", totalBefore - totalAfter)

// 3. Drop empty sessions (no messages at all)
const empty = d.query(
  "SELECT s.id FROM session s WHERE NOT EXISTS (SELECT 1 FROM message m WHERE m.session_id = s.id)",
).all()
console.log("empty sessions:", empty.length)
const delSession = d.prepare("DELETE FROM session WHERE id = ?")
for (const { id } of empty) delSession.run(id)

// 4. Verify
const check = d.query(`SELECT COUNT(*) n FROM part WHERE length(data) > ${LIMIT}`).get()
console.log("verify remaining giant parts:", check.n)
console.log("cleanup done")
