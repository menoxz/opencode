import { describe, expect, test } from "bun:test"
import { Locale } from "@/util/locale"
import {
  NAV_CHROME_ROWS,
  NAV_MIN_TERMINAL_WIDTH,
  NAV_SESSION_LIMIT,
  NAV_WIDTH,
  SPINNER_FRAMES,
  clampSelection,
  directoryChoice,
  directoryProblem,
  filteredDirectories,
  filterNavSessions,
  footerLines,
  initialSelection,
  moveSelection,
  navActivity,
  navBasename,
  navDirRow,
  navDirectoryLabel,
  navGroups,
  navItems,
  navLabel,
  navListHeight,
  navMoreRow,
  navQueryRow,
  navRow,
  navRows,
  navSelection,
  navStamp,
  navVisible,
  navVisibleSessions,
  navWindow,
  normalizeDirectory,
  searchAppend,
  searchBackspace,
  selectionDirKey,
  selectionID,
  selectionSessionID,
  spinGlyph,
  toggleCollapsed,
  toggleRevealed,
  type NavSession,
  usedDirectories,
} from "./session-nav"

const sessions: NavSession[] = [
  { id: "ses_a", title: "Add navbar" },
  { id: "ses_b", title: "Fix flaky test" },
  { id: "ses_c", title: "Triage issue" },
]

const now = new Date(2026, 8, 27, 13, 54)
const todayAt = new Date(2026, 8, 27, 16, 36).getTime()
const sameYearAt = new Date(2026, 8, 15, 22, 35).getTime()
const olderYearAt = new Date(2025, 8, 15, 22, 35).getTime()

const grouped: NavSession[] = [
  { id: "a1", title: "Alpha one", directory: "C:\\work\\opencode-fork", updated: todayAt },
  { id: "a2", title: "Alpha two", directory: "C:\\work\\opencode-fork", updated: sameYearAt },
  { id: "b1", title: "Beta one", directory: "C:\\work\\command-code", updated: olderYearAt },
  { id: "c1", title: "Gamma one", directory: "C:\\other\\deepseek", updated: todayAt },
  { id: "d1", title: "Delta one", directory: "C:\\other\\harness", updated: todayAt },
  { id: "e1", title: "Epsilon one", directory: "C:\\other\\misc", updated: todayAt },
]

describe("TUI session navbar", () => {
  test("lists the sessions of the project and flags the active one", () => {
    const items = navItems(sessions, "ses_b")
    expect(items.map((item) => item.id)).toEqual(["ses_a", "ses_b", "ses_c"])
    expect(items.map((item) => item.active)).toEqual([false, true, false])
    expect(items.map((item) => item.index)).toEqual([0, 1, 2])
  })

  test("carries each session's directory through to the row", () => {
    const items = navItems([{ id: "ses_x", title: "In another folder", directory: "/work/other" }], undefined)
    expect(items[0]?.directory).toBe("/work/other")
  })

  test("shows no active row when the route is not a session", () => {
    expect(navItems(sessions, undefined).every((item) => !item.active)).toBe(true)
  })

  test("handles an empty project without inventing rows", () => {
    expect(navItems([], "ses_a")).toEqual([])
    expect(selectionID([], 0)).toBeUndefined()
  })

  test("moves the selection and wraps around at both bounds", () => {
    expect(moveSelection(0, 1, 3)).toBe(1)
    expect(moveSelection(2, 1, 3)).toBe(0)
    expect(moveSelection(0, -1, 3)).toBe(2)
    expect(moveSelection(1, -1, 3)).toBe(0)
    expect(moveSelection(0, 2, 3)).toBe(2)
  })

  test("keeps a stable selection on an empty or single-entry list", () => {
    expect(moveSelection(0, 1, 0)).toBe(0)
    expect(moveSelection(5, -3, 0)).toBe(0)
    expect(moveSelection(0, 1, 1)).toBe(0)
    expect(moveSelection(0, -1, 1)).toBe(0)
  })

  test("clamps a selection left behind by a deleted session", () => {
    expect(clampSelection(9, 3)).toBe(2)
    expect(clampSelection(-4, 3)).toBe(0)
    expect(clampSelection(1, 3)).toBe(1)
    expect(clampSelection(2, 0)).toBe(0)
  })

  test("opens on the active session when it is listed, otherwise on the stored position", () => {
    expect(initialSelection("ses_c", sessions, 0)).toBe(2)
    expect(initialSelection(undefined, sessions, 1)).toBe(1)
    expect(initialSelection("ses_gone", sessions, 9)).toBe(2)
    expect(initialSelection("ses_a", [], 4)).toBe(0)
  })

  test("resolves the selected id, clamped to the list", () => {
    expect(selectionID(sessions, 1)).toBe("ses_b")
    expect(selectionID(sessions, 7)).toBe("ses_c")
    expect(selectionID(sessions, -2)).toBe("ses_a")
  })

  test("fits labels to the bar width", () => {
    expect(navLabel("Fix flaky test", 30)).toBe("Fix flaky test")
    expect(navLabel("Fix flaky test", 8)).toBe("Fix fla…")
    expect(navLabel("Fix flaky test", 1)).toBe("…")
    expect(navLabel("  ", 10)).toBe("untitled")
    expect(navLabel("anything", 0)).toBe("")
  })

  test("hides the bar on narrow terminals unless it was opened explicitly", () => {
    expect(navVisible("auto", NAV_MIN_TERMINAL_WIDTH, false)).toBe(true)
    expect(navVisible("auto", NAV_MIN_TERMINAL_WIDTH - 1, false)).toBe(false)
    expect(navVisible("hide", 200, false)).toBe(false)
    expect(navVisible("hide", 200, true)).toBe(true)
    expect(navVisible("auto", 40, true)).toBe(true)
  })

  test("maps the store session status onto the bar activity", () => {
    expect(navActivity(undefined)).toBe("idle")
    expect(navActivity({})).toBe("idle")
    expect(navActivity({ type: "idle" })).toBe("idle")
    expect(navActivity({ type: "busy" })).toBe("busy")
    expect(navActivity({ type: "retry" })).toBe("retry")
  })

  test("spins while working and rests otherwise", () => {
    expect(spinGlyph("idle", 0)).toBe("○")
    expect(spinGlyph("retry", 5)).toBe("○")
    expect(spinGlyph("busy", 0)).toBe(SPINNER_FRAMES[0])
    expect(spinGlyph("busy", 3)).toBe(SPINNER_FRAMES[3])
    expect(spinGlyph("busy", SPINNER_FRAMES.length + 2)).toBe(SPINNER_FRAMES[2])
    expect(spinGlyph("busy", -1)).toBe(SPINNER_FRAMES[SPINNER_FRAMES.length - 1])
  })

  test("keeps the time for today, adds day and month this year, and the year before that", () => {
    expect(navStamp(undefined, now)).toBeUndefined()
    expect(navStamp(Number.NaN, now)).toBeUndefined()
    expect(navStamp(todayAt, now)).toBe(Locale.time(todayAt))
    expect(navStamp(sameYearAt, now)).toBe(`15/09 ${Locale.time(sameYearAt)}`)
    expect(navStamp(olderYearAt, now)).toBe(`15/09/25 ${Locale.time(olderYearAt)}`)
  })

  test("a stamp always carries both a date marker and a time", () => {
    expect(navStamp(todayAt, now)).toMatch(/\d{1,2}:\d{2}/)
    expect(navStamp(sameYearAt, now)).toMatch(/\d{2}\/\d{2} .*\d{1,2}:\d{2}/)
    expect(navStamp(olderYearAt, now)).toMatch(/\d{2}\/\d{2}\/\d{2} .*\d{1,2}:\d{2}/)
  })

  test("builds a session line with the glyph and the timestamp reserved", () => {
    const stamp = navStamp(sameYearAt, now) ?? ""
    const row = navRow({ title: "Add navbar", activity: "idle", updated: sameYearAt, width: NAV_WIDTH, now })
    expect(row.startsWith("  ○ Add navbar")).toBe(true)
    expect(row.endsWith(stamp)).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("a working session shows a spinner on its line", () => {
    const row = navRow({ title: "Working", activity: "busy", width: NAV_WIDTH, frame: 2, now })
    expect(row.startsWith(`  ${SPINNER_FRAMES[2]} Working`)).toBe(true)
  })

  test("a title far too long is truncated while the timestamp stays whole", () => {
    const long = "Connexion abonnement Claude à OpenAI et facturation mensuelle détaillée"
    const stamp = navStamp(sameYearAt, now) ?? ""
    const row = navRow({ title: long, activity: "busy", updated: sameYearAt, width: NAV_WIDTH, now })
    expect((row.match(/…/g) ?? []).length).toBe(1)
    expect(row.endsWith(stamp)).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("a pending deletion replaces the stamp with the confirm hint", () => {
    const row = navRow({ title: "Delete me", activity: "idle", updated: sameYearAt, width: NAV_WIDTH, now, pendingDelete: true })
    expect(row).toContain("press again")
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("even at a minimal width the row never overflows", () => {
    const stamp = navStamp(olderYearAt, now) ?? ""
    const row = navRow({ title: "Anything", activity: "idle", updated: olderYearAt, width: 24, now })
    expect(row.endsWith(stamp)).toBe(true)
    expect(row.length).toBeLessThanOrEqual(24)
  })

  test("a row without a timestamp still fills the width with the title", () => {
    const row = navRow({ title: "Old session", activity: "idle", width: NAV_WIDTH, now })
    expect(row.startsWith("  ○ Old session")).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("labels whether the bar spans every directory", () => {
    expect(navDirectoryLabel(true)).toBe("all dirs")
    expect(navDirectoryLabel(false)).toBe("this dir")
  })

  test("reserves rows for the bar's own chrome", () => {
    expect(navListHeight(44)).toBeGreaterThan(0)
    expect(navListHeight(2)).toBe(1)
  })

  test("windows the list so the selection stays visible and the ends stay reachable", () => {
    expect(navWindow(0, 0, 5)).toEqual({ start: 0, end: 0, hiddenAbove: 0, hiddenBelow: 0 })
    expect(navWindow(3, 1, 5)).toEqual({ start: 0, end: 3, hiddenAbove: 0, hiddenBelow: 0 })

    const first = navWindow(20, 0, 5)
    expect(first.start).toBe(0)
    expect(first.end).toBe(5)
    expect(first.hiddenAbove).toBe(0)
    expect(first.hiddenBelow).toBe(15)

    const last = navWindow(20, 19, 5)
    expect(last.end).toBe(20)
    expect(last.hiddenBelow).toBe(0)
    expect(last.hiddenAbove).toBe(15)
  })

  test("the window always contains the selected index", () => {
    for (let selected = 0; selected < 20; selected++) {
      const window = navWindow(20, selected, 6)
      expect(window.start).toBeLessThanOrEqual(selected)
      expect(window.end).toBeGreaterThan(selected)
      expect(window.end - window.start).toBe(6)
    }
  })

  test("derives a directory's own name from a full path", () => {
    expect(navBasename("C:\\jeanluc\\opencode-fork")).toBe("opencode-fork")
    expect(navBasename("/home/me/command-code/")).toBe("command-code")
    expect(navBasename(undefined)).toBe("unknown")
    expect(navBasename("")).toBe("unknown")
  })

  test("groups sessions by directory and counts each group", () => {
    const groups = navGroups(grouped, undefined)
    expect(groups).toHaveLength(5)
    const fork = groups.find((group) => group.key === "C:\\work\\opencode-fork")
    expect(fork?.label).toBe("opencode-fork")
    expect(fork?.count).toBe(2)
    expect(fork?.sessions.map((session) => session.id)).toEqual(["a1", "a2"])
  })

  test("pins the active session's directory first", () => {
    const groups = navGroups(grouped, "b1")
    expect(groups[0].key).toBe("C:\\work\\command-code")
    expect(groups[0].active).toBe(true)
  })

  test("orders the rest by most recent activity", () => {
    const byRecency: NavSession[] = [
      { id: "r1", title: "Recent", directory: "C:\\a\\alpha", updated: todayAt },
      { id: "r2", title: "Older", directory: "C:\\b\\beta", updated: olderYearAt },
      { id: "r3", title: "Middle", directory: "C:\\c\\gamma", updated: sameYearAt },
    ]
    expect(navGroups(byRecency, undefined).map((group) => group.label)).toEqual(["alpha", "beta", "gamma"])
  })

  test("breaks ties on the directory label so the order is stable", () => {
    const rows = navRows(grouped, undefined, { overrides: {}, revealed: [] })
    const labels = rows.filter((row) => row.kind === "dir").map((row) => (row.kind === "dir" ? row.label : ""))
    expect(labels).toEqual(["command-code", "deepseek", "harness", "misc", "opencode-fork"])
  })

  test("shows at most three sessions and tells how many are hidden", () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index}`,
      title: `Session ${index}`,
      active: false,
      index,
      activity: "idle" as const,
    }))
    const folded = navVisibleSessions(items, false)
    expect(folded.shown).toHaveLength(NAV_SESSION_LIMIT)
    expect(folded.hidden).toBe(items.length - NAV_SESSION_LIMIT)

    const opened = navVisibleSessions(items, true)
    expect(opened.shown).toHaveLength(items.length)
    expect(opened.hidden).toBe(0)
  })

  test("flattens the tree into headers and sessions", () => {
    const rows = navRows(grouped, "a1", { overrides: {}, revealed: [] })
    const dirs = rows.filter((row) => row.kind === "dir")
    expect(dirs).toHaveLength(5)
    const open = rows.findIndex((row) => row.kind === "dir" && row.label === "opencode-fork")
    expect(rows[open + 1]?.kind).toBe("session")
    expect(rows.filter((row) => row.kind === "session").length).toBeGreaterThan(0)
  })

  test("caps a directory's sessions at three and hides the rest behind its Read more", () => {
    const crowded: NavSession[] = Array.from({ length: 5 }, (_, index) => ({
      id: `c${index}`,
      title: `Crowded ${index}`,
      directory: "C:\\work\\opencode-fork",
    }))
    const rows = navRows(crowded, "c0", { overrides: {}, revealed: [] })
    expect(rows.filter((row) => row.kind === "dir")).toHaveLength(1)
    expect(rows.filter((row) => row.kind === "session")).toHaveLength(NAV_SESSION_LIMIT)
    const more = rows.filter((row) => row.kind === "more")
    expect(more).toHaveLength(1)
    expect(more[0]).toMatchObject({ kind: "more", hidden: 5 - NAV_SESSION_LIMIT })
  })

  test("never caps the directories themselves", () => {
    const rows = navRows(grouped, "a1", { overrides: {}, revealed: [] })
    expect(rows.filter((row) => row.kind === "dir")).toHaveLength(navGroups(grouped, "a1").length)
  })

  test("NAV_CHROME_ROWS matches every row the bar draws besides the list", () => {
    // box padding top+bottom, the "Sessions" header, the search field, both scroll hints, the shortcut footer
    expect(NAV_CHROME_ROWS).toBe(2 + 1 + 1 + 2 + 1)
  })

  test("only the active session's directory starts open", () => {
    const rows = navRows(grouped, "b1", { overrides: {}, revealed: [] })
    expect(rows.find((row) => row.kind === "dir" && row.label === "command-code")).toMatchObject({ kind: "dir", collapsed: false })
    expect(rows.some((row) => row.kind === "session" && row.id === "b1")).toBe(true)
    expect(rows.some((row) => row.kind === "session" && row.id === "a1")).toBe(false)
  })

  test("pinning a directory open survives the active session moving into it", () => {
    const sessions: NavSession[] = [
      { id: "a1", title: "Alpha one", directory: "C:\\work\\alpha" },
      { id: "b1", title: "Beta one", directory: "C:\\work\\beta" },
    ]
    const pinned = { "C:\\work\\beta": false }
    const findBeta = (rows: ReturnType<typeof navRows>) => rows.find((row) => row.kind === "dir" && row.label === "beta")
    expect(findBeta(navRows(sessions, "a1", { overrides: pinned, revealed: [] }))).toMatchObject({ collapsed: false })
    // the active session now lives in the pinned directory: a baseline flip used to close it here
    expect(findBeta(navRows(sessions, "b1", { overrides: pinned, revealed: [] }))).toMatchObject({ collapsed: false })
  })

  test("a directory the user opened stays open without an active session", () => {
    const rows = navRows(grouped, undefined, { overrides: { "C:\\work\\opencode-fork": false }, revealed: [] })
    expect(rows.find((row) => row.kind === "dir" && row.label === "opencode-fork")).toMatchObject({ kind: "dir", collapsed: false })
    expect(rows.some((row) => row.kind === "session" && row.id === "a1")).toBe(true)
  })

  test("a search reveals sessions in folded directories", () => {
    const folded = navRows(grouped, "a1", { overrides: {}, revealed: [] })
    expect(folded.some((row) => row.kind === "session" && row.id === "b1")).toBe(false)
    const searched = navRows(grouped, "a1", { overrides: {}, revealed: [], reveal: true })
    expect(searched.some((row) => row.kind === "session" && row.id === "b1")).toBe(true)
    expect(searched.some((row) => row.kind === "more")).toBe(false)
  })

  test("expanding removes the reveal and lists every directory", () => {
    const rows = navRows(grouped, undefined, { overrides: {}, revealed: [] })
    expect(rows.some((row) => row.kind === "more")).toBe(false)
    expect(rows.filter((row) => row.kind === "dir")).toHaveLength(5)
  })

  test("selects the active session's row, otherwise a clamped position", () => {
    const rows = navRows(grouped, "b1", { overrides: {}, revealed: [] })
    const index = navSelection(rows, "b1", 0)
    expect(rows[index]).toMatchObject({ kind: "session", id: "b1" })
    expect(navSelection(rows, "gone", 999)).toBe(rows.length - 1)
  })

  test("resolves the session and directory under a row", () => {
    const rows = navRows(grouped, "a1", { overrides: {}, revealed: [] })
    const dirIndex = rows.findIndex((row) => row.kind === "dir" && row.label === "opencode-fork")
    const sessionIndex = rows.findIndex((row) => row.kind === "session" && row.id === "a1")
    expect(selectionDirKey(rows, dirIndex)).toBe("C:\\work\\opencode-fork")
    expect(selectionSessionID(rows, dirIndex)).toBeUndefined()
    expect(selectionSessionID(rows, sessionIndex)).toBe("a1")
    expect(selectionDirKey(rows, sessionIndex)).toBeUndefined()
  })

  test("toggles a directory's collapsed state without touching the others", () => {
    expect(toggleCollapsed({}, "x", false)).toEqual({ x: true })
    expect(toggleCollapsed({ x: false, y: true }, "x", false)).toEqual({ x: true, y: true })
    expect(toggleCollapsed({ y: false }, "x", false)).toEqual({ x: true, y: false })
    expect(toggleRevealed([], "x")).toEqual(["x"])
    expect(toggleRevealed(["x", "y"], "x")).toEqual(["y"])
  })

  test("a directory header prefixes the folder with a slash and carries its count", () => {
    const row = navDirRow({ label: "opencode-fork", count: 7, collapsed: false, width: NAV_WIDTH })
    expect(row.startsWith("  ▾ /opencode-fork")).toBe(true)
    expect(row.endsWith(" 7")).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)

    const collapsedRow = navDirRow({ label: "opencode-fork", count: 7, collapsed: true, width: NAV_WIDTH })
    expect(collapsedRow.startsWith("  ▸ /opencode-fork")).toBe(true)
  })

  test("a long directory name is truncated while the count stays whole", () => {
    const row = navDirRow({ label: "a-very-long-directory-name-that-would-overflow-the-bar", count: 12, collapsed: false, width: NAV_WIDTH })
    expect((row.match(/…/g) ?? []).length).toBe(1)
    expect(row.endsWith(" 12")).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("the reveal line states how many directories are hidden", () => {
    const row = navMoreRow(4, NAV_WIDTH)
    expect(row).toContain("Read more")
    expect(row).toContain("4")
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("lays the command shortcuts on one line without any frame", () => {
    const lines = footerLines(NAV_WIDTH, { new: "Alt+n", delete: "ctrl+d", rename: "ctrl+r" })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe("new Alt+n  del ctrl+d  ren ctrl+r")
    expect(lines[0]).not.toContain("|")
    expect(lines[0]).not.toContain("---")
    expect(lines[0].length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("an over-long shortcut list is truncated to the bar width", () => {
    const lines = footerLines(24, { new: "ctrl+alt+shift+n", delete: "ctrl+alt+d", rename: "ctrl+alt+r" })
    expect(lines).toHaveLength(1)
    expect(lines[0].length).toBeLessThanOrEqual(24)
    expect(lines[0]).toContain("…")
  })

  test("cleans a pasted directory path before using it", () => {
    const home = "C:\\Users\\dev"
    expect(normalizeDirectory("  C:\\work\\repo  ", home)).toBe("C:\\work\\repo")
    expect(normalizeDirectory('"C:\\work\\repo"', home)).toBe("C:\\work\\repo")
    expect(normalizeDirectory("~/repo", home)).toBe(`${home}/repo`)
    expect(normalizeDirectory("~", home)).toBe(home)
  })

  test("explains why a pasted path cannot be used", () => {
    expect(directoryProblem("", { exists: false, directory: false })).toBe("Paste a folder path")
    expect(directoryProblem("C:\\nope", { exists: false, directory: false })).toBe("Folder not found")
    expect(directoryProblem("C:\\file.txt", { exists: true, directory: false })).toBe("That path is not a folder")
    expect(directoryProblem("C:\\repo", { exists: true, directory: true })).toBeUndefined()
  })

  test("lists each used directory once, in alphabetical order", () => {
    expect(usedDirectories(grouped)).toEqual([
      "C:\\work\\command-code",
      "C:\\other\\deepseek",
      "C:\\other\\harness",
      "C:\\other\\misc",
      "C:\\work\\opencode-fork",
    ])
  })

  test("filters the used directories by path or by name", () => {
    const directories = ["C:\\work\\command-code", "C:\\other\\deepseek", "C:\\work\\opencode-fork"]
    expect(filteredDirectories(directories, "")).toEqual(directories)
    expect(filteredDirectories(directories, "deepseek")).toEqual(["C:\\other\\deepseek"])
    expect(filteredDirectories(directories, "C:\\work")).toEqual(["C:\\work\\command-code", "C:\\work\\opencode-fork"])
    expect(filteredDirectories(directories, "nowhere")).toEqual([])
  })

  test("accepts a pasted path only when it is a real folder", () => {
    const folder = () => ({ exists: true, directory: true })
    expect(directoryChoice("C:\\repo", folder)).toEqual({ kind: "choose", directory: "C:\\repo" })
    expect(directoryChoice("", folder)).toEqual({ kind: "error", message: "Paste a folder path" })
    expect(directoryChoice("C:\\nope", () => ({ exists: false, directory: false }))).toEqual({
      kind: "error",
      message: "Folder not found",
    })
    expect(directoryChoice("C:\\file.txt", () => ({ exists: true, directory: false }))).toEqual({
      kind: "error",
      message: "That path is not a folder",
    })
  })

  test("keeps the folder badge right against the name", () => {
    expect(navDirRow({ label: "opencode", count: 5, collapsed: false, width: NAV_WIDTH })).toBe(
      "  ▾ /opencode 5",
    )
    expect(navDirRow({ label: "opencode", count: 12, collapsed: true, width: NAV_WIDTH })).toBe(
      "  ▸ /opencode 12",
    )
  })

  test("narrows the sessions by title, folder name or folder path", () => {
    const rows: NavSession[] = [
      { id: "s1", title: "Add navbar", directory: "C:\\work\\alpha" },
      { id: "s2", title: "Fix parser", directory: "C:\\other\\beta" },
    ]
    expect(filterNavSessions(rows, "")).toEqual(rows)
    expect(filterNavSessions(rows, "parser")).toEqual([rows[1]])
    expect(filterNavSessions(rows, "alpha")).toEqual([rows[0]])
    expect(filterNavSessions(rows, "C:\\other")).toEqual([rows[1]])
    expect(filterNavSessions(rows, "nowhere")).toEqual([])
  })

  test("the search line shows a hint until the user searches", () => {
    expect(navQueryRow("", false, NAV_WIDTH)).toContain("/ Search folders")
    expect(navQueryRow("alpha", true, NAV_WIDTH)).toContain("/alpha")
  })

  test("types and erases the query one character at a time", () => {
    expect(searchAppend("", "a")).toBe("a")
    expect(searchAppend("al", "space")).toBe("al ")
    expect(searchAppend("al", "p")).toBe("alp")
    expect(searchBackspace("alp")).toBe("al")
    expect(searchBackspace("")).toBeUndefined()
  })
})
