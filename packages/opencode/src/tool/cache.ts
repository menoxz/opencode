import { Context, Duration, Effect, Layer, Option, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

const log = Log.create({ service: "tool.cache" })

// Types de résultats cachables
export type CachedResult = {
  data: unknown
  cachedAt: number
  ttl: number // ms
}

// Config du cache par outil
export const DEFAULT_TTL = {
  read: Duration.toMillis(Duration.seconds(5)),
  glob: Duration.toMillis(Duration.seconds(10)),
  grep: Duration.toMillis(Duration.seconds(10)),
  git_status: Duration.toMillis(Duration.seconds(2)),
  git_diff: Duration.toMillis(Duration.seconds(5)),
  // Per-file mtime cache: shared between grep/glob so scanning the same directory
  // with two different patterns/globs does not re-stat every matched file twice.
  // Invalidated explicitly by write/edit/apply_patch tools (see invalidateStat);
  // this TTL is only a safety net for changes this process doesn't observe
  // through those tools (e.g. a file modified by an external process).
  stat: Duration.toMillis(Duration.seconds(3)),
} as const

export interface Interface {
  readonly get: (key: string) => Effect.Effect<CachedResult | null>
  readonly set: (key: string, data: unknown, ttl?: number) => Effect.Effect<void>
  readonly has: (key: string) => Effect.Effect<boolean>
  readonly invalidate: (pattern?: string) => Effect.Effect<number>
  readonly clear: () => Effect.Effect<void>
  readonly stats: () => Effect.Effect<{ size: number; hits: number; misses: number }>
  /**
   * Returns stat info (mtime in ms since epoch, and whether the path is a
   * directory) for `file`, from a short-lived shared cache when available,
   * falling back to a real `stat` on miss/expiry. Shared between grep and glob
   * so that scanning the same directory with two different patterns does not
   * re-stat every matched file twice within the same session.
   * Returns `null` if the file cannot be stat'd (deleted, permission denied,
   * etc.), matching the previous inline behavior in grep.ts/glob.ts where such
   * entries were dropped from the result.
   */
  readonly getStatMtime: (
    fs: AppFileSystem.Interface,
    file: string,
  ) => Effect.Effect<{ mtime: number; isDirectory: boolean } | null>
  /**
   * Explicitly drops the cached mtime for `file` (and any grep/glob result
   * entries whose cache key contains it). Call this from any tool that writes
   * to disk, right after the write succeeds, so the next grep/glob sees the
   * fresh mtime/content instead of a stale cached one.
   */
  readonly invalidateStat: (file: string) => Effect.Effect<void>
}

type State = Map<string, CachedResult>

export class Service extends Context.Service<Service, Interface>()("@opencode/ToolCache") {
  static readonly defaultLayer: Layer.Layer<Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const cache = yield* Ref.make<State>(new Map())
      let hits = 0
      let misses = 0

      const get: Interface["get"] = (key) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(cache)
          const entry = map.get(key)
          if (entry !== undefined) {
            const now = Date.now()
            if (now - entry.cachedAt < entry.ttl) {
              hits++
              log.debug("Cache HIT", { key })
              return entry
            }
            // Expired — remove
            yield* Ref.update(cache, (m) => {
              const next = new Map(m)
              next.delete(key)
              return next
            })
          }
          misses++
          log.debug("Cache MISS", { key })
          return null
        })

      const set: Interface["set"] = (key, data, ttl) =>
        Effect.gen(function* () {
          yield* Ref.update(cache, (m) => {
            const next = new Map(m)
            next.set(key, {
              data,
              cachedAt: Date.now(),
              ttl: ttl ?? DEFAULT_TTL.read,
            })
            return next
          })
          log.debug("Cache SET", { key })
        })

      const has: Interface["has"] = (key) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(cache)
          const entry = map.get(key)
          if (entry !== undefined) {
            return Date.now() - entry.cachedAt < entry.ttl
          }
          return false
        })

      const invalidate: Interface["invalidate"] = (pattern) =>
        Effect.gen(function* () {
          const map = yield* Ref.get(cache)
          if (!pattern) {
            const size = map.size
            yield* Ref.set(cache, new Map())
            log.info("Cache fully invalidated", { removed: size })
            return size
          }
          // Invalides les entrées dont la clé contient le pattern
          let removed = 0
          const toRemove: string[] = []
          for (const [k] of map) {
            if (k.includes(pattern)) {
              toRemove.push(k)
              removed++
            }
          }
          if (removed > 0) {
            yield* Ref.update(cache, (m) => {
              const next = new Map(m)
              for (const k of toRemove) next.delete(k)
              return next
            })
          }
          return removed
        })

      const clear: Interface["clear"] = () =>
        Effect.gen(function* () {
          yield* Ref.set(cache, new Map())
          hits = 0
          misses = 0
        })

      const stats: Interface["stats"] = () =>
        Effect.gen(function* () {
          return { size: (yield* Ref.get(cache)).size, hits, misses }
        })

      // Reuses the same cache map with a dedicated key prefix, so a plain
      // invalidate(filepath) call (already used by write/edit/apply_patch)
      // also drops the matching stat entry for free — no separate state to
      // keep in sync.
      const statKey = (file: string) => `stat:${file}`

      const getStatMtime: Interface["getStatMtime"] = (fs, file) =>
        Effect.gen(function* () {
          const key = statKey(file)
          const cached = yield* get(key)
          if (cached) return cached.data as { mtime: number; isDirectory: boolean } | null

          const info = yield* fs.stat(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const result = info
            ? {
                mtime:
                  info.mtime.pipe(
                    Option.map((date) => date.getTime()),
                    Option.getOrElse(() => 0),
                  ) ?? 0,
                isDirectory: info.type === "Directory",
              }
            : null
          yield* set(key, result, DEFAULT_TTL.stat)
          return result
        })

      const invalidateStat: Interface["invalidateStat"] = (file) =>
        Effect.gen(function* () {
          yield* invalidate(statKey(file))
        })

      return Service.of({ get, set, has, invalidate, clear, stats, getStatMtime, invalidateStat })
    }),
  )
}

export * as ToolCache from "./cache"
