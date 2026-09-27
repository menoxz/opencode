/**
 * Pure logic behind the vertical session navbar.
 *
 * Kept free of Solid and OpenTUI imports so it can be unit-tested directly, the same way
 * `pending-turn.ts` is separated from the session route that renders it.
 */
import { Locale } from "@/util/locale"

/** Coarse activity of a session, derived from the store's session status. */
export type NavActivity = "busy" | "retry" | "idle"

export type NavSession = { id: string; title: string; activity?: NavActivity; updated?: number }

export type NavItem = {
  id: string
  title: string
  active: boolean
  index: number
  activity: NavActivity
  updated?: number
}

/** Vertical bar width, in terminal columns. */
export const NAV_WIDTH = 52

/** Below this terminal width the bar yields unless it was opened explicitly. */
export const NAV_MIN_TERMINAL_WIDTH = 80

/**
 * Columns a row spends besides its title and its timestamp: the box's left/right padding, the
 * cursor, the activity glyph and the two separating spaces. Kept in the row builder so a line can
 * never overflow the bar and wrap on the next one.
 */
export const NAV_ROW_CHROME = 6

export type NavVisibility = "auto" | "hide"

/** Maps the store's session status onto the coarse activity the bar shows. */
export function navActivity(status: { type?: string } | undefined): NavActivity {
  if (status?.type === "busy") return "busy"
  if (status?.type === "retry") return "retry"
  return "idle"
}

/** One glyph per row: it shows activity for every session, and doubles as the active marker. */
export function activityGlyph(active: boolean, activity: NavActivity): string {
  if (activity === "busy") return "◐"
  if (activity === "retry") return "!"
  return active ? "●" : "○"
}

const pad = (value: number) => String(value).padStart(2, "0")

/**
 * Last-activity stamp, compact enough to survive a narrow bar while never dropping the information:
 * today keeps only the time, this year adds day and month, an older session adds the year. The time
 * itself comes from the CLI's own helper so the bar and `session list` never disagree.
 */
export function navStamp(updated: number | undefined, now: Date = new Date()): string | undefined {
  if (updated === undefined || !Number.isFinite(updated)) return undefined
  const when = new Date(updated)
  const time = Locale.time(updated)
  if (when.toDateString() === now.toDateString()) return time
  const day = `${pad(when.getDate())}/${pad(when.getMonth() + 1)}`
  if (when.getFullYear() === now.getFullYear()) return `${day} ${time}`
  return `${day}/${pad(when.getFullYear() % 100)} ${time}`
}

/**
 * Whether the navbar's selection follows the session being worked on, or was left somewhere else.
 * Bounds are inclusive-safe: an empty list yields index 0 and never throws.
 */
export function moveSelection(current: number, delta: number, total: number): number {
  if (total <= 0) return 0
  return ((((current + delta) % total) + total) % total) + 0
}

/** Pulls a stored index back into range, for instance after the selected session was deleted. */
export function clampSelection(current: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(current, 0), total - 1)
}

/** Index to show as selected when the bar first renders: the active session when it is listed. */
export function initialSelection(activeID: string | undefined, sessions: readonly NavSession[], stored: number): number {
  const found = sessions.findIndex((session) => session.id === activeID)
  return found >= 0 ? found : clampSelection(stored, sessions.length)
}

/** The id under a row index, clamped so a stale index can never select nothing. */
export function selectionID(sessions: readonly NavSession[], index: number): string | undefined {
  return sessions[clampSelection(index, sessions.length)]?.id
}

/** Rows in list order: the bar renders them 1:1 and the route feeds the same order for the cursor. */
export function navItems(sessions: readonly NavSession[], activeID: string | undefined): NavItem[] {
  return sessions.map((session, index) => ({
    id: session.id,
    title: session.title,
    active: session.id === activeID,
    index,
    activity: session.activity ?? "idle",
    updated: session.updated,
  }))
}

/** Truncates a title to the columns a row can spare, keeping a single unambiguous ellipsis. */
export function navLabel(title: string, budget: number): string {
  if (budget <= 0) return ""
  const label = title.trim() || "untitled"
  if (label.length <= budget) return label
  if (budget <= 1) return "…"
  return label.slice(0, budget - 1) + "…"
}

export type NavRowInput = {
  title: string
  activity: NavActivity
  active: boolean
  selected: boolean
  updated?: number
  width: number
  now?: Date
}

/**
 * A whole row as one string. The timestamp is reserved first and the title is truncated into what is
 * left, so a long title can never push the date out of the row — the invariant the bar is judged on.
 * The stamp is right-aligned by construction rather than by the renderer's flex rules, and the line
 * never grows past `width`, so it cannot wrap onto a second one.
 */
export function navRow(input: NavRowInput): string {
  const prefix = `${input.selected ? ">" : " "} ${activityGlyph(input.active, input.activity)} `
  const stamp = navStamp(input.updated, input.now)
  const available = Math.max(1, input.width - prefix.length - 2)
  if (!stamp) return `${prefix}${navLabel(input.title, available)}`
  const label = navLabel(input.title, Math.max(1, available - stamp.length - 1))
  const gap = Math.max(1, available - label.length - stamp.length)
  return `${prefix}${label}${" ".repeat(gap)}${stamp}`
}

/** Mirrors the sidebar's `auto` / `hide` behaviour: narrow terminals hide the bar unless asked. */
export function navVisible(setting: NavVisibility, terminalWidth: number, toggled: boolean): boolean {
  if (toggled) return true
  if (setting === "hide") return false
  return terminalWidth >= NAV_MIN_TERMINAL_WIDTH
}
