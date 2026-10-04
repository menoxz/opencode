/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { KVProvider } from "@/cli/cmd/tui/context/kv"
import { ThemeProvider } from "@/cli/cmd/tui/context/theme"
import { TuiConfigProvider } from "@/cli/cmd/tui/context/tui-config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { PartBlock, partLabel } from "@/cli/cmd/tui/feature-plugins/system/session-logs"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const r of renderers.splice(0)) r.destroy()
})

const injectionPart = {
  id: "prt_inj",
  messageID: "msg_1",
  sessionID: "ses_1",
  type: "text" as const,
  text: [
    "Instruction injections · 2 source(s)",
    "Instructions from: /repo/AGENTS.md",
    "Instructions from: /repo/packages/opencode/AGENTS.md",
  ].join("\n"),
  synthetic: true,
  ignored: true,
  metadata: {
    injection: "instructions",
    sources: ["Instructions from: /repo/AGENTS.md", "Instructions from: /repo/packages/opencode/AGENTS.md"],
  },
}

test("partLabel names an instruction injection instead of a generic synthetic text", () => {
  expect(partLabel(injectionPart as never)).toBe("text · injection · instructions")
  expect(partLabel({ type: "text", text: "hi" } as never)).toBe("text")
})

test("the Logs part block displays the injection provenance and its source files", async () => {
  const app = await testRender(
    () => (
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">
            <PartBlock part={injectionPart as never} />
          </ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    ),
    { width: 90, height: 12 },
  )
  renderers.push(app.renderer)
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  const frame = app.captureCharFrame()
  expect(frame).toContain("injected · instructions · 2 source(s)")
  expect(frame).toContain("Instructions from: /repo/AGENTS.md")
  expect(frame).toContain("Instructions from: /repo/packages/opencode/AGENTS.md")
})
