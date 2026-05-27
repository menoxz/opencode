import { Context, Duration, Effect, Layer, Ref } from "effect"
import * as Log from "@opencode-ai/core/util/log"

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
} as const

export interface Interface {
  readonly get: (key: string) => Effect.Effect<CachedResult | null>
  readonly set: (key: string, data: unknown, ttl?: number) => Effect.Effect<void>
  readonly has: (key: string) => Effect.Effect<boolean>
  readonly invalidate: (pattern?: string) => Effect.Effect<number>
  readonly clear: () => Effect.Effect<void>
  readonly stats: () => Effect.Effect<{ size: number; hits: number; misses: number }>
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

      return Service.of({ get, set, has, invalidate, clear, stats })
    }),
  )
}

export * as ToolCache from "./cache"
