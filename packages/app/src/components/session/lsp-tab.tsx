import { createMemo, For, Show, createSignal } from "solid-js"
import { useSync } from "@/context/sync"

export function LSPTab(props: { collapsible?: boolean }) {
  const sync = useSync()
  const [open, setOpen] = createSignal(true)
  const collapsible = createMemo(() => props.collapsible ?? true)

  const list = createMemo(() => sync.data.lsp)
  const off = createMemo(() => !sync.data.config?.lsp)
  const canToggle = createMemo(() => collapsible() && (list()?.length ?? 0) > 2)
  const showContent = createMemo(() => !canToggle() || open())

  return (
    <div class="flex flex-col gap-1 select-none">
      {/* Collapse toggle header */}
      <button
        onClick={() => canToggle() && setOpen((x) => !x)}
        class="flex items-center gap-1 text-12-regular text-text-strong hover:text-text-weaker transition-colors cursor-pointer bg-transparent border-none p-0 text-left"
      >
        <Show when={canToggle()}>
          <span class="text-11-regular text-text-weak w-3 shrink-0">{open() ? "▼" : "▶"}</span>
        </Show>
        <span class="font-semibold">LSP</span>
      </button>

      {/* Always expanded when not collapsible or <= 2 items, toggle when > 2 and collapsible */}
      <Show when={showContent()}>
        <Show when={list().length === 0}>
          <span class="text-12-regular text-text-weak pl-4">
            {off() ? "LSPs are disabled" : "LSPs will activate as files are read"}
          </span>
        </Show>
        <Show when={list().length > 0}>
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
                      "background-color": item.status === "connected" ? "#22c55e" : "#ef4444",
                    }}
                  />
                  {/* Server ID */}
                  <span class="text-12-regular text-text-strong font-semibold truncate">{item.id}</span>
                  {/* Root path */}
                  <span class="text-12-regular text-text-weak truncate">{item.root}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
