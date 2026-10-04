/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createEffect, createSignal, For } from "solid-js"
import { sessionPanel, setSessionPanel, type SessionPanel } from "../../context/panel"

const id = "internal:navbar"

// The session the operator is currently working in. The navbar is mounted
// inside the session route, so it is the only place that observes it; the
// trajectory view reads this signal to stay bound to the selected session.
export const [selectedSessionID, setSelectedSessionID] = createSignal<string | undefined>(undefined)

// The navbar switches which view fills the session's agent output area. Every
// entry renders in place — nothing navigates away from the session, so the
// session stays mounted and the prompt and sidebar remain visible.
export const ITEMS = [
  { label: "Session", panel: "session" },
  { label: "Config", panel: "config" },
  { label: "Logs", panel: "logs" },
] as const satisfies readonly { label: string; panel: SessionPanel }[]

function Navbar(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  // Keep the published session in sync with whatever session is open.
  createEffect(() => setSelectedSessionID(currentSessionID(props.api)))

  return (
    <box width="100%" flexDirection="row" gap={2} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <For each={ITEMS}>
        {(item) => {
          const active = () => sessionPanel() === item.panel
          // High-contrast chips: the active view is a filled primary block, an
          // idle one keeps a lighter plate, so both read at a glance.
          return (
            <text
              fg={active() ? theme().backgroundElement : theme().text}
              bg={active() ? theme().primary : theme().backgroundMenu}
              onMouseUp={() => setSessionPanel(item.panel)}
            >
              {` ${item.label} `}
            </text>
          )
        }}
      </For>
    </box>
  )
}

export function currentSessionID(api: TuiPluginApi) {
  const current = api.route.current
  if (current.name !== "session") return
  const sessionID = "params" in current ? current.params?.sessionID : undefined
  return typeof sessionID === "string" ? sessionID : undefined
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 50,
    slots: {
      session_top() {
        return <Navbar api={api} />
      },
    },
  })

  api.keymap.registerLayer({
    commands: [
      {
        name: "session.panel.config",
        title: "Open config editor",
        slashName: "config",
        category: "Config",
        namespace: "palette",
        run() {
          setSessionPanel("config")
          api.ui.dialog.clear()
        },
      },
      {
        name: "session.panel.logs",
        title: "Open session logs",
        slashName: "logs",
        category: "Session",
        namespace: "palette",
        run() {
          setSessionPanel("logs")
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
