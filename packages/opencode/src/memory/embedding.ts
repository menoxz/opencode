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
import { embed as aiEmbed, generateText as aiGenerateText, type EmbeddingModel } from "ai"
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

  /**
   * Generate alternative search query variants for a piece of content.
   * Uses the LLM provider if available, falls back to simple text extraction.
   */
  readonly generateCueVariants: (content: string) => Effect.Effect<string[]>
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
// Keyword extraction (pure utility, no Effect)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "this", "that", "these", "those", "it", "its", "we", "they", "them",
  "he", "she", "his", "her", "not", "no", "nor", "so", "if", "then",
  "else", "when", "where", "why", "how", "which", "what", "who", "whom",
  "about", "into", "over", "after", "before", "between", "under", "again",
  "further", "once", "here", "there", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "such", "only", "own", "same",
  "too", "very", "just", "also", "than", "then", "because", "while",
  // French stop words
  "le", "la", "les", "un", "une", "des", "du", "de", "ce", "cet", "cette",
  "ces", "et", "ou", "mais", "donc", "car", "ni", "par", "pour", "sur",
  "dans", "avec", "sans", "est", "sont", "fait", "pas", "que", "qui",
  "quoi", "dont", "où", "comment", "pourquoi", "quand", "je", "tu", "il",
  "elle", "nous", "vous", "ils", "elles", "mon", "ton", "son", "notre",
  "votre", "leur", "au", "aux", "ne", "se", "me", "te",
])

/**
 * Extract meaningful keywords from text for auto-tagging.
 * Tokenizes content, counts word frequency, filters stop words,
 * returns top N most frequent meaningful words (min 3 chars).
 *
 * Pure function — no Effect, no DB, no LLM calls.
 * Cost: O(n) string processing, negligible.
 */
export function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  // Tokenize: split on non-alphanumeric (but keep French accented chars)
  const tokens = text.toLowerCase().split(/[^a-z0-9\u00C0-\u024F]+/).filter(Boolean)

  // Count frequency
  const freq = new Map<string, number>()
  for (const token of tokens) {
    if (token.length < 3) continue // skip very short tokens
    if (STOP_WORDS.has(token)) continue // skip stop words
    freq.set(token, (freq.get(token) ?? 0) + 1)
  }

  // Sort by frequency descending, take top N
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word)
}

// ---------------------------------------------------------------------------
// Cue variant generation helpers
// ---------------------------------------------------------------------------

/** Max cue variants accepted from LLM output. */
const MAX_CUE_VARIANTS = 5

/** Maximum characters per cue variant. */
const MAX_CUE_VARIANT_LENGTH = 200

/**
 * Parse and validate LLM cue variants JSON safely.
 * Returns null when payload is invalid.
 */
export function parseCueVariantsOutput(rawText: string): string[] | null {
  try {
    const parsed = JSON.parse(rawText.trim())
    if (!Array.isArray(parsed)) return null

    const normalized = parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().slice(0, MAX_CUE_VARIANT_LENGTH))
      .filter((v) => v.length > 0)
      .slice(0, MAX_CUE_VARIANTS)

    if (normalized.length === 0) return null
    return normalized
  } catch {
    return null
  }
}

/**
 * Generate simple text-based search query variants without an LLM.
 * Extracts first sentence, first 60 chars, and first 30 chars.
 */
function generateSimpleVariants(content: string): string[] {
  const variants: string[] = []
  // First sentence as variant
  const sentences = content.split(/[.!?\n]+/).filter(s => s.trim().length > 10)
  if (sentences.length > 0) variants.push(sentences[0].trim())
  // First 60 chars
  if (content.length > 20) variants.push(content.slice(0, 60).trim())
  // First 30 chars
  if (content.length > 15) variants.push(content.slice(0, 30).trim())
  // Deduplicate
  return [...new Set(variants)].slice(0, MAX_CUE_VARIANTS)
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

    const generateCueVariants = Effect.fn("EmbeddingService.generateCueVariants")(function* (content: string) {
      // Try to use the LLM provider for intelligent query variant generation
      if (provider) {
        const modelInfo = yield* provider.defaultModel().pipe(
          Effect.catch(() => Effect.succeed(null as { providerID: string; modelID: string } | null)),
        )

        if (modelInfo) {
          const resolved = yield* provider.getModel(modelInfo.providerID as any, modelInfo.modelID as any).pipe(
            Effect.catch(() => Effect.succeed(null as any)),
          )

          if (resolved) {
            try {
              const language = yield* provider.getLanguage(resolved).pipe(
                Effect.catchTag("ProviderModelNotFoundError", () => Effect.succeed(null)),
              )
              if (!language) {
                return generateSimpleVariants(content)
              }
              const result: any = yield* Effect.promise(() =>
                (aiGenerateText as any)({
                  model: language,
                  prompt: `Generate 3-5 alternative search queries (short phrases, 2-8 words each) that would retrieve this information. Return ONLY a JSON array of strings:\n\n${content}`,
                  maxTokens: 200,
                  temperature: 0.7,
                }),
              )

              const parsed = parseCueVariantsOutput(result.text)
              if (parsed) {
                return parsed
              }
            } catch {
              // LLM call failed — fall through to simple fallback
            }
          }
        }
      }

      return generateSimpleVariants(content)
    })

    return Service.of({
      embed,
      embedMany,
      generateCueVariants,
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
