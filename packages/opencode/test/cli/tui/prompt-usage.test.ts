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

  test("includes tokens per second when output tokens and duration are available", () => {
    const usage = formatPromptUsage({
      input: 100,
      output: 50,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      created: 1_000,
      completed: 6_000,
      cost: 0.01,
      contextLimit: 1_000,
    })

    expect(usage).toEqual({
      context: "150 (15%)",
      cost: "$0.01",
      tokensPerSecond: "10 tok/s",
    })
  })

  test("omits tokens per second when duration is not reliable", () => {
    const usage = formatPromptUsage({
      input: 100,
      output: 50,
      reasoning: 0,
      cache: { read: 0, write: 0 },
      created: 6_000,
      completed: 1_000,
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
