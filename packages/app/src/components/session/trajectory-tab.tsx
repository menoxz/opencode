import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import {
  buildTrajectory,
  emptyModel,
  formatDuration,
  type TrajectoryChild,
  type TrajectoryKind,
  type TrajectoryLane,
  type TrajectoryMode,
  type TrajectoryRecord,
  type TrajectorySpan,
} from "./trajectory"

const KIND_LABEL: Record<TrajectoryKind, string> = {
  user: "USER",
  context: "CONTEXT",
  compacted: "COMPACTED",
  assistant: "ASSISTANT",
  tool: "TOOL",
  subtool: "SUBTOOL",
}

const KIND_COLOR: Record<TrajectoryKind, string> = {
  user: "var(--icon-success-base)",
  context: "var(--icon-info-base)",
  compacted: "var(--icon-weak-base)",
  assistant: "var(--syntax-property)",
  tool: "var(--icon-warning-base)",
  subtool: "var(--syntax-constant)",
}

const LANES: { id: TrajectoryLane; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "model", label: "Model" },
  { id: "tools", label: "Tools" },
]

const MODES: TrajectoryMode[] = ["duration", "turns", "calls"]

const compact = (value: string) => value.replace(/\s+/g, " ").trim()

const preview = (value: string | undefined, max = 160) => {
  if (!value) return undefined
  const text = compact(value)
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

type Positioned = { span: TrajectorySpan; left: number; width: number }

/** Map spans to horizontal positions for the selected ruler mode. */
function layout(model: ReturnType<typeof buildTrajectory>, mode: TrajectoryMode): Positioned[] {
  const place = (span: TrajectorySpan, base: number, span100: number, scale: number) => ({
    span,
    left: base + ((span.start - scale) / span100) * 100,
    width: Math.max(0.5, ((span.end - span.start) / span100) * 100),
  })
  if (mode === "calls") {
    const calls = model.spans.filter((span) => span.kind === "tool" || span.kind === "subtool")
    const step = 100 / Math.max(1, calls.length)
    return calls.map((span, index) => ({ span, left: index * step, width: Math.max(0.6, step * 0.85) }))
  }
  if (mode === "turns") {
    const width = 100 / Math.max(1, model.turns.length)
    return model.spans.flatMap((span) => {
      const turn = model.records[span.index]?.turn
      const index = model.turns.findIndex((item) => item.turn === turn)
      if (index < 0) return []
      const start = model.turns[index]?.start ?? model.bounds.start
      const next = model.turns[index + 1]?.start ?? model.bounds.end
      const total = Math.max(1, next - start)
      const item = place(span, index * width, total, start)
      return [{ ...item, left: index * width + (item.left / 100) * width, width: Math.max(0.5, (item.width / 100) * width) }]
    })
  }
  const total = Math.max(1, model.bounds.end - model.bounds.start)
  return model.spans.map((span) => place(span, 0, total, model.bounds.start))
}

function Badge(props: { kind: TrajectoryKind }) {
  const color = () => KIND_COLOR[props.kind]
  return (
    <span
      class="shrink-0 inline-flex items-center rounded border px-1.5 h-5 text-12-medium font-mono leading-none"
      style={`color:${color()};border-color:${color()}`}
    >
      {KIND_LABEL[props.kind]}
    </span>
  )
}

function RecordRow(props: {
  record: TrajectoryRecord
  selected: boolean
  onSelect: (index: number) => void
}) {
  const record = () => props.record
  const tone = () => (record().status === "error" ? "var(--icon-critical-base)" : KIND_COLOR[record().kind])
  return (
    <button
      type="button"
      id={`trajectory-record-${record().index}`}
      onClick={() => props.onSelect(record().index)}
      class="w-full text-left flex flex-col gap-1 rounded px-2 py-1.5 border bg-transparent cursor-pointer transition-colors"
      style={props.selected ? "border-color:var(--border-strong-base)" : "border-color:transparent"}
      classList={{ "bg-surface-raised-base": props.selected, "hover:bg-surface-raised-base-hover": !props.selected }}
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="shrink-0 w-6 text-12-mono text-text-weaker text-right">{record().index}</span>
        <Badge kind={record().kind} />
        <span class="shrink-0 text-12-mono text-text-strong" style={`color:${tone()}`}>
          {record().label}
        </span>
        <Show when={record().details}>
          <span class="min-w-0 truncate text-12-regular text-text-weak">{record().details}</span>
        </Show>
      </div>
      <Show when={record().args || record().result || record().error}>
        <div class="pl-8 flex flex-col gap-0.5 min-w-0">
          <Show when={record().args}>
            <span class="text-12-mono text-text-weak break-words">
              <span class="text-text-weaker">args </span>
              {preview(record().args)}
            </span>
          </Show>
          <Show when={record().error} fallback={
            <span class="text-12-mono text-text-weak break-words">
              <span class="text-text-weaker">→ </span>
              {preview(record().result) ?? "(no output)"}
            </span>
          }>
            <span class="text-12-mono break-words" style="color:var(--icon-critical-base)">
              <span class="text-text-weaker">error </span>
              {record().error}
            </span>
          </Show>
        </div>
      </Show>
    </button>
  )
}

function Detail(props: { record: TrajectoryRecord }) {
  const record = () => props.record
  const at = (value: number | undefined) => (value === undefined ? "—" : new Date(value).toLocaleTimeString())
  return (
    <div class="border-t border-border-weaker-base px-3 py-2 flex flex-col gap-1 text-12-mono">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-weak">
        <span class="text-text-strong">{KIND_LABEL[record().kind]}</span>
        <span>#{record().index}</span>
        <span>{record().label}</span>
        <span>
          {at(record().start)} → {at(record().end)}
        </span>
        <Show when={record().start !== undefined && record().end !== undefined}>
          <span>{formatDuration(Math.max(0, (record().end ?? 0) - (record().start ?? 0)))}</span>
        </Show>
        <Show when={record().tokens}>
          <span>{record().tokens} tok</span>
        </Show>
        <Show when={record().cost}>
          <span>${record().cost?.toFixed(4)}</span>
        </Show>
        <Show when={record().callID}>
          <span class="text-text-weaker">{record().callID}</span>
        </Show>
      </div>
      <Show when={record().args}>
        <div class="flex flex-col gap-0.5">
          <span class="text-text-weaker">input</span>
          <pre class="m-0 whitespace-pre-wrap break-words text-text-base">{record().args}</pre>
        </div>
      </Show>
      <Show when={record().error}>
        <div class="flex flex-col gap-0.5">
          <span class="text-text-weaker">error</span>
          <pre class="m-0 whitespace-pre-wrap break-words" style="color:var(--icon-critical-base)">
            {record().error}
          </pre>
        </div>
      </Show>
      <Show when={record().result}>
        <div class="flex flex-col gap-0.5">
          <span class="text-text-weaker">output</span>
          <pre class="m-0 whitespace-pre-wrap break-words text-text-base">{record().result}</pre>
        </div>
      </Show>
    </div>
  )
}

/**
 * DeepSeek-harness style "Trajectory" view: a duration/turns/calls overview
 * timeline with Input/Model/Tools lanes, plus the ordered ASSISTANT / TOOL /
 * SUBTOOL / CONTEXT ledger of a session (tool arguments, results, errors).
 */
export function TrajectoryTab() {
  const sync = useSync()
  const { params } = useSessionLayout()
  const [mode, setMode] = createSignal<TrajectoryMode>("duration")
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<number>()
  const requested = new Set<string>()

  const partsOf = (messageID: string) => sync.data.part[messageID] ?? []

  const childOf = (childSessionID: string): TrajectoryChild | undefined => {
    const messages = sync.data.message[childSessionID]
    if (!messages) return undefined
    return { sessionID: childSessionID, messages: messages as Message[], parts: partsOf }
  }

  const model = createMemo(() => {
    const id = params.id
    if (!id) return emptyModel
    const messages = sync.data.message[id]
    if (!messages) return emptyModel
    return buildTrajectory({ messages: messages as Message[], parts: partsOf, childOf })
  })

  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (needle.length === 0) return model()
    const records = model().records.filter((record) =>
      [record.label, record.details, record.args, record.result, record.error]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
    const hits = new Set(records.map((record) => record.index))
    return { ...model(), records, spans: model().spans.filter((span) => hits.has(span.index)) }
  })

  const positions = createMemo(() => layout(visible(), mode()))

  createEffect(() => {
    for (const id of model().childSessions) {
      if (requested.has(id)) continue
      requested.add(id)
      void sync.session.sync(id)
    }
  })

  const select = (index: number) => {
    setSelected(index)
    requestAnimationFrame(() => document.getElementById(`trajectory-record-${index}`)?.scrollIntoView({ block: "center" }))
  }

  const current = createMemo(() => model().records.find((record) => record.index === selected()))

  return (
    <div data-component="trajectory-tab" class="h-full flex flex-col overflow-hidden">
      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1">
            <For each={MODES}>
              {(item) => (
                <button
                  type="button"
                  onClick={() => setMode(item)}
                  class="px-2 h-6 rounded text-12-medium border bg-transparent cursor-pointer capitalize transition-colors"
                  style={mode() === item ? "border-color:var(--border-strong-base);color:var(--text-strong)" : "border-color:transparent;color:var(--text-weak)"}
                  classList={{ "bg-surface-raised-base": mode() === item, "hover:bg-surface-raised-base-hover": mode() !== item }}
                >
                  {item}
                </button>
              )}
            </For>
          </div>
          <div class="text-12-regular text-text-weak shrink-0">
            {model().stats.turns} turns · {model().stats.calls} calls · {formatDuration(model().stats.duration)}
          </div>
        </div>
        <input
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search records…"
          class="w-full h-7 rounded border border-border-base bg-background-base px-2 text-12-regular text-text-strong outline-none"
        />
        <Show when={model().stats.errors > 0}>
          <div class="text-12-regular" style="color:var(--icon-critical-base)">
            {model().stats.errors} error{model().stats.errors > 1 ? "s" : ""}
          </div>
        </Show>
      </div>

      <div class="shrink-0 px-3 py-2 border-b border-border-weaker-base flex flex-col gap-1.5">
        <For each={LANES}>
          {(lane) => (
            <div class="flex items-center gap-2">
              <span class="shrink-0 w-12 text-12-regular text-text-weak">{lane.label}</span>
              <div class="relative flex-1 h-4 rounded-sm" style="background:var(--background-stronger)">
                <For each={positions().filter((item) => item.span.lane === lane.id)}>
                  {(item) => (
                    <div
                      title={`${KIND_LABEL[item.span.kind]} ${item.span.label}`}
                      onClick={() => select(item.span.index)}
                      class="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-sm cursor-pointer"
                      style={`left:${item.left}%;width:${item.width}%;background:${
                        item.span.error ? "var(--icon-critical-base)" : KIND_COLOR[item.span.kind]
                      }`}
                    />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={current()}>
        {(record) => <Detail record={record()} />}
      </Show>

      <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-3">
        <Show
          when={visible().turns.length > 0}
          fallback={<div class="px-2 py-6 text-center text-12-regular text-text-weak">No trajectory records yet.</div>}
        >
          <For each={visible().turns}>
            {(turn) => (
              <div class="flex flex-col gap-1">
                <div class="sticky top-0 z-10 bg-background-base px-2 text-12-regular text-text-weaker">
                  Turn {turn.turn}
                </div>
                <For each={turn.records}>
                  {(record) => (
                    <RecordRow record={record} selected={selected() === record.index} onSelect={select} />
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
