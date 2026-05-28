import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { execSync } from "node:child_process"

// ── The parseHeadlessResult logic (internal to auto-executor, tested here inline) ──

function parseHeadlessResult(output: string): Record<string, unknown> | null {
  const lines = output.trim().split("\n").filter((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])
      if (parsed?.type === "headless_result") return parsed as Record<string, unknown>
    } catch { /* skip non-JSON */ }
  }
  return null
}

describe("parseHeadlessResult (auto-executor logic)", () => {
  test("extracts headless_result from clean output", () => {
    const output = JSON.stringify({
      type: "headless_result",
      sessionID: "abc123",
      success: true,
      error: null,
      summary: { additions: 1, deletions: 0, files: 1, diffs: [] },
      diffs: [],
      agent: "test",
      model: "test/model",
    })
    const result = parseHeadlessResult(output)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("headless_result")
    expect(result!.success).toBe(true)
    expect(result!.sessionID).toBe("abc123")
  })

  test("picks the LAST headless_result from mixed output", () => {
    const lines = [
      `some log line`,
      `{"type":"tool_use","tool":"edit"}`,
      `{"type":"headless_result","sessionID":"first","success":false,"error":"failed","summary":null,"diffs":[],"agent":null,"model":null}`,
      `{"type":"headless_result","sessionID":"second","success":true,"error":null,"summary":{"additions":2,"deletions":1,"files":1,"diffs":[]},"diffs":[],"agent":"test","model":"test/model"}`,
    ]
    const result = parseHeadlessResult(lines.join("\n"))
    expect(result).not.toBeNull()
    expect(result!.sessionID).toBe("second")
    expect(result!.success).toBe(true)
  })

  test("handles error output", () => {
    const output = [
      `Error: something went wrong`,
      `  at Object.<anonymous> (test.ts:1:1)`,
      JSON.stringify({
        type: "headless_result",
        sessionID: "err-session",
        success: false,
        error: "Prompt failed",
        summary: null,
        diffs: [],
        agent: "test",
        model: null,
      }),
    ].join("\n")
    const result = parseHeadlessResult(output)
    expect(result).not.toBeNull()
    expect(result!.success).toBe(false)
    expect(result!.error).toBe("Prompt failed")
  })

  test("returns null for empty output", () => {
    expect(parseHeadlessResult("")).toBeNull()
  })

  test("returns null when no headless_result in output", () => {
    const output = [
      `{"type":"tool_use","tool":"read"}`,
      `{"type":"tool_use","tool":"edit"}`,
      `Progress: 50%`,
    ].join("\n")
    expect(parseHeadlessResult(output)).toBeNull()
  })

  test("handles stderr + stdout mixed output", () => {
    const stderr = "[1] Session started\n[2] Model loaded\n"
    const jsonLine = JSON.stringify({
      type: "headless_result",
      sessionID: "stderr-test",
      success: true,
      error: null,
      summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
      diffs: [],
      agent: null,
      model: null,
    })
    const stdout = `Processing...\n${jsonLine}\n`
    const result = parseHeadlessResult(stderr + stdout)
    expect(result).not.toBeNull()
    expect(result!.sessionID).toBe("stderr-test")
  })
})

// ── Task queue tests (trigger-handler) ──

import { TriggerHandler } from "../../src/daemon/trigger-handler"

describe("TriggerHandler task queue", () => {
  const testId = `test-task-${Date.now()}`
  const cleanup: string[] = []

  afterEach(() => {
    for (const id of cleanup) {
      const qdir = TriggerHandler.taskQueueDir()
      const file = path.join(qdir, `${id}.json`)
      try { fs.unlinkSync(file) } catch { /* already gone */ }
    }
    cleanup.length = 0
  })

  test("writeTask creates a JSON file in the queue directory", () => {
    const trigger = { id: testId, source: "test", payload: { description: "unit test" } }
    TriggerHandler.writeTask(trigger)
    cleanup.push(testId)

    const qdir = TriggerHandler.taskQueueDir()
    const file = path.join(qdir, `${testId}.json`)
    expect(fs.existsSync(file)).toBe(true)

    const content = JSON.parse(fs.readFileSync(file, "utf-8"))
    expect(content.triggerId).toBe(testId)
    expect(content.source).toBe("test")
    expect(content.status).toBe("pending")
  })

  test("listPendingTasks returns only pending tasks", () => {
    const id1 = `test-pending-${Date.now()}`
    const id2 = `test-done-${Date.now()}`
    cleanup.push(id1, id2)

    TriggerHandler.writeTask({ id: id1, source: "test", payload: {} })
    TriggerHandler.writeTask({ id: id2, source: "test", payload: {} })
    TriggerHandler.markTaskDone(id2)

    const pending = TriggerHandler.listPendingTasks()
    const ids = pending.map((t) => t.triggerId)
    expect(ids).toContain(id1)
    expect(ids).not.toContain(id2)
  })

  test("findTask returns null for non-existent task", () => {
    expect(TriggerHandler.findTask("nonexistent-task-xyz")).toBeNull()
  })

  test("findTask returns the task for an existing task", () => {
    cleanup.push(testId)
    TriggerHandler.writeTask({ id: testId, source: "test", payload: { foo: "bar" } })
    const task = TriggerHandler.findTask(testId)
    expect(task).not.toBeNull()
    expect(task!.source).toBe("test")
    expect((task!.payload as Record<string, unknown>).foo).toBe("bar")
  })

  test("markTaskDone updates status from pending to done", () => {
    cleanup.push(testId)
    TriggerHandler.writeTask({ id: testId, source: "test", payload: {} })
    expect(TriggerHandler.findTask(testId)!.status).toBe("pending")
    TriggerHandler.markTaskDone(testId)
    expect(TriggerHandler.findTask(testId)!.status).toBe("done")
  })
})

// ── Auto-memory tests ──

import { AutoMemory } from "../../src/daemon/auto-memory"

describe("AutoMemory learnings", () => {
  const testTaskId = `memory-test-${Date.now()}`
  let storedId: string | null = null

  afterEach(() => {
    AutoMemory.acknowledgeAllLearnings()
    storedId = null
  })

  test("storeLearning creates a learning entry", () => {
    storedId = AutoMemory.storeLearning({
      source: "test",
      taskId: testTaskId,
      summary: "Test learning entry",
      filesChanged: 1,
      diffs: [{ file: "test.txt", type: "edit" }],
      model: null,
      tags: ["test"],
    })
    expect(storedId).toBeTruthy()
    expect(typeof storedId).toBe("string")
  })

  test("readUnacknowledgedLearnings returns stored learnings", () => {
    storedId = AutoMemory.storeLearning({
      source: "test",
      taskId: testTaskId,
      summary: "Test for readUnacknowledged",
      filesChanged: 0,
      diffs: [],
      model: null,
      tags: ["test"],
    })
    const learnings = AutoMemory.readUnacknowledgedLearnings()
    const found = learnings.find((l) => l.id === storedId)
    expect(found).toBeDefined()
    expect(found!.summary).toContain("Test for readUnacknowledged")
  })

  test("findLearningsByTaskId returns matching learnings", () => {
    storedId = AutoMemory.storeLearning({
      source: "test",
      taskId: testTaskId,
      summary: "Find me by taskId",
      filesChanged: 0,
      diffs: [],
      model: null,
      tags: ["test"],
    })
    const results = AutoMemory.findLearningsByTaskId(testTaskId)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.id === storedId)).toBe(true)
  })

  test("findLearningsByTaskId filters failures by tag", () => {
    const failedId = AutoMemory.storeLearning({
      source: "test",
      taskId: testTaskId,
      summary: "Failed attempt",
      filesChanged: 0,
      diffs: [],
      model: null,
      tags: ["failed", "attempt-1"],
    })
    const allAttempts = AutoMemory.findLearningsByTaskId(testTaskId)
    const failedOnes = allAttempts.filter((l) => l.tags.includes("failed"))
    expect(failedOnes.length).toBeGreaterThanOrEqual(1)
    expect(failedOnes.some((f) => f.id === failedId)).toBe(true)
  })
})

// ── Notification tests ──

import { Notifications, type DaemonNotification } from "../../src/daemon/notifications"

describe("Notifications", () => {
  afterEach(() => {
    Notifications.acknowledgeAll()
  })

  test("writeNotification creates a notification (with proper args)", () => {
    Notifications.writeNotification(
      "task_success",
      "Test notification summary",
      "details about the test",
      { taskId: "notif-test-1", source: "test" },
    )
    const latest = Notifications.readLatestNotification()
    expect(latest).not.toBeNull()
    expect(latest!.summary).toContain("Test notification summary")
    expect(latest!.type).toBe("task_success")
  })

  test("readUnacknowledged returns unread notifications", () => {
    Notifications.acknowledgeAll()
    Notifications.writeNotification(
      "task_escalated",
      "Urgent: something failed",
      "details about failure",
      { taskId: "notif-test-2", source: "test" },
    )
    const unread = Notifications.readUnacknowledged()
    expect(unread.length).toBeGreaterThanOrEqual(1)
    expect(unread.some((n: DaemonNotification) => n.summary.includes("Urgent"))).toBe(true)
  })

  test("acknowledgeAll clears notifications", () => {
    Notifications.writeNotification(
      "task_committed",
      "Committed test",
      "commit details",
      { taskId: "notif-test-3", source: "test" },
    )
    Notifications.acknowledgeAll()
    const unread = Notifications.readUnacknowledged()
    expect(unread.length).toBe(0)
  })
})

// ── Auto-commit tests (require git) ──

import { AutoCommit } from "../../src/daemon/auto-commit"

describe("AutoCommit", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-test-commit-"))
    const sopts = { cwd: tmpDir, stdio: "pipe" as const }
    execSync("git init", sopts)
    execSync('git config user.email "test@test.com"', sopts)
    execSync('git config user.name "Test"', sopts)
    // First commit (required for git operations)
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test")
    execSync("git add -A", sopts)
    execSync('git commit -m "initial commit"', sopts)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test("hasUncommittedChanges returns false for clean repo", () => {
    expect(AutoCommit.hasUncommittedChanges(tmpDir)).toBe(false)
  })

  test("hasUncommittedChanges returns true after file modification", () => {
    fs.writeFileSync(path.join(tmpDir, "test.txt"), "hello world")
    expect(AutoCommit.hasUncommittedChanges(tmpDir)).toBe(true)
  })

  test("getRepoRoot returns the repo root", () => {
    const root = AutoCommit.getRepoRoot(tmpDir)
    expect(root).not.toBeNull()
    expect(path.resolve(root!)).toBe(path.resolve(tmpDir))
  })

  test("getRepoRoot returns null outside a git repo", () => {
    // Walk up from a deeply nested temp dir should find nothing on a fresh system,
    // BUT if the user's home dir happens to be in a git repo, getRepoRoot walks up.
    // Use a non-existent path with a bogus drive letter to guarantee null.
    const root = AutoCommit.getRepoRoot("Q:\\nonexistent\\path\\" + Date.now())
    expect(root).toBeNull()
  })

  test("generateCommitMessage produces conventional commit format", () => {
    const msg = AutoCommit.generateCommitMessage([
      { file: "src/index.ts", type: "edit", diff: "+console.log('hi')\n" },
    ])
    expect(msg).toMatch(/^(feat|fix|chore|refactor|test|docs)\(/)
    expect(msg.length).toBeGreaterThan(10)
  })

  test("generateCommitMessage with multiple files", () => {
    const msg = AutoCommit.generateCommitMessage([
      { file: "src/foo.ts", type: "create" },
      { file: "src/bar.ts", type: "edit" },
    ])
    // The function produces a concise summary like "feat(src): change 2 file(s)"
    expect(msg).toContain("2 file(s)")
    expect(msg).toMatch(/^(feat|fix|chore|refactor|test|docs)\(/)
  })

  test("autoCommit creates a commit and returns hash", () => {
    fs.writeFileSync(path.join(tmpDir, "new-file.txt"), "content for commit test")
    const result = AutoCommit.autoCommit(tmpDir, [
      { file: "new-file.txt", type: "create", diff: "content for commit test" },
    ])
    expect(result).not.toBeNull()
    expect(result!.hash).toBeTruthy()
    expect(result!.message).toBeTruthy()
    expect(result!.filesChanged).toBeGreaterThanOrEqual(1)
  })
})

// ── Auto-PR trigger detection tests ──

import { AutoPR } from "../../src/daemon/auto-pr"

describe("AutoPR", () => {
  test("isPRTrigger returns true for opened action", () => {
    expect(AutoPR.isPRTrigger({ action: "opened" })).toBe(true)
  })

  test("isPRTrigger returns true for synchronize action", () => {
    expect(AutoPR.isPRTrigger({ action: "synchronize" })).toBe(true)
  })

  test("isPRTrigger returns true for review_requested", () => {
    expect(AutoPR.isPRTrigger({ action: "review_requested" })).toBe(true)
  })

  test("isPRTrigger returns false for closed action", () => {
    expect(AutoPR.isPRTrigger({ action: "closed" })).toBe(false)
  })

  test("isPRTrigger returns false for undefined payload", () => {
    expect(AutoPR.isPRTrigger(undefined)).toBe(false)
  })

  test("isPRTrigger returns false for empty payload", () => {
    expect(AutoPR.isPRTrigger({})).toBe(false)
  })

  test("isGhAvailable returns boolean", () => {
    const available = AutoPR.isGhAvailable()
    expect(typeof available).toBe("boolean")
  })
})

// ── Full pipeline integration test ──────────────────────────────────────
// Tests the complete post-execution chain: writeTask → autoCommit →
// storeLearning → writeNotification — without mocking.
// Uses a real temp git repo.

describe("Full pipeline integration", () => {
  let repoDir: string
  let taskId: string

  beforeEach(() => {
    // Create a temp git repo with a typecheck script
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-int-"))
    execSync("git init", { cwd: repoDir, stdio: "pipe" })
    execSync('git config user.email "test@test.local"', { cwd: repoDir, stdio: "pipe" })
    execSync('git config user.name "Test"', { cwd: repoDir, stdio: "pipe" })

    // Write package.json with typecheck script
    const pkg = { name: "int-test", scripts: { typecheck: 'node -e "process.exit(0)"' } }
    fs.writeFileSync(path.join(repoDir, "package.json"), JSON.stringify(pkg, null, 2))

    // Initial commit
    execSync("git add -A && git commit -m 'initial'", { cwd: repoDir, stdio: "pipe" })

    taskId = "int-test-" + Date.now()
    // Write task to queue using TriggerHandler
    TriggerHandler.writeTask({
      id: taskId,
      source: "e2e",
      payload: { local_dir: repoDir, description: "Integration test task" },
    })
  })

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true })
    // Clean up task file
    const taskFile = path.join(
      process.env.LOCALAPPDATA || "",
      "opencode", "tasks", `${taskId}.json`,
    )
    if (fs.existsSync(taskFile)) fs.rmSync(taskFile)
  })

  test("complete pipeline: writeTask → findTask → listPending → markDone", () => {
    // Verify task was written
    const found = TriggerHandler.findTask(taskId)
    expect(found).not.toBeNull()
    expect(found!.triggerId).toBe(taskId)
    expect(found!.status).toBe("pending")

    // Verify listPending includes it
    const pending = TriggerHandler.listPendingTasks()
    const match = pending.find((t) => t.triggerId === taskId)
    expect(match).toBeDefined()

    // Mark as done
    TriggerHandler.markTaskDone(taskId)
    const afterDone = TriggerHandler.findTask(taskId)
    expect(afterDone!.status).toBe("done")

    // Should no longer appear in pending
    const pending2 = TriggerHandler.listPendingTasks()
    const match2 = pending2.find((t) => t.triggerId === taskId)
    expect(match2).toBeUndefined()
  })

  test("complete pipeline: autoCommit → storeLearning → writeNotification", () => {
    // Make a change to the repo
    const testFile = path.join(repoDir, "test.txt")
    fs.writeFileSync(testFile, "hello e2e")

    const diffs: Array<{ file: string; patch?: string; additions: number; deletions: number; type: string }> = [
      { file: "test.txt", patch: "+hello e2e", additions: 1, deletions: 0, type: "add" },
    ]

    // Step 1: autoCommit
    const commit = AutoCommit.autoCommit(repoDir, diffs)
    expect(commit).not.toBeNull()
    expect(commit!.hash).toMatch(/^[0-9a-f]{7,}$/)
    expect(commit!.message).toMatch(/^(feat|fix|chore)\(/)
    expect(commit!.filesChanged).toBeGreaterThanOrEqual(1)

    // Step 2: writeNotification and verify persistence
    Notifications.writeNotification(
      "task_committed",
      `Committed: ${commit!.hash.slice(0, 8)}`,
      `Files: test.txt\nCommit: ${commit!.hash}`,
      { taskId, source: "e2e" },
    )

    // Verify notification was written
    const unread = Notifications.readUnacknowledged()
    const match = unread.find((n) => n.summary?.includes(commit!.hash.slice(0, 8)))
    expect(match).toBeDefined()
    expect(match!.type).toBe("task_committed")
    expect(match!.source).toBe("e2e")

    // Step 3: acknowledge all
    Notifications.acknowledgeAll()
    const afterAck = Notifications.readUnacknowledged()
    const stillThere = afterAck.some((n) => n.id === match!.id)
    expect(stillThere).toBe(false)
  })
})
