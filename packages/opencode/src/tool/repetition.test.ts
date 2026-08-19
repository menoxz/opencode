/**
 * Tests for the tool-call cycle brake (see tool/repetition.ts).
 *
 * These reproduce the two measured pathologies from AUDIT-opencodev2.md D1:
 *  - 127 identical `edit` calls all failing with the same error
 *  - 111 identical `read` calls all returning the same bytes
 * and assert that the brake cuts each one at the third attempt, while never
 * blocking repetition whose result actually changes.
 *
 * Run: bun test src/tool/repetition.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test"
import { ToolRepetition } from "./repetition"

const SESSION = "ses_test"
const EDIT_ARGS = { filePath: "/repo/triggers.ts", oldString: "foo", newString: "foo" }
const READ_ARGS = { filePath: "/repo/triggers.ts", offset: 303, limit: 50 }

beforeEach(() => ToolRepetition.reset())

describe("signature", () => {
  test("is stable across key order", () => {
    expect(ToolRepetition.signature("edit", { a: 1, b: 2 })).toBe(ToolRepetition.signature("edit", { b: 2, a: 1 }))
  })

  test("separates tools with identical arguments", () => {
    expect(ToolRepetition.signature("edit", READ_ARGS)).not.toBe(ToolRepetition.signature("read", READ_ARGS))
  })

  test("distinguishes different arguments", () => {
    expect(ToolRepetition.signature("read", READ_ARGS)).not.toBe(
      ToolRepetition.signature("read", { ...READ_ARGS, offset: 304 }),
    )
  })

  test("ignores undefined optional fields", () => {
    expect(ToolRepetition.signature("read", { filePath: "/a" })).toBe(
      ToolRepetition.signature("read", { filePath: "/a", limit: undefined }),
    )
  })
})

describe("failure rule", () => {
  test("blocks the third identical failing call", () => {
    expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(false)
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })

    expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(false)
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })

    const verdict = ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS)
    expect(verdict.blocked).toBe(true)
    if (!verdict.blocked) throw new Error("unreachable")
    expect(verdict.reason).toBe("failure")
    expect(verdict.tool).toBe("edit")
  })

  test("stays blocked for the rest of the livelock", () => {
    // The audited session issued 129 of these. Every one after the second is refused.
    for (let i = 0; i < 2; i++) ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    for (let i = 0; i < 127; i++) expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(true)
  })

  test("does not block a different file", () => {
    for (let i = 0; i < 5; i++) ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    expect(ToolRepetition.inspect(SESSION, "edit", { ...EDIT_ARGS, filePath: "/repo/other.ts" }).blocked).toBe(false)
  })

  test("does not leak across sessions", () => {
    for (let i = 0; i < 5; i++) ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    expect(ToolRepetition.inspect("ses_other", "edit", EDIT_ARGS).blocked).toBe(false)
  })

  test("a success clears the failure streak", () => {
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: true, digest: ToolRepetition.digest("done") })
    expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(false)
  })
})

describe("idle-output rule", () => {
  const same = { ok: true, digest: ToolRepetition.digest("<content>identical bytes</content>") }

  test("blocks the third identical-output call", () => {
    ToolRepetition.record(SESSION, "read", READ_ARGS, same)
    expect(ToolRepetition.inspect(SESSION, "read", READ_ARGS).blocked).toBe(false)
    ToolRepetition.record(SESSION, "read", READ_ARGS, same)
    expect(ToolRepetition.inspect(SESSION, "read", READ_ARGS).blocked).toBe(false)
    ToolRepetition.record(SESSION, "read", READ_ARGS, same)

    const verdict = ToolRepetition.inspect(SESSION, "read", READ_ARGS)
    expect(verdict.blocked).toBe(true)
    if (!verdict.blocked) throw new Error("unreachable")
    expect(verdict.reason).toBe("idle-output")
  })

  test("never blocks a repeated call whose output changes", () => {
    // `bash: bun test` re-run after each fix must stay allowed forever.
    for (let i = 0; i < 50; i++) {
      expect(ToolRepetition.inspect(SESSION, "bash", { command: "bun test" }).blocked).toBe(false)
      ToolRepetition.record(SESSION, "bash", { command: "bun test" }, {
        ok: true,
        digest: ToolRepetition.digest(`${i} failures`),
      })
    }
  })

  test("a changed output resets the idle streak", () => {
    for (let i = 0; i < 3; i++) ToolRepetition.record(SESSION, "read", READ_ARGS, same)
    expect(ToolRepetition.inspect(SESSION, "read", READ_ARGS).blocked).toBe(true)
    ToolRepetition.record(SESSION, "read", READ_ARGS, { ok: true, digest: ToolRepetition.digest("edited!") })
    expect(ToolRepetition.inspect(SESSION, "read", READ_ARGS).blocked).toBe(false)
  })
})

describe("window", () => {
  test("forgets a signature pushed out by unrelated calls", () => {
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(true)

    for (let i = 0; i < ToolRepetition.WINDOW + 1; i++)
      ToolRepetition.record(SESSION, "read", { filePath: `/f${i}.ts` }, { ok: true, digest: `d${i}` })

    expect(ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS).blocked).toBe(false)
  })
})

describe("digest", () => {
  test("is equal for equal strings and differs for near-identical ones", () => {
    expect(ToolRepetition.digest("hello world")).toBe(ToolRepetition.digest("hello world"))
    expect(ToolRepetition.digest("hello world")).not.toBe(ToolRepetition.digest("hello worle"))
    expect(ToolRepetition.digest("")).not.toBe(ToolRepetition.digest(" "))
  })
})

describe("explain", () => {
  test("failure prose names the tool and forbids the retry", () => {
    for (let i = 0; i < 2; i++) ToolRepetition.record(SESSION, "edit", EDIT_ARGS, { ok: false, digest: "" })
    const verdict = ToolRepetition.inspect(SESSION, "edit", EDIT_ARGS)
    if (!verdict.blocked) throw new Error("expected block")
    const prose = ToolRepetition.explain(verdict)
    expect(prose).toContain("edit")
    expect(prose).toContain("Change strategy")
    expect(prose).toContain("triggers.ts")
  })

  test("idle prose points back at the conversation", () => {
    const same = { ok: true, digest: ToolRepetition.digest("x") }
    for (let i = 0; i < 3; i++) ToolRepetition.record(SESSION, "read", READ_ARGS, same)
    const verdict = ToolRepetition.inspect(SESSION, "read", READ_ARGS)
    if (!verdict.blocked) throw new Error("expected block")
    expect(ToolRepetition.explain(verdict)).toContain("already in this conversation")
  })
})
