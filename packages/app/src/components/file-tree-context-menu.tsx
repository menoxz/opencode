import { createSignal, Show, For, onMount, onCleanup } from "solid-js"
import { usePlatform } from "@/context/platform"

export interface ContextMenuTarget {
  x: number
  y: number
  path?: string
  isDir?: boolean
}

export interface ContextMenuAction {
  label: string
  action: () => void
  separator?: boolean
  disabled?: boolean
}

export interface FileTreeContextMenuProps {
  x: number
  y: number
  path?: string
  isDir?: boolean
  onClose: () => void
  onOpen?: (path: string) => void
  onRename?: (path: string) => void
  onDelete?: (path: string) => void
  onNewFile?: (parentDir: string) => void
  onNewFolder?: (parentDir: string) => void
  onPaste?: (parentDir: string) => void
}

export function FileTreeContextMenu(props: FileTreeContextMenuProps) {
  const platform = usePlatform()
  let menuRef: HTMLDivElement | undefined

  const copyPath = async () => {
    if (!props.path) return
    try {
      await navigator.clipboard.writeText(props.path)
    } catch {
      // silently fail
    }
    props.onClose()
  }

  const revealInExplorer = () => {
    if (!props.path || !platform.openPath) return
    platform.openPath(props.path).catch(() => {})
    props.onClose()
  }

  const items = (): ContextMenuAction[] => {
    if (props.path && props.isDir) {
      return [
        { label: "New File", action: () => { props.onNewFile?.(props.path!); props.onClose() } },
        { label: "New Folder", action: () => { props.onNewFolder?.(props.path!); props.onClose() } },
        { label: "", action: () => {}, separator: true, disabled: true },
        { label: "Rename", action: () => { props.onRename?.(props.path!); props.onClose() } },
        { label: "Delete", action: () => { props.onDelete?.(props.path!); props.onClose() } },
      ]
    }

    if (props.path && !props.isDir) {
      return [
        { label: "Open", action: () => { props.onOpen?.(props.path!); props.onClose() } },
        { label: "", action: () => {}, separator: true, disabled: true },
        { label: "Rename", action: () => { props.onRename?.(props.path!); props.onClose() } },
        { label: "Delete", action: () => { props.onDelete?.(props.path!); props.onClose() } },
        { label: "", action: () => {}, separator: true, disabled: true },
        { label: "Copy Path", action: copyPath },
        { label: "Reveal in Explorer", action: revealInExplorer, disabled: !platform.openPath },
      ]
    }

    // Empty space context menu
    const parentDir = ""
    return [
      { label: "New File", action: () => { props.onNewFile?.(parentDir); props.onClose() } },
      { label: "New Folder", action: () => { props.onNewFolder?.(parentDir); props.onClose() } },
      { label: "", action: () => {}, separator: true, disabled: true },
      { label: "Paste", action: () => { props.onPaste?.(parentDir); props.onClose() } },
    ]
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose()
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef && !menuRef.contains(e.target as Node)) {
      props.onClose()
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
    // Use mousedown to catch clicks before they bubble
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
    document.removeEventListener("mousedown", handleClickOutside)
  })

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: `${props.x}px`,
        top: `${props.y}px`,
        "z-index": 1000,
      }}
      class="bg-background-stronger border border-border-weaker-base rounded-md shadow-lg py-1 min-w-[160px]"
    >
      <For each={items()}>
        {(item) => (
          <Show
            when={!item.separator}
            fallback={<div class="border-t border-border-weaker-base my-1" />}
          >
            <button
              type="button"
              disabled={item.disabled}
              onClick={item.action}
              classList={{
                "w-full text-left px-3 py-1.5 text-13-regular text-text-strong hover:bg-overlay-simple-hover transition-colors cursor-pointer": true,
                "opacity-40 cursor-not-allowed hover:bg-transparent": item.disabled,
              }}
            >
              {item.label}
            </button>
          </Show>
        )}
      </For>
    </div>
  )
}

export function useContextMenu() {
  const [menu, setMenu] = createSignal<ContextMenuTarget | null>(null)

  return {
    menu,
    show: (e: MouseEvent, path?: string, isDir?: boolean) => {
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, path, isDir })
    },
    close: () => setMenu(null),
  }
}
