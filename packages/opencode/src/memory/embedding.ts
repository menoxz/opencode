/**
 * EmbeddingService — Generates vector embeddings for semantic memory search.
 *
 * Uses the AI SDK `embed` function to generate embeddings via the configured
 * LLM provider. Falls back to a local character n-gram hashing approach when
 * no provider is available (zero-dependency fallback).
 *
 * Architecture:
 * ┌────────────────┐     ┌──────────────────┐     ┌───────────────┐
 * │ Memory Service │────▶│ EmbeddingService │────▶│ AI SDK embed  │
 * │ (index.ts)     │     │ (embedding.ts)   │     │ or local hash │
 * └────────────────┘     └──────────────────┘     └───────────────┘
 *
 * The embedding dimension is configurable. Default: 384 dimensions
 * (compatible with sentence-transformers/all-MiniLM-L6-v2).
 */

import { Effect, Context, Layer, Schema, Option } from "effect"
import { embed as aiEmbed, type EmbeddingModel } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

const log = Log.create({ service: "memory.embedding" })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default embedding dimension. 384 balances quality and storage. */
export const DEFAULT_DIMENSION = 384

/** N-gram size for local fallback hashing. */
const NGRAM_SIZE = 3

/** Local hash vector dimension (must match DEFAULT_DIMENSION for consistency). */
const HASH_DIMENSION = DEFAULT_DIMENSION

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmbeddingVector = number[]

export interface Interface {
  /**
   * Generate an embedding vector for a single text.
   * Uses the LLM provider if available, falls back to local n-gram hashing.
   */
  readonly embed: (text: string) => Effect.Effect<EmbeddingVector>

  /**
   * Generate embedding vectors for multiple texts in batch.
   * More efficient than calling embed() repeatedly.
   */
  readonly embedMany: (texts: string[]) => Effect.Effect<EmbeddingVector[]>

  /**
   * Compute cosine similarity between two vectors.
   * Returns value in [-1, 1] where 1 = identical direction.
   */
  readonly cosineSimilarity: (a: EmbeddingVector, b: EmbeddingVector) => number

  /**
   * Returns the dimension of generated embeddings.
   */
  readonly dimension: number

  /**
   * Check if we're using real AI embeddings or local fallback.
   */
  readonly isUsingAI: boolean
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/EmbeddingService") {}

// ---------------------------------------------------------------------------
// Local fallback: character n-gram hashing
// ---------------------------------------------------------------------------

/**
 * Simple string hash function that produces a consistent number from a string.
 * Uses djb2 algorithm.
 */
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash >>> 0
}

/**
 * Generate a pseudo-random but deterministic vector from n-gram features.
 * This provides a "poor man's embedding" — not as good as real embeddings,
 * but far better than keyword search because it captures substring/semantic
 * overlap through shared n-grams.
 */
function localEmbed(text: string): EmbeddingVector {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return new Array(HASH_DIMENSION).fill(0)

  // Extract character n-grams
  const ngrams = new Map<string, number>()
  for (let i = 0; i <= normalized.length - NGRAM_SIZE; i++) {
    const gram = normalized.slice(i, i + NGRAM_SIZE)
    ngrams.set(gram, (ngrams.get(gram) ?? 0) + 1)
  }

  // Count words for additional signal
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  const wordSet = new Set(words)

  // Build vector: each dimension is activated by a hash of the n-gram
  const vec = new Array(HASH_DIMENSION).fill(0)
  for (const [gram, count] of ngrams) {
    const idx = hashString(gram) % HASH_DIMENSION
    vec[idx] += count / (normalized.length - NGRAM_SIZE + 1)
  }

  // Add word-level signal
  for (const word of wordSet) {
    const idx = hashString(`word:${word}`) % HASH_DIMENSION
    vec[idx] += 0.5
  }

  // L2 normalize
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  if (magnitude > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= magnitude
    }
  }

  return vec
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const providerOpt = yield* Effect.serviceOption(Provider.Service)
    const provider = Option.getOrUndefined(providerOpt)

    // Try to get a default model for embeddings
    const modelInfo = provider
      ? yield* provider.defaultModel().pipe(
          Effect.catch(() => Effect.succeed(null as { providerID: string; modelID: string } | null)),
        )
      : null

    let embeddingModel: EmbeddingModel | null = null
    let usingAI = false

    if (modelInfo && provider) {
      try {
        const resolved = yield* provider.getModel(modelInfo.providerID as any, modelInfo.modelID as any)
        const modelId = resolved.api.id.toLowerCase()
        if (
          modelId.includes("embed") ||
          modelId.includes("text-embedding") ||
          modelId.includes("ada") ||
          modelId.includes("3-small") ||
          modelId.includes("3-large")
        ) {
          embeddingModel = resolved.api as unknown as EmbeddingModel
          usingAI = true
          log.info("using AI embeddings via provider model", { model: resolved.api.id })
        } else {
          log.info("default model does not support embeddings, using local fallback", { model: resolved.api.id })
        }
      } catch {
        log.info("could not resolve embedding model, using local fallback")
      }
    }

    const embed = Effect.fn("EmbeddingService.embed")(function* (text: string) {
      if (embeddingModel && usingAI) {
        try {
          const result = yield* Effect.promise(() =>
            aiEmbed({
              model: embeddingModel!,
              value: text,
            }),
          )
          log.debug("generated AI embedding", { dim: result.embedding.length })
          return result.embedding as EmbeddingVector
        } catch (err) {
          log.warn("AI embedding failed, falling back to local", { error: String(err) })
        }
      }
      return localEmbed(text)
    })

    const embedMany = Effect.fn("EmbeddingService.embedMany")(function* (texts: string[]) {
      if (embeddingModel && usingAI) {
        try {
          const results = yield* Effect.promise(async () => {
            const { embedMany: aiEmbedMany } = await import("ai")
            return aiEmbedMany({
              model: embeddingModel!,
              values: texts,
            })
          })
          log.debug("generated AI embeddings", { count: texts.length, dim: results.embeddings[0]?.length })
          return results.embeddings as EmbeddingVector[]
        } catch (err) {
          log.warn("AI embeddings batch failed, falling back to local", { error: String(err) })
        }
      }
      return texts.map(localEmbed)
    })

    return Service.of({
      embed,
      embedMany,
      cosineSimilarity,
      dimension: DEFAULT_DIMENSION,
      isUsingAI: usingAI,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Provider.defaultLayer))

export const use = serviceUse(Service)

// Re-export cosine similarity for external use
export { cosineSimilarity as cosSim }
