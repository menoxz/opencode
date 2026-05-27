/**
 * Tests for Self-Improvement System (Phase 5).
 * Run: bun test src/self-improve/self-improve.test.ts
 */

import { describe, it, expect } from "bun:test"
import { updateProfile, type SessionOutcome } from "./index"

// ---------------------------------------------------------------------------
// Profile update logic (pure function, no Effect deps needed)
// ---------------------------------------------------------------------------

describe("updateProfile", () => {
  it("should create a new profile from first outcome", () => {
    const outcome: SessionOutcome = {
      sessionId: "s1",
      taskType: "bug-fix",
      modelId: "claude/sonnet",
      success: true,
      tokensUsed: 1500,
      toolCalls: 5,
      errors: [],
      durationMs: 10000,
      paramsUsed: { temperature: 0.5 },
    }
    const profile = updateProfile(null, outcome)
    expect(profile.taskType).toBe("bug-fix")
    expect(profile.modelId).toBe("claude/sonnet")
    expect(profile.samples).toBe(1)
    expect(profile.temperature).toBe(0.5)
    expect(profile.avgSuccessRate).toBe(1)
    expect(profile.avgTokensUsed).toBe(1500)
  })

  it("should update existing profile with exponential smoothing", () => {
    const existing = {
      taskType: "bug-fix",
      modelId: "claude/sonnet",
      temperature: 0.3,
      topP: undefined,
      maxOutputTokens: undefined,
      samples: 10,
      avgSuccessRate: 0.8,
      avgTokensUsed: 2000,
      avgToolCalls: 8,
      updatedAt: Date.now() - 1000,
    }

    const outcome: SessionOutcome = {
      sessionId: "s2",
      taskType: "bug-fix",
      modelId: "claude/sonnet",
      success: false,
      tokensUsed: 3000,
      toolCalls: 12,
      errors: ["timeout"],
      durationMs: 30000,
      paramsUsed: { temperature: 0.3 },
    }

    const profile = updateProfile(existing, outcome)
    expect(profile.samples).toBe(11)
    // SMOOTHING_FACTOR = 0.2, so alpha = 1/min(newSamples, 5) = 1/5 = 0.2
    // new avg = 0.8 * 0.8 + 0.0 * 0.2 = 0.64
    expect(profile.avgSuccessRate).toBeCloseTo(0.64, 1)
    expect(profile.temperature).toBe(0.3)
  })

  it("should handle multiple model configs independently", () => {
    const outcome1: SessionOutcome = {
      sessionId: "s3",
      taskType: "feature",
      modelId: "gpt-4",
      success: true,
      tokensUsed: 2000,
      toolCalls: 6,
      errors: [],
      durationMs: 15000,
      paramsUsed: { temperature: 0.7, topP: 0.9 },
    }
    const profile1 = updateProfile(null, outcome1)
    expect(profile1.taskType).toBe("feature")
    expect(profile1.modelId).toBe("gpt-4")

    const outcome2: SessionOutcome = {
      sessionId: "s4",
      taskType: "refactor",
      modelId: "claude/sonnet",
      success: true,
      tokensUsed: 1800,
      toolCalls: 4,
      errors: [],
      durationMs: 12000,
      paramsUsed: { temperature: 0.3 },
    }
    const profile2 = updateProfile(null, outcome2)
    expect(profile2.taskType).toBe("refactor")
    expect(profile2.modelId).toBe("claude/sonnet")

    // These should not affect each other
    expect(profile1.samples).toBe(1)
    expect(profile2.samples).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Outcome validation
// ---------------------------------------------------------------------------

describe("SessionOutcome validation", () => {
  it("should properly represent a failed session", () => {
    const outcome: SessionOutcome = {
      sessionId: "failed-1",
      taskType: "debug",
      modelId: "claude/sonnet",
      success: false,
      tokensUsed: 5000,
      toolCalls: 15,
      errors: ["permission denied", "timeout on tool call"],
      durationMs: 60000,
      paramsUsed: { temperature: 0.5, maxOutputTokens: 4000 },
    }
    expect(outcome.success).toBe(false)
    expect(outcome.errors.length).toBe(2)
  })
})

console.log("✅ Self-Improve tests ready!")
