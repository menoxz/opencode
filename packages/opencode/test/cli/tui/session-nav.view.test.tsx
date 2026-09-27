/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { JSX } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "../../../src/cli/cmd/tui/context/kv"
import { ThemeProvider } from "../../../src/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "../../../src/cli/cmd/tui/context/tui-config"
import { SessionNavBar } from "../../../src/cli/cmd/tui/routes/session/session-nav-bar"
import type { NavSession } from "../../../src/cli/cmd/tui/routes/session/session-nav"
import { Locale } from "../../../src/util/locale"

type App = Awaited<ReturnType<typeof testRender>>

const renderers: App["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

const sessions: NavSession[] = [
  { id: "ses_a", title: "Add navbar" },
  { id: "ses_b", title: "Fix flaky test" },
]

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
  pendingDelete?: string
  onSelect?: (id: string) => void
  onNew?: () => void
  onDelete?: (id: string) => void
  onRename?: (id: string) => void
  onToggleDirectories?: () => void
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
          pendingDelete={props.pendingDelete}
          onMove={() => {}}
          onSelect={props.onSelect ?? (() => {})}
          onNew={props.onNew ?? (() => {})}
          onDelete={props.onDelete ?? (() => {})}
          onRename={props.onRename ?? (() => {})}
          onToggleDirectories={props.onToggleDirectories ?? (() => {})}
          onClose={props.onClose}
        />
      )),
    { width: 60, height: 14 },
  )
  renderers.push(app.renderer)
  await settled(app)
  return app
}

test("renders the real project sessions and marks the active one", async () => {
  const app = await renderBar({ sessions, activeID: "ses_b", selected: 1, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("Sessions")
  expect(text).toContain("Add navbar")
  expect(text).toContain("Fix flaky test")
  expect(text).toContain("●")
  expect(text).toContain("○")
  expect(text).toContain("n new")
})

test("an empty project shows the fallback instead of invented rows", async () => {
  const app = await renderBar({ sessions: [], selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("No sessions yet")
  expect(text).not.toContain("Add navbar")
})

test("Enter on a focused bar selects the session under the cursor", async () => {
  let picked: string | undefined
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 1,
    focused: true,
    onSelect: (id) => (picked = id),
  })
  app.mockInput.pressEnter()
  await settled(app)
  expect(picked).toBe("ses_b")
})

test("Escape on a focused bar asks the route to collapse it", async () => {
  let closed = false
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 0,
    focused: true,
    onClose: () => (closed = true),
  })
  app.mockInput.pressEscape()
  await settled(app)
  expect(closed).toBe(true)
})

test("shows a per-session activity glyph and keeps a long title on one line", async () => {
  const app = await renderBar({
    sessions: [
      { id: "ses_a", title: "Connexion abonnement Claude", activity: "busy" },
      { id: "ses_b", title: "Retry me", activity: "retry" },
      { id: "ses_c", title: "Idle one", activity: "idle" },
    ],
    activeID: "ses_a",
    selected: 0,
    focused: false,
  })
  const text = app.captureCharFrame()
  expect(text).toContain("◐")
  expect(text).toContain("!")
  expect(text).toContain("Connexion abonnement Claude")
  expect((text.match(/…/g) ?? []).length).toBe(0)
})

test("a mouse click on a row selects that session", async () => {
  let picked: string | undefined
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 0,
    focused: false,
    onSelect: (id) => (picked = id),
  })
  const y = app
    .captureCharFrame()
    .split("\n")
    .findIndex((line) => line.includes("Fix flaky test"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(1, y)
  await settled(app)
  expect(picked).toBe("ses_b")
})

test("shows each session's last-activity date and time", async () => {
  const updated = Date.UTC(2026, 8, 26, 14, 36)
  const app = await renderBar({
    sessions: [
      { id: "ses_a", title: "Add navbar", updated },
      { id: "ses_b", title: "Fix flaky test", updated },
    ],
    activeID: "ses_a",
    selected: 0,
    focused: false,
  })
  const text = app.captureCharFrame()
  expect(text).toContain(Locale.time(updated))
  expect(text).toContain("26/09")
})

test("keeps the timestamp when the title has to be truncated", async () => {
  const now = new Date()
  const day = now.getMonth() === 0 && now.getDate() === 15 ? 16 : 15
  const updated = new Date(now.getFullYear(), 0, day, 14, 36).getTime()
  const app = await renderBar({
    sessions: [
      {
        id: "ses_a",
        title: "Connexion abonnement Claude à OpenAI et facturation mensuelle détaillée",
        updated,
      },
    ],
    activeID: "ses_a",
    selected: 0,
    focused: false,
  })
  const text = app.captureCharFrame()
  expect(text).toContain("…")
  expect(text).toContain(Locale.time(updated))
  expect(text).toMatch(new RegExp(`${String(day).padStart(2, "0")}/01`))
})

const many: NavSession[] = Array.from({ length: 10 }, (_, index) => ({ id: `ses_${index}`, title: `Session ${index}` }))

test("windows a long list so the last session stays reachable, with a hidden-above indicator", async () => {
  const app = await renderBar({ sessions: many, activeID: "ses_0", selected: 9, focused: false, height: 3 })
  const text = app.captureCharFrame()
  expect(text).toContain("Session 9")
  expect(text).toContain("more")
  expect(text).not.toContain("Session 6")
})

test("windows to the top with a hidden-below indicator", async () => {
  const app = await renderBar({ sessions: many, selected: 0, focused: false, height: 3 })
  const text = app.captureCharFrame()
  expect(text).toContain("Session 0")
  expect(text).toContain("more")
  expect(text).not.toContain("Session 9")
})

test("shows a shortcut line with new, delete, rename and the directory mode", async () => {
  const app = await renderBar({ sessions, selected: 0, focused: false })
  const text = app.captureCharFrame()
  expect(text).toContain("n new")
  expect(text).toContain("d delete")
  expect(text).toContain("r rename")
  expect(text).toContain("this dir")
})

test("clicking the directory hint asks the route to toggle the scope", async () => {
  let flipped = false
  const app = await renderBar({
    sessions,
    selected: 0,
    focused: false,
    allDirectories: true,
    onToggleDirectories: () => (flipped = true),
  })
  const lines = app.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes("all dirs"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(lines[y].indexOf("all dirs"), y)
  await settled(app)
  expect(flipped).toBe(true)
})

test("clicking the delete hint asks the route to delete the selected session", async () => {
  let deleted: string | undefined
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 1,
    focused: false,
    onDelete: (id) => (deleted = id),
  })
  const lines = app.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes("d delete"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(lines[y].indexOf("d delete"), y)
  await settled(app)
  expect(deleted).toBe("ses_b")
})

test("clicking the rename hint asks the route to rename the selected session", async () => {
  let renamed: string | undefined
  const app = await renderBar({
    sessions,
    activeID: "ses_a",
    selected: 1,
    focused: false,
    onRename: (id) => (renamed = id),
  })
  const lines = app.captureCharFrame().split("\n")
  const y = lines.findIndex((line) => line.includes("r rename"))
  expect(y).toBeGreaterThanOrEqual(0)
  await app.mockMouse.click(lines[y].indexOf("r rename"), y)
  await settled(app)
  expect(renamed).toBe("ses_b")
})

test("marks the row awaiting delete confirmation", async () => {
  const app = await renderBar({ sessions, selected: 0, focused: false, pendingDelete: "ses_b" })
  expect(app.captureCharFrame()).toContain("press again")
})

test("the d key asks the route to delete the selected session", async () => {
  let deleted: string | undefined
  const app = await renderBar({ sessions, activeID: "ses_a", selected: 1, focused: true, onDelete: (id) => (deleted = id) })
  app.mockInput.pressKey("d")
  await settled(app)
  expect(deleted).toBe("ses_b")
})

test("the r key asks the route to rename the selected session", async () => {
  let renamed: string | undefined
  const app = await renderBar({ sessions, activeID: "ses_a", selected: 1, focused: true, onRename: (id) => (renamed = id) })
  app.mockInput.pressKey("r")
  await settled(app)
  expect(renamed).toBe("ses_b")
})

test("the n key still creates a session when the bar is focused", async () => {
  let created = false
  const app = await renderBar({ sessions, selected: 0, focused: true, onNew: () => (created = true) })
  app.mockInput.pressKey("n")
  await settled(app)
  expect(created).toBe(true)
})
