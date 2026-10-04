export * as HotReload from "."

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import * as fs from "fs"
import * as path from "path"

const log = Log.create({ service: "hotreload" })

export interface FileChange {
  type: "change" | "add" | "unlink"
  path: string
  timestamp: number
}

export type ChangeCallback = (change: FileChange) => void

export interface WatchedEntry {
  dir: string
  watcher: fs.FSWatcher
}

export interface Interface {
  readonly watch: (dirs: string[]) => Effect.Effect<void>
  readonly onChange: (callback: ChangeCallback) => Effect.Effect<void>
  readonly unwatch: () => Effect.Effect<void>
  readonly watchedDirs: () => Effect.Effect<string[]>
  /** Register a callback that only fires for files matching a glob-like pattern */
  readonly onPattern: (pattern: RegExp, callback: ChangeCallback) => Effect.Effect<void>
  readonly unwatchDir: (dir: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/HotReload") {}

// Shared debounce timer map: path -> timeout
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 300

function debouncedNotify(path: string, type: FileChange["type"], callbacks: ChangeCallback[]) {
  const existing = debounceTimers.get(path)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path)
      const change: FileChange = { type, path, timestamp: Date.now() }
      log.info(`hot-reload: ${change.path} (${change.type})`)
      for (const cb of callbacks) {
        try {
          cb(change)
        } catch (err) {
          log.error("Error in hot-reload callback", { err })
        }
      }
    }, DEBOUNCE_MS),
  )
}

export const defaultLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const entries: WatchedEntry[] = []
    const callbacks: ChangeCallback[] = []

    const watch = Effect.fnUntraced(function* (dirs: string[]) {
      for (const dir of dirs) {
        if (entries.some((e) => e.dir === dir)) {
          log.warn(`Already watching directory, skipping: ${dir}`)
          continue
        }
        if (!fs.existsSync(dir)) {
          log.warn(`Directory does not exist, skipping: ${dir}`)
          continue
        }

        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return
          const ftype: FileChange["type"] = eventType === "rename" ? "unlink" : "change"
          debouncedNotify(path.join(dir, filename.toString()), ftype, callbacks)
        })

        entries.push({ dir, watcher })
        log.info(`Now watching: ${dir}`)
      }
    })

    const onChange = Effect.fnUntraced(function* (callback: ChangeCallback) {
      callbacks.push(callback)
    })

    const onPattern = Effect.fnUntraced(function* (pattern: RegExp, callback: ChangeCallback) {
      const wrapped: ChangeCallback = (change) => {
        if (pattern.test(change.path)) callback(change)
      }
      callbacks.push(wrapped)
    })

    const unwatch = Effect.fnUntraced(function* () {
      for (const e of entries) {
        e.watcher.close()
      }
      entries.length = 0
      callbacks.length = 0
      // clear any pending debounce timers
      for (const t of debounceTimers.values()) clearTimeout(t)
      debounceTimers.clear()
      log.info("All watchers stopped")
    })

    const unwatchDir = Effect.fnUntraced(function* (dir: string) {
      const idx = entries.findIndex((e) => e.dir === dir)
      if (idx === -1) return
      entries[idx].watcher.close()
      entries.splice(idx, 1)
      log.info(`Stopped watching: ${dir}`)
    })

    const watchedDirs = Effect.fnUntraced(function* () {
      return entries.map((e) => e.dir)
    })

    return Service.of({ watch, onChange, onPattern, unwatch, unwatchDir, watchedDirs })
  }),
)

export function isAgentFile(filePath: string): boolean {
  return /[/\\](?:agent|agents)[/\\].*\.md$/i.test(filePath)
}

export function isPluginConfig(filePath: string): boolean {
  return /opencode\.jsonc?$/.test(filePath)
}

export function isSkillFile(filePath: string): boolean {
  return /[/\\]SKILL\.md$/i.test(filePath)
}

export function isConfigFile(filePath: string): boolean {
  return /opencode\.jsonc?$/i.test(filePath)
}
