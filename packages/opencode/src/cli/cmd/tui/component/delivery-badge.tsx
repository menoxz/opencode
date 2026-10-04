/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import type { RGBA } from "@opentui/core"

export function DeliveryBadge(props: { status?: "queued" | "steer"; bg?: RGBA; fg?: RGBA }) {
  const label = () => (props.status === "steer" ? "STEER" : "QUEUED")
  return (
    <Show when={props.status}>
      <text fg={props.fg}>
        <span style={{ bg: props.bg, fg: props.fg, bold: true }}> {label()} </span>
      </text>
    </Show>
  )
}
