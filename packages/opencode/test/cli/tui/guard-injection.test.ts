import { describe, expect, test } from "bun:test"
import type { Part } from "@opencode-ai/sdk/v2"
import { guardFirings, guardLine, guardsHeading } from "@/cli/cmd/tui/util/guard-injection"

function part(extra: Record<string, unknown>): Part {
  return { id: "p", sessionID: "s", messageID: "m", type: "text", text: "", ...extra } as Part
}

function carrier(firings: unknown, text = ""): Part {
  return part({ text, synthetic: true, ignored: true, metadata: { injection: "guard", firings } })
}

describe("guards injection", () => {
  test("reads the firings the carrier declares, in order", () => {
    const parts = [
      part({ text: "salut" }),
      carrier([
        { origin: "project", name: "render-check", reason: "since_last_tokens>=0 (0)" },
        { origin: "global", name: "proof-before-claim", reason: "tool_calls_in_turn>=6 (11)" },
      ]),
    ]
    expect(guardFirings(parts)).toEqual([
      { origin: "workspace", name: "render-check", reason: "since_last_tokens>=0 (0)" },
      { origin: "global", name: "proof-before-claim", reason: "tool_calls_in_turn>=6 (11)" },
    ])
  })

  // Le serveur écrit `project` : c'est l'affichage qui dit `workspace`, comme la webui. Une
  // confusion des deux mots ferait croire à une garde globale alors qu'elle vient du dépôt.
  test("project is displayed as workspace, anything unknown defaults to workspace", () => {
    expect(guardFirings([carrier([{ origin: "project", name: "a" }])])[0]?.origin).toBe("workspace")
    expect(guardFirings([carrier([{ origin: "n_importe_quoi", name: "b" }])])[0]?.origin).toBe("workspace")
    expect(guardFirings([carrier([{ origin: "global", name: "c" }])])[0]?.origin).toBe("global")
  })

  test("keeps the last carrier and ignores anything malformed", () => {
    const parts = [
      carrier([{ origin: "global", name: "old" }]),
      carrier([{ origin: "global", name: "new" }, { name: "" }, { origin: "global" }, 42, null]),
    ]
    expect(guardFirings(parts).map((firing) => firing.name)).toEqual(["new"])
  })

  test("a carrier without firings, or no carrier at all, yields nothing", () => {
    expect(guardFirings([part({ text: "x" })])).toEqual([])
    expect(guardFirings([carrier(undefined)])).toEqual([])
    expect(guardFirings([carrier("pas un tableau")])).toEqual([])
  })

  test("the heading counts firings, singular included", () => {
    expect(guardsHeading(1)).toBe("guards: 1 tir")
    expect(guardsHeading(3)).toBe("guards: 3 tirs")
  })

  test("a line carries its origin and its reason", () => {
    expect(guardLine({ origin: "global", name: "proof-before-claim", reason: "tool_calls_in_turn>=6 (11)" })).toBe(
      "global/proof-before-claim · tool_calls_in_turn>=6 (11)",
    )
    expect(guardLine({ origin: "workspace", name: "bash-loop" })).toBe("workspace/bash-loop")
  })
})
