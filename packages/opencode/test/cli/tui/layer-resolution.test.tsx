/** @jsxImportSource @opentui/solid */
import { test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createMockKeys } from "@opentui/core/testing"
import { onCleanup } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { OpencodeKeymapProvider, registerOpencodeKeymap, OPENCODE_BASE_MODE } from "@/cli/cmd/tui/keymap"

const log: string[] = []

function Harness(props: { base: boolean; basePrio: number; modelessPrio?: number }) {
  const renderer = useRenderer()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const off = registerOpencodeKeymap(keymap, renderer, createTuiResolvedConfig())
  const offs: Array<() => void> = []
  if (props.base) {
    offs.push(
      keymap.registerLayer({
        mode: OPENCODE_BASE_MODE,
        priority: props.basePrio,
        bindings: [{ key: "return", cmd: () => void log.push("BASE") }],
      }),
    )
  }
  if (props.modelessPrio !== undefined) {
    offs.push(
      keymap.registerLayer({
        priority: props.modelessPrio,
        bindings: [{ key: "return", cmd: () => void log.push("MODELESS") }],
      }),
    )
  }
  onCleanup(() => {
    offs.forEach((f) => f())
    off()
  })
  return (
    <OpencodeKeymapProvider keymap={keymap}>
      <box />
    </OpencodeKeymapProvider>
  )
}

async function press(props: Parameters<typeof Harness>[0]) {
  log.length = 0
  const app = await testRender(() => <Harness {...props} />, { width: 40, height: 6 })
  try {
    const keys = createMockKeys(app.renderer)
    for (let i = 0; i < 3; i++) {
      await app.renderOnce()
      await Bun.sleep(20)
    }
    keys.pressEnter()
    await app.renderOnce()
    await Bun.sleep(40)
  } finally {
    app.renderer.destroy()
  }
  return log.join(",") || "<none>"
}

test("layer resolution: mode vs priority", async () => {
  const onlyModeless = await press({ base: false, basePrio: 0, modelessPrio: 1 })
  const base0_vs_modeless1 = await press({ base: true, basePrio: 0, modelessPrio: 1 })
  const base1_vs_modeless2 = await press({ base: true, basePrio: 1, modelessPrio: 2 })
  const base1_only = await press({ base: true, basePrio: 1 })
  console.log("ONLY_MODELESS_PRIO1      =", onlyModeless)
  console.log("BASE_PRIO0 + MODELESS_P1 =", base0_vs_modeless1)
  console.log("BASE_PRIO1 + MODELESS_P2 =", base1_vs_modeless2)
  console.log("BASE_PRIO1_ONLY          =", base1_only)
})
