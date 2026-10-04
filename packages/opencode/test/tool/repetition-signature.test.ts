/**
 * Tests for the decorative-field projection in `signature` (see P02,
 * docs/harness-audit/proposals/P02-signature-noise.md).
 *
 * `description` is a mandatory free-form label the model rewrites on every turn
 * (`shell/prompt.ts:11,29`, `task.ts:53-54,85`). Because it was part of the
 * signature key, `FAILURE_LIMIT` was unreachable for those tools: every retry
 * produced a brand-new key. These tests pin the fix and, just as importantly,
 * pin what the filter must NOT touch (`summary`, `title`, `reason`, nested
 * `description`).
 *
 * Run: bun test test/tool/repetition-signature.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test"
import { ToolRepetition } from "../../src/tool/repetition"

const SESSION = "ses_signature"
const A = { command: "bun test", description: "Run the unit tests" }
const B = { command: "bun test", description: "Execute the test suite" }

beforeEach(() => ToolRepetition.reset())

describe("signature ignores decorative top-level fields", () => {
  test("description does not change the key", () => {
    expect(ToolRepetition.signature("bash", { command: "bun test", description: "A" })).toBe(
      ToolRepetition.signature("bash", { command: "bun test", description: "B" }),
    )
    expect(ToolRepetition.signature("bash", A)).toBe(ToolRepetition.signature("bash", B))
  })

  test("the failure rule becomes reachable across description rewrites", () => {
    // `digest` is REQUIRED by `Outcome` (repetition.ts:48-52): `{ ok: false }` does not typecheck.
    ToolRepetition.record(SESSION, "bash", A, { ok: false, digest: "" })
    ToolRepetition.record(SESSION, "bash", B, { ok: false, digest: "" })

    const verdict = ToolRepetition.inspect(SESSION, "bash", B)
    expect(verdict.blocked).toBe(true)
    if (!verdict.blocked) throw new Error("unreachable")
    expect(verdict.reason).toBe("failure")
  })

  test("semantic fields still discriminate", () => {
    expect(ToolRepetition.signature("bash", { command: "bun test", description: "A" })).not.toBe(
      ToolRepetition.signature("bash", { command: "bun run typecheck", description: "A" }),
    )
  })

  test("the filter is superficial, not recursive", () => {
    // Real shape of the `tasks` tool: the key is `task: Patch` (tasks.ts:57-62) and
    // `Patch.description` is declared at tasks.ts:30 — a nested description is semantic.
    expect(ToolRepetition.signature("tasks", { task: { description: "x" } })).not.toBe(
      ToolRepetition.signature("tasks", { task: { description: "y" } }),
    )
  })

  test("the filter leaves verified-semantic top-level fields alone", () => {
    // `signature` treats the tool id as an opaque string, so plain labels are enough here.
    // `complete_objective` summary, `environment` title and `workspace_handoff` reason are all
    // read by consumers (environment.ts:156, :72, workspace-handoff.ts:119): dropping them
    // would produce false blocks.
    expect(ToolRepetition.signature("complete_objective", { summary: "A" })).not.toBe(
      ToolRepetition.signature("complete_objective", { summary: "B" }),
    )
    expect(ToolRepetition.signature("environment", { title: "A", objective: "O" })).not.toBe(
      ToolRepetition.signature("environment", { title: "B", objective: "O" }),
    )
    expect(ToolRepetition.signature("workspace_handoff", { reason: "A", path: "/p" })).not.toBe(
      ToolRepetition.signature("workspace_handoff", { reason: "B", path: "/p" }),
    )
  })

  test("an unknown top-level field still discriminates (fail-closed)", () => {
    // The filter is an exclusion list: an unrecognised field must remain in the key,
    // otherwise a new tool argument would silently escape the brake.
    expect(ToolRepetition.signature("edit", { filePath: "/a", brandNewFlag: true })).not.toBe(
      ToolRepetition.signature("edit", { filePath: "/a", brandNewFlag: false }),
    )
  })
})
