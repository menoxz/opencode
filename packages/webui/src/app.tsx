import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import {
  buildFilePart,
  filePartLabel,
  fileSizeLabel,
  isImageMime,
  validateAttachment,
  type Attachment,
} from "./attachments"
import { client, credentials, fetchHealth, rememberCredentials, serverUrl, type Health } from "./client"
import {
  Brand,
  ChatMessage,
  FolderRow,
  ModelCard,
  PermissionPanel,
  SectionLabel,
  SessionRow,
  StatusBar,
  StatusPanel,
  TitleBar,
  ToolCall,
} from "./components"
import { subscribeEvents, type ServerEvent, type EventStreamState } from "./events"
import { agentCount, currentModel, mcpCounts, mcpRows, summarizeStatus, type McpStatus } from "./status"
import { sessionTimestamp } from "./time"
import {
  dropPermission,
  reducePermissions,
  type PermissionReply,
  type PermissionRequest,
  type ToolState,
} from "./view-model"

type SessionInfo = { id: string; title?: string; time?: { updated?: number; created?: number } }

type Part =
  | { type: "text"; text?: string }
  | { type: "tool"; id: string; tool: string; state: ToolState }
  | { type: "file"; mime?: string; filename?: string; url?: string }
  | { type: string; text?: string }

type Message = { info: { id: string; role: string }; parts: Part[] }

const MAX_EVENTS = 60
const DIR_KEY = "oc.webui.directory"

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
  const [workspaceOpen, setWorkspaceOpen] = createSignal(true)

  // Credentials are read once at boot: the SDK client and the SSE connection are both built with
  // them, so saving reloads the page (see `rememberCredentials`).
  const [authOpen, setAuthOpen] = createSignal(false)
  const [authUser, setAuthUser] = createSignal(credentials?.username ?? "")
  const [authPass, setAuthPass] = createSignal(credentials?.password ?? "")

  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [attachError, setAttachError] = createSignal<string | undefined>()

  // Panneaux annexes, à droite : la disposition prévoit plusieurs panneaux, donc des onglets.
  const [rightTab, setRightTab] = createSignal<"events" | "permissions" | "status">("events")
  const [mcp, setMcp] = createSignal<Record<string, McpStatus>>({})
  const [config, setConfig] = createSignal<{ model?: string; agent?: Record<string, unknown> } | undefined>()

  /** Horloge figée par rendu : évite que chaque ligne recalcule un temps différent. */
  const now = () => Date.now()

  /**
   * Every SDK method takes `directory` as a query parameter, so switching the working directory
   * needs no client rebuild — the value is threaded into each call instead.
   */
  const scope = () => (directory().trim() ? { directory: directory().trim() } : {})

  /** Nom du workspace affiché dans l'arborescence : le dossier de travail, ou son défaut serveur. */
  const workspaceName = () => {
    const value = directory().trim() || serverPath() || ""
    if (!value) return "workspace"
    const parts = value.split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] ?? value
  }

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

  /** Alimente le panneau Statut et la carte modèle : MCP et configuration. */
  const loadStatus = async () => {
    const [mcpResult, configResult] = await Promise.all([
      client.mcp.status(scope()).catch(() => undefined),
      client.config.get(scope()).catch(() => undefined),
    ])
    const mcpData = (mcpResult as { data?: Record<string, McpStatus> } | undefined)?.data
    if (mcpData && typeof mcpData === "object") setMcp(mcpData)
    const configData = (configResult as { data?: { model?: string; agent?: Record<string, unknown> } } | undefined)?.data
    if (configData) setConfig(configData)
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

  /**
   * Lit un fichier en data URL — la forme que `FilePartInput.url` attend, relevée dans le SDK et
   * confirmée par l'usage de l'app existante (`build-request-parts.ts:190`, `url: attachment.dataUrl`).
   */
  const readAsDataUrl = (file: File, mime: string) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener("error", () => resolve(""))
      reader.addEventListener("load", () => {
        const value = typeof reader.result === "string" ? reader.result : ""
        const separator = value.indexOf(",")
        resolve(separator === -1 ? "" : `data:${mime};base64,${value.slice(separator + 1)}`)
      })
      reader.readAsDataURL(file)
    })

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setAttachError(undefined)
    const accepted: Attachment[] = []
    for (const file of Array.from(files)) {
      const mime = file.type || "application/octet-stream"
      const problem = validateAttachment({ size: file.size, mime, filename: file.name })
      if (problem) {
        setAttachError(problem)
        continue
      }
      const dataUrl = await readAsDataUrl(file, mime)
      if (!dataUrl) {
        setAttachError(`Lecture impossible : « ${file.name} »`)
        continue
      }
      accepted.push({
        id: `${file.name}:${file.size}:${accepted.length}`,
        mime,
        filename: file.name,
        dataUrl,
        size: file.size,
      })
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted])
  }

  const removeAttachment = (id: string) => setAttachments((current) => current.filter((item) => item.id !== id))

  const send = async (event: SubmitEvent) => {
    event.preventDefault()
    const sessionID = active()
    const text = draft().trim()
    const files = attachments()
    if (!sessionID || (!text && files.length === 0)) return
    setDraft("")
    setAttachments([])
    setAttachError(undefined)
    const parts = [...(text ? [{ type: "text" as const, text }] : []), ...files.map(buildFilePart)]
    const result = await client.session
      .promptAsync({ sessionID, parts, ...scope() })
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
    void loadStatus()
  }

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }))

  onMount(async () => {
    setHealth(await fetchHealth())
    await loadPath()
    await loadSessions()
    await loadPermissions()
    await loadStatus()

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
          // Une demande est bloquante : elle ouvre son onglet plutôt que d'attendre d'être trouvée.
          if (event.type === "permission.asked") setRightTab("permissions")
        }
        if (event.type === "session.created" || event.type === "session.deleted") void loadSessions()

        const sessionID = active()
        if (sessionID && JSON.stringify(event.properties ?? {}).includes(sessionID)) void loadMessages(sessionID)
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

  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([])

  const renderPart = (part: Part) => {
    if (part.type === "text") return <p class="part text">{part.text ?? ""}</p>
    if (part.type === "file") {
      const file = part as Extract<Part, { type: "file" }>
      const label = filePartLabel(file)
      return (
        <div class="part file">
          <Show when={isImageMime(file.mime ?? "") && file.url} fallback={<span class="fileicon">▤</span>}>
            <img class="attach-preview" src={file.url} alt={label} />
          </Show>
          <span class="fname">{label}</span>
        </div>
      )
    }
    if (part.type !== "tool") return <p class="part">{part.type}</p>

    const toolPart = part as Extract<Part, { type: "tool" }>
    return (
      <ToolCall
        tool={toolPart.tool}
        state={toolPart.state}
        open={Boolean(expanded()[toolPart.id])}
        onToggle={() => toggle(toolPart.id)}
      />
    )
  }

  const envTone = () => (!health()?.healthy ? "error" : stream().connected ? "ok" : "warn")
  const envLabel = () =>
    !health()?.healthy ? "serveur injoignable" : stream().connected ? "session locale · connecté" : "flux interrompu"

  const mcpSummary = () => {
    const { connected, total } = mcpCounts(mcp())
    if (total === 0) return "aucun serveur MCP"
    return `mcp ${connected}/${total} · agents ${agentCount(config())}`
  }

  return (
    <div class="layout">
      <TitleBar
        version={health()?.version ?? "—"}
        context={workspaceName()}
        envLabel={envLabel()}
        envTone={envTone() as "ok" | "warn" | "error"}
      >
        <Show when={permissions().length > 0}>
          <span class="pill warn">{permissions().length} permission(s)</span>
        </Show>
        <Show
          when={authOpen()}
          fallback={
            <button
              class="icon"
              title="Identifiants du serveur (OPENCODE_SERVER_USERNAME / PASSWORD)"
              onClick={() => setAuthOpen(true)}
            >
              {credentials ? "auth ✓" : "auth"}
            </button>
          }
        >
          <form
            class="authform"
            onSubmit={(event) => {
              event.preventDefault()
              rememberCredentials({ username: authUser(), password: authPass() })
            }}
          >
            <input
              type="text"
              placeholder="utilisateur"
              value={authUser()}
              onInput={(event) => setAuthUser(event.currentTarget.value)}
            />
            <input
              type="password"
              placeholder="mot de passe"
              value={authPass()}
              onInput={(event) => setAuthPass(event.currentTarget.value)}
            />
            <button class="icon" type="submit">
              appliquer
            </button>
            <button class="icon" type="button" onClick={() => rememberCredentials(undefined)}>
              effacer
            </button>
            <button class="icon" type="button" onClick={() => setAuthOpen(false)}>
              fermer
            </button>
          </form>
        </Show>
        <label class="dirfield">
          <span>dossier</span>
          <input
            type="text"
            placeholder={serverPath() ?? "répertoire du serveur"}
            value={directory()}
            onChange={(event) => applyDirectory(event.currentTarget.value)}
          />
        </label>
        <code class="url">{serverUrl || "même origine"}</code>
      </TitleBar>

      <aside class="sidebar">
        <Brand name="opencodev2" tagline="agent généraliste" />

        <button class="newSession" onClick={createSession}>
          <span class="plus">+</span> Nouvelle session
        </button>

        <input
          class="search"
          type="search"
          placeholder="⌕ Rechercher une session…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />

        <SectionLabel label="Sessions" trailing={String(sessions().length)} />

        <div class="ws">
          <div class="wsGroup">
            <FolderRow
              name={workspaceName()}
              count={sessions().length}
              open={workspaceOpen()}
              onToggle={() => setWorkspaceOpen((value) => !value)}
            />
            <Show when={workspaceOpen()}>
              <div class="sessions">
                <For each={sessions()}>
                  {(session) => (
                    <Show
                      when={renaming() === session.id}
                      fallback={
                        <SessionRow
                          title={session.title || "(sans titre)"}
                          time={sessionTimestamp(session)}
                          now={now()}
                          active={session.id === active()}
                          running={false}
                          onSelect={() => void selectSession(session.id)}
                        >
                          <span class="rowActions">
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
                        </SessionRow>
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
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div class="sidebar-foot">
          <ModelCard
            model={currentModel(config()) ?? "défaut du serveur"}
            sub={mcpSummary()}
            tone={currentModel(config()) ? "ok" : "off"}
          />
        </div>
      </aside>

      <main class="thread">
        <Show when={error()}>
          <p class="error">{error()}</p>
        </Show>

        <Show
          when={active()}
          fallback={
            <div class="empty-state">
              <p class="empty">Choisis ou crée une session pour commencer.</p>
            </div>
          }
        >
          <div class="chat">
            <For each={messages()}>
              {(message) => (
                <ChatMessage
                  role={message.info.role}
                  avatar={message.info.role === "user" ? "MOI" : "OC"}
                >
                  <For each={message.parts}>{(part) => renderPart(part)}</For>
                </ChatMessage>
              )}
            </For>
          </div>

          <form class="chat-input" onSubmit={send}>
            <Show when={attachments().length > 0}>
              <ul class="pending">
                <For each={attachments()}>
                  {(item) => (
                    <li>
                      <Show when={isImageMime(item.mime)} fallback={<span class="fileicon">▤</span>}>
                        <img class="thumb" src={item.dataUrl} alt={item.filename} />
                      </Show>
                      <span class="fname">{item.filename}</span>
                      <span class="fsize">{fileSizeLabel(item.size)}</span>
                      <button class="icon danger" type="button" title="Retirer" onClick={() => removeAttachment(item.id)}>
                        ✕
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={attachError()}>{(message) => <p class="error">{message()}</p>}</Show>
            <span class="ci-model">{currentModel(config()) ?? "modèle par défaut"}</span>
            <textarea
              rows="2"
              placeholder="Décrire une tâche, coller un contexte, joindre un fichier…"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
            />
            <label class="icon attach" title="Joindre des fichiers">
              +
              <input
                class="hidden-input"
                type="file"
                multiple
                onChange={(event) => {
                  void addFiles(event.currentTarget.files)
                  // Remis à zéro pour qu'attacher deux fois le même fichier soit possible.
                  event.currentTarget.value = ""
                }}
              />
            </label>
            <button class="chat-send" type="submit" disabled={!draft().trim() && attachments().length === 0}>
              Envoyer
            </button>
          </form>
        </Show>
      </main>

      <aside class="panels">
        <div class="tabs" role="tablist">
          <button class="tab" classList={{ active: rightTab() === "events" }} onClick={() => setRightTab("events")}>
            <span class="t-dot" /> Événements
          </button>
          <button
            class="tab"
            classList={{ active: rightTab() === "permissions" }}
            onClick={() => setRightTab("permissions")}
          >
            <span class="t-dot" /> Permissions
            <Show when={permissions().length > 0}>
              <span class="count">{permissions().length}</span>
            </Show>
          </button>
          <button class="tab" classList={{ active: rightTab() === "status" }} onClick={() => setRightTab("status")}>
            <span class="t-dot" /> Statut
          </button>
        </div>

        <Show when={rightTab() === "events"}>
          <div class="panelbody">
            <Show when={stream().lastError}>
              <p class="error">{stream().lastError}</p>
            </Show>
            <ul class="eventlist">
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
          </div>
        </Show>

        <Show when={rightTab() === "permissions"}>
          <div class="panelbody">
            <Show when={permissions().length > 0} fallback={<p class="empty">Aucune permission en attente.</p>}>
              <For each={permissions()}>
                {(request) => (
                  <PermissionPanel request={request} onReply={(reply) => void replyPermission(request, reply)} />
                )}
              </For>
            </Show>
          </div>
        </Show>

        <Show when={rightTab() === "status"}>
          <div class="panelbody">
            <StatusPanel
              lines={summarizeStatus({
                health: health(),
                config: config(),
                mcp: mcp(),
                pendingPermissions: permissions().length,
              })}
              rows={mcpRows(mcp())}
            />
          </div>
        </Show>
      </aside>

      <StatusBar
        left={[
          { label: health()?.healthy ? "connecté" : "déconnecté", tone: health()?.healthy ? "ok" : "error" },
          { label: stream().connected ? "flux actif" : "flux interrompu", tone: stream().connected ? "ok" : "warn" },
          { label: `${sessions().length} sessions` },
          { label: `reconnexions ${stream().reconnects}` },
        ]}
        right={[
          { label: `⎇ ${workspaceName()}` },
          { label: mcpSummary() },
          { label: currentModel(config()) ?? "modèle par défaut" },
        ]}
      />
    </div>
  )
}
