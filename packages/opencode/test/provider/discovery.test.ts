// Covers the opt-in `discover` provider flag: models are read from the
// provider's OpenAI-compatible `GET {baseURL}/models` endpoint so server-side
// additions appear without editing the config. Kept in its own file so the
// discovery fetch runs in a clean process, isolated from the plugin tests in
// provider.test.ts.
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Provider } from "@/provider/provider"
import { ProviderID } from "../../src/provider/schema"
import { Env } from "../../src/env"
import { Plugin } from "../../src/plugin/index"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(Provider.defaultLayer, Env.defaultLayer, Plugin.defaultLayer))
const list = Provider.use.list()

const endpointModels = {
  object: "list",
  data: [
    { id: "declared-model", name: "Declared From Api", context_length: 111_000 },
    { id: "dynamic-model", name: "Dynamic Model", context_length: 222_000 },
  ],
}

const providerConfig = (baseURL: string, discover?: boolean) => ({
  provider: {
    "discover-provider": {
      name: "Discover Provider",
      npm: "@ai-sdk/openai-compatible",
      ...(discover ? { discover: true } : {}),
      options: { baseURL, apiKey: "discover-key" },
      models: { "declared-model": { name: "Declared Model" } },
    },
  },
})

// Replaces only the network boundary; every other request still reaches the
// real fetch. `url` is recorded so a test can assert whether the endpoint was
// queried at all.
function stubModelsEndpoint(record: string[], modelsURL: string) {
  const realFetch = globalThis.fetch
  const handle = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url !== modelsURL) return realFetch(input, init)
      record.push(url)
      return Promise.resolve(
        new Response(JSON.stringify(endpointModels), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    },
    { preconnect: realFetch.preconnect.bind(realFetch) },
  )
  globalThis.fetch = handle as typeof fetch
  return () => {
    globalThis.fetch = realFetch
  }
}

it.instance(
  "discovers models from an OpenAI-compatible /models endpoint when discover is enabled",
  () => {
    const restore = stubModelsEndpoint([], "https://discover.test/v1/models")
    return Effect.gen(function* () {
      const providers = yield* list
      const provider = providers[ProviderID.make("discover-provider")]
      expect(provider).toBeDefined()
      // Config-declared metadata wins over the endpoint payload.
      expect(provider.models["declared-model"].name).toBe("Declared Model")
      // A model only the endpoint knows about is merged in with API-derived fields.
      const discovered = provider.models["dynamic-model"]
      expect(discovered).toBeDefined()
      expect(discovered.name).toBe("Dynamic Model")
      expect(discovered.limit.context).toBe(222_000)
      expect(discovered.api.npm).toBe("@ai-sdk/openai-compatible")
      expect(discovered.api.url).toBe("https://discover.test/v1")
    }).pipe(Effect.ensuring(Effect.sync(restore)))
  },
  { config: providerConfig("https://discover.test/v1", true) },
  { timeout: 30_000 },
)

it.instance(
  "does not query /models for providers without discover",
  () => {
    const hits: string[] = []
    const restore = stubModelsEndpoint(hits, "https://static.test/v1/models")
    return Effect.gen(function* () {
      const providers = yield* list
      const provider = providers[ProviderID.make("discover-provider")]
      expect(provider).toBeDefined()
      expect(provider.models["dynamic-model"]).toBeUndefined()
      yield* Effect.sync(() => expect(hits).toEqual([]))
    }).pipe(Effect.ensuring(Effect.sync(restore)))
  },
  { config: providerConfig("https://static.test/v1") },
  { timeout: 30_000 },
)
