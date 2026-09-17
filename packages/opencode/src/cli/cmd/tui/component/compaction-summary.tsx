import { createSignal, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import type { KeyEvent, RGBA } from "@opentui/core"

// Compaction output restates context the model already carries; it is noise for
// the user, so it stays folded until explicitly opened.
export function CompactionDisclosure(props: {
  label: string
  color: RGBA | string
  muted: RGBA | string
  align?: "center" | "left"
  paddingLeft?: number
  children: JSX.Element
}) {
  const [open, setOpen] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const toggle = () => setOpen((value) => !value)
  return (
    <>
      <box
        id="compaction-summary-toggle"
        flexDirection="row"
        justifyContent={props.align === "left" ? "flex-start" : "center"}
        paddingLeft={props.paddingLeft ?? 0}
        gap={1}
        focusable
        onMouseDown={(event) => {
          event.target?.focus()
          toggle()
        }}
        onKeyDown={(event: KeyEvent) => {
          if (!["return", "enter", "space"].includes(event.name)) return
          event.preventDefault()
          event.stopPropagation()
          toggle()
        }}
        on:focused={() => setFocused(true)}
        on:blurred={() => setFocused(false)}
      >
        <text fg={focused() ? props.color : props.muted}>{open() ? "▼" : "▶"}</text>
        <text fg={props.color}>{props.label}</text>
      </box>
      <Show when={open()}>{props.children}</Show>
    </>
  )
}
