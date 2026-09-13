import { describe, expect, test } from "bun:test"
import {
  inspectBudget,
  isLeanAgent,
  isLeanTerminalTool,
  leanToolOutputBudget,
  LEAN_BROWSER_MAX_CHARS,
  LEAN_DYNAMIC_SLOT_MARGIN,
  requiresMutationCause,
  LEAN_INSPECT_MAX_ACTIONS,
  LEAN_INSPECT_TOTAL_CHARS,
  LEAN_TERMINAL_MAX_CHARS,
} from "./lean-output-policy"

describe("lean output policy", () => {
  test("non-Lean default is bounded while explicit deeper inspection remains available", () => {
    for (const actionCount of [1, 4, 8, 16]) {
      const result = inspectBudget({ enabled: false, actionCount })
      expect(result.maxCharsPerResult * actionCount).toBeLessThanOrEqual(16_000)
      expect(result.maxCharsPerResult).toBeLessThanOrEqual(4_000)
      expect(result.totalChars).toBe(16_000)
    }
    expect(inspectBudget({ enabled: false, actionCount: 4, requestedChars: 8_000 }).maxCharsPerResult).toBe(8_000)
    expect(inspectBudget({ enabled: true, actionCount: 4, requestedChars: 8_000 }).maxCharsPerResult).toBe(4_000)
  })
  test("caps an inspection wave by actions, per-result and total characters", () => {
    expect(LEAN_INSPECT_MAX_ACTIONS).toBe(16)
    expect(LEAN_INSPECT_TOTAL_CHARS).toBe(16_000)
    expect(inspectBudget({ enabled: true, actionCount: 16, requestedChars: 20_000 })).toEqual({
      maxActions: 16,
      maxCharsPerResult: 1_000,
      totalChars: 16_000,
    })
    expect(inspectBudget({ enabled: true, actionCount: 4, requestedChars: 20_000 }).maxCharsPerResult).toBe(4_000)
    expect(inspectBudget({ enabled: false, actionCount: 16, requestedChars: 20_000 }).maxActions).toBe(16)
  })
  // Without an explicit request the per-result default is the fair share of the
  // wave total, capped at 4k: a 2-action wave reads 4k each (not a fixed 2k that
  // truncated a 400-line file at line 60), a full 16-action wave gets 1k each.
  test("scales the default per-result budget with the wave size", () => {
    expect(inspectBudget({ enabled: true, actionCount: 1 }).maxCharsPerResult).toBe(4_000)
    expect(inspectBudget({ enabled: true, actionCount: 2 }).maxCharsPerResult).toBe(4_000)
    expect(inspectBudget({ enabled: true, actionCount: 5 }).maxCharsPerResult).toBe(3_200)
    expect(inspectBudget({ enabled: true, actionCount: 8 }).maxCharsPerResult).toBe(2_000)
    expect(inspectBudget({ enabled: true, actionCount: 16 }).maxCharsPerResult).toBe(1_000)
    // An explicit smaller request is still honoured.
    expect(inspectBudget({ enabled: true, actionCount: 2, requestedChars: 1_500 }).maxCharsPerResult).toBe(1_500)
  })
  test("resolves the lean profile from the agent attribute, falling back to the name", () => {
    expect(isLeanAgent({ name: "lean" })).toBe(true)
    expect(isLeanAgent({ name: "lean-fr", lean: true })).toBe(true)
    expect(isLeanAgent({ name: "lean", lean: false })).toBe(false)
    expect(isLeanAgent({ name: "build" })).toBe(false)
    expect(LEAN_DYNAMIC_SLOT_MARGIN).toBeGreaterThanOrEqual(6)
  })
  test("bounds native and MCP terminal output", () => {
    expect(LEAN_TERMINAL_MAX_CHARS).toBe(4_000)
    expect(isLeanTerminalTool("bash")).toBe(true)
    expect(isLeanTerminalTool("mcp-terminal_command_run")).toBe(true)
    expect(isLeanTerminalTool("read")).toBe(false)
    for (const name of ["command_chain", "command_status", "command_wait", "terminal_read", "ssh_run"]) {
      expect(isLeanTerminalTool(`mcp-terminal_${name}`)).toBe(true)
    }
    expect(isLeanTerminalTool("mcp-terminal_command_stream", { action: "read" })).toBe(true)
    expect(isLeanTerminalTool("mcp-terminal_command_stream", { action: "close" })).toBe(false)
    expect(isLeanTerminalTool("developer-tools_native_terminal", { action: "read" })).toBe(true)
    expect(isLeanTerminalTool("developer-tools_native_terminal", { action: "signal" })).toBe(false)
  })
  test("requires causal evidence after the first completed patch", () => {
    expect(requiresMutationCause([] as any)).toBe(false)
    expect(
      requiresMutationCause([
        { parts: [{ type: "tool", tool: "apply_patch", state: { status: "completed" } }] },
      ] as any),
    ).toBe(true)
    expect(
      requiresMutationCause([{ parts: [{ type: "tool", tool: "edit", state: { status: "completed" } }] }] as any),
    ).toBe(true)
    expect(
      requiresMutationCause([{ parts: [{ type: "tool", tool: "write", state: { status: "completed" } }] }] as any),
    ).toBe(true)
    expect(
      requiresMutationCause([{ parts: [{ type: "tool", tool: "read", state: { status: "completed" } }] }] as any),
    ).toBe(false)
  })
  test("scopes edit/write causality to the same artifact", () => {
    const previous = [
      {
        parts: [
          {
            type: "tool",
            tool: "edit",
            state: { status: "completed", input: { filePath: "C:\\repo\\src\\feature.ts" } },
          },
        ],
      },
    ] as any
    expect(
      requiresMutationCause(previous, { tool: "write", filePath: "C:\\Users\\me\\.config\\reports\\audit.md" }),
    ).toBe(false)
    expect(requiresMutationCause(previous, { tool: "edit", filePath: "c:/repo/src/feature.ts" })).toBe(true)
    expect(requiresMutationCause(previous, { tool: "apply_patch" })).toBe(true)
  })

  test("allows the first report write but guards a later rewrite of that report", () => {
    const previous = [
      {
        parts: [
          {
            type: "tool",
            tool: "write",
            state: { status: "completed", input: { filePath: "C:\\Users\\me\\.config\\reports\\audit.md" } },
          },
        ],
      },
    ] as any
    expect(
      requiresMutationCause(previous, { tool: "write", filePath: "C:\\Users\\me\\.config\\reports\\other.md" }),
    ).toBe(false)
    expect(
      requiresMutationCause(previous, { tool: "write", filePath: "C:\\Users\\me\\.config\\reports\\audit.md" }),
    ).toBe(true)
  })
  test("bounds browser and git context separately from terminal tails", () => {
    expect(LEAN_BROWSER_MAX_CHARS).toBe(8_000)
    expect(leanToolOutputBudget("bash")).toMatchObject({ maxChars: 4_000, direction: "tail" })
    expect(leanToolOutputBudget("web-browser_git_status")).toMatchObject({ maxChars: 8_000, direction: "head" })
    expect(leanToolOutputBudget("web-browser_browser_navigate")).toMatchObject({ maxChars: 8_000, direction: "head" })
    expect(leanToolOutputBudget("read")).toBeUndefined()
  })
})
