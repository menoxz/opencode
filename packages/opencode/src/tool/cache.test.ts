/**
 * Tests for ToolCacheService's shared stat-mtime cache used by grep/glob.
 *
 * Goal: prove, inside the real opencode Effect runtime (not an external
 * benchmark script), that:
 *   1. Repeated getStatMtime() calls for the same file within the TTL window
 *      hit the cache instead of re-stat'ing the filesystem.
 *   2. invalidateStat() forces the next call to re-stat (correctness after
 *      a write/edit/apply_patch).
 *   3. Directory entries are still correctly reported (grep.ts relies on this
 *      to exclude directories from its results — no regression).
 *
 * Run: bun test src/tool/cache.test.ts
 */

import { describe, it, expect } from "bun:test"
import { Effect, Option } from "effect"
import { Service as ToolCacheService } from "./cache"
import type { AppFileSystem } from "@opencode-ai/core/filesystem"

// Minimal fs.stat mock: counts real stat calls so we can assert cache hits.
function makeFakeFs(entries: Record<string, { mtimeMs: number; isDirectory: boolean }>) {
  let statCalls = 0
  const fs = {
    stat: (file: string) =>
      Effect.suspend(() => {
        statCalls++
        const e = entries[file]
        if (!e) return Effect.fail(new Error(`stat ENOENT: ${file}`))
        return Effect.succeed({
          type: e.isDirectory ? ("Directory" as const) : ("File" as const),
          mtime: Option.some(new Date(e.mtimeMs)),
        })
      }),
  } as unknown as AppFileSystem.Interface
  return { fs, getStatCalls: () => statCalls }
}

describe("ToolCacheService.getStatMtime", () => {
  it("caches repeated stat calls for the same file (shared grep/glob cache)", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const { fs, getStatCalls } = makeFakeFs({
        "/repo/a.ts": { mtimeMs: 1000, isDirectory: false },
      })

      // Simulate grep on pattern A, then glob on a different pattern, both
      // touching the same file — this is the "grep in circles" scenario.
      const r1 = yield* cache.getStatMtime(fs, "/repo/a.ts")
      const r2 = yield* cache.getStatMtime(fs, "/repo/a.ts")
      const r3 = yield* cache.getStatMtime(fs, "/repo/a.ts")

      expect(r1).toEqual({ mtime: 1000, isDirectory: false })
      expect(r2).toEqual({ mtime: 1000, isDirectory: false })
      expect(r3).toEqual({ mtime: 1000, isDirectory: false })
      // Only the first call should have hit the real filesystem.
      expect(getStatCalls()).toBe(1)
    })

    await Effect.runPromise(program.pipe(Effect.provide(ToolCacheService.defaultLayer)))
  })

  it("re-stats after invalidateStat (correctness after write/edit/apply_patch)", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const { fs, getStatCalls } = makeFakeFs({
        "/repo/b.ts": { mtimeMs: 1000, isDirectory: false },
      })

      yield* cache.getStatMtime(fs, "/repo/b.ts")
      expect(getStatCalls()).toBe(1)

      // Simulate a write tool call: it must force the next grep/glob to see
      // the fresh mtime instead of the stale cached one.
      yield* cache.invalidateStat("/repo/b.ts")
      yield* cache.getStatMtime(fs, "/repo/b.ts")
      expect(getStatCalls()).toBe(2)
    })

    await Effect.runPromise(program.pipe(Effect.provide(ToolCacheService.defaultLayer)))
  })

  it("preserves directory detection so grep.ts can still exclude directories", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const { fs } = makeFakeFs({
        "/repo/subdir": { mtimeMs: 500, isDirectory: true },
      })

      const info = yield* cache.getStatMtime(fs, "/repo/subdir")
      expect(info?.isDirectory).toBe(true)
    })

    await Effect.runPromise(program.pipe(Effect.provide(ToolCacheService.defaultLayer)))
  })

  it("returns null for files that cannot be stat'd (deleted/permission denied)", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const { fs } = makeFakeFs({}) // no entries -> stat always throws

      const info = yield* cache.getStatMtime(fs, "/repo/missing.ts")
      expect(info).toBeNull()
    })

    await Effect.runPromise(program.pipe(Effect.provide(ToolCacheService.defaultLayer)))
  })

  it("amortizes stat cost across many files scanned repeatedly (realistic grep+glob session)", async () => {
    const program = Effect.gen(function* () {
      const cache = yield* ToolCacheService
      const files: Record<string, { mtimeMs: number; isDirectory: boolean }> = {}
      for (let i = 0; i < 50; i++) files[`/repo/file${i}.ts`] = { mtimeMs: i, isDirectory: false }
      const { fs, getStatCalls } = makeFakeFs(files)

      // Simulate 5 different grep/glob queries over the same 50-file directory
      // (5 different patterns, same underlying file set) — the exact scenario
      // that previously re-stat'd every file on every single call.
      for (let query = 0; query < 5; query++) {
        yield* Effect.forEach(Object.keys(files), (f) => cache.getStatMtime(fs, f), { concurrency: 16 })
      }

      // Without the shared cache this would be 50 * 5 = 250 real stat calls.
      // With it, only the first pass should hit the real filesystem.
      expect(getStatCalls()).toBe(50)
    })

    await Effect.runPromise(program.pipe(Effect.provide(ToolCacheService.defaultLayer)))
  })
})
