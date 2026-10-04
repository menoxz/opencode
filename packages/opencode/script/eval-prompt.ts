/**
 * Materialises the exact prompt the compactor would send, for one real stored
 * tool output, so it can be submitted to a real model and its answer measured.
 *
 *   bun run script/eval-prompt.ts <rows.json> <out-prefix> [task]
 */
import fs from "node:fs"
import path from "node:path"
import { JevCompact } from "../src/jev/compact"

const [rowsPath, outPrefix, task] = process.argv.slice(2)
if (!rowsPath || !outPrefix) {
  console.error("usage: bun run script/eval-prompt.ts <rows.json> <out-prefix> [task]")
  process.exit(2)
}

const rows = JSON.parse(fs.readFileSync(path.resolve(rowsPath), "utf8")) as { tool: string; output: string }[]
const intent = task ?? "Fix the failing test in the session module"

// The most test-shaped bash output: the case where the model must keep failures
// and the summary while dropping the noise.
const candidates = rows.filter((row) => row.tool === "bash" && JevCompact.windowsFromText(row.output).length > 3)
const pick = candidates.sort((a, b) => b.output.length - a.output.length)[0] ?? rows[0]!
const windows = JevCompact.windowsFromText(pick.output)
const prompt = JevCompact.buildCompactionPrompt({ tool: pick.tool, intent, windows })

fs.writeFileSync(`${outPrefix}-prompt.txt`, prompt, "utf8")
fs.writeFileSync(`${outPrefix}-output.txt`, pick.output, "utf8")
fs.writeFileSync(
  `${outPrefix}-meta.json`,
  JSON.stringify({ tool: pick.tool, intent, chars: pick.output.length, lines: pick.output.split("\n").length, windows: windows.length }, null, 2),
  "utf8",
)

console.log(`tool=${pick.tool} chars=${pick.output.length} lines=${pick.output.split("\n").length} windows=${windows.length}`)
console.log(`prompt_chars=${prompt.length} prompt_tokens≈${Math.round(prompt.length / 4)}`)
console.log(`WRITTEN=${outPrefix}-prompt.txt`)
