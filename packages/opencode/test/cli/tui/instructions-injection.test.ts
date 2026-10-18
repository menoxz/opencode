import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import {
  instructionSources,
  instructionsHeading,
  instructionsInjecting,
} from "@/cli/cmd/tui/util/instructions-injection"

function part(extra: Record<string, unknown>): Part {
  return { id: "p", sessionID: "s", messageID: "m", type: "text", text: "", ...extra } as Part
}

describe("instructions injection", () => {
  test("reads the sources the carrier declares, in order", () => {
    const parts = [
      part({ text: "salut" }),
      part({
        synthetic: true,
        ignored: true,
        metadata: {
          injection: "instructions",
          sources: ["Instructions from: C:\\a\\AGENTS.md", "Instructions from: C:\\b\\AGENTS.md"],
        },
      }),
      part({ text: "suite" }),
    ]

    expect(instructionSources(parts)).toEqual([
      "Instructions from: C:\\a\\AGENTS.md",
      "Instructions from: C:\\b\\AGENTS.md",
    ])
  })

  test("keeps the last carrier and ignores anything that is not a declared string", () => {
    const parts = [
      part({ metadata: { injection: "instructions", sources: ["old"] } }),
      part({ metadata: { injection: "instructions", sources: ["new", 42, null, { path: "x" }] } }),
    ]

    expect(instructionSources(parts)).toEqual(["new"])
  })

  test("without a carrier nothing is invented from the text", () => {
    expect(instructionSources([part({ text: "Instructions from: C:\\faux\\AGENTS.md" })])).toEqual([])
    expect(instructionSources([part({ metadata: { injection: "other", sources: ["x"] } })])).toEqual([])
    expect(instructionSources([part({ metadata: { injection: "instructions" } })])).toEqual([])
    expect(instructionSources([part({ metadata: { injection: "instructions", sources: "x" } })])).toEqual([])
  })

  test("the heading counts, and never announces zero", () => {
    expect(instructionsHeading(1)).toBe("core/instructions: 1 source")
    expect(instructionsHeading(3)).toBe("core/instructions: 3 sources")
  })

  /**
   * Le spinner ne dit pas « le tour tourne » mais « les instructions entrent dans le
   * contexte » : dès que la part qui porte les sources est écrite, l'injection est finie et
   * l'animation doit s'arrêter, même si la réponse continue de couler.
   */
  test("no source yet means injecting, and any source ends the animation", () => {
    expect(instructionsHeading(0)).toBe("core/instructions: injecting")
    expect(instructionsInjecting([], true)).toBe(true)
    expect(instructionsInjecting([], false)).toBe(false)
    expect(instructionsInjecting(["Instructions from: a"], true)).toBe(false)
  })
})
