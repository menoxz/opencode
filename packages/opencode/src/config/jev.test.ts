import { describe, expect, test } from "bun:test"
import { Result, Schema } from "effect"
import { ConfigJev } from "./jev"

const decode = (input: unknown) => Schema.decodeUnknownResult(ConfigJev.Info)(input)
const resolve = (input: ConfigJev.Info) => ConfigJev.resolve(input)!

describe("ConfigJev.resolve", () => {
  test("leaves a config without a profile untouched", () => {
    expect(ConfigJev.resolve(undefined as ConfigJev.Info | undefined)).toBeUndefined()
    expect(resolve({})).toEqual({})
  })

  test("safe turns on exactly the advisory hooks", () => {
    const resolved = resolve({ profile: "safe" })
    for (const hook of ConfigJev.SAFE_HOOKS) expect(resolved[hook]?.enabled).toBe(true)
    expect(resolved.guard).toBeUndefined()
    expect(resolved.untrusted).toBeUndefined()
    expect(resolved.compaction).toBeUndefined()
  })

  test("an explicit enabled wins over the profile", () => {
    const resolved = resolve({ profile: "safe", review: { enabled: false } })
    expect(resolved.review?.enabled).toBe(false)
    expect(resolved.route?.enabled).toBe(true)
  })

  test("preserves the other fields of a section", () => {
    const resolved = resolve({ profile: "safe", relevance: { enabled: true, threshold: 0.1 } })
    expect(resolved.relevance).toEqual({ enabled: true, threshold: 0.1 })
  })

  test("is idempotent", () => {
    const once = resolve({ profile: "safe" })
    expect(ConfigJev.resolve(once)).toEqual(once)
  })
})

describe("ConfigJev.Info", () => {
  test("accepts the safe profile", () => {
    expect(Result.isSuccess(decode({ profile: "safe" }))).toBe(true)
  })

  test("rejects an unknown profile", () => {
    expect(Result.isFailure(decode({ profile: "bogus" }))).toBe(true)
  })
})
