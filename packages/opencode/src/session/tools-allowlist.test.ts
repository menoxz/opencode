import { describe, expect, test } from "bun:test"
import { deriveStrictToolAllowlist, leanPhaseCoreTools } from "./tools"

describe("Lean dynamic core tools", () => {
  test("always keeps discovery recovery tools available", () => {
    for (const phase of ["discovery", "implementation", "unknown"] as const) {
      const core = leanPhaseCoreTools(phase)
      expect(core).toContain("grep")
      expect(core).toContain("glob")
      expect(core).toContain("invalid")
      expect(core).toContain("apply_patch")
      expect(core).toContain("edit")
      expect(core).toContain("write")
    }
  })
})

describe("strict session tool allowlist", () => {
  test("is absent for ordinary permission sets", () => {
    expect(deriveStrictToolAllowlist([{ permission: "read", pattern: "*", action: "allow" }] as any)).toBeUndefined()
  })

  test("derives exact visible tools from deny-all plus explicit allows", () => {
    const result = deriveStrictToolAllowlist([
      { permission: "*", pattern: "*", action: "deny" },
      { permission: "read", pattern: "*", action: "allow" },
      { permission: "grep", pattern: "*", action: "allow" },
    ] as any)
    expect(result).toEqual(new Set(["read", "grep"]))
    expect(result?.has("mcp_database_query")).toBe(false)
    expect(result?.has("custom_writer")).toBe(false)
  })
})
