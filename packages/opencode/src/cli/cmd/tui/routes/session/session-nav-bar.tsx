import { For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { NAV_WIDTH, navItems, navLabel, type NavSession } from "./session-nav"

/**
 * Vertical session navbar.
 *
 * Prop-driven on purpose: the session route owns the list, the cursor and the navigation, so this
 * component can be rendered in isolation by a test (and so switching sessions keeps using the
 * route's own `navigate`, exactly like the session list dialog does).
 */
export function SessionNavBar(props: {
  sessions: NavSession[]
  activeID?: string
  selected: number
  focused: boolean
  onMove: (delta: number) => void
  onSelect: (id: string) => void
  onNew: () => void
  onClose?: () => void
  width?: number
}) {
  const { theme } = useTheme()
  const width = () => props.width ?? NAV_WIDTH
  const items = () => navItems(props.sessions, props.activeID)
  const cycle = (delta: number) => props.onMove(delta)

  useKeyboard((evt) => {
    if (!props.focused) return
    if (evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      cycle(-1)
      return
    }
    if (evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      cycle(1)
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const id = props.sessions[props.selected]?.id
      if (id) props.onSelect(id)
      return
    }
    if (evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onClose?.()
      return
    }
    if (evt.name === "n") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onNew()
    }
  })

  return (
    <box
      id="session-nav-bar"
      backgroundColor={theme.backgroundPanel}
      width={width()}
      height="100%"
      flexShrink={0}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      <box flexShrink={0} gap={1}>
        <text fg={theme.text}>
          <b>Sessions</b>
        </text>
        <For each={items()} fallback={<text fg={theme.textMuted}>No sessions yet</text>}>
          {(item) => (
            <text fg={item.index === props.selected ? theme.text : theme.textMuted}>
              {item.index === props.selected ? ">" : " "} {item.active ? "●" : "○"}{" "}
              <Show when={item.index === props.selected} fallback={<span>{navLabel(item.title, width() - 5)}</span>}>
                <span style={{ fg: theme.text }}>{navLabel(item.title, width() - 5)}</span>
              </Show>
            </text>
          )}
        </For>
        <text fg={theme.textMuted}>n new</text>
      </box>
    </box>
  )
}
