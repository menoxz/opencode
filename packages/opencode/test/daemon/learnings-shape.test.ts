import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { AutoExecutor } from "../../src/daemon/auto-executor"
import { AutoMemory } from "../../src/daemon/auto-memory"
import { SessionPrompt } from "../../src/session/prompt"

// Reproduces the 2026-09-26 incident (log 2026-09-26T151518, ref=err_67cb811f
// and err_a93a94f2): the daemon eval task stored a learning whose diffs carried
// the `session.diff` payload shape (`status`/`patch`) instead of LearningEntry's
// (`type`/`diff`). `xmlEscape(undefined)` then threw inside
// formatLearningsSection during prompt composition, so every prompt ended on
// the TUI toast "Sending the prompt failed. Open console for more details."

const LEGACY_FILE = "learning-learn-shape-test.json"
const LEGACY_ID = "learn-shape-test"

const legacyLearning = {
  id: LEGACY_ID,
  timestamp: "2026-09-26T14:56:33.679Z",
  source: "eval-regression",
  taskId: "eval-regression-sanity",
  summary: "Processed 1 file(s)",
  filesChanged: 1,
  diffs: [
    {
      file: "hello_eval.py",
      patch: '+print("Hello, Eval Framework!")',
      additions: 1,
      deletions: 0,
      status: "added",
    },
  ],
  model: null,
  tags: ["eval-regression", "auto-executed"],
}

const legacyPath = () => path.join(AutoMemory.learningsDir(), LEGACY_FILE)

afterEach(() => {
  fs.rmSync(legacyPath(), { force: true })
})

describe("learnings diff shape", () => {
  test("parseHeadlessResult maps the session.diff payload onto DiffInfo", () => {
    const line = JSON.stringify({
      type: "headless_result",
      sessionID: "ses_test",
      success: true,
      error: null,
      summary: null,
      agent: null,
      model: "test/model",
      diffs: [
        { file: "src/a.ts", patch: "+++ a", additions: 1, deletions: 0, status: "added" },
        { file: "src/b.ts", patch: "+++ b", additions: 2, deletions: 1 },
      ],
    })
    const parsed = AutoExecutor.parseHeadlessResult(`unrelated noise\n${line}`)
    expect(parsed).not.toBeNull()
    expect(parsed!.diffs).toEqual([
      { file: "src/a.ts", type: "added", diff: "+++ a" },
      { file: "src/b.ts", type: "modified", diff: "+++ b" },
    ])
  })

  test("parseHeadlessResult returns null without a headless_result line", () => {
    expect(AutoExecutor.parseHeadlessResult("not json\n{still not json")).toBeNull()
  })

  test("readUnacknowledgedLearnings repairs a legacy status/patch entry", () => {
    fs.mkdirSync(AutoMemory.learningsDir(), { recursive: true })
    fs.writeFileSync(legacyPath(), JSON.stringify(legacyLearning))
    const found = AutoMemory.readUnacknowledgedLearnings().find((l) => l.id === LEGACY_ID)
    expect(found).toBeDefined()
    expect(found!.diffs).toEqual([
      { file: "hello_eval.py", type: "added", diff: '+print("Hello, Eval Framework!")' },
    ])
    expect(Object.values(found!.diffs[0]).every((v) => v !== undefined)).toBe(true)
  })

  test("readUnacknowledgedLearnings coerces entries with missing fields", () => {
    fs.mkdirSync(AutoMemory.learningsDir(), { recursive: true })
    fs.writeFileSync(legacyPath(), JSON.stringify({ id: LEGACY_ID, diffs: "not-an-array", tags: [7] }))
    const found = AutoMemory.readUnacknowledgedLearnings().find((l) => l.id === LEGACY_ID)
    expect(found).toBeDefined()
    expect(found!.summary).toBe("")
    expect(found!.filesChanged).toBe(0)
    expect(found!.diffs).toEqual([])
    expect(found!.tags).toEqual([])
  })

  test("formatLearningsSection renders a legacy entry instead of failing the prompt", () => {
    fs.mkdirSync(AutoMemory.learningsDir(), { recursive: true })
    fs.writeFileSync(legacyPath(), JSON.stringify(legacyLearning))
    let xml = ""
    expect(() => {
      xml = SessionPrompt.formatLearningsSection()
    }).not.toThrow()
    expect(xml).toContain('<file type="added">hello_eval.py</file>')
    expect(xml).toContain("<summary>Processed 1 file(s)</summary>")
  })
})
