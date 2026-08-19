// L'id ascendant vaut : (timestamp_ms * 0x1000 + compteur) tronque a 6 octets (48 bits).
// Donc il REBOUCLE des que timestamp*4096 depasse 2^48.
const PERIOD_MS = 2 ** 36 // 68 719 476 736 ms
console.log("periode avant rebouclage :", (PERIOD_MS / 86400000).toFixed(1), "jours")

const k = Math.floor(Date.now() / PERIOD_MS)
const wrap = k * PERIOD_MS
console.log("dernier rebouclage       :", new Date(wrap).toISOString(), "(UTC)")
console.log("prochain rebouclage      :", new Date(wrap + PERIOD_MS).toISOString(), "(UTC)")

const hex = (ts, counter = 1) => (((BigInt(ts) * 4096n + BigInt(counter)) & 0xffffffffffffn).toString(16).padStart(12, "0"))
console.log("\nid genere 1 minute AVANT :", "msg_" + hex(wrap - 60000))
console.log("id genere 1 minute APRES :", "msg_" + hex(wrap + 60000))
console.log("=> l'id d'apres trie AVANT celui d'avant :", hex(wrap + 60000) < hex(wrap - 60000))

import { Database } from "bun:sqlite"
const d = new Database("C:/Users/jeanl/.local/share/opencodev2/opencode.db", { readonly: true })
const before = d.query(`SELECT id, time_created FROM message WHERE time_created < ${wrap} ORDER BY time_created DESC LIMIT 1`).get()
const after = d.query(`SELECT id, time_created FROM message WHERE time_created >= ${wrap} ORDER BY time_created ASC LIMIT 1`).get()
console.log("\n--- observe dans ta base ---")
console.log("dernier message avant le rebouclage :", before.id, new Date(before.time_created).toISOString())
console.log("premier message apres              :", after.id, new Date(after.time_created).toISOString())
console.log("ordre casse :", after.id < before.id)
