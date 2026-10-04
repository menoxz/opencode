import { createMemo } from "solid-js"
import { useSync } from "@/context/sync"
import { useLocal } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"

export function DialogAgent() {
  const sync = useSync()
  const local = useLocal()
  const dialog = useDialog()

  const items = createMemo(() =>
    sync.data.agent
      .filter((a) => a.mode !== "subagent" && !a.hidden)
      .map((a) => ({ name: a.name, description: a.native ? "native" : (a.description ?? "") })),
  )

  return (
    <Dialog title="Select agent">
      <List
        search={{ placeholder: "Search agents...", autofocus: true }}
        emptyMessage="No agents found"
        key={(x) => x?.name ?? ""}
        items={items}
        filterKeys={["name", "description"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (!x) return
          local.agent.set(x.name)
          dialog.close()
        }}
      >
        {(i) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <span class="truncate">{i.name}</span>
            <span class="text-11-regular text-text-weaker truncate">{i.description}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
