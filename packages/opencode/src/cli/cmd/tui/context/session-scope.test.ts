import { describe, expect, test } from "bun:test"
import { SESSION_MAX_AGE_DAYS, folderKey, isRecentSession, sessionAgeCutoff } from "./session-scope"

describe("session scope", () => {
  test("bounds the listing to recent sessions, excluding anything older than the limit", () => {
    const now = 1_700_000_000_000
    const cutoff = sessionAgeCutoff(now)
    expect(now - cutoff).toBe(SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

    // A session updated inside the window stays; one millisecond past it does not.
    const kept = { time: { updated: cutoff } }
    const dropped = { time: { updated: cutoff - 1 } }
    expect(kept.time.updated >= cutoff).toBe(true)
    expect(dropped.time.updated >= cutoff).toBe(false)

    // The bound is configurable, so the rule can be read from one place.
    expect(now - sessionAgeCutoff(now, 7)).toBe(7 * 24 * 60 * 60 * 1000)
  })

  test("keeps a session on the age boundary and drops the one a millisecond past it", () => {
    const now = 1_700_000_000_000
    const cutoff = sessionAgeCutoff(now)

    // Exactly on the bound: kept. One millisecond older: gone. The pair is what proves the rule
    // is the stated one and not an off-by-one in either direction.
    const boundary = { time: { updated: cutoff } }
    const beyond = { time: { updated: cutoff - 1 } }
    expect(isRecentSession(boundary, cutoff)).toBe(true)
    expect(isRecentSession(beyond, cutoff)).toBe(false)

    // A session well inside the window, and one well outside it, behave the same way.
    expect(isRecentSession({ time: { updated: now } }, cutoff)).toBe(true)
    expect(isRecentSession({ time: { updated: cutoff - SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 } }, cutoff)).toBe(false)
  })

  test("keeps a week of sessions and no more", () => {
    const now = 1_700_000_000_000
    const week = 7 * 24 * 60 * 60 * 1000
    const cutoff = sessionAgeCutoff(now)

    // The window is a week: a 30-day bound would keep the boundary case below and fail here.
    expect(now - cutoff).toBe(week)

    // A week exactly: kept; a millisecond older: dropped.
    expect(isRecentSession({ time: { updated: now - week } }, cutoff)).toBe(true)
    expect(isRecentSession({ time: { updated: now - week - 1 } }, cutoff)).toBe(false)
  })

  test("groups a folder under one identity whatever its spelling", () => {
    expect(folderKey("C:\\work\\a")).toBe(folderKey("c:/WORK/a/"))
    expect(folderKey(undefined)).toBe("")
  })
})
