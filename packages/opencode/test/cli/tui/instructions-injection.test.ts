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
    expect(instructionsInjecting({ sources: [], busy: true, compaction: false })).toBe(true)
    expect(instructionsInjecting({ sources: [], busy: false, compaction: false })).toBe(false)
    expect(instructionsInjecting({ sources: ["Instructions from: a"], busy: true, compaction: false })).toBe(false)
  })

  /**
   * Le message qui déclenche une compaction ne reçoit **jamais** de sources : son prompt est
   * rejoué dans un message neuf après le résumé. La ligne y restait donc sur `injecting`
   * pendant toute la compaction et tout le tour suivant, la session n'étant pas au repos
   * (constaté sur une session réelle, 2026-10-20).
   */
  test("a compaction turn never announces an injection", () => {
    expect(instructionsInjecting({ sources: [], busy: true, compaction: true })).toBe(false)
  })

  /**
   * Un prompt envoyé pendant qu'un autre tourne attend en file : le run ne l'a pas encore pris,
   * donc rien n'entre dans le contexte. La ligne s'affichait pourtant, avant même l'injection,
   * et son animation survivait à l'injection une fois le prompt servi par la file.
   */
  test("a queued prompt never announces an injection", () => {
    expect(instructionsInjecting({ sources: [], busy: true, compaction: false, pending: true })).toBe(false)
  })

  test("a prompt the run already answered no longer animates", () => {
    expect(instructionsInjecting({ sources: [], busy: true, compaction: false, answered: true })).toBe(false)
  })

  test("the server being busy elsewhere does not animate a settled prompt", () => {
    // busy vient de la session, pas du prompt : un prompt sans réponse mais déjà servi par un
    // run doit cesser d'animer, même si la session reste occupée par un tour plus récent.
    expect(
      instructionsInjecting({ sources: [], busy: true, compaction: false, pending: false, answered: true }),
    ).toBe(false)
  })
})
