import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { spawn, type ChildProcess } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { writeNotification } from "./notifications"
import { listPendingTasks, markTaskDone, type TaskItem } from "./trigger-handler"

const log = Log.create({ service: "daemon.auto-executor" })

// ── Configuration ───────────────────────────────────────────────────────

const TASK_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes max per task

// ── State tracking ──────────────────────────────────────────────────────

let currentProcess: ChildProcess | null = null
let currentTaskId: string | null = null
let lastHeartbeat = 0

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

/**
 * Determine if a task is eligible for autonomous processing.
 * Some tasks are too complex or sensitive for auto-execution.
 */
function isEligible(task: TaskItem): boolean {
  // Always eligible for now — agent decides within the session.
  // We can add filters later (e.g., skip if payload contains "breaking").
  return true
}

// ── Find the opencode binary ────────────────────────────────────────────

function findBinary(): string | null {
  // 1. Current process argv[0]
  const argv0 = process.argv[0]
  if (argv0 && (argv0.endsWith("opencode.exe") || argv0.endsWith("opencode"))) {
    return path.resolve(argv0)
  }

  // 2. Known dev fork path relative to this source
  try {
    // In dev: packages/opencode/src/daemon/auto-executor.ts
    // binary: dist/bin/opencode.exe
    const devPath = path.resolve(__dirname, "..", "..", "..", "..", "dist", "bin", "opencode.exe")
    if (fs.existsSync(devPath)) return devPath
  } catch { /* __dirname unavailable */ }

  // 3. Fall back to PATH
  const envPath = process.env.PATH || ""
  for (const dir of envPath.split(path.delimiter)) {
    const candidate = path.join(dir, "opencode.exe")
    if (fs.existsSync(candidate)) return candidate
    const noExt = path.join(dir, "opencode")
    if (fs.existsSync(noExt)) return noExt
  }

  return null
}

// ── Spawn and monitor ───────────────────────────────────────────────────

function spawnRun(
  task: TaskItem,
  prompt: string,
  cwd: string,
): Promise<{ exitCode: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const binary = findBinary()
    if (!binary) {
      log.error("Cannot find opencode binary for auto-execution")
      resolve({ exitCode: null, output: "Binary not found", timedOut: false })
      return
    }

    log.info("Spawning opencode run", { binary, cwd, taskId: task.triggerId })

    const proc = spawn(binary, ["run", "--format", "json", prompt], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: TASK_TIMEOUT_MS,
      env: {
        ...process.env,
        OPENCODE_DAEMON_AUTO: "1",
        // Disable interactive prompts
        OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS: "1",
      },
    })

    currentProcess = proc
    currentTaskId = task.triggerId
    lastHeartbeat = Date.now()

    let output = ""
    const outputChunks: string[] = []

    proc.stdout?.on("data", (chunk: Buffer) => {
      outputChunks.push(chunk.toString())
      lastHeartbeat = Date.now()
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      outputChunks.push(chunk.toString())
    })

    const timer = setTimeout(() => {
      // Timeout: kill the process
      log.warn("Auto-execution timed out", { taskId: task.triggerId, timeoutMs: TASK_TIMEOUT_MS })
      try { proc.kill("SIGTERM") } catch { /* best-effort */ }
      // Give it a moment to die before resolving
      setTimeout(() => {
        currentProcess = null
        currentTaskId = null
        resolve({ exitCode: null, output: outputChunks.join(""), timedOut: true })
      }, 2000)
    }, TASK_TIMEOUT_MS)

    proc.on("exit", (exitCode) => {
      clearTimeout(timer)
      output = outputChunks.join("")
      currentProcess = null
      currentTaskId = null
      log.info("Auto-execution completed", { taskId: task.triggerId, exitCode })
      resolve({ exitCode, output, timedOut: false })
    })

    proc.on("error", (err) => {
      clearTimeout(timer)
      currentProcess = null
      currentTaskId = null
      log.error("Auto-execution error", { taskId: task.triggerId, error: err.message })
      resolve({ exitCode: null, output: err.message, timedOut: false })
    })
  })
}

// ── Parse result ────────────────────────────────────────────────────────

function analyzeResult(
  exitCode: number | null,
  output: string,
  _task: TaskItem,
): { success: boolean; summary: string; details: string } {
  if (exitCode === null) {
    return {
      success: false,
      summary: "Task processing failed or timed out",
      details: output.slice(0, 2000),
    }
  }

  if (exitCode !== 0) {
    return {
      success: false,
      summary: `Task failed with exit code ${exitCode}`,
      details: output.slice(0, 2000),
    }
  }

  // Exit code 0 — check output for evidence of meaningful work
  const lower = output.toLowerCase()

  // Look for signs of success
  const hasCommits = lower.includes("committed") || lower.includes("commit") || lower.includes("pushed")
  const hasEdits = lower.includes("edited") || lower.includes("modified") || lower.includes("created")
  const hasErrors = lower.includes("error") || lower.includes("failed") || lower.includes("cannot")
  const hasReport = lower.includes("✅") || lower.includes("done") || lower.includes("completed")

  if (hasErrors && !hasCommits && !hasEdits) {
    return {
      success: false,
      summary: "Task encountered errors during processing",
      details: output.slice(0, 2000),
    }
  }

  if (hasCommits || hasEdits || hasReport) {
    return {
      success: true,
      summary: "Task processed successfully",
      details: output.slice(0, 2000),
    }
  }

  // Ambiguous — treat as success if exit code is 0
  return {
    success: true,
    summary: "Task completed (exit 0)",
    details: output.slice(0, 1000),
  }
}

// ── Main entry point ────────────────────────────────────────────────────

/**
 * Process the next eligible pending task from the queue.
 *
 * Returns information about what happened (for logging/monitoring).
 */
export const processNextTask = Effect.fnUntraced(function* () {
  // Don't start a new task if one is already running
  if (currentProcess && currentTaskId) {
    log.info("Auto-executor already busy", { currentTaskId })
    return { status: "busy" as const, taskId: currentTaskId }
  }

  // Find the next eligible pending task
  const pending = listPendingTasks().filter(isEligible)
  if (pending.length === 0) {
    return { status: "no_tasks" as const }
  }

  // Pick the first one (oldest first = most urgent)
  const task = pending[0]
  log.info("Processing task autonomously", { id: task.triggerId, source: task.source })

  // Determine working directory from payload
  const payload = task.payload as Record<string, unknown> | undefined
  const repoDir = (payload?.local_dir as string) || process.cwd()

  // Build prompt
  const prompt = buildAutoPrompt(task)

  // Spawn and wait
  const { exitCode, output, timedOut } = yield* Effect.promise(() => spawnRun(task, prompt, repoDir))

  // Analyze result
  const { success, summary, details } = analyzeResult(exitCode, output, task)

  // Write notification
  if (success) {
    writeNotification("task_success", summary, details, {
      taskId: task.triggerId,
      source: task.source,
    })
    // Mark task as done
    markTaskDone(task.triggerId)
  } else {
    writeNotification(
      timedOut ? "task_escalated" : "task_failure",
      summary,
      details,
      { taskId: task.triggerId, source: task.source },
    )
    // Leave task pending for user intervention
  }

  log.info("Auto-execution result", {
    taskId: task.triggerId,
    success,
    timedOut,
    summary,
  })

  return {
    status: timedOut ? "timeout" as const : success ? "success" as const : "failure" as const,
    taskId: task.triggerId,
    summary,
  }
})

// ── Status check ────────────────────────────────────────────────────────

/**
 * Check if the auto-executor is currently running a task.
 */
export function isExecutorBusy(): boolean {
  return currentProcess !== null && currentTaskId !== null
}

export * as AutoExecutor from "./auto-executor"
