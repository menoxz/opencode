import { describe, expect, test } from "bun:test"
import { generationTokensPerSecond } from "@opencode-ai/core/util/token-speed"

describe("generationTokensPerSecond", () => {
  test("sums text and reasoning windows as the generation time", () => {
    const value = generationTokensPerSecond({
      output: 50,
      reasoning: 0,
      parts: [
        { type: "text", time: { start: 1_000, end: 2_000 } },
        { type: "tool", time: { start: 2_000, end: 5_000 } },
        { type: "reasoning", time: { start: 5_000, end: 6_000 } },
      ],
    })
    expect(value).toBe(25)
  })

  test("counts reasoning tokens generated at decoding speed", () => {
    const value = generationTokensPerSecond({
      output: 30,
      reasoning: 20,
      parts: [{ type: "text", time: { start: 0, end: 2_000 } }],
    })
    expect(value).toBe(25)
  })

  test("ignores open windows and unknown part types", () => {
    const value = generationTokensPerSecond({
      output: 10,
      reasoning: 0,
      parts: [
        { type: "text", time: { start: 0 } },
        { type: "step-start", time: { start: 0, end: 9_000 } },
        { type: "text", time: { start: 1_000, end: 2_000 } },
      ],
    })
    expect(value).toBe(10)
  })

  test("returns undefined without tokens or a generation window", () => {
    expect(generationTokensPerSecond({ output: 0, reasoning: 0, parts: [] })).toBeUndefined()
    expect(generationTokensPerSecond({ output: 10, reasoning: 0, parts: undefined })).toBeUndefined()
    expect(
      generationTokensPerSecond({ output: 10, reasoning: 0, parts: [{ type: "text", time: { start: 5, end: 5 } }] }),
    ).toBeUndefined()
  })
})
