import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useDialog } from "@tui/ui/dialog"
import { useRoute } from "@tui/context/route"
import { useSDK } from "@tui/context/sdk"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useKV } from "../../context/kv.tsx"
import { usePromptRef } from "../../context/prompt"
import { useTuiConfig } from "@tui/context/tui-config"
import { OPENCODE_BASE_MODE, useBindings, useCommandShortcut } from "../../keymap"
import { openSessionFolder } from "@tui/component/dialog-directory-select"
import { DialogSessionRename } from "@tui/component/dialog-session-rename"
import { SessionNavBar } from "./session-nav-bar"
import {
  filterNavSessions,
  moveSelectionRows,
  navActivity,
  navListHeight,
  navRows,
  navSelection,
  navVisible,
  removableDirKey,
  selectionSessionID,
  toggleCollapsed,
  toggleRevealed,
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
  const promptRef = usePromptRef()

  const [nav, setNav] = kv.signal<"auto" | "hide">("session_nav", "auto")
  const [navOpen, setNavOpen] = createSignal(false)
  const [navFocused, setNavFocused] = createSignal(false)
  const [navSelected, setNavSelected] = createSignal(0)
  const [navPendingDelete, setNavPendingDelete] = createSignal<string>()

  const [navOverrides, setNavOverrides] = createSignal<Record<string, boolean>>({})
  const [navQuery, setNavQuery] = createSignal("")
  const [navRevealed, setNavRevealed] = createSignal<string[]>([])
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
      overrides: navOverrides(),
      revealed: navRevealed(),
      reveal: navQuery().length > 0,
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
      onDirectoryUsed: (directory) => void sync.session.addDirectory(directory),
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
    // A folder row is not a session: the same gesture removes an added folder from the list, and the
    // guard makes the workspace's own folder unreachable however the cursor reached it.
    const folder = removableDirKey(navList(), navSel())
    if (folder) return void sync.session.removeDirectory(folder)
    const target = selectionSessionID(navList(), navSel())
    if (target) void navDelete(target)
  }

  const removeSelectedFolder = () => {
    const folder = removableDirKey(navList(), navSel())
    if (folder) void sync.session.removeDirectory(folder)
  }

  const renameSession = (id: string) => dialog.replace(() => <DialogSessionRename session={id} />)

  const renameSelected = () => {
    const target = selectionSessionID(navList(), navSel())
    if (target) renameSession(target)
  }

  const navToggleDir = (key: string, collapsed: boolean) => setNavOverrides((current) => toggleCollapsed(current, key.slice("dir:".length), collapsed))
  const navToggleMore = (key: string) => setNavRevealed((current) => toggleRevealed(current, key))

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
      {
        namespace: "palette" as const,
        name: "session.directory.remove",
        title: "Remove added folder from session list",
        category: "Session",
        run: removeSelectedFolder,
      },
    ],
  }))

  useBindings(() => ({
    mode: OPENCODE_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("session", NAV_COMMANDS),
  }))

  return (
    <Show when={navShown()}>
      <SessionNavBar
        sessions={filterNavSessions(navSessions(), navQuery())}
        activeID={activeID()}
        selected={navSel()}
        focused={navFocused()}
        height={navListHeight(dimensions().height)}
        added={sync.session.extraDirectories()}
        origin={sync.path.directory}
        overrides={navOverrides()}
        revealed={navRevealed()}
        frame={navFrame()}
        pendingDelete={navPendingDelete()}
        shortcuts={{ new: navNewShortcut(), delete: navDeleteShortcut(), rename: navRenameShortcut() }}
        onMove={(delta) => setNavSelected(moveSelectionRows(navList(), navSelected(), delta))}
        onOpen={(id) => route.navigate({ type: "session", sessionID: id })}
        onToggleDir={navToggleDir}
        onToggleMore={navToggleMore}
        onDelete={(id) => void navDelete(id)}
        onRename={(id) => renameSession(id)}
        onClearPending={() => setNavPendingDelete(undefined)}
        searchQuery={navQuery()}
        searching={navSearching()}
        onSearch={setNavQuery}
        onSearchFocus={(focused) => {
          setNavSearching(focused)
          if (focused) promptRef.current?.blur()
          else promptRef.current?.focus()
        }}
        onNew={newSession}
        onClose={() => setNavFocused(false)}
      />
    </Show>
  )
}
