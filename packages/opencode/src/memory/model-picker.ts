/**
 * model-picker — Shared free-model resolution for memory LLM passes.
 *
 * Extracted from llm-decisions.ts so multiple memory features (key-decision
 * extraction, episodic→semantic synthesis, …) share ONE robust, fail-safe
 * free-model picker. The contract is strict:
 *
 *   - Free only: a model is eligible iff `cost.input === 0`. Paid credits are
 *     NEVER spent by a memory background pass.
 *   - Preference order is pure substring match on the lowercased model id, so
 *     it is provider/language agnostic and robust to id drift. DeepSeek V4
 *     Flash first (user default for opencode Go), then any deepseek, then known
 *     cheap/fast free families, then anything else free.
 *   - Re-scanned every call, so a retired model id can never get pinned.
 *
 * These are pure helpers (no Effect) plus one Effect resolver that turns the
 * chosen ref into an AI-SDK language model, fully guarded.
 */

import { Effect, Option } from "effect"
import { Provider } from "@/provider/provider"

// Preference order for the free-model auto picker. DeepSeek V4 Flash first
// (user default), then any deepseek, then known cheap/fast free families,
// then anything else free.
export const FREE_PREFERENCE = [
  "deepseek-v4-flash",
  "deepseek-v4",
  "deepseek",
  "gpt-5-nano",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "flash",
  "nano",
  "mini",
] as const

export type ModelRef = { providerID: string; modelID: string; id: string }

/**
 * Scan every loaded provider, keep only free models (cost.input === 0), and
 * return them sorted by FREE_PREFERENCE. Empty array means "no free model"
 * => caller should skip the LLM entirely.
 */
export function pickFreeModels(providers: Record<string, any>): ModelRef[] {
  const free: ModelRef[] = []
  for (const [providerID, prov] of Object.entries(providers)) {
    const models = prov?.models
    if (!models || typeof models !== "object") continue
    for (const [modelID, model] of Object.entries<any>(models)) {
      const cost = model?.cost
      if (!cost || cost.input !== 0) continue
      const id = String(model?.id ?? modelID).toLowerCase()
      free.push({ providerID, modelID, id })
    }
  }
  const rank = (id: string) => {
    for (let i = 0; i < FREE_PREFERENCE.length; i++) {
      if (id.includes(FREE_PREFERENCE[i])) return i
    }
    return FREE_PREFERENCE.length
  }
  free.sort((a, b) => rank(a.id) - rank(b.id))
  return free
}

/**
 * Parse a JSON array of short strings out of an LLM response. Tolerant of
 * code fences and surrounding prose. Returns [] on any problem.
 */
export function parseJsonStringArray(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return []
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf("[")
  const end = raw.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  } catch {
    return []
  }
}

/**
 * Resolve a free language model ready for `aiGenerateText`, fully guarded.
 *
 * Resolution: an explicit `override` of the form "providerID/modelID" wins;
 * otherwise the best free model is auto-picked. Returns `null` (never throws)
 * when no provider, no free model, or the model exposes no language API.
 *
 * The returned `id` is the lowercased model id, useful for provenance/logging.
 */
export const resolveFreeLanguageModel = Effect.fnUntraced(function* (opts: {
  override?: string
}) {
  const providerOpt = yield* Effect.serviceOption(Provider.Service)
  const provider = Option.getOrUndefined(providerOpt)
  if (!provider) return null as { language: any; id: string } | null

  let chosen: ModelRef | undefined
  if (typeof opts.override === "string" && opts.override.includes("/")) {
    const idx = opts.override.indexOf("/")
    chosen = {
      providerID: opts.override.slice(0, idx),
      modelID: opts.override.slice(idx + 1),
      id: opts.override.toLowerCase(),
    }
  } else {
    const providers = yield* provider
      .list()
      .pipe(Effect.catch(() => Effect.succeed({} as Record<string, any>)))
    const free = pickFreeModels(providers)
    if (free.length === 0) return null
    chosen = free[0]
  }

  const resolved = yield* provider
    .getModel(chosen.providerID as any, chosen.modelID as any)
    .pipe(Effect.catch(() => Effect.succeed(null as any)))
  if (!resolved) return null

  const language = yield* provider
    .getLanguage(resolved)
    .pipe(Effect.catch(() => Effect.succeed(null as any)))
  if (!language) return null

  return { language, id: chosen.id }
})
