import { expect, test } from "bun:test"
import { compactionRunning, summaryAfter } from "@/cli/cmd/tui/util/compaction-row"

test("le résumé compte s'il est porté par un message postérieur et terminé", () => {
  const messages = [
    { id: "msg_a", role: "user" },
    { id: "msg_b", role: "user" },
    { id: "msg_c", role: "assistant", summary: true, time: { created: 1, completed: 2 } },
  ]
  expect(summaryAfter(messages, "msg_a")).toBe(true)
})

/**
 * Le message du résumé est écrit **avant** d'être rempli, et la compaction dure ensuite une
 * minute entière (mesuré le 2026-10-20 : message créé 5 s après la part, terminé 59 s plus
 * tard). Compter le seul message faisait disparaître la ligne d'attente au bout de 5 s, donc
 * pendant tout le travail restant.
 */
test("un résumé encore en cours d'écriture ne prend pas le relais", () => {
  const messages = [
    { id: "msg_a", role: "user" },
    { id: "msg_c", role: "assistant", summary: true, time: { created: 1 } },
  ]
  expect(summaryAfter(messages, "msg_a")).toBe(false)
})

test("le résumé d'un tour antérieur ne compte pas", () => {
  const messages = [
    { id: "msg_a", role: "assistant", summary: true, time: { created: 1, completed: 2 } },
    { id: "msg_b", role: "user" },
  ]
  expect(summaryAfter(messages, "msg_b")).toBe(false)
})

test("un message absent de la liste n'a pas de résumé après lui", () => {
  expect(summaryAfter([{ id: "msg_a", role: "user" }], "msg_zzz")).toBe(false)
})

test("l'attente ne tourne que pendant la compaction", () => {
  expect(compactionRunning({ carries: true, busy: true, summaryReady: false })).toBe(true)
  // Aucune part de compaction : rien à annoncer, même si la session travaille.
  expect(compactionRunning({ carries: false, busy: true, summaryReady: false })).toBe(false)
  // Le résumé existe : `Compacted context` a pris le relais.
  expect(compactionRunning({ carries: true, busy: true, summaryReady: true })).toBe(false)
  // Session au repos : plus rien à attendre.
  expect(compactionRunning({ carries: true, busy: false, summaryReady: false })).toBe(false)
})
