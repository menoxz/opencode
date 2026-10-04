/**
 * Measures one model plan against one real tool output.
 *
 *   bun run script/eval-realplan.ts <output.txt> <plan.json>
 *
 * "Useful" is defined independently of the compactor: the failure and summary
 * lines a reader needs, plus the anchored lines the construction promises to restore.
 */
import fs from "node:fs"
import path from "node:path"
import { JevCompact } from "../src/jev/compact"
import { JevIntake } from "../src/jev/intake"

const [outputPath, planPath] = process.argv.slice(2)
if (!outputPath || !planPath) {
  console.error("usage: bun run script/eval-realplan.ts <output.txt> <plan.json>")
  process.exit(2)
}

const text = fs.readFileSync(path.resolve(outputPath), "utf8")
const raw = fs.readFileSync(path.resolve(planPath), "utf8")
const windows = JevCompact.windowsFromText(text)
const plan = JevCompact.parsePlan(raw)
if (!plan) {
  console.log("VERDICT=PARSE_FAILED")
  process.exit(1)
}

const beforeLines = text.split("\n")
const compacted = JevCompact.applyPlan(text, windows, plan)
const afterLines = compacted.split("\n")
const afterSet = new Set(afterLines)

const FAILURE = /FAIL|fail|Error|error|Exception|✗|✘|expected|Received|not ok|panic|Traceback/
const SUMMARY = /Tests:|Test Suites:|Ran |passing|failing|Asserts|Duration|took |✓|✕|ok\b|suite/
const ANCHOR = /:\/\/|\\\\|\/[a-z]|\bERR|error/

const recall = (pattern: RegExp) => {
  const distinct = new Set(beforeLines.filter((line) => pattern.test(line)))
  const kept = [...distinct].filter((line) => afterSet.has(line)).length
  return `${kept}/${distinct.size}`
}

const saved = (100 * (1 - compacted.length / text.length)).toFixed(1)
console.log(`PARSE_OK spans=${plan.keep.length} data=${plan.data ?? false}`)
console.log(`CHARS before=${text.length} after=${compacted.length} saved=${saved}%`)
console.log(`LINES before=${beforeLines.length} after=${afterLines.length}`)
console.log(`RECALL failures=${recall(FAILURE)} summaries=${recall(SUMMARY)} anchors=${recall(ANCHOR)}`)
console.log(`IDENTICAL=${compacted === text}`)
// The guarantee is defined by hasAnchor, which is narrower than ANCHOR above:
// report both so a loss is never attributed to the wrong definition.
const flagged = new Set(beforeLines.filter((line) => ANCHOR.test(line)))
console.log(`HASANCHOR_COVERAGE flagged=${flagged.size} real_anchors=${[...flagged].filter((line) => JevIntake.hasAnchor(line)).length}`)
