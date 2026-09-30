/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { For } from "solid-js"
import { RGBA } from "@opentui/core"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider, useTheme } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"

type App = Awaited<ReturnType<typeof testRender>>
const renderers: App["renderer"][] = []
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy()
})

const BACKDROP = RGBA.fromInts(200, 0, 0)
const OVERLAY = { top: 2, left: 0, width: 24, height: 5 }

function providers(c: () => unknown) {
  return (
    <TuiConfigProvider config={createTuiResolvedConfig()}>
      <KVProvider>
        <ThemeProvider mode="dark">{c() as never}</ThemeProvider>
      </KVProvider>
    </TuiConfigProvider>
  )
}

async function settle(app: App) {
  for (let i = 0; i < 10; i++) {
    await app.renderOnce()
    await new Promise((r) => setTimeout(r, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

// The "/" overlay subtree (autocomplete.tsx L816-846). `plate` mirrors whether the OUTER box
// carries its own backgroundColor; the inner scrollbox always paints backgroundMenu.
function OverlayOverBackdrop(props: { plate: boolean }) {
  const { theme } = useTheme()
  return (
    <box width="100%" height="100%" backgroundColor={BACKDROP} flexDirection="column">
      <For each={Array.from({ length: 14 }, (_, i) => `XXXXXXXXXX backdrop row ${i}`)}>
        {(l) => <text fg={RGBA.fromInts(255, 255, 255)}>{l}</text>}
      </For>
      <box
        position="absolute"
        top={OVERLAY.top}
        left={OVERLAY.left}
        width={OVERLAY.width}
        zIndex={100}
        backgroundColor={props.plate ? theme.backgroundMenu : undefined}
        border={["left", "right"]}
        borderColor={theme.border}
      >
        <scrollbox backgroundColor={theme.backgroundMenu} height={OVERLAY.height} scrollbarOptions={{ visible: false }}>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme.text}>/one</text>
          </box>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme.text}>/two</text>
          </box>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme.text}>/three</text>
          </box>
        </scrollbox>
      </box>
    </box>
  )
}

type Span = { text?: string; width?: number; bg?: { buffer?: Record<string, number> } }

function bgKey(span: Span): string {
  const b = span.bg?.buffer
  if (!b) return "none"
  return `${Math.round(b["0"] ?? -1)},${Math.round(b["1"] ?? -1)},${Math.round(b["2"] ?? -1)}`
}

const BACKDROP_KEY = bgKey({ bg: { buffer: { 0: 200, 1: 0, 2: 0 } } })

function cellBackgrounds(spans: unknown): string[][] {
  const lines = (spans as { lines?: unknown }).lines
  if (!Array.isArray(lines)) return []
  const grid: string[][] = []
  for (const line of lines) {
    const items: Span[] = Array.isArray(line) ? (line as Span[]) : ((line as { spans?: Span[] }).spans ?? [])
    const row: string[] = []
    for (const span of items) {
      const width = span.width ?? (span.text?.length ?? 1)
      for (let i = 0; i < width; i++) row.push(bgKey(span))
    }
    grid.push(row)
  }
  return grid
}

// Every cell inside the overlay rectangle must be owned by the panel, never the backdrop.
function backdropCellsInOverlay(app: App, width: number) {
  const grid = cellBackgrounds(app.captureSpans())
  const leaks: string[] = []
  for (let y = OVERLAY.top; y < OVERLAY.top + OVERLAY.height; y++) {
    const row = grid[y]
    if (!row) continue
    for (let x = OVERLAY.left; x < OVERLAY.left + width; x++) {
      if (row[x] === BACKDROP_KEY) leaks.push(`${x},${y}`)
    }
  }
  return { leaks, grid }
}

async function render(plate: boolean) {
  const app = await testRender(() => providers(() => <OverlayOverBackdrop plate={plate} />), {
    width: 80,
    height: 20,
  })
  renderers.push(app.renderer)
  await settle(app)
  return app
}

test("fixed: the / overlay owns its plate over a red backdrop", async () => {
  const app = await render(true)
  expect(app.captureCharFrame()).toContain("/one")

  // Columns 0 and width-1 are the SplitBorder cells — the exact rows that leaked before the
  // plate was added. Assert the full rectangle, borders included, shows no backdrop.
  const { leaks, grid } = backdropCellsInOverlay(app, OVERLAY.width)
  console.log("FIXED border columns:", grid[OVERLAY.top]?.slice(0, 2).join(" / "))
  console.log("FIXED leaks:", JSON.stringify(leaks))
  expect(leaks).toEqual([])
})

test("regression: without the plate the border cells leak the backdrop", async () => {
  const app = await render(false)
  const { leaks } = backdropCellsInOverlay(app, OVERLAY.width)
  console.log("UNFIXED leaks:", JSON.stringify(leaks.slice(0, 12)))
  // Documents the defect the fix closes: the overlay's own border cells showed the backdrop.
  expect(leaks.length).toBeGreaterThan(0)
})
