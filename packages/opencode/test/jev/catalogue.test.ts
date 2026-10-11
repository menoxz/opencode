import { describe, expect, test } from "bun:test"
import { JevCatalogue } from "../../src/jev/catalogue"
import { JevClient } from "../../src/jev/client"

/**
 * The Jev catalogue.
 *
 * These tests pin the two shapes a host may answer with and the one rule that keeps a
 * generation model out of the decision-model list.
 */

describe("JevCatalogue.parseHostModels", () => {
  test("reads Codiv's {models:[{name,description}]} shape, where name is the id", () => {
    const models = JevCatalogue.parseHostModels({
      models: [
        { name: "openjev-latest", description: "Alias for the newest OpenJev release.", release_date: "2026-09-18" },
        { name: "openjev-0.1", description: "OpenJev 0.1: DiffusionGemma 26B-A4B on vLLM's structured reads." },
      ],
    })
    expect(models).toEqual([
      { id: "openjev-latest", name: "openjev-latest", description: "Alias for the newest OpenJev release." },
      { id: "openjev-0.1", name: "openjev-0.1", description: "OpenJev 0.1: DiffusionGemma 26B-A4B on vLLM's structured reads." },
    ])
  })

  test("drops a model the host itself describes as chat generation", () => {
    const models = JevCatalogue.parseHostModels({
      models: [
        { name: "verdict-1.4", description: "ModernBERT encoder calibrated with RLCD, up to 24 choices." },
        { name: "diffusiongemma-26b", description: "DiffusionGemma 26B-A4B (NVFP4) text generation at POST /v1/chat/completions." },
      ],
    })
    expect(models?.map((model) => model.id)).toEqual(["verdict-1.4"])
  })

  test("reads the OpenAI-compatible {data:[{id,name}]} shape, where name is a label", () => {
    const models = JevCatalogue.parseHostModels({ data: [{ id: "jev-1.13-free", name: "Jev 1.13 (free)" }] })
    expect(models).toEqual([{ id: "jev-1.13-free", name: "Jev 1.13 (free)" }])
  })

  test("names nothing when the payload is not a catalogue", () => {
    expect(JevCatalogue.parseHostModels(undefined)).toBeUndefined()
    expect(JevCatalogue.parseHostModels("not json")).toBeUndefined()
    expect(JevCatalogue.parseHostModels({})).toBeUndefined()
    expect(JevCatalogue.parseHostModels({ models: [] })).toBeUndefined()
    expect(JevCatalogue.parseHostModels({ models: [{ description: "no id at all" }] })).toBeUndefined()
    expect(JevCatalogue.parseHostModels({ models: [{ name: "chat-only", description: "POST /v1/chat/completions" }] })).toBeUndefined()
  })

  test("deduplicates and keeps the host's order", () => {
    const models = JevCatalogue.parseHostModels({ models: [{ name: "laya-1.0" }, { name: "clm-v0.1" }, { name: "laya-1.0" }] })
    expect(models?.map((model) => model.id)).toEqual(["laya-1.0", "clm-v0.1"])
  })
})

describe("JevCatalogue.PRESET_MODELS", () => {
  test("every selectable host documents the model its preset pins, first", () => {
    for (const provider of JevClient.SELECTABLE_PROVIDERS) {
      const models = JevCatalogue.PRESET_MODELS[provider]
      expect(models.length).toBeGreaterThan(0)
      expect(models[0]!.id).toBe(JevClient.PROVIDERS[provider].model)
    }
  })
})
