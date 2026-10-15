import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { subscribeEvents, type EventStreamState } from "./events"

/**
 * `events.ts` n'avait aucun test : il était la seule pièce du flux non couverte, alors que c'est là
 * que vivait le défaut trouvé en navigateur — un flux ouvert mais muet, qu'`EventSource` ne signale
 * jamais. jsdom ne fournit pas d'`EventSource`, donc on en installe un faux : le test couvre le
 * **câblage** (ouverture, comptage, remplacement, arrêt), pas le comportement du navigateur, qui se
 * prouve sur la pile isolée.
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
    expect(source().url).toContain("/event")
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
    source().onmessage?.({ data: '{"type":"server.heartbeat"}' })
    source().onmessage?.({ data: "pas du json" })
    expect(events).toEqual(["server.heartbeat", "unparsed"])
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
    source().onmessage?.({ data: '{"type":"server.heartbeat"}' })
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
