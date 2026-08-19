import { Database } from "bun:sqlite"
import { statSync } from "node:fs"

const MAX_MSG = 100_000
const MAX_DIFFS = 100
const MAX_PATCH = 50_000

for (const [label, dbPath] of [
  ["opencodev2", "C:/Users/jeanl/.local/share/opencodev2/opencode.db"],
  ["officielle", "C:/Users/jeanl/.local/share/opencode/opencode.db"],
]) {
  console.log("\n=====", label, dbPath, "=====")
  const d = new Database(dbPath)
  const big = d.query(`SELECT id FROM message WHERE length(data) > ${MAX_MSG}`).all()
  console.log("messages >100KB:", big.length)
  const getMsg = d.prepare("SELECT data FROM message WHERE id = ?")
  const updMsg = d.prepare("UPDATE message SET data = ?, time_updated = ? WHERE id = ?")
  const now = Date.now()
  let truncated = 0
  let bytesBefore = 0
  let bytesAfter = 0
  for (const { id } of big) {
    const row = getMsg.get(id)
    if (!row) continue
    bytesBefore += row.data.length
    let j
    try { j = JSON.parse(row.data) } catch { continue }
    if (j.summary?.diffs && Array.isArray(j.summary.diffs) && j.summary.diffs.length > MAX_DIFFS) {
      j.summary.diffs = j.summary.diffs.slice(0, MAX_DIFFS)
      j.summary.diffsTruncated = true
    }
    if (j.summary?.diffs) {
      for (const df of j.summary.diffs) {
        if (typeof df?.patch === "string" && df.patch.length > MAX_PATCH) df.patch = df.patch.slice(0, MAX_PATCH) + "\n...[patch truncated by DB cleanup]"
      }
    }
    const next = JSON.stringify(j)
    bytesAfter += next.length
    if (next.length < row.data.length) {
      updMsg.run(next, now, id)
      truncated++
    }
  }
  console.log("truncated messages:", truncated)
  console.log("bytes before:", Math.round(bytesBefore / 1e6), "MB, after:", Math.round(bytesAfter / 1e6), "MB, freed:", Math.round((bytesBefore - bytesAfter) / 1e6), "MB")
  const before = statSync(dbPath).size
  console.log("db size before VACUUM:", Math.round(before / 1e6), "MB")
  const t0 = performance.now()
  d.query("VACUUM").get()
  console.log("VACUUM in", Math.round((performance.now() - t0) / 1000), "s")
  console.log("db size after VACUUM:", Math.round(statSync(dbPath).size / 1e6), "MB")
  d.close()
}
