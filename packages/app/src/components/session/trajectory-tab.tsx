import { For, Show, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import {
  buildTrajectory,
  emptyModel,
  formatDuration,
  kindCounts,
  matchRecords,
  timelineLayout,
  timelineTicks,
  turnWindows,
  type TrajectoryChild,
  type TrajectoryKind,
  type TrajectoryLane,
  type TrajectoryMode,
  type TrajectoryPositioned,
  type TrajectoryRecord,
  type TrajectoryTick,
  type TrajectoryTurnWindow,
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

const ERROR_COLOR = "var(--icon-critical-base)"

const LANES: { id: TrajectoryLane; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "model", label: "Model" },
  { id: "tools", label: "Tools" },
]

const MODES: TrajectoryMode[] = ["duration", "turns", "calls"]

const isCall = (match: TrajectoryKind) => match === "tool" || match === "subtool"

const compact = (value: string) => value.replace(/\s+/g, " ").trim()

const firstLine = (value: string | undefined) => {
  if (!value) return undefined
  const text = compact(value)
  return text.length > 0 ? text : undefined
}

/** What the row header shows when collapsed: the content, not the kind again. */
function headline(record: TrajectoryRecord) {
  if (record.kind === "compacted") return record.label
  if (record.kind === "context")
    return record.label === "file" ? (record.details ?? "file") : [record.label, record.details].filter(Boolean).join(" · ")
  if (isCall(record.kind)) return [record.label, record.details].filter(Boolean).join(" · ")
  return firstLine(record.args) ?? record.details ?? record.label
}

/** One-line summary visible without expanding: the error first, then the input. */
function summary(record: TrajectoryRecord): { label: string; text: string; color?: string } | undefined {
  if (record.error) return { label: "error", text: compact(record.error), color: ERROR_COLOR }
  if (isCall(record.kind)) return { label: "input", text: firstLine(record.args) ?? "(no input)" }
  if (record.kind === "context") return record.result ? { label: "mime", text: record.result } : undefined
  return undefined
}

const elapsed = (record: TrajectoryRecord) => {
  if (record.start === undefined || record.end === undefined || record.end <= record.start) return undefined
  return formatDuration(record.end - record.start)
}

function Badge(props: { kind: TrajectoryKind }) {
  const color = () => KIND_COLOR[props.kind]
  return (
    <span
      aria-hidden="true"
      class="shrink-0 inline-flex items-center rounded border px-1.5 h-5 text-12-medium font-mono leading-none"
      style={`color:${color()};border-color:${color()}`}
    >
      {KIND_LABEL[props.kind]}
    </span>
  )
}

function RecordDetail(props: { record: TrajectoryRecord }) {
  const record = () => props.record
  const at = (value: number | undefined) => (value === undefined ? "—" : new Date(value).toLocaleTimeString())
  const text = () => record().kind === "user" || record().kind === "assistant"
  return (
    <div class="mt-1 ml-8 mr-2 rounded border border-border-weaker-base bg-background-stronger px-2 py-1.5 flex flex-col gap-1.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-11-regular text-text-weak">
        <span class="text-text-strong">{KIND_LABEL[record().kind]}</span>
        <span>#{record().index}</span>
        <span>
          {at(record().start)} → {at(record().end)}
        </span>
        <Show when={elapsed(record())}>{(value) => <span>{value()}</span>}</Show>
        <Show when={record().tokens}>{(value) => <span>{value()} tok</span>}</Show>
        <Show when={record().cost}>{(value) => <span>${value().toFixed(4)}</span>}</Show>
        <Show when={record().callID}>{(value) => <span class="text-text-weaker">{value()}</span>}</Show>
        <Show when={record().childSessionID}>{(value) => <span class="text-text-weaker">child {value()}</span>}</Show>
      </div>
      <Show when={record().args}>
        {(value) => (
          <div class="flex flex-col gap-0.5">
            <span class="text-11-regular text-text-weaker">{text() ? "text" : "input"}</span>
            <pre class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-12-mono text-text-base">
              {value()}
            </pre>
          </div>
        )}
      </Show>
      <Show when={record().error}>
        {(value) => (
          <div class="flex flex-col gap-0.5">
            <span class="text-11-regular" style={`color:${ERROR_COLOR}`}>
              error
            </span>
            <pre
              class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-12-mono"
              style={`color:${ERROR_COLOR}`}
            >
              {value()}
            </pre>
          </div>
        )}
      </Show>
      <Show when={record().result}>
        {(value) => (
          <div class="flex flex-col gap-0.5">
            <span class="text-11-regular text-text-weaker">output</span>
            <pre class="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words text-12-mono text-text-base">
              {value()}
            </pre>
          </div>
        )}
      </Show>
    </div>
  )
}

function RecordRow(props: {
  record: TrajectoryRecord
  selected: boolean
  hovered: boolean
  match: boolean
  onSelect: () => void
  onHover: (value: boolean) => void
}) {
  const record = () => props.record
  const tone = () => (record().status === "error" ? ERROR_COLOR : KIND_COLOR[record().kind])
  return (
    <div id={`trajectory-record-${record().index}`} role="listitem" class="scroll-mt-7 flex flex-col">
      <button
        type="button"
        aria-current={props.selected ? "true" : undefined}
        aria-expanded={props.selected}
        onClick={props.onSelect}
        onMouseEnter={() => props.onHover(true)}
        onMouseLeave={() => props.onHover(false)}
        class="w-full text-left flex flex-col gap-0.5 rounded-md px-2 py-1.5 border bg-transparent cursor-pointer transition-colors"
        classList={{
          "bg-surface-raised-base": props.selected || props.hovered,
          "hover:bg-surface-raised-base-hover": !props.selected,
        }}
        style={`border-color:${props.selected ? "var(--border-strong-base)" : "transparent"};${
          record().status === "error" ? `border-left-color:${ERROR_COLOR};border-left-width:2px;` : ""
        }`}
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="shrink-0 w-6 text-12-mono text-text-weaker text-right">{record().index}</span>
          <Badge kind={record().kind} />
          <span
            class="flex-1 min-w-0 truncate text-12-regular text-text-strong"
            classList={{ "font-medium": props.match }}
            style={`color:${tone()}`}
          >
            {headline(record())}
          </span>
          <Show when={elapsed(record())}>{(value) => <span class="shrink-0 text-11-regular text-text-weaker">{value()}</span>}</Show>
          <span class="shrink-0 text-11-regular text-text-weaker" aria-hidden="true">
            {props.selected ? "▾" : "▸"}
          </span>
        </div>
        <Show when={!props.selected ? summary(record()) : undefined}>
          {(item) => (
            <div class="pl-8 flex items-baseline gap-1.5 min-w-0">
              <span class="shrink-0 text-11-regular text-text-weaker">{item().label}</span>
              <span
                class="min-w-0 truncate text-12-mono text-text-weak"
                style={item().color === undefined ? "" : `color:${item().color}`}
              >
                {item().text}
              </span>
            </div>
          )}
        </Show>
      </button>
      <Show when={props.selected}>
        <RecordDetail record={record()} />
      </Show>
    </div>
  )
}

function TurnHeader(props: { window: TrajectoryTurnWindow; collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={!props.collapsed}
      onClick={props.onToggle}
      class="sticky top-0 z-10 w-full flex items-center gap-2 px-2 h-6 rounded bg-background-base text-11-regular text-text-weaker hover:text-text-weak cursor-pointer border-0"
    >
      <span class="shrink-0" aria-hidden="true">
        {props.collapsed ? "▸" : "▾"}
      </span>
      <span class="text-text-weak">Turn {props.window.turn}</span>
      <span>· {props.window.records.length} records</span>
      <Show when={props.window.calls > 0}>
        <span>· {props.window.calls} calls</span>
      </Show>
      <Show when={props.window.errors > 0}>
        <span style={`color:${ERROR_COLOR}`}>
          · {props.window.errors} error{props.window.errors > 1 ? "s" : ""}
        </span>
      </Show>
      <span class="flex-1" />
      <span class="shrink-0 text-12-mono">{formatDuration(props.window.duration)}</span>
    </button>
  )
}

function Timeline(props: {
  positions: TrajectoryPositioned[]
  ticks: TrajectoryTick[]
  focused: number | undefined
  onSelect: (index: number) => void
  onHover: (index: number | undefined) => void
}) {
  return (
    <div class="flex flex-col gap-1">
      <For each={LANES}>
        {(lane) => (
          <div class="flex items-center gap-2">
            <span class="shrink-0 w-12 text-11-regular text-text-weak">{lane.label}</span>
            <div class="relative flex-1 h-3.5 rounded-sm" style="background:var(--background-stronger)">
              <For each={props.positions.filter((item) => item.span.lane === lane.id)}>
                {(item) => (
                  <button
                    type="button"
                    title={`${KIND_LABEL[item.span.kind]} ${item.span.label} · ${formatDuration(
                      Math.max(0, item.span.end - item.span.start),
                    )}`}
                    aria-label={`${KIND_LABEL[item.span.kind]} ${item.span.label}`}
                    onClick={() => props.onSelect(item.span.index)}
                    onMouseEnter={() => props.onHover(item.span.index)}
                    onMouseLeave={() => props.onHover(undefined)}
                    class="absolute top-1/2 -translate-y-1/2 rounded-sm cursor-pointer border-0 p-0"
                    classList={{
                      "h-2.5": props.focused !== item.span.index,
                      "h-3.5": props.focused === item.span.index,
                    }}
                    style={`left:${item.left}%;width:${Math.max(0.8, item.width)}%;background:${
                      item.span.error ? ERROR_COLOR : KIND_COLOR[item.span.kind]
                    };${
                      props.focused === item.span.index ? "outline:1px solid var(--border-strong-base);outline-offset:1px;" : ""
                    }`}
                  />
                )}
              </For>
            </div>
          </div>
        )}
      </For>
      <div class="flex items-center gap-2">
        <span class="shrink-0 w-12" aria-hidden="true" />
        <div class="relative flex-1 h-3.5">
          <For each={props.ticks}>
            {(tick) => (
              <span
                class="absolute top-0 whitespace-nowrap text-11-regular text-text-weaker"
                style={`left:${tick.ratio}%;transform:translateX(${
                  tick.ratio <= 0 ? "0" : tick.ratio >= 100 ? "-100%" : "-50%"
                })`}
              >
                {tick.label}
              </span>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

function Legend(props: { records: TrajectoryRecord[] }) {
  return (
    <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-11-regular text-text-weak">
      <For each={kindCounts(props.records)}>
        {(item) => (
          <span class="inline-flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" style={`background:${KIND_COLOR[item.kind]}`} />
            <span>{KIND_LABEL[item.kind]}</span>
            <span class="text-text-weaker">{item.count}</span>
          </span>
        )}
      </For>
    </div>
  )
}

/**
 * DeepSeek-harness style "Trajectory" view: a duration/turns/calls timeline with
 * Input/Model/Tools lanes and a ruler, over the ordered ASSISTANT / TOOL /
 * SUBTOOL / CONTEXT ledger of a session (full arguments, results and errors).
 *
 * The header is fixed; the ledger is the only scroll container and fills the
 * remaining height. Rows expand in place, turns fold, and the ledger responds to
 * the keyboard: ↑/↓ move, Enter folds/unfolds, `e` filters errors, `n`/`N` step
 * through search matches, `/` focuses search, Esc clears.
 */
export function TrajectoryTab() {
  const sync = useSync()
  const { params } = useSessionLayout()
  const [state, setState] = createStore({
    mode: "duration" as TrajectoryMode,
    query: "",
    errorsOnly: false,
    selected: undefined as number | undefined,
    hovered: undefined as number | undefined,
    folded: [] as number[],
  })
  let search: HTMLInputElement | undefined
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

  const searching = createMemo(() => state.query.trim().length > 0)
  const matched = createMemo(() => matchRecords(model().records, state.query))
  const hits = createMemo(() => new Set(matched()))

  const visible = createMemo(() =>
    turnWindows(model()).flatMap((window) => {
      const records = window.records.filter(
        (record) => (!state.errorsOnly || record.status === "error") && (!searching() || hits().has(record.index)),
      )
      return records.length === 0 ? [] : [{ ...window, records }]
    }),
  )

  const indexes = createMemo(() => new Set(visible().flatMap((window) => window.records.map((record) => record.index))))
  const positions = createMemo(() =>
    timelineLayout({ ...model(), spans: model().spans.filter((span) => indexes().has(span.index)) }, state.mode),
  )
  const ticks = createMemo(() => timelineTicks(model(), state.mode))
  const focused = createMemo(() => (state.hovered === undefined ? state.selected : state.hovered))
  const order = createMemo(() =>
    visible().flatMap((window) => (state.folded.includes(window.turn) ? [] : window.records.map((record) => record.index))),
  )

  createEffect(() => {
    for (const id of model().childSessions) {
      if (requested.has(id)) continue
      requested.add(id)
      void sync.session.sync(id)
    }
  })

  const select = (index: number | undefined, reveal = false) => {
    if (index !== undefined && reveal) {
      const record = model().records.find((item) => item.index === index)
      if (record) {
        if (state.folded.includes(record.turn)) setState("folded", (list) => list.filter((item) => item !== record.turn))
        if (state.errorsOnly && record.status !== "error") setState("errorsOnly", false)
        if (searching() && !hits().has(index)) setState("query", "")
      }
    }
    setState("selected", index)
    if (index === undefined) return
    requestAnimationFrame(() =>
      document.getElementById(`trajectory-record-${index}`)?.scrollIntoView({ block: "nearest" }),
    )
  }

  const step = (delta: number) => {
    const list = order()
    if (list.length === 0) return
    const at = state.selected === undefined ? -1 : list.indexOf(state.selected)
    const next =
      at < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, at + delta))
    select(list[next], true)
  }

  const stepMatch = (delta: number) => {
    const list = order().filter((index) => hits().has(index))
    if (list.length === 0) return
    const at = state.selected === undefined ? -1 : list.indexOf(state.selected)
    const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length
    select(list[next], true)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      step(event.key === "ArrowDown" ? 1 : -1)
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select(state.selected === undefined ? order()[0] : undefined, true)
      return
    }
    if (event.key === "/") {
      event.preventDefault()
      search?.focus()
      return
    }
    if (event.key === "e" || event.key === "E") {
      event.preventDefault()
      setState("errorsOnly", (value) => !value)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      if (searching()) {
        setState("query", "")
        return
      }
      select(undefined)
      return
    }
    if (event.key === "n") {
      event.preventDefault()
      stepMatch(1)
      return
    }
    if (event.key === "N" || event.key === "p") {
      event.preventDefault()
      stepMatch(-1)
    }
  }

  const matchLabel = createMemo(() => {
    if (!searching()) return `${visible().flatMap((window) => window.records).length} records`
    const at = state.selected === undefined ? -1 : matched().indexOf(state.selected)
    return `${at < 0 ? 0 : at + 1}/${matched().length}`
  })

  const clearFilters = () => {
    setState("query", "")
    setState("errorsOnly", false)
  }

  return (
    <div data-component="trajectory-tab" class="h-full min-h-0 flex flex-col overflow-hidden">
      <div class="shrink-0 border-b border-border-weaker-base flex flex-col">
        <div class="px-3 pt-2 flex items-center gap-2">
          <div class="flex items-center gap-0.5 rounded-md border border-border-weaker-base p-0.5">
            <For each={MODES}>
              {(item) => (
                <button
                  type="button"
                  aria-pressed={state.mode === item}
                  onClick={() => setState("mode", item)}
                  class="px-2 h-5 rounded text-11-regular capitalize cursor-pointer border-0 bg-transparent transition-colors"
                  classList={{
                    "bg-surface-raised-base text-text-strong": state.mode === item,
                    "text-text-weak hover:bg-surface-raised-base-hover": state.mode !== item,
                  }}
                >
                  {item}
                </button>
              )}
            </For>
          </div>
          <span class="flex-1" />
          <span class="shrink-0 text-11-regular text-text-weak">
            {model().stats.turns} turns · {model().stats.calls} calls · {formatDuration(model().stats.duration)}
          </span>
          <Show when={model().stats.errors > 0}>
            <button
              type="button"
              aria-pressed={state.errorsOnly}
              onClick={() => setState("errorsOnly", (value) => !value)}
              class="shrink-0 h-6 px-2 rounded text-12-medium border bg-transparent cursor-pointer"
              classList={{
                "bg-surface-raised-base": state.errorsOnly,
                "hover:bg-surface-raised-base-hover": !state.errorsOnly,
              }}
              style={`color:${ERROR_COLOR};border-color:${state.errorsOnly ? ERROR_COLOR : "transparent"}`}
            >
              {model().stats.errors} error{model().stats.errors > 1 ? "s" : ""}
            </button>
          </Show>
        </div>

        <div class="px-3 pt-1.5 flex items-center gap-1.5">
          <input
            ref={search}
            value={state.query}
            aria-label="Search trajectory records"
            placeholder="Search records… (/)"
            onInput={(event) => setState("query", event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                stepMatch(event.shiftKey ? -1 : 1)
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                clearFilters()
                event.currentTarget.blur()
              }
            }}
            class="flex-1 min-w-0 h-7 rounded border border-border-base bg-background-base px-2 text-12-regular text-text-strong outline-none"
          />
          <span class="shrink-0 text-11-regular text-text-weak tabular-nums" aria-live="polite">
            {matchLabel()}
          </span>
          <button
            type="button"
            aria-label="Previous match"
            disabled={!searching()}
            onClick={() => stepMatch(-1)}
            class="shrink-0 h-6 w-6 rounded border border-border-weaker-base bg-transparent text-12-regular text-text-weak cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Next match"
            disabled={!searching()}
            onClick={() => stepMatch(1)}
            class="shrink-0 h-6 w-6 rounded border border-border-weaker-base bg-transparent text-12-regular text-text-weak cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            ↓
          </button>
        </div>

        <div class="px-3 pt-2 pb-1">
          <Timeline
            positions={positions()}
            ticks={ticks()}
            focused={focused()}
            onSelect={(index) => select(index, true)}
            onHover={(index) => setState("hovered", index)}
          />
        </div>

        <div class="px-3 pb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Legend records={model().records} />
          <span class="flex-1" />
          <span class="text-11-regular text-text-weaker">↑↓ move · Enter expand · e errors · n/N match</span>
        </div>
      </div>

      <div
        ref={(el: HTMLDivElement) => {
          el.addEventListener("keydown", onKeyDown)
        }}
        tabindex={0}
        aria-label="Trajectory records"
        class="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 flex flex-col gap-2.5 outline-none"
      >
        <Show
          when={visible().length > 0}
          fallback={
            <div class="px-2 py-6 flex flex-col items-center gap-2 text-center text-12-regular text-text-weak">
              <span>{model().records.length === 0 ? "No trajectory records yet." : "No records match the current filters."}</span>
              <Show when={model().records.length > 0}>
                <button
                  type="button"
                  onClick={clearFilters}
                  class="h-6 px-2 rounded border border-border-weaker-base bg-transparent text-12-regular text-text-weak cursor-pointer hover:bg-surface-raised-base-hover"
                >
                  Clear filters
                </button>
              </Show>
            </div>
          }
        >
          <For each={visible()}>
            {(window) => (
              <div role="list" class="flex flex-col gap-0.5">
                <TurnHeader
                  window={window}
                  collapsed={state.folded.includes(window.turn)}
                  onToggle={() =>
                    setState("folded", (list) =>
                      list.includes(window.turn) ? list.filter((item) => item !== window.turn) : [...list, window.turn],
                    )
                  }
                />
                <Show when={!state.folded.includes(window.turn)}>
                  <For each={window.records}>
                    {(record) => (
                      <RecordRow
                        record={record}
                        selected={state.selected === record.index}
                        hovered={state.hovered === record.index}
                        match={searching() && hits().has(record.index)}
                        onSelect={() => select(state.selected === record.index ? undefined : record.index)}
                        onHover={(value) => setState("hovered", value ? record.index : undefined)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
