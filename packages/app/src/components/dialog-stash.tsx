import { createEffect, createMemo, createSignal, For, Show, onMount } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"

const STASH_STORAGE_KEY = "opencode-stash"

export interface StashItem {
  id: string
  text: string
  date: number
}

export interface DialogStashProps {
  sessionID: string
  onLoad?: (text: string) => void
}

export function DialogStash(props: DialogStashProps) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const storage = platform.storage?.()

  const [stash, setStash] = createSignal<StashItem[]>([])
  const [pendingText, setPendingText] = createSignal("")
  const [selectedId, setSelectedId] = createSignal<string | null>(null)

  // Helper to read stash from storage
  const readStash = (): StashItem[] => {
    try {
      if (!storage) return []
      const raw = typeof storage.getItem === "function"
        ? storage.getItem(STASH_STORAGE_KEY)
        : (storage as unknown as Record<string, string>)[STASH_STORAGE_KEY]
      if (!raw) return []
      return JSON.parse(raw as string) as StashItem[]
    } catch {
      return []
    }
  }

  // Helper to write stash to storage
  const writeStash = (items: StashItem[]) => {
    try {
      if (!storage) return
      const raw = JSON.stringify(items)
      if (typeof (storage as any).setItem === "function") {
        ;(storage as any).setItem(STASH_STORAGE_KEY, raw)
      }
    } catch {
      // silently fail
    }
  }

  // Load stash on mount
  onMount(() => {
    setStash(readStash())
  })

  // Save draft from pending text
  const handleSave = () => {
    const text = pendingText().trim()
    if (!text) return

    const item: StashItem = {
      id: Date.now().toString(36),
      text,
      date: Date.now(),
    }

    const updated = [item, ...stash()]
    setStash(updated)
    writeStash(updated)
    setPendingText("")
    showToast({ title: language.t("dialog.stash.saved") ?? "Draft saved" })
  }

  // Load a draft into the prompt
  const handleLoad = (item: StashItem) => {
    props.onLoad?.(item.text)
    dialog.close()
  }

  // Delete a draft
  const handleDelete = (id: string) => {
    const updated = stash().filter((item) => item.id !== id)
    setStash(updated)
    writeStash(updated)
    if (selectedId() === id) setSelectedId(null)
  }

  // Delete all drafts
  const handleClearAll = () => {
    setStash([])
    writeStash([])
    setSelectedId(null)
    showToast({ title: language.t("dialog.stash.cleared") ?? "All drafts cleared" })
  }

  const formatDate = (timestamp: number): string => {
    const d = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return language.t("time.justNow") ?? "Just now"
    if (diffMin < 60) return `${diffMin}m`
    if (diffHr < 24) return `${diffHr}h`
    if (diffDay < 7) return `${diffDay}d`
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }

  const previewText = (text: string, maxLen = 120): string => {
    const trimmed = text.replace(/\s+/g, " ").trim()
    if (trimmed.length <= maxLen) return trimmed
    return trimmed.slice(0, maxLen) + "…"
  }

  return (
    <Dialog title={language.t("dialog.stash.title") ?? "Stash — Drafts"} size="normal">
      <div class="flex flex-col gap-3 min-h-0">
        {/* Save new draft */}
        <div class="flex gap-2">
          <textarea
            class="flex-1 min-h-[60px] px-3 py-2 rounded-md bg-surface-base border border-border-base text-13-regular text-text-strong placeholder-text-weaker resize-none outline-none focus:border-primary-base"
            placeholder={language.t("dialog.stash.placeholder") ?? "Write a draft to save…"}
            value={pendingText()}
            onInput={(e) => setPendingText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                handleSave()
              }
            }}
          />
          <button
            class="self-end flex items-center gap-1 px-3 py-1.5 rounded-md text-12-medium bg-primary-base text-white disabled:opacity-40 transition-opacity"
            disabled={!pendingText().trim()}
            onClick={handleSave}
          >
            <Icon name="plus-small" size="small" />
            {language.t("common.save") ?? "Save"}
          </button>
        </div>

        {/* Drafts list */}
        <Show
          when={stash().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-8 text-text-weaker text-13-regular">
              {language.t("dialog.stash.empty") ?? "No drafts saved yet"}
            </div>
          }
        >
          <div class="flex items-center justify-between px-1">
            <span class="text-11-regular text-text-weak">
              {stash().length} {language.t("dialog.stash.count") ?? "draft(s)"}
            </span>
            <button
              class="flex items-center gap-1 text-11-medium text-text-weaker hover:text-text-strong transition-colors"
              onClick={handleClearAll}
            >
              <Icon name="trash" size="small" />
              {language.t("common.clearAll") ?? "Clear all"}
            </button>
          </div>

          <div class="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
            <For each={stash()}>
              {(item) => (
                <div
                  class="group flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors"
                  classList={{
                    "bg-surface-base border border-border-base": selectedId() === item.id,
                    "hover:bg-surface-hover": selectedId() !== item.id,
                  }}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div class="flex-1 min-w-0">
                    <div class="text-13-regular text-text-strong truncate">
                      {previewText(item.text)}
                    </div>
                    <div class="text-11-regular text-text-weaker mt-0.5">
                      {formatDate(item.date)}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      class="flex items-center gap-1 px-2 py-1 rounded text-11-medium bg-surface-base border border-border-base text-text-strong hover:bg-surface-hover transition-colors"
                      title={language.t("common.load") ?? "Load"}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLoad(item)
                      }}
                    >
                      <Icon name="enter" size="small" />
                      {language.t("common.load") ?? "Load"}
                    </button>
                    <button
                      class="flex items-center gap-1 px-2 py-1 rounded text-11-medium text-text-weaker hover:text-text-danger transition-colors"
                      title={language.t("common.delete") ?? "Delete"}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(item.id)
                      }}
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
