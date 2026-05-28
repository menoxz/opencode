import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { spawn, type ChildProcess } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { writeNotification } from "./notifications"
import { listPendingTasks, markTaskDone, type TaskItem } from "./trigger-handler"

const log = Log.create({ service: "daemon.auto-executor" })

// ── Configuration ───────────────────────────────────────────────────────

const TASK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max per task

// ── Type for the headless result ─────────────────────────────────────────

interface HeadlessResult {
  type: "headless_result"
  sessionID: string
  success: boolean
  error: string | null
  summary: {
    additions: number
    deletions: number
    files: number
    diffs: Array<{ file: string; type: string; diff?: string }>
  } | null
  diffs: Array<{ file: string; type: string; diff?: string }>
  agent: string | null
  model: string | null
}

// ── State tracking ──────────────────────────────────────────────────────

let currentProcess: ChildProcess | null = null
let currentTaskId: string | null = null

// ── Prompt builder ──────────────────────────────────────────────────────

function buildAutoPrompt(task: TaskItem): string {
  const payload = task.payload as Record<string, unknown> | undefined
  const repo = (payload?.repo as string) ?? ""
  const action = (payload?.action as string) ?? "process"
  const description = (payload?.description as string) ?? ""

  const parts: string[] = [
    "You are processing an autonomous task for the opencode daemon.",
    `Task source: ${task.source}`,
    "",
  ]

  if (repo) parts.push(`Repository: ${repo}`)
  if (action) parts.push(`Action: ${action}`)

  // Context-specific instructions
  if (task.source === "github") {
    parts.push(description || "Review the pull request. Make changes if needed, then run typecheck and commit.")
  } else if (task.source === "file-watcher") {
    parts.push(`A file was modified: ${description || "unknown"}. Analyze the change for consistency.`)
  } else if (task.source === "schedule") {
    parts.push("This is a scheduled maintenance task.")
  } else {
    parts.push(description || "Process this task to completion.")
  }

  parts.push(
    "",
    "Rules:",
    "- Run `bun typecheck` before committing.",
    "- Commit with a descriptive message if you make changes.",
    "- If you cannot complete the task (missing info, permissions, ambiguity), explain why.",
    "- Report what you did or why you couldn't proceed.",
  )

  return parts.join("\n")
}

// ── Task eligibility ────────────────────────────────────────────────────

function isEligible(task: TaskItem): boolean {
  return true
}

// ── Find the opencode binary ────────────────────────────────────────────

function findBinary(): string | null {
  const argv0 = process.argv[0]
  if (argv0 && (argv0.endsWith("opencode.exe") || argv0.endsWith("opencode"))) {
    return path.resolve(argv0)
  }

  try {
    const devPath = path.resolve(__dirname, "..", "..", "..", "..", "dist", "bin", "opencode.exe")
    if (fs.existsSync(devPath)) return devPath
  } catch { /* __dirname unavailable */ }

  const envPath = process.env.PATH || ""
  for (const dir of envPath.split(path.delimiter)) {
    const candidate = path.join(dir, "opencode.exe")
    if (fs.existsSync(candidate)) return candidate
    const noExt = path.join(dir, "opencode")
    if (fs.existsSync(noExt)) return noExt
  }

  return null
}

// ── Spawn and parse headless result ──────────────────────────────────────

function spawnHeadless(
  task: TaskItem,
  prompt: string,
  cwd: string,
): Promise<{ result: HeadlessResult | null; exitCode: number | null; rawOutput: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const binary = findBinary()
    if (!binary) {
      log.error("Cannot find opencode binary for auto-execution")
      resolve({ result: null, exitCode: null, rawOutput: "Binary not found", timedOut: false })
      return
    }

    log.info("Spawning opencode headless", { binary, cwd, taskId: task.triggerId })

    const proc = spawn(binary, ["run", "--headless", prompt], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        OPENCODE_DAEMON_AUTO: "1",
      },
    })

    currentProcess = proc
    currentTaskId = task.triggerId

    const outputChunks: string[] = []

    proc.stdout?.on("data", (chunk: Buffer) => {
      outputChunks.push(chunk.toString())
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      outputChunks.push(chunk.toString())
    })

    const timer = setTimeout(() => {
      log.warn("Auto-execution timed out", { taskId: task.triggerId, timeoutMs: TASK_TIMEOUT_MS })
      try { proc.kill("SIGTERM") } catch { /* best-effort */ }
      setTimeout(() => {
        currentProcess = null
        currentTaskId = null
        resolve({ result: null, exitCode: null, rawOutput: outputChunks.join(""), timedOut: true })
      }, 2000)
    }, TASK_TIMEOUT_MS)

    proc.on("exit", (exitCode) => {
      clearTimeout(timer)
      const rawOutput = outputChunks.join("")
      currentProcess = null
      currentTaskId = null
      log.info("Headless execution completed", { taskId: task.triggerId, exitCode })

      // Parse the last JSON line as the headless result
      const result = parseHeadlessResult(rawOutput)
      resolve({ result, exitCode, rawOutput, timedOut: false })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      currentProcess = null
      currentTaskId = null
      log.error("Headless execution error", { taskId: task.triggerId, error: err.message })
      resolve({ result: null, exitCode: null, rawOutput: err.message, timedOut: false })
    })
  })
}

// ── Parse structured JSON from output ────────────────────────────────────

function parseHeadlessResult(output: string): HeadlessResult | null {
  // The headless result is the last JSON line in the output
  const lines = output.trim().split("\n").filter((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed?.type === "headless_result") {
        return parsed as HeadlessResult
      }
    } catch { /* not JSON, skip */ }
  }
  return null
}

// ── Diff summary helper ─────────────────────────────────────────────────

function formatDiffSummary(diffs: HeadlessResult["diffs"]): string {
  if (!diffs || diffs.length === 0) return "No file changes."
  const lines = diffs.map((d) => `  ${d.type}: ${d.file}`)
  return `${diffs.length} file(s) changed:\n${lines.join("\n")}`
}

// ── Main entry point ────────────────────────────────────────────────────

export const processNextTask = Effect.fnUntraced(function* () {
  if (currentProcess && currentTaskId) {
    log.info("Auto-executor already busy", { currentTaskId })
    return { status: "busy" as const, taskId: currentTaskId }
  }

  const pending = listPendingTasks().filter(isEligible)
  if (pending.length === 0) {
    return { status: "no_tasks" as const }
  }

  const task = pending[0]
  log.info("Processing task autonomously", { id: task.triggerId, source: task.source })

  const payload = task.payload as Record<string, unknown> | undefined
  const repoDir = (payload?.local_dir as string) || process.cwd()
  const prompt = buildAutoPrompt(task)

  const { result, exitCode, rawOutput, timedOut } = yield* Effect.promise(() =>
    spawnHeadless(task, prompt, repoDir),
  )

  // Extract info from structured result or fall back to exit code
  const success = result?.success ?? (exitCode === 0 && !timedOut)
  const errorMessage = result?.error ?? (timedOut ? "Task timed out" : exitCode !== 0 ? `Exit code ${exitCode}` : null)
  const diffSummary = result ? formatDiffSummary(result.diffs ?? []) : ""
  const details = [
    diffSummary,
    result?.summary ? `Summary: ${JSON.stringify(result.summary)}` : "",
    result?.model ? `Model: ${result.model}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  if (success) {
    writeNotification("task_success", "Task processed successfully", details, {
      taskId: task.triggerId,
      source: task.source,
    })
    markTaskDone(task.triggerId)
    log.info("Auto-execution SUCCESS", { taskId: task.triggerId, diffs: result?.diffs?.length ?? 0 })
  } else {
    const noteType = timedOut ? "task_escalated" : "task_failure"
    writeNotification(noteType, errorMessage ?? "Task failed", rawOutput.slice(0, 2000), {
      taskId: task.triggerId,
      source: task.source,
    })
    log.warn("Auto-execution FAILED", { taskId: task.triggerId, error: errorMessage })
  }

  return {
    status: timedOut ? "timeout" as const : success ? "success" as const : "failure" as const,
    taskId: task.triggerId,
    summary: success ? "Task completed" : errorMessage ?? "Task failed",
    filesChanged: result?.diffs?.length ?? 0,
  }
})

export function isExecutorBusy(): boolean {
  return currentProcess !== null && currentTaskId !== null
}

export * as AutoExecutor from "./auto-executor"
