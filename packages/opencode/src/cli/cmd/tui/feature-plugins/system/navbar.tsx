/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, For } from "solid-js"

const id = "internal:navbar"

// Route names are shared with the feature plugins that register them. Keeping
// them here makes the navbar the single source of truth for what it can open.
export const ROUTE_CONFIG = "config.editor"
export const ROUTE_LOGS = "session.logs"

export const ITEMS = [
  { label: "home", route: "home" },
  { label: "config", route: ROUTE_CONFIG },
  { label: "logs", route: ROUTE_LOGS },
] as const

function Navbar(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const current = createMemo(() => props.api.route.current.name)

  return (
    <box
      width="100%"
      flexDirection="row"
      gap={2}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={theme().backgroundElement}
      flexShrink={0}
    >
      <text fg={theme().primary}>
        <b>opencodev2</b>
      </text>
      <For each={ITEMS}>
        {(item) => (
          <text
            fg={current() === item.route ? theme().primary : theme().textMuted}
            onMouseUp={() => props.api.route.navigate(item.route)}
          >
            {current() === item.route ? `[${item.label}]` : ` ${item.label} `}
          </text>
        )}
      </For>
      <box flexGrow={1} />
      <text fg={theme().textMuted}>{`v${props.api.app.version}`}</text>
    </box>
  )
}

function currentSessionID(api: TuiPluginApi) {
  const current = api.route.current
  if (current.name !== "session") return
  const sessionID = "params" in current ? current.params?.sessionID : undefined
  return typeof sessionID === "string" ? sessionID : undefined
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 50,
    slots: {
      app_top() {
        return <Navbar api={api} />
      },
    },
  })

  api.keymap.registerLayer({
    commands: [
      {
        name: ROUTE_CONFIG,
        title: "Open config editor",
        slashName: "config",
        category: "Config",
        namespace: "palette",
        run() {
          api.route.navigate(ROUTE_CONFIG)
          api.ui.dialog.clear()
        },
      },
      {
        name: ROUTE_LOGS,
        title: "Open session logs",
        slashName: "logs",
        category: "Session",
        namespace: "palette",
        run() {
          const sessionID = currentSessionID(api)
          api.route.navigate(ROUTE_LOGS, sessionID ? { sessionID } : undefined)
          api.ui.dialog.clear()
        },
      },
    ],
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
