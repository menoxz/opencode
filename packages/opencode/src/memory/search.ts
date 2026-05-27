/**
 * MemorySearch — Hybrid semantic + keyword search with BM25 + vector scoring.
 *
 * Provides tokenization, BM25 scoring, vector cosine similarity fusion,
 * and result ranking functions used by the Memory service.
 *
 * This module is stateless (pure functions) and is NOT an Effect service —
 * it is a helper consumed by the main `index.ts`.
 *
 * Hybrid scoring: final_score = α * bm25_score + (1-α) * vector_score
 *   where α (alpha) defaults to 0.4 (leaning slightly toward semantic)
 */

import { cosineSimilarity } from "./embedding"
import type { EmbeddingVector } from "./embedding"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoredMatch {
  id: string
  score: number
}

export interface SearchOptions {
  /** Maximum number of results to return (default: 10) */
  topK?: number
  /** Token budget for context text generation (default: 600) */
  tokenBudget?: number
  /** Project ID to scope the search (optional) */
  projectId?: string
  /** Hybrid score weight: 0 = pure vector, 1 = pure BM25 (default: 0.4) */
  alpha?: number
  /** Minimum score threshold to include result (default: 0) */
  minScore?: number
}

export interface HybridDocument {
  id: string
  content: string
  importance: number
  confidence: number
  /** Optional vector embedding for semantic scoring */
  embedding?: EmbeddingVector
}

export interface ScoredDocument {
  id: string
  content: string
  importance: number
  confidence: number
  score: number
  /** BM25 component score (for debugging) */
  bm25Score: number
  /** Vector component score (for debugging) */
  vectorScore: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default hybrid weight: 0.4 BM25, 0.6 semantic. */
const DEFAULT_ALPHA = 0.4

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "it", "its", "this", "that", "these", "those", "i", "you",
  "he", "she", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers",
  "ours", "theirs", "not", "no", "nor", "so", "as", "if", "then",
  "than", "too", "very", "just", "about", "above", "after", "again",
  "all", "also", "any", "because", "before", "between", "both", "each",
  "few", "more", "most", "other", "some", "such", "only", "own", "same",
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zA-Z0-9_#@$%]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

// ---------------------------------------------------------------------------
// BM25 scoring (improved with proper IDF)
// ---------------------------------------------------------------------------

/**
 * Score documents using BM25+IDF against a query.
 * Pure function — no side effects.
 */
export function scoreBM25(
  query: string,
  docs: { id: string; content: string; importance: number; confidence: number }[],
): { id: string; score: number }[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0 || docs.length === 0) return docs.map((d) => ({ id: d.id, score: 0 }))

  const docTokens = docs.map((d) => ({
    id: d.id,
    importance: d.importance,
    confidence: d.confidence,
    tokens: tokenize(d.content),
  }))

  const totalLen = docTokens.reduce((sum, d) => sum + d.tokens.length, 0)
  const avgdl = totalLen / docTokens.length || 1

  const k1 = 1.5
  const b = 0.75

  const docFreq: Map<string, number> = new Map()
  for (const token of queryTokens) {
    let count = 0
    for (const d of docTokens) {
      if (d.tokens.includes(token)) count++
    }
    docFreq.set(token, count)
  }

  const N = docTokens.length

  return docTokens.map((d) => {
    let score = 0
    for (const token of queryTokens) {
      const tf = d.tokens.filter((t) => t === token).length
      if (tf === 0) continue
      const df = docFreq.get(token) ?? 0
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)
      const docLen = d.tokens.length
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl))))
    }
    score = score * (0.5 + 0.5 * d.importance) * d.confidence
    return { id: d.id, score }
  })
}

// ---------------------------------------------------------------------------
// Hybrid ranking (BM25 + vector cosine similarity)
// ---------------------------------------------------------------------------

/**
 * Rank documents using hybrid BM25 + vector cosine similarity scoring.
 *
 * Each document receives a final score:
 *   score = α * bm25_norm + (1-α) * vector_norm
 *
 * Where bm25_norm and vector_norm are min-max normalized to [0, 1].
 */
export function hybridRank(
  query: string,
  queryVector: EmbeddingVector | null,
  docs: HybridDocument[],
  topK: number = 10,
  alpha: number = DEFAULT_ALPHA,
  minScore: number = 0,
): ScoredDocument[] {
  if (docs.length === 0) return []

  // Phase 1: Compute BM25 scores
  const bm25Results = scoreBM25(query, docs)
  const bm25Map = new Map(bm25Results.map((r) => [r.id, r.score]))

  // Phase 2: Compute vector cosine similarity scores
  const vectorResults: { id: string; score: number }[] = docs.map((d) => {
    if (queryVector && d.embedding && d.embedding.length > 0) {
      const sim = cosineSimilarity(queryVector, d.embedding)
      return { id: d.id, score: Math.max(0, sim) * d.importance * d.confidence }
    }
    return { id: d.id, score: 0 }
  })
  const vectorMap = new Map(vectorResults.map((r) => [r.id, r.score]))

  // Phase 3: Normalize BM25 scores to [0, 1]
  const bm25Scores = bm25Results.map((r) => r.score)
  const bm25Min = Math.min(...bm25Scores, 0)
  const bm25Max = Math.max(...bm25Scores, 0.001)

  // Phase 4: Normalize vector scores to [0, 1]
  const vecScores = vectorResults.map((r) => r.score)
  const vecMin = Math.min(...vecScores, 0)
  const vecMax = Math.max(...vecScores, 0.001)

  // Phase 5: Fuse scores
  const fused: ScoredDocument[] = docs.map((d) => {
    const rawBm25 = bm25Map.get(d.id) ?? 0
    const rawVec = vectorMap.get(d.id) ?? 0

    const bm25Norm = (rawBm25 - bm25Min) / (bm25Max - bm25Min)
    const vecNorm = (rawVec - vecMin) / (vecMax - vecMin)

    const finalScore = alpha * bm25Norm + (1 - alpha) * vecNorm

    return {
      id: d.id,
      content: d.content,
      importance: d.importance,
      confidence: d.confidence,
      score: finalScore,
      bm25Score: rawBm25,
      vectorScore: rawVec,
    }
  })

  // Phase 6: Sort, filter, slice
  fused.sort((a, b) => b.score - a.score)
  return fused.filter((r) => r.score >= minScore).slice(0, topK)
}

/**
 * Rank documents using BM25 only (fallback when no vectors available).
 */
export function rankDocuments(
  query: string,
  docs: { id: string; content: string; importance: number; confidence: number }[],
  topK: number = 10,
): ScoredDocument[] {
  const results = scoreBM25(query, docs)
  const scoreMap = new Map(results.map((r) => [r.id, r.score]))

  return docs
    .map((d) => ({
      ...d,
      score: scoreMap.get(d.id) ?? 0,
      bm25Score: scoreMap.get(d.id) ?? 0,
      vectorScore: 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// ---------------------------------------------------------------------------
// Context text assembly
// ---------------------------------------------------------------------------

export function assembleContextText(
  results: ScoredDocument[],
  tokenBudget: number = 600,
): string {
  if (results.length === 0) return ""

  const charBudget = tokenBudget * 4
  const parts: string[] = []
  let used = 0

  for (const r of results) {
    const header = `[score=${r.score.toFixed(3)}]`
    const line = `${header} ${r.content}`
    const lineLen = line.length + 1

    if (used + lineLen > charBudget && parts.length > 0) break
    parts.push(line)
    used += lineLen
  }

  return parts.join("\n")
}
