import { Database } from "bun:sqlite"
import { statSync } from "node:fs"
const dbPath = "C:/Users/jeanl/.local/share/opencodev2/opencode.db"
const d = new Database(dbPath)

const orphansMsg = d.query("SELECT COUNT(*) n FROM message WHERE session_id NOT IN (SELECT id FROM session)").get().n
const orphansPart = d.query("SELECT COUNT(*) n FROM part WHERE session_id NOT IN (SELECT id FROM session)").get().n
console.log("orphan messages:", orphansMsg)
console.log("orphan parts:", orphansPart)

// Clean orphans by session_id, then parts whose message is gone too
d.query("DELETE FROM message WHERE session_id NOT IN (SELECT id FROM session)").run()
d.query("DELETE FROM part WHERE session_id NOT IN (SELECT id FROM session)").run()
d.query("DELETE FROM part WHERE message_id NOT IN (SELECT id FROM message)").run()

const before = statSync(dbPath).size
console.log("size before VACUUM:", Math.round(before / 1e6), "MB")
const t0 = performance.now()
d.query("VACUUM").get()
console.log("VACUUM done in", Math.round((performance.now() - t0) / 1000), "s")
const after = statSync(dbPath).size
console.log("size after VACUUM:", Math.round(after / 1e6), "MB")
console.log("remaining sessions:", d.query("SELECT COUNT(*) n FROM session").get().n)
console.log("remaining messages:", d.query("SELECT COUNT(*) n FROM message").get().n)
console.log("remaining parts:", d.query("SELECT COUNT(*) n FROM part").get().n)
console.log("remaining parts >1MB:", d.query("SELECT COUNT(*) n FROM part WHERE length(data) > 1000000").get().n)
