import { serverUrl } from "./client"

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

/**
 * Subscribes to the instance event stream.
 *
 * `EventSource` is used deliberately: it reconnects on its own, which is what the SSE contract
 * needs. It cannot send custom headers, so an authenticated server
 * (`OPENCODE_SERVER_PASSWORD`) is not supported yet — that limitation is recorded in
 * docs/web-ui/PROGRESS.md rather than silently ignored.
 */
export function subscribeEvents({ onEvent, onState }: Handlers): () => void {
  const state: EventStreamState = { connected: false, reconnects: 0 }
  let source: EventSource | undefined
  let stopped = false

  const emit = () => onState({ ...state })

  const open = () => {
    if (stopped) return
    source = new EventSource(`${serverUrl}/event`)

    source.onopen = () => {
      state.connected = true
      state.lastError = undefined
      emit()
    }

    source.onmessage = (message) => {
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

  return () => {
    stopped = true
    source?.close()
    state.connected = false
    emit()
  }
}
