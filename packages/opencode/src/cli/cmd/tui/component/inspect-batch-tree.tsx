import { createMemo, For, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import { inspectBatchTree, type InspectBatchViewInput } from "../util/inspect-batch-tree"

export function InspectBatchTree(
  props: InspectBatchViewInput & {
    color: string | RGBA
    muted: string | RGBA
    success?: string | RGBA
    errorColor?: string | RGBA
  },
) {
  const tree = createMemo(() => inspectBatchTree(props))
  return (
    <box marginTop={1} paddingLeft={2} flexShrink={0}>
      <text fg={props.muted} wrapMode="none">
        {tree().title}
      </text>
      <For each={tree().rows}>
        {(row) => (
          <box flexShrink={0}>
            <box flexDirection="row" height={1}>
              <text fg={props.color} wrapMode="none" truncate flexShrink={1} minWidth={0}>
                {row.label}
              </text>
              <text
                width={2}
                flexShrink={0}
                fg={
                  row.icon === "✓"
                    ? (props.success ?? props.color)
                    : row.icon === "✗"
                      ? (props.errorColor ?? props.color)
                      : props.muted
                }
              >
                {` ${row.icon}`}
              </text>
              {/* Grow after the icon so it hugs the argument instead of floating
                  in a far-right column; the label still shrinks to truncate. */}
              <box flexGrow={1} flexShrink={0} />
            </box>
            <Show when={row.detail}>
              <text fg={props.muted} wrapMode="none" truncate paddingLeft={3}>
                {row.detail}
              </text>
            </Show>
          </box>
        )}
      </For>
      <Show when={tree().note}>
        <text fg={props.muted}>{tree().note}</text>
      </Show>
    </box>
  )
}
