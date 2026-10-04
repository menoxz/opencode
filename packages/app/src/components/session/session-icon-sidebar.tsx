import { For } from "solid-js"
import type { Accessor } from "solid-js"
import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"

export type SessionSidePanelView = "detail" | "files"

const ITEMS: { id: SessionSidePanelView; icon: IconProps["name"]; label: string }[] = [
  { id: "detail", icon: "task", label: "Session detail" },
  { id: "files", icon: "folder", label: "File tree" },
]

/**
 * Compact vertical activity-bar style icon list to switch between the
 * SessionDetailWidget (Module 1) and the folder file tree, inside the
 * session side panel (Module 4).
 */
export function SessionIconSidebar(props: {
  active: Accessor<SessionSidePanelView>
  onSelect: (view: SessionSidePanelView) => void
}) {
  return (
    <div
      data-component="session-icon-sidebar"
      class="h-full shrink-0 w-9 flex flex-col items-center gap-1 py-2 border-r border-border-weaker-base bg-background-stronger"
    >
      <For each={ITEMS}>
        {(item) => (
          <Tooltip value={item.label} placement="right">
            <button
              type="button"
              onClick={() => props.onSelect(item.id)}
              class="flex items-center justify-center size-7 rounded-md border-none bg-transparent cursor-pointer transition-colors"
              classList={{
                "bg-surface-raised-base-active text-icon-strong": props.active() === item.id,
                "text-icon-weak hover:text-icon-base": props.active() !== item.id,
              }}
              aria-label={item.label}
              aria-pressed={props.active() === item.id}
            >
              <Icon name={item.icon} size="small" />
            </button>
          </Tooltip>
        )}
      </For>
    </div>
  )
}
