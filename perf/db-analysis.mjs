import { Database } from "bun:sqlite"
const d = new Database("C:/Users/jeanl/.local/share/opencodev2/opencode.db", { readonly: true })

// ff... = descending(), 00... = ascending()
const rows = d.query("SELECT id, time_created FROM message ORDER BY time_created ASC").all()
let lastDesc = null, firstAsc = null
let desc = 0, asc = 0, other = 0
for (const r of rows) {
  const p = r.id.slice(4, 6)
  if (p === "ff") { desc++; lastDesc = r }
  else if (p === "00") { asc++; if (!firstAsc) firstAsc = r }
  else other++
}
console.log("messages total:", rows.length)
console.log("  descending (ff...):", desc)
console.log("  ascending  (00...):", asc)
console.log("  autres:", other)
console.log("\ndernier message descending :", lastDesc ? new Date(lastDesc.time_created).toISOString().slice(0,19) + "  " + lastDesc.id : "-")
console.log("premier message ascending  :", firstAsc ? new Date(firstAsc.time_created).toISOString().slice(0,19) + "  " + firstAsc.id : "-")

// Sessions creees avant le basculement et encore vivantes = risque
const boundary = firstAsc ? firstAsc.time_created : 0
const sess = d.query(`SELECT id, time_created, time_updated FROM session`).all()
const preSwitch = sess.filter(s => s.time_created < boundary)
const resumedAfter = preSwitch.filter(s => s.time_updated > boundary)
console.log("\nsessions creees AVANT le basculement:", preSwitch.length, "/", sess.length)
console.log("dont reprises APRES le basculement  :", resumedAfter.length, "  <-- exposees au blocage")
