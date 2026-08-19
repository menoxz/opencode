import { describe, expect, test } from "bun:test"
import { deriveStrictToolAllowlist } from "./tools"

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
