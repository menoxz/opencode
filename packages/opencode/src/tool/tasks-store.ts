export * as TasksStore from "./tasks-store"

import { Schema } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { ConfigTasks } from "@/config/tasks"
import * as Process from "@/util/process"

/**
 * Task definitions can come from three places. The order below is the authority
 * order: the first source that defines a name wins, so a task declared by the
 * user in opencode config is never shadowed by an agent-written store entry.
 */
export type Source = "config" | "workspace" | "store"
export const SOURCES: readonly Source[] = ["config", "workspace", "store"]

const decodeStore = Schema.decodeUnknownSync(ConfigTasks.Map)

/** Agent-owned definitions. Kept in the Map shape so it reads like any other source. */
export const storePath = (directory: string) => path.join(directory, ".opencode", "tasks.json")

/** Sanitized so a task name can never escape the log directory. */
export const logPath = (directory: string, name: string) =>
  path.join(directory, ".opencode", "tasks-logs", `${name.replace(/[^a-zA-Z0-9._-]/g, "_")}.log`)

export interface Entry {
  name: string
  task: ConfigTasks.Info
  source: Source
}

/** Merge the three definition sources into one name -> entry view. */
export function merge(sources: Partial<Record<Source, ConfigTasks.Map>>): Map<string, Entry> {
  const out = new Map<string, Entry>()
  for (const source of SOURCES)
    for (const [name, task] of Object.entries(sources[source] ?? {})) if (!out.has(name)) out.set(name, { name, task, source })
  return out
}

/** A malformed or absent store is treated as empty rather than fatal. */
export async function readStore(directory: string): Promise<ConfigTasks.Map> {
  const text = await fs.readFile(storePath(directory), "utf8").catch(() => undefined)
  if (!text) return {}
  try {
    return decodeStore(JSON.parse(text))
  } catch {
    return {}
  }
}

export async function writeStore(directory: string, store: ConfigTasks.Map): Promise<void> {
  const file = storePath(directory)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(store, null, 2)}\n`, "utf8")
}

/**
 * Background runs started by THIS server process. PIDs are deliberately not
 * persisted: a PID only identifies something for the lifetime of its parent.
 */
export interface Run {
  pid: number
  name: string
  command: string
  startedAt: number
  logFile: string
}

const runs = new Map<string, Map<string, Run>>()
const scope = (directory: string) => path.resolve(directory)

export function recordRun(directory: string, run: Run): void {
  const bucket = runs.get(scope(directory)) ?? new Map<string, Run>()
  bucket.set(run.name, run)
  runs.set(scope(directory), bucket)
}

export const getRun = (directory: string, name: string): Run | undefined => runs.get(scope(directory))?.get(name)

export function clearRun(directory: string, name: string): void {
  runs.get(scope(directory))?.delete(name)
}

export const listRuns = (directory: string): Run[] => [...(runs.get(scope(directory))?.values() ?? [])]

/** EPERM means the PID exists but belongs to another user; that still counts as alive. */
export function isAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Last non-empty lines of a run's log, for the `get`/`stop` responses. */
export async function tailLog(run: Run, lines = 15): Promise<string> {
  const text = await fs.readFile(run.logFile, "utf8").catch(() => "")
  const kept = text.split(/\r?\n/).filter((line) => line.length > 0)
  return kept.slice(-lines).join("\n")
}

/**
 * Start a task as a long-lived background process.
 *
 * The process is detached on POSIX so it gets its own process group; on Windows
 * it is left in the current tree and stopped with `taskkill /T`, which walks
 * only the descendants of the PID we recorded.
 */
export async function spawnBackground(opts: {
  name: string
  command: string
  shell?: string
  cwd: string
  env: NodeJS.ProcessEnv
  logFile: string
}): Promise<Run> {
  await fs.mkdir(path.dirname(opts.logFile), { recursive: true })
  const out = await fs.open(opts.logFile, "w")
  const child = spawn(opts.command, {
    shell: opts.shell ?? true,
    cwd: opts.cwd,
    env: opts.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", out.fd, out.fd],
  })
  child.unref()
  await out.close()
  return { pid: child.pid ?? -1, name: opts.name, command: opts.command, startedAt: Date.now(), logFile: opts.logFile }
}

/**
 * Shared by 'run background=true' and 'restart': resolve the task's shell, cwd
 * and env, then spawn it as a tracked background process.
 */
export async function spawnTaskBackground(opts: {
  directory: string
  name: string
  task: ConfigTasks.Info
  defaultShell?: string
}): Promise<Run> {
  return spawnBackground({
    name: opts.name,
    command: opts.task.command,
    shell: opts.task.shell ?? opts.defaultShell,
    cwd: opts.task.cwd ? path.resolve(opts.directory, opts.task.cwd) : opts.directory,
    env: { ...process.env, ...(opts.task.env ?? {}) },
    logFile: logPath(opts.directory, opts.name),
  })
}

/**
 * Stop a process this server started. Only the recorded PID is ever signalled,
 * and on Windows only that PID's own descendants are taken down.
 */
export async function stopRun(run: Run): Promise<{ stopped: boolean; detail: string }> {
  if (!isAlive(run.pid)) return { stopped: false, detail: `pid ${run.pid} is already gone` }
  if (process.platform === "win32") {
    const result = await Process.run(["taskkill", "/PID", String(run.pid), "/T", "/F"], { nothrow: true })
    return { stopped: result.code === 0, detail: `taskkill /PID ${run.pid} /T /F (exit ${result.code})` }
  }
  try {
    process.kill(-run.pid, "SIGTERM")
  } catch {
    process.kill(run.pid, "SIGTERM")
  }
  return { stopped: true, detail: `SIGTERM to process group ${run.pid}` }
}
