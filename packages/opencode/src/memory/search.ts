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
  /** Session ID to boost context matches (optional) */
  sessionId?: string
  /** Hybrid score weight: 0 = pure vector, 1 = pure BM25 (default: 0.4) */
  alpha?: number
  /** Minimum score threshold to include result (default: 0) */
  minScore?: number
  /** Composite ranker weights for recency/importance/feedback/diversity */
  rank?: RankWeights
}

export interface HybridDocument {
  id: string
  content: string
  importance: number
  confidence: number
  /** Optional vector embedding for semantic scoring */
  embedding?: EmbeddingVector
  /** UNIX timestamp of memory creation (ms) */
  createdAt?: number
  /** UNIX timestamp of last access (ms) */
  lastAccessAt?: number
  /** Explicit user feedback: +1 upvote, -1 downvote, 0 neutral */
  feedback?: number
  /** Project scope */
  projectId?: string
  /** Memory type: procedural/semantic/episodic/profile/pattern/... */
  memoryType?: string
  /** Session that produced the encoding */
  sessionId?: string
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
  /** Composite component score (for debugging) */
  compositeScore?: number
}

/** Weighting options for the composite memory ranker. */
export interface RankWeights {
  /** Base relevance weight (default: 1.0) */
  relevance?: number
  /** Recency boost weight (default: 0.5) */
  recency?: number
  /** Importance signal weight (default: 0.4) */
  importance?: number
  /** Confidence signal weight (default: 0.2) */
  confidence?: number
  /** Explicit feedback signal weight (default: 0.3) */
  feedback?: number
  /** Same project/session context boost weight (default: 0.25) */
  context?: number
  /** Diversity penalty weight via maximal marginal relevance (default: 0.4) */
  diversity?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default hybrid weight: 0.4 BM25, 0.6 semantic. */
const DEFAULT_ALPHA = 0.4

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

// Closed-class function words only: determiners, pronouns, prepositions,
// conjunctions, auxiliaries and degree adverbs. Open-class words are never
// listed here, because a word like "value", "state", "return" or "person"
// carries real meaning in a technical query.
const STOP_WORDS = new Set([
  // --- English ---
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

  // --- French ---
  // Without these, a French query is scored almost entirely on "de", "le",
  // "pour", "dans"... Those tokens survive tokenisation, so the few documents
  // that happen to be written in French win every French query regardless of
  // their actual topic. Measured on a 176-skill corpus: every content token of
  // the query had df=0 while "de" had df=15 and decided the whole ranking.
  // determiners and articles
  "le", "la", "les", "un", "une", "des", "du", "au", "aux", "ce", "cet",
  "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "notre", "nos", "votre", "vos", "leur", "leurs", "chaque", "tout", "tous",
  "toute", "toutes", "quelque", "quelques", "plusieurs", "aucun", "aucune",
  // pronouns
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "moi",
  "toi", "lui", "eux", "se", "ceci", "cela", "celui", "celle", "ceux",
  "celles", "qui", "que", "quoi", "dont", "lequel", "laquelle", "lesquels",
  "lesquelles", "chacun", "chacune", "rien", "soi", "leur",
  // prepositions
  "de", "en", "dans", "sur", "sous", "par", "pour", "avec", "sans", "vers",
  "chez", "entre", "parmi", "depuis", "pendant", "avant", "apres", "après",
  "contre", "selon", "malgre", "malgré", "jusqu", "jusque", "des", "hors",
  "outre", "envers", "durant",
  // conjunctions
  "et", "ou", "mais", "donc", "ni", "car", "si", "comme", "lorsque",
  "puisque", "quand", "quoique", "sinon", "ainsi", "cependant", "neanmoins",
  "neanmoins", "néanmoins", "toutefois", "pourtant", "afin",
  // auxiliaries: etre
  "suis", "es", "est", "sommes", "etes", "êtes", "sont", "etais", "étais",
  "etait", "était", "etions", "étions", "etaient", "étaient", "serai",
  "sera", "serons", "serez", "seront", "serais", "serait", "soit", "soient",
  "sois", "soyez", "ete", "été", "etant", "étant", "etre", "être",
  // auxiliaries: avoir
  "ai", "as", "avons", "avez", "ont", "avais", "avait", "avions", "aviez",
  "avaient", "aurai", "aura", "aurons", "aurez", "auront", "aurais",
  "aurait", "eu", "ayant", "ayez", "avoir",
  // modals and light verbs
  "peut", "peux", "peuvent", "pouvait", "pourrait", "pourrais", "doit",
  "doivent", "devra", "devrait", "faut", "va", "vais", "vas", "vont",
  // degree and frequency adverbs
  "tres", "très", "plus", "moins", "aussi", "encore", "deja", "déjà",
  "toujours", "jamais", "souvent", "parfois", "beaucoup", "trop", "assez",
  "presque", "environ", "seulement", "surtout", "vraiment", "alors",
  "ensuite", "puis", "ici", "meme", "même", "memes", "mêmes",
  // negation and misc
  "ne", "pas", "non", "oui", "etc", "voici", "voila", "voilà",
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Match Unicode letters + numbers + common symbols — NOT punctuation/spaces
    // This ensures French accented chars (é, è, ê, à, ç, etc.) stay as word
    // content rather than being treated as delimiters by [a-zA-Z].
    .split(/[^\p{L}\p{N}_#@$%]+/u)
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

  // Term frequencies are precomputed once per document. The previous version
  // rescanned the whole token array with includes()/filter() for every query
  // term, which is quadratic and made indexing anything longer than a short
  // description prohibitively slow.
  const docTokens = docs.map((d) => {
    const tokens = tokenize(d.content)
    const freq = new Map<string, number>()
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
    return { id: d.id, importance: d.importance, confidence: d.confidence, length: tokens.length, freq }
  })

  const totalLen = docTokens.reduce((sum, d) => sum + d.length, 0)
  const avgdl = totalLen / docTokens.length || 1

  const k1 = 1.5
  const b = 0.75

  const uniqueQueryTokens = [...new Set(queryTokens)]
  const docFreq: Map<string, number> = new Map()
  for (const token of uniqueQueryTokens) {
    let count = 0
    for (const d of docTokens) {
      if (d.freq.has(token)) count++
    }
    docFreq.set(token, count)
  }

  const N = docTokens.length

  return docTokens.map((d) => {
    let score = 0
    for (const token of queryTokens) {
      const tf = d.freq.get(token) ?? 0
      if (tf === 0) continue
      const df = docFreq.get(token) ?? 0
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1)
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (d.length / avgdl))))
    }
    score = score * (0.5 + 0.5 * d.importance) * d.confidence
    return { id: d.id, score }
  })
}

// ---------------------------------------------------------------------------
// Hybrid ranking (BM25 + vector cosine similarity)
// ---------------------------------------------------------------------------

function minutesSince(timestamp: number): number {
  return (Date.now() - timestamp) / (60 * 1000)
}

function recencyScore(minutes: number, halfLifeMinutes: number): number {
  // exponential decay: 1.0 when fresh, 0.5 at halfLife, ~0 far away
  const x = minutes / halfLifeMinutes
  return Math.exp(-0.693 * x)
}

function cosineDistance(a: EmbeddingVector, b: EmbeddingVector): number {
  const sim = cosineSimilarity(a, b)
  return 1 - Math.max(-1, Math.min(1, sim))
}

/** Apply Maximal Marginal Relevance to diversify results while keeping relevance. */
function applyMMR(
  scoredDocs: ScoredDocument[],
  embeddings: Map<string, EmbeddingVector>,
  topK: number,
  lambda: number,
  minScore: number,
): ScoredDocument[] {
  if (scoredDocs.length === 0) return []
  const pool = [...scoredDocs]
  const selected: ScoredDocument[] = []
  const selectedEmbeddings: EmbeddingVector[] = []

  // Always pick the top relevant document first
  const first = pool.shift()
  if (!first) return []
  selected.push(first)
  const firstEmb = embeddings.get(first.id)
  if (firstEmb) selectedEmbeddings.push(firstEmb)

  while (selected.length < topK && pool.length > 0) {
    let bestIdx = -1
    let bestMmr = -Infinity

    for (let i = 0; i < pool.length; i++) {
      const doc = pool[i]
      if ((doc.compositeScore ?? 0) < minScore) continue
      const emb = embeddings.get(doc.id)
      let redundancy = 0
      if (emb && selectedEmbeddings.length > 0) {
        redundancy = Math.max(...selectedEmbeddings.map((se) => 1 - cosineDistance(emb, se)))
      }
      const mmr = lambda * (doc.compositeScore ?? 0) - (1 - lambda) * redundancy
      if (mmr > bestMmr) {
        bestMmr = mmr
        bestIdx = i
      }
    }

    if (bestIdx === -1) break
    const chosen = pool.splice(bestIdx, 1)[0]
    selected.push(chosen)
    const chosenEmb = embeddings.get(chosen.id)
    if (chosenEmb) selectedEmbeddings.push(chosenEmb)
  }

  return selected
}

/**
 * Rank documents using a composite memory model.
 *
 *   composite = relevance
 *             + recencyWeight    * recency
 *             + importanceWeight * importance
 *             + confidenceWeight * confidence
 *             + feedbackWeight   * feedback
 *             + contextWeight    * contextBoost
 *
 * Then results are re-ranked with Maximal Marginal Relevance to ensure
 * diversity (procedural vs semantic vs episodic etc.) and avoid echo chambers.
 *
 * The public `score` preserves the original hybrid BM25/vector relevance for
 * API compatibility; `compositeScore` in the returned object exposes the
 * enriched score for observability.
 */
export function hybridRank(
  query: string,
  queryVector: EmbeddingVector | null,
  docs: HybridDocument[],
  topK: number = 10,
  alpha: number = DEFAULT_ALPHA,
  minScore: number = 0,
  contextProjectId?: string,
  contextSessionId?: string,
  weights: RankWeights = {},
): ScoredDocument[] {
  if (docs.length === 0) return []

  // Phase 1: Base relevance (BM25 + vector)
  const bm25Results = scoreBM25(query, docs)
  const bm25Map = new Map(bm25Results.map((r) => [r.id, r.score]))

  const vectorResults: { id: string; score: number }[] = docs.map((d) => {
    if (queryVector && d.embedding && d.embedding.length > 0) {
      const sim = cosineSimilarity(queryVector, d.embedding)
      return { id: d.id, score: Math.max(0, sim) * d.importance * d.confidence }
    }
    return { id: d.id, score: 0 }
  })
  const vectorMap = new Map(vectorResults.map((r) => [r.id, r.score]))

  const bm25Scores = bm25Results.map((r) => r.score)
  const bm25Max = Math.max(...bm25Scores, 0.001)
  const vecScores = vectorResults.map((r) => r.score)
  const vecMax = Math.max(...vecScores, 0.001)

  const relevanceMap = new Map<string, number>()
  for (const d of docs) {
    const rawBm25 = bm25Map.get(d.id) ?? 0
    const rawVec = vectorMap.get(d.id) ?? 0
    const relevance = alpha * (rawBm25 / bm25Max) + (1 - alpha) * (rawVec / vecMax)
    relevanceMap.set(d.id, relevance)
  }

  // Phase 2: Composite scoring
  const now = Date.now()
  const wRelevance = weights.relevance ?? 1.0
  const wRecency = weights.recency ?? 0.5
  const wImportance = weights.importance ?? 0.4
  const wConfidence = weights.confidence ?? 0.2
  const wFeedback = weights.feedback ?? 0.3
  const wContext = weights.context ?? 0.25

  const candidates: ScoredDocument[] = docs.map((d) => {
    const relevance = relevanceMap.get(d.id) ?? 0
    const createdMin = d.createdAt ? Math.max(0, (now - d.createdAt) / (60 * 1000)) : Number.POSITIVE_INFINITY
    const accessMin = d.lastAccessAt
      ? Math.max(0, (now - d.lastAccessAt) / (60 * 1000))
      : createdMin

    const recency =
      recencyScore(createdMin, 60 * 24) * 0.35 +
      recencyScore(accessMin, 60 * 6) * 0.65

    const importance = d.importance ?? 0.5
    const confidence = d.confidence ?? 0.75
    const feedback = (d.feedback ?? 0) * 0.15

    let contextBoost = 0
    if (contextProjectId && d.projectId === contextProjectId) contextBoost += 0.2
    if (contextSessionId && d.sessionId === contextSessionId) contextBoost += 0.1

    const composite =
      relevance * wRelevance +
      recency * wRecency * 0.3 +
      importance * wImportance * 0.15 +
      confidence * wConfidence * 0.1 +
      feedback * wFeedback +
      contextBoost * wContext

    return {
      id: d.id,
      content: d.content,
      importance: d.importance ?? 0.5,
      confidence: d.confidence ?? 0.75,
      score: relevance, // keep original relevance for callers
      bm25Score: bm25Map.get(d.id) ?? 0,
      vectorScore: vectorMap.get(d.id) ?? 0,
      compositeScore: composite,
    }
  })

  candidates.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))

  // Phase 3: Maximal Marginal Relevance for diversity
  const embeddings = new Map<string, EmbeddingVector>()
  for (const d of docs) {
    if (d.embedding) embeddings.set(d.id, d.embedding)
  }
  const lambda = 1 - (weights.diversity ?? 0.4)
  const selected = applyMMR(candidates, embeddings, topK, lambda, minScore / 4)

  // final sort by composite score for presentation
  return selected.sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
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
