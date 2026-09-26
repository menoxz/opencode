/**
 * Reliability harness for the LLM compactor core.
 *
 * Run with the path of a JSON array of `{ tool, output }` rows extracted from the
 * opencode database:
 *
 *   bun run script/eval-compact.ts <rows.json>
 *
 * Three scenarios per real output:
 *  - realistic: the model keeps a narrow range near the middle (what a good answer
 *    looks like) — measures how much is actually saved;
 *  - hostile: the model keeps nothing at all (a wrong or adversarial answer) —
 *    measures what can be lost, which must be exactly the non-anchored lines;
 *  - data: the model flags precise data — the output must come back byte-identical.
 */
import fs from "node:fs"
import path from "node:path"
import { JevCompact } from "../src/jev/compact"

const rowsPath = process.argv[2]
if (!rowsPath) {
  console.error("usage: bun run script/eval-compact.ts <rows.json>")
  process.exit(2)
}

type Row = { tool: string; output: string }

const rows = JSON.parse(fs.readFileSync(path.resolve(rowsPath), "utf8")) as Row[]
const anchorsOf = (text: string) => text.split("\n").filter((line) => line.length > 0 && /:\/\/|\\\\|\/[a-z]|\bERR|error/i.test(line))

const pct = (before: number, after: number) => (before === 0 ? "0.0" : (100 * (1 - after / before)).toFixed(1))

const main = () => {
  let realisticBefore = 0
  let realisticAfter = 0
  let anchoredTotal = 0
  let anchoredLostHostile = 0
  let dataUnchanged = 0
  let refused = 0
  let promptChars = 0
  const perRow: string[] = []

  for (const row of rows) {
    const text = row.output
    const windows = JevCompact.windowsFromText(text)
    if (windows.length === 0) continue
    const total = text.split("\n").length
    const middle = Math.floor(total / 2)
    const span = (from: number, to: number) => {
      const window = windows.find((candidate) => middle >= candidate.start && middle < candidate.end) ?? windows[0]!
      const local = Math.min(window.end - window.start, Math.max(1, from))
      return { window: window.id, from: local, to: Math.min(window.end - window.start, local + to - 1) }
    }

    const realistic = JevCompact.applyPlan(text, windows, { keep: [span(1, 40)], data: false })
    const hostile = JevCompact.applyPlan(text, windows, { keep: [], data: false })
    const data = JevCompact.applyPlan(text, windows, { keep: [span(1, 1)], data: true })

    const anchors = anchorsOf(text)
    const hostileLines = new Set(hostile.split("\n"))
    const lost = anchors.filter((line) => !hostileLines.has(line)).length
    anchoredTotal += anchors.length
    anchoredLostHostile += lost
    if (data === text) dataUnchanged += 1
    if (realistic === text) refused += 1
    realisticBefore += text.length
    realisticAfter += realistic.length
    promptChars += JevCompact.buildCompactionPrompt({ tool: row.tool, intent: "the current task", windows }).length

    perRow.push(
      `${row.tool.padEnd(22)} lines=${String(total).padStart(6)} before=${String(text.length).padStart(7)} realistic=${String(realistic.length).padStart(7)} saved=${pct(text.length, realistic.length).padStart(5)}% hostile_anchors_lost=${lost}/${anchors.length}`,
    )
  }

  console.log(perRow.join("\n"))
  console.log("")
  console.log(`rows=${rows.length}`)
  console.log(`REALISTIC before=${realisticBefore} after=${realisticAfter} saved=${pct(realisticBefore, realisticAfter)}% refused=${refused}`)
  console.log(`HOSTILE anchors_total=${anchoredTotal} anchors_lost=${anchoredLostHostile}`)
  console.log(`DATA byte_identical=${dataUnchanged}/${rows.length}`)
  // Compact once, pay the payload again as prompt; save it on every later turn that replays the result.
  const perTurnSaved = realisticBefore - realisticAfter
  const planChars = 120 * rows.length
  console.log(
    `COST prompt_chars=${promptChars} est_prompt_tokens=${Math.round(promptChars / 4)} plan_chars≈${planChars} per_turn_saved_chars=${perTurnSaved} break_even_turns=${
      perTurnSaved > 0 ? Math.ceil((promptChars + planChars) / perTurnSaved) : "n/a"
    }`,
  )
  const ok = anchoredLostHostile === 0 && dataUnchanged === rows.length
  console.log(`VERDICT=${ok ? "no-anchored-information-lost-by-construction" : "GUARANTEE-BROKEN"}`)
  process.exit(ok ? 0 : 1)
}

main()
