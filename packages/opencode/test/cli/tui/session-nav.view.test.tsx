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
  onSelect?: (id: string) => void
  onNew?: () => void
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
          onMove={() => {}}
          onSelect={props.onSelect ?? (() => {})}
          onNew={props.onNew ?? (() => {})}
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
