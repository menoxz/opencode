import { createMemo, For, Show, createSignal } from "solid-js"
import { useSync } from "@/context/sync"

const STATUS_COLORS: Record<string, string> = {
  connected: "#22c55e",
  failed: "#ef4444",
  disabled: "#6b7280",
  needs_auth: "#f97316",
  needs_client_registration: "#ef4444",
}

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  failed: "Failed",
  disabled: "Disabled",
  needs_auth: "Needs auth",
  needs_client_registration: "Needs client ID",
}

export function MCPTab() {
  const sync = useSync()
  const [open, setOpen] = createSignal(true)

  const list = createMemo(() =>
    Object.entries(sync.data.mcp ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, item]) => ({
        name,
        status: item.status,
        error: item.status === "failed" || item.status === "needs_client_registration" ? item.error : undefined,
      })),
  )

  const on = createMemo(() => list().filter((s) => s.status === "connected").length)
  const errors = createMemo(
    () =>
      list().filter(
        (s) => s.status === "failed" || s.status === "needs_auth" || s.status === "needs_client_registration",
      ).length,
  )

  return (
    <Show when={list().length > 0}>
      <div class="flex flex-col gap-1 select-none">
        {/* Collapse toggle header */}
        <button
          onClick={() => list().length > 2 && setOpen((x) => !x)}
          class="flex items-center gap-1 text-12-regular text-text-strong hover:text-text-weaker transition-colors cursor-pointer bg-transparent border-none p-0 text-left"
        >
          <Show when={list().length > 2}>
            <span class="text-11-regular text-text-weak w-3 shrink-0">{open() ? "▼" : "▶"}</span>
          </Show>
          <span class="font-semibold">
            MCP
            <span class="text-text-weak font-normal">
              {" "}({on()} active{errors() > 0 ? `, ${errors()} error${errors() > 1 ? "s" : ""}` : ""})
            </span>
          </span>
        </button>

        {/* Always expanded when <= 2 items, toggle when > 2 */}
        <Show when={list().length <= 2 || open()}>
          <div class="flex flex-col gap-1.5 pl-4">
            <For each={list()}>
              {(item) => (
                <div class="flex items-center gap-1.5 min-w-0">
                  {/* Status dot */}
                  <span
                    class="shrink-0"
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      "background-color": STATUS_COLORS[item.status] ?? "#6b7280",
                    }}
                  />
                  {/* Server name */}
                  <span class="text-12-regular text-text-strong font-semibold truncate">{item.name}</span>
                  {/* Status label */}
                  <span class="text-12-regular text-text-weak shrink-0">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {/* Error message */}
                  <Show when={item.error}>
                    <span class="text-12-regular truncate" style={{ color: "#ef4444", "font-style": "italic" }}>
                      {item.error}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
