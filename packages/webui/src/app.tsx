import { createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { client, fetchHealth, serverUrl, type Health } from "./client"
import { subscribeEvents, type ServerEvent, type EventStreamState } from "./events"

type SessionInfo = { id: string; title?: string; time?: { updated?: number } }
type Part = { type: string; text?: string; tool?: string; state?: { status?: string } }
type Message = { info: { id: string; role: string }; parts: Part[] }

const MAX_EVENTS = 60

export default function App() {
  const [health, setHealth] = createSignal<Health | undefined>()
  const [sessions, setSessions] = createSignal<SessionInfo[]>([])
  const [active, setActive] = createSignal<string | undefined>()
  const [messages, setMessages] = createSignal<Message[]>([])
  const [events, setEvents] = createSignal<ServerEvent[]>([])
  const [stream, setStream] = createSignal<EventStreamState>({ connected: false, reconnects: 0 })
  const [draft, setDraft] = createSignal("")
  const [error, setError] = createSignal<string | undefined>()

  const loadSessions = async () => {
    const result = await client.session.list({}).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    const data = (result as { data?: SessionInfo[] } | undefined)?.data
    if (Array.isArray(data)) setSessions(data)
  }

  const loadMessages = async (sessionID: string) => {
    const result = await client.session.messages({ sessionID }).catch(() => undefined)
    const data = (result as { data?: Message[] } | undefined)?.data
    setMessages(Array.isArray(data) ? data : [])
  }

  const selectSession = async (sessionID: string) => {
    setActive(sessionID)
    setError(undefined)
    await loadMessages(sessionID)
  }

  const createSession = async () => {
    const result = await client.session.create({}).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    const created = (result as { data?: SessionInfo } | undefined)?.data
    await loadSessions()
    if (created?.id) await selectSession(created.id)
  }

  const send = async (event: SubmitEvent) => {
    event.preventDefault()
    const sessionID = active()
    const text = draft().trim()
    if (!sessionID || !text) return
    setDraft("")
    const result = await client.session
      .promptAsync({ sessionID, parts: [{ type: "text", text }] })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (result) await loadMessages(sessionID)
  }

  onMount(async () => {
    setHealth(await fetchHealth())
    await loadSessions()
    const timer = setInterval(async () => setHealth(await fetchHealth()), 10_000)
    const unsubscribe = subscribeEvents({
      onEvent: (event) => {
        setEvents((current) => [event, ...current].slice(0, MAX_EVENTS))
        const sessionID = active()
        // A part/message event for the open session means the transcript is stale.
        if (sessionID && JSON.stringify(event.properties ?? {}).includes(sessionID)) {
          void loadMessages(sessionID)
        }
      },
      onState: (state) => setStream(state),
    })
    onCleanup(() => {
      clearInterval(timer)
      unsubscribe()
    })
  })

  const partText = (part: Part) => {
    if (part.type === "text") return part.text ?? ""
    if (part.type === "tool") return `outil ${part.tool ?? "?"} — ${part.state?.status ?? "?"}`
    return part.type
  }

  return (
    <div class="layout">
      <header class="topbar">
        <strong>opencodev2</strong>
        <span class={`pill ${stream().connected ? "ok" : "down"}`}>
          {stream().connected ? "SSE connecté" : "SSE déconnecté"}
        </span>
        <span class={`pill ${health()?.healthy ? "ok" : "down"}`}>
          {health()?.healthy ? `serveur ${health()?.version}` : "serveur injoignable"}
        </span>
        <Show when={stream().reconnects > 0}>
          <span class="pill warn">{stream().reconnects} reconnexions</span>
        </Show>
        <span class="spacer" />
        <code class="url">{serverUrl || "même origine (proxy dev)"}</code>
      </header>

      <aside class="sidebar">
        <button class="primary" onClick={createSession}>
          Nouvelle session
        </button>
        <ul class="sessions">
          <For each={sessions()}>
            {(session) => (
              <li classList={{ selected: session.id === active() }} onClick={() => void selectSession(session.id)}>
                <span class="title">{session.title || "(sans titre)"}</span>
                <code class="id">{session.id.slice(0, 12)}</code>
              </li>
            )}
          </For>
        </ul>
      </aside>

      <main class="thread">
        <Show when={error()}>
          <p class="error">{error()}</p>
        </Show>
        <Show when={active()} fallback={<p class="empty">Choisis ou crée une session.</p>}>
          <For each={messages()}>
            {(message) => (
              <article class={`message ${message.info.role}`}>
                <header>{message.info.role}</header>
                <For each={message.parts}>{(part) => <p class={`part ${part.type}`}>{partText(part)}</p>}</For>
              </article>
            )}
          </For>
          <form class="composer" onSubmit={send}>
            <textarea
              rows="3"
              placeholder="Écris ton message…"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
            />
            <button class="primary" type="submit" disabled={!draft().trim()}>
              Envoyer
            </button>
          </form>
        </Show>
      </main>

      <aside class="events">
        <h2>Flux d'événements</h2>
        <Show when={stream().lastError}>
          <p class="error">{stream().lastError}</p>
        </Show>
        <ul>
          <For each={events()}>
            {(event) => (
              <li>
                <code>{event.type}</code>
                <Show when={event.properties && Object.keys(event.properties).length > 0}>
                  <span class="props">{JSON.stringify(event.properties).slice(0, 120)}</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </aside>
    </div>
  )
}
