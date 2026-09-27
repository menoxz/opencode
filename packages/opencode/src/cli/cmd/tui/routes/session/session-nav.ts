/**
 * Pure logic behind the vertical session navbar.
 *
 * Kept free of Solid and OpenTUI imports so it can be unit-tested directly, the same way
 * `pending-turn.ts` is separated from the session route that renders it.
 */

/** Coarse activity of a session, derived from the store's session status. */
export type NavActivity = "busy" | "retry" | "idle"

export type NavSession = { id: string; title: string; activity?: NavActivity }

export type NavItem = {
  id: string
  title: string
  active: boolean
  index: number
  activity: NavActivity
}

/** Vertical bar width, in terminal columns. Wide enough for a readable session title. */
export const NAV_WIDTH = 40

/** Below this terminal width the bar yields unless it was opened explicitly. */
export const NAV_MIN_TERMINAL_WIDTH = 80

/**
 * Columns a row spends on everything but its title: the cursor, the activity glyph, the two
 * spaces between them, and the box's own left/right padding. Subtracted from the bar width to
 * size the label, so a title never overflows its row and wraps on the next line.
 */
export const NAV_ROW_CHROME = 6

export type NavVisibility = "auto" | "hide"

/** Maps the store's session status onto the coarse activity the bar shows. */
export function navActivity(status: { type?: string } | undefined): NavActivity {
  if (status?.type === "busy") return "busy"
  if (status?.type === "retry") return "retry"
  return "idle"
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

/** Mirrors the sidebar's `auto` / `hide` behaviour: narrow terminals hide the bar unless asked. */
export function navVisible(setting: NavVisibility, terminalWidth: number, toggled: boolean): boolean {
  if (toggled) return true
  if (setting === "hide") return false
  return terminalWidth >= NAV_MIN_TERMINAL_WIDTH
}
