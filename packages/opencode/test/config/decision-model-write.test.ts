import { describe, expect, test } from "bun:test"
import { Config } from "../../src/config/config"
import { ConfigJev } from "../../src/config/jev"

/**
 * What a decision-model write does to the harness.
 *
 * Two rules decide whether `/decision-model` is usable: a blank `decision_model` must be a
 * removal (JSON cannot carry `undefined`), and a `jev`-only patch must be applied in place
 * instead of disposing every instance.
 */

describe("Config.hotReloadablePatch", () => {
  test("a jev-only patch is applied in place", () => {
    expect(Config.hotReloadablePatch({ jev: { decision_model: "opencode-go/deepseek-v4.1-flash" } })).toBe(true)
    expect(
      Config.hotReloadablePatch({ jev: { provider: "openjev", model: "openjev-latest", decision_model: "" } }),
    ).toBe(true)
    // The classifier answers "which path", not "did anything change": an empty jev object changes
    // nothing (`changed` stays false) and no path is taken at all.
    expect(Config.hotReloadablePatch({ jev: {} })).toBe(true)
    // A schema reminder the SDK may add travels with the patch and never selects the path.
    expect(Config.hotReloadablePatch({ $schema: "https://opencode.ai/config.json", jev: { shadow: true } })).toBe(true)
  })

  test("any other key keeps the historical disposing path", () => {
    expect(Config.hotReloadablePatch({ model: "opencode-go/deepseek-v4.1-flash" })).toBe(false)
    expect(Config.hotReloadablePatch({ jev: {}, model: "opencode-go/deepseek-v4.1-flash" })).toBe(false)
    expect(Config.hotReloadablePatch({ jev: {}, agent: { build: {} } })).toBe(false)
    expect(Config.hotReloadablePatch({})).toBe(false)
    expect(Config.hotReloadablePatch(undefined)).toBe(false)
    expect(Config.hotReloadablePatch("jev")).toBe(false)
    expect(Config.hotReloadablePatch([{ jev: {} }])).toBe(false)
  })
})

describe("ConfigJev.writableDecisionModel", () => {
  test("a blank decision model is marked for removal, not written blank", () => {
    const jev = ConfigJev.writableDecisionModel({ provider: "openjev", decision_model: "" })
    // `patchJsonc` walks `Object.entries`: the key has to be present for the removal to happen.
    expect(Object.keys(jev)).toContain("decision_model")
    expect(jev.decision_model).toBeUndefined()
    expect(jev.provider).toBe("openjev")
  })

  test("a real decision model is returned untouched", () => {
    const input = { decision_model: "opencode-go/deepseek-v4.1-flash" }
    expect(ConfigJev.writableDecisionModel(input)).toBe(input)
  })
})
