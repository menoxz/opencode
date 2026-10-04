import { describe, expect, test } from "bun:test"
import { generationTokensPerSecond } from "@opencode-ai/core/util/token-speed"

describe("generationTokensPerSecond", () => {
  test("counts text, reasoning and tool-call argument generation, excluding execution gaps", () => {
    const value = generationTokensPerSecond({
      output: 60,
      reasoning: 0,
      // 1s text, 1s tool-call arguments, 1s reasoning; the 2s between windows is
      // tool execution (and the wall clock would be 5s, giving 12 tok/s).
      parts: [
        { type: "text", time: { start: 1_000, end: 2_000 } },
        { type: "tool", time: { start: 3_000, end: 4_000 } },
        { type: "reasoning", time: { start: 5_000, end: 6_000 } },
      ],
    })
    expect(value).toBe(20)
  })

  test("merges overlapping parallel tool windows instead of double counting", () => {
    const value = generationTokensPerSecond({
      output: 40,
      reasoning: 0,
      parts: [
        { type: "tool", time: { start: 0, end: 3_000 } },
        { type: "tool", time: { start: 1_000, end: 4_000 } },
      ],
    })
    expect(value).toBe(10)
  })

  test("counts reasoning tokens generated at decoding speed", () => {
    const value = generationTokensPerSecond({
      output: 30,
      reasoning: 20,
      parts: [{ type: "text", time: { start: 0, end: 2_000 } }],
    })
    expect(value).toBe(25)
  })

  test("ignores open windows and unrelated part types", () => {
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

  test("hides an implausible sample instead of showing an exaggerated rate", () => {
    // A buffered, non-streamed reply: 4000 tokens arrive in one 5ms window
    // (800,000 tok/s). The sample is unreliable, so no value is shown.
    expect(
      generationTokensPerSecond({ output: 4_000, reasoning: 0, parts: [{ type: "text", time: { start: 0, end: 5 } }] }),
    ).toBeUndefined()
  })

  test("returns undefined without tokens or a generation window", () => {
    expect(generationTokensPerSecond({ output: 0, reasoning: 0, parts: [] })).toBeUndefined()
    expect(generationTokensPerSecond({ output: 10, reasoning: 0, parts: undefined })).toBeUndefined()
    expect(
      generationTokensPerSecond({ output: 10, reasoning: 0, parts: [{ type: "text", time: { start: 5, end: 5 } }] }),
    ).toBeUndefined()
  })
})
