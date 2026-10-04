import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { persistLearningArtifacts } from "../../src/daemon/learning-artifacts"
import type { PatternReport, RecurringPattern } from "../../src/memory/patterns"

const roots: string[] = []
afterEach(() => {
  delete process.env.OPENCODE_LEARNING_ARTIFACT_DIR
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function pattern(overrides: Partial<RecurringPattern> = {}): RecurringPattern {
  return { id: "pattern-testing-123", description: "Recurring topic: testing (6 occurrences)", frequency: 6, confidence: 0.6, tags: ["testing"], firstSeen: 1, lastSeen: 2, examples: [], ...overrides }
}

function report(recurringPatterns: RecurringPattern[], generatedAt = Date.UTC(2026, 7, 21)): PatternReport {
  return { generatedAt, totalMemoriesAnalyzed: 10, recurringPatterns, antiPatterns: [], successPatterns: [], suggestions: [] }
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "learning-artifacts-"))
  roots.push(root)
  process.env.OPENCODE_LEARNING_ARTIFACT_DIR = root
  return root
}

describe("persistLearningArtifacts", () => {
  test("persists immutable and latest pattern reports", () => {
    const root = setup()
    const result = persistLearningArtifacts(report([]))
    expect(fs.existsSync(result.reportFile)).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(root, "latest.json"), "utf8")).totalMemoriesAnalyzed).toBe(10)
  })

  test("creates only candidates meeting frequency and confidence gates", () => {
    const root = setup()
    const result = persistLearningArtifacts(report([pattern(), pattern({ id: "low-frequency", frequency: 2 }), pattern({ id: "low-confidence", confidence: 0.5 })]))
    expect(result.candidatesCreated).toBe(1)
    const candidates = fs.readdirSync(path.join(root, "candidates"))
    expect(candidates).toHaveLength(1)
    expect(fs.existsSync(path.join(root, "candidates", candidates[0], "CANDIDATE.md"))).toBe(true)
    expect(fs.existsSync(path.join(root, "candidates", candidates[0], "SKILL.md"))).toBe(false)
    expect(fs.readFileSync(path.join(root, "candidates", candidates[0], "CHANGELOG.md"), "utf8")).toContain("Created candidate")
  })

  test("deduplicates timestamped pattern ids with a stable key", () => {
    const root = setup()
    persistLearningArtifacts(report([pattern({ id: "pattern-testing-111" })]))
    const second = persistLearningArtifacts(report([pattern({ id: "pattern-testing-222" })]))
    expect(fs.readdirSync(path.join(root, "candidates"))).toHaveLength(1)
    expect(second.candidatesCreated).toBe(0)
    expect(second.candidatesUpdated).toBe(0)
    const candidate = fs.readdirSync(path.join(root, "candidates"))[0]
    const changelog = fs.readFileSync(path.join(root, "candidates", candidate, "CHANGELOG.md"), "utf8")
    expect(changelog.match(/Created candidate/g)).toHaveLength(1)
  })
})
