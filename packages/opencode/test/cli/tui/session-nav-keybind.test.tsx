/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onCleanup } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "@/cli/cmd/tui/keymap"

async function sequencesFor(commands: string[]) {
  const sequences: Record<string, string[][]> = {}
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    const offLayer = keymap.registerLayer({ bindings: config.keybinds.gather("session", commands) })
    const bindings = keymap.getCommandBindings({ visibility: "registered", commands })
    for (const command of commands) {
      sequences[command] =
        bindings.get(command)?.map((binding) => binding.sequence.map((part) => part.stroke.name)) ?? []
    }
    onCleanup(() => {
      offLayer()
      offKeymap()
    })
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <box />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    return sequences
  } finally {
    app.renderer.destroy()
  }
}

test("the navbar toggle keybind resolves to a leader chord, like the sidebar toggle", async () => {
  const sequences = await sequencesFor(["session.nav.toggle", "session.sidebar.toggle"])

  const nav = sequences["session.nav.toggle"]
  expect(nav.length).toBeGreaterThan(0)
  expect(nav[0].length).toBe(2)
  expect(nav[0].at(-1)).toBe("v")

  const sidebar = sequences["session.sidebar.toggle"]
  expect(sidebar.length).toBeGreaterThan(0)
  expect(sidebar[0].length).toBe(2)
  expect(sidebar[0].at(-1)).toBe("b")

  expect(nav[0][0]).toBe(sidebar[0][0])
})
