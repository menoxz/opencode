import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { subscribeEvents, unwrapGlobalEvent, type EventStreamState } from "./events"

/**
 * `events.ts` n'avait aucun test : il était la seule pièce du flux non couverte, alors que c'est là
 * que vivait le défaut trouvé en navigateur — un flux ouvert mais muet, qu'`EventSource` ne signale
 * jamais. jsdom ne fournit pas d'`EventSource`, donc on en installe un faux : le test couvre le
 * **câblage** (ouverture, comptage, remplacement, arrêt), pas le comportement du navigateur, qui se
 * prouve sur la pile isolée.
 *
 * Le fil consommé est `/global/event` : son message est **enveloppé** (`{directory, payload}`), donc
 * les charges de test ci-dessous portent cette enveloppe — la forme aplatie d'avant n'existe pas sur
 * ce fil, et un test qui la porterait ne décrirait rien de réel.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = []

  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }
}

const original = globalThis.EventSource

beforeEach(() => {
  FakeEventSource.instances = []
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource
})

afterEach(() => {
  ;(globalThis as { EventSource?: unknown }).EventSource = original
})

/** Un message tel que le serveur l'écrit : l'événement du bus sous `payload`. */
function frame(payload: Record<string, unknown>): { data: string } {
  return { data: JSON.stringify({ directory: "C:\\jeanluc\\opencode-fork", payload }) }
}
function heartbeat(): { data: string } {
  return frame({ id: "evt_1", type: "server.heartbeat", properties: {} })
}

function harness() {
  const states: EventStreamState[] = []
  const events: string[] = []
  const subscription = subscribeEvents({
    onEvent: (event) => events.push(event.type),
    onState: (state) => states.push(state),
  })
  return {
    subscription,
    states,
    events,
    last: () => states[states.length - 1]!,
    source: () => FakeEventSource.instances[FakeEventSource.instances.length - 1]!,
  }
}

describe("l'abonnement au flux", () => {
  test("un flux neuf ouvre une source et publie un état déconnecté, pas de silence", () => {
    const { subscription, last, source } = harness()
    expect(FakeEventSource.instances).toHaveLength(1)
    // Le fil **global** : le fil d'instance (`/event`) est borné à un dossier, donc muet pour toute
    // session ouverte ailleurs. C'est cette borne qui laissait l'écran figé.
    expect(source().url).toContain("/global/event")
    expect(last()).toEqual({ connected: false, reconnects: 0 })
    expect(subscription.watchdog(Date.now() + 60_000)).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  test("l'ouverture et la perte de connexion se lisent dans l'état publié", () => {
    const { last, source } = harness()
    source().onopen?.()
    expect(last()).toEqual({ connected: true, reconnects: 0 })
    source().onerror?.()
    expect(last()).toEqual({
      connected: false,
      reconnects: 1,
      lastError: "connexion perdue, nouvelle tentative…",
    })
  })

  test("un message est transmis à l'appelant, un message illisible ne casse rien", () => {
    const { events, source } = harness()
    source().onmessage?.(heartbeat())
    source().onmessage?.({ data: "pas du json" })
    expect(events).toEqual(["server.heartbeat", "unparsed"])
  })

  test("une charge sans `payload` exploitable n'est pas transmise", () => {
    const { events, source } = harness()
    source().onmessage?.(frame({ id: "evt_1" }))
    source().onmessage?.({ data: JSON.stringify({ payload: {} }) })
    expect(events).toEqual([])
  })
})

describe("le chien de garde", () => {
  test("un flux muet au-delà de la limite est remplacé, et la reconnexion est comptée", () => {
    const { subscription, last, source } = harness()
    const first = source()
    first.onopen?.()
    // Le contrôle passe toutes les 10 s : au bout de 31 s de silence, trois battements sont manqués.
    expect(subscription.watchdog(Date.now() + 31_000)).toBe(true)
    expect(first.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(2)
    // Une reconnexion comptée est ce qui demande à l'appelant de relire ce qui a été manqué.
    expect(last().reconnects).toBe(1)
  })

  test("un flux qui vient de battre n'est pas remplacé", () => {
    const { subscription, source } = harness()
    source().onopen?.()
    source().onmessage?.(heartbeat())
    expect(subscription.watchdog(Date.now() + 5_000)).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  test("un flux déjà déconnecté n'est pas remplacé : EventSource réessaie seul", () => {
    const { subscription, source } = harness()
    source().onopen?.()
    source().onerror?.()
    expect(subscription.watchdog(Date.now() + 60_000)).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  test("arrêter ferme le flux et désarme le chien de garde", () => {
    const { subscription, source, last } = harness()
    source().onopen?.()
    subscription.stop()
    expect(source().closed).toBe(true)
    expect(last().connected).toBe(false)
    expect(subscription.watchdog(Date.now() + 60_000)).toBe(false)
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})

/**
 * L'enveloppe du fil global, sur des charges **relevées** le 2026-10-17 (`/global/event`, un tour
 * réel) — pas reconstruites depuis un schéma : c'est précisément l'écart entre les deux qui a laissé
 * le fil muet pendant que les tests passaient.
 */
describe("l'enveloppe du fil global", () => {
  test("un événement de bus est déballé avec ses propriétés intactes", () => {
    const event = unwrapGlobalEvent({
      directory: "C:\\jeanluc\\opencode-fork",
      project: "987d8a40",
      payload: {
        id: "evt_149517ac4001dwhjt6OcPWIF8Z",
        type: "message.part.updated",
        properties: {
          sessionID: "ses_eb6b00afcffe",
          part: { type: "text", text: "yo.", messageID: "msg_1", sessionID: "ses_eb6b00afcffe", id: "prt_1" },
          time: 1792231439043,
        },
      },
    })
    expect(event?.type).toBe("message.part.updated")
    expect(event?.id).toBe("evt_149517ac4001dwhjt6OcPWIF8Z")
    // La partie reste **imbriquée** sous `part` : c'est le réducteur qui la lit là. L'aplatir ici
    // ferait porter au transport une décision qui appartient au modèle de vue.
    expect((event?.properties?.part as { id?: string })?.id).toBe("prt_1")
    expect(event?.properties?.sessionID).toBe("ses_eb6b00afcffe")
  })

  test("l'enveloppe `sync` est ignorée : le bus a déjà livré le même fait à plat", () => {
    // Relevé : 18 enveloppes `sync` sur un tour, doublons des événements ci-dessus. Les appliquer
    // deux fois serait inoffensif mais faux ; l'app de référence les saute aussi
    // (`packages/app/src/context/server-sdk.tsx:151`).
    expect(
      unwrapGlobalEvent({
        directory: "C:\\jeanluc\\opencode-fork",
        payload: { type: "sync", id: "evt_1", syncEvent: { type: "message.part.updated", data: {} } },
      }),
    ).toBeUndefined()
  })

  test("le battement et l'accusé de connexion sont des événements à part entière", () => {
    expect(unwrapGlobalEvent({ payload: { id: "evt_1", type: "server.connected", properties: {} } })?.type).toBe(
      "server.connected",
    )
    expect(unwrapGlobalEvent({ payload: { id: "evt_2", type: "server.heartbeat", properties: {} } })?.type).toBe(
      "server.heartbeat",
    )
  })

  test("une charge absente ou malformée ne lève pas", () => {
    expect(unwrapGlobalEvent(undefined)).toBeUndefined()
    expect(unwrapGlobalEvent(null)).toBeUndefined()
    expect(unwrapGlobalEvent("nope")).toBeUndefined()
    expect(unwrapGlobalEvent({})).toBeUndefined()
    expect(unwrapGlobalEvent({ payload: {} })).toBeUndefined()
    expect(unwrapGlobalEvent({ payload: { type: 12 } })).toBeUndefined()
  })

  test("des propriétés absentes deviennent un objet vide, jamais undefined", () => {
    expect(unwrapGlobalEvent({ payload: { id: "e", type: "session.updated" } })?.properties).toEqual({})
  })
})
