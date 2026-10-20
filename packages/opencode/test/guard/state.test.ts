import { describe, expect, test } from "bun:test"
import { buildGuardState, type Message } from "../../src/guard/state"

const tool = (name: string, input: Record<string, unknown> = {}, status = "completed", exitCode?: number): Message => ({
  info: { role: "assistant" },
  parts: [{ type: "tool", tool: name, state: { status, input, metadata: exitCode === undefined ? {} : { exitCode } } }],
})

const user = (): Message => ({ info: { role: "user" }, parts: [] })

const base = {
  step: 1,
  turn: 1,
  stepsInTurn: 1,
  tokensSinceLastGuard: 5000,
  contextWindow: 100000,
  lastPromptTokens: 40000,
  afterCompaction: false,
}

describe("buildGuardState", () => {
  test("counts the tool calls of the current turn only", () => {
    const { state } = buildGuardState({ ...base, messages: [tool("read"), tool("read"), user(), tool("grep")] })
    expect(state.toolCallsInTurn).toBe(1)
  })

  test("a trailing error streak is measured, an isolated error is not", () => {
    const trailing = buildGuardState({
      ...base,
      messages: [user(), tool("bash", {}, "completed", 0), tool("bash", {}, "completed", 1), tool("bash", {}, "completed", 2)],
    })
    expect(trailing.state.errorStreak).toBe(2)

    const isolated = buildGuardState({
      ...base,
      messages: [user(), tool("bash", {}, "completed", 1), tool("bash", {}, "completed", 0)],
    })
    expect(isolated.state.errorStreak).toBe(0)
  })

  test("an error status counts even without an exit code", () => {
    const { state } = buildGuardState({ ...base, messages: [user(), tool("bash", {}, "error")] })
    expect(state.errorStreak).toBe(1)
  })

  test("the same action twice is a repeat, the same tool with other arguments is not", () => {
    const same = buildGuardState({
      ...base,
      messages: [user(), tool("bash", { command: "bun test" }), tool("bash", { command: "bun test" })],
    })
    expect(same.state.repeatAction).toBe(2)

    const different = buildGuardState({
      ...base,
      messages: [user(), tool("bash", { command: "bun test" }), tool("bash", { command: "bun run typecheck" })],
    })
    expect(different.state.repeatAction).toBe(1)
  })

  test("paths are collected from the fields tools actually use", () => {
    const { state } = buildGuardState({
      ...base,
      messages: [user(), tool("read", { filePath: "src/a.ts" }), tool("grep", { pattern: "src/**" })],
    })
    expect(state.paths).toEqual(["src/a.ts", "src/**"])
  })

  test("context ratio is clamped and missing signals are declared, not invented", () => {
    const { state, signals } = buildGuardState({ ...base, contextWindow: 0, lastPromptTokens: 9000, messages: [user()] })
    expect(state.contextRatio).toBe(0)
    expect(signals.missing).toContain("context_ratio (fenêtre inconnue)")
    expect(signals.missing).toContain("path_match (aucun chemin dans le tour)")
  })

  test("a ratio above one is clamped to one", () => {
    const { state } = buildGuardState({ ...base, contextWindow: 1000, lastPromptTokens: 5000, messages: [user()] })
    expect(state.contextRatio).toBe(1)
  })
})
