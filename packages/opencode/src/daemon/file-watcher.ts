import { Effect } from "effect"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "daemon.file-watcher" })

/**
 * Cooldown window in ms for the same file to avoid repeated triggers.
 */
const COOLDOWN_MS = 5_000

const recentChanges = new Map<string, number>()

/**
 * Track a file change with debounce.
 */
export function trackChange(file: string): boolean {
  const last = recentChanges.get(file)
  const now = Date.now()
  if (last && now - last < COOLDOWN_MS) return false
  recentChanges.set(file, now)
  return true
}

/**
 * Clean up stale entries from the cooldown map.
 */
export function cleanCooldowns(): void {
  const now = Date.now()
  for (const [file, time] of recentChanges) {
    if (now - time > COOLDOWN_MS * 2) recentChanges.delete(file)
  }
}

/**
 * File-watcher subscriber placeholder.
 *
 * In the current architecture, FileWatcher events are published on the
 * per-instance Bus, which isn't available to the daemon (which runs with
 * `instance: false`).  When the daemon gains instance context, this
 * module will subscribe to `FileWatcher.Event.Updated` and launch
 * auto-review BackgroundJob sessions on interesting file changes.
 *
 * For now this is a ready-to-wire placeholder — the watch command can
 * enable it by providing a Bus layer to the daemon context.
 */
export const subscribeFileChanges = Effect.fnUntraced(function* () {
  log.info("File-watcher subscriber: requires instance context — skipping")
})

export * as DaemonFileWatcher from "./file-watcher"
