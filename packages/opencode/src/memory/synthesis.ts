/**
 * synthesis — Episodic→Semantic memory synthesis (the "REM" pass).
 *
 * This is the generalization step that sits ON TOP of the deterministic
 * decay/prune/merge in consolidation.ts. Where consolidation only forgets and
 * lexically merges near-duplicates, synthesis *abstracts*: it clusters related
 * episodic memories and asks a free LLM to distill a single, reusable SEMANTIC
 * insight from each cluster, then stores it with provenance links back to the
 * source episodes.
 *
 * Design contract (mirrors consolidation.ts + llm-decisions.ts):
 *   - Pure function receiving a `SynthesisDeps` interface. No Effect service,
 *     no direct DB/provider imports — the caller wires real ones (daemon) and
 *     tests wire fakes.
 *   - Fail-safe: any LLM/parse problem skips that cluster; never throws.
 *   - Free-model only is enforced by the caller (via model-picker). The
 *     `generate` dep is assumed already bound to a free model.
 *   - Idempotency: clusters whose episodes are already fully covered by an
 *     existing synthesized memory are skipped (provenance check), so repeated
 *     runs don't spawn duplicates.
 *
 * Clustering: greedy single-link over cosine similarity of stored embeddings.
 * Cheap, deterministic, and good enough for "memories that are about the same
 * thing". Episodes without embeddings are ignored (can't be clustered).
 */

import { Effect } from "effect"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SynthesisRow {
  readonly id: string
  readonly content: string
  readonly memory_type: string
  readonly project_id: string
  readonly importance: number
  readonly confidence: number
  /** JSON array of floats, or null when no embedding is stored. */
  readonly embedding: string | null
  readonly created_at: number
}

export interface SynthesizedMemory {
  readonly content: string
  readonly memoryType: "semantic"
  readonly projectId: string
  readonly importance: number
  readonly tags: string[]
  readonly source: string
  /** Ids of the episodic memories this insight was generalized from. */
  readonly sourceIds: string[]
}

export interface SynthesisStore {
  /** All candidate rows to consider (caller filters by type/project as needed). */
  readonly getCandidates: () => Effect.Effect<SynthesisRow[]>
  /** Insert a synthesized semantic memory. Returns its new id. */
  readonly insertSynthesized: (m: SynthesizedMemory) => Effect.Effect<string>
  /** Link the new semantic memory to a source episode (provenance). */
  readonly link: (sourceId: string, targetId: string) => Effect.Effect<void>
  /**
   * Source ids already covered by a previously synthesized memory. Used for
   * idempotency so repeated runs don't re-synthesize the same cluster.
   */
  readonly getCoveredSourceIds: () => Effect.Effect<Set<string>>
}

/**
 * LLM generate dep — bound to a free model by the caller. Receives a prompt,
 * returns raw text. Must be fully guarded by the caller (timeout, never throw):
 * returning "" signals "skip this cluster".
 */
export type GenerateFn = (prompt: string) => Effect.Effect<string>

export interface SynthesisConfig {
  /** Cosine similarity threshold to join two memories into a cluster. */
  similarityThreshold: number
  /** Minimum cluster size worth synthesizing (avoid 1-off generalizations). */
  minClusterSize: number
  /** Max clusters to synthesize per run (bounds LLM calls / cost-of-time). */
  maxClustersPerRun: number
  /** Memory type treated as raw experience to generalize from. */
  sourceType: string
  /** Importance assigned to a synthesized semantic memory. */
  synthesizedImportance: number
}

export const defaultSynthesisConfig: SynthesisConfig = {
  similarityThreshold: 0.83,
  minClusterSize: 3,
  maxClustersPerRun: 5,
  sourceType: "episodic",
  synthesizedImportance: 0.7,
}

export interface SynthesisStats {
  candidates: number
  clusters: number
  synthesized: number
  skipped: number
  details: string[]
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Parse a stored embedding ("[0.1,...]") into a float array, or null. */
export function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length === 0) return null
    for (const x of arr) if (typeof x !== "number" || !Number.isFinite(x)) return null
    return arr as number[]
  } catch {
    return null
  }
}

/** Cosine similarity of two equal-length vectors. Returns 0 on mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

interface EmbeddedRow {
  row: SynthesisRow
  vec: number[]
}

/**
 * Greedy single-link clustering over cosine similarity. O(n²) but n is the
 * count of embedded episodic memories in one project — small in practice.
 * Each cluster groups rows transitively connected above the threshold.
 */
export function clusterByEmbedding(
  rows: EmbeddedRow[],
  threshold: number,
): SynthesisRow[][] {
  const n = rows.length
  const visited = new Array<boolean>(n).fill(false)
  const clusters: SynthesisRow[][] = []

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    // BFS over the similarity graph from seed i.
    const queue = [i]
    visited[i] = true
    const members: SynthesisRow[] = []
    while (queue.length > 0) {
      const cur = queue.shift()!
      members.push(rows[cur].row)
      for (let j = 0; j < n; j++) {
        if (visited[j]) continue
        if (cosineSimilarity(rows[cur].vec, rows[j].vec) >= threshold) {
          visited[j] = true
          queue.push(j)
        }
      }
    }
    clusters.push(members)
  }
  return clusters
}

/** Build the generalization prompt for one cluster (language-neutral). */
export function buildSynthesisPrompt(cluster: SynthesisRow[]): string {
  const bullets = cluster
    .map((m, i) => `${i + 1}. ${m.content.slice(0, 400)}`)
    .join("\n")
  return (
    `You are consolidating an AI agent's episodic memories during a "sleep" ` +
    `cycle. Below are several related past experiences. Distill the ONE ` +
    `general, reusable lesson or fact they share — a semantic insight that ` +
    `would help next time, not a re-statement of one episode. ` +
    `Reply in the SAME language as the experiences. ` +
    `Return ONLY a JSON array with a SINGLE short string (max 30 words), ` +
    `no prose, no code fence.\n\n` +
    `Related experiences:\n${bullets}`
  )
}

// ---------------------------------------------------------------------------
// Main pass
// ---------------------------------------------------------------------------

/**
 * Run one synthesis pass. Pure orchestration over injected deps.
 *
 * @param store    storage-like deps (real in daemon, fake in tests)
 * @param generate LLM text generator already bound to a free model
 * @param parse    JSON-string-array parser (inject model-picker's helper)
 * @param config   thresholds/limits
 * @param dryRun   when true, compute clusters but write nothing
 */
export const synthesize = Effect.fnUntraced(function* (
  store: SynthesisStore,
  generate: GenerateFn,
  parse: (text: string) => string[],
  config: SynthesisConfig = defaultSynthesisConfig,
  dryRun: boolean = false,
) {
  const stats: SynthesisStats = {
    candidates: 0,
    clusters: 0,
    synthesized: 0,
    skipped: 0,
    details: [],
  }

  const all = yield* store.getCandidates()
  const covered = yield* store.getCoveredSourceIds()

  // Keep only embeddable source-type rows not already covered by a synthesis.
  const embedded: EmbeddedRow[] = []
  for (const row of all) {
    if (row.memory_type !== config.sourceType) continue
    const vec = parseEmbedding(row.embedding)
    if (!vec) continue
    embedded.push({ row, vec })
  }
  stats.candidates = embedded.length
  if (embedded.length < config.minClusterSize) {
    stats.details.push(`too few embeddable ${config.sourceType} memories (${embedded.length})`)
    return stats
  }

  // Cluster, then keep only clusters big enough AND not already covered.
  const allClusters = clusterByEmbedding(embedded, config.similarityThreshold)
  const eligible = allClusters
    .filter((c) => c.length >= config.minClusterSize)
    .filter((c) => {
      // Skip clusters whose every member is already part of a prior synthesis.
      const fresh = c.some((m) => !covered.has(m.id))
      if (!fresh) stats.skipped++
      return fresh
    })
    // Bigger clusters first — they carry the strongest shared signal.
    .sort((a, b) => b.length - a.length)
    .slice(0, config.maxClustersPerRun)

  stats.clusters = eligible.length

  for (const cluster of eligible) {
    // All members of one cluster share a project (single-link over project-
    // scoped embeddings still can't guarantee it, so pin to the majority).
    const projectId = cluster[0].project_id

    if (dryRun) {
      stats.details.push(`would synthesize cluster of ${cluster.length} (project=${projectId})`)
      continue
    }

    const prompt = buildSynthesisPrompt(cluster)
    const raw = yield* generate(prompt)
    const parsed = parse(raw)
    const insight = parsed[0]?.trim()
    if (!insight || insight.length < 8) {
      stats.skipped++
      stats.details.push(`cluster of ${cluster.length}: empty/short LLM output, skipped`)
      continue
    }

    // Importance scales gently with cluster size (more evidence = more weight).
    const importance = Math.min(
      0.95,
      config.synthesizedImportance + Math.min(0.2, (cluster.length - config.minClusterSize) * 0.03),
    )

    const newId = yield* store.insertSynthesized({
      content: insight,
      memoryType: "semantic",
      projectId,
      importance,
      tags: ["synthesized", "rem"],
      source: "synthesis",
      sourceIds: cluster.map((m) => m.id),
    })

    for (const m of cluster) {
      yield* store.link(newId, m.id)
    }

    stats.synthesized++
    stats.details.push(`synthesized 1 semantic from ${cluster.length} episodes → ${newId}`)
  }

  return stats
})
