import { Effect } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"

// ── Notification types ──────────────────────────────────────────────────

export type NotificationType =
  | "task_success"
  | "task_failure"
  | "task_escalated"
  | "critical_alert"

export interface DaemonNotification {
  id: string
  type: NotificationType
  taskId?: string
  source?: string
  summary: string
  details: string
  timestamp: string
  acknowledged: boolean
}

// ── Path helpers ────────────────────────────────────────────────────────

function notificationsDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || "C:\\", ".opencode")
  return path.join(base, "opencode", "notifications")
}

function latestNotificationPath(): string {
  return path.join(notificationsDir(), "latest.json")
}

function archivedPath(id: string): string {
  return path.join(notificationsDir(), `notify-${id}.json`)
}

// ── Read ────────────────────────────────────────────────────────────────

/**
 * Read the latest notification (for agent session startup).
 */
export function readLatestNotification(): DaemonNotification | null {
  try {
    if (!fs.existsSync(latestNotificationPath())) return null
    return JSON.parse(fs.readFileSync(latestNotificationPath(), "utf-8")) as DaemonNotification
  } catch {
    return null
  }
}

/**
 * Read all unacknowledged notifications (both latest + any archived ones).
 * Returns most recent first.
 */
export function readUnacknowledged(): DaemonNotification[] {
  const results: DaemonNotification[] = []
  const dir = notificationsDir()
  if (!fs.existsSync(dir)) return results

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const n = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as DaemonNotification
      if (!n.acknowledged) results.push(n)
    } catch { /* skip corrupt */ }
  }

  // Sort by timestamp descending
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return results
}

// ── Write ───────────────────────────────────────────────────────────────

/**
 * Write a notification. Creates both latest (overwrite) and archived copies.
 */
export function writeNotification(
  type: DaemonNotification["type"],
  summary: string,
  details: string,
  meta?: { taskId?: string; source?: string },
): string {
  const dir = notificationsDir()
  fs.mkdirSync(dir, { recursive: true })

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const notification: DaemonNotification = {
    id,
    type,
    summary,
    details,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    ...meta,
  }

  // Write latest (overwrite)
  fs.writeFileSync(latestNotificationPath(), JSON.stringify(notification, null, 2))
  // Write archived
  fs.writeFileSync(archivedPath(id), JSON.stringify(notification, null, 2))

  // Keep max 20 archived notifications
  cleanupArchived(dir)

  return id
}

function cleanupArchived(dir: string): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("notify-") && f.endsWith(".json"))
      .sort()
    // Keep the 20 most recent (by filename which starts with timestamp)
    for (const old of files.slice(0, Math.max(0, files.length - 20))) {
      try { fs.unlinkSync(path.join(dir, old)) } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
}

/**
 * Mark all notifications as acknowledged (called when user has seen them).
 */
export function acknowledgeAll(): void {
  const dir = notificationsDir()
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    try {
      const p = path.join(dir, file)
      const n = JSON.parse(fs.readFileSync(p, "utf-8")) as DaemonNotification
      if (!n.acknowledged) {
        n.acknowledged = true
        fs.writeFileSync(p, JSON.stringify(n, null, 2))
      }
    } catch { /* best-effort */ }
  }
}

export * as Notifications from "./notifications"
