import { describe, expect, test } from "bun:test"
import { inspectBudget, isLeanTerminalTool, requiresMutationCause, LEAN_INSPECT_MAX_ACTIONS, LEAN_INSPECT_TOTAL_CHARS, LEAN_TERMINAL_MAX_CHARS } from "./lean-output-policy"

describe("lean output policy", () => {
  test("caps an inspection wave by actions, per-result and total characters", () => {
    expect(LEAN_INSPECT_MAX_ACTIONS).toBe(8)
    expect(LEAN_INSPECT_TOTAL_CHARS).toBe(16_000)
    expect(inspectBudget({ enabled: true, actionCount: 8, requestedChars: 20_000 })).toEqual({ maxActions: 8, maxCharsPerResult: 2_000, totalChars: 16_000 })
    expect(inspectBudget({ enabled: true, actionCount: 4, requestedChars: 20_000 }).maxCharsPerResult).toBe(4_000)
    expect(inspectBudget({ enabled: false, actionCount: 16, requestedChars: 20_000 }).maxActions).toBe(16)
  })
  test("bounds native and MCP terminal output", () => {
    expect(LEAN_TERMINAL_MAX_CHARS).toBe(4_000)
    expect(isLeanTerminalTool("bash")).toBe(true)
    expect(isLeanTerminalTool("mcp-terminal_command_run")).toBe(true)
    expect(isLeanTerminalTool("read")).toBe(false)
  })
  test("requires causal evidence after the first completed patch", () => {
    expect(requiresMutationCause([] as any)).toBe(false)
    expect(requiresMutationCause([{ parts: [{ type: "tool", tool: "apply_patch", state: { status: "completed" } }] }] as any)).toBe(true)
    expect(requiresMutationCause([{ parts: [{ type: "tool", tool: "edit", state: { status: "completed" } }] }] as any)).toBe(true)
    expect(requiresMutationCause([{ parts: [{ type: "tool", tool: "write", state: { status: "completed" } }] }] as any)).toBe(true)
    expect(requiresMutationCause([{ parts: [{ type: "tool", tool: "read", state: { status: "completed" } }] }] as any)).toBe(false)
  })
})
