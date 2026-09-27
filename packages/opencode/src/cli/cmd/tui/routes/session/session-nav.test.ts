import { describe, expect, test } from "bun:test"
import { Locale } from "@/util/locale"
import {
  NAV_MIN_TERMINAL_WIDTH,
  NAV_WIDTH,
  activityGlyph,
  clampSelection,
  initialSelection,
  moveSelection,
  navActivity,
  navItems,
  navLabel,
  navRow,
  navTime,
  navVisible,
  selectionID,
  type NavSession,
} from "./session-nav"

const sessions: NavSession[] = [
  { id: "ses_a", title: "Add navbar" },
  { id: "ses_b", title: "Fix flaky test" },
  { id: "ses_c", title: "Triage issue" },
]

const older = Date.UTC(2026, 8, 26, 14, 36)

describe("TUI session navbar", () => {
  test("lists the sessions of the project and flags the active one", () => {
    const items = navItems(sessions, "ses_b")
    expect(items.map((item) => item.id)).toEqual(["ses_a", "ses_b", "ses_c"])
    expect(items.map((item) => item.active)).toEqual([false, true, false])
    expect(items.map((item) => item.index)).toEqual([0, 1, 2])
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

  test("shows activity for every row, not only the active one", () => {
    expect(activityGlyph(true, "idle")).toBe("●")
    expect(activityGlyph(false, "idle")).toBe("○")
    expect(activityGlyph(false, "busy")).toBe("◐")
    expect(activityGlyph(false, "retry")).toBe("!")
    expect(activityGlyph(true, "busy")).toBe("◐")
  })

  test("formats a session's last activity with the CLI's own helper", () => {
    expect(navTime(undefined)).toBeUndefined()
    expect(navTime(Number.NaN)).toBeUndefined()
    expect(navTime(older)).toBe(Locale.todayTimeOrDateTime(older))
  })

  test("builds one row per session with the timestamp right-aligned and never overflowing", () => {
    const stamp = Locale.todayTimeOrDateTime(older)
    const row = navRow({ title: "Add navbar", activity: "idle", active: true, selected: true, updated: older, width: NAV_WIDTH })
    expect(row.startsWith("> ● Add navbar")).toBe(true)
    expect(row.endsWith(stamp)).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)

    const other = navRow({ title: "Short", activity: "busy", active: false, selected: false, updated: older, width: NAV_WIDTH })
    expect(other.startsWith("  ◐ Short")).toBe(true)
    expect(other.endsWith(stamp)).toBe(true)
  })

  test("a row without a timestamp still fills the width with the title", () => {
    const row = navRow({ title: "Old session", activity: "idle", active: false, selected: false, width: NAV_WIDTH })
    expect(row.startsWith("  ○ Old session")).toBe(true)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
  })

  test("a long title truncates once instead of wrapping", () => {
    const row = navRow({
      title: "Connexion abonnement Claude et facturation mensuelle",
      activity: "idle",
      active: false,
      selected: false,
      updated: older,
      width: NAV_WIDTH,
    })
    expect(row).toContain("…")
    expect((row.match(/…/g) ?? []).length).toBe(1)
    expect(row.length).toBeLessThanOrEqual(NAV_WIDTH)
    expect(row.endsWith(Locale.todayTimeOrDateTime(older))).toBe(true)
  })
})
