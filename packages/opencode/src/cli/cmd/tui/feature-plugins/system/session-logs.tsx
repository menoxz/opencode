/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { useTheme } from "@tui/context/theme"
import { useBindings } from "../../keymap"
import type {
  AssistantMessage,
  Message,
  Part,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { currentSessionID, selectedSessionID } from "./navbar"
import { setSessionPanel } from "../../context/panel"
import { OutputField, toggleAllOutput } from "../../component/output-disclosure"

const id = "internal:session-logs"

export function clock(ms: number) {
  return new Date(ms).toLocaleTimeString()
}

// The trajectory follows the session selected in the TUI. When opened from the
// session navbar the session id is passed explicitly; otherwise fall back to
// the session currently on the router, then to the last one observed.
export function resolveSessionID(
  api: TuiPluginApi,
  override?: string,
  remembered?: string,
  sessionRoute?: string,
): string | undefined {
  return override ?? sessionRoute ?? currentSessionID(api) ?? remembered
}

// Compact one-line label for a part, used as the trajectory section header.
export function partLabel(part: Part) {
  switch (part.type) {
    case "text":
      return part.synthetic ? "text (synthetic)" : "text"
    case "reasoning":
      return "reasoning"
    case "tool":
      return `tool · ${part.tool} · ${part.state.status}`
    case "step-start":
      return "step start"
    case "step-finish":
      return `step finish · ${part.reason} · ${part.tokens.input}in ${part.tokens.output}out · $${part.cost.toFixed(4)}`
    case "subtask":
      return `subtask · ${part.agent}`
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

function toolInput(part: ToolPart) {
  try {
    return JSON.stringify(part.state.input, null, 2)
  } catch {
    return String(part.state.input)
  }
}

function toolResult(part: ToolPart) {
  const state = part.state
  if (state.status === "completed") return state.output
  if (state.status === "error") return state.error
  if (state.status === "running") return state.title ?? "(running)"
  return state.raw
}

function toolColor(part: ToolPart, theme: ReturnType<typeof useTheme>["theme"]) {
  const status = part.state.status
  if (status === "error") return theme.error
  if (status === "completed") return theme.success
  return theme.warning
}

function Field(props: { label: string; value: string; color?: unknown; wrap?: "word" | "char" }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg={theme.textMuted} wrapMode="none">
        {props.label}
      </text>
      <text fg={(props.color as never) ?? theme.text} wrapMode={props.wrap ?? "word"}>
        {props.value}
      </text>
    </box>
  )
}

function ToolBlock(props: { part: ToolPart }) {
  const { theme } = useTheme()
  const status = () => props.part.state.status
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      marginTop={1}
      paddingLeft={2}
      border={["left"]}
      borderColor={toolColor(props.part, theme)}
    >
      <text fg={toolColor(props.part, theme)} wrapMode="word">
        {`tool · ${props.part.tool} · ${status()}`}
      </text>
      <OutputField label="input" value={toolInput(props.part)} wrap="char" />
      <OutputField
        label={status() === "error" ? "error" : "output"}
        value={toolResult(props.part)}
        color={status() === "error" ? theme.error : theme.text}
        wrap="char"
      />
    </box>
  )
}

function PartBlock(props: { part: Part }) {
  const { theme } = useTheme()

  switch (props.part.type) {
    case "text":
      return (
        <box flexDirection="column" flexShrink={0} marginTop={1}>
          <text fg={theme.text} wrapMode="word">
            {props.part.text}
          </text>
        </box>
      )
    case "reasoning":
      return (
        <box
          flexDirection="column"
          flexShrink={0}
          marginTop={1}
          paddingLeft={2}
          border={["left"]}
          borderColor={theme.borderSubtle}
        >
          <OutputField label="reasoning" value={props.part.text} color={theme.textMuted} />
        </box>
      )
    case "tool":
      return <ToolBlock part={props.part} />
    case "step-start":
      return (
        <text fg={theme.textMuted} wrapMode="none">
          {`── step start ──`}
        </text>
      )
    case "step-finish":
      return (
        <text fg={theme.textMuted} wrapMode="word">
          {`── step finish · ${props.part.reason} · ${props.part.tokens.input}in ${props.part.tokens.output}out${props.part.tokens.reasoning ? ` ${props.part.tokens.reasoning}reasoning` : ""} · cache ${props.part.tokens.cache.read}r/${props.part.tokens.cache.write}w · $${props.part.cost.toFixed(4)} ──`}
        </text>
      )
    case "subtask":
      return (
        <box flexDirection="column" flexShrink={0} marginTop={1} paddingLeft={2} border={["left"]} borderColor={theme.secondary}>
          <text fg={theme.secondary} wrapMode="word">
            {`subtask · ${props.part.agent} · ${props.part.description}`}
          </text>
          <Show when={props.part.command}>
            <Field label="command" value={props.part.command!} />
          </Show>
          <Field label="prompt" value={props.part.prompt} wrap="char" />
        </box>
      )
    case "agent":
      return (
        <text fg={theme.textMuted} wrapMode="none">
          {`agent · ${props.part.name}`}
        </text>
      )
    case "file":
      return <Field label={`file · ${props.part.mime}`} value={props.part.filename ?? props.part.url} wrap="char" />
    case "patch":
      return <Field label={`patch · ${props.part.files.length} file(s)`} value={props.part.files.join("\n")} wrap="char" />
    case "snapshot":
      return (
        <text fg={theme.textMuted} wrapMode="char">
          {`snapshot · ${props.part.snapshot}`}
        </text>
      )
    case "retry":
      return <Field label={`retry #${props.part.attempt}`} value={JSON.stringify(props.part.error, null, 2)} wrap="char" />
    case "compaction":
      return (
        <text fg={theme.warning} wrapMode="word">
          {`compaction${props.part.auto ? " (auto)" : ""}${props.part.overflow ? " · overflow" : ""}${props.part.tail_start_id ? ` · tail from ${props.part.tail_start_id}` : ""}`}
        </text>
      )
    default:
      return (
        <text fg={theme.textMuted} wrapMode="none">
          {partLabel(props.part)}
        </text>
      )
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
          <text fg={theme.textMuted} wrapMode="none">
            {`${user()!.agent} · ${user()!.model.providerID}/${user()!.model.modelID}`}
          </text>
        </Show>
        <Show when={assistant()}>
          <text fg={theme.textMuted} wrapMode="none">
            {`${assistant()!.agent} · ${assistant()!.providerID}/${assistant()!.modelID} · ${assistant()!.tokens.input}in ${assistant()!.tokens.output}out · $${assistant()!.cost.toFixed(4)}`}
          </text>
        </Show>
        <Show when={assistant()?.error}>
          <text fg={theme.error}>error</text>
        </Show>
        <Show when={assistant() && !assistant()!.time.completed}>
          <text fg={theme.warning}>running</text>
        </Show>
        <Show when={assistant()?.finish}>
          <text fg={theme.textMuted}>{assistant()!.finish}</text>
        </Show>
      </box>
      <For each={parts()}>{(part) => <PartBlock part={part} />}</For>
    </box>
  )
}

function Trajectory(props: { api: TuiPluginApi; sessionID?: string; defaultOverride?: boolean }) {
  const { theme } = useTheme()
  // Capture the session route the panel opened on, so a later navigation cannot
  // silently re-point the trajectory at another session.
  const [bound] = createSignal(props.defaultOverride ? currentSessionID(props.api) : props.sessionID)
  const sessionID = createMemo(() =>
    resolveSessionID(props.api, props.sessionID, selectedSessionID(), bound()),
  )
  const session = createMemo(() => {
    const id = sessionID()
    return id ? props.api.state.session.get(id) : undefined
  })
  const messages = createMemo(() => {
    const id = sessionID()
    return id ? props.api.state.session.messages(id) : []
  })
  const status = createMemo(() => {
    const id = sessionID()
    return id ? props.api.state.session.status(id) : undefined
  })

  // Touch the store so the view re-renders as messages and parts stream in.
  createEffect(() => {
    props.api.state.session.messages(sessionID() ?? "")
    messages().forEach((message) => props.api.state.part(message.id))
  })

  useBindings(() => ({
    commands: [
      {
        name: "logs.close",
        title: "Back to session",
        category: "Session",
        run: () => setSessionPanel("session"),
      },
      {
        name: "logs.config",
        title: "Open config editor",
        category: "Session",
        run: () => setSessionPanel("config"),
      },
      {
        name: "logs.home",
        title: "Back to session",
        category: "Session",
        run: () => setSessionPanel("session"),
      },
      {
        name: "logs.expandAll",
        title: "Expand all output",
        category: "Session",
        run: () => toggleAllOutput(true),
      },
      {
        name: "logs.collapseAll",
        title: "Collapse all output",
        category: "Session",
        run: () => toggleAllOutput(false),
      },
    ],
    bindings: [
      { key: "escape", cmd: "logs.home", desc: "Back" },
      { key: "c", cmd: "logs.config", desc: "Config" },
      { key: "e", cmd: "logs.expandAll", desc: "Expand all" },
      { key: "z", cmd: "logs.collapseAll", desc: "Collapse all" },
      { key: "q", cmd: "logs.home", desc: "Session" },
    ],
  }))

  return (
    <box flexGrow={1} minHeight={0} flexDirection="column">
      <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} flexShrink={0}>
        <box flexDirection="row" gap={2}>
          <text fg={theme.text}>
            <b>Session trajectory</b>
          </text>
          <Show when={status()}>
            <text fg={theme.primary}>{status()!.type}</text>
          </Show>
          <text fg={theme.textMuted}>{`${messages().length} messages`}</text>
        </box>
        <text fg={theme.textMuted} wrapMode="word">
          {`${session()?.title ?? "(untitled)"} · ${sessionID() ?? "(no session)"}`}
        </text>
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
        <text fg={theme.textMuted}>          full session · live · esc back · e/z fold output · c config · q session</text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    slots: {
      session_logs() {
        return <Trajectory api={api} defaultOverride />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
