/**
 * Tests for PromptComposer — task detection and prompt composition.
 * Run: bun test src/prompt-composer/composer.test.ts
 */

import { describe, it, expect } from "bun:test"
import { heuristicDetect, TaskType } from "./index"

// ---------------------------------------------------------------------------
// Task detection tests
// ---------------------------------------------------------------------------

describe("heuristicDetect", () => {
  it("should detect bug fix tasks", () => {
    const result = heuristicDetect("fix the login button not working")
    expect(result.type).toBe(TaskType.BUG_FIX)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect debug tasks", () => {
    const result = heuristicDetect("I'm getting a TypeError: undefined is not an object")
    expect(result.type).toBe(TaskType.DEBUG)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect feature tasks", () => {
    const result = heuristicDetect("Add a new user profile page with avatar upload")
    expect(result.type).toBe(TaskType.FEATURE)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect refactor tasks", () => {
    const result = heuristicDetect("Refactor the authentication module to use hooks")
    expect(result.type).toBe(TaskType.REFACTOR)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it("should detect research tasks", () => {
    const result = heuristicDetect("Research the best way to implement WebSocket support")
    expect(result.type).toBe(TaskType.RESEARCH)
  })

  it("should detect architecture tasks", () => {
    const result = heuristicDetect("Design the microservice architecture for the payment system")
    expect(result.type).toBe(TaskType.ARCHITECTURE)
  })

  it("should detect code review tasks", () => {
    const result = heuristicDetect("Review this PR for security issues")
    expect(result.type).toBe(TaskType.CODE_REVIEW)
  })

  it("should detect test tasks", () => {
    const result = heuristicDetect("Write unit tests for the API endpoints")
    expect(result.type).toBe(TaskType.TEST)
  })

  it("should return general for ambiguous short messages", () => {
    const result = heuristicDetect("Hello, can you help me?")
    expect(result.type).toBe(TaskType.GENERAL)
  })
})

describe("heuristicDetect with tool context", () => {
  it("should boost debug detection when debug tools used", () => {
    const result = heuristicDetect("something is broken", {
      toolsUsed: ["debug", "inspect"],
    })
    expect(result.type).toBe(TaskType.DEBUG)
  })

  it("should detect code review from explicit patterns", () => {
    const result = heuristicDetect("Can you review this PR for me?", {
      toolsUsed: ["read", "glob"],
    })
    expect(result.type).toBe(TaskType.CODE_REVIEW)
  })
})

// ---------------------------------------------------------------------------
// Task prompt content verification
// ---------------------------------------------------------------------------

describe("task prompt structure", () => {
  const fs = require("fs")
  const path = require("path")
  const promptDir = path.join(__dirname, "..", "session", "prompt", "task-specific")

  const files = [
    "bug-fix.txt", "feature.txt", "refactor.txt",
    "research.txt", "architecture.txt", "debug.txt",
    "code-review.txt", "test.txt", "general.txt",
  ]

  for (const file of files) {
    it(`${file} should exist and contain content`, () => {
      const content = fs.readFileSync(path.join(promptDir, file), "utf-8")
      expect(content.length).toBeGreaterThan(50)
      expect(content).toContain("<task-instruction")
    })
  }
})

console.log("✅ PromptComposer tests ready!")
