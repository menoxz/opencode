/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createMockKeys } from "@opentui/core/testing"
import { onCleanup } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { SDKProvider } from "@/cli/cmd/tui/context/sdk"
import { SESSION_DIRECTORY_HEADER } from "@/cli/cmd/tui/context/session-directory"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "@/cli/cmd/tui/keymap"
import { QuestionPrompt } from "@/cli/cmd/tui/routes/session/question"

// A session created in a folder the user *added* to the workspace is served by
// its own instance, whose directory differs from the folder the TUI was launched
// in. The question request lives in that instance, so reply/reject must carry the
// session's directory or the server routes the call to the launch-directory
// instance and answers "<reply|reject> for unknown request" — the submit (Enter)
// and cancel (Escape) then silently do nothing. Captured live in
// ~/.local/share/opencodev2/log as `service=question ... reply for unknown request`.
const request = {
  id: "que_test_dir",
  sessionID: "ses_test_dir",
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

const SESSION_DIR = "C:\\jeanluc\\intégrationATD\\integration-atd"

async function collectQuestionHeaders() {
  const calls: { url: string; method: string; directory?: string }[] = []
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined
    const url = request ? request.url : input instanceof URL ? input.toString() : String(input)
    const method = (request?.method ?? init?.method ?? "GET").toUpperCase()
    const raw = new Headers(request ? request.headers : init?.headers)
    calls.push({ url, method, directory: raw.get(SESSION_DIRECTORY_HEADER) ?? undefined })
    return new Response(JSON.stringify(true), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, createTuiResolvedConfig())
    onCleanup(() => off())
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <QuestionPrompt request={request} directory={SESSION_DIR} />
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

  return calls.filter((call) => call.url.includes("/question/"))
}

test("question reply and reject carry the session's own directory", async () => {
  const calls = await collectQuestionHeaders()
  const reply = calls.find((call) => call.url.includes("/reply"))
  const reject = calls.find((call) => call.url.includes("/reject"))
  expect(reply?.directory).toBe(SESSION_DIR)
  expect(reject?.directory).toBe(SESSION_DIR)
})
