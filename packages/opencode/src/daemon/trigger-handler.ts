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
function queueDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencode", "tasks")
}

function queueFile(triggerId: string): string {
  return path.join(queueDir(), `${triggerId}.json`)
}

export interface TaskItem {
  triggerId: string
  source: string
  payload: unknown
  receivedAt: string
  status: "pending" | "processing" | "done"
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
