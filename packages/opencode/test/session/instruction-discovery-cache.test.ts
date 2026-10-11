import { describe, expect, test } from "bun:test"
import path from "path"
import * as NFS from "fs/promises"
import { Effect, FileSystem, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { NodeFileSystem } from "@effect/platform-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Instruction } from "../../src/session/instruction"
import { Global } from "@opencode-ai/core/global"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestConfig } from "../fixture/config"

const it = testEffect(Layer.mergeAll(CrossSpawnSpawner.defaultLayer, NodeFileSystem.layer))

// H5 §7.1 (principal) : total des appels disque attribuables à `systemPaths()` (findUp + existsSafe
// + stat de sentinelle), sur 10 appels sans changement de fichier, strictement inférieur à une
// baseline MESURÉE AVANT PATCH. Valeur relevée sur cette machine
// (scénario : aucun `AGENTS.md` de projet, `AGENTS.md` global présent, 10 appels `systemPaths()`) :
const BASELINE_TOTAL_DISK_CALLS = 160
// §7.2 (secondaire) : une découverte complète = `instructionFiles.length` (3) appels `findUp`.
// Sur 10 steps, `discovery_calls <= 1` se traduit donc par au plus 3 appels `findUp`.
const FIND_UP_PER_DISCOVERY = 3

interface Counter {
  n: number
}

/** Compteur d'appels disque bruts : chaque `exists` (utilisé par `findUp`/`existsSafe`) et chaque
 * `stat` (sentinelle) incrémente le total. Aucune composante n'est exclue du comptage. */
const countingPlatformLayer = (c: Counter) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const inner = yield* FileSystem.FileSystem
      return {
        ...inner,
        exists: (p: string) => inner.exists(p).pipe(Effect.tap(() => Effect.sync(() => { c.n += 1 }))),
        stat: (p: string) => inner.stat(p).pipe(Effect.tap(() => Effect.sync(() => { c.n += 1 }))),
      } as FileSystem.FileSystem
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer))

/** Compte les découvertes via `findUp` (une découverte = un findUp par cible d'instruction). */
const appFsLayer = (c: Counter, findUp: Counter) =>
  Layer.effect(
    AppFileSystem.Service,
    Effect.gen(function* () {
      const inner = yield* AppFileSystem.Service
      return {
        ...inner,
        findUp: (t: string, s: string, stop?: string) =>
          inner.findUp(t, s, stop).pipe(Effect.tap(() => Effect.sync(() => { findUp.n += 1 }))),
      } as AppFileSystem.Interface
    }),
  ).pipe(Layer.provide(AppFileSystem.layer.pipe(Layer.provide(countingPlatformLayer(c)))))

const instructionLayer = (g: Partial<Global.Interface>, flags: Partial<RuntimeFlags.Info>, c: Counter, f: Counter) =>
  Instruction.layer.pipe(
    Layer.provide(TestConfig.layer()),
    Layer.provide(appFsLayer(c, f)),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Global.layerWith(g)),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const writeFile = (p: string, content: string) =>
  Effect.promise(() => NFS.mkdir(path.dirname(p), { recursive: true }).then(() => NFS.writeFile(p, content)))

const setDirMtime = (dir: string, t: number) =>
  Effect.promise(() => NFS.utimes(dir, new Date(t), new Date(t)))

const dirMtime = (dir: string) => Effect.promise(() => NFS.stat(dir).then((s) => s.mtimeMs))

const callSystemPaths = Effect.gen(function* () {
  const svc = yield* Instruction.Service
  return yield* svc.systemPaths()
})

describe("Instruction.systemPaths memoization (H5)", () => {
  it.live("§7.1/§7.2 — total disk calls drop below the pre-patch baseline, discovery runs once", () =>
    Effect.gen(function* () {
      const project = yield* tmpdirScoped() // no local instruction file: the widest findUp scan
      const globalTmp = yield* tmpdirScoped()
      yield* writeFile(path.join(globalTmp, "AGENTS.md"), "# Global")

      const c: Counter = { n: 0 }
      const f: Counter = { n: 0 }
      const layer = instructionLayer({ home: globalTmp, config: globalTmp }, {}, c, f)

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const start = c.n
        const fStart = f.n
        for (let i = 0; i < 10; i++) {
          // Nothing touches the tree between calls: an unchanged tree must not trigger a
          // rediscovery, so the sentinel stays identical and the memoised list is reused.
          yield* svc.systemPaths()
        }
        const total = c.n - start
        const findUps = f.n - fStart
        // eslint-disable-next-line no-console
        console.log(`H5_AFTER total_disk_calls=${total} findUps=${findUps} baseline=${BASELINE_TOTAL_DISK_CALLS}`)
        expect(total).toBeLessThan(BASELINE_TOTAL_DISK_CALLS)
        expect(findUps).toBeLessThanOrEqual(FIND_UP_PER_DISCOVERY)
      }).pipe(provideInstance(project), Effect.provide(layer))
    }),
  )

  it.live("§7.3 — a project AGENTS.md added mid-session is seen on the next call", () =>
    Effect.gen(function* () {
      const project = yield* tmpdirScoped()
      const globalTmp = yield* tmpdirScoped()
      yield* writeFile(path.join(globalTmp, "AGENTS.md"), "# Global")
      const target = path.join(project, "AGENTS.md")

      const c: Counter = { n: 0 }
      const f: Counter = { n: 0 }
      const layer = instructionLayer({ home: globalTmp, config: globalTmp }, {}, c, f)

      yield* Effect.gen(function* () {
        const before = yield* callSystemPaths
        expect(before.has(target)).toBe(false)

        const base = yield* dirMtime(project)
        yield* writeFile(target, "# Added")
        // Guarantee the directory mtime moved (Windows mtime granularity is deferred).
        yield* setDirMtime(project, base + 2000)

        const after = yield* callSystemPaths
        expect(after.has(target)).toBe(true)
      }).pipe(provideInstance(project), Effect.provide(layer))
    }),
  )

  it.live("§7.3 — ~/.claude/CLAUDE.md added mid-session is seen on the next call", () =>
    Effect.gen(function* () {
      const project = yield* tmpdirScoped()
      const globalTmp = yield* tmpdirScoped()
      const target = path.join(globalTmp, ".claude", "CLAUDE.md")

      const c: Counter = { n: 0 }
      const f: Counter = { n: 0 }
      const layer = instructionLayer({ home: globalTmp, config: globalTmp }, {}, c, f)

      yield* Effect.gen(function* () {
        const before = yield* callSystemPaths
        expect(before.has(target)).toBe(false)

        yield* writeFile(target, "# Claude")

        const after = yield* callSystemPaths
        expect(after.has(target)).toBe(true)
      }).pipe(provideInstance(project), Effect.provide(layer))
    }),
  )

  it.live("§8.3 — mutation: a frozen directory stamp misses the added file (sentinel is the trigger)", () =>
    Effect.gen(function* () {
      const project = yield* tmpdirScoped()
      const globalTmp = yield* tmpdirScoped()
      yield* writeFile(path.join(globalTmp, "AGENTS.md"), "# Global")
      const target = path.join(project, "AGENTS.md")

      const c: Counter = { n: 0 }
      const f: Counter = { n: 0 }
      const layer = instructionLayer({ home: globalTmp, config: globalTmp }, {}, c, f)

      yield* Effect.gen(function* () {
        const before = yield* callSystemPaths
        expect(before.has(target)).toBe(false)
        const fAfterFirst = f.n

        // Create the file, then RESTORE the directory mtime to its pre-creation value: the
        // sentinel key is unchanged, so a correct memoization must NOT rediscover and must miss
        // the new path. If it appears anyway, invalidation is not sentinel-driven.
        const frozen = yield* dirMtime(project)
        yield* writeFile(target, "# Added")
        yield* setDirMtime(project, frozen)

        const after = yield* callSystemPaths
        expect(after.has(target)).toBe(false)
        expect(f.n).toBe(fAfterFirst) // no rediscovery: the cache was reused
      }).pipe(provideInstance(project), Effect.provide(layer))
    }),
  )

  it.live("§8.4 — two distinct directories do not share a cache entry", () =>
    Effect.gen(function* () {
      const a = yield* tmpdirScoped()
      const b = yield* tmpdirScoped()
      const globalTmp = yield* tmpdirScoped() // no global AGENTS.md, so globals don't interfere
      yield* writeFile(path.join(a, "AGENTS.md"), "# A")
      yield* writeFile(path.join(b, "AGENTS.md"), "# B")

      const c: Counter = { n: 0 }
      const f: Counter = { n: 0 }
      const layer = instructionLayer({ home: globalTmp, config: globalTmp }, {}, c, f)

      yield* Effect.gen(function* () {
        const pathsA = yield* callSystemPaths.pipe(provideInstance(a))
        const fAfterA = f.n
        const pathsB = yield* callSystemPaths.pipe(provideInstance(b))

        expect(pathsA.has(path.join(a, "AGENTS.md"))).toBe(true)
        expect(pathsA.has(path.join(b, "AGENTS.md"))).toBe(false)
        expect(pathsB.has(path.join(b, "AGENTS.md"))).toBe(true)
        expect(pathsB.has(path.join(a, "AGENTS.md"))).toBe(false)
        // B is a different directory ⇒ its own state ⇒ rediscovery happened.
        expect(f.n).toBeGreaterThan(fAfterA)
      }).pipe(Effect.provide(layer))
    }),
  )
})
