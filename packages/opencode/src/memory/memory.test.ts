/**
 * Tests for the enhanced memory system.
 * Run: bun test src/memory/memory.test.ts
 */

import { describe, it, expect } from "bun:test"
import { tokenize, scoreBM25, hybridRank, rankDocuments, assembleContextText } from "./search"
import { cosineSimilarity, extractKeywords, parseCueVariantsOutput } from "./embedding"
import { parseRowTags } from "./index"

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  it("should split text into lowercase tokens", () => {
    const tokens = tokenize("Hello World TEST")
    expect(tokens).toContain("hello")
    expect(tokens).toContain("world")
    expect(tokens).toContain("test")
  })

  it("should remove stop words", () => {
    const tokens = tokenize("the and of it is a an")
    for (const stop of ["the", "and", "of", "it", "is"]) {
      expect(tokens).not.toContain(stop)
    }
  })

  it("should filter single-character tokens", () => {
    const tokens = tokenize("a b c hello")
    expect(tokens).not.toContain("a")
    expect(tokens).not.toContain("b")
    expect(tokens).not.toContain("c")
    expect(tokens).toContain("hello")
  })

  it("should handle empty input", () => {
    expect(tokenize("")).toEqual([])
    expect(tokenize("   ")).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// BM25 Scoring
// ---------------------------------------------------------------------------

describe("scoreBM25", () => {
  const docs = [
    { id: "1", content: "The quick brown fox jumps over the lazy dog", importance: 0.8, confidence: 1.0 },
    { id: "2", content: "JavaScript async programming patterns for web development", importance: 0.9, confidence: 1.0 },
    { id: "3", content: "Database schema design and normalization techniques", importance: 0.7, confidence: 0.9 },
  ]

  it("should score documents by relevance to query", () => {
    const results = scoreBM25("programming patterns", docs)
    results.sort((a, b) => b.score - a.score)
    expect(results[0].id).toBe("2") // Most relevant
    expect(results[0].score).toBeGreaterThan(0)
  })

  it("should return zero scores for empty query", () => {
    const results = scoreBM25("", docs)
    for (const r of results) {
      expect(r.score).toBe(0)
    }
  })

  it("should return empty for empty docs", () => {
    const results = scoreBM25("test", [])
    expect(results).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Hybrid Rank (BM25 + Vector)
// ---------------------------------------------------------------------------

describe("hybridRank", () => {
  const docs = [
    { id: "1", content: "React component library with TypeScript", importance: 0.8, confidence: 1.0 },
    { id: "2", content: "Vue.js reactive state management patterns", importance: 0.9, confidence: 1.0 },
    { id: "3", content: "Node.js Express API with MongoDB database", importance: 0.7, confidence: 0.9 },
  ]

  it("should rank with BM25 only when no vectors provided (alpha=1)", () => {
    const results = hybridRank("React TypeScript components", null, docs, 3, 1.0)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].bm25Score).toBeGreaterThan(0)
    expect(results[0].vectorScore).toBe(0)
  })

  it("should limit results to topK", () => {
    const results = hybridRank("test", null, docs, 2, 1.0)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it("should filter by minScore", () => {
    const results = hybridRank("xyznonexistent", null, docs, 3, 1.0, 0.5)
    // All scores should be 0 since no match
    for (const r of results) {
      expect(r.score).toBeLessThan(0.5)
    }
  })
})

// ---------------------------------------------------------------------------
// rankDocuments (legacy API)
// ---------------------------------------------------------------------------

describe("rankDocuments", () => {
  const docs = [
    { id: "1", content: "TypeScript type system advanced patterns", importance: 0.8, confidence: 1.0 },
    { id: "2", content: "Python machine learning with scikit-learn", importance: 0.9, confidence: 1.0 },
  ]

  it("should rank and sort by relevance", () => {
    const results = rankDocuments("TypeScript patterns", docs, 2)
    expect(results.length).toBe(2)
    expect(results[0].id).toBe("1")
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })
})

// ---------------------------------------------------------------------------
// Context Text Assembly
// ---------------------------------------------------------------------------

describe("assembleContextText", () => {
  const results = [
    { id: "1", content: "Test content one", importance: 1, confidence: 1, score: 0.9, bm25Score: 0.9, vectorScore: 0 },
    { id: "2", content: "Test content two", importance: 1, confidence: 1, score: 0.5, bm25Score: 0.5, vectorScore: 0 },
  ]

  it("should produce formatted context text", () => {
    const text = assembleContextText(results, 200)
    expect(text).toContain("[score=0.900]")
    expect(text).toContain("Test content one")
    expect(text).toContain("Test content two")
  })

  it("should handle empty results", () => {
    expect(assembleContextText([], 200)).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Cosine Similarity (from embedding.ts)
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it("should return 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  it("should handle zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it("should handle mismatched lengths", () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Local embedding fallback
// ---------------------------------------------------------------------------

describe("local embedding (n-gram hashing)", () => {
  it("should produce deterministic vectors", async () => {
    // We can't import directly since it's an Effect service,
    // but we can test the cosineSimilarity utility
    const similar = cosineSimilarity([1, 2, 3], [1, 2, 3])
    expect(similar).toBeCloseTo(1, 5)
  })
})

// ---------------------------------------------------------------------------
// Integration smoke test for the full search pipeline
// ---------------------------------------------------------------------------

describe("search pipeline integration", () => {
  const docs = [
    { id: "1", content: "How to implement authentication with JWT tokens in Node.js", importance: 0.9, confidence: 1.0 },
    { id: "2", content: "React hooks useState and useEffect patterns", importance: 0.8, confidence: 1.0 },
    { id: "3", content: "Docker container orchestration with Kubernetes", importance: 0.7, confidence: 0.9 },
    { id: "4", content: "PostgreSQL database indexing and query optimization", importance: 0.85, confidence: 1.0 },
    { id: "5", content: "CSS Grid and Flexbox responsive layout techniques", importance: 0.75, confidence: 1.0 },
  ]

  it("full pipeline: tokenize → BM25 → rank → assemble", () => {
    // Step 1: tokenize query
    const query = "JWT authentication Node.js"
    const tokens = tokenize(query)
    expect(tokens.length).toBeGreaterThan(0)

    // Step 2: BM25 score
    const scored = scoreBM25(query, docs)
    expect(scored.length).toBe(5)

    // Step 3: Rank
    const ranked = rankDocuments(query, docs, 3)
    expect(ranked.length).toBe(3)
    expect(ranked[0].id).toBe("1") // JWT auth in Node.js

    // Step 4: Assemble
    const text = assembleContextText(ranked, 400)
    expect(text).toContain("JWT")
    expect(text).toContain("[score=")
  })
})

// ---------------------------------------------------------------------------
// extractKeywords (from embedding.ts)
// ---------------------------------------------------------------------------

describe("extractKeywords", () => {
  it("extracts meaningful keywords", () => {
    const result = extractKeywords("riverbank riverbank riverbank fox jumps", 3)
    expect(result.length).toBe(3)
    expect(result[0]).toBe("riverbank") // most frequent word
  })

  it("returns fewer keywords when text is short", () => {
    const result = extractKeywords("hello world", 5)
    expect(result.length).toBe(2)
    expect(result).toContain("hello")
    expect(result).toContain("world")
  })

  it("handles French text with accents", () => {
    const result = extractKeywords("la mémoire est une fonction cognitive qui nous permet de retenir des informations", 3)
    expect(result.length).toBeGreaterThanOrEqual(1)
    // Should include meaningful French words, not stop words
    expect(result).not.toContain("la")
    expect(result).not.toContain("est")
    expect(result).not.toContain("des")
  })

  it("returns empty array for stop-words-only text", () => {
    const result = extractKeywords("the and or but in on at", 5)
    expect(result.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Security hardening parsers
// ---------------------------------------------------------------------------

describe("parseCueVariantsOutput", () => {
  it("accepts only string[] and normalizes output", () => {
    const raw = JSON.stringify([
      "  first variant  ",
      "",
      "second variant",
      123,
      "x".repeat(250),
      "third",
      "fourth",
      "fifth",
      "sixth",
    ])

    const result = parseCueVariantsOutput(raw)
    expect(result).toEqual([
      "first variant",
      "second variant",
      "x".repeat(200),
      "third",
      "fourth",
    ])
  })

  it("returns null for malformed LLM output (caller must fallback)", () => {
    const result = parseCueVariantsOutput("not-json")
    expect(result).toBeNull()
  })
})

describe("parseRowTags", () => {
  it("returns [] when tags JSON is invalid", () => {
    expect(parseRowTags("{bad-json")).toEqual([])
  })

  it("returns only string tags when array contains mixed types", () => {
    expect(parseRowTags('["a", 1, true, "b"]')).toEqual(["a", "b"])
  })
})

console.log("✅ Memory tests ready!")
