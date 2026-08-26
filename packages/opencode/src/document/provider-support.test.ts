import { describe, expect, test } from "bun:test"
import { supportsExtractedAudio } from "./provider-support"

describe("document provider support", () => {
  test("allows extracted audio only for tested audio-capable adapters", () => {
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/openai" }, capabilities: { input: { audio: true } } } as any)).toBe(true)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/google" }, capabilities: { input: { audio: true } } } as any)).toBe(true)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/anthropic" }, capabilities: { input: { audio: true } } } as any)).toBe(false)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/openai" }, capabilities: { input: { audio: false } } } as any)).toBe(false)
    expect(supportsExtractedAudio(undefined)).toBe(false)
  })
})
