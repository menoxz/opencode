import { withAuthToken } from "./auth"
import { credentials, serverUrl } from "./client"
import { STREAM_SILENCE_LIMIT_MS, streamSilent } from "./stream-sync"

/** Shape observed on the wire: `{"id":"evt_…","type":"server.connected","properties":{}}`. */
export type ServerEvent = {
  id?: string
  type: string
  properties?: Record<string, unknown>
}

export type EventStreamState = {
  connected: boolean
  /** Number of times the stream was re-established after a drop. */
  reconnects: number
  lastError?: string
}

type Handlers = {
  onEvent: (event: ServerEvent) => void
  onState: (state: EventStreamState) => void
}

export type EventSubscription = {
  /** Closes the stream for good. */
  stop: () => void
  /**
   * Watchdog: replaces a stream that is **open but silent**. Returns `true` when it re-opened.
   *
   * `EventSource` only reconnects when the socket actually fails, so an open socket that never
   * delivers anything never fires `onerror` — the page would stay silently frozen while the
   * indicator reads "connected". The server beats every 10 seconds, so silence is measurable;
   * the verdict itself is pure and lives in `stream-sync.ts` (`streamSilent`).
   */
  watchdog: (now: number) => boolean
}

/**
 * Subscribes to the instance event stream.
 *
 * `EventSource` is used deliberately: it reconnects on its own, which is what the SSE contract
 * needs. It cannot send custom headers, so authentication goes through the query fallback the
 * server provides for exactly that case (`?auth_token=`, see `auth.ts`).
 */
export function subscribeEvents({ onEvent, onState }: Handlers): EventSubscription {
  const state: EventStreamState = { connected: false, reconnects: 0 }
  let source: EventSource | undefined
  let stopped = false
  /** Horodatage du dernier signe de vie reçu — c'est lui que le silence se mesure contre. */
  let lastEventAt: number | undefined

  const emit = () => onState({ ...state })

  const open = () => {
    if (stopped) return
    source = new EventSource(withAuthToken(`${serverUrl}/event`, credentials))

    source.onopen = () => {
      state.connected = true
      state.lastError = undefined
      // L'ouverture est un signe de vie : sans cela, un flux qui vient d'être rouvert serait
      // déclaré muet par le chien de garde au battement suivant.
      lastEventAt = Date.now()
      emit()
    }

    source.onmessage = (message) => {
      lastEventAt = Date.now()
      try {
        onEvent(JSON.parse(message.data) as ServerEvent)
      } catch {
        onEvent({ type: "unparsed", properties: { raw: message.data } })
      }
    }

    source.onerror = () => {
      // EventSource retries by itself; only the state is reported here.
      if (state.connected) state.reconnects += 1
      state.connected = false
      state.lastError = "connexion perdue, nouvelle tentative…"
      emit()
    }
  }

  open()
  emit()

  return {
    stop: () => {
      stopped = true
      source?.close()
      state.connected = false
      emit()
    },
    watchdog: (now) => {
      if (stopped || !state.connected) return false
      if (!streamSilent(lastEventAt, now, STREAM_SILENCE_LIMIT_MS)) return false
      // Muet depuis trois battements : on remplace le flux au lieu d'attendre un `onerror` qui ne
      // viendra pas. Compter une reconnexion est ce qui demande à l'appelant de relire ce qui a été
      // manqué pendant le silence.
      state.reconnects += 1
      state.connected = false
      state.lastError = "flux muet, reconnexion…"
      lastEventAt = now
      emit()
      source?.close()
      open()
      return true
    },
  }
}
