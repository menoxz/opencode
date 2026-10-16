/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { DeliveryBadge } from "@/cli/cmd/tui/component/delivery-badge"
import { queuedUserStatus } from "@/cli/cmd/tui/routes/session/pending-turn"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
const BG = RGBA.fromInts(51, 68, 85, 255)
const FG = RGBA.fromInts(255, 255, 255, 255)
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

function providers(component: () => unknown) {
  return (
    <TuiConfigProvider config={createTuiResolvedConfig()}>
      <KVProvider>
        <ThemeProvider mode="dark">{component() as never}</ThemeProvider>
      </KVProvider>
    </TuiConfigProvider>
  )
}

async function settled(app: { renderOnce(): Promise<void>; captureCharFrame(): string }) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
    if (app.captureCharFrame().trim().length > 0) return
  }
}

// Message ids are lexicographic in real life (MessageID.ascending).
const user = (id: string, steer = false) => ({
  id,
  role: "user",
  sessionID: "s",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "p", modelID: "m" },
  parts: [{ id: id + "p", type: "text", text: "hi", ...(steer ? { metadata: { steer: true } } : {}) }],
})
const assistant = (id: string, parentID: string, extra: Record<string, unknown> = {}) => ({
  id,
  role: "assistant",
  sessionID: "s",
  parentID,
  time: { created: 1 },
  ...extra,
})

const statusOf = (message: ReturnType<typeof user> | ReturnType<typeof assistant>, messages: readonly unknown[], busy = true) =>
  queuedUserStatus({
    message,
    parts: (message as { parts?: unknown[] }).parts ?? [],
    messages,
    busy,
  } as never)

test("a queued prompt shows QUEUED, never STEER", async () => {
  const q = user("03")
  const running = [user("01"), assistant("02", "01", { finish: "tool-calls" }), q]
  const app = await testRender(() => providers(() => <DeliveryBadge status={statusOf(q, running)} bg={BG} fg={FG} />), {
    width: 40,
    height: 3,
  })
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).toContain("QUEUED")
  expect(app.captureCharFrame()).not.toContain("STEER")
})

test("a steer prompt shows STEER, never QUEUED", async () => {
  const s = user("03", true)
  const running = [user("01"), assistant("02", "01", { finish: "tool-calls" }), s]
  const app = await testRender(() => providers(() => <DeliveryBadge status={statusOf(s, running)} bg={BG} fg={FG} />), {
    width: 40,
    height: 3,
  })
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).toContain("STEER")
  expect(app.captureCharFrame()).not.toContain("QUEUED")
})

test("a served prompt shows no badge", async () => {
  const q = user("03")
  const done = [user("01"), q, assistant("04", "03", { finish: "stop", time: { created: 1, completed: 2 } })]
  const app = await testRender(() => providers(() => <DeliveryBadge status={statusOf(q, done)} bg={BG} fg={FG} />), {
    width: 40,
    height: 3,
  })
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).not.toContain("QUEUED")
  expect(app.captureCharFrame()).not.toContain("STEER")
})

test("the prompt that opened the running turn shows no badge", async () => {
  const first = user("01")
  const running = [first, assistant("02", "01", { finish: "tool-calls" })]
  const app = await testRender(() => providers(() => <DeliveryBadge status={statusOf(first, running)} bg={BG} fg={FG} />), {
    width: 40,
    height: 3,
  })
  renderers.push(app.renderer)
  await settled(app)
  expect(app.captureCharFrame()).not.toContain("QUEUED")
  expect(app.captureCharFrame()).not.toContain("STEER")
})
