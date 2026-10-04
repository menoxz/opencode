import { readFileSync } from "fs"
import { spawn } from "child_process"
import path from "path"
import { runQaWorkflow, type QaManifest } from "../src/qa-proof"

const manifestPath = path.resolve(process.cwd(), process.argv[2] ?? "qa-proof.json")
let manifest: QaManifest
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) }
catch (error) { console.error(`QA_WORKFLOW_BLOCKED: cannot read ${manifestPath}: ${String(error)}`); process.exit(2) }

const report = await runQaWorkflow(manifest!, (phase, command) => new Promise<number>((resolve) => {
  console.log(`QA_PHASE_START ${phase}: ${command}`)
  const child = spawn(command, { cwd: process.cwd(), shell: true, stdio: "inherit", env: process.env })
  child.on("error", () => resolve(-1))
  child.on("exit", (code) => { console.log(`QA_PHASE_END ${phase}: ${code ?? -1}`); resolve(code ?? -1) })
}))

console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)
