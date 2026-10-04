// Agent Swarm — unit tests for the pure orchestration logic (swarm-lib).
// Run: bun test .opencode/tests/swarm.test.ts  (from the fork root)

import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  aggregateRun,
  buildWaves,
  fileConflicts,
  findCycle,
  formatDuration,
  makeRunId,
  parseHeadlessResult,
  readManifest,
  readTaskResults,
  runDir,
  validateTasks,
  writeManifest,
  writeTaskResult,
  type SwarmManifest,
  type SwarmTask,
  type TaskResult,
} from "../plugin/swarm-lib.js"

const task = (id: string, overrides: Partial<SwarmTask> = {}): SwarmTask => ({
  id,
  agent: "swarm-worker",
  prompt: "Analyze the component and report findings with evidence.",
  ...overrides,
})

describe("validateTasks", () => {
  test("accepts a valid parallel task set", () => {
    expect(validateTasks([task("a"), task("b"), task("c")])).toEqual([])
  })

  test("rejects empty list", () => {
    expect(validateTasks([])).not.toEqual([])
  })

  test("rejects duplicate ids and malformed ids", () => {
    const errors = validateTasks([task("a"), task("a"), task("bad id")])
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true)
    expect(errors.some((e) => e.includes("invalid"))).toBe(true)
  })

  test("rejects short prompts and unknown dependencies", () => {
    const errors = validateTasks([task("a", { prompt: "x", depends_on: ["ghost"] })])
    expect(errors.some((e) => e.includes("at least 20"))).toBe(true)
    expect(errors.some((e) => e.includes("ghost"))).toBe(true)
  })

  test("rejects out-of-range timeouts", () => {
    expect(validateTasks([task("a", { timeout_s: 5 })])).not.toEqual([])
    expect(validateTasks([task("a", { timeout_s: 7200 })])).not.toEqual([])
    expect(validateTasks([task("a", { timeout_s: 300 })])).toEqual([])
  })
})

describe("findCycle / buildWaves", () => {
  test("detects a dependency cycle (start repeated at the end)", () => {
    const cycle = findCycle([task("a", { depends_on: ["b"] }), task("b", { depends_on: ["a"] })])
    expect(cycle).not.toBeNull()
    expect(cycle).toEqual(["a", "b", "a"])
  })

  test("returns null for acyclic graphs", () => {
    expect(findCycle([task("a"), task("b", { depends_on: ["a"] })])).toBeNull()
  })

  test("chains sequential tasks into waves", () => {
    const { waves, ordered } = buildWaves([
      task("a"),
      task("b", { depends_on: ["a"] }),
      task("c", { depends_on: ["b"] }),
    ])
    expect(waves.map((w) => w.length)).toEqual([1, 1, 1])
    expect(ordered).toEqual(["a", "b", "c"])
  })

  test("puts independent tasks in one wave", () => {
    const { waves } = buildWaves([task("a"), task("b"), task("c")])
    expect(waves).toHaveLength(1)
    expect(waves[0].sort()).toEqual(["a", "b", "c"])
  })

  test("reports an error on cycles", () => {
    const result = buildWaves([task("a", { depends_on: ["b"] }), task("b", { depends_on: ["a"] })])
    expect("error" in result).toBe(true)
  })
})

describe("fileConflicts", () => {
  test("flags the same file claimed by two tasks", () => {
    const conflicts = fileConflicts([task("a", { files: ["src/foo.ts"] }), task("b", { files: ["src\\foo.ts"] })])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].a).toBe("a")
    expect(conflicts[0].b).toBe("b")
  })

  test("ignores distinct files", () => {
    expect(fileConflicts([task("a", { files: ["src/a.ts"] }), task("b", { files: ["src/b.ts"] })])).toEqual([])
  })
})

describe("run layout", () => {
  test("makeRunId is unique and slug-shaped", () => {
    const a = makeRunId()
    const b = makeRunId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^swarm-\d{14}-[a-z0-9]{4}$/)
  })

  test("runDir nests under .swarm", () => {
    expect(runDir("C:/repo", "swarm-x")).toBe(path.join("C:/repo", ".swarm", "swarm-x"))
  })

  test("formatDuration", () => {
    expect(formatDuration(500)).toBe("500ms")
    expect(formatDuration(2500)).toBe("2.5s")
  })
})

describe("manifest / results IO", () => {
  test("writes and reads a manifest roundtrip", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-test-"))
    const manifest: SwarmManifest = {
      run_id: "swarm-test",
      mission: "test mission",
      worktree: dir,
      created_at: "2026-08-01T00:00:00.000Z",
      tasks: [task("a"), task("b", { depends_on: ["a"] })],
    }
    await writeManifest(dir, manifest)
    const loaded = await readManifest(dir)
    expect(loaded).not.toBeNull()
    expect(loaded!.tasks).toHaveLength(2)
    expect(loaded!.tasks[1].depends_on).toEqual(["a"])
  })

  test("readManifest returns null when missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-test-"))
    expect(await readManifest(dir)).toBeNull()
  })

  test("writes and reads task results", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "swarm-test-"))
    await writeManifest(dir, { run_id: "r", mission: "m", worktree: dir, created_at: "x", tasks: [task("a")] })
    const result: TaskResult = {
      task_id: "a",
      agent: "swarm-worker",
      status: "success",
      exit_code: 0,
      duration_ms: 1234,
      summary: "done",
      diffs: [{ file: "a.ts" }],
    }
    await writeTaskResult(dir, result)
    const results = await readTaskResults(dir)
    expect(results.a.status).toBe("success")
    expect(results.a.diffs).toEqual([{ file: "a.ts" }])
  })
})

describe("parseHeadlessResult", () => {
  test("parses the headless_result JSON line among noise", () => {
    const stdout = [
      "some log line",
      '{"type":"headless_result","sessionID":"s1","success":true,"error":null,"summary":"All good","diffs":[],"agent":"build"}',
      "",
    ].join("\n")
    const parsed = parseHeadlessResult(stdout)
    expect(parsed.success).toBe(true)
    expect(parsed.summary).toBe("All good")
  })

  test("reports failure with error", () => {
    const stdout = '{"type":"headless_result","success":false,"error":"boom","summary":null,"diffs":[]}'
    const parsed = parseHeadlessResult(stdout)
    expect(parsed.success).toBe(false)
    expect(parsed.error).toBe("boom")
  })

  test("degrades on unparseable output", () => {
    const parsed = parseHeadlessResult("totally not json")
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain("no parseable headless_result")
  })
})

describe("aggregateRun", () => {
  test("reports status, counts and failures", () => {
    const manifest: SwarmManifest = {
      run_id: "r",
      mission: "check everything",
      worktree: "W",
      created_at: "x",
      tasks: [task("a"), task("b")],
    }
    const results: Record<string, TaskResult> = {
      a: { task_id: "a", agent: "swarm-worker", status: "success", exit_code: 0, duration_ms: 100, summary: "ok", diffs: [] },
      b: { task_id: "b", agent: "swarm-worker", status: "failed", exit_code: 1, duration_ms: 200, summary: "", error: "nope", diffs: [] },
    }
    const report = aggregateRun(manifest, results)
    expect(report).toContain("succeeded: 1")
    expect(report).toContain("| a | swarm-worker | success |")
    expect(report).toContain("## Failures")
    expect(report).toContain("nope")
  })

  test("marks missing tasks as pending", () => {
    const manifest: SwarmManifest = {
      run_id: "r",
      mission: "m",
      worktree: "W",
      created_at: "x",
      tasks: [task("a")],
    }
    const report = aggregateRun(manifest, {})
    expect(report).toContain("pending")
  })
})
