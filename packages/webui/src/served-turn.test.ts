import { describe, expect, test } from "vitest"
import { servedTurn, type TurnView } from "./view-model"

/**
 * Le tour que le run sert est le plus ancien prompt **dont le tour n'est pas clos** : la file du
 * serveur est FIFO et l'ancrage est sur cet index. Un prompt envoyé pendant qu'un autre tourne
 * est plus récent, donc en attente — il ne doit pas annoncer une injection qui n'a pas commencé.
 */
function turn(id: string, reason?: string): TurnView {
  return {
    id,
    prompt: [{ id: `p-${id}` }],
    steps: reason === undefined ? [] : [{ index: 1, items: [], reason }],
  } as unknown as TurnView
}

describe("servedTurn — quel tour le run sert", () => {
  test("le plus ancien prompt non clos est celui que le run sert", () => {
    const turns = [turn("u1", "stop"), turn("u2"), turn("u3")]
    expect(servedTurn(turns)?.id).toBe("u2")
  })

  test("un prompt en file derrière un tour qui travaille n'annonce rien", () => {
    const turns = [turn("u1", "tool-calls"), turn("u2")]
    expect(servedTurn(turns)?.id).toBe("u1")
  })

  test("aucun tour ouvert : plus rien n'est servi", () => {
    expect(servedTurn([turn("u1", "stop"), turn("u2", "length")])).toBeUndefined()
    expect(servedTurn([])).toBeUndefined()
  })
})
