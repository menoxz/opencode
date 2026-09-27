import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useDialog } from "@tui/ui/dialog"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useKV } from "../../context/kv.tsx"
import { useTuiConfig } from "@tui/context/tui-config"
import { OPENCODE_BASE_MODE, useBindings, useCommandShortcut } from "../../keymap"
import { openSessionFolder } from "@tui/component/dialog-directory-select"
import { DialogSessionRename } from "@tui/component/dialog-session-rename"
import { SessionNavBar } from "./session-nav-bar"
import {
  filterNavSessions,
  moveSelection,
  navActivity,
  navListHeight,
  navRows,
  navSelection,
  navVisible,
  selectionSessionID,
  toggleCollapsed,
  usedDirectories,
  type NavSession,
} from "./session-nav"

const NAV_COMMANDS = ["session.new", "session.delete", "session.rename", "session.nav.toggle"]

/**
 * The session navbar as a self-contained panel, so it can be shown on any route (the home screen
 * included) and not only beside an open session. It owns the list state; opening a session navigates
 * to that session's route.
 */
export function SessionNavPanel() {
  const sync = useSync()
  const route = useRoute()
  const sdk = useSDK()
  const local = useLocal()
  const dialog = useDialog()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const kv = useKV()

  const [nav, setNav] = kv.signal<"auto" | "hide">("session_nav", "auto")
  const [navOpen, setNavOpen] = createSignal(false)
  const [navFocused, setNavFocused] = createSignal(false)
  const [navSelected, setNavSelected] = createSignal(0)
  const [navPendingDelete, setNavPendingDelete] = createSignal<string>()
  const [navDirectoryFilter, setNavDirectoryFilter] = kv.signal("session_directory_filter_enabled", true)
  const [navCollapsed, setNavCollapsed] = createSignal<string[]>([])
  const [navQuery, setNavQuery] = createSignal("")
  const [navExpanded, setNavExpanded] = createSignal(false)
  const [navFrame, setNavFrame] = createSignal(0)
  const [navSearching, setNavSearching] = createSignal(false)
  const navNewShortcut = useCommandShortcut("session.new")
  const navDeleteShortcut = useCommandShortcut("session.delete")
  const navRenameShortcut = useCommandShortcut("session.rename")

  // On the home route there is no active session, so no row carries the "active" marker.
  const activeID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))

  const navSessions = createMemo<NavSession[]>(() =>
    sync.data.session
      .filter((item) => item.parentID === undefined)
      .map((item) => ({
        id: item.id,
        title: item.title,
        activity: navActivity(sync.data.session_status?.[item.id]),
        updated: item.time.updated,
        directory: item.directory,
      })),
  )

  const navList = createMemo(() =>
    navRows(filterNavSessions(navSessions(), navQuery()), activeID(), {
      collapsed: navCollapsed(),
      expanded: navExpanded(),
    }),
  )

  const navSel = createMemo(() => navSelection(navList(), activeID(), navSelected()))

  createEffect(() => {
    const total = navList().length
    setNavSelected(total === 0 ? 0 : navSelection(navList(), activeID(), untrack(navSelected)))
  })

  const navShown = createMemo(() => navVisible(nav(), dimensions().width, navOpen()))

  const navWorking = createMemo(() => navSessions().some((item) => item.activity === "busy"))
  createEffect(() => {
    if (!navShown() || !navWorking()) return
    const timer = setInterval(() => setNavFrame((frame) => frame + 1), 120)
    onCleanup(() => clearInterval(timer))
  })

  const newSession = () => {
    setNavFocused(false)
    openSessionFolder({
      dialog,
      sdk,
      local,
      directories: usedDirectories(sync.data.session),
      onCreated: (sessionID) => route.navigate({ type: "session", sessionID }),
    })
  }

  const navDelete = async (id: string) => {
    if (navPendingDelete() !== id) {
      setNavPendingDelete(id)
      return
    }
    setNavPendingDelete(undefined)
    await sdk.client.session.delete({ sessionID: id })
  }

  const deleteSelected = () => {
    const target = selectionSessionID(navList(), navSel())
    if (target) void navDelete(target)
  }

  const renameSession = (id: string) => dialog.replace(() => <DialogSessionRename session={id} />)

  const renameSelected = () => {
    const target = selectionSessionID(navList(), navSel())
    if (target) renameSession(target)
  }

  const navToggleDir = (key: string) => setNavCollapsed((current) => toggleCollapsed(current, key.slice("dir:".length)))

  const showNavbar = () => {
    setNav(() => "auto")
    setNavOpen(true)
    setNavFocused(true)
  }

  // Registered here so the shortcuts and the palette commands work on the home route too.
  useBindings(() => ({
    commands: [
      { namespace: "palette" as const, name: "session.delete", title: "Delete session", category: "Session", run: deleteSelected },
      { namespace: "palette" as const, name: "session.rename", title: "Rename session", category: "Session", run: renameSelected },
      { namespace: "palette" as const, name: "session.nav.toggle", title: "Show session navbar", category: "Session", run: showNavbar },
    ],
  }))

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("session", NAV_COMMANDS),
  }))

  return (
    <Show when={navShown()}>
      <SessionNavBar
        sessions={navSessions()}
        activeID={activeID()}
        selected={navSel()}
        focused={navFocused()}
        height={navListHeight(dimensions().height)}
        allDirectories={!navDirectoryFilter()}
        collapsed={navCollapsed()}
        expanded={navExpanded()}
        frame={navFrame()}
        pendingDelete={navPendingDelete()}
        shortcuts={{ new: navNewShortcut(), delete: navDeleteShortcut(), rename: navRenameShortcut() }}
        onMove={(delta) => setNavSelected(moveSelection(navSelected(), delta, navList().length))}
        onOpen={(id) => route.navigate({ type: "session", sessionID: id })}
        onToggleDir={navToggleDir}
        onToggleMore={() => setNavExpanded(true)}
        onDelete={(id) => void navDelete(id)}
        onRename={(id) => renameSession(id)}
        onClearPending={() => setNavPendingDelete(undefined)}
        searchQuery={navQuery()}
        searching={navSearching()}
        onSearch={setNavQuery}
        onSearchFocus={setNavSearching}
        onToggleDirectories={() => setNavDirectoryFilter((current) => !current)}
        onNew={newSession}
        onClose={() => setNavFocused(false)}
      />
    </Show>
  )
}
