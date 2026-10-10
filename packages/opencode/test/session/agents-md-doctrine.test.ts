import { readFileSync } from "node:fs"
import * as path from "node:path"
import { describe, expect, test } from "bun:test"

/**
 * Doctrine guard for `packages/opencode/AGENTS.md`.
 *
 * That file is versioned and re-injected once per turn, so every instruction it
 * carries is binding on any agent working in this repo. It used to prescribe
 * `tmux` to run the dev server: a POSIX-only multiplexer that is absent from the
 * declared win32/pwsh profile, and whose `new-session -d` is exactly the detached
 * launch the global contract forbids.
 *
 * `test/session/context-budget.test.ts` cannot catch this: it writes a synthetic
 * AGENTS.md into a temp directory and never reads this file. This test reads the
 * real file, so it is red before the fix and green after it.
 */
const agentsMd = path.resolve(import.meta.dir, "../../AGENTS.md")

describe("packages/opencode/AGENTS.md doctrine", () => {
  const source = readFileSync(agentsMd, "utf-8")

  test("does not prescribe a POSIX-only multiplexer for the dev server", () => {
    const offenders = source
      .split("\n")
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter((entry) => /\btmux\b/.test(entry.text))
      .map((entry) => `${entry.line}: ${entry.text.trim()}`)
    expect(offenders).toEqual([])
  })

  test("prescribes a managed terminal driven through an explicit handle", () => {
    // Non-vacuity: the guard above is only meaningful while the section exists.
    expect(source).toContain("mcp-terminal_command_run")
    expect(source).toContain("mcp-terminal_command_cancel")
  })
})
