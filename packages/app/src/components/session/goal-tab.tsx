import { createMemo, Show, For, createSignal } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"

const TRUNCATE_MAX = 140

function truncateItem(value: string, max = TRUNCATE_MAX) {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function GoalTab(props: { onEdit?: () => void }) {
  const sync = useSync()
  const { params } = useSessionLayout()
  const [open, setOpen] = createSignal(true)

  const details = createMemo(() => {
    const session = params.id ? sync.session.get(params.id) : undefined
    const goalState = (session as { goalState?: { status?: string; goal?: string; dod?: string[]; outOfScope?: string[] } } | undefined)?.goalState

    if (!goalState || goalState.status === "skipped") {
      return {
        hasGoal: false,
        goal: "",
        dod: [] as string[],
        outOfScope: [] as string[],
      }
    }

    const goal = typeof goalState.goal === "string" ? goalState.goal.trim() : ""
    if (!goal) {
      return {
        hasGoal: false,
        goal: "",
        dod: [] as string[],
        outOfScope: [] as string[],
      }
    }

    const dod = Array.isArray(goalState.dod)
      ? goalState.dod
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim())
      : []

    const outOfScope = Array.isArray(goalState.outOfScope)
      ? goalState.outOfScope
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item: string) => item.trim())
      : []

    return {
      hasGoal: true,
      goal,
      dod,
      outOfScope,
    }
  })

  return (
    <div class="flex flex-col gap-1 select-none">
      {/* Collapse toggle header */}
      <div class="flex items-center justify-between gap-1">
        <button
          onClick={() => setOpen((x) => !x)}
          class="flex items-center gap-1 text-12-regular text-text-strong hover:text-text-weaker transition-colors cursor-pointer bg-transparent border-none p-0 text-left min-w-0"
        >
          <span class="text-11-regular text-text-weak w-3 shrink-0">{open() ? "▼" : "▶"}</span>
          <span class="font-semibold">TASK CONTRACT</span>
        </button>
        <Show when={props.onEdit}>
          {(onEdit) => (
            <Tooltip value="Edit task contract" placement="top">
              <IconButton
                icon="edit"
                variant="ghost"
                size="small"
                iconSize="small"
                class="!size-5 shrink-0"
                onClick={onEdit()}
                aria-label="Edit task contract"
              />
            </Tooltip>
          )}
        </Show>
      </div>

      <Show when={open()}>
        <div class="flex flex-col gap-1.5 pl-4">
          <Show
            when={details().hasGoal}
            fallback={<div class="text-12-regular text-text-weak">no contract defined</div>}
          >
            {/* Objective */}
            <div class="flex flex-col gap-0.5">
              <span class="text-12-regular text-text-weak">Obj: </span>
              <span class="text-12-regular text-text-strong whitespace-pre-wrap break-words">
                {details().goal}
              </span>
            </div>

            {/* Definition of Done */}
            <Show when={details().dod.length > 0}>
              <div class="flex flex-col gap-0.5">
                <span class="text-12-regular text-text-weak">
                  DoD({details().dod.length})
                </span>
                <For each={details().dod}>
                  {(item) => (
                    <div class="flex flex-row gap-1">
                      <span class="text-12-regular text-text-weak shrink-0">•</span>
                      <span class="text-12-regular text-text-strong whitespace-pre-wrap break-words min-w-0">
                        {truncateItem(item)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Out of Scope */}
            <Show when={details().outOfScope.length > 0}>
              <div class="flex flex-col gap-0.5">
                <span class="text-12-regular" style={{ color: "var(--text-danger)" }}>
                  OOS({details().outOfScope.length})
                </span>
                <For each={details().outOfScope}>
                  {(item) => (
                    <div class="flex flex-row gap-1">
                      <span
                        class="text-12-regular shrink-0"
                        style={{ color: "var(--text-danger)" }}
                      >
                        ◦
                      </span>
                      <span class="text-12-regular text-text-weak whitespace-pre-wrap break-words min-w-0">
                        {truncateItem(item)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  )
}
