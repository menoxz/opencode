import { describe, expect, test } from "bun:test"
import { ADAPTERS, adapterFor, classifyAdapter, isEnvironmentCall, scopeKeysFor } from "./adapters"

describe("adapter classification", () => {
  test("recognises mobile, browser and desktop tool names", () => {
    expect(classifyAdapter("mobile_take_screenshot")?.kind).toBe("mobile")
    expect(classifyAdapter("mobile_list_elements_on_screen")?.kind).toBe("mobile")
    expect(classifyAdapter("browser_navigate")?.kind).toBe("browser")
    expect(classifyAdapter("web_browser_browser_click")?.kind).toBe("browser")
    expect(classifyAdapter("windows_mcp_Snapshot")?.kind).toBe("desktop")
    expect(classifyAdapter("Snapshot")?.kind).toBe("desktop")
    expect(classifyAdapter("dump_ui")?.kind).toBe("desktop")
    expect(classifyAdapter("press_key")?.kind).toBe("desktop")
  })

  test("prefers the most specific adapter and falls back to generic", () => {
    // `browser_snapshot` must be browser even though `snapshot` is a desktop pattern.
    expect(classifyAdapter("browser_snapshot")?.kind).toBe("browser")
    expect(classifyAdapter("mobile_browser_open_url")?.kind).toBe("mobile")
    expect(classifyAdapter("memory_retrieve")).toBeUndefined()
    expect(adapterFor("memory_retrieve").kind).toBe("generic")
  })

  test("accepts configuration overrides ahead of the built-ins", () => {
    const overrides = [{ id: "vr", kind: "desktop" as const, patterns: ["vr_headset_"], scopeKeys: ["headset"] }]
    expect(classifyAdapter("vr_headset_grab", overrides)?.id).toBe("vr")
    expect(scopeKeysFor("vr_headset_grab", overrides)).toEqual(["headset"])
  })

  test("ships descriptors for all three adapters", () => {
    expect(ADAPTERS.map((adapter) => adapter.kind)).toEqual(["mobile", "browser", "desktop"])
  })
})

describe("environment detection", () => {
  test("detects known adapters, target arguments, and ignores unrelated calls", () => {
    expect(isEnvironmentCall("browser_click", {})).toBe(true)
    expect(isEnvironmentCall("windows_mcp_Click", {})).toBe(true)
    expect(isEnvironmentCall("some_tool", { url: "https://shop.test" })).toBe(true)
    expect(isEnvironmentCall("memory_retrieve", { query: "hello" })).toBe(false)
    expect(isEnvironmentCall("memory_retrieve", {})).toBe(false)
  })

  test("exposes adapter-specific scope keys", () => {
    expect(scopeKeysFor("mobile_click_on_screen_at_coordinates")).toContain("device")
    expect(scopeKeysFor("browser_navigate")).toContain("url")
    expect(scopeKeysFor("unknown_tool")).toContain("target")
  })
})
