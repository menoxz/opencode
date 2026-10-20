import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigGuard } from "../../src/config/guard"

const decode = Schema.decodeUnknownSync(ConfigGuard.Info)

describe("config guards", () => {
  test("keeps every key the user wrote", () => {
    expect(
      decode({
        enabled: true,
        max_per_step: 2,
        max_chars: 600,
        disable: ["delegate-before-diving"],
        paths: ["~/config/opencodev2/guards"],
      }),
    ).toEqual({
      enabled: true,
      max_per_step: 2,
      max_chars: 600,
      disable: ["delegate-before-diving"],
      paths: ["~/config/opencodev2/guards"],
    })
  })

  test("accepts an empty block, so `guards: {}` is not an error", () => {
    expect(decode({})).toEqual({})
  })

  test("refuses a non-positive cap instead of silently clamping it", () => {
    expect(() => decode({ max_per_step: 0 })).toThrow()
    expect(() => decode({ max_chars: -1 })).toThrow()
  })
})
