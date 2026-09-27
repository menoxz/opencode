/**
 * Pure logic behind the vertical session navbar.
 *
 * Kept free of Solid and OpenTUI imports so it can be unit-tested directly, the same way
 * `pending-turn.ts` is separated from the session route that renders it.
 */

export type NavSession = { id: string; title: string }

export type NavItem = {
  id: string
  title: string
  active: boolean
  index: number
}

/** Vertical bar width, in terminal columns. Kept narrow: it lists sessions, not their contents. */
export const NAV_WIDTH = 30

/** Below this terminal width the bar yields unless it was opened explicitly. */
export const NAV_MIN_TERMINAL_WIDTH = 80

export type NavVisibility = "auto" | "hide"

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

/** The rows to draw, in list order, with the active session flagged. */
export function navItems(sessions: readonly NavSession[], activeID: string | undefined): NavItem[] {
  return sessions.map((session, index) => ({
    id: session.id,
    title: session.title,
    active: session.id === activeID,
    index,
  }))
}

/** Session id at an index, or `undefined` when the list is empty. */
export function selectionID(sessions: readonly NavSession[], index: number): string | undefined {
  return sessions[clampSelection(index, sessions.length)]?.id
}

/** Single-line label that fits `width` columns, with an ellipsis when the title is too long. */
export function navLabel(title: string, width: number): string {
  const text = title.trim() || "untitled"
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return text.slice(0, width - 1) + "…"
}

/** Mirrors the sidebar's `auto` / `hide` behaviour: narrow terminals hide the bar unless asked. */
export function navVisible(setting: NavVisibility, terminalWidth: number, toggled: boolean): boolean {
  if (toggled) return true
  if (setting === "hide") return false
  return terminalWidth >= NAV_MIN_TERMINAL_WIDTH
}
