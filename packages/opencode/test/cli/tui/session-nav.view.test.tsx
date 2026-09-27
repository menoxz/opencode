/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, type JSX } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "../../../src/cli/cmd/tui/context/kv"
import { ThemeProvider } from "../../../src/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "../../../src/cli/cmd/tui/context/tui-config"
import { SessionNavBar } from "../../../src/cli/cmd/tui/routes/session/session-nav-bar"
import { filterNavSessions, type NavSession } from "../../../src/cli/cmd/tui/routes/session/session-nav"
import { Locale } from "../../../src/util/locale"

type App = Awaited<ReturnType<typeof testRender>>

const renderers: App["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

const sessions: NavSession[] = [
  { id: "ses_a", title: "Add navbar", directory: "C:\\work\\opencode-fork" },
  { id: "ses_b", title: "Fix flaky test", directory: "C:\\work\\opencode-fork" },
]

const twoDirs: NavSession[] = [
  { id: "a1", title: "Alpha one", directory: "C:\\w\\alpha" },
  { id: "a2", title: "Alpha two", directory: "C:\\w\\alpha" },
  { id: "b1", title: "Beta one", directory: "C:\\w\\beta" },
]

const manyDirs: NavSession[] = [
  { id: "n1", title: "In alpha", directory: "C:\\w\\alpha" },
  { id: "n2", title: "In beta", directory: "C:\\w\\beta" },
  { id: "n3", title: "In gamma", directory: "C:\\w\\gamma" },
  { id: "n4", title: "In delta", directory: "C:\\w\\delta" },
  { id: "n5", title: "In epsilon", directory: "C:\\w\\epsilon" },
]

const oneDirMany: NavSession[] = Array.from({ length: 10 }, (_, index) => ({
  id: `ses_${index}`,
  title: `Session ${index}`,
  directory: "C:\\w\\solo",
}))

function withTheme(component: () => JSX.Element) {
  return (
    <TuiConfigProvider config={createTuiResolvedConfig()}>
      <KVProvider>
        <ThemeProvider mode="dark">{component()}</ThemeProvider>
      </KVProvider>
    </TuiConfigProvider>
  )
}

async function settled(app: App) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

async function renderBar(props: {
  sessions: NavSession[]
  activeID?: string
  selected: number
  focused: boolean
  height?: number
  allDirectories?: boolean
  overrides?: string[]
  revealed?: string[]
  frame?: number
  pendingDelete?: string
  shortcuts?: { new: string; delete: string; rename: string }
  onMove?: (delta: number) => void
  onOpen?: (id: string) => void
  onToggleDir?: (key: string) => void
  onToggleMore?: (key: string) => void
  onNew?: () => void
  onDelete?: (id: string) => void
  onRename?: (id: string) => void
  onToggleDirectories?: () => void
  onClearPending?: () => void
  onSearch?: (query: string) => void
  onClose?: () => void
}) {
  const app = await testRender(
    () =>
      withTheme(() => (
        <SessionNavBar
          sessions={props.sessions}
          activeID={props.activeID}
          selected={props.selected}
          focused={props.focused}
          height={props.height ?? 20}
          allDirectories={props.allDirectories ?? false}
          overrides={props.overrides ?? []}
          revealed={props.revealed ?? []}
          frame={props.frame ?? 0}
          pendingDelete={props.pendingDelete}
          shortcuts={props.shortcuts ?? { new: "alt+n", delete: "ctrl+d", rename: "ctrl+r" }}
          onMove={props.onMove ?? (() => {})}
          onOpen={props.onOpen ?? (() => {})}
          onToggleDir={props.onToggleDir ?? (() => {})}
          onToggleMore={props.onToggleMore ?? (() => {})}
          onNew={props.onNew ?? (() => {})}
          onDelete={props.onDelete ?? (() => {})}
          onRename={props.onRename ?? (() => {})}
          onToggleDirectories={props.onToggleDirectories ?? (() => {})}
          onClearPending={props.onClearPending}
          onSearch={props.onSearch}
          onClose={props.onClose}
        />
      )),
    { width: 60, height: 24 },
  )
  renderers.push(app.renderer)
  await settled(app)
  return app
}

const linesOf = (app: App) =>
  app
    .captureCharFrame()
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))

test("groups the sessions under a directory header with its session count", async () => {
  const app = await renderBar({ sessions, activeID: "ses_b", selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("Sessions")
  expect(text).toContain("opencode-fork")
  expect(text).toContain("Add navbar")
  expect(text).toContain("Fix flaky test")
  const header = linesOf(app).find((line) => line.includes("opencode-fork")) ?? ""
  expect(header).toMatch(/opencode-fork\s+2$/)
})

test("a directory without the active session keeps only its single-line header", async () => {
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("alpha")
  expect(text).toContain("beta")
  expect(text).not.toContain("Alpha one")
  expect(text).not.toContain("Beta one")
  const header = linesOf(app).find((line) => line.includes("alpha")) ?? ""
  expect(header).toMatch(/alpha\s+2$/)
})

test("a directory the user opened shows its sessions", async () => {
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: false, overrides: ["C:\\w\\alpha"] })
  const text = app.captureCharFrame()
  expect(text).toContain("Alpha one")
  expect(text).not.toContain("Beta one")
})

test("an empty project shows the fallback instead of invented rows", async () => {
  const app = await renderBar({ sessions: [], selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("No sessions yet")
  expect(text).not.toContain("opencode-fork")
})

test("a working session spins and a resting one shows the rest glyph", async () => {
  const app = await renderBar({
    sessions: [
      { id: "ses_a", title: "Busy one", activity: "busy", directory: "C:\\w\\alpha" },
      { id: "ses_b", title: "Idle one", activity: "idle", directory: "C:\\w\\alpha" },
    ],
    activeID: "ses_a",
    selected: 1,
    focused: false,
    frame: 0,
  })
  const text = app.captureCharFrame()
  expect(text).toContain("⠋")
  expect(text).toContain("○")
})

test("shows each session's last-activity date and time", async () => {
  const updated = Date.UTC(2026, 8, 26, 14, 36)
  const app = await renderBar({
    sessions: [{ id: "ses_a", title: "Add navbar", updated, directory: "C:\\w\\alpha" }],
    activeID: "ses_a",
    selected: 1,
    focused: false,
  })
  const text = app.captureCharFrame()
  expect(text).toContain(Locale.time(updated))
  expect(text).toContain("26/09")
})

test("caps a directory's sessions at three and offers Read more for the rest", async () => {
  const app = await renderBar({ sessions: oneDirMany, activeID: "ses_0", selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("Read more (+7)")
  expect(text).toContain("Session 0")
  expect(text).not.toContain("Session 9")
})

test("lists every directory, since the cap applies to sessions and not to folders", async () => {
  const app = await renderBar({ sessions: manyDirs, selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("alpha")
  expect(text).toContain("epsilon")
  expect(text).not.toContain("Read more")
})

test("a directory's Read more reveals its extra sessions", async () => {
  const app = await renderBar({ sessions: oneDirMany, activeID: "ses_0", selected: 0, focused: false, revealed: ["C:\\w\\solo"] })
  const text = app.captureCharFrame()
  expect(text).toContain("Session 4")
  expect(text).not.toContain("Read more")
})

test("windows a long group so the last session stays reachable", async () => {
  const app = await renderBar({ sessions: oneDirMany, activeID: "ses_9", selected: 10, focused: false, height: 3, revealed: ["C:\\w\\solo"] })
  const text = app.captureCharFrame()
  expect(text).toContain("Session 9")
  expect(text).not.toContain("Session 0")
})

test("draws no more session rows than the height allows and hints the hidden ones", async () => {
  const app = await renderBar({ sessions: oneDirMany, activeID: "ses_9", selected: 10, focused: false, height: 3 })
  const drawn = linesOf(app).filter((line) => /Session \d/.test(line))
  expect(drawn.length).toBeLessThanOrEqual(3)
  expect(app.captureCharFrame()).toContain("more")
})

test("the command section is pinned at the bottom without a frame", async () => {
  const app = await renderBar({
    sessions,
    selected: 0,
    focused: false,
    shortcuts: { new: "alt+n", delete: "ctrl+d", rename: "ctrl+r" },
  })
  const nonEmpty = linesOf(app).filter((line) => line.trim().length > 0)
  const last = nonEmpty.at(-1) ?? ""
  expect(last).toContain("new alt+n")
  expect(last).toContain("del ctrl+d")
  expect(last).toContain("ren ctrl+r")
  expect(last).not.toContain("|")
  const text = app.captureCharFrame()
  expect(text).not.toContain("|new:")
  expect(text).not.toContain("------")
})

test("Enter on a session row opens it", async () => {
  let opened: string | undefined
  const app = await renderBar({ sessions: twoDirs, activeID: "a1", selected: 1, focused: true, onOpen: (id) => (opened = id) })
  app.mockInput.pressEnter()
  await settled(app)
  expect(opened).toBe("a1")
})

test("Enter on a directory header toggles it", async () => {
  let toggled: string | undefined
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: true, onToggleDir: (key) => (toggled = key) })
  app.mockInput.pressEnter()
  await settled(app)
  expect(toggled).toBe("dir:C:\\w\\alpha")
})

test("Escape on a focused bar asks the route to collapse it", async () => {
  let closed = false
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: true, onClose: () => (closed = true) })
  app.mockInput.pressEscape()
  await settled(app)
  expect(closed).toBe(true)
})

test("the arrow keys move the selection", async () => {
  const moves: number[] = []
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: true, onMove: (delta) => moves.push(delta) })
  app.mockInput.pressArrow("up")
  app.mockInput.pressArrow("down")
  await settled(app)
  expect(moves).toEqual([-1, 1])
})

test("clicking a session row opens it", async () => {
  let opened: string | undefined
  const app = await renderBar({ sessions: twoDirs, activeID: "b1", selected: 0, focused: false, onOpen: (id) => (opened = id) })
  const y = linesOf(app).findIndex((line) => line.includes("Beta one"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(1, y)
  await settled(app)
  expect(opened).toBe("b1")
})

test("clicking a directory header toggles it", async () => {
  let toggled: string | undefined
  const app = await renderBar({ sessions: twoDirs, selected: 0, focused: false, onToggleDir: (key) => (toggled = key) })
  const y = linesOf(app).findIndex((line) => line.includes("alpha"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(1, y)
  await settled(app)
  expect(toggled).toBe("dir:C:\\w\\alpha")
})

test("any click clears the pending delete instead of opening the session", async () => {
  let opened: string | undefined
  let cleared = false
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 0,
    focused: false,
    pendingDelete: "ses_a",
    onOpen: (id) => (opened = id),
    onClearPending: () => (cleared = true),
  })
  const y = linesOf(app).findIndex((line) => line.includes("Add navbar"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(linesOf(app)[y].indexOf("Add navbar"), y)
  await settled(app)
  expect(cleared).toBe(true)
  expect(opened).toBeUndefined()
})

test("offers a folder search field in the bar", async () => {
  const app = await renderBar({ sessions, selected: 0, focused: false })
  expect(app.captureCharFrame()).toContain("Search folders")
})

test("clicking the directory label asks the route to toggle the scope", async () => {
  let flipped = false
  const app = await renderBar({ sessions, selected: 0, focused: false, allDirectories: true, onToggleDirectories: () => (flipped = true) })
  const y = linesOf(app).findIndex((line) => line.includes("all dirs"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(linesOf(app)[y].indexOf("all dirs"), y)
  await settled(app)
  expect(flipped).toBe(true)
})

test("marks the row awaiting delete confirmation", async () => {
  const app = await renderBar({ sessions: twoDirs, activeID: "a1", selected: 1, focused: false, pendingDelete: "a1" })
  expect(app.captureCharFrame()).toContain("press again")
})

test("bare n, d and r keys never fire an action from the bar", async () => {
  let deleted: string | undefined
  let renamed: string | undefined
  let created = false
  const app = await renderBar({
    sessions: twoDirs,
    selected: 1,
    focused: true,
    onDelete: (id) => (deleted = id),
    onRename: (id) => (renamed = id),
    onNew: () => (created = true),
  })
  app.mockInput.pressKey("d")
  app.mockInput.pressKey("r")
  app.mockInput.pressKey("n")
  await settled(app)
  expect(deleted).toBeUndefined()
  expect(renamed).toBeUndefined()
  expect(created).toBe(false)
})

test("takes keys in the search field, narrows the list and leaves on Escape", async () => {
  const typed: string[] = []
  const app = await testRender(() =>
    withTheme(() => {
      const [query, setQuery] = createSignal("")
      const [searching, setSearching] = createSignal(false)
      return (
        <SessionNavBar
          sessions={filterNavSessions(twoDirs, query())}
          activeID="b1"
          selected={0}
          focused={true}
          height={20}
          allDirectories={false}
          overrides={["C:\\w\\alpha"]}
          revealed={[]}
          frame={0}
          onMove={() => {}}
          onOpen={() => {}}
          onToggleDir={() => {}}
          onToggleMore={() => {}}
          onNew={() => {}}
          onDelete={() => {}}
          onRename={() => {}}
          onToggleDirectories={() => {}}
          shortcuts={{ new: "alt+n", delete: "ctrl+d", rename: "ctrl+r" }}
          searchQuery={query()}
          searching={searching()}
          onSearch={(value) => {
            typed.push(value)
            setQuery(value)
          }}
          onSearchFocus={setSearching}
        />
      )
    }),
  )
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).toContain("/ Search folders")

  app.mockInput.pressKey("/")
  await settled(app)
  expect(app.captureCharFrame()).toContain("/▏")

  app.mockInput.pressKey("b")
  await settled(app)
  expect(typed.at(-1)).toBe("b")
  expect(app.captureCharFrame()).toContain("Beta one")
  expect(app.captureCharFrame()).not.toContain("Alpha one")

  app.mockInput.pressKey("e")
  await settled(app)
  expect(typed.at(-1)).toBe("be")

  // Backspace is destructive one character at a time, still inside the field.
  app.mockInput.pressBackspace()
  await settled(app)
  expect(typed.at(-1)).toBe("b")
  app.mockInput.pressBackspace()
  await settled(app)
  expect(typed.at(-1)).toBe("")

  app.mockInput.pressBackspace()
  await settled(app)
  expect(typed.at(-1)).toBe("")
  expect(app.captureCharFrame()).toContain("Alpha one")

  app.mockInput.pressEscape()
  await settled(app)
  expect(app.captureCharFrame()).toContain("/ Search folders")
  expect(app.captureCharFrame()).toContain("Alpha one")
})
