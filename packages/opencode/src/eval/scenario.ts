/**
 * Eval Scenario — test scenario definitions for benchmarking agent capabilities.
 *
 * Each scenario describes a task that the agent should be able to complete,
 * with expected behaviors and difficulty ratings.
 *
 * @module eval/scenario
 */

import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "eval.scenario" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Difficulty level for a scenario. */
export type Difficulty = "easy" | "medium" | "hard" | "expert"

/** Task domain / category. */
export type ScenarioCategory =
  | "code-generation"
  | "bug-fixing"
  | "refactoring"
  | "code-review"
  | "testing"
  | "architecture"
  | "research"
  | "debugging"
  | "documentation"
  | "general"

/** Expected behavior criteria for evaluating success. */
export interface ExpectedBehavior {
  /** Description of what should happen. */
  description: string
  /** Keywords that should appear in the agent's output. */
  requiredKeywords?: string[]
  /** Actions the agent must take (e.g. tool names it must call). */
  requiredActions?: string[]
  /** Patterns that indicate failure if present. */
  antiPatterns?: string[]
  /**
   * Optional shell command that functionally validates this behavior.
   * Runs via `child_process.execSync`. Exit code 0 = pass, non-zero = fail.
   * When set, `autoEvaluate` runs this command instead of keyword matching.
   */
  validationCommand?: string
}

/** A single eval scenario definition. */
export interface EvalScenario {
  /** Unique identifier. */
  id: string
  /** Human-readable title. */
  name: string
  /** Short description of the task. */
  description: string
  /** The actual task prompt to send to the agent. */
  taskPrompt: string
  /** Expected behaviors for success evaluation. */
  expectedBehaviors: ExpectedBehavior[]
  /** Task category. */
  category: ScenarioCategory
  /** Difficulty level. */
  difficulty: Difficulty
  /** Tags for filtering / grouping. */
  tags: string[]
  /** Timeout in seconds before the scenario is considered failed. */
  timeoutSeconds: number
  /** Maximum output tokens allowed (0 = unlimited). */
  maxTokens: number
  /** Whether this scenario requires file system access. */
  requiresFiles: boolean
  /** Whether this scenario requires git. */
  requiresGit: boolean
  /** Files that should be created/available for this scenario. */
  setupFiles?: { path: string; content: string }[]
}

/** Outcome of grading one expected behavior, or a whole scenario. */
export type Verdict = "pass" | "fail" | "unverified"

/**
 * Prefix of the error entry emitted when the harness never actually checked
 * anything. Stored inside the persisted `errors` array so a verdict survives a
 * database round-trip without a schema migration.
 */
export const UNVERIFIED_PREFIX = "UNVERIFIED:"

/** Rebuild a verdict from a persisted `success` flag and its error list. */
export function verdictOf(success: boolean, errors: string[]): Verdict {
  if (success) return "pass"
  return errors.some((e) => e.startsWith(UNVERIFIED_PREFIX)) ? "unverified" : "fail"
}

/** Result of executing a single scenario. */
export interface ScenarioResult {
  scenarioId: string
  scenarioName: string
  success: boolean
  /**
   * Why `success` holds that value. `unverified` means the harness checked
   * nothing — a simulated run, or a behavior whose `validationCommand` could not
   * be executed. It must never be reported or read as a pass.
   */
  verdict: Verdict
  durationMs: number
  tokensUsed: number
  toolCalls: number
  errors: string[]
  behaviorsMatched: number
  behaviorsTotal: number
  output: string
  startedAt: number
  completedAt: number
}

/** A suite of scenarios to run together. */
export interface EvalSuite {
  id: string
  name: string
  description: string
  scenarios: EvalScenario[]
}

// ---------------------------------------------------------------------------
// Built-in scenarios
// ---------------------------------------------------------------------------

const helloWorld: EvalScenario = {
  id: "hello-world",
  name: "Hello World",
  description: "Write a simple hello world script in Python",
  taskPrompt: "Write a Python script that prints 'Hello, Eval Framework!' and saves it to hello_eval.py",
  expectedBehaviors: [
    {
      description: "Creates a Python file",
      requiredKeywords: ["hello_eval.py"],
      requiredActions: ["write"],
      antiPatterns: ["error", "fail"],
      validationCommand: `node -e "require('fs').existsSync('hello_eval.py') && process.exit(0) || process.exit(1)"`,
    },
    {
      description: "Output contains the greeting",
      requiredKeywords: ["Hello, Eval Framework!"],
      validationCommand: `node -e "const c = require('fs').readFileSync('hello_eval.py','utf-8'); c.includes('Hello, Eval Framework!') ? process.exit(0) : process.exit(1)"`,
    },
  ],
  category: "code-generation",
  difficulty: "easy",
  tags: ["basic", "python"],
  timeoutSeconds: 180,
  maxTokens: 2000,
  requiresFiles: false,
  requiresGit: false,
}

const fixSyntaxError: EvalScenario = {
  id: "fix-syntax-error",
  name: "Fix Syntax Error",
  description: "Fix a syntax error in JavaScript code",
  taskPrompt: "Fix the syntax error in this JavaScript function:\n\n```js\nfunction calculateTotal(items) {\n  let sum = 0\n  for (let i = 0; i < items.length; i++;) {\n    sum += items[i].price\n  }\n  return sum\n}\n```\n\nSave the fixed version to fixed_calculate.js",
  expectedBehaviors: [
    {
      description: "Fixes the syntax error (remove semicolon after for condition)",
      requiredKeywords: ["fixed_calculate.js"],
      antiPatterns: ["for.*;.*;"],
      validationCommand: `node -e "try { require('./fixed_calculate.js') } catch(e) { process.exit(1) }"`,
    },
    {
      description: "Produces valid JavaScript",
      requiredActions: ["write"],
    },
  ],
  category: "bug-fixing",
  difficulty: "easy",
  tags: ["basic", "javascript", "syntax"],
  timeoutSeconds: 180,
  maxTokens: 2000,
  requiresFiles: false,
  requiresGit: false,
}

const refactorToArrow: EvalScenario = {
  id: "refactor-to-arrow",
  name: "Refactor to Arrow Functions",
  description: "Convert traditional functions to arrow functions in JavaScript",
  taskPrompt: "Convert these traditional JavaScript functions to arrow functions and save to arrow_refactored.js:\n\n```js\nfunction add(a, b) {\n  return a + b\n}\n\nfunction multiply(a, b) {\n  return a * b\n}\n\nconst result = add(2, 3)\n```",
  expectedBehaviors: [
    {
      description: "Uses arrow functions",
      requiredKeywords: ["=>"],
      antiPatterns: ["function add", "function multiply"],
      validationCommand: `node -e "const m = require('./arrow_refactored.js'); typeof m === 'function' ? process.exit(0) : process.exit(1)"`,
    },
    {
      description: "Preserves correct logic",
      requiredKeywords: ["add", "multiply", "result"],
    },
  ],
  category: "refactoring",
  difficulty: "easy",
  tags: ["basic", "javascript", "refactoring"],
  timeoutSeconds: 180,
  maxTokens: 2000,
  requiresFiles: false,
  requiresGit: false,
}

const writeUnitTest: EvalScenario = {
  id: "write-unit-test",
  name: "Write Unit Test",
  description: "Write a unit test for a Python function",
  taskPrompt: "Write a unit test using pytest for the following Python function. Save it to test_calculator.py.\n\n```python\ndef divide(a: float, b: float) -> float:\n    if b == 0:\n        raise ValueError(\"Cannot divide by zero\")\n    return a / b\n```",
  expectedBehaviors: [
    {
      description: "Creates a test file",
      requiredKeywords: ["test_calculator.py", "pytest", "def test_"],
      validationCommand: `node -e "require('fs').existsSync('test_calculator.py') ? process.exit(0) : process.exit(1)"`,
    },
    {
      description: "Tests the divide function",
      requiredKeywords: ["divide", "ValueError"],
      antiPatterns: ["print"],
    },
  ],
  category: "testing",
  difficulty: "medium",
  tags: ["testing", "python", "pytest"],
  timeoutSeconds: 120,
  maxTokens: 3000,
  requiresFiles: false,
  requiresGit: false,
}

const codeReviewSimple: EvalScenario = {
  id: "code-review-simple",
  name: "Code Review: SQL Injection",
  description: "Review code for security vulnerability",
  taskPrompt: "Review this JavaScript code for security issues and provide feedback:\n\n```js\napp.get('/user', (req, res) => {\n  const userId = req.query.id\n  const query = `SELECT * FROM users WHERE id = ${userId}`\n  db.execute(query, (err, user) => {\n    res.json(user)\n  })\n})\n```",
  expectedBehaviors: [
    {
      description: "Identifies SQL injection vulnerability",
      requiredKeywords: ["SQL injection", "parameterized", "prepared statement", "sanitize"],
      antiPatterns: ["looks fine", "no issues", "good code"],
    },
    {
      description: "Provides fix recommendation",
      requiredKeywords: ["parameterized query", "placeholder", "$1", "?"],
    },
  ],
  category: "code-review",
  difficulty: "medium",
  tags: ["security", "code-review", "javascript", "sql"],
  timeoutSeconds: 90,
  maxTokens: 3000,
  requiresFiles: false,
  requiresGit: false,
}

const designApiEndpoint: EvalScenario = {
  id: "design-api-endpoint",
  name: "Design API Endpoint",
  description: "Design a REST API endpoint specification",
  taskPrompt: "Design a REST API endpoint for creating a new user in a SaaS platform. Include:\n- HTTP method and URL path\n- Request body schema (JSON)\n- Response body schema (JSON)\n- Error codes\n- Authentication requirements\n\nProvide the design in a structured format.",
  expectedBehaviors: [
    {
      description: "Specifies HTTP method and URL",
      requiredKeywords: ["POST", "/users", "/api"],
    },
    {
      description: "Includes request schema",
      requiredKeywords: ["email", "name", "password"],
    },
    {
      description: "Covers error handling",
      requiredKeywords: ["401", "409", "422", "error"],
    },
    {
      description: "Mentions authentication",
      requiredKeywords: ["auth", "token", "bearer", "JWT"],
    },
  ],
  category: "architecture",
  difficulty: "medium",
  tags: ["api-design", "architecture", "rest"],
  timeoutSeconds: 120,
  maxTokens: 4000,
  requiresFiles: false,
  requiresGit: false,
}

const researchExplain: EvalScenario = {
  id: "research-explain",
  name: "Research Explanation",
  description: "Explain a technical concept clearly",
  taskPrompt: "Explain what a 'Bloom filter' is, how it works, and when you would use one. Provide a simple code example in Python.",
  expectedBehaviors: [
    {
      description: "Defines a Bloom filter",
      requiredKeywords: ["Bloom filter", "probabilistic", "false positive"],
    },
    {
      description: "Provides Python code example",
      requiredKeywords: ["python", "hash", "bit"],
    },
    {
      description: "Explains use cases",
      requiredKeywords: ["memory", "cache", "membership"],
    },
  ],
  category: "research",
  difficulty: "medium",
  tags: ["research", "explanation", "algorithms"],
  timeoutSeconds: 120,
  maxTokens: 4000,
  requiresFiles: false,
  requiresGit: false,
}

const debugMemoryLeak: EvalScenario = {
  id: "debug-memory-leak",
  name: "Debug Memory Leak",
  description: "Find and fix a memory leak in Node.js code",
  taskPrompt: "Find the memory leak in this Node.js code and provide the fix:\n\n```js\nconst cache = new Map()\n\nfunction processRequest(data) {\n  const id = data.id\n  cache.set(id, data)\n  // process data...\n  return { status: 'ok' }\n}\n\nsetInterval(() => {\n  console.log(`Cache size: ${cache.size}`)\n}, 5000)\n```",
  expectedBehaviors: [
    {
      description: "Identifies the memory leak",
      requiredKeywords: ["memory leak", "cache", "never removed", "unbounded"],
    },
    {
      description: "Provides fix solution",
      requiredKeywords: ["delete", "TTL", "Map", "eviction", "limit", "size"],
    },
  ],
  category: "debugging",
  difficulty: "hard",
  tags: ["debugging", "memory", "nodejs"],
  timeoutSeconds: 120,
  maxTokens: 3000,
  requiresFiles: false,
  requiresGit: false,
}

// ---------------------------------------------------------------------------
// Built-in suites
// ---------------------------------------------------------------------------

/** Basic sanity check suite. */
const sanitySuite: EvalSuite = {
  id: "sanity",
  name: "Sanity Check",
  description: "Quick sanity check to verify basic agent capabilities",
  scenarios: [helloWorld, fixSyntaxError, refactorToArrow],
}

/** Core capability suite. */
const coreSuite: EvalSuite = {
  id: "core",
  name: "Core Capabilities",
  description: "Core agent capabilities covering all major categories",
  scenarios: [helloWorld, fixSyntaxError, refactorToArrow, writeUnitTest, codeReviewSimple],
}

/** Full benchmark suite. */
const fullSuite: EvalSuite = {
  id: "full",
  name: "Full Benchmark",
  description: "Complete agent benchmark covering all categories and difficulties",
  scenarios: [
    helloWorld,
    fixSyntaxError,
    refactorToArrow,
    writeUnitTest,
    codeReviewSimple,
    designApiEndpoint,
    researchExplain,
    debugMemoryLeak,
  ],
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All built-in scenarios indexed by ID. */
export const ALL_SCENARIOS: Record<string, EvalScenario> = {
  [helloWorld.id]: helloWorld,
  [fixSyntaxError.id]: fixSyntaxError,
  [refactorToArrow.id]: refactorToArrow,
  [writeUnitTest.id]: writeUnitTest,
  [codeReviewSimple.id]: codeReviewSimple,
  [designApiEndpoint.id]: designApiEndpoint,
  [researchExplain.id]: researchExplain,
  [debugMemoryLeak.id]: debugMemoryLeak,
}

/** All built-in suites indexed by ID. */
export const ALL_SUITES: Record<string, EvalSuite> = {
  [sanitySuite.id]: sanitySuite,
  [coreSuite.id]: coreSuite,
  [fullSuite.id]: fullSuite,
}

/** Get a scenario by ID. */
export function getScenario(id: string): EvalScenario | undefined {
  return ALL_SCENARIOS[id]
}

/** Get a suite by ID. */
export function getSuite(id: string): EvalSuite | undefined {
  return ALL_SUITES[id]
}

/** List all scenarios, optionally filtered by category/difficulty. */
export function listScenarios(opts?: {
  category?: ScenarioCategory
  difficulty?: Difficulty
}): EvalScenario[] {
  let list = Object.values(ALL_SCENARIOS)
  if (opts?.category) list = list.filter((s) => s.category === opts.category)
  if (opts?.difficulty) list = list.filter((s) => s.difficulty === opts.difficulty)
  return list
}

export * as EvalScenario from "./scenario"
