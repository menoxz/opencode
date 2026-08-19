import { Database } from "bun:sqlite"
const d = new Database("C:/Users/jeanl/.local/share/opencodev2/opencode.db", { readonly: true })
const sid = d.query("SELECT id FROM session WHERE id LIKE 'ses_00a755c93%'").get().id

const rows = d.query("SELECT id, data, time_created FROM message WHERE session_id = '" + sid + "' ORDER BY time_created DESC LIMIT 6").all()
const getParts = d.prepare("SELECT data FROM part WHERE message_id = ? ORDER BY id")
console.log("=== 6 derniers messages (du plus recent au plus ancien) ===")
for (const m of rows) {
  const j = JSON.parse(m.data)
  const t = new Date(m.time_created).toISOString().replace("T", " ").slice(0, 19)
  const txt = getParts.all(m.id).map(p => { try { const x = JSON.parse(p.data); return x.type === "text" ? String(x.text ?? "").slice(0, 40) : x.type } catch { return "?" } }).join(" | ")
  console.log(`${t} ${j.role.padEnd(9)} ${m.id}  finish=${j.finish ?? "-"}`)
  console.log(`                     ${txt.slice(0, 110)}`)
}
const maxId = d.query("SELECT id FROM message WHERE session_id = '" + sid + "' ORDER BY id DESC LIMIT 1").get().id
console.log("\nid le plus grand de la session :", maxId)
console.log("dernier message ecrit          :", rows[0].id)
console.log("=> ordre restaure ?", rows[0].id === maxId ? "OUI" : "NON")
