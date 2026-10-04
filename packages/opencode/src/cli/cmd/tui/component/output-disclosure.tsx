/** @jsxImportSource @opentui/solid */
import { createEffect, createMemo, createSignal, on, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import type { KeyEvent, RGBA } from "@opentui/core"
import { useTheme } from "@tui/context/theme"

// Tool output, tool input and reasoning routinely run to hundreds of lines.
// Folded by default they leave one summary line each, so the trajectory reads
// as a sequence of events instead of a wall of text. The content is never
// truncated: unfolding shows it in full.
export const LARGE_OUTPUT_LINES = 8
export const LARGE_OUTPUT_CHARS = 400

export function countLines(value: string) {
  let lines = 1
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) lines++
  return lines
}

export function isLargeOutput(value: string) {
  return value.length >= LARGE_OUTPUT_CHARS || countLines(value) > LARGE_OUTPUT_LINES
}

export function summarizeOutput(value: string) {
  const lines = countLines(value)
  return `${lines} line${lines === 1 ? "" : "s"} · ${value.length} chars`
}

// One shared revision drives every disclosure, so a single command folds or
// unfolds the whole trajectory at once.
const [bulk, setBulk] = createSignal<{ open: boolean; rev: number }>({ open: false, rev: 0 })

export function toggleAllOutput(open: boolean) {
  setBulk((state) => ({ open, rev: state.rev + 1 }))
}

export function OutputDisclosure(props: {
  label: string
  value: string
  color?: RGBA | string
  wrap?: "word" | "char"
  id?: string
  defaultOpen?: boolean
}) {
  const { theme } = useTheme()
  const [open, setOpen] = createSignal(props.defaultOpen ?? false)
  const [focused, setFocused] = createSignal(false)
  const toggle = () => setOpen((value) => !value)

  createEffect(
    on(
      () => bulk().rev,
      (rev) => {
        if (rev > 0) setOpen(bulk().open)
      },
    ),
  )

  return (
    <box flexDirection="column" flexShrink={0}>
      <box
        id={props.id ?? "output-disclosure-toggle"}
        flexDirection="row"
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
        <text fg={focused() ? theme.primary : theme.textMuted}>{open() ? "▼" : "▶"}</text>
        <text fg={(props.color as never) ?? theme.textMuted} wrapMode="none">
          {`${props.label} · ${summarizeOutput(props.value)}`}
        </text>
      </box>
      <Show when={open()}>
        <text fg={(props.color as never) ?? theme.text} wrapMode={props.wrap ?? "word"}>
          {props.value}
        </text>
      </Show>
    </box>
  )
}

// Short values stay inline: folding a two-line result costs a keypress and
// saves nothing. Only large values become a disclosure.
export function OutputField(props: {
  label: string
  value: string
  color?: RGBA | string
  wrap?: "word" | "char"
  id?: string
}) {
  const { theme } = useTheme()
  const large = createMemo(() => isLargeOutput(props.value))
  return (
    <Show
      when={large()}
      fallback={
        <box flexDirection="column" flexShrink={0}>
          <text fg={theme.textMuted} wrapMode="none">
            {props.label}
          </text>
          <text fg={(props.color as never) ?? theme.text} wrapMode={props.wrap ?? "word"}>
            {props.value}
          </text>
        </box>
      }
    >
      <OutputDisclosure
        id={props.id}
        label={props.label}
        value={props.value}
        color={props.color as never}
        wrap={props.wrap}
      />
    </Show>
  )
}

// The folded summary is the only thing shown for a collapsed output, so the
// label and counts carry the reading. Kept as a named export for tests.
export type { JSX }
