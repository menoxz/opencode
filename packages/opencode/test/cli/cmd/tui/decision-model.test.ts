import { describe, expect, test } from "bun:test"
import {
  chatPatch,
  currentDecisionModelValue,
  systemOnePatch,
  systemOneValue,
} from "../../../../src/cli/cmd/tui/component/decision-model"

/** The Codiv host, as `/global/jev/models` describes it. */
const OPENJEV = { provider: "openjev", default_model: "openjev-latest" }

describe("decision model picker", () => {
  test("the current value follows whichever transport is configured", () => {
    expect(currentDecisionModelValue({ decision_model: "opencode-go/deepseek-v4.1-flash" }, OPENJEV)).toBe(
      "opencode-go/deepseek-v4.1-flash",
    )
    expect(currentDecisionModelValue({ provider: "openjev" }, OPENJEV)).toBe(systemOneValue("openjev", "openjev-latest"))
    expect(currentDecisionModelValue({ provider: "openjev", model: "verdict-1.4" }, OPENJEV)).toBe(
      systemOneValue("openjev", "verdict-1.4"),
    )
    expect(currentDecisionModelValue(undefined, OPENJEV)).toBe(systemOneValue("openjev", "openjev-latest"))
    expect(currentDecisionModelValue(undefined, undefined)).toBeUndefined()
  })

  test("picking a System One model clears the chat decision model rather than leaving it blank", () => {
    expect(systemOnePatch({ decision_model: "opencode-go/deepseek-v4.1-flash" }, OPENJEV, "verdict-1.4")).toEqual({
      jev: { provider: "openjev", model: "verdict-1.4", decision_model: "" },
    })
  })

  test("a System One pick equals what is live, so nothing is written", () => {
    expect(systemOnePatch({ provider: "openjev" }, OPENJEV, "openjev-latest")).toBeUndefined()
    expect(systemOnePatch({ provider: "openjev", model: "verdict-1.4" }, OPENJEV, "verdict-1.4")).toBeUndefined()
    // A chat model is live: the same System One pick has to be written again, to clear it.
    expect(systemOnePatch({ provider: "openjev", decision_model: "a/b" }, OPENJEV, "openjev-latest")).toEqual({
      jev: { provider: "openjev", model: "openjev-latest", decision_model: "" },
    })
  })

  test("picking a model of the host repoints the provider when another one was pinned", () => {
    expect(systemOnePatch({ provider: "command-code" }, OPENJEV, "openjev-0.1")).toEqual({
      jev: { provider: "openjev", model: "openjev-0.1", decision_model: "" },
    })
  })

  test("picking a chat model keeps the previous behaviour", () => {
    expect(chatPatch({ provider: "openjev" }, "opencode-go/deepseek-v4.1-flash")).toEqual({
      jev: { decision_model: "opencode-go/deepseek-v4.1-flash" },
    })
    expect(chatPatch({ decision_model: "opencode-go/deepseek-v4.1-flash" }, "opencode-go/deepseek-v4.1-flash")).toBeUndefined()
    expect(chatPatch(undefined, "opencode-go/deepseek-v4.1-flash")).toEqual({
      jev: { decision_model: "opencode-go/deepseek-v4.1-flash" },
    })
  })
})
