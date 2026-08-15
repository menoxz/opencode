import { describe, expect, test } from "bun:test"
import { Identifier } from "../../src/id/id"

describe("Identifier.monotonic", () => {
  test("keeps a freshly minted id that already sorts last", () => {
    expect(Identifier.monotonic("msg_00003f7d6001aaaaaaaaaaaaaa", "msg_00003f7d5001bbbbbbbbbbbbbb")).toBe(
      "msg_00003f7d6001aaaaaaaaaaaaaa",
    )
  })

  test("keeps the minted id when the session has no message yet", () => {
    expect(Identifier.monotonic("msg_00003f7d6001aaaaaaaaaaaaaa", undefined)).toBe("msg_00003f7d6001aaaaaaaaaaaaaa")
  })

  // The id space is (timestamp * 0x1000 + counter) truncated to 48 bits, so it
  // wrapped on 2026-08-14T11:19:55Z: ids minted after the wrap sort before every
  // id written before it. These are real ids taken from a session broken by it.
  test("mints past the session high water mark after the id space wrapped", () => {
    const highest = "msg_ffff07b29001lvZ1aOBcxm1fBY"
    const generated = "msg_00003f7d6001SjWSlWsUjBmLWQ"
    const next = Identifier.monotonic(generated, highest)
    expect(next > highest).toBe(true)
    expect(next.startsWith("msg_")).toBe(true)
    expect(next.length).toBe(highest.length)
  })

  test("keeps minting forward on repeated calls after a wrap", () => {
    let highest = "msg_ffff07b29001lvZ1aOBcxm1fBY"
    for (let i = 0; i < 5; i++) {
      const next = Identifier.monotonic("msg_00003f7d6001SjWSlWsUjBmLWQ", highest)
      expect(next > highest).toBe(true)
      highest = next
    }
  })

  test("falls back to the minted id when the id space is exhausted", () => {
    const highest = "msg_ffffffffffffZZZZZZZZZZZZZZ"
    expect(Identifier.monotonic("msg_000000000001aaaaaaaaaaaa", highest)).toBe("msg_000000000001aaaaaaaaaaaa")
  })
})
