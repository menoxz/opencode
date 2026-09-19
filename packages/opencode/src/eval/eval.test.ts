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
  UNVERIFIED_PREFIX,
  type EvalScenario,
  type ScenarioResult,
} from "./scenario"
import {
  autoEvaluate,
  validate,
  evaluateBehavior,
  gradeBehavior,
  scenarioVerdict,
  simulateScenario,
  executeScenarioInSandbox,
  verifiedPassRate,
  compareReportToBaseline,
  verdictFromValidation,
  isExecutionRefusal,
  type EvalBaseline,
} from "./index"
import type { EvalRunReport } from "./metrics"
import { commandExecutor, diffToolCalls, headlessSessionArgs, headlessSessionCommand, isTransientExecutionError, nativeEvalEnvironment, runScenarioReal, type RealScenarioExecutor } from "./real-runner"
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
// Validation refusal — an unrunnable command is no verdict on the artifact
// ---------------------------------------------------------------------------

describe("a refused validation command is unverified, never a failure", () => {
  it("reports an unrunnable command as unverified", () => {
    // Reproduces the 2026-09-19 sanity incident: a Windows child-start refusal
    // (uv_spawn EPERM / ACCESS_DENIED) left a validation command unrunnable, and
    // the refusal was scored as a failed behavior, forging a regression.
    expect(
      verdictFromValidation({ passed: false, stdout: "", stderr: "", exitCode: null, executed: false }),
    ).toBe("unverified")
    expect(
      verdictFromValidation({ passed: false, stdout: "", stderr: "", exitCode: 5, executed: false }),
    ).toBe("unverified")
  })

  it("still fails a command that actually ran and exited non-zero", () => {
    expect(
      verdictFromValidation({ passed: false, stdout: "", stderr: "boom", exitCode: 1, executed: true }),
    ).toBe("fail")
    expect(
      verdictFromValidation({ passed: true, stdout: "ok", stderr: "", exitCode: 0, executed: true }),
    ).toBe("pass")
  })

  it("marks a real exit code as an executed verdict", () => {
    expect(validate(`node -e "process.exit(0)"`).executed).toBe(true)
    expect(validate(`node -e "process.exit(1)"`).executed).toBe(true)
  })

  it("treats the Windows shell 'access denied' errorlevel as a refusal, not a failure", () => {
    // Observed on 2026-09-19: `cmd.exe` returns errorlevel 1 with its own localized
    // "Accès refusé." text when the OS denies the child start; the target never ran.
    expect(
      isExecutionRefusal({ passed: false, stdout: "", stderr: "Accès refusé.\r\n", exitCode: 1, executed: false }),
    ).toBe(true)
    expect(
      isExecutionRefusal({ passed: false, stdout: "", stderr: "Access is denied.\r\n", exitCode: 1, executed: false }),
    ).toBe(true)
  })

  it("keeps a program's own non-zero verdict when it produced output", () => {
    expect(
      isExecutionRefusal({
        passed: false,
        stdout: "some output",
        stderr: "Access is denied.",
        exitCode: 1,
        executed: true,
      }),
    ).toBe(false)
    expect(
      isExecutionRefusal({
        passed: false,
        stdout: "",
        stderr: "SyntaxError: Unexpected token",
        exitCode: 1,
        executed: true,
      }),
    ).toBe(false)
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

  it("reports unverified — never a pass — when validationCommand exists but cannot run", () => {
    const behavior = {
      description: "File exists",
      requiredKeywords: ["test.txt"],
      validationCommand: `node -e "require('fs').existsSync('test.txt') && process.exit(0) || process.exit(1)"`,
    }
    // No cwd: the functional contract was never executed. Grading on the prose
    // instead would let an agent pass by merely naming the file it never wrote.
    expect(gradeBehavior(behavior, "hello test.txt world", [], undefined)).toBe("unverified")
    expect(evaluateBehavior(behavior, "hello test.txt world", [], undefined)).toBe(false)
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

  it("matches requiredActions write from a modify diff", () => {
    const calls = ["modify:fixed.js", "write:fixed.js"]
    const behavior = {
      description: "Must write file",
      requiredActions: ["write"],
    }
    expect(evaluateBehavior(behavior, "out", calls, undefined)).toBe(true)
    expect(evaluateBehavior(behavior, "out", ["delete:x.js"], undefined)).toBe(false)
  })

  it("maps the headless status diff schema to a write action", () => {
    expect(diffToolCalls({ file: "fixed_calculate.js", status: "added" })).toEqual([
      "added:fixed_calculate.js",
      "write:fixed_calculate.js",
    ])
    expect(diffToolCalls({ file: "old.js", status: "deleted" })).toEqual(["deleted:old.js"])
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

  it("counts behaviors as unverified — not matched — when no cwd is provided", () => {
    const scenario = getScenario("hello-world")!
    const result = autoEvaluate(
      scenario,
      "Created hello_eval.py with Hello, Eval Framework!",
      ["write"],
      // no cwd → both behaviors declare a validationCommand that cannot run
    )
    expect(result.unverified).toBe(result.total)
    expect(result.matched).toBe(0)
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
      verdict: "pass",
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
    // No agent runs inside a simulated sandbox, so nothing is verified.
    expect(result.success).toBe(false)
    expect(result.verdict).toBe("unverified")
    expect(result.scenarioName).toBe("Hello World")
  })
})

// ---------------------------------------------------------------------------
// Real runner opt-in
// ---------------------------------------------------------------------------

describe("real runner", () => {
  test("uses the bounded eval agent for native headless sessions", () => {
    expect(headlessSessionArgs("do one thing")).toEqual([
      "run",
      "--headless",
      "--dangerously-skip-permissions",
      "--agent",
      "eval-runner",
      "do one thing",
    ])
  })

  test("uses the current Bun source entry instead of a stale installed binary", () => {
    const argv = [...process.argv]
    try {
      process.argv[0] = process.execPath
      process.argv[1] = join(import.meta.dir, "..", "index.ts")
      const command = headlessSessionCommand("do one thing")
      expect(command.binary).toBe(process.execPath)
      expect(command.args[0]).toEndWith("src\\index.ts")
      expect(command.args.slice(1)).toEqual(headlessSessionArgs("do one thing"))
    } finally {
      process.argv.splice(0, process.argv.length, ...argv)
    }
  })

  test("marks native eval children so project lifecycle instructions are skipped", () => {
    expect(nativeEvalEnvironment({ TEST_VALUE: "kept" })).toMatchObject({
      TEST_VALUE: "kept",
      OPENCODE_DAEMON_AUTO: "1",
      OPENCODE_NATIVE_EVAL: "1",
    })
  })

  test("validates both arrow syntax and preserved logic against the artifact", async () => {
    const executor: RealScenarioExecutor = ({ cwd }) =>
      Effect.sync(() => {
        writeFileSync(join(cwd, "arrow_refactored.js"), "const add = (a,b) => a+b\nconst multiply = (a,b) => a*b\nconst result = add(2,3)\n")
        return { output: "created", toolCalls: ["write:arrow_refactored.js"], errors: [] }
      })
    const result = await Effect.runPromise(runScenarioReal(getScenario("refactor-to-arrow")!, executor))
    expect(result.success).toBe(true)
    expect(result.behaviorsMatched).toBe(2)
  })

  test("accepts arrow refactors bound through globalThis/member targets (regression)", async () => {
    const executor: RealScenarioExecutor = ({ cwd }) =>
      Effect.sync(() => {
        writeFileSync(
          join(cwd, "arrow_refactored.js"),
          [
            "globalThis.add = (a, b) => a + b",
            "globalThis.multiply = (a, b) => a * b",
            "globalThis.result = globalThis.add(2, 3)",
            "if (typeof module !== 'undefined' && module.exports) {",
            "  module.exports = { add: globalThis.add, multiply: globalThis.multiply, result: globalThis.result }",
            "}",
            "",
          ].join("\n"),
        )
        return { output: "created", toolCalls: ["write:arrow_refactored.js"], errors: [] }
      })
    const result = await Effect.runPromise(runScenarioReal(getScenario("refactor-to-arrow")!, executor))
    expect(result.success).toBe(true)
    expect(result.behaviorsMatched).toBe(2)
  })

  test("still rejects refactors that keep a traditional function declaration", async () => {
    const executor: RealScenarioExecutor = ({ cwd }) =>
      Effect.sync(() => {
        writeFileSync(
          join(cwd, "arrow_refactored.js"),
          "const add = (a, b) => a + b\nfunction multiply(a, b) { return a * b }\nconst result = add(2, 3)\n",
        )
        return { output: "created", toolCalls: ["write:arrow_refactored.js"], errors: [] }
      })
    const result = await Effect.runPromise(runScenarioReal(getScenario("refactor-to-arrow")!, executor))
    expect(result.success).toBe(false)
    expect(result.behaviorsMatched).toBe(1)
  })

  test("grades fix-syntax-error from the artifact when the headless diff summary is empty (regression)", async () => {
    // 2026-09-19 sanity incident: the headless_result carried
    // { files: 0, diffs: [] } for a write that did happen, so the write-action
    // behavior failed and the scenario read as a regression even though
    // fixed_calculate.js was a valid fix on disk. The scenario now grades both
    // behaviors against the real file, so an unrecorded diff cannot forge one.
    const fixed = [
      "function calculateTotal(items) {",
      "  let sum = 0",
      "  for (let i = 0; i < items.length; i++) {",
      "    sum += items[i].price",
      "  }",
      "  return sum",
      "}",
      "module.exports = { calculateTotal }",
      "",
    ].join("\n")
    const executor: RealScenarioExecutor = ({ cwd }) =>
      Effect.sync(() => {
        writeFileSync(join(cwd, "fixed_calculate.js"), fixed)
        // The diff summary reported nothing even though the file was written.
        return { output: "fixed and saved to fixed_calculate.js", toolCalls: [], errors: [] }
      })

    const result = await Effect.runPromise(runScenarioReal(getScenario("fix-syntax-error")!, executor))

    expect(result.verdict).toBe("pass")
    expect(result.behaviorsMatched).toBe(2)
  })

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

  test("classifies spawn/socket failures as transient but a grading failure as permanent", () => {
    expect(isTransientExecutionError(["spawnSync C:\\Users\\x\\opencodev2.exe ETIMEDOUT"])).toBe(true)
    expect(isTransientExecutionError(["socket hang up"])).toBe(true)
    expect(isTransientExecutionError(["headless exited null (no headless_result)"])).toBe(false)
    expect(isTransientExecutionError([])).toBe(false)
  })

  test("classifies an OS spawn refusal as transient, never a capability failure", () => {
    // Observed on this host during the 2026-09-19 eval windows: the OS refused to
    // create children (`EPERM: operation not permitted, uv_spawn '…\\cmd.exe'`,
    // `cannot spawn git: Permission denied`, `error launching git: Accès refusé`).
    // The child never ran, so it carries no verdict on the agent.
    expect(isTransientExecutionError(["spawnSync C:\\WINDOWS\\system32\\cmd.exe EPERM"])).toBe(true)
    expect(isTransientExecutionError(["spawnSync C:\\Users\\x\\opencodev2.exe EACCES"])).toBe(true)
    expect(isTransientExecutionError(["error launching git: Accès refusé."])).toBe(true)
    expect(isTransientExecutionError(["cannot spawn git: Permission denied"])).toBe(true)
    // The deliberate bare-null exclusion still holds when no refusal signature is present.
    expect(isTransientExecutionError(["headless exited null (no headless_result)"])).toBe(false)
  })

  test("reports a harness-level spawn refusal as unverified so it cannot raise a regression", async () => {
    // The OS refused to create the headless child itself, not merely a validation
    // command: 0 tool calls, no agent verdict. Scored as a failure this manufactures
    // a phantom 1.0 -> 0.333 regression instead of leaving the run unverified.
    const executor: RealScenarioExecutor = () =>
      Effect.succeed({
        output: "",
        toolCalls: [],
        errors: [
          "spawnSync C:\\WINDOWS\\system32\\cmd.exe EPERM",
          "headless exited null (no headless_result)",
        ],
      })

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retries: 0 }),
    )

    expect(result.success).toBe(false)
    expect(result.verdict).toBe("unverified")
    expect(result.toolCalls).toBe(0)
    expect(result.errors.some((e) => e.startsWith(UNVERIFIED_PREFIX))).toBe(true)
  })

  test("retries a transient headless timeout once, in a fresh sandbox", async () => {
    const sandboxes: string[] = []
    let calls = 0
    const executor: RealScenarioExecutor = ({ cwd }) => {
      calls += 1
      sandboxes.push(cwd)
      // First attempt reproduces the daemon incident: the headless child is killed
      // by the spawn budget before it writes anything.
      if (calls === 1) {
        return Effect.succeed({
          output: "",
          toolCalls: [],
          errors: ["spawnSync C:\\Users\\x\\opencodev2.exe ETIMEDOUT", "headless exited null (no headless_result)"],
        })
      }
      writeFileSync(join(cwd, "hello_eval.py"), `print("Hello, Eval Framework!")`)
      return Effect.succeed({ output: "created", toolCalls: ["write:hello_eval.py"], errors: [] })
    }

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retries: 1, retryDelayMs: 1 }),
    )

    expect(calls).toBe(2)
    expect(new Set(sandboxes).size).toBe(2)
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("does not retry a genuine grading failure", async () => {
    let calls = 0
    const executor: RealScenarioExecutor = () => {
      calls += 1
      return Effect.succeed({ output: "claimed hello_eval.py was created", toolCalls: ["write"], errors: [] })
    }

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retryDelayMs: 1 }),
    )

    expect(calls).toBe(1)
    expect(result.success).toBe(false)
  })

  test("stops after the bounded retry budget when the failure stays transient", async () => {
    let calls = 0
    const executor: RealScenarioExecutor = () => {
      calls += 1
      return Effect.succeed({ output: "", toolCalls: [], errors: ["spawnSync x ETIMEDOUT"] })
    }

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retries: 1, retryDelayMs: 1 }),
    )

    expect(calls).toBe(2)
    expect(result.success).toBe(false)
    expect(result.errors.join(" ")).toContain("ETIMEDOUT")
  })

  test("reports an unexecuted transient failure as unverified so it cannot raise a regression", async () => {
    // Reproduces the 2026-09-12 sanity incident: the provider was unreachable,
    // the headless child was killed by the spawn budget before its first tool
    // call, and every scenario was scored 0/2 — a phantom 1.0 -> 0.0 regression.
    // A run that verified nothing must be "unverified", never "fail".
    const executor: RealScenarioExecutor = () =>
      Effect.succeed({
        output: "",
        toolCalls: [],
        errors: [
          "spawnSync C:\\Users\\x\\opencodev2.exe ETIMEDOUT",
          "headless exited null (no headless_result)",
        ],
      })

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retries: 0 }),
    )

    expect(result.success).toBe(false)
    expect(result.verdict).toBe("unverified")
    expect(result.toolCalls).toBe(0)
    expect(result.errors.some((e) => e.startsWith(UNVERIFIED_PREFIX))).toBe(true)
    expect(result.errors.join(" ")).toContain("ETIMEDOUT")
  })

  test("keeps a transient failure that made tool calls as a real failure", async () => {
    // The agent got far enough to act, so the timeout is a verdict on the run,
    // not an environmental non-result: it must stay a failure and not be masked.
    const executor: RealScenarioExecutor = () =>
      Effect.succeed({
        output: "wrote a partial file",
        toolCalls: ["write:hello_eval.py"],
        errors: ["spawnSync x ETIMEDOUT"],
      })

    const result = await Effect.runPromise(
      runScenarioReal(getScenario("hello-world")!, executor, { retries: 0 }),
    )

    expect(result.success).toBe(false)
    expect(result.verdict).toBe("fail")
    expect(result.errors.join(" ")).not.toContain(UNVERIFIED_PREFIX)
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

// ---------------------------------------------------------------------------
// Harness self-check — can this harness actually go red?
//
// A test suite that cannot fail is worse than no suite: it manufactures
// confidence. These tests are mutation tests aimed at the harness itself. They
// assert that an agent which does nothing, or a run which verifies nothing, is
// never reported as a success.
// ---------------------------------------------------------------------------

describe("harness self-check", () => {
  const simOpts = { mode: "auto", failFast: false, record: false } as const

  test("simulation never reports success for any built-in scenario", () => {
    for (const scenario of Object.values(ALL_SCENARIOS)) {
      const result = simulateScenario(scenario, simOpts)
      expect(result.success).toBe(false)
      expect(result.verdict).toBe("unverified")
      expect(result.errors.join(" ")).toContain("UNVERIFIED:")
    }
  })

  test("simulation does not fabricate tool calls from the scenario's own expectations", () => {
    // The regression this guards: seeding toolCalls with every requiredAction
    // made each action assertion true by construction.
    const withActions = Object.values(ALL_SCENARIOS).filter((s) =>
      s.expectedBehaviors.some((b) => (b.requiredActions?.length ?? 0) > 0),
    )
    expect(withActions.length).toBeGreaterThan(0)
    for (const scenario of withActions) {
      const result = simulateScenario(scenario, simOpts)
      expect(result.toolCalls).toBe(0)
      expect(result.behaviorsMatched).toBe(0)
    }
  })

  test("the default sanity suite cannot be green without running an agent", () => {
    const suite = getSuite("sanity")!
    const results = suite.scenarios.map((s) => simulateScenario(s, simOpts))
    expect(results.length).toBeGreaterThan(0)
    expect(results.filter((r) => r.success)).toHaveLength(0)
  })

  test("an agent that only claims success cannot pass a functionally validated scenario", async () => {
    // Says the right words, reports the right tool call, produces no artifact.
    const liar: RealScenarioExecutor = () =>
      Effect.succeed({
        output: "Created hello_eval.py containing Hello, Eval Framework!",
        toolCalls: ["write"],
        errors: [],
      })

    const result = await Effect.runPromise(runScenarioReal(getScenario("hello-world")!, liar))

    expect(result.success).toBe(false)
    expect(result.verdict).toBe("fail")
  })

  test("no built-in scenario can be passed by an agent that does nothing at all", async () => {
    const noop: RealScenarioExecutor = () =>
      Effect.succeed({ output: "", toolCalls: [], errors: [] })

    for (const scenario of Object.values(ALL_SCENARIOS)) {
      const result = await Effect.runPromise(runScenarioReal(scenario, noop))
      expect(result.success).toBe(false)
    }
  }, 60_000)

  test("half the expectations passing is a failure, not a success", () => {
    // Guards the removed `matched >= ceil(total / 2)` threshold.
    expect(scenarioVerdict({ matched: 2, total: 4, unverified: 0 }, [])).toBe("fail")
    expect(scenarioVerdict({ matched: 3, total: 4, unverified: 0 }, [])).toBe("fail")
    expect(scenarioVerdict({ matched: 4, total: 4, unverified: 0 }, [])).toBe("pass")
  })

  test("an unchecked expectation blocks a pass", () => {
    expect(scenarioVerdict({ matched: 3, total: 4, unverified: 1 }, [])).toBe("unverified")
    expect(scenarioVerdict({ matched: 4, total: 4, unverified: 0 }, ["boom"])).toBe("fail")
  })

  test("an empty contract cannot be passed", () => {
    expect(scenarioVerdict({ matched: 0, total: 0, unverified: 0 }, [])).toBe("unverified")
  })

  test("a validation command that actually runs still decides pass and fail", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "eval-selfcheck-"))
    try {
      const behavior = {
        description: "File exists",
        validationCommand: `node -e "require('fs').existsSync('a.txt') && process.exit(0) || process.exit(1)"`,
      }
      expect(gradeBehavior(behavior, "", [], tmpDir)).toBe("fail")
      writeFileSync(join(tmpDir, "a.txt"), "x")
      expect(gradeBehavior(behavior, "", [], tmpDir)).toBe("pass")
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe("baseline comparison is blind to unverified scenarios", () => {
  const makeScenario = (
    id: string,
    verdict: "pass" | "fail" | "unverified",
    durationMs = 1_000,
  ): ScenarioResult => ({
    scenarioId: id,
    scenarioName: id,
    success: verdict === "pass",
    verdict,
    durationMs,
    tokensUsed: 0,
    toolCalls: 0,
    errors: verdict === "unverified" ? [`${UNVERIFIED_PREFIX} execution failed before producing any agent verdict`] : [],
    behaviorsMatched: verdict === "pass" ? 2 : 0,
    behaviorsTotal: 2,
    output: "",
    startedAt: 0,
    completedAt: durationMs,
  })

  const makeReport = (scenarios: ScenarioResult[]): EvalRunReport => ({
    runId: "run-current",
    suiteId: "sanity",
    suiteName: "Sanity",
    timestamp: 2,
    durationMs: scenarios.reduce((n, s) => n + s.durationMs, 0),
    totalScenarios: scenarios.length,
    passed: scenarios.filter((s) => s.success).length,
    failed: scenarios.filter((s) => !s.success).length,
    passRate: scenarios.filter((s) => s.success).length / scenarios.length,
    avgDurationPerScenario: scenarios.reduce((n, s) => n + s.durationMs, 0) / scenarios.length,
    totalTokensUsed: 0,
    totalToolCalls: 0,
    scenarios,
    metrics: [],
  })

  const baseline: EvalBaseline = {
    suiteId: "sanity",
    passRate: 1,
    avgDurationMs: 1_000,
    runCount: 5,
    scenarioResults: {
      "hello-world": { passRate: 1, avgDurationMs: 1_000 },
      "fix-syntax-error": { passRate: 1, avgDurationMs: 1_000 },
      "refactor-to-arrow": { passRate: 1, avgDurationMs: 1_000 },
    },
  }

  test("a transiently unverified scenario is neutral, not a new failure", () => {
    // Reproduces eval-1789292542212-ev7a44: two verified passes, one headless
    // timeout that never produced a verdict.
    const cmp = compareReportToBaseline(
      makeReport([
        makeScenario("hello-world", "pass"),
        makeScenario("fix-syntax-error", "pass"),
        makeScenario("refactor-to-arrow", "unverified", 180_000),
      ]),
      baseline,
    )

    expect(cmp).not.toBeNull()
    expect(cmp!.details.newFailures).toEqual([])
    expect(cmp!.details.passRateRegression).toBe(false)
    expect(cmp!.details.behaviorRegression).toBe(false)
    expect(cmp!.major).toBe(false)
    expect(cmp!.passRate.current).toBe(1)
  })

  test("a genuine failure still raises a major regression", () => {
    const cmp = compareReportToBaseline(
      makeReport([
        makeScenario("hello-world", "pass"),
        makeScenario("fix-syntax-error", "pass"),
        makeScenario("refactor-to-arrow", "fail"),
      ]),
      baseline,
    )

    expect(cmp).not.toBeNull()
    expect(cmp!.details.newFailures).toEqual(["refactor-to-arrow"])
    expect(cmp!.severity).toBe("major")
    expect(cmp!.major).toBe(true)
  })

  test("a run that verified nothing yields no comparison", () => {
    const cmp = compareReportToBaseline(
      makeReport([
        makeScenario("hello-world", "unverified"),
        makeScenario("fix-syntax-error", "unverified"),
        makeScenario("refactor-to-arrow", "unverified"),
      ]),
      baseline,
    )

    expect(cmp).toBeNull()
  })

  test("verifiedPassRate excludes unverified scenarios from both counts", () => {
    expect(verifiedPassRate([makeScenario("a", "pass"), makeScenario("b", "unverified")])).toBe(1)
    expect(verifiedPassRate([makeScenario("a", "pass"), makeScenario("b", "fail")])).toBe(0.5)
    expect(verifiedPassRate([makeScenario("a", "unverified")])).toBeNull()
  })
})

console.log("✅ Eval tests ready!")
