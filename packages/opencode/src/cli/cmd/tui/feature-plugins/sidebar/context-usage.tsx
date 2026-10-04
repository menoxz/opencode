import type { AssistantMessage, Part } from "@opencode-ai/sdk/v2"
import type { KeyEvent, RGBA } from "@opentui/core"
import { createMemo, createSignal, Show } from "solid-js"
import { contextMetrics, type costTree, type loadedUsage } from "./context-metrics"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
})

export function ContextUsage(props: {
  message?: AssistantMessage
  parts?: readonly Part[]
  limit?: number
  cost?: number
  history?: ReturnType<typeof loadedUsage>
  tree?: ReturnType<typeof costTree>
  treeStatus?: "loading" | "loaded" | "error"
  color: RGBA | string
  muted: RGBA | string
}) {
  const [detailsOpen, setDetailsOpen] = createSignal(false)
  const [detailsFocused, setDetailsFocused] = createSignal(false)
  const toggleDetails = () => setDetailsOpen((open) => !open)
  const handleDetailsKey = (event: KeyEvent) => {
    if (!["return", "enter", "space"].includes(event.name)) return
    event.preventDefault()
    event.stopPropagation()
    toggleDetails()
  }
  const state = createMemo(() =>
    contextMetrics(
      props.history?.last?.message ?? props.message,
      props.limit,
      props.cost,
      props.history ? (props.history.last ? [props.history.last.step] : []) : props.parts,
    ),
  )
  const recorded = createMemo(() =>
    props.history
      ? !!props.history.last
      : props.parts?.some(
          (part) =>
            part.type === "step-finish" &&
            part.messageID === props.message?.id &&
            part.sessionID === props.message?.sessionID,
        ),
  )
  return (
    <box>
      <text fg={props.color}>
        <b>{props.message && !recorded() ? "Context (stored usage)" : "Context (last call)"}</b>
      </text>
      <Show when={props.message} fallback={<text fg={props.muted}>No completed call</text>}>
        <text fg={props.muted}>
          {state().tokens === undefined ? "Usage unavailable" : `${state().tokens!.toLocaleString("en-US")} tokens`}
        </text>
        <text fg={props.muted}>{state().percent === undefined ? "Limit unknown" : `${state().percent}% used`}</text>
      </Show>
      <text fg={props.muted}>
        Cost: {state().sessionCost === undefined ? "—" : money.format(state().sessionCost!)} <span>(estimated)</span>
      </text>
      <box
        id="context-details-toggle"
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
        <text fg={props.color}>Details</text>
      </box>
      <Show when={detailsOpen()}>
        <Show when={props.message}>
          <text fg={props.muted}>Non-cache input: {state().input?.toLocaleString()}</text>
          <text fg={props.muted}>Cache read: {state().cacheRead?.toLocaleString()}</text>
          <text fg={props.muted}>Cache write: {state().cacheWrite?.toLocaleString()}</text>
        </Show>
        <Show when={props.history}>
          <text fg={props.muted}>Footprint, not processed</text>
          <text fg={props.muted}>Processed: {props.history?.processed?.toLocaleString("en-US") ?? "unavailable"}</text>
          <text fg={props.muted}>Loaded history: partial</text>
          <text fg={props.muted}>
            {props.history?.calls} steps; {props.history?.missing} missing msgs
          </text>
          <Show when={props.history?.duplicates}>
            <text fg={props.muted}>{props.history?.duplicates} duplicates ignored</text>
          </Show>
          <text fg={props.muted}>
            Read/input: {props.history?.readRatio === undefined ? "n/a" : `${props.history.readRatio}%`}
          </text>
          <text fg={props.muted}>
            Prev read/input:{" "}
            {props.history?.previousReadRatio === undefined ? "n/a" : `${props.history.previousReadRatio}%`}
          </text>
        </Show>
        <text fg={props.muted}>
          Last call: {state().callCost === undefined ? "unavailable" : money.format(state().callCost!)}
        </text>
        <Show when={props.message && !recorded()}>
          <text fg={props.muted}>No step-finish data</text>
        </Show>
        <Show when={props.tree}>
          <text fg={props.muted}>
            Desc. loaded: {props.tree?.cost === undefined ? "unavailable" : money.format(props.tree.cost)}
          </text>
          <text fg={props.muted}>
            All loaded: {props.tree?.combined === undefined ? "unavailable" : money.format(props.tree.combined)}
          </text>
          <text fg={props.muted}>
            Tree: {props.treeStatus === "loaded" ? "partial snapshot" : (props.treeStatus ?? "unknown")}
          </text>
          <text fg={props.muted}>
            {props.tree?.count} descendants; {props.tree?.missing} missing cost
          </text>
          <Show when={props.tree?.missing && props.tree?.subtotal !== undefined}>
            <text fg={props.muted}>Known desc.: {money.format(props.tree!.subtotal!)}</text>
          </Show>
        </Show>
        <Show when={props.history}>
          <text fg={props.muted}>Recorded calls; not bill</text>
        </Show>
      </Show>
    </box>
  )
}
