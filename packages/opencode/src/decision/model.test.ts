import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { DecisionModel } from "./model"
import { parseModelRef } from "@/memory/model-picker"

/**
 * The central knob must be inert until it is set: an install that says nothing
 * new has to behave exactly as it did before this module existed, and the Jev
 * transport must never switch itself to a harness model on its own.
 */

describe("parseModelRef", () => {
  test("splits on the first slash, so a model id may contain slashes", () => {
    expect(parseModelRef("opencode-go/deepseek-v4.1-flash")).toEqual({
      providerID: "opencode-go",
      modelID: "deepseek-v4.1-flash",
    })
    expect(parseModelRef("command-code/typesafe/jev")).toEqual({
      providerID: "command-code",
      modelID: "typesafe/jev",
    })
  })

  test("refuses what is not a reference", () => {
    for (const value of ["", "  ", "deepseek", "/model", "provider/", "no-slash-here"]) {
      expect(parseModelRef(value)).toBeUndefined()
    }
  })
})

describe("DecisionModel.resolve", () => {
  test("stays inert with no configuration and no provider", async () => {
    // No Config and no Provider in the context: the resolution must degrade to
    // "no model" rather than throwing or picking something arbitrary.
    expect(await Effect.runPromise(DecisionModel.resolve({}))).toBeNull()
  })

  test("requireConfigured never falls back to the automatic pick", async () => {
    // This is the Jev transport's contract: without an explicit decision model it
    // must keep using the System One wire API, never a harness model of its own
    // choosing.
    expect(await Effect.runPromise(DecisionModel.resolve({ requireConfigured: true }))).toBeNull()
    expect(
      await Effect.runPromise(DecisionModel.resolve({ requireConfigured: true, override: "opencode-go/some-model" })),
    ).toBeNull()
  })
})
