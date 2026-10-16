import { createMemo, createSignal, For, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
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
  const renderer = useRenderer()
  const [open, setOpen] = createSignal(false)
  const [hover, setHover] = createSignal(false)
  // Rien à révéler, rien à annoncer : sans ligne ni note, l'en-tête n'est pas cliquable.
  const expandable = createMemo(() => tree().rows.length > 0 || Boolean(tree().note))
  const toggle = () => {
    if (!expandable()) return
    if (renderer.getSelection()?.getSelectedText()) return
    setOpen((prev) => !prev)
  }
  const stateColor = (row: InspectBatchRow) =>
    row.icon === "✓"
      ? (props.success ?? props.color)
      : row.icon === "✗"
        ? (props.errorColor ?? props.color)
        : props.muted
  return (
    <box marginTop={1} flexShrink={0}>
      <box
        onMouseOver={() => expandable() && setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={toggle}
      >
        <text fg={hover() ? props.color : props.muted} wrapMode="none">
          {tree().title}
          {expandable() ? (open() ? " ▾" : " ▸") : ""}
        </text>
      </box>
      <Show when={open()}>
        <For each={tree().rows}>
          {(row) => (
            <box flexDirection="row" height={1} flexShrink={0}>
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
      </Show>
    </box>
  )
}
