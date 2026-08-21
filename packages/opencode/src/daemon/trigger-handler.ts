import * as fs from "node:fs"
import * as path from "node:path"
import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { ackTrigger } from "./triggers"

const log = Log.create({ service: "daemon.trigger-handler" })

// ── Task queue ─────────────────────────────────────────────────────────

/**
 * Directory for queued trigger tasks.
 * The next interactive agent session reads from here.
 */
export function taskQueueDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencodev2", "tasks")
}

function queueDir(): string {
  return taskQueueDir()
}

function queueFile(triggerId: string): string {
  const device = triggerId.split(".", 1)[0].toUpperCase()
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(device)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(triggerId) || triggerId === "." || triggerId === ".." || reserved) {
    throw new Error(`Invalid trigger ID: ${JSON.stringify(triggerId)}`)
  }
  return path.join(queueDir(), `${triggerId}.json`)
}

export interface TaskItem {
  triggerId: string
  source: string
  payload: unknown
  receivedAt: string
  status: "pending" | "processing" | "done"
}

const AUTONOMOUS_SOURCES = new Set(["eval-regression"])

export function isTrustedForAutonomousExecution(task: Pick<TaskItem, "source">): boolean {
  return AUTONOMOUS_SOURCES.has(task.source)
}

export function validateAutonomousTask(task: Pick<TaskItem, "source" | "payload">): string | undefined {
  if (!isTrustedForAutonomousExecution(task)) return "Trigger source is not trusted for autonomous execution"
  if (task.payload !== null && (typeof task.payload !== "object" || Array.isArray(task.payload))) return "Trigger payload must be an object"
  if ((task.payload as Record<string, unknown> | null)?.local_dir !== undefined) return "Caller-controlled local_dir is not allowed"
}

/**
 * Write a trigger task to the queue for the next agent session.
 */
export function writeTask(trigger: { id: string; source: string; payload: unknown }): void {
  const dir = queueDir()
  fs.mkdirSync(dir, { recursive: true })

  const task: TaskItem = {
    triggerId: trigger.id,
    source: trigger.source,
    payload: trigger.payload,
    receivedAt: new Date().toISOString(),
    status: "pending",
  }

  fs.writeFileSync(queueFile(trigger.id), JSON.stringify(task, null, 2))
}

/**
 * List all pending tasks from the queue (for agent sessions).
 */
export function listPendingTasks(): TaskItem[] {
  const dir = queueDir()
  if (!fs.existsSync(dir)) return []

  const tasks: TaskItem[] = []
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const task = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as TaskItem
      if (task.status === "pending") tasks.push(task)
    } catch { /* skip corrupt */ }
  }
  return tasks
}

/**
 * Mark a queued task as done.
 */
export function markTaskDone(triggerId: string): void {
  const file = queueFile(triggerId)
  if (!fs.existsSync(file)) return
  try {
    const task = JSON.parse(fs.readFileSync(file, "utf-8")) as TaskItem
    task.status = "done"
    fs.writeFileSync(file, JSON.stringify(task, null, 2))
  } catch { /* best-effort */ }
}

/**
 * Find a specific task by trigger ID.
 */
export function findTask(triggerId: string): TaskItem | null {
  const file = queueFile(triggerId)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as TaskItem
  } catch {
    return null
  }
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Handle a trigger: write it to the task queue and ack it.
 *
 * The actual processing (PR review, file analysis, etc.) is deferred to
 * the next interactive agent session, which reads the task queue and
 * processes each item.
 *
 * This keeps the daemon lightweight and avoids the overhead of spawning
 * full `opencode run` sessions for every trigger.
 */
export const handleTrigger = Effect.fnUntraced(function* (trigger: {
  id: string
  source: string
  payload: unknown
}) {
  log.info("Handling trigger", { id: trigger.id, source: trigger.source })

  try {
    // Write to task queue for the next agent session
    writeTask(trigger)

    // Ack the trigger so it doesn't get picked up again
    const acked = yield* ackTrigger(trigger.id)

    log.info("Trigger handled — queued for next agent session", {
      id: trigger.id,
      acked,
    })
  } catch (error) {
    log.error("Failed to handle trigger", { id: trigger.id, error })
  }
})

/**
 * Handle all pending triggers: read from trigger store, write to queue, ack.
 */
export const handlePendingTriggers = Effect.fnUntraced(function* (
  pending: Array<{ id: string; source: string; payload: unknown }>,
) {
  let handled = 0
  for (const t of pending) {
    yield* handleTrigger(t)
    handled++
  }
  log.info("All pending triggers handled", { count: handled })
})

export * as TriggerHandler from "./trigger-handler"
