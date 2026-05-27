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

export interface Interface {
  readonly watch: (dirs: string[]) => Effect.Effect<void>
  readonly onChange: (callback: (change: FileChange) => void) => Effect.Effect<void>
  readonly unwatch: () => Effect.Effect<void>
  readonly watchedDirs: () => Effect.Effect<string[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/HotReload") {}

export const defaultLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const watchers: fs.FSWatcher[] = []
    const callbacks: Array<(change: FileChange) => void> = []

    const watch = Effect.fnUntraced(function* (dirs: string[]) {
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          log.warn(`Directory does not exist, skipping: ${dir}`)
          continue
        }

        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return
          const change: FileChange = {
            type: eventType === "rename" ? "unlink" : "change",
            path: path.join(dir, filename.toString()),
            timestamp: Date.now(),
          }

          log.info(`File change detected: ${change.path} (${change.type})`)

          for (const cb of callbacks) {
            try {
              cb(change)
            } catch (err) {
              log.error("Error in hot-reload callback", { err })
            }
          }
        })

        watchers.push(watcher)
        log.info(`Watching directory: ${dir}`)
      }
    })

    const onChange = Effect.fnUntraced(function* (callback: (change: FileChange) => void) {
      callbacks.push(callback)
    })

    const unwatch = Effect.fnUntraced(function* () {
      for (const w of watchers) {
        w.close()
      }
      watchers.length = 0
      callbacks.length = 0
      log.info("All watchers stopped")
    })

    const watchedDirs = Effect.fnUntraced(function* () {
      return watchers.map((_, i) => `watcher-${i}`)
    })

    return Service.of({ watch, onChange, unwatch, watchedDirs })
  }),
)

// Helper pour détecter les fichiers d'agents modifiés
export function isAgentFile(filePath: string): boolean {
  return /[/\\](?:agent|agents)[/\\].*\.md$/i.test(filePath)
}

export function isPluginConfig(filePath: string): boolean {
  return /opencode\.jsonc?$/.test(filePath)
}
