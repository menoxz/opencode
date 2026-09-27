import { createSignal, For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { NAV_WIDTH, navItems, navRow, type NavItem, type NavSession } from "./session-nav"

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
  const [hover, setHover] = createSignal<string | null>(null)
  const cycle = (delta: number) => props.onMove(delta)

  const line = (item: NavItem) =>
    navRow({
      title: item.title,
      activity: item.activity,
      active: item.active,
      selected: item.index === props.selected,
      updated: item.updated,
      width: width(),
    })

  const color = (item: NavItem) => {
    if (item.index === props.selected) return theme.text
    if (item.activity === "busy" || item.activity === "retry") return theme.accent
    if (item.active || hover() === item.id) return theme.text
    return theme.textMuted
  }

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
            <box
              width="100%"
              onMouseOver={() => setHover(item.id)}
              onMouseOut={() => setHover((current) => (current === item.id ? null : current))}
              onMouseUp={() => props.onSelect(item.id)}
            >
              <text fg={color(item)} wrapMode="none">
                {line(item)}
              </text>
            </box>
          )}
        </For>
        <text fg={theme.textMuted}>n new</text>
      </box>
    </box>
  )
}
