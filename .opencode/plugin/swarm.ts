// Agent Swarm — orchestration plugin.
// Auto-discovered by opencode from `.opencode/plugin/` (no config entry needed).
// Tools:
//   swarm_plan     — record + validate the decomposition (manifest)
//   swarm_dispatch — execute tasks as parallel worker sessions (`opencode run --headless`)
//   swarm_status   — monitor a run (or list all runs)
//   swarm_report   — aggregate per-task results into a final markdown report

import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { tool, type Plugin } from "@opencode-ai/plugin"
import {
  SWARM_DIR,
  aggregateRun,
  buildWaves,
  fileConflicts,
  formatDuration,
  makeRunId,
  manifestPath,
  parseHeadlessResult,
  readManifest,
  readTaskResults,
  reportPath,
  runDir,
  validateTasks,
  writeManifest,
  writeTaskResult,
  type SwarmManifest,
  type SwarmTask,
  type TaskResult,
} from "./swarm-lib.js"

const TRIGGER_URL = "http://127.0.0.1:8645/webhook/swarm"
const DEFAULT_TIMEOUT_S = 600

const taskSchema = tool.schema.object({
  id: tool.schema.string().describe("unique task id, [a-zA-Z0-9_-], no spaces"),
  agent: tool.schema
    .string()
    .default("swarm-worker")
    .describe("agent type to run this task with (swarm-worker, explore, general, debugger, qa, ...)"),
  prompt: tool.schema.string().describe("self-contained instructions for the worker (>= 20 chars)"),
  depends_on: tool.schema.array(tool.schema.string()).optional().describe("task ids that must finish first"),
  files: tool.schema.array(tool.schema.string()).optional().describe("workspace files this task owns/creates"),
  timeout_s: tool.schema.number().int().min(30).max(3600).optional().describe("per-task timeout in seconds"),
})

// ── binary resolution ─────────────────────────────────────────────────

function resolveBinary(): string {
  const fromEnv = process.env.OPENCODE_BIN
  if (fromEnv) return fromEnv
  const exe = process.execPath
  if (/opencode/i.test(path.basename(exe))) return exe
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sibling = path.join(here, "..", "..", "dist", "bin", process.platform === "win32" ? "opencode.exe" : "opencode")
  if (existsSync(sibling)) return sibling
  return "opencode"
}

// ── worker execution ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runWorker(opts: {
  binary: string
  worktree: string
  runId: string
  task: SwarmTask
  abort: AbortSignal
}): Promise<TaskResult> {
  const { binary, worktree, runId, task, abort } = opts
  const startedAt = Date.now()
  const timeoutMs = (task.timeout_s ?? DEFAULT_TIMEOUT_S) * 1000

  const proc = Bun.spawn({
    cmd: [binary, "run", "--agent", task.agent, "--headless", "--dir", worktree, "--title", `swarm:${runId}:${task.id}`],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    cwd: worktree,
    env: {
      ...process.env,
      SWARM_RUN_ID: runId,
      SWARM_TASK_ID: task.id,
      SWARM_AGENT: task.agent,
      SWARM_WORKTREE: worktree,
    },
  })
  proc.stdin.write(task.prompt)
  proc.stdin.end()

  const collect = (async () => {
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    return { out, err }
  })()

  const aborted = new Promise<"aborted">((resolve) => {
    if (abort.aborted) return resolve("aborted")
    abort.addEventListener("abort", () => resolve("aborted"), { once: true })
  })

  const outcome = await Promise.race([
    collect.then(() => "done" as const),
    sleep(timeoutMs).then(() => "timeout" as const),
    aborted,
  ])

  if (outcome !== "done") {
    proc.kill()
    const { err } = await collect.catch(() => ({ out: "", err: "failed to read worker output" }))
    return {
      task_id: task.id,
      agent: task.agent,
      status: outcome === "timeout" ? "timeout" : "error",
      exit_code: null,
      duration_ms: Date.now() - startedAt,
      summary: "",
      error: outcome === "timeout" ? `worker timed out after ${timeoutMs / 1000}s` : "worker aborted by orchestrator",
      diffs: [],
    }
  }

  const { out, err } = await collect
  const parsed = parseHeadlessResult(out)
  return {
    task_id: task.id,
    agent: task.agent,
    status: parsed.success ? "success" : "failed",
    exit_code: proc.exitCode ?? null,
    duration_ms: Date.now() - startedAt,
    summary: parsed.summary,
    error: parsed.error ?? (err.trim() ? err.slice(0, 2000) : undefined),
    diffs: parsed.diffs,
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]
      await fn(item)
    }
  })
  await Promise.all(runners)
}

// ── observability ─────────────────────────────────────────────────────

/** Best-effort webhook to the opencode-trigger daemon (:8645), never blocks. */
function notifyTrigger(payload: Record<string, unknown>): void {
  void fetch(TRIGGER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {})
}

async function listRuns(worktree: string): Promise<Array<{ run_id: string; mission: string; created_at: string }>> {
  const root = path.join(worktree, SWARM_DIR)
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const runs = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifest = await readManifest(path.join(root, entry.name))
      if (manifest) runs.push({ run_id: entry.name, mission: manifest.mission, created_at: manifest.created_at })
    }
    return runs.sort((a, b) => b.run_id.localeCompare(a.run_id))
  } catch {
    return []
  }
}

function resultRow(task: SwarmTask, result: TaskResult | undefined): string {
  if (!result) return `- ${task.id}: pending`
  const status = result.status === "success" ? "✅ success" : `❌ ${result.status}`
  return `- ${task.id} [${task.agent}]: ${status} (${formatDuration(result.duration_ms)})`
}

// ── plugin ────────────────────────────────────────────────────────────

export default (async () => {
  return {
    tool: {
      swarm_plan: tool({
        description:
          "Agent Swarm: record and validate the decomposition of a mission into parallel tasks. " +
          "Writes .swarm/<run_id>/manifest.json and returns the run_id plus dependency waves. " +
          "Call this BEFORE swarm_dispatch, then pass the run_id to swarm_dispatch.",
        args: {
          mission: tool.schema.string().describe("one-line statement of the mission"),
          tasks: tool.schema.array(taskSchema),
          run_id: tool.schema.string().optional().describe("explicit run id (default: auto-generated)"),
        },
        execute: async ({ mission, tasks, run_id }, ctx) => {
          const errors = validateTasks(tasks)
          if (errors.length > 0) {
            return { title: "swarm_plan: invalid", output: `Task list is invalid:\n${errors.map((e) => `- ${e}`).join("\n")}` }
          }
          const waves = buildWaves(tasks)
          if ("error" in waves) {
            return { title: "swarm_plan: invalid", output: `Cannot schedule tasks: ${waves.error}` }
          }
          const conflicts = fileConflicts(tasks)
          const id = run_id ?? makeRunId()
          const dir = runDir(ctx.worktree, id)
          const manifest: SwarmManifest = {
            run_id: id,
            mission,
            worktree: ctx.worktree,
            created_at: new Date().toISOString(),
            tasks,
          }
          await writeManifest(dir, manifest)
          ctx.metadata({ title: `swarm_plan: ${mission}` })

          const wavesText = waves.waves.map((w, i) => `wave ${i + 1}: ${w.join(", ")}`).join(" | ")
          const warnings = conflicts.map((c) => `⚠️ file conflict: "${c.file}" claimed by both ${c.a} and ${c.b}`)
          return {
            title: `swarm_plan: ${id}`,
            output: [
              `Run ${id} planned (${tasks.length} tasks).`,
              `Schedule: ${wavesText}`,
              ...warnings,
              `Manifest: ${manifestPath(dir)}`,
              "Call swarm_dispatch with this run_id to execute.",
            ].join("\n"),
          }
        },
      }),

      swarm_dispatch: tool({
        description:
          "Agent Swarm: execute the tasks of a planned run as parallel worker sessions " +
          "(one `opencode run --headless` subprocess per task, wave by wave respecting dependencies). " +
          "Writes one result JSON + markdown per task under .swarm/<run_id>/results/ and notifies the trigger daemon on :8645.",
        args: {
          run_id: tool.schema.string().describe("run id returned by swarm_plan"),
          concurrency: tool.schema.number().int().min(1).max(8).default(3).describe("max parallel workers"),
        },
        execute: async ({ run_id, concurrency }, ctx) => {
          const dir = runDir(ctx.worktree, run_id)
          const manifest = await readManifest(dir)
          if (!manifest) {
            return { title: "swarm_dispatch: missing", output: `No manifest for run "${run_id}". Call swarm_plan first.` }
          }
          const waves = buildWaves(manifest.tasks)
          if ("error" in waves) return { title: "swarm_dispatch: failed", output: waves.error }

          const binary = resolveBinary()
          const startedAt = Date.now()
          const log: string[] = []
          const final: TaskResult[] = []

          for (const [waveIndex, wave] of waves.waves.entries()) {
            const waveTasks = wave.map((id) => manifest.tasks.find((t) => t.id === id)!).filter(Boolean)
            const waveStart = Date.now()
            const results: TaskResult[] = []
            await pool(waveTasks, concurrency, async (task) => {
              const result = await runWorker({ binary, worktree: ctx.worktree, runId: run_id, task, abort: ctx.abort })
              await writeTaskResult(dir, result)
              results.push(result)
              notifyTrigger({ run_id, task_id: task.id, status: result.status, agent: task.agent, mission: manifest.mission })
            })
            final.push(...results)
            log.push(
              `wave ${waveIndex + 1}: ${waveTasks.length} task(s) → ${results.filter((r) => r.status === "success").length} ok in ${formatDuration(Date.now() - waveStart)}`,
            )
          }

          const failed = final.filter((r) => r.status !== "success")
          const lines = [
            `Run ${run_id} finished in ${formatDuration(Date.now() - startedAt)} — ${final.filter((r) => r.status === "success").length}/${final.length} tasks succeeded.`,
            ...log,
            "",
            ...final.map((r) => resultRow(manifest.tasks.find((t) => t.id === r.task_id)!, r)),
            "",
            ...(failed.length > 0
              ? ["Failed tasks:", ...failed.map((r) => `- ${r.task_id}: ${r.error ?? "no error detail"}`)]
              : ["All tasks succeeded."]),
            `Results: ${dir}/results/ — Call swarm_report with run_id "${run_id}" to aggregate.`,
          ]
          ctx.metadata({ title: `swarm_dispatch: ${run_id}` })
          return { title: `swarm_dispatch: ${run_id}`, output: lines.join("\n") }
        },
      }),

      swarm_status: tool({
        description: "Agent Swarm: show the state of one run (per-task status, durations) or list all runs in the worktree.",
        args: {
          run_id: tool.schema.string().optional().describe("run id to inspect (omit to list all runs)"),
        },
        execute: async ({ run_id }, ctx) => {
          if (!run_id) {
            const runs = await listRuns(ctx.worktree)
            if (runs.length === 0) return { title: "swarm_status", output: "No swarm runs in this worktree yet." }
            return {
              title: "swarm_status",
              output: ["Swarm runs:", ...runs.map((r) => `- ${r.run_id} — ${r.mission} (${r.created_at})`)].join("\n"),
            }
          }
          const dir = runDir(ctx.worktree, run_id)
          const manifest = await readManifest(dir)
          if (!manifest) return { title: "swarm_status", output: `No manifest for run "${run_id}".` }
          const results = await readTaskResults(dir)
          const done = manifest.tasks.filter((t) => results[t.id]).length
          return {
            title: `swarm_status: ${run_id}`,
            output: [
              `Run ${run_id} — ${manifest.mission}`,
              `progress: ${done}/${manifest.tasks.length}`,
              ...manifest.tasks.map((t) => resultRow(t, results[t.id])),
            ].join("\n"),
          }
        },
      }),

      swarm_report: tool({
        description:
          "Agent Swarm: aggregate the results of a finished run into the final markdown report " +
          "(.swarm/<run_id>/report.md) and return it for the orchestrator to validate and integrate.",
        args: {
          run_id: tool.schema.string().describe("run id to aggregate"),
        },
        execute: async ({ run_id }, ctx) => {
          const dir = runDir(ctx.worktree, run_id)
          const manifest = await readManifest(dir)
          if (!manifest) return { title: "swarm_report: missing", output: `No manifest for run "${run_id}".` }
          const results = await readTaskResults(dir)
          const report = aggregateRun(manifest, results)
          await Bun.write(reportPath(dir), report)
          ctx.metadata({ title: `swarm_report: ${run_id}` })
          return { title: `swarm_report: ${run_id}`, output: report }
        },
      }),
    },
  }
}) satisfies Plugin
