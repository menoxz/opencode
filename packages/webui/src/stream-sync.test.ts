import { describe, expect, test } from "vitest"
import {
  activityFromStatus,
  createLatestGate,
  createReloadGate,
  createTicketGuard,
  resyncPlan,
  STREAM_HEARTBEAT_MS,
  STREAM_SILENCE_LIMIT_MS,
  streamSilent,
  threadEventOutcome,
} from "./stream-sync"
import type { Message } from "./view-model"

const base = (): Message[] => [
  { info: { id: "m1", role: "assistant" }, parts: [{ id: "p1", type: "text", text: "bon" }] },
]

const delta = (sessionID: string | undefined, messageID: string, partID: string, text: string) => ({
  type: "message.part.delta",
  properties: {
    ...(sessionID === undefined ? {} : { sessionID }),
    messageID,
    partID,
    field: "text",
    delta: text,
  },
})

describe("ce qu'un événement du fil demande", () => {
  test("un type hors du fil est ignoré, et le dit", () => {
    const outcome = threadEventOutcome(base(), "ses_1", {
      type: "permission.asked",
      properties: { sessionID: "ses_1" },
    })
    expect(outcome).toEqual({ kind: "ignore", reason: "outside the thread" })
  })

  test("un message.* que le réducteur ne traite pas est nommé comme tel", () => {
    const outcome = threadEventOutcome(base(), "ses_1", {
      type: "message.removed",
      properties: { sessionID: "ses_1", messageID: "m1" },
    })
    expect(outcome).toEqual({ kind: "ignore", reason: "not handled (message.removed)" })
  })

  test("l'événement d'une autre session ne touche pas le fil ouvert", () => {
    expect(threadEventOutcome(base(), "ses_1", delta("ses_2", "m1", "p1", "x"))).toEqual({
      kind: "ignore",
      reason: "another session",
    })
  })

  test("aucune session ouverte : rien n'est appliqué", () => {
    expect(threadEventOutcome(base(), undefined, delta("ses_1", "m1", "p1", "x"))).toEqual({
      kind: "ignore",
      reason: "no session open",
    })
  })

  test("un événement sans session est ignoré, pas appliqué au hasard", () => {
    expect(threadEventOutcome(base(), "ses_1", delta(undefined, "m1", "p1", "x"))).toEqual({
      kind: "ignore",
      reason: "no session on the event",
    })
  })

  test("un delta applicable s'applique en place, sans relecture", () => {
    const outcome = threadEventOutcome(base(), "ses_1", delta("ses_1", "m1", "p1", "jour"))
    expect(outcome.kind).toBe("applied")
    if (outcome.kind !== "applied") return
    expect(outcome.messages[0]!.parts![0]!.text).toBe("bonjour")
  })

  test("un delta sur une partie encore inconnue demande une relecture", () => {
    expect(threadEventOutcome(base(), "ses_1", delta("ses_1", "m1", "p9", "x"))).toEqual({
      kind: "resync",
      reason: "unknown message or part (message.part.delta)",
    })
  })

  test("un delta sur un message encore inconnu demande une relecture", () => {
    expect(threadEventOutcome(base(), "ses_1", delta("ses_1", "m9", "p1", "x"))).toEqual({
      kind: "resync",
      reason: "unknown message or part (message.part.delta)",
    })
  })

  test("retirer une partie absente ne change rien, et ne relit pas", () => {
    expect(
      threadEventOutcome(base(), "ses_1", {
        type: "message.part.removed",
        properties: { sessionID: "ses_1", messageID: "m1", partID: "p9" },
      }),
    ).toEqual({ kind: "ignore", reason: "nothing to change (message.part.removed)" })
  })

  test("une partie nouvelle est ajoutée au message connu", () => {
    // Forme relevée sur le fil : `properties` porte la partie **aplatie** (`messageID` avec elle),
    // pas un champ `part` — c'est la leçon consignée dans `view-model.ts`.
    const outcome = threadEventOutcome(base(), "ses_1", {
      type: "message.part.updated",
      properties: { sessionID: "ses_1", messageID: "m1", id: "p2", type: "text", text: "suite" },
    })
    expect(outcome.kind).toBe("applied")
    if (outcome.kind !== "applied") return
    expect(outcome.messages[0]!.parts!.map((part) => part.id)).toEqual(["p1", "p2"])
  })
})

describe("ce qu'une (re)connexion demande de relire", () => {
  test("le premier branchement ne relit pas le fil", () => {
    expect(resyncPlan(undefined, { connected: true, reconnects: 0 })).toEqual([
      "permissions",
      "questions",
      "sessions",
    ])
  })

  test("une coupure fait relire le fil et l'état d'activité", () => {
    expect(resyncPlan({ connected: false, reconnects: 1 }, { connected: true, reconnects: 1 })).toEqual([
      "permissions",
      "questions",
      "sessions",
      "messages",
      "activity",
    ])
  })

  test("n'avoir jamais été connecté est un premier branchement, pas une coupure", () => {
    // Le flux émet son état dès l'abonnement (`connected:false`, `reconnects:0`) : compter cela comme
    // une coupure ferait relire le fil entier à chaque ouverture de page.
    expect(resyncPlan({ connected: false, reconnects: 0 }, { connected: true, reconnects: 0 })).toEqual([
      "permissions",
      "questions",
      "sessions",
    ])
  })

  test("un compteur de reconnexions qui monte suffit, même sans avoir vu la coupure", () => {
    expect(resyncPlan({ connected: true, reconnects: 1 }, { connected: true, reconnects: 2 })).toHaveLength(5)
  })

  test("rester connecté sans reconnexion ne relit rien", () => {
    expect(resyncPlan({ connected: true, reconnects: 0 }, { connected: true, reconnects: 0 })).toEqual([])
  })

  test("un flux déconnecté ne demande rien", () => {
    expect(resyncPlan({ connected: true, reconnects: 0 }, { connected: false, reconnects: 0 })).toEqual([])
  })
})

describe("la garde d'ordre des relectures", () => {
  test("une réponse plus ancienne que la dernière acceptée n'écrit pas", () => {
    const guard = createTicketGuard()
    const first = guard.issue()
    const second = guard.issue()
    expect(guard.accept(second)).toBe(true)
    expect(guard.accept(first)).toBe(false)
  })

  test("un jeton déjà accepté n'est pas accepté deux fois", () => {
    const guard = createTicketGuard()
    const token = guard.issue()
    expect(guard.accept(token)).toBe(true)
    expect(guard.accept(token)).toBe(false)
  })

  test("les jetons sont monotones", () => {
    const guard = createTicketGuard()
    expect([guard.issue(), guard.issue(), guard.issue()]).toEqual([1, 2, 3])
  })
})

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const flush = () => new Promise<void>((done) => setTimeout(done, 0))

describe("la porte des relectures", () => {
  test("une seule en vol, une seule en attente — la dernière demande gagne", async () => {
    const gate = createReloadGate()
    const runs: string[] = []
    const hold = deferred()
    const run = async (key: string) => {
      runs.push(key)
      if (key === "a") await hold.promise
    }
    gate.request("a", run)
    expect(gate.inFlight()).toBe("a")
    gate.request("b", run)
    gate.request("c", run)
    expect(gate.queued()).toBe("c")
    hold.resolve()
    await flush()
    expect(runs).toEqual(["a", "c"])
    expect(gate.idle()).toBe(true)
  })

  test("demander la même cible pendant qu'elle est en vol ne la double pas", async () => {
    const gate = createReloadGate()
    let count = 0
    const hold = deferred()
    const run = async () => {
      count += 1
      await hold.promise
    }
    gate.request("ses_1", run)
    gate.request("ses_1", run)
    gate.request("ses_1", run)
    hold.resolve()
    await flush()
    expect(count).toBe(1)
    expect(gate.idle()).toBe(true)
  })

  test("une relecture qui échoue ne fige pas la porte", async () => {
    const gate = createReloadGate()
    const runs: string[] = []
    const run = async (key: string) => {
      runs.push(key)
      if (key === "a") throw new Error("réseau")
    }
    gate.request("a", run)
    await flush()
    expect(gate.idle()).toBe(true)
    gate.request("b", run)
    await flush()
    expect(runs).toEqual(["a", "b"])
  })
})

describe("l'activité relue par REST", () => {
  test("busy et retry comptent comme du travail", () => {
    expect(activityFromStatus({ ses_1: { type: "busy" } }, "ses_1")).toBe(true)
    expect(activityFromStatus({ ses_1: { type: "retry" } }, "ses_1")).toBe(true)
  })

  test("idle, session absente et carte absente valent l'arrêt", () => {
    expect(activityFromStatus({ ses_1: { type: "idle" } }, "ses_1")).toBe(false)
    expect(activityFromStatus({ ses_1: { type: "idle" } }, "ses_2")).toBe(false)
    expect(activityFromStatus(undefined, "ses_1")).toBe(false)
    expect(activityFromStatus({}, undefined)).toBe(false)
  })
})

describe("le silence du flux", () => {
  test("rien reçu depuis l'ouverture n'est pas un silence", () => {
    expect(streamSilent(undefined, 1_000_000)).toBe(false)
  })

  test("trois battements manqués ne suffisent pas encore", () => {
    expect(streamSilent(1_000, 1_000 + STREAM_SILENCE_LIMIT_MS)).toBe(false)
  })

  test("au-delà, le flux est muet et doit être remplacé", () => {
    expect(streamSilent(1_000, 1_000 + STREAM_SILENCE_LIMIT_MS + 1)).toBe(true)
  })

  test("la limite se déduit du battement du serveur, pas d'un chiffre choisi", () => {
    expect(STREAM_HEARTBEAT_MS).toBe(10_000)
    expect(STREAM_SILENCE_LIMIT_MS).toBe(3 * STREAM_HEARTBEAT_MS)
  })
})

describe("la porte « la derniere valeur gagne »", () => {
  test("une image ne rend que le dernier etat : les valeurs intermediaires sont fusionnees", () => {
    const gate = createLatestGate<number[]>()
    gate.push([1])
    gate.push([1, 2])
    gate.push([1, 2, 3])
    expect(gate.pending()).toBe(true)
    expect(gate.flush()).toEqual([1, 2, 3])
    // Rendue une fois : la deuxieme lecture ne rejoue rien, sans quoi une image rendrait deux fois.
    expect(gate.flush()).toBeUndefined()
    expect(gate.pending()).toBe(false)
  })

  test("pousser apres une lecture arme de nouveau la porte", () => {
    const gate = createLatestGate<string>()
    gate.push("a")
    expect(gate.flush()).toBe("a")
    gate.push("b")
    expect(gate.flush()).toBe("b")
  })

  test("rien de pousse n'est pas une valeur : flush rend undefined", () => {
    const gate = createLatestGate<number[]>()
    expect(gate.pending()).toBe(false)
    expect(gate.flush()).toBeUndefined()
  })

  test("reset jette la valeur en attente — une relecture REST est autoritaire", () => {
    const gate = createLatestGate<number[]>()
    gate.push([9, 9])
    gate.reset()
    expect(gate.pending()).toBe(false)
    expect(gate.flush()).toBeUndefined()
  })

  test("la porte garde l'identite de la valeur poussee, sans la copier", () => {
    const gate = createLatestGate<{ parts: number }>()
    const value = { parts: 1 }
    gate.push(value)
    expect(gate.flush()).toBe(value)
  })
})
