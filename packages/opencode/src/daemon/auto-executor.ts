import { Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { spawn, type ChildProcess } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { writeNotification } from "./notifications"
import { listPendingTasks, markTaskDone, type TaskItem } from "./trigger-handler"
import { autoCommit, hasUncommittedChanges, type CommitResult, type DiffInfo } from "./auto-commit"
import { isPRTrigger, createPR, pushBranchOnly } from "./auto-pr"
import { storeLearning, findLearningsByTaskId } from "./auto-memory"

const log = Log.create({ service: "daemon.auto-executor" })

// ── Configuration ───────────────────────────────────────────────────────

const TASK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max per task
const MAX_RETRIES = 3 // Give up after this many failed attempts
const BINARY_HEALTH_TIMEOUT_MS = 5000
const BINARY_HEALTH_CACHE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Type for the headless result ─────────────────────────────────────────

export interface HeadlessResult {
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
  diffs: Array<DiffInfo>
  agent: string | null
  model: string | null
}

// ── State tracking ──────────────────────────────────────────────────────

let currentProcess: ChildProcess | null = null
let currentTaskId: string | null = null
let lastVerifiedBinary: string | null = null
let lastVerifiedTimestamp = 0

// ── Async subprocess helper ───────────────────────────────────────────────

/**
 * Spawn a shell command and capture stdout/stderr/exitCode.
 * Never rejects — always resolves with a result object.
 */
function execAsync(
  cmd: string,
  opts: { cwd: string; timeout?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, [], {
      cwd: opts.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString()))
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()))

    let timedOut = false
    const timer = opts.timeout
      ? setTimeout(() => {
          timedOut = true
          try { proc.kill("SIGTERM") } catch { /* best-effort */ }
        }, opts.timeout)
      : undefined

    const cleanup = () => { if (timer) clearTimeout(timer) }

    proc.on("exit", (exitCode) => {
      cleanup()
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode: timedOut ? -1 : (exitCode ?? -1),
      })
    })
    proc.on("error", (err) => {
      cleanup()
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: err.message,
        exitCode: -1,
      })
    })
  })
}

/**
 * Safe Effect wrapper around execAsync that absorbs errors into a fallback.
 * Returns Effect<..., never> so it composes cleanly inside Effect.gen.
 */
function execSafe(
  cmd: string,
  opts: { cwd: string; timeout?: number },
): Effect.Effect<{ stdout: string; stderr: string; exitCode: number }> {
  return Effect.promise(() => execAsync(cmd, opts)).pipe(
    Effect.option,
    Effect.map((opt) => opt._tag === "Some" ? opt.value : { stdout: "", stderr: "", exitCode: -1 }),
  )
}

// ── Repo context helpers ─────────────────────────────────────────────────

interface RepoContext {
  recentCommits: string
  typecheckStatus: string
  uncommittedChanges: boolean
}

function getRepoContext(cwd: string): Effect.Effect<RepoContext> {
  return Effect.gen(function* () {
    const ctx: RepoContext = {
      recentCommits: "(could not read git log)",
      typecheckStatus: "(could not run typecheck)",
      uncommittedChanges: false,
    }

    // Git log — best effort
    const logResult = yield* execSafe("git log --oneline -5", { cwd, timeout: 5000 })
    if (logResult.exitCode === 0 && logResult.stdout) {
      ctx.recentCommits = logResult.stdout.trim()
    }

    // Uncommitted changes — best effort (sync call is fine inside Effect.gen)
    try {
      ctx.uncommittedChanges = hasUncommittedChanges(cwd)
    } catch { /* best-effort */ }

    // Check if package.json exists and has a typecheck script
    try {
      const pkgPath = path.join(cwd, "package.json")
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
        if (pkg.scripts?.typecheck) {
          const tcResult = yield* execSafe("bun typecheck", { cwd, timeout: 30000 })
          if (tcResult.exitCode === 0) {
            ctx.typecheckStatus = "typecheck passes (no errors)"
          } else {
            ctx.typecheckStatus = `typecheck FAILED:\n${(tcResult.stderr || tcResult.stdout).slice(0, 1000)}`
          }
        } else {
          ctx.typecheckStatus = "(no typecheck script in package.json)"
        }
      } else {
        ctx.typecheckStatus = "(no package.json found)"
      }
    } catch { /* best-effort */ }

    return ctx
  })
}

// ── Prompt builder ──────────────────────────────────────────────────────

function buildAutoPrompt(task: TaskItem): Effect.Effect<string> {
  return Effect.gen(function* () {
    const payload = task.payload as Record<string, unknown> | undefined
    const repo = (payload?.repo as string) ?? ""
    const action = (payload?.action as string) ?? "process"
    const description = (payload?.description as string) ?? ""
    const repoDir = (payload?.local_dir as string) || process.cwd()

    const parts: string[] = [
      "You are processing an autonomous task for the opencode daemon.",
      `Task source: ${task.source}`,
      `Task ID: ${task.triggerId}`,
      "",
    ]

    if (repo) parts.push(`Repository: ${repo}`)
    if (action) parts.push(`Action: ${action}`)

    // ── Previous failure context ─────────────────────────────────────────
    const failures = findLearningsByTaskId(task.triggerId)
    const prevFailures = failures.filter((f) => f.tags.includes("failed"))
    if (prevFailures.length > 0) {
      parts.push("")
      parts.push("⚠️ Previous attempts for this task have FAILED:")
      for (const f of prevFailures.slice(0, 3)) {
        parts.push(`  [${f.timestamp}] ${f.summary}`)
        if (f.diffs.length > 0) {
          parts.push(`  Last changed files: ${f.diffs.map((d) => d.file).join(", ")}`)
        }
      }
      parts.push("  Try a different approach. Run typecheck before committing.")
      parts.push("")
    }

    // ── Repo context ─────────────────────────────────────────────────────
    const repoCtx = yield* getRepoContext(repoDir)
    parts.push("── Repository state ──")
    parts.push(repoCtx.recentCommits)
    parts.push("")
    parts.push(`Typecheck: ${repoCtx.typecheckStatus}`)
    parts.push(`Uncommitted changes: ${repoCtx.uncommittedChanges ? "yes" : "no"}`)
    parts.push("")

    // ── Pending tasks context ────────────────────────────────────────────
    const allPending = listPendingTasks()
    const otherPending = allPending.filter((t) => t.triggerId !== task.triggerId)
    if (otherPending.length > 0) {
      parts.push(`There are ${otherPending.length} other pending task(s) in the queue:`)
      for (const t of otherPending.slice(0, 5)) {
        const tDesc = (t.payload as Record<string, unknown> | undefined)?.description as string | undefined
        parts.push(`  - [${t.source}] ${tDesc || t.triggerId}`)
      }
      parts.push("")
    }

    // ── Context-specific instructions ────────────────────────────────────
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
  })
}

// ── Task eligibility ────────────────────────────────────────────────────

function countFailures(task: TaskItem): number {
  return findLearningsByTaskId(task.triggerId).filter((f) => f.tags.includes("failed")).length
}

function isEligible(task: TaskItem): boolean {
  const failures = countFailures(task)
  if (failures >= MAX_RETRIES) {
    log.warn("Task exceeded max retries, skipping", { taskId: task.triggerId, source: task.source, failures })
    return false
  }
  return true
}

// ── Find the opencode binary ────────────────────────────────────────────

/**
 * Check whether a file path is actually executable by child_process.spawn.
 * On Windows, only .exe, .cmd, .bat, .com are natively executable.
 */
function isExecutable(candidate: string): boolean {
  if (!fs.existsSync(candidate)) return false
  if (process.platform !== "win32") return true
  const ext = path.extname(candidate).toLowerCase()
  return ext === ".exe" || ext === ".cmd" || ext === ".bat" || ext === ".com"
}

/**
 * Find the opencode binary that child_process.spawn can actually execute.
 * Priority: running process → dev build → PATH (.exe → .cmd).
 */
function findBinary(): string | null {
  const argv0 = process.argv[0]
  if (argv0 && isExecutable(argv0) && (argv0.endsWith("opencode.exe") || argv0.endsWith("opencode"))) {
    return path.resolve(argv0)
  }

  // Dev build takes priority
  try {
    const devPath = path.resolve(__dirname, "..", "..", "..", "..", "dist", "bin", "opencode.exe")
    if (isExecutable(devPath)) return devPath
  } catch { /* __dirname unavailable */ }

  // Search PATH — only accept natively executable extensions on Windows
  const envPath = process.env.PATH || ""
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue
    for (const name of ["opencode.exe", "opencode.cmd", "opencode.bat"]) {
      const candidate = path.join(dir, name)
      if (isExecutable(candidate)) return candidate
    }
  }

  return null
}

// ── Binary health verification ────────────────────────────────────────────

/**
 * Verify that the opencode binary responds correctly by running `--version`.
 * Caches the result to avoid re-checking on every task within the cache interval.
 */
function verifyBinary(binaryPath: string): boolean {
  const now = Date.now()
  if (lastVerifiedBinary === binaryPath && now - lastVerifiedTimestamp < BINARY_HEALTH_CACHE_INTERVAL_MS) {
    return true
  }

  try {
    const { spawnSync } = require("node:child_process")
    const result = spawnSync(binaryPath, ["--version"], {
      timeout: BINARY_HEALTH_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    const stdout = (result.stdout ?? "").trim()
    const ok = result.status === 0 && stdout.toLowerCase().includes("opencode")

    if (ok) {
      log.info("Binary health check passed", { binary: binaryPath, version: stdout })
      lastVerifiedBinary = binaryPath
      lastVerifiedTimestamp = now
    } else {
      log.error("Binary health check FAILED", {
        binary: binaryPath,
        exitCode: result.status,
        stdout,
        stderr: (result.stderr ?? "").trim(),
      })
    }

    return ok
  } catch (err) {
    log.error("Binary health check threw", { binary: binaryPath, error: String(err) })
    return false
  }
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

    if (!verifyBinary(binary)) {
      log.error("Binary health check failed, aborting auto-execution", { binary })
      resolve({ result: null, exitCode: null, rawOutput: "Binary health check failed", timedOut: false })
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

// ── Typecheck validation ────────────────────────────────────────────────

/**
 * Run `bun typecheck` in the given directory.
 * Returns null if it passes, or the error output if it fails.
 */
function runTypecheck(cwd: string): Effect.Effect<string | null> {
  return Effect.gen(function* () {
    const pkgPath = path.join(cwd, "package.json")
    if (!fs.existsSync(pkgPath)) return null
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
    if (!pkg.scripts?.typecheck) return null

    const result = yield* execSafe("bun typecheck", { cwd, timeout: 60000 })

    if (result.exitCode === 0) return null
    return (result.stderr || result.stdout).slice(0, 1000)
  })
}

// ── Post-execution pipeline helpers ─────────────────────────────────────

interface PipelineResult {
  committed: boolean
  commitHash?: string
  commitMessage?: string
  prUrl?: string
  learningsStored: boolean
  validationError?: string // typecheck failure message
}

/**
 * Run the post-execution pipeline: validate → commit → memory → PR.
 */
const runPostPipeline = Effect.fnUntraced(function* (
  task: TaskItem,
  result: HeadlessResult,
  repoDir: string,
) {
  const pipeline: PipelineResult = {
    committed: false,
    learningsStored: false,
  }

  const payload = task.payload as Record<string, unknown> | undefined
  const hasDiffs = result.diffs && result.diffs.length > 0

  // ── Step 0: Typecheck validation ────────────────────────────────────
  if (hasDiffs) {
    const tcErr = yield* runTypecheck(repoDir)
    if (tcErr) {
      pipeline.validationError = tcErr
      log.warn("Post-pipeline: typecheck FAILED, skipping commit", { repoDir })
      // Store the failure for feedback loop
      writeNotification("task_escalated", "Typecheck failed after headless execution", tcErr.slice(0, 500), {
        taskId: task.triggerId,
        source: task.source,
      })
      return pipeline
    }
  }

  // ── Step 1: Auto-commit ─────────────────────────────────────────────
  let commit: CommitResult | null = null
  if (hasDiffs && hasUncommittedChanges(repoDir)) {
    log.info("Post-pipeline: typecheck OK, auto-committing changes", { repoDir })
    commit = autoCommit(repoDir, result.diffs)
    if (commit) {
      pipeline.committed = true
      pipeline.commitHash = commit.hash
      pipeline.commitMessage = commit.message
      log.info("Post-pipeline: committed", { hash: commit.hash, files: commit.filesChanged })
    }
  } else {
    log.info("Post-pipeline: no uncommitted changes to commit")
  }

  // ── Step 2: Store learnings ──────────────────────────────────────────
  try {
    storeLearning({
      source: task.source,
      taskId: task.triggerId,
      summary: commit?.message ?? `Processed ${result.diffs.length} file(s)`,
      filesChanged: result.diffs.length,
      diffs: result.diffs,
      commitHash: commit?.hash,
      commitMessage: commit?.message,
      model: result.model,
      tags: [task.source, "auto-executed", ...(commit ? ["committed"] : [])],
    })
    pipeline.learningsStored = true
  } catch (err) {
    log.warn("Post-pipeline: failed to store learnings", { error: String(err) })
  }

  // ── Step 3: Push / PR (only for GitHub PR triggers) ─────────────────
  if (isPRTrigger(payload)) {
    if (commit) {
      log.info("Post-pipeline: PR trigger detected, creating PR...")
      const pr = createPR(
        repoDir,
        commit.message,
        `Auto-generated from opencode headless task.\n\nTrigger: ${task.triggerId}\nSession: ${result.sessionID}\n\nChanges:\n${formatDiffSummary(result.diffs)}`,
      )
      if (pr) {
        pipeline.prUrl = pr.url
        log.info("Post-pipeline: PR created", { url: pr.url })
      }
    } else {
      // If no commit was needed, still push the branch
      const pushed = pushBranchOnly(repoDir)
      if (pushed) log.info("Post-pipeline: branch pushed")
    }
  }

  return pipeline
})

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
  const prompt = yield* buildAutoPrompt(task)

  const { result, exitCode, rawOutput, timedOut } = yield* Effect.promise(() =>
    spawnHeadless(task, prompt, repoDir),
  )

  // Extract info from structured result or fall back to exit code
  const success = result?.success ?? (exitCode === 0 && !timedOut)
  const errorMessage = result?.error ?? (timedOut ? "Task timed out" : exitCode !== 0 ? `Exit code ${exitCode}` : null)
  const diffSummary = result ? formatDiffSummary(result.diffs ?? []) : ""

  let pipelineResult: PipelineResult | null = null

  if (success && result) {
    // Run post-execution pipeline (validate → commit → memory → PR)
    pipelineResult = yield* runPostPipeline(task, result, repoDir)

    // If typecheck validation failed, escalate but don't mark done
    if (pipelineResult.validationError) {
      writeNotification("task_escalated", "Typecheck failed after changes", pipelineResult.validationError.slice(0, 500), {
        taskId: task.triggerId,
        source: task.source,
      })
      // Store failure learning for feedback loop
      try {
        const failureCount = countFailures(task) + 1
        storeLearning({
          source: task.source,
          taskId: task.triggerId,
          summary: `Typecheck failed: ${pipelineResult.validationError.slice(0, 200)}`,
          filesChanged: result.diffs.length,
          diffs: result.diffs,
          model: result.model,
          tags: ["failed", "typecheck", "auto-executed", `attempt-${failureCount}`],
        })
      } catch { /* best-effort */ }
      log.warn("Typecheck validation FAILED, task not committed", { taskId: task.triggerId })
      // Do NOT mark task done — it will be retried
    } else {
      const notificationType = pipelineResult.committed ? "task_committed" : "task_success"
      const notificationSummary = pipelineResult.committed
        ? `Task committed: ${pipelineResult.commitHash?.slice(0, 8)}`
        : "Task processed successfully"

      const details = [
        diffSummary,
        pipelineResult.committed ? `Commit: ${pipelineResult.commitHash} (${pipelineResult.commitMessage})` : "",
        result?.summary ? `Summary: ${JSON.stringify(result.summary)}` : "",
        result?.model ? `Model: ${result.model}` : "",
        pipelineResult.prUrl ? `PR: ${pipelineResult.prUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n")

      writeNotification(notificationType, notificationSummary, details, {
        taskId: task.triggerId,
        source: task.source,
      })
      markTaskDone(task.triggerId)
      log.info("Auto-execution SUCCESS", {
        taskId: task.triggerId,
        diffs: result?.diffs?.length ?? 0,
        committed: pipelineResult.committed,
        prUrl: pipelineResult.prUrl,
      })
    }
  } else if (success) {
    // Success by exit code but no structured result (no diffs = no pipeline needed)
    writeNotification("task_success", "Task processed successfully (exit code)", "", {
      taskId: task.triggerId,
      source: task.source,
    })
    markTaskDone(task.triggerId)
    log.info("Auto-execution SUCCESS (exit code)", { taskId: task.triggerId })
  } else {
    const noteType = timedOut ? "task_escalated" : "task_failure"
    writeNotification(noteType, errorMessage ?? "Task failed", rawOutput.slice(0, 2000), {
      taskId: task.triggerId,
      source: task.source,
    })

    // Store failure as learning entry for feedback loop
    const failureCount = countFailures(task) + 1
    try {
      storeLearning({
        source: task.source,
        taskId: task.triggerId,
        summary: errorMessage ?? "Task failed",
        filesChanged: 0,
        diffs: [],
        model: null,
        tags: ["failed", "auto-executed", `attempt-${failureCount}`, timedOut ? "timeout" : "error"],
      })
      log.info("Failure stored as learning entry", { taskId: task.triggerId, attempt: failureCount })
    } catch (err) {
      log.warn("Failed to store failure learning", { error: String(err) })
    }

    log.warn("Auto-execution FAILED", { taskId: task.triggerId, error: errorMessage, attempt: failureCount })
  }

  return {
    status: timedOut
      ? "timeout" as const
      : (pipelineResult?.validationError ? "validation_failed" as const : success ? "success" as const : "failure" as const),
    taskId: task.triggerId,
    summary: success
      ? pipelineResult?.validationError
        ? `Typecheck: ${pipelineResult.validationError.slice(0, 100)}`
        : pipelineResult?.committed
          ? `Committed: ${pipelineResult.commitHash?.slice(0, 8)}`
          : "Task completed"
      : errorMessage ?? "Task failed",
    filesChanged: result?.diffs?.length ?? 0,
    committed: pipelineResult?.committed ?? false,
    prUrl: pipelineResult?.prUrl,
  }
})

export function isExecutorBusy(): boolean {
  return currentProcess !== null && currentTaskId !== null
}

export * as AutoExecutor from "./auto-executor"
