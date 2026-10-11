import { describe, expect, test } from "bun:test"
import { ProviderTransform } from "@/provider/transform"

// ---------------------------------------------------------------------------
// H2 — cache de prompt explicite sur le provider réellement utilisé.
//
// Périmètre de PREUVE de ce fichier : **l'émission de la clé** (plomberie client).
//   * le provider servi (`opencode-go/deepseek-v4.1-flash`) tourne sur le npm par
//     défaut `@ai-sdk/openai-compatible` (`provider.ts:1151`) ;
//   * cette famille reconnaît déjà deepseek (`provider.ts:1441`) ;
//   * le corps émis doit donc porter `promptCacheKey === sessionID`.
//
// Ce que ce fichier NE prouve PAS : que le serveur honore le champ. Le critère §7.2
// de la fiche exige un **rejeu live** (`test/provider/h2-live-cache-replay.ts`).
// Un mock fabrique lui-même la valeur qu'il est censé observer (§8.3) : il ne peut
// pas satisfaire §7.2 — c'est écrit, jamais dissimulé.
// ---------------------------------------------------------------------------

const sessionID = "session-h2-emission"

const baseModel = {
  id: "opencode-go/deepseek-v4.1-flash",
  providerID: "opencode-go",
  api: {
    id: "deepseek-v4.1-flash",
    url: "https://opencode.ai/zen/go/v1",
    npm: "@ai-sdk/openai-compatible",
  },
  name: "DeepSeek V4.1 Flash",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0.0001, output: 0.0002, cache: { read: 0.00001, write: 0.00002 } },
  limit: { context: 128000, output: 8192 },
  status: "active",
  options: {},
  headers: {},
} as any

describe("H2 — ProviderTransform.options: promptCacheKey pour @ai-sdk/openai-compatible", () => {
  test("§8.1 émission — la clé par session est posée pour la famille compatible servie", () => {
    const result = ProviderTransform.options({ model: baseModel, sessionID })
    expect(result.promptCacheKey).toBe(sessionID)
  })

  test("§8.2 mutation — openai-compatible HORS deepseek : aucune clé (garde bornée)", () => {
    const other = { ...baseModel, api: { ...baseModel.api, id: "qwen3-max" } }
    const result = ProviderTransform.options({ model: other, sessionID })
    expect(result.promptCacheKey).toBeUndefined()
  })

  test("§8.2 garde bornée — la famille anthropic reste inchangée (clé seulement si setCacheKey)", () => {
    const anthropic = {
      ...baseModel,
      providerID: "anthropic",
      api: { id: "claude-3-5-sonnet-20241022", url: "https://api.anthropic.com", npm: "@ai-sdk/anthropic" },
    }
    expect(ProviderTransform.options({ model: anthropic, sessionID }).promptCacheKey).toBeUndefined()
    expect(
      ProviderTransform.options({ model: anthropic, sessionID, providerOptions: { setCacheKey: true } })
        .promptCacheKey,
    ).toBe(sessionID)
  })

  test("§8.3 plomberie (mock, émission seule) — la clé survit au wrapping providerOptions du SDK", () => {
    // Le client émet `promptCacheKey` dans le résultat de `options()` ; le runtime le
    // ré-embarque via `ProviderTransform.providerOptions` (llm.ts:406). On vérifie que
    // la clé survit à ce wrapping, pour la famille compatible, à la valeur exacte sessionID.
    const options = ProviderTransform.options({ model: baseModel, sessionID })
    const wrapped = ProviderTransform.providerOptions(baseModel, options)
    const values = Object.values(wrapped) as Array<Record<string, any> | undefined>
    expect(values.some((v) => v?.promptCacheKey === sessionID)).toBe(true)
  })
})
