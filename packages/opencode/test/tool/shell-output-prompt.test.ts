import { describe, expect, test } from "bun:test"
import { render } from "../../src/tool/shell/prompt"
import { tasksAndShellGuidance } from "../../src/session/system"

describe("decision-focused terminal instructions", () => {
  test.each(["bash", "pwsh", "powershell", "cmd"])("%s preserves evidence without default trace dumps", (shell) => {
    const { description } = render(shell, "win32", { maxLines: 120, maxBytes: 4000 }, 60000)
    expect(description).toContain("native summary/quiet modes")
    expect(description).toContain("full stack traces by default")
    expect(description).toContain("preserve the original exit code")
    expect(description).toContain("Do not suppress failures, discard stderr")
    expect(description).toContain("log path")
    expect(description).toContain("120 lines or 4000 bytes")
    expect(description).toContain("safety net, not an output strategy")
    expect(description).not.toContain("or other truncation commands to limit output")
  })

  test("shared agent prompt also covers MCP terminals", () => {
    const guidance = tasksAndShellGuidance({})
    expect(guidance).toContain("Terminal commands: request only the information needed")
    expect(guidance).toContain("full stack traces by default")
    expect(guidance).toContain("Preserve the exit code")
    expect(guidance).toContain("Never hide failures")
    expect(guidance).toContain("independent read-only inspections")
    expect(guidance).toContain("Do not batch speculative work")
    expect(guidance).toContain("read offset/limit")
    expect(guidance).toContain("instead of repeatedly polling")
    expect(guidance).toContain("Delegate non-overlapping scopes")
    expect(guidance).toContain("Verify the returned critical claims")
    expect(guidance).toContain("Batch size is a ceiling, not a quota")
  })
})
