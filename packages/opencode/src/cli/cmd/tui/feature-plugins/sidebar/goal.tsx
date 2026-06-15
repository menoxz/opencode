import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, Show, createSignal, For } from "solid-js"
import {
  formatTaskContractCompact,
  formatTaskContractCompactLines,
  MAX_DOD_PREVIEW,
  MAX_OOS_PREVIEW,
} from "./task-contract-compact"

const id = "internal:sidebar-goal"

export const TASK_CONTRACT_SIDEBAR_COPY = {
  sectionTitle: "TASK CONTRACT",
  emptyState: "no contract defined",
  objectiveLabel: "Obj",
  panelExpandHint: "expand",
  panelCollapseHint: "collapse",
  dodLabel: "DoD",
  outOfScopeLabel: "OOS",
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

  const compactLines = createMemo(() =>
    formatTaskContractCompactLines(compact(), {
      objective: TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel,
      dod: TASK_CONTRACT_SIDEBAR_COPY.dodLabel,
      oos: TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel,
    }),
  )

  const compactLine = createMemo(() => {
    const c = compact()
    const l = TASK_CONTRACT_SIDEBAR_COPY
    const objText = c.objective.text || "-"
    const dodText = `${c.dod.summary}${c.dod.hidden > 0 ? `…+${c.dod.hidden}` : ""}`
    const oosText = `${c.outOfScope.summary}${c.outOfScope.hidden > 0 ? `…+${c.outOfScope.hidden}` : ""}`
    return `▸ ${l.objectiveLabel}: ${objText} | ${l.dodLabel}(${c.dod.total}): ${dodText} | ${l.outOfScopeLabel}(${c.outOfScope.total}): ${oosText}`
  })

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
          <box paddingLeft={0} gap={expanded() ? 1 : 0}>
            <Show when={!expanded()}>
              <text fg={theme().text} wrapMode="none" truncate width="100%">{compactLine()}</text>
            </Show>

            <Show when={expanded()}>
              <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.objectiveLabel}: </text>
              <text fg={theme().text} wrapMode="word" width="100%">
                {details().goal}
              </text>
              <Show when={details().dod.length > 0}>
                <box gap={0}>
                  <text fg={theme().textMuted}>{TASK_CONTRACT_SIDEBAR_COPY.dodLabel}({details().dod.length})</text>
                  <For each={details().dod}>
                    {(item) => (
                      <box flexDirection="row" gap={1}>
                        <text fg={theme().textMuted}>•</text>
                        <text fg={theme().text} wrapMode="word">
                          {truncateItem(item)}
                        </text>
                      </box>
                    )}
                  </For>
                </box>
              </Show>

              <Show when={details().outOfScope.length > 0}>
                <box gap={0}>
                  <text fg={theme().warning}>{TASK_CONTRACT_SIDEBAR_COPY.outOfScopeLabel}({details().outOfScope.length})</text>
                  <For each={details().outOfScope}>
                    {(item) => (
                      <box flexDirection="row" gap={1}>
                        <text fg={theme().warning}>◦</text>
                        <text fg={theme().textMuted} wrapMode="word">
                          {truncateItem(item)}
                        </text>
                      </box>
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
