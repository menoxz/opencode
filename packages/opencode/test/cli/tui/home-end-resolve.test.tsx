/** @jsxImportSource @opentui/solid */
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { test, expect } from "bun:test"
import { onCleanup } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

// Regression: the session transcript's Home/End (session.first/session.last) were
// dead because opentui's Textarea always merges its own default bindings and
// claims the bare home/end keys while the prompt holds focus. registerOpencodeKeymap
// re-asserts the transcript navigation at a higher priority. This asserts the
// resolved key view, which is deterministic (unlike simulating key presses).
test("base mode resolves bare home/end to session.first/session.last", async () => {
  const { OpencodeKeymapProvider, registerOpencodeKeymap, useBindings } = await import(
    "../../../src/cli/cmd/tui/keymap"
  )
  const { TuiConfigProvider } = await import("../../../src/cli/cmd/tui/context/tui-config")

  let km: ReturnType<typeof createDefaultOpenTuiKeymap>
  function Probe() {
    useBindings(() => ({
      commands: [
        { name: "session.first", run: () => {} },
        { name: "session.last", run: () => {} },
      ],
    }))
    return null
  }

  const app = await testRender(
    () => {
      const renderer = useRenderer()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      km = keymap
      const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
      onCleanup(registerOpencodeKeymap(keymap, renderer, resolvedConfig))
      return (
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <Probe />
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      )
    },
    { kittyKeyboard: true, width: 40, height: 10 },
  )

  try {
    await app.renderOnce()
    await Bun.sleep(60)
    const keys = km!.getActiveKeys() as unknown as Array<{ stroke?: { name: string }; command?: string }>
    const home = keys.find((entry) => entry.stroke?.name === "home")
    const end = keys.find((entry) => entry.stroke?.name === "end")
    expect(home?.command).toBe("session.first")
    expect(end?.command).toBe("session.last")
  } finally {
    app.renderer.destroy()
  }
})
