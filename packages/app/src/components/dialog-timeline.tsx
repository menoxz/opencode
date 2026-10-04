import { createMemo } from "solid-js"
import { useSync } from "@/context/sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import type { TextPart } from "@opencode-ai/sdk/v2"

interface TimelineItem {
  id: string
  title: string
  footer?: string
}

export function DialogTimeline(props: { sessionID: string; onMove: (messageID: string) => void }) {
  const sync = useSync()
  const dialog = useDialog()

  const items = createMemo(() => {
    const messages = sync.data.message[props.sessionID] ?? []
    const result: TimelineItem[] = []
    for (const msg of messages) {
      if (msg.role !== "user") continue
      const parts = sync.data.part[msg.id] ?? []
      const textPart = parts.find((p): p is TextPart => p.type === "text" && !p.synthetic && !p.ignored)
      if (!textPart) continue
      result.push({
        id: msg.id,
        title: textPart.text.replace(/\n/g, " ").slice(0, 120),
        footer: msg.time?.created ? new Date(msg.time.created).toLocaleString() : undefined,
      })
    }
    result.reverse()
    return result
  })

  return (
    <Dialog title="Message Timeline">
      <List
        search={{ placeholder: "Search messages...", autofocus: true }}
        emptyMessage="No messages found"
        key={(x) => x?.id ?? ""}
        items={items}
        filterKeys={["title"]}
        onSelect={(x) => {
          if (!x) return
          props.onMove(x.id)
          dialog.close()
        }}
      >
        {(i) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <span class="truncate">{i.title}</span>
            {i.footer && <span class="text-11-regular text-text-weaker shrink-0">{i.footer}</span>}
          </div>
        )}
      </List>
    </Dialog>
  )
}
