import { expect, test } from "bun:test"
import type { TuiPluginApi, TuiPluginMeta, TuiRouteDefinition } from "@opencode-ai/plugin/tui"
import navbarPlugin, { currentSessionID, ITEMS } from "../../../src/cli/cmd/tui/feature-plugins/system/navbar"
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

test("navbar offers Session, Config and Logs and registers inline slots, not full screen routes", async () => {
  const captured: Captured = { routes: [], slots: [], commands: [] }
  await navbarPlugin.tui(makeApi(captured), undefined, meta)

  // The three menus live in the session output area, so the navbar only
  // registers the slot it draws itself and never registers a route.
  expect(captured.slots).toEqual(["session_top"])
  expect(captured.routes).toEqual([])
  expect(ITEMS.map((item) => item.label)).toEqual(["Session", "Config", "Logs"])
  expect(ITEMS.map((item) => item.panel)).toEqual(["session", "config", "logs"])
})

test("the config editor and the trajectory register inline session slots, not routes", async () => {
  const configCaptured: Captured = { routes: [], slots: [], commands: [] }
  await configEditorPlugin.tui(makeApi(configCaptured), undefined, meta)
  expect(configCaptured.routes).toEqual([])
  expect(configCaptured.slots).toEqual(["session_config"])

  const logsCaptured: Captured = { routes: [], slots: [], commands: [] }
  await sessionLogsPlugin.tui(makeApi(logsCaptured), undefined, meta)
  expect(logsCaptured.routes).toEqual([])
  expect(logsCaptured.slots).toEqual(["session_logs"])
})

test("currentSessionID resolves only inside a session route", () => {
  expect(currentSessionID(makeApi({ routes: [], slots: [], commands: [] }))).toBeUndefined()
  const api = makeApi({ routes: [], slots: [], commands: [] }, { name: "session", params: { sessionID: "s1" } })
  expect(currentSessionID(api)).toBe("s1")
})

test("the trajectory binds to the selected session with clear precedence", () => {
  const onSession = makeApi({ routes: [], slots: [], commands: [] }, { name: "session", params: { sessionID: "live" } })
  const offSession = makeApi({ routes: [], slots: [], commands: [] }, { name: "session", params: { sessionID: "other" } })
  const offRoute = makeApi({ routes: [], slots: [], commands: [] }, { name: "home" })

  // Explicit navigation param wins.
  expect(resolveSessionID(onSession, "explicit", "remembered")).toBe("explicit")
  // The session captured when the panel opened wins over the current route:
  // navigating elsewhere must not re-point the trajectory.
  expect(resolveSessionID(offSession, undefined, "remembered", "bound")).toBe("bound")
  // Without a captured session, the session currently open on the router.
  expect(resolveSessionID(onSession, undefined, "remembered")).toBe("live")
  // Outside a session route, the last observed session is used.
  expect(resolveSessionID(offRoute, undefined, "remembered")).toBe("remembered")
  // Nothing known at all stays undefined rather than a frozen id.
  expect(resolveSessionID(offRoute, undefined, undefined)).toBeUndefined()
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
