import { createSignal } from "solid-js"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export function DialogSessionRename(props: { sessionID: string }) {
  const sync = useSync()
  const sdk = useSDK()
  const dialog = useDialog()
  const session = () => sync.data.session.find((s) => s.id === props.sessionID)
  const [name, setName] = createSignal(session()?.title ?? "")

  const handleSave = async () => {
    const newName = name().trim()
    if (!newName) return
    try {
      await sdk.client.session.update({ sessionID: props.sessionID, title: newName } as any)
    } catch (e) {
      console.error("Failed to rename session:", e)
    }
    dialog.close()
  }

  return (
    <div class="p-4 flex flex-col gap-4">
      <h2 class="text-14-medium text-text-strong">Rename Session</h2>
      <input
        class="w-full px-3 py-2 rounded-md border border-border-weaker-base bg-background-base text-14-regular text-text-strong outline-none focus:border-accent"
        value={name()}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") dialog.close() }}
        placeholder="Session name"
        autofocus
      />
      <div class="flex justify-end gap-2">
        <button class="px-3 py-1.5 rounded-md text-14-regular text-text-strong hover:bg-overlay-simple-hover" onClick={() => dialog.close()}>Cancel</button>
        <button class="px-3 py-1.5 rounded-md text-14-regular bg-accent text-white hover:opacity-90" onClick={handleSave}>Save</button>
      </div>
    </div>
  )
}
