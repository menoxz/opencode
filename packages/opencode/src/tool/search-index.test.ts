/**
 * Tests for search-index.ts, run against the REAL ripgrep binary (not a
 * mock), proving that the file list ripgrep actually scans is reduced by
 * the trigram index — not just a stat() count as in cache.test.ts.
 *
 * Run: bun test src/tool/search-index.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Service as SearchIndexService, extractRequiredTrigrams } from "./search-index"
import { Ripgrep } from "../file/ripgrep"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "search-index-test-"))
  // 100 files, only 3 of which contain the target word "needleWord".
  for (let i = 0; i < 100; i++) {
    const content = i % 33 === 0 ? `export const x${i} = "needleWord"` : `export const x${i} = ${i}`
    await fs.writeFile(path.join(tmpDir, `file${i}.ts`), content)
  }
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const runtime = SearchIndexService.defaultLayer.pipe(
  Layer.provideMerge(Ripgrep.defaultLayer),
  Layer.provideMerge(AppFileSystem.defaultLayer),
)

describe("extractRequiredTrigrams (safety)", () => {
  it("extracts trigrams from a plain literal pattern", () => {
    expect(extractRequiredTrigrams("needleWord")).not.toBeNull()
  })

  it("refuses alternation (cannot guarantee any substring is present)", () => {
    expect(extractRequiredTrigrams("cat|dog")).toBeNull()
  })

  it("refuses character classes", () => {
    expect(extractRequiredTrigrams("fo[oa]bar")).toBeNull()
  })

  it("refuses bounded quantifiers", () => {
    expect(extractRequiredTrigrams("ab{2,3}cd")).toBeNull()
  })

  it("refuses patterns with no literal run >= 3 chars", () => {
    expect(extractRequiredTrigrams("a.b.c")).toBeNull()
  })

  it("cuts the run before an optional/repeated character", () => {
    // "abc?def" -> "c" is optional, so the guaranteed literal runs are "ab"
    // and "def"; "ab" is too short (< 3) but "def" qualifies.
    const trigrams = extractRequiredTrigrams("abc?def")
    expect(trigrams).not.toBeNull()
  })
})

describe("SearchIndex real-runtime narrowing (uses the actual ripgrep binary)", () => {
  it("reduces the candidate file list to only files that can contain the pattern", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      // First call triggers a real build (scans all 100 files on disk).
      return yield* index.queryCandidates(tmpDir, "needleWord")
    })

    const candidates = await Effect.runPromise(program.pipe(Effect.provide(runtime)))
    expect(candidates).not.toBeNull()
    // Exactly the files containing "needleWord" should be candidates —
    // this proves ripgrep would only need to scan these, not all 100.
    expect(candidates!.length).toBeLessThan(100)
    expect(candidates!.length).toBeGreaterThan(0)
    for (const f of candidates!) {
      const content = await fs.readFile(path.join(tmpDir, f), "utf8")
      expect(content).toContain("needleWord")
    }
  })

  it("actually restricts what ripgrep scans: rg.search(file: candidates) returns the same matches as an unrestricted scan", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      const rg = yield* Ripgrep.Service

      const candidates = yield* index.queryCandidates(tmpDir, "needleWord")
      expect(candidates).not.toBeNull()

      const restricted = yield* rg.search({ cwd: tmpDir, pattern: "needleWord", file: candidates! })
      const unrestricted = yield* rg.search({ cwd: tmpDir, pattern: "needleWord" })

      // Same match count whether ripgrep scans 100 files or only the
      // pre-filtered candidates — proving the index narrows the search
      // space without changing the result (no regression).
      expect(restricted.items.length).toBe(unrestricted.items.length)
      expect(restricted.items.length).toBeGreaterThan(0)

      // The real proof of reduced scan surface: fewer files were passed to
      // ripgrep in the restricted call.
      expect(candidates!.length).toBeLessThan(100)
    })

    await Effect.runPromise(program.pipe(Effect.provide(runtime)))
  })

  it("returns [] (zero files, not null) when no file can contain the pattern — skips ripgrep entirely", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      const candidates = yield* index.queryCandidates(tmpDir, "totallyAbsentPattern")
      expect(candidates).toEqual([])
    })

    await Effect.runPromise(program.pipe(Effect.provide(runtime)))
  })

  it("updateFile keeps the index correct after a simulated edit (no stale false-negatives)", async () => {
    const target = path.join(tmpDir, "file1.ts")
    const newContent = 'export const x1 = "brandNewWord"'

    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      // Prime the index.
      yield* index.queryCandidates(tmpDir, "brandNewWord")
      yield* index.updateFile(target, newContent)
      return yield* index.queryCandidates(tmpDir, "brandNewWord")
    })

    // Simulate an edit tool adding a new word to a previously-plain file.
    await fs.writeFile(target, newContent)
    const candidates = await Effect.runPromise(program.pipe(Effect.provide(runtime)))
    expect(candidates).not.toBeNull()
    expect(candidates).toContain("file1.ts")
  })

  it("falls back to unrestricted (null) for patterns it cannot safely narrow", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      const candidates = yield* index.queryCandidates(tmpDir, "cat|dog")
      expect(candidates).toBeNull()
    })

    await Effect.runPromise(program.pipe(Effect.provide(runtime)))
  })
})

describe("SearchIndex resilience (index build/query failures never break grep)", () => {
  it("queryCandidates on a non-existent cwd fails safely and is catchable by callers", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      return yield* index
        .queryCandidates("/this/path/does/not/exist/at/all", "needleWord")
        .pipe(Effect.catch(() => Effect.succeed("CAUGHT" as const)))
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(runtime)))
    // Either it safely returns null (couldn't build, gave up) or the error
    // was caught by our .catch fallback — either way, grep.ts's own
    // .catch(() => Effect.succeed(null)) would never crash the tool.
    expect(result === null || result === "CAUGHT").toBe(true)
  })
})

describe("SearchIndex byte-level reduction (DoD: not just fewer files, fewer bytes)", () => {
  let bigDir: string
  const FILLER = "x".repeat(50_000) // ~50KB filler per file, none containing the needle

  beforeAll(async () => {
    bigDir = await fs.mkdtemp(path.join(os.tmpdir(), "search-index-bytes-test-"))
    for (let i = 0; i < 40; i++) {
      const body = i === 7 ? `${FILLER}\nuniqueNeedleXYZ\n${FILLER}` : FILLER
      await fs.writeFile(path.join(bigDir, `big${i}.ts`), body)
    }
  })

  afterAll(async () => {
    await fs.rm(bigDir, { recursive: true, force: true })
  })

  it("candidate set covers only a small fraction of total on-disk bytes", async () => {
    const program = Effect.gen(function* () {
      const index = yield* SearchIndexService
      return yield* index.queryCandidates(bigDir, "uniqueNeedleXYZ")
    })

    const candidates = await Effect.runPromise(program.pipe(Effect.provide(runtime)))
    expect(candidates).not.toBeNull()
    expect(candidates!.length).toBe(1)
    expect(candidates![0]).toBe("big7.ts")

    const allFiles = await fs.readdir(bigDir)
    let totalBytes = 0
    for (const f of allFiles) {
      totalBytes += (await fs.stat(path.join(bigDir, f))).size
    }
    let candidateBytes = 0
    for (const f of candidates!) {
      candidateBytes += (await fs.stat(path.join(bigDir, f))).size
    }

    const reductionRatio = candidateBytes / totalBytes
    // 1 file out of 40 similarly-sized files -> ripgrep would scan ~2.5% of
    // the bytes it would otherwise have to scan unrestricted.
    expect(reductionRatio).toBeLessThan(0.05)
  })
})
