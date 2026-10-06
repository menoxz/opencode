/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createMockKeys } from "@opentui/core/testing"
import { onCleanup, onMount } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { SDKProvider } from "@/cli/cmd/tui/context/sdk"
import { OpencodeKeymapProvider, registerOpencodeKeymap, useOpencodeModeStack } from "@/cli/cmd/tui/keymap"
import { QuestionPrompt } from "@/cli/cmd/tui/routes/session/question"

const request = {
  id: "que_test_1",
  sessionID: "ses_test",
  questions: [
    {
      header: "H",
      question: "Q?",
      options: [
        { label: "A", description: "a" },
        { label: "B", description: "b" },
      ],
    },
  ],
} as any

// Regression: the question keys used to live in a dedicated mode pushed on the
// shared mode stack, so as soon as any overlay pushed another mode (dialog ->
// "modal", autocomplete -> "autocomplete", plugins -> their own) return/escape
// stopped firing entirely. The user could still click an option but Enter never
// submitted and Escape never cancelled.
async function collectQuestionCalls(competing: "none" | "modal") {
  const calls: string[] = []
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`)
    return new Response(JSON.stringify(true), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  function Overlay() {
    const stack = useOpencodeModeStack()
    onMount(() => {
      if (competing === "none") return
      const pop = stack.push(competing)
      onCleanup(pop)
    })
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, createTuiResolvedConfig())
    onCleanup(() => off())
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <QuestionPrompt request={request} />
        <Overlay />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(
    () => (
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">
            <SDKProvider url="http://127.0.0.1:1" fetch={fakeFetch}>
              <Harness />
            </SDKProvider>
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    ),
    { width: 80, height: 24 },
  )

  try {
    const keys = createMockKeys(app.renderer)
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await Bun.sleep(30)
    }
    keys.pressEnter()
    await app.renderOnce()
    await Bun.sleep(40)
    keys.pressEscape()
    await app.renderOnce()
    await Bun.sleep(40)
  } finally {
    app.renderer.destroy()
  }

  return calls.filter((call) => call.includes("/question/"))
}

test("question prompt submits on return and cancels on escape", async () => {
  const calls = await collectQuestionCalls("none")
  expect(calls.some((call) => call.includes("/reply"))).toBe(true)
  expect(calls.some((call) => call.includes("/reject"))).toBe(true)
})

test("question prompt keys survive a mode pushed on top of the stack", async () => {
  const calls = await collectQuestionCalls("modal")
  expect(calls.some((call) => call.includes("/reply"))).toBe(true)
  expect(calls.some((call) => call.includes("/reject"))).toBe(true)
})
