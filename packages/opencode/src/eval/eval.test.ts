/**
 * Tests for Eval Framework (Phase 6).
 * Run: bun test src/eval/eval.test.ts
 */

import { afterAll, beforeAll, describe, it, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  getScenario,
  getSuite,
  listScenarios,
  ALL_SCENARIOS,
  ALL_SUITES,
  type EvalScenario,
} from "./scenario"
import { autoEvaluate, validate, evaluateBehavior, executeScenarioInSandbox } from "./index"
import { commandExecutor, runScenarioReal, type RealScenarioExecutor } from "./real-runner"
import { createSandbox } from "./sandbox"
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

describe("EvalScenario definitions", () => {
  it("should have all 8 built-in scenarios", () => {
    expect(Object.keys(ALL_SCENARIOS).length).toBe(8)
  })

  it("should have 3 built-in suites", () => {
    expect(Object.keys(ALL_SUITES).length).toBe(3)
  })

  it("should find hello-world scenario", () => {
    const s = getScenario("hello-world")
    expect(s).toBeDefined()
    expect(s!.name).toBe("Hello World")
    expect(s!.category).toBe("code-generation")
    expect(s!.difficulty).toBe("easy")
  })

  it("should find full suite with all scenarios", () => {
    const suite = getSuite("full")
    expect(suite).toBeDefined()
    expect(suite!.scenarios.length).toBe(8)
  })

  it("should filter scenarios by difficulty", () => {
    const easy = listScenarios({ difficulty: "easy" })
    expect(easy.length).toBe(3) // hello-world, fix-syntax-error, refactor-to-arrow
  })

  it("should filter scenarios by category", () => {
    const debugging = listScenarios({ category: "debugging" })
    expect(debugging.length).toBe(1)
    expect(debugging[0].id).toBe("debug-memory-leak")
  })
})

// ---------------------------------------------------------------------------
// Auto-evaluation logic (test the concept independently)
// ---------------------------------------------------------------------------

describe("auto-evaluation concept", () => {
  it("should detect required keywords in output", () => {
    const scenario = getScenario("hello-world")!
    const output = "Created file hello_eval.py with Hello, Eval Framework!"
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredKeywords).toBeDefined()
    // Check at least one keyword is found
    const found = behavior.requiredKeywords!.filter((kw) =>
      output.toLowerCase().includes(kw.toLowerCase()),
    )
    expect(found.length).toBeGreaterThan(0)
  })

  it("should fail when keywords are missing from output", () => {
    const scenario = getScenario("hello-world")!
    const output = "Some irrelevant output"
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredKeywords).toBeDefined()
    const found = behavior.requiredKeywords!.filter((kw) =>
      output.toLowerCase().includes(kw.toLowerCase()),
    )
    expect(found.length).toBe(0)
  })

  it("should detect required actions in tool calls", () => {
    const scenario = getScenario("hello-world")!
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.requiredActions).toBeDefined()
    const toolCalls = ["write", "read"]
    const actionsFound = behavior.requiredActions!.filter((a) =>
      toolCalls.some((t) => t.includes(a)),
    )
    expect(actionsFound.length).toBeGreaterThan(0)
  })

  it("should detect anti-patterns in output", () => {
    const scenario = getScenario("code-review-simple")!
    const behavior = scenario.expectedBehaviors[0]
    expect(behavior.antiPatterns).toBeDefined()
    const output = "This code looks fine to me, no issues"
    const found = behavior.antiPatterns!.filter((ap) =>
      output.toLowerCase().includes(ap.toLowerCase()),
    )
    expect(found.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Functional validation
// ---------------------------------------------------------------------------

describe("functional validation", () => {
  let tmpDir: string

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "eval-test-"))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should pass a valid shell command", () => {
    const result = validate(`node -e "process.exit(0)"`)
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it("should fail a shell command that exits non-zero", () => {
    const result = validate(`node -e "process.exit(1)"`)
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(1)
  })

  it("should capture stdout from a passing command", () => {
    const result = validate(`node -e "console.log('hello')"`)
    expect(result.passed).toBe(true)
    expect(result.stdout).toContain("hello")
  })

  it("should pass when a file exists (validation by file existence)", () => {
    const filePath = join(tmpDir, "test_file.txt")
    writeFileSync(filePath, "hello")
    const result = validate(`node -e "require('fs').existsSync('test_file.txt') && process.exit(0) || process.exit(1)"`, tmpDir)
    expect(result.passed).toBe(true)
  })

  it("should fail when a file does not exist", () => {
    const result = validate(`node -e "require('fs').existsSync('nonexistent.txt') && process.exit(0) || process.exit(1)"`, tmpDir)
    expect(result.passed).toBe(false)
  })

  it("should fail for a non-existent command", () => {
    const result = validate("thiscommanddoesnotexist --version")
    expect(result.passed).toBe(false)
  })

  it("should validate a generated JS file compiles without syntax errors", () => {
    const filePath = join(tmpDir, "valid_code.js")
    writeFileSync(filePath, "module.exports = function add(a, b) { return a + b }")
    const cmd = `node -e "try { require('./valid_code.js') } catch(e) { process.exit(1) }"`
    const result = validate(cmd, tmpDir)
    expect(result.passed).toBe(true)
  })

  it("should fail for JS file with syntax errors", () => {
    const filePath = join(tmpDir, "broken_code.js")
    writeFileSync(filePath, "function broken( { return 1 }")  // syntax error
    const cmd = `node -e "try { require('./broken_code.js') } catch(e) { process.exit(1) }"`
    const result = validate(cmd, tmpDir)
    expect(result.passed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// evaluateBehavior — validation vs keyword fallback
// ---------------------------------------------------------------------------

describe("evaluateBehavior", () => {
  it("should use validation command when cwd is provided", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "eval-behavior-"))
    try {
      writeFileSync(join(tmpDir, "test.txt"), "hello")
      const behavior = {
        description: "File exists",
        requiredKeywords: ["test.txt"],
        validationCommand: `node -e "require('fs').existsSync('test.txt') && process.exit(0) || process.exit(1)"`,
      }
      // With cwd — runs the validation command
      expect(evaluateBehavior(behavior, "some output mentioning test.txt", [], tmpDir)).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("should fall back to keyword matching when no validation command", () => {
    const behavior = {
      description: "Has greeting",
      requiredKeywords: ["hello"],
    }
    expect(evaluateBehavior(behavior, "The output says hello world", [], undefined)).toBe(true)
    expect(evaluateBehavior(behavior, "Nothing relevant", [], undefined)).toBe(false)
  })

  it("should fall back to keyword matching when validationCommand exists but no cwd", () => {
    const behavior = {
      description: "File exists",
      requiredKeywords: ["test.txt"],
      validationCommand: `node -e "require('fs').existsSync('test.txt') && process.exit(0) || process.exit(1)"`,
    }
    // No cwd — falls back to keyword matching
    expect(evaluateBehavior(behavior, "hello test.txt world", [], undefined)).toBe(true)
  })

  it("should use anti-patterns in fallback mode", () => {
    const behavior = {
      description: "No error keywords",
      requiredKeywords: ["result"],
      antiPatterns: ["error"],
    }
    expect(evaluateBehavior(behavior, "Here is the result", [], undefined)).toBe(true)
    expect(evaluateBehavior(behavior, "Here is the error result", [], undefined)).toBe(false)
  })

  it("should use requiredActions in fallback mode", () => {
    const behavior = {
      description: "Must write file",
      requiredActions: ["write"],
    }
    expect(evaluateBehavior(behavior, "some output", ["write", "read"], undefined)).toBe(true)
    expect(evaluateBehavior(behavior, "some output", ["read"], undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// autoEvaluate — integration with functional validation
// ---------------------------------------------------------------------------

describe("autoEvaluate with functional validation", () => {
  it("should use validation commands on code-generation scenarios with cwd", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "eval-auto-"))
    try {
      const scenario = getScenario("hello-world")!
      // Simulate: agent wrote the file
      writeFileSync(join(tmpDir, "hello_eval.py"), `print("Hello, Eval Framework!")`)

      const result = autoEvaluate(
        scenario,
        "Created hello_eval.py with greeting",
        ["write"],
        tmpDir,
      )
      // Both behaviors have validationCommand and file exists → both should pass
      expect(result.matched).toBe(result.total)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("should fall back to keyword matching when no cwd provided", () => {
    const scenario = getScenario("hello-world")!
    const result = autoEvaluate(
      scenario,
      "Created hello_eval.py with Hello, Eval Framework!",
      ["write"],
      // no cwd → keyword matching
    )
    expect(result.matched).toBeGreaterThan(0)
  })

  it("should fail validation when required file is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "eval-missing-"))
    try {
      const scenario = getScenario("hello-world")!
      // No file created — validation should fail
      const result = autoEvaluate(
        scenario,
        "Created hello_eval.py",
        ["write"],
        tmpDir,
      )
      // First behavior validates file existence → fails
      // Second behavior validates file content → also fails
      expect(result.matched).toBe(0)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("should validate code-review scenarios with keyword matching only", () => {
    const scenario = getScenario("code-review-simple")!
    const result = autoEvaluate(
      scenario,
      "This code has an SQL injection vulnerability. Use parameterized queries with placeholders like $1.",
      ["read"],
    )
    expect(result.matched).toBe(result.total)
  })

  it("should validate api-design scenarios with keyword matching only", () => {
    const scenario = getScenario("design-api-endpoint")!
    const result = autoEvaluate(
      scenario,
      "POST /api/users with email, name, password. Returns 201. Errors: 401, 409, 422. Auth: Bearer JWT token.",
      [],
    )
    expect(result.matched).toBe(result.total)
  })
})

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe("Scenario metrics", () => {
  it("should correctly compute pass rate from results", () => {
    const results = [
      { success: true, durationMs: 100, tokensUsed: 100, toolCalls: 2, errors: [] },
      { success: true, durationMs: 200, tokensUsed: 200, toolCalls: 3, errors: [] },
      { success: false, durationMs: 300, tokensUsed: 300, toolCalls: 1, errors: ["error"] },
    ]
    const passed = results.filter((r) => r.success).length
    const passRate = passed / results.length
    expect(passRate).toBe(2 / 3)
    expect(passed).toBe(2)
  })

  it("should compute average metrics", () => {
    const durations = [100, 200, 300]
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length
    expect(avg).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Sandbox isolation
// ---------------------------------------------------------------------------

describe("Sandbox isolation", () => {
  /** Helper: minimal ScenarioResult for sandbox tests. */
  function testResult(): import("./scenario").ScenarioResult {
    const now = Date.now()
    return {
      scenarioId: "sandbox-test",
      scenarioName: "Sandbox Test",
      success: true,
      durationMs: 0,
      tokensUsed: 0,
      toolCalls: 0,
      errors: [],
      behaviorsMatched: 0,
      behaviorsTotal: 0,
      output: "",
      startedAt: now,
      completedAt: now,
    }
  }

  test("sandbox creates temp directory", async () => {
    let capturedDir = ""
    await Effect.runPromise(
      createSandbox(
        (dir) => {
          capturedDir = dir
          return Effect.succeed(testResult())
        },
        { cleanup: false },
      ),
    )
    expect(capturedDir).toContain("opencode-eval-")
    expect(existsSync(capturedDir)).toBe(true)
    // Manual cleanup since we set cleanup: false
    rmSync(capturedDir, { recursive: true, force: true })
  })

  test("sandbox cleans up after completion", async () => {
    let capturedDir = ""
    await Effect.runPromise(
      createSandbox((dir) => {
        capturedDir = dir
        return Effect.succeed(testResult())
      }),
      // cleanup: true by default
    )
    expect(capturedDir).toBeTruthy()
    expect(existsSync(capturedDir)).toBe(false)
  })

  test("sandbox creates setupFiles in isolated directory", async () => {
    const setupFiles: import("./scenario").EvalScenario["setupFiles"] = [
      { path: "hello.txt", content: "world" },
      { path: "nested/config.json", content: '{"key": "value"}' },
    ]

    let sandboxDir = ""
    await Effect.runPromise(
      createSandbox(
        (dir) =>
          Effect.gen(function* () {
            sandboxDir = dir
            // Write setup files into the sandbox dir
            for (const file of setupFiles) {
              const filePath = join(dir, file.path)
              const parentDir = dirname(filePath)
              if (parentDir !== dir) {
                mkdirSync(parentDir, { recursive: true })
              }
              writeFileSync(filePath, file.content)
            }
            return testResult()
          }),
        { cleanup: false },
      ),
    )

    // Verify files were created in the sandbox dir
    expect(sandboxDir).toContain("opencode-eval-")
    expect(existsSync(join(sandboxDir, "hello.txt"))).toBe(true)
    expect(readFileSync(join(sandboxDir, "hello.txt"), "utf-8")).toBe("world")
    expect(existsSync(join(sandboxDir, "nested/config.json"))).toBe(true)
    expect(readFileSync(join(sandboxDir, "nested/config.json"), "utf-8")).toBe('{"key": "value"}')

    // Verify isolation by checking a file that shouldn't exist
    expect(existsSync(join(sandboxDir, "nonexistent.txt"))).toBe(false)

    // Cleanup
    rmSync(sandboxDir, { recursive: true, force: true })
  })

  test("executeScenarioInSandbox runs scenario and cleans up", async () => {
    const result = await Effect.runPromise(
      executeScenarioInSandbox(getScenario("hello-world")!, { mode: "auto" }),
    )
    expect(result.scenarioId).toBe("hello-world")
    expect(result.success).toBe(true)
    expect(result.scenarioName).toBe("Hello World")
  })
})

// ---------------------------------------------------------------------------
// Real runner opt-in
// ---------------------------------------------------------------------------

describe("real runner", () => {
  test("runs a scenario in a sandbox and evaluates validation commands against real files", async () => {
    const executor: RealScenarioExecutor = ({ cwd }) =>
      Effect.sync(() => {
        writeFileSync(join(cwd, "hello_eval.py"), `print("Hello, Eval Framework!")`)
        return {
          output: "Created hello_eval.py with Hello, Eval Framework!",
          toolCalls: ["write"],
          tokensUsed: 42,
          errors: [],
        }
      })

    const result = await Effect.runPromise(runScenarioReal(getScenario("hello-world")!, executor))

    expect(result.success).toBe(true)
    expect(result.behaviorsMatched).toBe(result.behaviorsTotal)
    expect(result.toolCalls).toBe(1)
    expect(result.tokensUsed).toBe(42)
    expect(result.output).toContain("[Real]")
  })

  test("fails when the real executor does not satisfy functional validation", async () => {
    const executor: RealScenarioExecutor = () =>
      Effect.succeed({
        output: "Claimed hello_eval.py was created",
        toolCalls: ["write"],
        tokensUsed: 1,
        errors: [],
      })

    const result = await Effect.runPromise(runScenarioReal(getScenario("hello-world")!, executor))

    expect(result.success).toBe(false)
    expect(result.behaviorsMatched).toBe(0)
  })

  test("commandExecutor runs a real command in the sandbox", async () => {
    const result = await Effect.runPromise(
      runScenarioReal(
        getScenario("hello-world")!,
        commandExecutor(`node -e "require('fs').writeFileSync('hello_eval.py', 'print(\\\"Hello, Eval Framework!\\\")')"`),
      ),
    )

    expect(result.success).toBe(true)
    expect(result.toolCalls).toBe(1)
    expect(result.output).toContain("command")
  })
})

console.log("✅ Eval tests ready!")
