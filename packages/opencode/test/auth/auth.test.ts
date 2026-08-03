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
})
