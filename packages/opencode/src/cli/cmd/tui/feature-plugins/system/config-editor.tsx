/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { useTheme } from "@tui/context/theme"
import { useBindings } from "../../keymap"
import { globalConfigFile } from "@/config/config"
import type { Config } from "@opencode-ai/sdk/v2"
import { createMemo, createSignal, For, Show } from "solid-js"
import { ROUTE_CONFIG, ROUTE_LOGS } from "./navbar"

const id = "internal:config-editor"

type Scope = "global" | "project"

// Never print credential material on screen; the value stays editable so the
// operator can still rotate it, but it is masked while browsing.
const SENSITIVE = /api[-_]?key|secret|token|password|passwd|credential/i

export function isSensitive(key: string) {
  return SENSITIVE.test(key)
}

export function preview(value: unknown, sensitive: boolean) {
  if (sensitive) return "••••••••"
  if (value === undefined) return "undefined"
  try {
    const text = JSON.stringify(value)
    if (text === undefined) return String(value)
    return text.length > 64 ? text.slice(0, 61) + "..." : text
  } catch {
    return String(value)
  }
}

export function kindOf(value: unknown) {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  return typeof value
}

function ConfigEditor(props: { api: TuiPluginApi }) {
  const { theme } = useTheme()
  const [scope, setScope] = createSignal<Scope>("global")
  const [selected, setSelected] = createSignal(0)
  // The TUI sync store only refreshes config on bootstrap, so keep a local
  // overlay so the editor reflects a save immediately without a restart.
  const [overrides, setOverrides] = createSignal<Record<string, unknown>>({})

  const file = createMemo(() => (scope() === "global" ? globalConfigFile() : props.api.state.path.config))

  const entries = createMemo(() => {
    const merged = { ...(props.api.state.config as Record<string, unknown>), ...overrides() }
    return Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))
  })

  const current = createMemo(() => {
    const list = entries()
    if (!list.length) return undefined
    const index = Math.min(selected(), list.length - 1)
    return list[index]
  })

  function move(delta: number) {
    const size = entries().length
    if (!size) return
    setSelected((value) => (value + delta + size) % size)
  }

  function toast(variant: "success" | "error", message: string) {
    props.api.ui.toast({ variant, message, duration: variant === "error" ? 6000 : 4000 })
  }

  function edit() {
    const entry = current()
    if (!entry) return
    const [key, value] = entry
    props.api.ui.dialog.replace(() => (
      <props.api.ui.DialogPrompt
        title={`${key} → ${scope()}`}
        placeholder="JSON value"
        value={JSON.stringify(value, null, 2)}
        description={() => (
          <text fg={theme.textMuted}>
            {file()} — value is parsed as JSON before writing (merge, non destructive).
          </text>
        )}
        onConfirm={(text) => void save(key, text)}
        onCancel={() => props.api.ui.dialog.clear()}
      />
    ))
    props.api.ui.dialog.setSize("large")
  }

  async function save(key: string, text: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      toast("error", `Invalid JSON for "${key}" — value not written`)
      return
    }
    const body = { [key]: parsed } as Config
    const target = file()
    const result =
      scope() === "global"
        ? await props.api.client.global.config.update({ config: body })
        : await props.api.client.config.update({ config: body })
    if (result && "error" in result && result.error) {
      toast("error", `Could not write ${target}`)
      return
    }
    setOverrides((prev) => ({ ...prev, [key]: parsed }))
    props.api.ui.dialog.clear()
    toast("success", `${key} saved to ${target}`)
  }

  useBindings(() => ({
    commands: [
      { name: "config.editor.down", title: "Next config entry", category: "Config", run: () => move(1) },
      { name: "config.editor.up", title: "Previous config entry", category: "Config", run: () => move(-1) },
      { name: "config.editor.edit", title: "Edit config entry", category: "Config", run: edit },
      {
        name: "config.editor.scope",
        title: "Toggle config scope",
        category: "Config",
        run: () => setScope((value) => (value === "global" ? "project" : "global")),
      },
      { name: "config.editor.close", title: "Close config editor", category: "Config", run: () => props.api.route.navigate("home") },
      {
        name: "config.editor.logs",
        title: "Open session logs",
        category: "Config",
        run: () => props.api.route.navigate(ROUTE_LOGS),
      },
    ],
    bindings: [
      { key: "j,down", cmd: "config.editor.down", desc: "Next entry" },
      { key: "k,up", cmd: "config.editor.up", desc: "Previous entry" },
      { key: "enter,return", cmd: "config.editor.edit", desc: "Edit value" },
      { key: "tab", cmd: "config.editor.scope", desc: "Toggle scope" },
      { key: "l", cmd: "config.editor.logs", desc: "Logs" },
      { key: "escape", cmd: "config.editor.close", desc: "Close" },
    ],
  }))

  return (
    <box flexGrow={1} minHeight={0} flexDirection="column">
      <box flexDirection="row" gap={2} paddingLeft={2} paddingRight={2} paddingTop={1} flexShrink={0}>
        <text fg={theme.text}>
          <b>Config</b>
        </text>
        <text fg={theme.primary}>{scope() === "global" ? "global" : "project"}</text>
        <text fg={theme.textMuted}>{file()}</text>
      </box>
      <box flexGrow={1} minHeight={0} paddingLeft={2} paddingRight={2}>
        <Show
          when={entries().length}
          fallback={<text fg={theme.textMuted}>No config keys to display.</text>}
        >
          <scrollbox flexGrow={1}>
            <For each={entries()}>
              {(entry, index) => (
                <box
                  flexDirection="row"
                  gap={1}
                  flexShrink={0}
                  backgroundColor={index() === selected() ? theme.backgroundElement : undefined}
                  onMouseUp={() => setSelected(index())}
                >
                  <text fg={index() === selected() ? theme.primary : theme.text} width={28} wrapMode="none">
                    {entry[0]}
                  </text>
                  <text fg={theme.textMuted} width={8} wrapMode="none">
                    {kindOf(entry[1])}
                  </text>
                  <text fg={theme.text} wrapMode="none">
                    {preview(entry[1], isSensitive(entry[0]))}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
      <box flexShrink={0} paddingLeft={2} paddingRight={2} paddingBottom={1}>
        <text fg={theme.textMuted}>
          j/k move · enter edit · tab scope ({scope()}) · l logs · esc close — writes merge, JSONC preserved
        </text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.route.register([
    {
      name: ROUTE_CONFIG,
      render: () => <ConfigEditor api={api} />,
    },
  ])
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
