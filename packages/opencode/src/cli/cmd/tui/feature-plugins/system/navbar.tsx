/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createEffect, createMemo, createSignal, For } from "solid-js"

const id = "internal:navbar"

// The session the operator is currently working in. The navbar is mounted
// inside the session route, so it is the only place that observes it; the
// trajectory view reads this signal to stay bound to the selected session.
export const [selectedSessionID, setSelectedSessionID] = createSignal<string | undefined>(undefined)

// Route names are shared with the feature plugins that register them. Keeping
// them here makes the navbar the single source of truth for what it can open.
export const ROUTE_CONFIG = "config.editor"
export const ROUTE_LOGS = "session.logs"

// This bar lives inside the session message column, so it is not a general
// navigation affordance: it lists only the two contextual views. No "home"
// entry (the user never needs to leave a session for it) and no branding or
// version — the terminal already gives that context.
export const ITEMS = [
  { label: "Config", route: ROUTE_CONFIG },
  { label: "Logs", route: ROUTE_LOGS },
] as const

function Navbar(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const current = createMemo(() => props.api.route.current.name)

  // Keep the published session in sync with whatever session is open.
  createEffect(() => setSelectedSessionID(currentSessionID(props.api)))

  return (
    <box width="100%" flexDirection="row" gap={2} paddingLeft={1} paddingRight={1} flexShrink={0}>
      <For each={ITEMS}>
        {(item) => {
          const active = () => current() === item.route
          // High-contrast chips: an active view is a filled primary block, an
          // idle one keeps a lighter plate, so both read at a glance.
          return (
            <text
              fg={active() ? theme().backgroundElement : theme().text}
              bg={active() ? theme().primary : theme().backgroundMenu}
              onMouseUp={() => props.api.route.navigate(item.route)}
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
