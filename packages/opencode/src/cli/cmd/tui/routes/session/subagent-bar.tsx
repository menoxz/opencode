import { createMemo, createSignal, For, Show } from "solid-js"
import { useKV } from "@tui/context/kv"
import { useRoute, useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { SplitBorder } from "@tui/component/border"
import { Spinner } from "@tui/component/spinner"
import { Locale } from "@/util/locale"
import { useCommandShortcut } from "../../keymap"
import { formatSubagentRow, formatSubagentSummary } from "./subagent-bar-format"

/**
 * Live view of the subagents a session has started.
 *
 * A background subagent used to be invisible once launched: the only trace was
 * a line buried in the transcript, so its work was easy to forget and easy to
 * duplicate. This bar sits just above the prompt for as long as children exist,
 * and each row opens that subagent's own session on click.
 *
 * The space above the prompt is scarce, so the bar is collapsed to a single
 * summary line by default and unfolds on click. The fold survives restarts: it
 * is a display preference, not session state.
 *
 * The expanded list is a bounded, scrollable region rather than a truncated
 * one: hiding older children behind a "+N more" made them unreachable, which in
 * a long session is exactly the subagent you need to check on.
 */
export function SubagentBar() {
  const route = useRouteData("session")
  const { navigate } = useRoute()
  const sync = useSync()
  const { theme } = useTheme()
  const childShortcut = useCommandShortcut("session.child.first")
  const kv = useKV()
  const [expanded, setExpanded] = kv.signal("subagent_bar_expanded", false)
  const [hover, setHover] = createSignal<string | null>(null)

  const rows = createMemo(() => {
    const now = Date.now()
    return sync.data.session
      .filter((item) => item.parentID === route.sessionID)
      .map((item) => ({
        item,
        working:
          sync.data.session_status?.[item.id]?.type === "busy" ||
          sync.data.session_status?.[item.id]?.type === "retry",
      }))
      // The working ones answer "what is happening now" and belong on top;
      // history sorts below by most recent first.
      .toSorted(
        (left, right) =>
          (right.working ? 1 : 0) - (left.working ? 1 : 0) ||
          right.item.time.updated - left.item.time.updated,
      )
      .map(({ item, working }) =>
        formatSubagentRow({
          id: item.id,
          title: item.title,
          created: item.time.created,
          updated: item.time.updated,
          cost: item.cost,
          working,
          now,
        }),
      )
  })

  const working = createMemo(() => rows().filter((item) => item.working).length)

  return (
    <Show when={rows().length > 0}>
      <box
        flexShrink={0}
        // Folded, the bar has to cost exactly one line of the prompt's space.
        paddingTop={expanded() ? 1 : 0}
        paddingBottom={expanded() ? 1 : 0}
        paddingLeft={2}
        paddingRight={1}
        {...SplitBorder}
        border={["left"]}
        borderColor={working() > 0 ? theme.accent : theme.border}
        backgroundColor={theme.backgroundPanel}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          gap={1}
          onMouseOver={() => setHover("header")}
          onMouseOut={() => setHover(null)}
          onMouseUp={() => setExpanded((prev) => !prev)}
          backgroundColor={hover() === "header" ? theme.backgroundElement : theme.backgroundPanel}
        >
          <text fg={theme.text} wrapMode="none">
            <span style={{ fg: theme.textMuted }}>{expanded() ? "▾" : "▸"} </span>
            <b>Subagents</b>
            <span style={{ fg: theme.textMuted }}> {formatSubagentSummary(rows())}</span>
          </text>
          <text fg={theme.textMuted} wrapMode="none">
            {expanded() ? `${childShortcut()} open · click a row` : "click to expand"}
          </text>
        </box>
        <Show when={expanded()}>
          <scrollbox maxHeight={8} scrollbarOptions={{ visible: false }}>
            <For each={rows()}>
              {(item) => (
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  gap={1}
                  onMouseOver={() => setHover(item.id)}
                  onMouseOut={() => setHover(null)}
                  onMouseUp={() => navigate({ type: "session", sessionID: item.id })}
                  backgroundColor={hover() === item.id ? theme.backgroundElement : theme.backgroundPanel}
                >
                  <box flexDirection="row" gap={1}>
                    <Show when={item.working} fallback={<text fg={theme.textMuted}>·</text>}>
                      <Spinner />
                    </Show>
                    <text fg={theme.text} wrapMode="none">
                      {item.title}
                    </text>
                    <Show when={item.agent}>
                      {(agent) => (
                        <text fg={theme.textMuted} wrapMode="none">
                          {Locale.titlecase(agent())}
                        </text>
                      )}
                    </Show>
                  </box>
                  <text fg={theme.textMuted} wrapMode="none">
                    {[item.duration, item.cost].filter(Boolean).join(" · ")}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
    </Show>
  )
}
