// Agent Swarm — pure orchestration helpers.
// No opencode imports: unit-testable with plain bun test.
// Layout of a run:
//   .swarm/<run_id>/manifest.json          mission + tasks (plan phase)
//   .swarm/<run_id>/results/<task_id>.json per-worker result (dispatch phase)
//   .swarm/<run_id>/report.md              aggregated report (aggregation phase)

import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

export const SWARM_DIR = ".swarm"

export type SwarmTask = {
  id: string
  agent: string
  prompt: string
  depends_on?: string[]
  files?: string[]
  timeout_s?: number
}

export type SwarmManifest = {
  run_id: string
  mission: string
  worktree: string
  created_at: string
  tasks: SwarmTask[]
}

export type TaskStatus = "pending" | "running" | "success" | "failed" | "timeout" | "error"

export type TaskResult = {
  task_id: string
  agent: string
  status: Exclude<TaskStatus, "pending" | "running">
  exit_code: number | null
  duration_ms: number
  summary: string
  error?: string
  diffs: unknown[]
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

// ── validation ────────────────────────────────────────────────────────

/** Returns a list of validation errors (empty when the task set is valid). */
export function validateTasks(tasks: SwarmTask[]): string[] {
  const errors: string[] = []
  if (tasks.length === 0) return ["task list is empty"]
  if (tasks.length > 12) errors.push(`too many tasks (${tasks.length}); the swarm supports at most 12`)

  const ids = new Set<string>()
  for (const task of tasks) {
    if (!ID_PATTERN.test(task.id)) errors.push(`task id "${task.id}" is invalid (use [a-zA-Z0-9_-], no spaces)`)
    else if (ids.has(task.id)) errors.push(`duplicate task id "${task.id}"`)
    ids.add(task.id)
    if (!task.agent) errors.push(`task "${task.id}": agent is required`)
    if (!task.prompt || task.prompt.trim().length < 20)
      errors.push(`task "${task.id}": prompt must be at least 20 characters`)
    if (task.timeout_s !== undefined && (task.timeout_s < 30 || task.timeout_s > 3600))
      errors.push(`task "${task.id}": timeout_s must be between 30 and 3600`)
    for (const dep of task.depends_on ?? []) {
      if (!ids.has(dep)) errors.push(`task "${task.id}": depends_on "${dep}" is not a known task id`)
    }
  }
  return errors
}

/** Detect a dependency cycle among task ids. Returns the cycle ids or null. */
export function findCycle(tasks: SwarmTask[]): string[] | null {
  const deps = new Map(tasks.map((t) => [t.id, t.depends_on ?? []]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string, trail: string[]): string[] | null => {
    if (visiting.has(id)) return [...trail.slice(trail.indexOf(id)), id]
    if (visited.has(id)) return null
    visiting.add(id)
    for (const dep of deps.get(id) ?? []) {
      const cycle = visit(dep, [...trail, id])
      if (cycle) return cycle
    }
    visiting.delete(id)
    visited.add(id)
    return null
  }

  for (const task of tasks) {
    const cycle = visit(task.id, [])
    if (cycle) return cycle
  }
  return null
}

/**
 * Group tasks into parallel waves: every task in wave N+1 depends only on
 * tasks from waves <= N. Returns { waves, ordered } or { error } on cycle.
 */
export function buildWaves(tasks: SwarmTask[]): { waves: string[][]; ordered: string[] } | { error: string } {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const indegree = new Map(tasks.map((t) => [t.id, (t.depends_on ?? []).length]))
  const dependents = new Map<string, string[]>(tasks.map((t) => [t.id, []]))
  for (const task of tasks) {
    for (const dep of task.depends_on ?? []) dependents.get(dep)?.push(task.id)
  }

  const waves: string[][] = []
  const ordered: string[] = []
  let frontier = [...indegree.entries()].filter(([, n]) => n === 0).map(([id]) => id)
  while (frontier.length > 0) {
    waves.push(frontier)
    const next = new Set<string>()
    for (const id of frontier) {
      ordered.push(id)
      for (const dep of dependents.get(id) ?? []) {
        indegree.set(dep, (indegree.get(dep) ?? 1) - 1)
        if (indegree.get(dep) === 0) next.add(dep)
      }
    }
    frontier = [...next]
  }
  if (ordered.length !== tasks.length) return { error: `dependency cycle detected: ${findCycle(tasks)?.join(" -> ") ?? "unknown"}` }
  return { waves, ordered }
}

/** Normalize a path for cross-platform conflict comparison. */
function normPath(p: string): string {
  return p.replaceAll("\\", "/").toLowerCase()
}

/** Pairwise file-ownership conflicts between tasks (same file claimed twice). */
export function fileConflicts(tasks: SwarmTask[]): Array<{ a: string; b: string; file: string }> {
  const conflicts: Array<{ a: string; b: string; file: string }> = []
  const owned = new Map<string, string>()
  for (const task of tasks) {
    for (const file of task.files ?? []) {
      const key = normPath(file)
      const prev = owned.get(key)
      if (prev && prev !== task.id) conflicts.push({ a: prev, b: task.id, file })
      else owned.set(key, task.id)
    }
  }
  return conflicts
}

// ── run layout ────────────────────────────────────────────────────────

export function runDir(worktree: string, runId: string): string {
  return path.join(worktree, SWARM_DIR, runId)
}

export function manifestPath(dir: string): string {
  return path.join(dir, "manifest.json")
}

export function taskResultPath(dir: string, taskId: string): string {
  return path.join(dir, "results", `${taskId}.json`)
}

export function resultMdPath(dir: string, taskId: string): string {
  return path.join(dir, "results", `${taskId}.md`)
}

export function reportPath(dir: string): string {
  return path.join(dir, "report.md")
}

export function makeRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 6)
  return `swarm-${stamp}-${rand}`
}

// ── manifest / result IO ──────────────────────────────────────────────

export async function writeManifest(dir: string, manifest: SwarmManifest): Promise<void> {
  await mkdir(path.join(dir, "results"), { recursive: true })
  await writeFile(manifestPath(dir), JSON.stringify(manifest, null, 2), "utf8")
}

export async function readManifest(dir: string): Promise<SwarmManifest | null> {
  try {
    return JSON.parse(await Bun.file(manifestPath(dir)).text()) as SwarmManifest
  } catch {
    return null
  }
}

export async function writeTaskResult(dir: string, result: TaskResult): Promise<void> {
  await writeFile(taskResultPath(dir, result.task_id), JSON.stringify(result, null, 2), "utf8")
  const md = [
    `# Task ${result.task_id} (${result.agent})`,
    "",
    `status: ${result.status} — duration: ${formatDuration(result.duration_ms)} — exit: ${result.exit_code ?? "n/a"}`,
    "",
    "## Summary",
    "",
    result.summary || "_no summary_",
    ...(result.error ? ["", "## Error", "", "```", result.error, "```"] : []),
    "",
  ].join("\n")
  await writeFile(resultMdPath(dir, result.task_id), md, "utf8")
}

export async function readTaskResults(dir: string): Promise<Record<string, TaskResult>> {
  const results: Record<string, TaskResult> = {}
  try {
    for (const file of await readdir(path.join(dir, "results"))) {
      if (!file.endsWith(".json")) continue
      const parsed = JSON.parse(await Bun.file(path.join(dir, "results", file)).text()) as TaskResult
      results[parsed.task_id] = parsed
    }
  } catch {
    // no results yet
  }
  return results
}

/** Parse the single JSON line emitted by `opencode run --headless`. */
export function parseHeadlessResult(stdout: string): {
  success: boolean
  error: string | null
  summary: string
  diffs: unknown[]
} {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    if (!line.trim().startsWith("{")) continue
    try {
      const parsed = JSON.parse(line) as {
        type?: string
        success?: boolean
        error?: string | null
        summary?: string | null
        diffs?: unknown[]
      }
      if (parsed.type === "headless_result") {
        return {
          success: parsed.success === true,
          error: parsed.error ?? null,
          summary: parsed.summary ?? "",
          diffs: parsed.diffs ?? [],
        }
      }
    } catch {
      // keep scanning lines
    }
  }
  return { success: false, error: "worker produced no parseable headless_result", summary: stdout.slice(0, 2000), diffs: [] }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ── aggregation ───────────────────────────────────────────────────────

/** Build the aggregated markdown report for a run from its manifest + results. */
export function aggregateRun(manifest: SwarmManifest, results: Record<string, TaskResult>): string {
  const rows = manifest.tasks.map((task) => {
    const r = results[task.id]
    const status = r ? r.status : "pending"
    const duration = r ? formatDuration(r.duration_ms) : "—"
    const summary = r ? oneLine(r.summary) : "not started"
    return `| ${task.id} | ${task.agent} | ${status} | ${duration} | ${summary} |`
  })

  const done = manifest.tasks.filter((t) => results[t.id]?.status === "success")
  const failed = manifest.tasks.filter((t) => {
    const status = results[t.id]?.status
    return status && status !== "success"
  })

  const lines = [
    `# Swarm Report — ${manifest.mission}`,
    "",
    `run_id: ${manifest.run_id} — worktree: ${manifest.worktree} — created: ${manifest.created_at}`,
    "",
    `## Status`,
    "",
    `- tasks: ${manifest.tasks.length}`,
    `- succeeded: ${done.length}`,
    `- failed/timeout/error: ${failed.length}`,
    "",
    "## Task results",
    "",
    "| id | agent | status | duration | summary |",
    "|----|-------|--------|----------|---------|",
    ...rows,
  ]

  if (failed.length > 0) {
    lines.push("", "## Failures", "")
    for (const task of failed) {
      const r = results[task.id]
      if (!r) continue
      lines.push(`### ${task.id} (${r.status})`, "", "```", r.error ?? r.summary, "```", "")
    }
  }

  lines.push("", "## Instructions for the orchestrator", "",
    "Verify every deliverable claimed by the workers. Fix or re-dispatch what failed. " +
      "Do NOT copy-paste worker output blindly into the final delivery: validate, then integrate.")
  return lines.join("\n")
}

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat
}
