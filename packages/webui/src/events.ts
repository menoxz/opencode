import { withAuthToken } from "./auth"
import { credentials, serverUrl } from "./client"
import { STREAM_SILENCE_LIMIT_MS, streamSilent } from "./stream-sync"

/** Shape observed on the wire: `{"id":"evt_…","type":"server.connected","properties":{}}`. */
export type ServerEvent = {
  id?: string
  type: string
  properties?: Record<string, unknown>
}

/**
 * Déballe un événement du fil **global**, dont l'enveloppe diffère de celle du fil d'instance.
 *
 * Forme relevée sur le serveur (2026-10-17, un tour réel) :
 *
 *   {"directory":"C:\\…","project":"987d…","payload":{"id":"evt_…","type":"message.part.updated",
 *    "properties":{"sessionID":"ses_…","part":{…},"time":178…}}}
 *
 * `payload` est l'événement du bus tel quel, sauf pour les événements **synchronisés** (SyncEvent),
 * que le serveur émet une **seconde** fois sous `{type:"sync", syncEvent:{…}}` : c'est un doublon
 * interne, et l'app de référence l'ignore aussi (`packages/app/src/context/server-sdk.tsx:151`).
 * On le saute ici pour ne pas appliquer deux fois le même fait.
 *
 * Rend `undefined` quand il n'y a rien à traiter — le battement et l'accusé de connexion, eux,
 * portent bien un `payload`.
 */
export function unwrapGlobalEvent(data: unknown): ServerEvent | undefined {
  if (!data || typeof data !== "object") return undefined
  const payload = (data as { payload?: unknown }).payload
  if (!payload || typeof payload !== "object") return undefined
  const type = (payload as { type?: unknown }).type
  if (typeof type !== "string" || type === "sync") return undefined
  const properties = (payload as { properties?: unknown }).properties
  const id = (payload as { id?: unknown }).id
  return {
    ...(typeof id === "string" ? { id } : {}),
    type,
    properties: properties && typeof properties === "object" ? (properties as Record<string, unknown>) : {},
  }
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
 * Subscribes to the **global** event stream.
 *
 * The instance stream (`/event`) is scoped to one directory: the middleware resolves the instance
 * from `?directory=` (or `x-opencode-directory`) and falls back to the server's own `process.cwd()`
 * (`middleware/workspace-routing.ts:86-88`). Measured on 2026-10-17: creating a session in
 * `C:\jeanluc\opencode-fork` produced `session.created` on `/event?directory=…` and **nothing** on
 * `/event` — the UI was deaf to every session outside the server's launch directory, so the only
 * way to see a turn was to reload the page (REST resolves a session's own directory, the SSE
 * cannot). `/global/event` carries every instance's events with their `directory`, which is what
 * the reference app consumes (`packages/app/src/context/server-sdk.tsx:132`).
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
    source = new EventSource(withAuthToken(`${serverUrl}/global/event`, credentials))

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
      let parsed: unknown
      try {
        parsed = JSON.parse(message.data)
      } catch {
        onEvent({ type: "unparsed", properties: { raw: message.data } })
        return
      }
      const event = unwrapGlobalEvent(parsed)
      if (event) onEvent(event)
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
