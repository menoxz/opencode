import { describe, expect, test } from "bun:test"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { MessageV2 } from "../../src/session/message-v2"
import { PromptQueue } from "../../src/session/prompt-queue"

const SID = "ses-steer-pending-test" as unknown as SessionID

function user(id: string, parts: MessageV2.Part[] = []): MessageV2.WithParts {
  return {
    info: {
      id: MessageID.ascending(id),
      role: "user",
      sessionID: SID,
      time: { created: 1 },
      agent: "build",
      model: {
        providerID: "test" as MessageV2.User["model"]["providerID"],
        modelID: "test-model" as MessageV2.User["model"]["modelID"],
      },
    },
    parts,
  }
}

function assistant(id: string, parent: string, opts?: { finish?: string }): MessageV2.WithParts {
  return {
    info: {
      id: MessageID.ascending(id),
      role: "assistant",
      parentID: MessageID.ascending(parent),
      sessionID: SID,
      mode: "build",
      agent: "build",
      cost: 0,
      path: { cwd: "/", root: "/" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: "test-model" as MessageV2.Assistant["modelID"],
      providerID: "test" as MessageV2.Assistant["providerID"],
      time: { created: 2 },
      ...(opts?.finish !== undefined ? { finish: opts.finish } : {}),
    } as MessageV2.Assistant,
    parts: [],
  }
}

const steerText = (extra?: { steerDelivered?: boolean }): MessageV2.Part =>
  ({
    id: PartID.ascending("prt-steer"),
    type: "text",
    text: "va plus vite",
    metadata: { steer: true, ...extra },
  }) as unknown as MessageV2.Part

/**
 * Un steer est un prompt envoyé dans le run **déjà en cours** : le run doit le servir lui-même,
 * au step suivant, comme une interjection. S'il s'arrêtait là, un run neuf s'ancrait sur ce
 * prompt et ouvrait un second tour — le steer arrivait alors comme une nouvelle demande, et
 * l'injection directe dans la session en cours n'avait jamais lieu.
 */
describe("hasPendingSteer", () => {
  test("a steer newer than the anchored turn keeps the run open", () => {
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "stop" }), user("msg0500", [steerText()])]
    expect(PromptQueue.hasPendingSteer(msgs)).toBe(true)
  })

  test("once an assistant answers after it, the steer is served and the run may settle", () => {
    const msgs = [
      user("msg0001"),
      assistant("msg0100", "msg0001", { finish: "stop" }),
      user("msg0500", [steerText()]),
      assistant("msg0600", "msg0001", { finish: "stop" }),
    ]
    expect(PromptQueue.hasPendingSteer(msgs)).toBe(false)
  })

  test("a plain queued prompt is not a steer and never holds the run open", () => {
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "stop" }), user("msg0002")]
    expect(PromptQueue.hasPendingSteer(msgs)).toBe(false)
  })
})

describe("isPendingSteerFor", () => {
  const anchor = MessageID.ascending("msg0001")

  test("a steer newer than the anchor and unanswered is delivered as the reminder only", () => {
    const steer = user("msg0500", [steerText()])
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "stop" }), steer]
    expect(PromptQueue.isPendingSteerFor(msgs, steer, anchor)).toBe(true)
  })

  test("a steer that became the run's anchor is a normal prompt, not an interjection", () => {
    const steer = user("msg0500", [steerText()])
    expect(PromptQueue.isPendingSteerFor([steer], steer, steer.info.id)).toBe(false)
  })

  test("an answered steer is history, not a pending interjection", () => {
    const steer = user("msg0500", [steerText()])
    const msgs = [user("msg0001"), steer, assistant("msg0600", "msg0001", { finish: "stop" })]
    expect(PromptQueue.isPendingSteerFor(msgs, steer, anchor)).toBe(false)
  })

  test("a plain user prompt is never mistaken for a steer", () => {
    const plain = user("msg0002")
    expect(PromptQueue.isPendingSteerFor([user("msg0001"), plain], plain, anchor)).toBe(false)
  })

  /**
   * Régression mesurée en live le 2026-10-22 : un steer arrivé pendant un run était classé
   * `already-delivered` une seconde après son envoi (`injected=0`), donc il attendait la fin du
   * tour au lieu de partir au step suivant. Cause : l'appelant passait `lastUser.id` — or le steer
   * *devient* le dernier message utilisateur, donc `id > lastUser.id` est faux et il se range
   * lui-même parmi les livrés. L'ancre du run est la seule référence valable.
   */
  test("a steer that is itself the latest user is still pending for the run that anchors earlier", () => {
    const steer = user("msg0500", [steerText()])
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "tool-calls" }), steer]

    // Ancre du run (msg0001) : le steer est bien pendant, donc à injecter.
    expect(PromptQueue.isPendingSteerFor(msgs, steer, String(anchor))).toBe(true)

    // Dernier message utilisateur (= le steer lui-même) : il se déclare livré, ce qui est
    // exactement le bug du site d'appel. Ce cas doit rester faux pour documenter la cause.
    expect(PromptQueue.isPendingSteerFor(msgs, steer, String(steer.info.id))).toBe(false)
  })
})

/**
 * Régression mesurée en live le 2026-10-22 : le steer était bien injecté pendant le run (le modèle
 * le lisait), puis un **second tour** le rejouait après la fin — la réponse arrivait hors du tour
 * visible. Cause : `steerServed` cherche un assistant d'id supérieur au steer, or un tour chaîné
 * n'écrit qu'un assistant, créé *avant* l'arrivée du steer. Le steer restait donc « pendant » pour
 * toujours et `loop()` ré-armait sur lui. Le reçu durable ferme ce tour.
 */
describe("isSteerDelivered — le reçu de livraison ferme le tour", () => {
  const anchor = MessageID.ascending("msg0001")

  test("un steer livré n'est plus pendant, même sans assistant plus récent", () => {
    const delivered = user("msg0500", [steerText({ steerDelivered: true })])
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "stop" }), delivered]

    expect(PromptQueue.isSteerDelivered(delivered)).toBe(true)
    // Aucun assistant n'a d'id supérieur au steer : c'est exactement le cas d'un tour chaîné.
    expect(PromptQueue.steerServed(msgs, delivered.info.id)).toBe(false)
    // Il ne doit donc plus être ni ré-armé ni réinjecté.
    expect(PromptQueue.pendingUserID(msgs)).toBeUndefined()
    expect(PromptQueue.isPendingSteerFor(msgs, delivered, String(anchor))).toBe(false)
  })

  test("un steer pas encore livré reste pendant", () => {
    const fresh = user("msg0500", [steerText()])
    const msgs = [user("msg0001"), assistant("msg0100", "msg0001", { finish: "stop" }), fresh]

    expect(PromptQueue.isSteerDelivered(fresh)).toBe(false)
    expect(PromptQueue.pendingUserID(msgs)).toBe(MessageID.ascending("msg0500"))
    expect(PromptQueue.isPendingSteerFor(msgs, fresh, String(anchor))).toBe(true)
  })
})
