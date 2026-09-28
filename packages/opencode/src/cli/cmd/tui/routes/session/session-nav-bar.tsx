import { createEffect, createMemo, createSignal, For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../context/tui-config"
import { getScrollAcceleration } from "../../util/scroll"
import {
  NAV_WIDTH,
  footerLines,
  navDirRow,
  navDirectoryLabel,
  navMoreRow,
  navQueryRow,
  navRow,
  navRows,
  navScrollOffset,
  searchAppend,
  searchBackspace,
  type NavRowModel,
  type NavSession,
} from "./session-nav"

/**
 * Vertical session navbar, grouped by directory.
 *
 * Prop-driven on purpose: the session route owns the list, the cursor, the collapse state and the
 * actions, so this component can be rendered in isolation by a test (and so switching sessions keeps
 * using the route's own `navigate`). Rows are windowed rather than put in a scroll container so "the
 * ends stay reachable" is arithmetic the unit tests own. Only up/down/return/escape are handled here:
 * every command (create, delete, rename) goes through the global keymap so no keystroke is swallowed
 * from the prompt while the user types.
 */
export function SessionNavBar(props: {
  sessions: NavSession[]
  activeID?: string
  selected: number
  focused: boolean
  height: number
  allDirectories: boolean
  overrides: Readonly<Record<string, boolean>>
  revealed: string[]
  frame: number
  pendingDelete?: string
  shortcuts: { new: string; delete: string; rename: string }
  onMove: (delta: number) => void
  onOpen: (id: string) => void
  onToggleDir: (key: string, collapsed: boolean) => void
  onToggleMore: (key: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string) => void
  onToggleDirectories: () => void
  onClearPending?: () => void
  searchQuery?: string
  searching?: boolean
  onSearch?: (query: string) => void
  /** Called on Backspace when the query is already empty, so the key never does nothing. */
  onPrepend?: () => void
  onSearchFocus?: (focused: boolean) => void
  onClose?: () => void
  width?: number
}) {
  const { theme } = useTheme()
  const width = () => props.width ?? NAV_WIDTH
  const innerWidth = () => Math.max(1, width() - 2)
  const rows = () =>
    navRows(props.sessions, props.activeID, {
      overrides: props.overrides,
      revealed: props.revealed,
      reveal: (props.searchQuery ?? "").length > 0,
    })
  const [hover, setHover] = createSignal<number | null>(null)
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  // Held in a signal so the effect below re-runs once the ref binds: a plain variable would leave the
  // first run (ref still undefined) as the only one, and the list would never scroll.
  const [scrollbox, setScrollbox] = createSignal<ScrollBoxRenderable>()

  // The list scrolls instead of being cut with a static "N more" line, so every row stays reachable
  // by wheel or by moving the selection. Like the autocomplete, the offset is written straight onto
  // scrollTop rather than nudged with scrollBy, which no-ops before the content is measured.
  createEffect(() => {
    const scroll = scrollbox()
    const total = rows().length
    if (!scroll || scroll.isDestroyed || total === 0) return
    scroll.scrollTop = navScrollOffset(props.selected, total, props.height)
  })

  const line = (row: NavRowModel, _index: number) => {
    if (row.kind === "dir")
      return navDirRow({ label: row.label, count: row.count, collapsed: row.collapsed, width: innerWidth() })
    if (row.kind === "session")
      return navRow({
        title: row.title,
        activity: row.activity,
        updated: row.updated,
        width: innerWidth(),
        indent: 2,
        frame: props.frame,
        pendingDelete: props.pendingDelete === row.id,
      })
    return navMoreRow(row.hidden, innerWidth(), 2)
  }

  const color = (row: NavRowModel, index: number) => {
    if (row.kind === "session" && props.pendingDelete === row.id) return theme.error
    if (index === props.selected) return theme.text
    if (row.kind === "session" && (row.activity === "busy" || row.activity === "retry")) return theme.accent
    if (row.kind === "dir") return theme.text
    if (hover() === index) return theme.text
    return theme.textMuted
  }

  const activate = (row: NavRowModel) => {
    // A click anywhere after a first ctrl+d cancels the pending delete instead of acting on the row.
    if (props.pendingDelete) return props.onClearPending?.()
    if (row.kind === "session") return props.onOpen(row.id)
    if (row.kind === "dir") return props.onToggleDir(row.key, row.collapsed)
    return props.onToggleMore(row.key.slice("more:".length))
  }

  useKeyboard((evt) => {
    // While searching the bar takes the keystrokes itself: the input element could never be focused.
    if (props.searching) {
      if (evt.name === "escape") {
        props.onSearch?.("")
        return props.onSearchFocus?.(false)
      }
      if (evt.name === "return") {
        const current = rows()[Math.min(Math.max(props.selected, 0), Math.max(0, rows().length - 1))]
        if (current) activate(current)
        props.onSearch?.("")
        return props.onSearchFocus?.(false)
      }
      if (evt.name === "backspace") {
        const next = searchBackspace(props.searchQuery ?? "")
        return next === undefined ? props.onPrepend?.() : props.onSearch?.(next)
      }
      if (evt.name === "up") return props.onMove(-1)
      if (evt.name === "down") return props.onMove(1)
      if (evt.name === "space" || evt.name.length === 1)
        return props.onSearch?.(searchAppend(props.searchQuery ?? "", evt.name))
      return
    }
    if (!props.focused) return
    if (evt.name === "/") return props.onSearchFocus?.(true)
    if (evt.name === "up") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onMove(-1)
      return
    }
    if (evt.name === "down") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onMove(1)
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      const current = rows()[Math.min(Math.max(props.selected, 0), Math.max(0, rows().length - 1))]
      if (current) activate(current)
      return
    }
    if (evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      props.onClose?.()
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
      onMouseUp={() => props.pendingDelete && props.onClearPending?.()}
    >
      {/* No `gap`: an inter-row margin would push the last rows out of the box, which the height arithmetic cannot see. */}
      <box flexShrink={0} flexGrow={1}>
        <box
          flexDirection="row"
          gap={1}
          flexShrink={0}
          onMouseUp={() => (props.pendingDelete ? props.onClearPending?.() : props.onToggleDirectories())}
        >
          <text fg={theme.text}>
            <b>Sessions</b>
          </text>
          <text fg={theme.textMuted}>{navDirectoryLabel(props.allDirectories)}</text>
        </box>
        <box flexShrink={0} onMouseUp={() => props.onSearchFocus?.(true)}>
          <text fg={theme.textMuted} wrapMode="none">
            {navQueryRow(props.searchQuery ?? "", props.searching === true, innerWidth())}
          </text>
        </box>
        <scrollbox
          ref={(r: ScrollBoxRenderable) => setScrollbox(r)}
          focusable={false}
          flexShrink={0}
          height={props.height}
          maxHeight={props.height}
          scrollAcceleration={scrollAcceleration()}
          scrollbarOptions={{ visible: false }}
        >
          <For each={rows()} fallback={<text fg={theme.textMuted}>No sessions yet</text>}>
            {(row, index) => (
              <box
                width="100%"
                flexShrink={0}
                onMouseOver={() => setHover(index())}
                onMouseOut={() => setHover((current) => (current === index() ? null : current))}
                onMouseUp={() => activate(row)}
              >
                <text fg={color(row, index())} wrapMode="none">
                  {line(row, index())}
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </box>
      <box flexShrink={0} flexDirection="column">
        <For each={footerLines(innerWidth(), props.shortcuts)}>
          {(footer) => (
            <text fg={theme.textMuted} wrapMode="none">
              {footer}
            </text>
          )}
        </For>
      </box>
    </box>
  )
}
