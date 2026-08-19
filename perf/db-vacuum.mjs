import { Database } from "bun:sqlite"
import { statSync } from "node:fs"
const dbPath = "C:/Users/jeanl/.local/share/opencodev2/opencode.db"
const d = new Database(dbPath)
console.log("messages >100KB now:", d.query("SELECT COUNT(*) n FROM message WHERE length(data) > 100000").get().n)
console.log("biggest msg now:", d.query("SELECT id, length(data) len FROM message ORDER BY len DESC LIMIT 3").all().map(r => `${r.id.slice(0,22)} ${r.len}`).join(" | "))
const before = statSync(dbPath).size
console.log("size before VACUUM:", Math.round(before/1e6), "MB")
const t0 = performance.now()
d.query("VACUUM").get()
console.log("VACUUM in", Math.round((performance.now()-t0)/1000), "s")
console.log("size after VACUUM:", Math.round(statSync(dbPath).size/1e6), "MB")
console.log("sessions:", d.query("SELECT COUNT(*) n FROM session").get().n)
console.log("messages:", d.query("SELECT COUNT(*) n FROM message").get().n)
console.log("parts:", d.query("SELECT COUNT(*) n FROM part").get().n)
console.log("parts >1MB:", d.query("SELECT COUNT(*) n FROM part WHERE length(data) > 1000000").get().n)
