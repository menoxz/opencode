/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { useTheme } from "@tui/context/theme"
import { useBindings } from "../../keymap"
import type { AssistantMessage, Message, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, For, Show } from "solid-js"
import { ROUTE_CONFIG, ROUTE_LOGS } from "./navbar"

const id = "internal:session-logs"

export function currentSessionID(api: TuiPluginApi) {
  const current = api.route.current
  if (current.name !== "session") return
  const sessionID = "params" in current ? current.params?.sessionID : undefined
  return typeof sessionID === "string" ? sessionID : undefined
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString()
}

function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim()
  return clean.length > max ? clean.slice(0, max - 3) + "..." : clean
}

export function partLabel(part: Part) {
  switch (part.type) {
    case "text":
      return truncate(part.text, 120) || "(empty text)"
    case "reasoning":
      return truncate(part.text, 120) || "(reasoning)"
    case "tool": {
      const state = part.state
      const detail =
        state.status === "completed"
          ? truncate(state.title || state.output, 100)
          : state.status === "error"
            ? truncate(state.error, 100)
            : state.status
      return `${part.tool} (${state.status}) ${detail}`
    }
    case "step-start":
      return "step start"
    case "step-finish":
      return `step finish · ${part.tokens.input}in ${part.tokens.output}out · $${part.cost.toFixed(4)}`
    case "subtask":
      return `subtask · ${part.agent} · ${truncate(part.description, 80)}`
    case "agent":
      return `agent · ${part.name}`
    case "file":
      return `file · ${part.filename ?? part.mime}`
    case "patch":
      return `patch · ${part.files.length} file(s)`
    case "snapshot":
      return "snapshot"
    case "retry":
      return `retry #${part.attempt}`
    case "compaction":
      return part.auto ? "compaction (auto)" : "compaction"
    default:
      return "part"
  }
}

function Turn(props: { api: TuiPluginApi; message: Message; index: number }) {
  const { theme } = useTheme()
  const parts = createMemo(() => props.api.state.part(props.message.id))
  const assistant = createMemo(() =>
    props.message.role === "assistant" ? (props.message as AssistantMessage) : undefined,
  )
  const user = createMemo(() => (props.message.role === "user" ? (props.message as UserMessage) : undefined))

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      marginTop={props.index === 0 ? 0 : 1}
      border={["left"]}
      borderColor={props.message.role === "user" ? theme.secondary : theme.primary}
      paddingLeft={2}
      backgroundColor={theme.backgroundPanel}
    >
      <box flexDirection="row" gap={2} flexShrink={0}>
        <text fg={theme.textMuted}>{`#${props.index + 1}`}</text>
        <text fg={props.message.role === "user" ? theme.secondary : theme.primary}>
          <b>{props.message.role}</b>
        </text>
        <text fg={theme.textMuted}>{clock(props.message.time.created)}</text>
        <Show when={user()}>
          <text fg={theme.textMuted}>{`${user()!.agent} · ${user()!.model.providerID}/${user()!.model.modelID}`}</text>
        </Show>
        <Show when={assistant()}>
          <text fg={theme.textMuted}>
            {`${assistant()!.agent} · ${assistant()!.providerID}/${assistant()!.modelID} · ${assistant()!.tokens.input}in ${assistant()!.tokens.output}out · $${assistant()!.cost.toFixed(4)}`}
          </text>
        </Show>
        <Show when={assistant()?.error}>
          <text fg={theme.error}>error</text>
        </Show>
        <Show when={assistant() && !assistant()!.time.completed}>
          <text fg={theme.warning}>running</text>
        </Show>
      </box>
      <For each={parts()}>
        {(part) => (
          <text fg={part.type === "tool" ? theme.text : part.type === "reasoning" ? theme.textMuted : theme.text} wrapMode="none">
            {`  ${part.type}: ${partLabel(part)}`}
          </text>
        )}
      </For>
    </box>
  )
}

function Logs(props: { api: TuiPluginApi; sessionID?: string }) {
  const { theme } = useTheme()
  const sessionID = createMemo(() => props.sessionID ?? currentSessionID(props.api))
  const messages = createMemo(() => {
    const id = sessionID()
    return id ? props.api.state.session.messages(id) : []
  })
  const status = createMemo(() => {
    const id = sessionID()
    return id ? props.api.state.session.status(id) : undefined
  })

  createEffect(() => {
    props.api.state.session.messages(sessionID() ?? "")
  })

  useBindings(() => ({
    commands: [
      { name: "logs.close", title: "Close session logs", category: "Session", run: () => props.api.route.navigate("home") },
      {
        name: "logs.config",
        title: "Open config editor",
        category: "Session",
        run: () => props.api.route.navigate(ROUTE_CONFIG),
      },
      {
        name: "logs.back",
        title: "Back to session",
        category: "Session",
        run: () => {
          const id = sessionID()
          if (id) props.api.route.navigate("session", { sessionID: id })
          else props.api.route.navigate("home")
        },
      },
    ],
    bindings: [
      { key: "escape", cmd: "logs.back", desc: "Back" },
      { key: "c", cmd: "logs.config", desc: "Config" },
      { key: "q", cmd: "logs.close", desc: "Home" },
    ],
  }))

  return (
    <box flexGrow={1} minHeight={0} flexDirection="column">
      <box flexDirection="row" gap={2} paddingLeft={2} paddingRight={2} paddingTop={1} flexShrink={0}>
        <text fg={theme.text}>
          <b>Session logs</b>
        </text>
        <text fg={theme.textMuted}>{sessionID() ?? "(no session)"}</text>
        <Show when={status()}>
          <text fg={theme.primary}>{status()}</text>
        </Show>
        <text fg={theme.textMuted}>{`${messages().length} messages`}</text>
      </box>
      <box flexGrow={1} minHeight={0} paddingLeft={2} paddingRight={2}>
        <Show
          when={sessionID()}
          fallback={
            <text fg={theme.textMuted}>No session in scope — open a session first, then use the logs menu.</text>
          }
        >
          <Show
            when={messages().length}
            fallback={<text fg={theme.textMuted}>No messages yet for this session.</text>}
          >
            <scrollbox flexGrow={1}>
              <For each={messages()}>{(message, index) => <Turn api={props.api} message={message} index={index()} />}</For>
            </scrollbox>
          </Show>
        </Show>
      </box>
      <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingBottom={1}>
        <text fg={theme.textMuted}>one block per turn · live · esc back · c config · q home</text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.route.register([
    {
      name: ROUTE_LOGS,
      render(input) {
        const sessionID = input.params?.sessionID
        return <Logs api={api} sessionID={typeof sessionID === "string" ? sessionID : undefined} />
      },
    },
  ])
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
