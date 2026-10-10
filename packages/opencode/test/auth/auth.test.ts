import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Auth } from "../../src/auth"
import { Global } from "@opencode-ai/core/global"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer

const it = testEffect(Layer.mergeAll(Auth.defaultLayer, node))

describe("Auth", () => {
  it.live("set normalizes trailing slashes in keys", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.set("https://example.com/", {
          type: "wellknown",
          key: "TOKEN",
          token: "abc",
        })
        const data = yield* auth.all()
        expect(data["https://example.com"]).toBeDefined()
        expect(data["https://example.com/"]).toBeUndefined()
      }),
    ),
  )

  it.live("set cleans up pre-existing trailing-slash entry", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.set("https://example.com/", {
          type: "wellknown",
          key: "TOKEN",
          token: "old",
        })
        yield* auth.set("https://example.com", {
          type: "wellknown",
          key: "TOKEN",
          token: "new",
        })
        const data = yield* auth.all()
        const keys = Object.keys(data).filter((key) => key.includes("example.com"))
        expect(keys).toEqual(["https://example.com"])
        const entry = data["https://example.com"]!
        expect(entry.type).toBe("wellknown")
        if (entry.type === "wellknown") expect(entry.token).toBe("new")
      }),
    ),
  )

  it.live("remove deletes both trailing-slash and normalized keys", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.set("https://example.com", {
          type: "wellknown",
          key: "TOKEN",
          token: "abc",
        })
        yield* auth.remove("https://example.com/")
        const data = yield* auth.all()
        expect(data["https://example.com"]).toBeUndefined()
        expect(data["https://example.com/"]).toBeUndefined()
      }),
    ),
  )

  it.live("set and remove are no-ops on keys without trailing slashes", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        yield* auth.set("anthropic", {
          type: "api",
          key: "sk-test",
        })
        const data = yield* auth.all()
        expect(data["anthropic"]).toBeDefined()
        yield* auth.remove("anthropic")
        const after = yield* auth.all()
        expect(after["anthropic"]).toBeUndefined()
      }),
    ),
  )

  // Regression: an interrupted write leaves auth.json non-empty but unparseable.
  // JSON.parse then died as a defect, straight through Auth.all's fallback, and
  // every config-dependent startup request answered "Unexpected server error" —
  // leaving no way back in, since auth login needs the app to boot.
  it.live("unparseable auth.json degrades to empty credentials", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        const file = path.join(Global.Path.data, "auth.json")
        yield* Effect.promise(() => fs.mkdir(path.dirname(file), { recursive: true }))
        yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(file, { force: true })))

        for (const corrupted of ["   ", "", "{not json", "\u0000\u0001"]) {
          yield* Effect.promise(() => fs.writeFile(file, corrupted))
          expect(yield* auth.all()).toEqual({})
        }

        // and recovery works without deleting anything by hand
        yield* auth.set("anthropic", { type: "api", key: "sk-test" })
        expect((yield* auth.all())["anthropic"]).toBeDefined()
      }),
    ),
  )

  // Ordered fallback pool: the head key stays the priority one, `add` appends
  // without ever clobbering what is already stored. Each case writes its own
  // provider id: the auth file is process-wide, so sharing an id across cases
  // would leak one case's pool into the next.
  describe("api key pool", () => {
    it.live("add appends keys and keeps the first as priority", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          yield* auth.addApiKey("pool-append", "sk-first")
          yield* auth.addApiKey("pool-append", "sk-second")
          expect(yield* auth.listApiKeys("pool-append")).toEqual(["sk-first", "sk-second"])

          const entry = (yield* auth.all())["pool-append"]
          if (entry?.type !== "api") throw new Error("expected api auth")
          expect(entry.key).toBe("sk-first")
          expect(entry.keys).toEqual(["sk-first", "sk-second"])
        }),
      ),
    )

    it.live("add deduplicates and ignores blank keys", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          yield* auth.addApiKey("pool-dedup", "sk-first")
          yield* auth.addApiKey("pool-dedup", "sk-first")
          yield* auth.addApiKey("pool-dedup", "   ")
          expect(yield* auth.listApiKeys("pool-dedup")).toEqual(["sk-first"])
        }),
      ),
    )

    it.live("remove drops exactly the key at its position", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          yield* auth.addApiKey("pool-remove", "sk-a")
          yield* auth.addApiKey("pool-remove", "sk-b")
          yield* auth.addApiKey("pool-remove", "sk-c")
          yield* auth.removeApiKey("pool-remove", 1)
          expect(yield* auth.listApiKeys("pool-remove")).toEqual(["sk-a", "sk-c"])

          // out-of-range and non-integer positions are no-ops, not crashes
          yield* auth.removeApiKey("pool-remove", 7)
          yield* auth.removeApiKey("pool-remove", -1)
          yield* auth.removeApiKey("pool-remove", Number.NaN)
          expect(yield* auth.listApiKeys("pool-remove")).toEqual(["sk-a", "sk-c"])
        }),
      ),
    )

    it.live("removing the last key deletes the entry", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          yield* auth.addApiKey("pool-last", "sk-only")
          yield* auth.removeApiKey("pool-last", 0)
          expect(yield* auth.listApiKeys("pool-last")).toEqual([])
          expect((yield* auth.all())["pool-last"]).toBeUndefined()
        }),
      ),
    )

    it.live("legacy single-key entries migrate onto the same pool", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          // pre-pool entry: `key` only, no `keys`
          yield* auth.set("pool-legacy", { type: "api", key: "sk-legacy" })
          yield* auth.addApiKey("pool-legacy", "sk-added")
          expect(yield* auth.listApiKeys("pool-legacy")).toEqual(["sk-legacy", "sk-added"])
        }),
      ),
    )

    it.live("listing a provider with no stored keys is empty", () =>
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const auth = yield* Auth.Service
          expect(yield* auth.listApiKeys("unknown-provider")).toEqual([])
        }),
      ),
    )
  })
})
