import { createMemo } from "solid-js"
import { useSync } from "@/context/sync"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"

interface VisionModelItem {
  value: string
  title: string
  category: string
  free: boolean
}

export function DialogVisionModel() {
  const sync = useSync()
  const dialog = useDialog()

  const items = createMemo(() => {
    const out: VisionModelItem[] = []
    for (const provider of sync.data.provider?.all.values() ?? []) {
      if (provider.id === "opencode") continue
      for (const [modelId, info] of Object.entries(provider.models)) {
        const supportsImage = info.capabilities?.input?.image
        if (!supportsImage) continue
        out.push({
          value: `${provider.id}/${modelId}`,
          title: info.name ?? modelId,
          category: provider.name,
          free: info.cost?.input === 0,
        })
      }
    }
    return out
  })

  return (
    <Dialog title="Select vision model">
      <List
        search={{ placeholder: "Search models...", autofocus: true }}
        emptyMessage="No vision-capable models found"
        key={(x) => x?.value ?? ""}
        items={items}
        filterKeys={["title", "category"]}
        sortBy={(a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)}
        onSelect={(x) => {
          if (!x) return
          // TODO: wire this to actual config persistence once a config-write
          // API/IPC channel exists (see attachment.image.vision_model in opencode.json).
          console.info("[dialog-vision-model] selected", x.value)
          dialog.close()
        }}
      >
        {(i) => (
          <div class="w-full flex items-center justify-between gap-x-3">
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="truncate">{i.title}</span>
              <span class="text-11-regular text-text-weaker truncate">{i.category}</span>
            </div>
            {i.free && <span class="text-11-regular text-text-weaker">Free</span>}
          </div>
        )}
      </List>
    </Dialog>
  )
}
