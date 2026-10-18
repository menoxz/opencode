/**
 * Tests for the skill watcher event classification (see the `watchEventKey` helper).
 *
 * Run: bun test src/skill/watcher.test.ts
 */
import { describe, expect, test } from "bun:test"
import path from "path"
import { watchEventKey, type WatchTarget } from "./index"

const root: WatchTarget = { dir: path.join(path.sep, "config", "opencodev2"), container: false }
const container: WatchTarget = { dir: path.join(path.sep, "config", "opencodev2", "skills"), container: true }

describe("skill watcher events", () => {
  test("a container target reloads on any change inside it", () => {
    expect(watchEventKey(container, "my-skill")).toBe(container.dir)
    expect(watchEventKey(container, "SKILL.md")).toBe(container.dir)
    expect(watchEventKey(container, undefined)).toBe(container.dir)
  })

  test("a root target reloads on the bare container entry a recursive watch reports", () => {
    // The regression: a change inside `<root>/skills/<name>/SKILL.md` reached the callback as the
    // bare first-level entry `skills`, which no file filter matched, so the catalog never reloaded.
    expect(watchEventKey(root, "skills")).toBe(path.join(root.dir, "skills"))
    expect(watchEventKey(root, "skill")).toBe(path.join(root.dir, "skill"))
  })

  test("a root target reloads on a nested path when the runtime reports one", () => {
    expect(watchEventKey(root, path.join("skills", "my-skill"))).not.toBeNull()
    expect(watchEventKey(root, path.join("skills", "my-skill", "SKILL.md"))).not.toBeNull()
    expect(watchEventKey(root, path.join("skills", "synced", "9f3e", "SKILL.md"))).not.toBeNull()
  })

  test("a root target reloads on skill and config files at its surface", () => {
    expect(watchEventKey(root, "SKILL.md")).toBe(path.join(root.dir, "SKILL.md"))
    expect(watchEventKey(root, "opencode.jsonc")).toBe(path.join(root.dir, "opencode.jsonc"))
    expect(watchEventKey(root, "opencode.json")).toBe(path.join(root.dir, "opencode.json"))
    expect(watchEventKey(root, undefined)).toBe(root.dir)
  })

  test("a root target ignores unrelated writes", () => {
    // Otherwise every SQLite checkpoint would rebuild the whole catalog.
    expect(watchEventKey(root, "memory.sqlite-wal")).toBeNull()
    expect(watchEventKey(root, "eval.sqlite-wal")).toBeNull()
    expect(watchEventKey(root, "themes")).toBeNull()
    expect(watchEventKey(root, path.join("skills-backup", "notes.md"))).toBeNull()
  })
})
