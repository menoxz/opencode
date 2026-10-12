import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import { client, fetchHealth, serverUrl, type Health } from "./client"
import { subscribeEvents, type ServerEvent, type EventStreamState } from "./events"
import {
  dropPermission,
  permissionActions,
  reducePermissions,
  toolDetail,
  toolStatusLabel,
  toolTitle,
  type PermissionReply,
  type PermissionRequest,
  type ToolState,
} from "./view-model"

type SessionInfo = { id: string; title?: string; time?: { updated?: number } }

type Part =
  | { type: "text"; text?: string }
  | { type: "tool"; id: string; tool: string; state: ToolState }
  | { type: string; text?: string }

type Message = { info: { id: string; role: string }; parts: Part[] }

const MAX_EVENTS = 60
const DIR_KEY = "oc.webui.directory"

const REPLY_LABEL: Record<PermissionReply, string> = {
  once: "Autoriser une fois",
  always: "Toujours autoriser",
  reject: "Refuser",
}

export default function App() {
  const [health, setHealth] = createSignal<Health | undefined>()
  const [sessions, setSessions] = createSignal<SessionInfo[]>([])
  const [active, setActive] = createSignal<string | undefined>()
  const [messages, setMessages] = createSignal<Message[]>([])
  const [events, setEvents] = createSignal<ServerEvent[]>([])
  const [stream, setStream] = createSignal<EventStreamState>({ connected: false, reconnects: 0 })
  const [draft, setDraft] = createSignal("")
  const [error, setError] = createSignal<string | undefined>()

  const [directory, setDirectory] = createSignal(localStorage.getItem(DIR_KEY) ?? "")
  const [serverPath, setServerPath] = createSignal<string | undefined>()
  const [query, setQuery] = createSignal("")
  const [renaming, setRenaming] = createSignal<string | undefined>()
  const [renameDraft, setRenameDraft] = createSignal("")
  // Inline confirmation instead of window.confirm: a native dialog blocks automation and cannot
  // be styled. Two clicks on the same row, no modal.
  const [confirming, setConfirming] = createSignal<string | undefined>()

  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

  /**
   * Every SDK method takes `directory` as a query parameter, so switching the working directory
   * needs no client rebuild — the value is threaded into each call instead.
   */
  const scope = () => (directory().trim() ? { directory: directory().trim() } : {})

  const loadPath = async () => {
    const result = await client.path.get(scope()).catch(() => undefined)
    // Observed shape: { home, state, config, worktree, directory } — not `cwd`/`root`.
    const data = (result as { data?: { directory?: string; worktree?: string } } | undefined)?.data
    setServerPath(data?.directory ?? data?.worktree)
  }

  const loadSessions = async () => {
    const search = query().trim()
    const result = await client.session
      .list({ ...scope(), ...(search ? { search } : {}) })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    const data = (result as { data?: SessionInfo[] } | undefined)?.data
    if (Array.isArray(data)) setSessions(data)
  }

  const loadMessages = async (sessionID: string) => {
    const result = await client.session.messages({ sessionID, ...scope() }).catch(() => undefined)
    const data = (result as { data?: Message[] } | undefined)?.data
    setMessages(Array.isArray(data) ? data : [])
  }

  const loadPermissions = async () => {
    const result = await client.permission.list(scope()).catch(() => undefined)
    const data = (result as { data?: PermissionRequest[] } | undefined)?.data
    if (Array.isArray(data)) setPermissions(data)
  }

  const selectSession = async (sessionID: string) => {
    setActive(sessionID)
    setError(undefined)
    await loadMessages(sessionID)
  }

  const createSession = async () => {
    const result = await client.session.create(scope()).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    const created = (result as { data?: SessionInfo } | undefined)?.data
    await loadSessions()
    if (created?.id) await selectSession(created.id)
  }

  const startRename = (session: SessionInfo) => {
    setRenaming(session.id)
    setRenameDraft(session.title ?? "")
  }

  const commitRename = async () => {
    const sessionID = renaming()
    if (!sessionID) return
    const title = renameDraft().trim()
    setRenaming(undefined)
    if (!title) return
    await client.session.update({ sessionID, title, ...scope() }).catch((cause: unknown) => setError(String(cause)))
    await loadSessions()
  }

  const removeSession = async (session: SessionInfo) => {
    setConfirming(undefined)
    await client.session.delete({ sessionID: session.id, ...scope() }).catch((cause: unknown) => {
      setError(String(cause))
      return undefined
    })
    if (active() === session.id) {
      setActive(undefined)
      setMessages([])
    }
    await loadSessions()
  }

  const replyPermission = async (request: PermissionRequest, reply: PermissionReply) => {
    // Optimistic removal: the server also emits `permission.replied`, which is authoritative.
    setPermissions((current) => dropPermission(current, request.id))
    const result = await client.permission
      .reply({ requestID: request.id, reply, ...scope() })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (!result) await loadPermissions()
    const sessionID = active()
    if (sessionID) await loadMessages(sessionID)
  }

  const send = async (event: SubmitEvent) => {
    event.preventDefault()
    const sessionID = active()
    const text = draft().trim()
    if (!sessionID || !text) return
    setDraft("")
    const result = await client.session
      .promptAsync({ sessionID, parts: [{ type: "text", text }], ...scope() })
      .catch((cause: unknown) => {
        setError(String(cause))
        return undefined
      })
    if (result) await loadMessages(sessionID)
  }

  const applyDirectory = (value: string) => {
    setDirectory(value)
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(DIR_KEY, trimmed)
    else localStorage.removeItem(DIR_KEY)
    setActive(undefined)
    setMessages([])
    void loadPath()
    void loadSessions()
    void loadPermissions()
  }

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }))

  const refreshFor = (sessionID: string) => {
    void loadMessages(sessionID)
  }

  onMount(async () => {
    setHealth(await fetchHealth())
    await loadPath()
    await loadSessions()
    await loadPermissions()

    const healthTimer = setInterval(async () => setHealth(await fetchHealth()), 10_000)
    // Debounced search: the list endpoint takes `search`, so the server does the filtering.
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    createEffect(() => {
      query()
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => void loadSessions(), 250)
    })

    // Tracks transitions so a recovered stream can re-sync what it missed while down.
    let wasConnected = false

    const unsubscribe = subscribeEvents({
      onEvent: (event) => {
        setEvents((current) => [event, ...current].slice(0, MAX_EVENTS))

        if (event.type === "permission.asked" || event.type === "permission.replied") {
          setPermissions((current) => reducePermissions(current, event))
        }
        if (event.type === "session.created" || event.type === "session.deleted") void loadSessions()

        const sessionID = active()
        if (sessionID && JSON.stringify(event.properties ?? {}).includes(sessionID)) refreshFor(sessionID)
      },
      onState: (state) => {
        setStream(state)
        // A dropped stream means events were missed while it was down. Without this re-sync, a
        // permission asked during the outage would never surface — observed in P5: the pill read
        // "SSE connecté" while a pending request stayed invisible until a manual reload.
        if (state.connected && !wasConnected) {
          wasConnected = true
          void loadPermissions()
          void loadSessions()
        }
        if (!state.connected) wasConnected = false
      },
    })

    onCleanup(() => {
      clearInterval(healthTimer)
      clearTimeout(searchTimer)
      unsubscribe()
    })
  })

  const renderPart = (part: Part) => {
    if (part.type === "text") return <p class="part text">{part.text ?? ""}</p>
    if (part.type !== "tool") return <p class="part">{part.type}</p>

    const toolPart = part as Extract<Part, { type: "tool" }>
    const state = toolPart.state
    const open = () => Boolean(expanded()[toolPart.id])

    return (
      <div class={`tool ${state.status}`}>
        <button class="toolhead" onClick={() => toggle(toolPart.id)}>
          <span class="toolname">{toolPart.tool}</span>
          <span class={`badge ${state.status}`}>{toolStatusLabel(state)}</span>
          <Show when={toolTitle(state)}>{(title) => <span class="tooltitle">{title()}</span>}</Show>
          <span class="chevron">{open() ? "▾" : "▸"}</span>
        </button>
        <Show when={open()}>
          <div class="tooldetail">
            <Show when={toolDetail(state).input}>{(input) => <pre class="io">{input()}</pre>}</Show>
            <Show when={toolDetail(state).output}>{(output) => <pre class="io out">{output()}</pre>}</Show>
            <Show when={toolDetail(state).error}>{(error) => <pre class="io err">{error()}</pre>}</Show>
          </div>
        </Show>
      </div>
    )
  }

  return (
    <div class="layout">
      <header class="topbar">
        <strong>opencodev2</strong>
        <span class={`pill ${stream().connected ? "ok" : "down"}`}>
          {stream().connected ? "SSE connecté" : "SSE déconnecté"}
        </span>
        <span class={`pill ${health()?.healthy ? "ok" : "down"}`}>
          {health()?.healthy ? "serveur joignable" : "serveur injoignable"}
        </span>
        <Show when={permissions().length > 0}>
          <span class="pill warn">{permissions().length} permission(s) en attente</span>
        </Show>
        <span class="spacer" />
        <label class="dirfield">
          <span>Dossier</span>
          <input
            type="text"
            placeholder={serverPath() ?? "répertoire du serveur"}
            value={directory()}
            onChange={(event) => applyDirectory(event.currentTarget.value)}
          />
        </label>
        <code class="url">{serverUrl || "même origine"}</code>
      </header>

      <aside class="sidebar">
        <button class="primary" onClick={createSession}>
          Nouvelle session
        </button>
        <input
          class="search"
          type="search"
          placeholder="Rechercher…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <ul class="sessions">
          <For each={sessions()}>
            {(session) => (
              <li classList={{ selected: session.id === active() }}>
                <Show
                  when={renaming() === session.id}
                  fallback={
                    <div class="row" onClick={() => void selectSession(session.id)}>
                      <span class="title">{session.title || "(sans titre)"}</span>
                      <code class="id">{session.id.slice(0, 12)}</code>
                      <span class="actions">
                        <button
                          class="icon"
                          title="Renommer"
                          onClick={(event) => {
                            event.stopPropagation()
                            startRename(session)
                          }}
                        >
                          ✎
                        </button>
                        <Show
                          when={confirming() === session.id}
                          fallback={
                            <button
                              class="icon danger"
                              title="Supprimer"
                              onClick={(event) => {
                                event.stopPropagation()
                                setConfirming(session.id)
                              }}
                            >
                              ✕
                            </button>
                          }
                        >
                          <button
                            class="icon danger"
                            title="Confirmer la suppression"
                            onClick={(event) => {
                              event.stopPropagation()
                              void removeSession(session)
                            }}
                          >
                            confirmer
                          </button>
                          <button
                            class="icon"
                            title="Annuler"
                            onClick={(event) => {
                              event.stopPropagation()
                              setConfirming(undefined)
                            }}
                          >
                            annuler
                          </button>
                        </Show>
                      </span>
                    </div>
                  }
                >
                  <input
                    class="rename"
                    autofocus
                    value={renameDraft()}
                    onInput={(event) => setRenameDraft(event.currentTarget.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitRename()
                      if (event.key === "Escape") setRenaming(undefined)
                    }}
                  />
                </Show>
              </li>
            )}
          </For>
        </ul>
      </aside>

      <main class="thread">
        <Show when={error()}>
          <p class="error">{error()}</p>
        </Show>

        <For each={permissions()}>
          {(request) => (
            <div class="permission">
              <div class="ptitle">
                Permission demandée : <strong>{request.permission}</strong>
              </div>
              <Show when={request.patterns.length > 0}>
                <ul class="patterns">
                  <For each={request.patterns}>{(pattern) => <li>{pattern}</li>}</For>
                </ul>
              </Show>
              <div class="pactions">
                <For each={permissionActions(request)}>
                  {(action) => (
                    <button
                      class={action === "reject" ? "danger" : "primary"}
                      onClick={() => void replyPermission(request, action)}
                    >
                      {REPLY_LABEL[action]}
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>

        <Show when={active()} fallback={<p class="empty">Choisis ou crée une session.</p>}>
          <For each={messages()}>
            {(message) => (
              <article class={`message ${message.info.role}`}>
                <header>{message.info.role}</header>
                <For each={message.parts}>{(part) => renderPart(part)}</For>
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
