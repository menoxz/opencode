import { createMemo, For, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import { Spinner } from "./spinner"
import { inspectBatchTree, type InspectBatchRow, type InspectBatchViewInput } from "../util/inspect-batch-tree"

export function InspectBatchTree(
  props: InspectBatchViewInput & {
    color: string | RGBA
    muted: string | RGBA
    success?: string | RGBA
    errorColor?: string | RGBA
  },
) {
  const tree = createMemo(() => inspectBatchTree(props))
  const stateColor = (row: InspectBatchRow) =>
    row.icon === "✓"
      ? (props.success ?? props.color)
      : row.icon === "✗"
        ? (props.errorColor ?? props.color)
        : props.muted
  return (
    <box marginTop={1} paddingLeft={2} flexShrink={0}>
      <text fg={props.muted} wrapMode="none">
        {tree().title}
      </text>
      <For each={tree().rows}>
        {(row) => (
          <box flexDirection="row" height={1} flexShrink={0}>
            {/* Blank spacer: the leading slot keeps child rows stacking instead of
                merging when the argument is long. No bullet is rendered. */}
            <text fg={props.muted} flexShrink={0}>
              {"  "}
            </text>
            <box width={2} flexShrink={0}>
              <Show when={row.spinning} fallback={<text fg={stateColor(row)}>{row.icon}</text>}>
                <Spinner />
              </Show>
            </box>
            <text fg={props.color} wrapMode="none" truncate flexShrink={1} minWidth={0}>
              {row.label}
            </text>
          </box>
        )}
      </For>
      <Show when={tree().note}>
        <text fg={props.muted}>{tree().note}</text>
      </Show>
    </box>
  )
}
