import { describe, expect, test } from "bun:test"
import { deriveStrictToolAllowlist, leanDynamicCapVerdict, leanPhaseCoreTools } from "./tools"
import { LEAN_DYNAMIC_SLOT_MARGIN } from "@/tool/lean-output-policy"

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

  test("exposes the full memory lifecycle, not just retrieval", () => {
    const core = leanPhaseCoreTools("implementation")
    for (const tool of [
      "llm-memory-tool_memory_retrieve",
      "llm-memory-tool_memory_store",
      "llm-memory-tool_memory_update",
      "llm-memory-tool_memory_delete",
      "llm-memory-tool_memory_consolidate",
    ] as const)
      expect(core).toContain(tool)
  })

  test("keeps the shipped max_tools cap valid for the enlarged mandatory core", () => {
    const requiredCount = leanPhaseCoreTools("unknown").length + 1
    expect(leanDynamicCapVerdict({ configuredMax: 26, requiredCount }).ok).toBe(true)
  })

  // Observed in production: max_tools=14 with 12 mandatory tools passed the old
  // guard yet left a single slot for every MCP tool, so activations evicted
  // each other on every step.
  test("rejects a cap that fits the mandatory tools but leaves no dynamic room", () => {
    const verdict = leanDynamicCapVerdict({ configuredMax: 14, requiredCount: 12 })
    expect(verdict.ok).toBe(false)
    expect(verdict.minimum).toBe(12 + LEAN_DYNAMIC_SLOT_MARGIN)
    if (!verdict.ok) expect(verdict.reason).toContain("hot_path.max_tools")
  })

  test("accepts a cap at or above mandatory tools plus the dynamic margin", () => {
    expect(leanDynamicCapVerdict({ configuredMax: 12 + LEAN_DYNAMIC_SLOT_MARGIN, requiredCount: 12 }).ok).toBe(true)
    expect(leanDynamicCapVerdict({ configuredMax: 26, requiredCount: 12 }).ok).toBe(true)
    expect(leanDynamicCapVerdict({ configuredMax: 12 + LEAN_DYNAMIC_SLOT_MARGIN - 1, requiredCount: 12 }).ok).toBe(false)
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
