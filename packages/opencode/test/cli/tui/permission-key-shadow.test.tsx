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
import { ExitProvider } from "@/cli/cmd/tui/context/exit"
import { ArgsProvider } from "@/cli/cmd/tui/context/args"
import { ProjectProvider } from "@/cli/cmd/tui/context/project"
import { SyncProvider } from "@/cli/cmd/tui/context/sync"
import { PathFormatterProvider } from "@/cli/cmd/tui/context/path-format"
import { OpencodeKeymapProvider, registerOpencodeKeymap, useOpencodeModeStack } from "@/cli/cmd/tui/keymap"
import { PermissionPrompt } from "@/cli/cmd/tui/routes/session/permission"

const request = {
  id: "per_test_1",
  sessionID: "ses_test",
  always: [],
} as any

// Regression: the permission panel registered its keys in the base mode without a
// priority, so the managed textarea layer - which claims return and the arrows as
// soon as an editor holds focus - swallowed them. Enter never answered the prompt
// and only the clickable option chips worked. The panel now registers at
// PERMISSION_PRIORITY, like the question prompt already did.
async function collectPermissionCalls(competing: "none" | "modal") {
  const calls: string[] = []
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`)
    const pathname = new URL(url, "http://127.0.0.1").pathname
    if (pathname === "/path") return Response.json({ home: "", state: "", config: "", directory: "/tmp/root" })
    if (pathname === "/project/current") return Response.json({ id: "proj_test" })
    if (pathname.includes("/permission")) return Response.json(true)
    // Sync bootstraps through list endpoints: anything else must answer with an array.
    return Response.json([])
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
        <PermissionPrompt request={request} />
        <Overlay />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(
    () => (
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">
            <ExitProvider>
              <ArgsProvider>
                <SDKProvider url="http://127.0.0.1:1" directory="/tmp/root" fetch={fakeFetch}>
                  <ProjectProvider>
                    <SyncProvider>
                      <PathFormatterProvider path="/tmp/root">
                        <Harness />
                      </PathFormatterProvider>
                    </SyncProvider>
                  </ProjectProvider>
                </SDKProvider>
              </ArgsProvider>
            </ExitProvider>
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    ),
    { width: 100, height: 30 },
  )

  try {
    const keys = createMockKeys(app.renderer)
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await Bun.sleep(30)
    }
    keys.pressEnter()
    await app.renderOnce()
    await Bun.sleep(60)
  } finally {
    app.renderer.destroy()
  }

  return calls.filter((call) => call.includes("/permission/"))
}

test("permission panel answers on return", async () => {
  const calls = await collectPermissionCalls("none")
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.some((call) => call.includes("reply"))).toBe(true)
})

test("permission panel keys survive a mode pushed on top of the stack", async () => {
  const calls = await collectPermissionCalls("modal")
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.some((call) => call.includes("reply"))).toBe(true)
})
