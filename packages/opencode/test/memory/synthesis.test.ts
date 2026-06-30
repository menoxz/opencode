import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  cosineSimilarity,
  parseEmbedding,
  clusterByEmbedding,
  buildSynthesisPrompt,
  synthesize,
  defaultSynthesisConfig,
  type SynthesisRow,
  type SynthesisStore,
  type SynthesizedMemory,
  type GenerateFn,
} from "../../src/memory/synthesis"

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("parseEmbedding", () => {
  test("parses a valid float array", () => {
    expect(parseEmbedding("[0.1,0.2,0.3]")).toEqual([0.1, 0.2, 0.3])
  })
  test("rejects null / empty / non-array / NaN", () => {
    expect(parseEmbedding(null)).toBeNull()
    expect(parseEmbedding("[]")).toBeNull()
    expect(parseEmbedding('{"a":1}')).toBeNull()
    expect(parseEmbedding("[1,\"x\"]")).toBeNull()
    expect(parseEmbedding("not json")).toBeNull()
  })
})

describe("cosineSimilarity", () => {
  test("identical vectors → 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6)
  })
  test("orthogonal vectors → 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })
  test("opposite vectors → -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6)
  })
})

describe("clusterByEmbedding", () => {
  const mk = (id: string, vec: number[]) => ({
    row: { id } as any,
    vec,
  })
  test("groups near vectors, separates far ones", () => {
    const rows = [
      mk("a", [1, 0]),
      mk("b", [0.99, 0.01]),
      mk("c", [0.98, 0.02]),
      mk("z", [0, 1]),
    ]
    const clusters = clusterByEmbedding(rows, 0.9)
    const big = clusters.find((c) => c.length >= 3)
    expect(big).toBeDefined()
    expect(big!.map((m) => m.id).sort()).toEqual(["a", "b", "c"])
  })
})

describe("buildSynthesisPrompt", () => {
  test("includes every cluster member's content", () => {
    const cluster = [
      { id: "1", content: "fixed flaky test by adding await", project_id: "p" } as any,
      { id: "2", content: "another flaky test fixed via await", project_id: "p" } as any,
    ]
    const prompt = buildSynthesisPrompt(cluster)
    expect(prompt).toContain("await")
    expect(prompt).toContain("flaky")
  })
})

// ---------------------------------------------------------------------------
// synthesize() — with fake store + fake generate
// ---------------------------------------------------------------------------

function fakeRow(id: string, content: string, vec: number[]): SynthesisRow {
  return {
    id,
    content,
    memory_type: "episodic",
    project_id: "p",
    importance: 0.5,
    confidence: 1,
    embedding: JSON.stringify(vec),
    created_at: Date.now(),
  }
}

function makeFakeStore(rows: SynthesisRow[]) {
  const inserted: SynthesizedMemory[] = []
  const links: Array<{ source: string; target: string }> = []
  let covered = new Set<string>()
  let nextId = 0
  const store: SynthesisStore = {
    getCandidates: () => Effect.succeed(rows),
    insertSynthesized: (m) =>
      Effect.sync(() => {
        inserted.push(m)
        return `syn-${nextId++}`
      }),
    link: (sourceId, targetId) =>
      Effect.sync(() => {
        links.push({ source: sourceId, target: targetId })
      }),
    getCoveredSourceIds: () => Effect.succeed(covered),
  }
  return {
    store,
    inserted,
    links,
    setCovered: (ids: string[]) => (covered = new Set(ids)),
  }
}

const config = { ...defaultSynthesisConfig, sourceType: "episodic", minClusterSize: 3 }

describe("synthesize", () => {
  test("clusters episodes and stores one semantic memory with provenance links", async () => {
    const rows = [
      fakeRow("a", "fixed flaky test with await", [1, 0]),
      fakeRow("b", "flaky test resolved by await", [0.99, 0.01]),
      fakeRow("c", "await fixed the flaky test", [0.98, 0.02]),
    ]
    const f = makeFakeStore(rows)
    const generate: GenerateFn = () => Effect.succeed('["Always await async assertions in tests."]')
    const parse = (raw: string) => {
      try {
        const v = JSON.parse(raw)
        return Array.isArray(v) ? v.map(String) : []
      } catch {
        return []
      }
    }

    const stats = await Effect.runPromise(synthesize(f.store, generate, parse, config, false))

    expect(stats.candidates).toBe(3)
    expect(stats.clusters).toBe(1)
    expect(stats.synthesized).toBe(1)
    expect(f.inserted).toHaveLength(1)
    expect(f.inserted[0]!.memoryType).toBe("semantic")
    expect(f.inserted[0]!.content).toContain("await")
    // One provenance link per source episode.
    expect(f.links).toHaveLength(3)
    expect(f.links.map((l) => l.target).sort()).toEqual(["a", "b", "c"])
  })

  test("idempotent: skips a cluster already fully covered", async () => {
    const rows = [
      fakeRow("a", "x", [1, 0]),
      fakeRow("b", "y", [0.99, 0.01]),
      fakeRow("c", "z", [0.98, 0.02]),
    ]
    const f = makeFakeStore(rows)
    f.setCovered(["a", "b", "c"])
    const generate: GenerateFn = () => Effect.succeed('["insight"]')
    const parse = () => ["insight"]

    const stats = await Effect.runPromise(synthesize(f.store, generate, parse, config, false))

    expect(stats.synthesized).toBe(0)
    expect(stats.skipped).toBeGreaterThanOrEqual(1)
    expect(f.inserted).toHaveLength(0)
  })

  test("dryRun does not write", async () => {
    const rows = [
      fakeRow("a", "x", [1, 0]),
      fakeRow("b", "y", [0.99, 0.01]),
      fakeRow("c", "z", [0.98, 0.02]),
    ]
    const f = makeFakeStore(rows)
    const generate: GenerateFn = () => Effect.succeed('["insight"]')
    const parse = () => ["insight"]

    const stats = await Effect.runPromise(synthesize(f.store, generate, parse, config, true))

    expect(stats.synthesized).toBe(0)
    expect(f.inserted).toHaveLength(0)
    expect(f.links).toHaveLength(0)
  })

  test("empty/short LLM output is skipped, never throws", async () => {
    const rows = [
      fakeRow("a", "x", [1, 0]),
      fakeRow("b", "y", [0.99, 0.01]),
      fakeRow("c", "z", [0.98, 0.02]),
    ]
    const f = makeFakeStore(rows)
    const generate: GenerateFn = () => Effect.succeed("")
    const parse = () => [] as string[]

    const stats = await Effect.runPromise(synthesize(f.store, generate, parse, config, false))

    expect(stats.synthesized).toBe(0)
    expect(stats.skipped).toBeGreaterThanOrEqual(1)
    expect(f.inserted).toHaveLength(0)
  })

  test("too few candidates → no clusters", async () => {
    const rows = [fakeRow("a", "x", [1, 0]), fakeRow("b", "y", [0.99, 0.01])]
    const f = makeFakeStore(rows)
    const generate: GenerateFn = () => Effect.succeed('["insight"]')
    const parse = () => ["insight"]

    const stats = await Effect.runPromise(synthesize(f.store, generate, parse, config, false))

    expect(stats.clusters).toBe(0)
    expect(stats.synthesized).toBe(0)
  })
})
