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
import { ExitProvider } from "@/cli/cmd/tui/context/exit"
import { ArgsProvider } from "@/cli/cmd/tui/context/args"
import { ProjectProvider } from "@/cli/cmd/tui/context/project"
import { SyncProvider } from "@/cli/cmd/tui/context/sync"
import { PathFormatterProvider } from "@/cli/cmd/tui/context/path-format"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "@/cli/cmd/tui/keymap"
import { PermissionPrompt } from "@/cli/cmd/tui/routes/session/permission"

const LAUNCH = "/launch/dir"
const SESSION_DIR = "/session/dir"

const request = {
  id: "per_test_1",
  sessionID: "ses_test",
  always: [],
} as any

// Regression: la reponse du panneau est routee cote serveur par dossier (`directory`), alors que
// le panneau se nourrit du flux global, qui porte les demandes de toutes les instances. Le panneau
// n envoyait aucun dossier : le POST tombait sur l instance du cwd du serveur et repondait 404
// PermissionNotFound, avale par `void` — le panneau restait identique, quel que soit le bouton.
// Il vise desormais le dossier de la session concernee, et celui de lancement a defaut.
async function replyDirectory(options: { session: boolean }) {
  const replies: URL[] = []
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const pathname = new URL(url, "http://127.0.0.1").pathname
    if (pathname === "/path") return Response.json({ home: "", state: "", config: "", directory: LAUNCH })
    if (pathname === "/project/current") return Response.json({ id: "proj_test" })
    if (pathname === "/session")
      return Response.json(
        options.session
          ? [{ id: "ses_test", directory: SESSION_DIR, time: { created: Date.now(), updated: Date.now() } }]
          : [],
      )
    if (pathname.includes("/permission/")) {
      replies.push(new URL(url, "http://127.0.0.1"))
      return Response.json(true)
    }
    return Response.json([])
  }) as typeof fetch

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, createTuiResolvedConfig())
    onCleanup(() => off())
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <PermissionPrompt request={request} />
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
                <SDKProvider url="http://127.0.0.1:1" directory={LAUNCH} fetch={fakeFetch}>
                  <ProjectProvider>
                    <SyncProvider>
                      <PathFormatterProvider path={LAUNCH}>
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
    for (let i = 0; i < 6; i++) {
      await app.renderOnce()
      await Bun.sleep(30)
    }
    keys.pressEnter()
    await app.renderOnce()
    await Bun.sleep(80)
  } finally {
    app.renderer.destroy()
  }

  return replies[0]?.searchParams.get("directory")
}

test("a permission reply names the directory of the session it answers", async () => {
  expect(await replyDirectory({ session: true })).toBe(SESSION_DIR)
})

test("a permission reply falls back to the launch directory when the session is unknown", async () => {
  expect(await replyDirectory({ session: false })).toBe(LAUNCH)
})
