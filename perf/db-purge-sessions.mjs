import { Database } from "bun:sqlite"
import { statSync } from "node:fs"

const dbPath = "C:/Users/jeanl/.local/share/opencodev2/opencode.db"
const d = new Database(dbPath)

const now = Date.now()
const cutoff = now - 90 * 86400e3

// Sessions with no updates in the last 90 days
const findStmt = d.prepare("SELECT id, title FROM session WHERE time_updated < ?")
const stale = findStmt.all(cutoff)
console.log("stale sessions (>90d inactive):", stale.length)

// Their footprint
const bytesStmt = d.prepare("SELECT COALESCE(SUM(length(data)),0) n FROM part WHERE session_id = ?")
let partsBytes = 0
for (const s of stale) partsBytes += bytesStmt.get(s.id).n
console.log("parts bytes to free:", Math.round(partsBytes / 1e6), "MB")

// Delete (FK CASCADE removes messages and parts)
const delSession = d.prepare("DELETE FROM session WHERE id = ?")
let deleted = 0
for (const s of stale) {
  delSession.run(s.id)
  deleted++
}
console.log("deleted sessions:", deleted)

const before = statSync(dbPath).size
console.log("size before VACUUM:", Math.round(before / 1e6), "MB")
const t0 = performance.now()
d.query("VACUUM").get()
console.log("VACUUM done in", Math.round((performance.now() - t0) / 1000), "s")
const after = statSync(dbPath).size
console.log("size after VACUUM:", Math.round(after / 1e6), "MB")
console.log("remaining sessions:", d.query("SELECT COUNT(*) n FROM session").get().n)
console.log("remaining parts:", d.query("SELECT COUNT(*) n FROM part").get().n)
console.log("remaining messages:", d.query("SELECT COUNT(*) n FROM message").get().n)
