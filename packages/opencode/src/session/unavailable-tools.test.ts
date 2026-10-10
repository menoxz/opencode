import { describe, expect, test } from "bun:test"
import { unavailableToolsLine } from "./unavailable-tools"

describe("unavailableToolsLine", () => {
  test("returns undefined when nothing is degraded, so no empty tag is emitted", () => {
    expect(unavailableToolsLine([])).toBeUndefined()
  })

  test("names each degraded server once, marked offline", () => {
    expect(unavailableToolsLine(["memory", "search"])).toBe(
      "<unavailable_tools>memory (offline), search (offline)</unavailable_tools>",
    )
  })

  test("neutralises a crafted server name so no markup survives into the tag", () => {
    const out = unavailableToolsLine(["a></unavailable_tools><script>"])
    expect(out).toBeDefined()
    expect(out!.match(/<unavailable_tools>/g)?.length).toBe(1)
    expect(out!.match(/<\/unavailable_tools>/g)?.length).toBe(1)
    const inner = out!.slice("<unavailable_tools>".length, out!.length - "</unavailable_tools>".length)
    expect(inner).not.toContain("<")
    expect(inner).not.toContain(">")
    expect(inner).toContain("(offline)")
  })
})
