import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Service as ToolCacheService } from "@/tool/cache"
import { testEffect } from "../lib/effect"

const it = testEffect(ToolCacheService.defaultLayer)

describe("ToolCache.invalidate", () => {
  // grep/glob keys carry the search DIRECTORY, never the edited file, so a
  // plain substring match left stale results for the whole TTL after an edit.
  it.effect("drops grep/glob entries rooted at an ancestor of the changed file", () =>
    Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const root = process.platform === "win32" ? "C:\\proj\\src" : "/proj/src"
      const other = process.platform === "win32" ? "C:\\other" : "/other"
      const file = process.platform === "win32" ? "C:\\proj\\src\\a\\b.ts" : "/proj/src/a/b.ts"

      yield* cache.set(`grep:${root}:foo:`, ["stale"])
      yield* cache.set(`glob:${root}:**/*.ts`, ["stale"])
      yield* cache.set(`grep:${other}:foo:`, ["keep"])
      yield* cache.set(`read:${file}`, "direct")

      const removed = yield* cache.invalidate(file)

      expect(removed).toBe(3)
      expect(yield* cache.has(`grep:${root}:foo:`)).toBe(false)
      expect(yield* cache.has(`glob:${root}:**/*.ts`)).toBe(false)
      expect(yield* cache.has(`read:${file}`)).toBe(false)
      expect(yield* cache.has(`grep:${other}:foo:`)).toBe(true)
    }),
  )

  it.effect("does not treat a sibling prefix as an ancestor", () =>
    Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const root = process.platform === "win32" ? "C:\\proj\\src" : "/proj/src"
      const sibling = process.platform === "win32" ? "C:\\proj\\srcx\\a.ts" : "/proj/srcx/a.ts"
      yield* cache.set(`grep:${root}:foo:`, ["keep"])

      const removed = yield* cache.invalidate(sibling)

      expect(removed).toBe(0)
      expect(yield* cache.has(`grep:${root}:foo:`)).toBe(true)
    }),
  )
})
