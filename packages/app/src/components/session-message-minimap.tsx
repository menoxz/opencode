import { createMemo, For, Show } from "solid-js"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"

export function SessionMessageMinimap(props: { sessionID: string; onNavigate?: (messageID: string) => void }) {
  const sync = useSync()
  const messages = createMemo(() => sync.data.message[props.sessionID] ?? [])

  const segments = createMemo(() => {
    const msgs = messages()
    if (msgs.length === 0) return []
    return msgs.map((m: any, i: number) => ({
      id: m.id,
      role: m.role,
      index: i,
      fraction: i / Math.max(msgs.length - 1, 1),
      label: m.role === "user" ? "U" : m.role === "assistant" ? "A" : m.role === "tool" ? "T" : "?"
    }))
  })

  return (
    <Show when={segments().length > 3}>
      <div class="w-6 bg-background-stronger border-l border-border-weaker-base flex flex-col items-center py-1 gap-0.5 overflow-hidden">
        <For each={segments()}>
          {(seg) => (
            <div
              class="w-3 h-1.5 rounded-sm cursor-pointer hover:scale-150 transition-transform shrink-0"
              classList={{
                "bg-accent": seg.role === "user",
                "bg-text-strong": seg.role === "assistant",
                "bg-text-weaker": seg.role === "tool" || seg.role === "system",
              }}
              onClick={() => props.onNavigate?.(seg.id)}
              title={`${seg.role} message #${seg.index + 1}`}
            />
          )}
        </For>
      </div>
    </Show>
  )
}
