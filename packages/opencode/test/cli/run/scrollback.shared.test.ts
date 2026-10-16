import { describe, expect, test } from "bun:test"
import { TextAttributes } from "@opentui/core"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { entryFailed, entryLook } from "@/cli/cmd/run/scrollback.shared"
import { RUN_THEME_FALLBACK } from "@/cli/cmd/run/theme"
import type { StreamCommit } from "@/cli/cmd/run/types"

function commit(input: { tool: string; exit?: unknown }): StreamCommit {
  return {
    kind: "tool",
    text: "",
    phase: "final",
    source: "tool",
    tool: input.tool,
    toolState: "completed",
    part: {
      id: `${input.tool}-1`,
      sessionID: "session-1",
      messageID: `msg-${input.tool}`,
      type: "tool",
      callID: `call-${input.tool}`,
      tool: input.tool,
      state: {
        status: "completed",
        input: {},
        output: "",
        title: "",
        metadata: input.exit === undefined ? {} : { exit: input.exit },
        time: { start: 1, end: 2 },
      },
    } as ToolPart,
  }
}

/**
 * Un exit non nul doit se voir : c'est la seule chose qui distingue une commande qui rate
 * d'une qui réussit, et elle vit dans la métadonnée de l'outil — `state.status`, lui, reste
 * `completed` parce que l'outil n'a pas échoué.
 */
describe("run entry look", () => {
  test("a non-zero shell exit is a failure and reads as one", () => {
    const failed = commit({ tool: "bash", exit: 1 })
    expect(entryFailed(failed)).toBe(true)
    expect(entryLook(failed, RUN_THEME_FALLBACK.entry)).toEqual({
      fg: RUN_THEME_FALLBACK.entry.error.body,
      attrs: TextAttributes.BOLD,
    })
  })

  test("exit 0 and an absent exit stay silent successes", () => {
    expect(entryFailed(commit({ tool: "bash", exit: 0 }))).toBe(false)
    expect(entryFailed(commit({ tool: "bash" }))).toBe(false)
  })

  test("an exit code carried by another tool is not a shell failure", () => {
    expect(entryFailed(commit({ tool: "edit", exit: 1 }))).toBe(false)
  })
})
