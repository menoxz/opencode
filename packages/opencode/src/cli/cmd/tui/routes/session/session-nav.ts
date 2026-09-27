/**
 * Pure logic behind the vertical session navbar.
 *
 * Kept free of Solid and OpenTUI imports so it can be unit-tested directly, the same way
 * `pending-turn.ts` is separated from the session route that renders it.
 */
import { Locale } from "@/util/locale"

/** Coarse activity of a session, derived from the store's session status. */
export type NavActivity = "busy" | "retry" | "idle"

export type NavSession = { id: string; title: string; activity?: NavActivity; updated?: number; directory?: string }

export type NavItem = {
  id: string
  title: string
  active: boolean
  index: number
  activity: NavActivity
  updated?: number
  directory?: string
}

/** A directory and the sessions it holds, in the order the bar shows them. */
export type NavGroup = {
  key: string
  label: string
  count: number
  active: boolean
  updated: number
  sessions: NavItem[]
}

/** One rendered line: a directory header, a session, or the "Read more" reveal. */
export type NavRowModel =
  | { kind: "dir"; key: string; label: string; count: number; collapsed: boolean; selected: boolean }
  | { kind: "session"; key: string; id: string; title: string; activity: NavActivity; updated?: number; selected: boolean }
  | { kind: "more"; key: string; hidden: number; selected: boolean }

/** Which directories the user collapsed, and whether the directory cap was lifted. */
export type NavState = { collapsed: readonly string[]; expanded: boolean }

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

/** Rows the bar keeps for its header, its shortcut line and the scroll indicators. */
export const NAV_CHROME_ROWS = 4

/** Directories shown before the list folds behind "Read more". */
export const NAV_DIR_LIMIT = 3

/** Braille spinner frames, one per animation step, used while a session is working. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export type NavVisibility = "auto" | "hide"

/** Maps the store's session status onto the coarse activity the bar shows. */
export function navActivity(status: { type?: string } | undefined): NavActivity {
  if (status?.type === "busy") return "busy"
  if (status?.type === "retry") return "retry"
  return "idle"
}

/** A working session spins; a stopped one rests. The frame is driven by the caller's clock. */
export function spinGlyph(activity: NavActivity, frame: number): string {
  if (activity !== "busy") return "○"
  const size = SPINNER_FRAMES.length
  return SPINNER_FRAMES[((frame % size) + size) % size]
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
    directory: session.directory,
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

/** The directory's own name, so a full path still fits the bar; sessions without one share "unknown". */
export function navBasename(directory: string | undefined): string {
  const parts = (directory ?? "").split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? "unknown"
}

/**
 * Cleans a pasted path before it is checked or used: trims, drops the quotes a copied path often
 * carries, and expands a leading `~` against the user's home.
 */
export function normalizeDirectory(input: string, home: string): string {
  const trimmed = input.trim().replace(/^["']|["']$/g, "")
  if (trimmed === "~") return home
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return `${home}${trimmed.slice(1)}`
  return trimmed
}

/** Why a pasted path cannot be used, or undefined when it is a usable folder. */
export function directoryProblem(input: string, stat: { exists: boolean; directory: boolean }): string | undefined {
  if (!input.trim()) return "Paste a folder path"
  if (!stat.exists) return "Folder not found"
  if (!stat.directory) return "That path is not a folder"
  return undefined
}

/**
 * Distinct directories already used by the project's sessions, alphabetically, so the modal offers
 * what the user already works with before any typed path.
 */
export function usedDirectories(sessions: readonly { directory?: string }[]): string[] {
  return [...new Set(sessions.map((session) => session.directory).filter((value): value is string => !!value))].toSorted(
    (a, b) => navBasename(a).localeCompare(navBasename(b)),
  )
}

/** The used directories matching what the user is typing, by full path or by folder name. */
export function filteredDirectories(directories: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...directories]
  return directories.filter(
    (directory) => directory.toLowerCase().includes(needle) || navBasename(directory).toLowerCase().includes(needle),
  )
}

/** What the modal must do when Enter is pressed on a typed path: pick it, or say why it cannot. */
export type DirectoryChoice = { kind: "choose"; directory: string } | { kind: "error"; message: string }

export function directoryChoice(
  input: string,
  stat: (directory: string) => { exists: boolean; directory: boolean },
): DirectoryChoice {
  const problem = directoryProblem(input, stat(input))
  return problem ? { kind: "error", message: problem } : { kind: "choose", directory: input }
}

/**
 * Sessions folded by directory. The active session's directory is pinned first so the session being
 * worked on is never pushed below the fold, then directories are ordered by their most recent
 * activity. Pure, so grouping is a unit test rather than a claim about the renderer.
 */
export function navGroups(sessions: readonly NavSession[], activeID: string | undefined): NavGroup[] {
  const buckets = new Map<string, NavSession[]>()
  for (const session of sessions) {
    const key = session.directory ?? ""
    const bucket = buckets.get(key)
    if (bucket) bucket.push(session)
    else buckets.set(key, [session])
  }
  return [...buckets.entries()]
    .map(([key, list]) => ({
      key,
      label: navBasename(key),
      count: list.length,
      active: list.some((session) => session.id === activeID),
      updated: list.reduce((latest, session) => Math.max(latest, session.updated ?? 0), 0),
      sessions: navItems(list, activeID),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label))
}

/** The directories shown before "Read more", plus how many the reveal is hiding. */
export function navVisibleGroups(groups: readonly NavGroup[], expanded: boolean, limit = NAV_DIR_LIMIT): { shown: NavGroup[]; hidden: number } {
  const size = expanded ? groups.length : Math.min(Math.max(0, limit), groups.length)
  return { shown: groups.slice(0, size), hidden: groups.length - size }
}

/**
 * Flattens the tree into the exact lines the bar draws, so selection, windowing and rendering all
 * share one model. A collapsed directory contributes its header only; hidden directories become a
 * single "Read more" row. The selection is the row's index in this array.
 */
export function navRows(sessions: readonly NavSession[], activeID: string | undefined, state: NavState): NavRowModel[] {
  const { shown, hidden } = navVisibleGroups(navGroups(sessions, activeID), state.expanded)
  const rows: NavRowModel[] = []
  for (const group of shown) {
    const collapsed = state.collapsed.includes(group.key)
    rows.push({ kind: "dir", key: `dir:${group.key}`, label: group.label, count: group.count, collapsed, selected: false })
    if (collapsed) continue
    for (const session of group.sessions) {
      rows.push({
        kind: "session",
        key: `ses:${session.id}`,
        id: session.id,
        title: session.title,
        activity: session.activity,
        updated: session.updated,
        selected: false,
      })
    }
  }
  if (hidden > 0) rows.push({ kind: "more", key: "more", hidden, selected: false })
  return rows
}

/** Index to show as selected: the active session's row when present, otherwise a clamped index. */
export function navSelection(rows: readonly NavRowModel[], activeID: string | undefined, stored: number): number {
  const found = rows.findIndex((row) => row.kind === "session" && row.id === activeID)
  return found >= 0 ? found : clampSelection(stored, rows.length)
}

/** The session id under a row, or undefined when the row is a directory or the reveal. */
export function selectionSessionID(rows: readonly NavRowModel[], index: number): string | undefined {
  const row = rows[clampSelection(index, rows.length)]
  return row?.kind === "session" ? row.id : undefined
}

/** The directory key under a row, so the header action can toggle the right folder. */
export function selectionDirKey(rows: readonly NavRowModel[], index: number): string | undefined {
  const row = rows[clampSelection(index, rows.length)]
  return row?.kind === "dir" ? row.key.slice("dir:".length) : undefined
}

/** Adds or removes a directory from the collapsed set, leaving every other entry untouched. */
export function toggleCollapsed(collapsed: readonly string[], key: string): string[] {
  return collapsed.includes(key) ? collapsed.filter((entry) => entry !== key) : [...collapsed, key]
}

export type NavDirRowInput = { label: string; count: number; collapsed: boolean; selected: boolean; width: number }

/**
 * A directory header: the disclosure glyph, the folder's name, and its session count pushed to the
 * right edge by construction. The count is reserved first so a long name can never hide it.
 */
export function navDirRow(input: NavDirRowInput): string {
  const prefix = `${input.selected ? ">" : " "} ${input.collapsed ? "▸" : "▾"} `
  const suffix = ` ${input.count}`
  const available = Math.max(1, input.width - prefix.length - suffix.length - 1)
  return `${prefix}${navLabel(input.label, available)}`
    .padEnd(input.width - suffix.length, " ")
    .concat(suffix)
}

export type NavRowInput = {
  title: string
  activity: NavActivity
  selected: boolean
  updated?: number
  width: number
  now?: Date
  frame?: number
  indent?: number
  pendingDelete?: boolean
}

/**
 * A session line: the spinner or rest glyph, the title, and the timestamp reserved first so a long
 * title can never push the date out of the row. The stamp is right-aligned by construction rather
 * than by the renderer's flex rules, and the line never grows past `width`, so it cannot wrap.
 */
export function navRow(input: NavRowInput): string {
  const prefix = `${" ".repeat(Math.max(0, input.indent ?? 0))}${input.selected ? ">" : " "} ${spinGlyph(input.activity, input.frame ?? 0)} `
  const stamp = input.pendingDelete ? "press again" : navStamp(input.updated, input.now)
  const available = Math.max(1, input.width - prefix.length - 2)
  if (!stamp) return `${prefix}${navLabel(input.title, available)}`
  const label = navLabel(input.title, Math.max(1, available - stamp.length - 1))
  const gap = Math.max(1, available - label.length - stamp.length)
  return `${prefix}${label}${" ".repeat(gap)}${stamp}`
}

/** The "Read more" line: how many directories the reveal is hiding. */
export function navMoreRow(hidden: number, selected: boolean, width: number): string {
  const prefix = `${selected ? ">" : " "} `
  return `${prefix}${navLabel(`Read more (+${hidden})`, Math.max(1, width - prefix.length - 2))}`
}

export type NavFooterShortcuts = { new: string; delete: string; rename: string }

/**
 * The command section's line. No frame: the section is set apart by sitting at the bottom, in muted
 * colour, and separated from the list by spacing.
 */
export function footerLines(width: number, shortcuts: NavFooterShortcuts): string[] {
  const text = `new: ${shortcuts.new}  Delete: ${shortcuts.delete}  Rename: ${shortcuts.rename}`
  return [navLabel(text, Math.max(1, width))]
}

/** Footer marker telling whether the bar lists every directory or only the working one. */
export function navDirectoryLabel(allDirectories: boolean): string {
  return allDirectories ? "all dirs" : "this dir"
}

export type NavWindow = { start: number; end: number; hiddenAbove: number; hiddenBelow: number }

/**
 * The slice of the flattened rows the bar can actually show, keeping the selection inside it and
 * reporting how many lines are hidden on each side, so the ends of a long list stay reachable.
 */
export function navWindow(total: number, selected: number, height: number): NavWindow {
  const size = Math.max(1, Math.floor(height))
  if (total <= 0) return { start: 0, end: 0, hiddenAbove: 0, hiddenBelow: 0 }
  if (total <= size) return { start: 0, end: total, hiddenAbove: 0, hiddenBelow: 0 }
  const current = clampSelection(selected, total)
  const start = Math.min(Math.max(current - Math.floor((size - 1) / 2), 0), total - size)
  const end = start + size
  return { start, end, hiddenAbove: start, hiddenBelow: total - end }
}

/** Rows of session list the terminal can show, once the bar's own chrome and footer are removed. */
export function navListHeight(terminalRows: number): number {
  return Math.max(1, Math.floor(terminalRows) - NAV_CHROME_ROWS)
}

/** Mirrors the sidebar's `auto` / `hide` behaviour: narrow terminals hide the bar unless asked. */
export function navVisible(setting: NavVisibility, terminalWidth: number, toggled: boolean): boolean {
  if (toggled) return true
  if (setting === "hide") return false
  return terminalWidth >= NAV_MIN_TERMINAL_WIDTH
}
