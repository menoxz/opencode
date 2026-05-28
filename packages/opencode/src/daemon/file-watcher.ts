import { Effect, Exit, Scope } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { EffectBridge } from "@/effect/bridge"
import { FileWatcher } from "@/file/watcher"
import { publishGlobal } from "@/bus"
import { writeTask } from "./trigger-handler"
import * as fs from "node:fs"
import * as path from "node:path"

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
 * Determine the directory to watch.
 * Priority: OPENCODE_WATCH_DIR env var > current working directory.
 */
function watchDir(): string | null {
  const envDir = process.env.OPENCODE_WATCH_DIR
  if (envDir) {
    if (fs.existsSync(envDir)) return envDir
    log.warn("OPENCODE_WATCH_DIR does not exist", { dir: envDir })
    return null
  }

  try {
    const cwd = process.cwd()
    if (fs.existsSync(cwd)) return cwd
  } catch { /* best-effort */ }

  return null
}

/**
 * Load @parcel/watcher using require() (same pattern as src/file/watcher.ts).
 */
function tryLoadWatcher(): { subscribe: Function; unsubscribe: Function } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("@parcel/watcher") as { subscribe: Function; unsubscribe: Function }
  } catch (err) {
    log.warn("@parcel/watcher not available — file watching disabled", { error: String(err) })
    return null
  }
}

/**
 * Map @parcel/watcher event type to FileWatcher.Event.Updated event type.
 */
const eventTypeMap: Record<string, "add" | "change" | "unlink"> = {
  create: "add",
  update: "change",
  delete: "unlink",
}

/**
 * Inner implementation of the file watcher (as an Effect function for clean
 * generator-based code). Externally wrapped to match the `() => Effect<void>`
 * signature expected by `forkForever`.
 */
const fileWatcherImpl = Effect.fnUntraced(function* () {
  const dir = watchDir()
  if (!dir) {
    log.warn("File watcher: no directory to watch — skipping")
    return
  }

  log.info("Starting file watcher", { dir })

  // Load @parcel/watcher (native binding)
  const pw = tryLoadWatcher()
  if (!pw) {
    log.warn("File watcher: @parcel/watcher not loaded — skipping")
    return
  }

  const bridge = yield* EffectBridge.make()

  // Subscribe to file changes via @parcel/watcher
  const sub = yield* Effect.promise<{ unsubscribe: () => Promise<void> }>(() =>
    pw.subscribe(
      dir,
      (err: Error | null, events: Array<{ type: string; path: string }>) => {
        if (err) {
          log.error("File watcher error", { error: err.message })
          return
        }

        for (const evt of events) {
          const filePath = evt.path

          // Debounce: skip if we've seen this file recently
          if (!trackChange(filePath)) continue

          log.info("File change detected", { file: filePath, event: evt.type })

          // Queue a file-watcher task for the next agent session
          bridge.fork(
            Effect.gen(function* () {
              writeTask({
                id: `fw-${Date.now()}-${path.basename(filePath)}`,
                source: "file-watcher",
                payload: {
                  file: filePath,
                  event: evt.type,
                  directory: dir,
                },
              })

              // Also publish a global bus event for any live subscribers
              const mappedEvent = eventTypeMap[evt.type] ?? "change"
              yield* publishGlobal(FileWatcher.Event.Updated, {
                file: filePath,
                event: mappedEvent,
              })
            }),
          )
        }
      },
      {
        ignore: [
          "node_modules/**",
          ".git/**",
          "dist/**",
          "target/**",
          ".next/**",
          ".cache/**",
          "__pycache__/**",
          "*.log",
          ".DS_Store",
        ],
      },
    ) as Promise<{ unsubscribe: () => Promise<void> }>,
  )

  log.info("File watcher subscribed", { dir })

  // Clean up on daemon shutdown
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => sub.unsubscribe()).pipe(
      Effect.andThen(Effect.sync(() => log.info("File watcher stopped"))),
      Effect.ignore,
    ),
  )

  // Keep alive until the scope is closed (daemon shutdown)
  yield* Effect.never
})

/**
 * Start the file watcher: subscribe to file changes in the workspace directory,
 * queue tasks for interesting changes, and publish global bus events.
 *
 * This is a long-lived task meant to be used with `forkForever` — it runs until
 * the daemon shuts down. Auto-ignores common patterns (node_modules, .git, dist).
 */
export const startFileWatcher: () => Effect.Effect<void> = () =>
  Effect.scoped(
    fileWatcherImpl().pipe(
      Effect.catch((err: unknown) => {
        log.error("File watcher crashed", { error: String(err) })
        return Effect.void
      }),
    ),
  )

/**
 * Periodic cleanup task — removes stale cooldown entries.
 * Should be registered as a scheduled task (every 30s).
 */
export const subscribeFileChanges = Effect.fnUntraced(function* () {
  const prev = recentChanges.size
  cleanCooldowns()
  if (prev > 0) {
    log.debug("Cooldown cleanup", { before: prev, after: recentChanges.size })
  }
})

export * as DaemonFileWatcher from "./file-watcher"
