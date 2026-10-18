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
  // Ce que le lot **est** : l'icône précède un titre qui se lit comme une phrase
  // (`✱ Explore: 2 read 1 grep`). Aucun état par enfant — le succès ne s'annonce pas —
  // sauf l'échec, qui met la ligne en rouge, et l'attente, qui garde son spinner.
  const failed = (row: InspectBatchRow) => row.failed
  return (
    <box marginTop={1} flexShrink={0}>
      <box
        onMouseOver={() => expandable() && setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={toggle}
      >
        <text fg={hover() ? props.color : props.muted} wrapMode="none" truncate>
          {`✱ ${tree().title}`}
          {expandable() ? (open() ? " ▾" : " ▸") : ""}
        </text>
      </box>
      <Show when={open()}>
        <For each={tree().rows}>
          {(row) => (
            <box flexDirection="row" height={1} flexShrink={0}>
              <box width={2} flexShrink={0}>
                <Show
                  when={row.spinning}
                  fallback={
                    <text fg={failed(row) ? (props.errorColor ?? props.color) : props.color} wrapMode="none">
                      {"→"}
                    </text>
                  }
                >
                  <Spinner />
                </Show>
              </box>
              <text
                fg={failed(row) ? (props.errorColor ?? props.color) : props.color}
                wrapMode="none"
                truncate
                flexShrink={1}
                minWidth={0}
              >
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
