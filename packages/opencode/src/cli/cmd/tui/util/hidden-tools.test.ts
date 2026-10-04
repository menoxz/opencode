import { describe, expect, test } from "bun:test"
import { isHiddenTool } from "./hidden-tools"

describe("bookkeeping tools stay out of the transcript", () => {
  test("hides the turn plan, which is loop discipline rather than user content", () => {
    expect(isHiddenTool("turn_plan")).toBe(true)
  })

  test("keeps every real tool visible", () => {
    expect(isHiddenTool("read")).toBe(false)
    expect(isHiddenTool("bash")).toBe(false)
    expect(isHiddenTool("todowrite")).toBe(false)
  })

  test("treats a missing name as visible rather than swallowing it", () => {
    expect(isHiddenTool(undefined)).toBe(false)
  })

  // A guard, in the spirit of the daemon console-visibility test: hiding is only
  // real if every transcript renderer consults the predicate in both its
  // "has tools" gate and its render decision.
  test("both transcript renderers wire the predicate in", async () => {
    const renderers = ["../routes/session/index.tsx", "../feature-plugins/system/session-v2.tsx"]
    for (const file of renderers) {
      const source = await Bun.file(new URL(file, import.meta.url)).text()
      expect(source.split("isHiddenTool(").length - 1).toBeGreaterThanOrEqual(2)
    }
  })
})
