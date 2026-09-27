import { createSignal, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import {
  NAV_WIDTH,
  navDirectoryLabel,
  navItems,
  navRow,
  navWindow,
  selectionID,
  type NavItem,
  type NavSession,
} from "./session-nav"

/**
 * Vertical session navbar.
 *
 * Prop-driven on purpose: the session route owns the list, the cursor and the actions, so this
 * component can be rendered in isolation by a test (and so switching sessions keeps using the
 * route's own `navigate`, exactly like the session list dialog does). Rows are windowed rather than
 * put in a scroll container so "the last session is reachable" is arithmetic the unit tests own.
 */
export function SessionNavBar(props: {
  sessions: NavSession[]
  activeID?: string
  selected: number
  focused: boolean
  height: number
  allDirectories: boolean
  pendingDelete?: string
  onMove: (delta: number) => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string) => void
  onToggleDirectories: () => void
  onClose?: () => void
  width?: number
}) {
  const { theme } = useTheme()
  const width = () => props.width ?? NAV_WIDTH
  const items = () => navItems(props.sessions, props.activeID)
  const window = () => navWindow(items().length, props.selected, props.height)
  const visible = () => items().slice(window().start, window().end)
  const [hover, setHover] = createSignal<string | null>(null)
  const cycle = (delta: number) => props.onMove(delta)
  const current = () => selectionID(props.sessions, props.selected)

  const line = (item: NavItem) =>
    navRow({
      title: item.title,
      activity: item.activity,
      active: item.active,
      selected: item.index === props.selected,
      updated: item.updated,
      width: width(),
      pendingDelete: props.pendingDelete === item.id,
    })

  const color = (item: NavItem) => {
    if (props.pendingDelete === item.id) return theme.error
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
      const id = current()
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
      return
    }
    if (evt.name === "d") {
      evt.preventDefault()
      evt.stopPropagation()
      const id = current()
      if (id) props.onDelete(id)
      return
    }
    if (evt.name === "r") {
      evt.preventDefault()
      evt.stopPropagation()
      const id = current()
      if (id) props.onRename(id)
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
        <Show when={window().hiddenAbove > 0}>
          <text fg={theme.textMuted}>↑ {window().hiddenAbove} more</text>
        </Show>
        <For each={visible()} fallback={<text fg={theme.textMuted}>No sessions yet</text>}>
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
        <Show when={window().hiddenBelow > 0}>
          <text fg={theme.textMuted}>↓ {window().hiddenBelow} more</text>
        </Show>
        <box flexDirection="row" gap={1}>
          <box onMouseUp={() => props.onNew()}>
            <text fg={theme.textMuted}>n new</text>
          </box>
          <box
            onMouseUp={() => {
              const id = current()
              if (id) props.onDelete(id)
            }}
          >
            <text fg={theme.textMuted}>d delete</text>
          </box>
          <box
            onMouseUp={() => {
              const id = current()
              if (id) props.onRename(id)
            }}
          >
            <text fg={theme.textMuted}>r rename</text>
          </box>
          <box onMouseUp={() => props.onToggleDirectories()}>
            <text fg={theme.textMuted}>a {navDirectoryLabel(props.allDirectories)}</text>
          </box>
        </box>
      </box>
    </box>
  )
}
