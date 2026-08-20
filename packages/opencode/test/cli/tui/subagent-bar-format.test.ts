import { describe, expect, test } from "bun:test"
import {
  formatElapsed,
  formatSubagentRow,
  formatSubagentSummary,
  splitSubagentTitle,
  subagentViewportRows,
} from "../../../src/cli/cmd/tui/routes/session/subagent-bar-format"

describe("subagent bar helpers", () => {
  test("formats a duration at each scale", () => {
    expect(formatElapsed(0, 45_000)).toBe("45s")
    expect(formatElapsed(0, 187_000)).toBe("3m07s")
    expect(formatElapsed(0, 3_900_000)).toBe("1h05m")
  })

  test("hides a duration the clock cannot vouch for", () => {
    expect(formatElapsed(5_000, 1_000)).toBeUndefined()
    expect(formatElapsed(Number.NaN, 1_000)).toBeUndefined()
    // A subagent that just started is honestly at zero, not unknown.
    expect(formatElapsed(1_000, 1_000)).toBe("0s")
  })

  test("splits the agent name out of a child session title", () => {
    expect(splitSubagentTitle("Audit backend documents (@explore subagent)")).toEqual({
      title: "Audit backend documents",
      agent: "explore",
    })
    expect(splitSubagentTitle("Plain title")).toEqual({ title: "Plain title", agent: undefined })
  })

  test("a working subagent is timed against now, a finished one against its last update", () => {
    const base = { id: "ses_1", title: "Audit (@explore subagent)", created: 0, now: 120_000 }

    expect(formatSubagentRow({ ...base, updated: 60_000, working: true }).duration).toBe("2m00s")
    expect(formatSubagentRow({ ...base, updated: 60_000, working: false }).duration).toBe("1m00s")
  })

  test("omits a cost that would read as free work", () => {
    const base = { id: "ses_1", title: "Audit", created: 0, updated: 1_000, working: false, now: 1_000 }

    expect(formatSubagentRow({ ...base, cost: 0.42 }).cost).toBe("$0.42")
    expect(formatSubagentRow({ ...base, cost: 0 }).cost).toBeUndefined()
    expect(formatSubagentRow(base).cost).toBeUndefined()
  })

  test("summarises what the bar header has to say in one glance", () => {
    const row = (working: boolean) => ({ id: "x", title: "t", working })

    expect(formatSubagentSummary([row(true), row(true), row(false)])).toBe("2 working · 3 total")
    expect(formatSubagentSummary([row(false)])).toBe("all idle · 1 total")
  })
  test("sizes the expanded viewport to at most five subagents", () => {
    expect(subagentViewportRows(0)).toBe(0)
    expect(subagentViewportRows(2)).toBe(2)
    expect(subagentViewportRows(5)).toBe(5)
    expect(subagentViewportRows(8)).toBe(5)
  })
})
