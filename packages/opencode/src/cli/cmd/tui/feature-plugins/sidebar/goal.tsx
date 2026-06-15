import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, Show, createSignal, For } from "solid-js"
import {
  formatTaskContractCompact,
  MAX_DOD_PREVIEW,
  MAX_OOS_PREVIEW,
} from "./task-contract-compact"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "TASK CONTRACT",
  emptyState: "no contract defined",
  objectiveLabel: "Objective",
  panelExpandHint: "expand",
  panelCollapseHint: "collapse",
  dodLabel: "Definition of Done",
  outOfScopeLabel: "Out of Scope",
  moreItemsSuffix: "items",
} as const

function truncateItem(value: string, max = 140) {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = createSignal(true)
  const [expanded, setExpanded] = createSignal(false)
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

  const compact = createMemo(() =>
    formatTaskContractCompact({
      goal: details().goal,
      dod: details().dod,
      outOfScope: details().outOfScope,
    }),
  )

  const toggleExpanded = () => setExpanded((prev) => !prev)

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={() => setOpen((x) => !x)}>
        <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
        <text fg={theme().text}>
          <b>{TASK_CONTRACT_SIDEBAR_COPY.sectionTitle}</b>
        </text>
      </box>
      <Show when={open()}>
        <Show when={!details().hasGoal}>
          <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.emptyState}</text>
        </Show>
        <Show when={details().hasGoal}>
          <box paddingLeft={2} gap={1}>
            <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel}</text>
            <text fg={theme().text} wrapMode={expanded() ? "word" : "none"} truncate={!expanded()} width="100%">
              {expanded() ? details().goal : compact().objective.text}
            </text>

            <Show when={!expanded()}>
              <text fg={theme().textMuted}>
                {TASK_CONTRACT_SIDEBAR_COPY.dodLabel}: {compact().dod.total}
              </text>
              <For each={compact().dod.visible}>
                {(item) => (
                  <box flexDirection="row" paddingLeft={1} gap={1}>
                    <text fg={theme().textMuted}>•</text>
                    <text fg={theme().text} wrapMode="word">
                      {truncateItem(item)}
                    </text>
                  </box>
                )}
              </For>
              <Show when={compact().dod.hidden > 0}>
                <text fg={theme().textMuted} paddingLeft={2}>
                  … +{compact().dod.hidden} {TASK_CONTRACT_SIDEBAR_COPY.moreItemsSuffix}
                </text>
              </Show>

              <text fg={theme().warning}>
                {TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel}: {compact().outOfScope.total}
              </text>
              <For each={compact().outOfScope.visible}>
                {(item) => (
                  <box flexDirection="row" paddingLeft={1} gap={1}>
                    <text fg={theme().warning}>◦</text>
                    <text fg={theme().textMuted} wrapMode="word">
                      {truncateItem(item)}
                    </text>
                  </box>
                )}
              </For>
              <Show when={compact().outOfScope.hidden > 0}>
                <text fg={theme().textMuted} paddingLeft={2}>
                  … +{compact().outOfScope.hidden} {TASK_CONTRACT_SIDEBAR_COPY.moreItemsSuffix}
                </text>
              </Show>
            </Show>

            <Show when={expanded()}>
              <Show when={details().dod.length > 0}>
                <box paddingLeft={1} paddingTop={1} gap={0}>
                  <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.dodLabel}</text>
                  <For each={details().dod}>
                    {(item, index) => (
                      <>
                        <box flexDirection="row" paddingLeft={1} gap={1}>
                          <text fg={theme().textMuted}>•</text>
                          <text fg={theme().text} wrapMode="word">
                            {truncateItem(item)}
                          </text>
                        </box>
                        <Show when={index() < details().dod.length - 1}>
                          <text fg={theme().textMuted} paddingLeft={2}>
                            ┆
                          </text>
                        </Show>
                      </>
                    )}
                  </For>
                </box>
              </Show>

              <Show when={details().outOfScope.length > 0}>
                <box paddingLeft={1} paddingTop={1} gap={0}>
                  <text fg={theme().warning}>{TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel}</text>
                  <For each={details().outOfScope}>
                    {(item, index) => (
                      <>
                        <box flexDirection="row" paddingLeft={1} gap={1}>
                          <text fg={theme().warning}>◦</text>
                          <text fg={theme().textMuted} wrapMode="word">
                            {truncateItem(item)}
                          </text>
                        </box>
                        <Show when={index() < details().outOfScope.length - 1}>
                          <text fg={theme().textMuted} paddingLeft={2}>
                            ┆
                          </text>
                        </Show>
                      </>
                    )}
                  </For>
                </box>
              </Show>
            </Show>

            <Show when={compact().objective.truncated || details().dod.length > MAX_DOD_PREVIEW || details().outOfScope.length > MAX_OOS_PREVIEW}>
              <text
                fg={theme().primary}
                onMouseDown={toggleExpanded}
              >
                {expanded()
                  ? TASK_CONTRACT_SIDEBAR_COPY.panelCollapseHint
                  : TASK_CONTRACT_SIDEBAR_COPY.panelExpandHint}
              </text>
            </Show>
          </box>
        </Show>
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
