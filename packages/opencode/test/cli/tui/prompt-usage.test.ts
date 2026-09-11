import { describe, expect, test } from "bun:test"
import {
  formatFileTagHint,
  formatPromptUsage,
  formatTaggedFileCount,
  helpUsageHints,
} from "../../../src/cli/cmd/tui/component/prompt/usage"

describe("prompt usage helpers", () => {
  test("formats a compact file tagging hint", () => {
    expect(formatFileTagHint()).toBe("@ tag files")
  })

  test("measures tokens per second over generation windows, counting tool-call arguments but not execution gaps", () => {
    const usage = formatPromptUsage({
      input: 100,
      output: 60,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      // 1s text, 1s tool-call arguments, 1s reasoning; the 2s between windows is
      // tool execution. Wall clock (5s) would report 12 tok/s.
      parts: [
        { type: "text", time: { start: 1_000, end: 2_000 } },
        { type: "tool", time: { start: 3_000, end: 4_000 } },
        { type: "reasoning", time: { start: 5_000, end: 6_000 } },
      ],
      cost: 0.01,
      contextLimit: 1_000,
    })

    expect(usage).toEqual({
      context: "160 (16%)",
      cost: "$0.01",
      tokensPerSecond: "20 tok/s",
    })
  })

  test("omits tokens per second for an implausible buffered sample", () => {
    const usage = formatPromptUsage({
      input: 100,
      output: 4_000,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      // A non-streamed reply would otherwise report hundreds of thousands of tok/s.
      parts: [{ type: "text", time: { start: 0, end: 5 } }],
      cost: 0.01,
      contextLimit: 200_000,
    })

    expect(usage?.tokensPerSecond).toBeUndefined()
  })

  test("omits tokens per second when no generation window is available", () => {
    const usage = formatPromptUsage({
      input: 100,
      output: 50,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      cost: 0,
      contextLimit: undefined,
    })

    expect(usage?.tokensPerSecond).toBeUndefined()
    expect(usage?.cost).toBeUndefined()
  })

  test("documents file tagging in in-app help hints", () => {
    expect(helpUsageHints).toContain("Type @ to tag files in the prompt.")
  })

  test("formats the number of files already tagged in the prompt", () => {
    expect(formatTaggedFileCount(0)).toBeUndefined()
    expect(formatTaggedFileCount(1)).toBe("1 file tagged")
    expect(formatTaggedFileCount(2)).toBe("2 files tagged")
  })
})
