import { createMemo, Show, For, createSignal } from "solid-js"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { TodoItem } from "./todo-item"

export function TodoTab() {
  const sync = useSync()
  const { params } = useSessionLayout()
  const [open, setOpen] = createSignal(true)

  const list = createMemo(() => {
    const id = params.id
    if (!id) return []
    return sync.data.todo[id] ?? []
  })

  const show = createMemo(
    () => list().length > 0 && list().some((item) => item.status !== "completed" && item.status !== "cancelled"),
  )

  return (
    <Show when={show()}>
      <div class="flex flex-col gap-1 select-none">
        {/* Collapse toggle header */}
        <button
          onClick={() => list().length > 2 && setOpen((x) => !x)}
          class="flex items-center gap-1 text-12-regular text-text-strong hover:text-text-weaker transition-colors cursor-pointer bg-transparent border-none p-0 text-left"
        >
          <Show when={list().length <= 2}>
            <span class="text-11-regular text-text-weak w-3 shrink-0">▼</span>
          </Show>
          <Show when={list().length > 2}>
            <span class="text-11-regular text-text-weak w-3 shrink-0">{open() ? "▼" : "▶"}</span>
          </Show>
          <span class="font-semibold">TODO</span>
        </button>

        {/* Always expanded when <= 2 items, toggle when > 2 */}
        <Show when={list().length <= 2 || open()}>
          <div class="flex flex-col gap-1.5 pl-4">
            <For each={list()}>
              {(item) => <TodoItem status={item.status} content={item.content} />}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
