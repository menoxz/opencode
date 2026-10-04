import { describe, expect, test } from "bun:test"
import { supportsExtractedAudio, supportsPdfInput } from "./provider-support"

describe("document provider support", () => {
  test("allows extracted audio only for tested audio-capable adapters", () => {
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/openai" }, capabilities: { input: { audio: true } } } as any)).toBe(true)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/google" }, capabilities: { input: { audio: true } } } as any)).toBe(true)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/anthropic" }, capabilities: { input: { audio: true } } } as any)).toBe(false)
    expect(supportsExtractedAudio({ api: { npm: "@ai-sdk/openai" }, capabilities: { input: { audio: false } } } as any)).toBe(false)
    expect(supportsExtractedAudio(undefined)).toBe(false)
  })

  test("allows original PDF attachments only when the model declares PDF input", () => {
    expect(supportsPdfInput({ api: { npm: "@ai-sdk/anthropic" }, capabilities: { input: { pdf: true } } } as any)).toBe(true)
    expect(supportsPdfInput({ api: { npm: "@ai-sdk/github-copilot" }, capabilities: { input: { pdf: true } } } as any)).toBe(false)
    expect(supportsPdfInput({ api: { npm: "@ai-sdk/anthropic" }, capabilities: { input: { pdf: false } } } as any)).toBe(false)
    expect(supportsPdfInput(undefined)).toBe(false)
  })
})
