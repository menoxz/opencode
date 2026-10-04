import { Database } from "bun:sqlite"
const d = new Database("C:/Users/jeanl/.local/share/opencodev2/opencode.db")

// Sessions pinned to the dead Zen free model: currentModel() makes that stored
// model win over the config, so every prompt in them hits an endpoint that never
// answers. Re-pin them to the configured model.
const rows = d.query("SELECT id, model, time_updated FROM session").all()
const broken = []
for (const s of rows) {
  if (!s.model) continue
  let m = s.model
  try { m = typeof s.model === "string" ? JSON.parse(s.model) : s.model } catch { continue }
  const id = m.id ?? m.modelID
  if (m.providerID === "opencode" && String(id).includes("free")) broken.push({ id: s.id, model: JSON.stringify(m), updated: s.time_updated })
}
console.log("sessions epinglees sur le modele mort:", broken.length)
require("fs").writeFileSync("C:/jeanluc/opencode-fork/perf/repinned-sessions.json", JSON.stringify(broken, null, 2))
console.log("liste sauvegardee (reversible): perf/repinned-sessions.json")

const target = JSON.stringify({ providerID: "opencode-go", id: "deepseek-v4-flash", variant: "default" })
const stmt = d.prepare("UPDATE session SET model = ? WHERE id = ?")
let n = 0
for (const b of broken) { stmt.run(target, b.id); n++ }
console.log("sessions re-epinglees sur opencode-go/deepseek-v4-flash:", n)

const check = d.query("SELECT COUNT(*) c FROM session WHERE model LIKE '%free%'").get()
console.log("restant avec un modele 'free':", check.c)
