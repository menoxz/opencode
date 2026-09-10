import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import type { KeyEvent, RGBA } from "@opentui/core"
import { createMemo, Show, createSignal, For } from "solid-js"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "TASK CONTRACT",
  emptyState: "no contract defined",
  objectiveLabel: "Obj",
  dodLabel: "DoD",
  outOfScopeLabel: "OOS",
} as const

function truncateItem(value: string, max = 140) {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export function TaskContractSection(props: {
  goal: string
  dod: string[]
  outOfScope: string[]
  color: RGBA | string
  muted: RGBA | string
  warning: RGBA | string
}) {
  const [detailsOpen, setDetailsOpen] = createSignal(false)
  const [detailsFocused, setDetailsFocused] = createSignal(false)
  const hasDetails = () => props.dod.length > 0 || props.outOfScope.length > 0
  const toggleDetails = () => setDetailsOpen((open) => !open)
  const handleDetailsKey = (event: KeyEvent) => {
    if (!["return", "enter", "space"].includes(event.name)) return
    event.preventDefault()
    event.stopPropagation()
    toggleDetails()
  }

  return (
    <box gap={0}>
      <text fg={props.color}>
        <b>{TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}</b>
      </text>
      <text fg={props.color} wrapMode="word" width="100%">
        <span style={{ fg: props.muted }}>{TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel}: </span>
        {props.goal}
      </text>
      <Show when={hasDetails()}>
        <box
          id="task-contract-details-toggle"
          flexDirection="row"
          gap={1}
          focusable
          onMouseDown={(event) => {
            event.target?.focus()
            toggleDetails()
          }}
          onKeyDown={handleDetailsKey}
          on:focused={() => setDetailsFocused(true)}
          on:blurred={() => setDetailsFocused(false)}
        >
          <text fg={detailsFocused() ? props.color : props.muted}>{detailsOpen() ? "▼" : "▶"}</text>
          <text fg={props.color}>
            Details ({TASK_CONTRACT_SIDEBAR_COPY.dodLabel} {props.dod.length} ·{" "}
            {TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel} {props.outOfScope.length})
          </text>
        </box>
        <Show when={detailsOpen()}>
          <Show when={props.dod.length > 0}>
            <box gap={0}>
              <text fg={props.muted}>
                {TASK_CONTRACT_SIDEBAR_COPY.dodLabel}({props.dod.length})
              </text>
              <For each={props.dod}>
                {(item) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={props.muted}>•</text>
                    <text fg={props.color} wrapMode="word">
                      {truncateItem(item)}
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
          <Show when={props.outOfScope.length > 0}>
            <box gap={0}>
              <text fg={props.warning}>
                {TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel}({props.outOfScope.length})
              </text>
              <For each={props.outOfScope}>
                {(item) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={props.warning}>◦</text>
                    <text fg={props.muted} wrapMode="word">
                      {truncateItem(item)}
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
        </Show>
      </Show>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const session = createMemo(() => props.api.state.session.get(props.session_id) as any)

  const details = createMemo(() => {
    const goalState = session()?.goalState
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
    <box>
      <Show when={!details().hasGoal}>
        <text fg={theme().text}>
          <b>{TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}</b>
        </text>
        <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.emptyState}</text>
      </Show>
      <Show when={details().hasGoal}>
        <TaskContractSection
          goal={details().goal}
          dod={details().dod}
          outOfScope={details().outOfScope}
          color={theme().text}
          muted={theme().textMuted}
          warning={theme().warning}
        />
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
