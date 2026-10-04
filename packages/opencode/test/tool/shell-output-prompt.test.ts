import { describe, expect, test } from "bun:test"
import { render } from "../../src/tool/shell/prompt"

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

  test.each(["bash", "pwsh", "powershell", "cmd"])(
    "%s carries the cross-shell portability note",
    (shell) => {
      const { description } = render(shell, "win32", { maxLines: 120, maxBytes: 4000 }, 60000)
      expect(description).toContain("Syntax is NOT portable across shells")
      expect(description).toContain("Select-Object")
      expect(description).toContain("Select-String")
    },
  )
})
