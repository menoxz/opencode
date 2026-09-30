import { expect, test } from "bun:test"
import type { TuiPluginApi, TuiPluginMeta, TuiRouteDefinition } from "@opencode-ai/plugin/tui"
import navbarPlugin, { currentSessionID, ITEMS, ROUTE_CONFIG, ROUTE_LOGS } from "../../../src/cli/cmd/tui/feature-plugins/system/navbar"
import configEditorPlugin, {
  isSensitive,
  kindOf,
  preview,
} from "../../../src/cli/cmd/tui/feature-plugins/system/config-editor"
import sessionLogsPlugin, { partLabel, resolveSessionID } from "../../../src/cli/cmd/tui/feature-plugins/system/session-logs"

type Captured = { routes: string[]; slots: string[]; commands: string[] }

function makeApi(captured: Captured, current: unknown = { name: "home" }): TuiPluginApi {
  return {
    route: {
      register(routes: TuiRouteDefinition[]) {
        routes.forEach((route) => captured.routes.push(route.name))
        return () => {}
      },
      navigate() {},
      get current() {
        return current as TuiPluginApi["route"]["current"]
      },
    },
    slots: {
      register(input: { slots: Record<string, unknown> }) {
        Object.keys(input.slots).forEach((name) => captured.slots.push(name))
        return "captured-slot"
      },
    },
    keymap: {
      registerLayer(input: { commands?: { name: string }[] }) {
        input.commands?.forEach((command) => captured.commands.push(command.name))
        return () => {}
      },
    },
    ui: { dialog: { clear() {} } },
  } as unknown as TuiPluginApi
}

const meta = {
  id: "test",
  source: "internal",
  spec: "test",
  target: "test",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "same",
} satisfies TuiPluginMeta

test("navbar registers the session_top slot and exposes config and logs menus", async () => {
  const captured: Captured = { routes: [], slots: [], commands: [] }
  await navbarPlugin.tui(makeApi(captured), undefined, meta)

  expect(captured.slots).toEqual(["session_top"])
  expect(captured.commands).toEqual([ROUTE_CONFIG, ROUTE_LOGS])
  expect(ROUTE_CONFIG).toBe("config.editor")
  expect(ROUTE_LOGS).toBe("session.logs")
  expect(ITEMS.map((item) => item.route)).toEqual([ROUTE_CONFIG, ROUTE_LOGS])
})

test("the config and logs menus point at routes that are actually registered", async () => {
  const configCaptured: Captured = { routes: [], slots: [], commands: [] }
  await configEditorPlugin.tui(makeApi(configCaptured), undefined, meta)
  expect(configCaptured.routes).toContain(ROUTE_CONFIG)

  const logsCaptured: Captured = { routes: [], slots: [], commands: [] }
  await sessionLogsPlugin.tui(makeApi(logsCaptured), undefined, meta)
  expect(logsCaptured.routes).toContain(ROUTE_LOGS)
})

test("currentSessionID resolves only inside a session route", () => {
  expect(currentSessionID(makeApi({ routes: [], slots: [], commands: [] }))).toBeUndefined()
  const api = makeApi({ routes: [], slots: [], commands: [] }, { name: "session", params: { sessionID: "s1" } })
  expect(currentSessionID(api)).toBe("s1")
})

test("the trajectory binds to the selected session with clear precedence", () => {
  const onSession = makeApi({ routes: [], slots: [], commands: [] }, { name: "session", params: { sessionID: "live" } })
  const offSession = makeApi({ routes: [], slots: [], commands: [] }, { name: "config.editor" })

  // Explicit navigation param wins.
  expect(resolveSessionID(onSession, "explicit", "remembered")).toBe("explicit")
  // Otherwise the session currently open on the router.
  expect(resolveSessionID(onSession, undefined, "remembered")).toBe("live")
  // Outside a session route, the last observed session is used.
  expect(resolveSessionID(offSession, undefined, "remembered")).toBe("remembered")
  // Nothing known at all stays undefined rather than a frozen id.
  expect(resolveSessionID(offSession, undefined, undefined)).toBeUndefined()
})

test("isSensitive flags credential-shaped config keys", () => {
  expect(isSensitive("apiKey")).toBe(true)
  expect(isSensitive("openai_api_key")).toBe(true)
  expect(isSensitive("github_token")).toBe(true)
  expect(isSensitive("model")).toBe(false)
})

test("preview masks secrets and bounds long values", () => {
  expect(preview("sk-live-secret", true)).toBe("••••••••")
  const long = preview("x".repeat(200), false)
  expect(long.length).toBe(64)
  expect(long.endsWith("...")).toBe(true)
})

test("kindOf classifies values for the editor", () => {
  expect(kindOf([])).toBe("array")
  expect(kindOf(null)).toBe("null")
  expect(kindOf(1)).toBe("number")
  expect(kindOf({})).toBe("object")
})

test("partLabel summarizes tool and step parts", () => {
  const tool = partLabel({
    type: "tool",
    tool: "bash",
    state: { status: "completed", title: "ls", output: "ok" },
  } as never)
  expect(tool).toContain("bash")

  const step = partLabel({ type: "step-finish", tokens: { input: 1, output: 2 }, cost: 0.5 } as never)
  expect(step).toContain("$0.5000")
})
