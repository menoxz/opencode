import { describe, expect, test } from "bun:test"
import type { Config } from "@/config/config"
import type { MessageV2 } from "@/session/message-v2"
import type { Provider } from "@/provider/provider"
import * as Overflow from "@/session/overflow"

const model = (input: { context?: number; output?: number; cacheRead?: number }) =>
  ({
    id: "deepseek/deepseek-v4.1-flash",
    providerID: "command-code",
    api: { id: "deepseek-v4.1-flash", url: "https://api.commandcode.ai/provider/v1", npm: "@ai-sdk/anthropic" },
    name: "DeepSeek V4.1 Flash",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0.15, output: 0.6, cache: { read: input.cacheRead ?? 0.003, write: 0.15 } },
    limit: { context: input.context ?? 1_000_000, output: input.output ?? 32_768 },
    status: "active",
    options: {},
    headers: {},
  }) as unknown as Provider.Model

const cfg = (compaction: NonNullable<Config.Info["compaction"]>) => ({ compaction }) as unknown as Config.Info

const tokens = (total: number) =>
  ({ input: total, output: 0, reasoning: 0, total, cache: { read: 0, write: 0 } }) as MessageV2.Assistant["tokens"]

// The gateway answers `context_length: 1000000` for every deepseek model, and the
// global config carries `absolute_trigger: 160000` with `threshold: 0.6`. The audited
// session compacted between 159 967 and 161 715 prompt tokens: that pivot must be the
// one this module computes, not an approximated one.
const audited = model({})
const auditedCfg = cfg({ threshold: 0.6, absolute_trigger: 160_000 })

describe("Overflow limits", () => {
  test("derives context, usable and reserved from the model window", () => {
    expect(Overflow.limits({ cfg: auditedCfg, model: audited })).toMatchObject({
      context: 1_000_000,
      maxOutput: 32_000,
      reserved: 20_000,
      usable: 968_000,
    })
  })

  test("reproduces the compaction pivot observed in the audited session", () => {
    const trigger = Overflow.trigger({ cfg: auditedCfg, model: audited })
    expect(trigger.proportional).toBe(580_800)
    expect(trigger.absolute).toBe(160_000)
    expect(trigger.value).toBe(160_000)
  })

  test("flips exactly at the reported trigger", () => {
    const trigger = Overflow.trigger({ cfg: auditedCfg, model: audited }).value
    expect(Overflow.isOverflow({ cfg: auditedCfg, model: audited, tokens: tokens(trigger - 1) })).toBe(false)
    expect(Overflow.isOverflow({ cfg: auditedCfg, model: audited, tokens: tokens(trigger) })).toBe(true)
  })

  test("honours an explicit absolute trigger over the proportional one", () => {
    const trigger = Overflow.trigger({
      cfg: cfg({ threshold: 0.6, absolute_trigger: 900_000 }),
      model: audited,
    })
    expect(trigger.proportional).toBe(580_800)
    expect(trigger.value).toBe(580_800)
  })
})

describe("Overflow read-heavy trigger", () => {
  const proportionalCfg = cfg({ threshold: 0.6 })

  test("stays quiet past the inspection threshold when the provider caches the prompt", () => {
    const trigger = Overflow.trigger({ cfg: proportionalCfg, model: audited, inspected: 500_000 })
    expect(trigger.cacheAware).toBe(true)
    expect(trigger.early).toBeUndefined()
    expect(trigger.readHeavy).toBe(false)
    expect(trigger.value).toBe(580_800)
  })

  test("still compacts early when the provider bills no cache read", () => {
    const trigger = Overflow.trigger({
      cfg: proportionalCfg,
      model: model({ cacheRead: 0 }),
      inspected: 500_000,
    })
    expect(trigger.cacheAware).toBe(false)
    expect(trigger.early).toBe(464_640)
    expect(trigger.readHeavy).toBe(true)
    expect(trigger.value).toBe(464_640)
  })

  test("keeps an explicit read_heavy_trigger even for a cached provider", () => {
    const trigger = Overflow.trigger({
      cfg: cfg({ threshold: 0.6, read_heavy_trigger: 300_000 }),
      model: audited,
      inspected: 500_000,
    })
    expect(trigger.early).toBe(300_000)
    expect(trigger.value).toBe(300_000)
  })

  test("ignores the inspection volume below the read-heavy minimum", () => {
    const trigger = Overflow.trigger({
      cfg: proportionalCfg,
      model: model({ cacheRead: 0 }),
      inspected: 1_000,
    })
    expect(trigger.early).toBe(464_640)
    expect(trigger.readHeavy).toBe(false)
    expect(trigger.value).toBe(580_800)
  })
})
