/**
 * Tests for the read-heavy classification that governs compaction pressure.
 *
 * A read-heavy window must compact less, not more: its recent turns are the
 * file bytes the model just loaded, and summarising them away makes the model
 * pay for them twice by re-reading the same files. See session/overflow.ts and
 * session/compaction.ts (preserveRecentBudget).
 *
 * Run: bun test src/session/overflow.test.ts
 */
import { describe, expect, test } from "bun:test"
import type { Config } from "@/config/config"
import { isReadHeavy } from "./overflow"
import type { MessageV2 } from "./message-v2"

const inspection = (output: string, tool = "read") =>
  ({
    info: { role: "assistant" },
    parts: [{ type: "tool", tool, state: { status: "completed", output } }],
  }) as unknown as MessageV2.WithParts

const summary = () =>
  ({ info: { role: "assistant", summary: true }, parts: [] }) as unknown as MessageV2.WithParts

/** `inspectionTokens` divides by four, so this yields exactly `tokens`. */
const chars = (tokens: number) => "x".repeat(tokens * 4)

const cfg = (over: Config.Info["compaction"] = {}) => ({ compaction: over }) as Config.Info

describe("isReadHeavy", () => {
  test("classifies a window at the default threshold as read-heavy", () => {
    expect(isReadHeavy([inspection(chars(20_000))], cfg())).toBe(true)
  })

  test("leaves a lighter window alone", () => {
    expect(isReadHeavy([inspection(chars(19_000))], cfg())).toBe(false)
  })

  test("ignores output that is not an inspection", () => {
    expect(isReadHeavy([inspection(chars(30_000), "bash")], cfg())).toBe(false)
  })

  test("sums inspection output across messages", () => {
    expect(isReadHeavy([inspection(chars(10_000)), inspection(chars(10_000))], cfg())).toBe(true)
  })

  test("honours the configured minimum", () => {
    expect(isReadHeavy([inspection(chars(20_000))], cfg({ read_heavy_min_tokens: 50_000 }))).toBe(false)
  })

  test("stops counting at a compaction boundary", () => {
    expect(isReadHeavy([inspection(chars(30_000)), summary()], cfg())).toBe(false)
  })
})
