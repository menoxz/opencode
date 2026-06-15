/**
 * MemoryConsolidation — Automatic memory decay, pruning, and deduplication.
 *
 * Consolidation policy:
 * 1. Decay confidence using exponential forgetting curve: confidence *= e^(-λ * daysSinceAccess)
 *    - λ is per memory type (semantic=0.01, episodic=0.05, procedural=0.005, profile=0.02)
 *    - λ can be overridden per memory via `forgetting_rate` field
 * 2. Spaced repetition: stable memories (conf >= 0.8, access > 5) are flagged for slower decay
 * 3. Accelerated decay: unused memories (conf < 0.3, access <= 2, age > 30d) are flagged for pruning
 * 4. Prune (delete) memories with confidence < 0.1
 * 5. Merge near-duplicate memories (content similarity > 80%)
 *
 * This module is a helper consumed by the main Memory service in `index.ts`.
 * It is NOT an Effect service — it exports pure functions that receive a
 * store interface.
 */

import { Effect } from "effect"
import type { MemoryRow } from "./store"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationStats {
  decayed: number
  pruned: number
  merged: number
  remainingBefore: number
  remainingAfter: number
  details: string[]
}

export interface ConsolidationStore {
  readonly getAll: () => Effect.Effect<MemoryRow[]>
  readonly updateConfidence: (id: string, confidence: number) => Effect.Effect<void>
  readonly updateContent: (id: string, content: string) => Effect.Effect<void>
  readonly deleteById: (id: string) => Effect.Effect<boolean>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRUNE_THRESHOLD = 0.1
const SIMILARITY_THRESHOLD = 0.8

// Forgetting rates (λ) per memory type
// Half-life = ln(2) / λ
const FORGETTING_RATES: Record<string, number> = {
  semantic: 0.01,    // half-life ~69 days — facts persist
  episodic: 0.05,    // half-life ~14 days — events fade faster
  procedural: 0.005, // half-life ~139 days — how-to knowledge
  profile: 0.02,     // half-life ~35 days — user preferences
  learning: 0.01,    // half-life ~69 days — same as semantic
  pattern: 0.005,    // half-life ~139 days — same as procedural
}

const DEFAULT_FORGETTING_RATE = 0.01

// Spaced repetition parameters
const SPACED_REPETITION_CONFIDENCE_THRESHOLD = 0.8
const SPACED_REPETITION_ACCESS_THRESHOLD = 5
const SPACED_REPETITION_LAMBDA_REDUCTION = 0.95

const ACCELERATED_DECAY_CONFIDENCE_THRESHOLD = 0.3
const ACCELERATED_DECAY_ACCESS_THRESHOLD = 2
const ACCELERATED_DECAY_AGE_DAYS = 30
const ACCELERATED_DECAY_LAMBDA_INCREASE = 1.05

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a simple Jaccard-style content similarity between two strings.
 * Tokenizes both strings and compares the token sets.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function contentSimilarity(a: string, b: string): number {
  const tokensA = new Set(
    a
      .toLowerCase()
      .split(/[^a-zA-Z0-9_#@$%]+/)
      .filter((t) => t.length > 1),
  )
  const tokensB = new Set(
    b
      .toLowerCase()
      .split(/[^a-zA-Z0-9_#@$%]+/)
      .filter((t) => t.length > 1),
  )

  if (tokensA.size === 0 && tokensB.size === 0) return 1
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++
  }

  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/**
 * Run a full consolidation cycle.
 *
 * @param store   A subset of the MemoryStore interface (only what we need)
 * @param dryRun  If true, only report what would happen without mutating
 * @returns       ConsolidationStats with counts of decayed/pruned/merged entries
 */
export function consolidate(
  store: ConsolidationStore,
  dryRun: boolean = false,
): Effect.Effect<ConsolidationStats> {
  return Effect.gen(function* () {
    const now = Date.now()
    const details: string[] = []

    const allRows = yield* store.getAll()
    const remainingBefore = allRows.length

    let decayed = 0
    let pruned = 0
    let toPrune: string[] = []
    let toDecay: { id: string; newConfidence: number }[] = []
    const activeIds = new Set<string>()

    // Phase 1: decay & identify pruning candidates
    for (const row of allRows) {
      // Compute days since last access (or since creation if never accessed)
      const daysSinceAccess = (row.last_access_at ?? row.created_at)
        ? (now - (row.last_access_at ?? row.created_at)) / 86400000
        : (now - row.created_at) / 86400000

      // Get forgetting rate: per-memory override, or type default, or global default
      const lambda = (row.forgetting_rate ?? FORGETTING_RATES[row.memory_type]) ?? DEFAULT_FORGETTING_RATE

      // Exponential forgetting curve: R = e^(-λ * t)
      const multiplier = Math.exp(-lambda * Math.max(0, daysSinceAccess))

      if (multiplier < 1.0) {
        const newConfidence = row.confidence * multiplier
        toDecay.push({ id: row.id, newConfidence })
        activeIds.add(row.id)

        if (dryRun) {
          details.push(
            `[DRY RUN] Would decay "${row.id}" confidence ${row.confidence.toFixed(3)} → ${newConfidence.toFixed(3)} (λ=${lambda}, age=${Math.round(daysSinceAccess)}d)`,
          )
        }
        decayed++

        // Prune if below threshold after decay
        if (newConfidence < PRUNE_THRESHOLD) {
          toPrune.push(row.id)
          if (dryRun) {
            details.push(
              `[DRY RUN] Would prune "${row.id}" (confidence ${newConfidence.toFixed(3)} < ${PRUNE_THRESHOLD})`,
            )
          }
          pruned++
        }

        // Spaced repetition: if memory is stable, slow down its decay
        if (newConfidence >= SPACED_REPETITION_CONFIDENCE_THRESHOLD && (row.access_count ?? 0) > SPACED_REPETITION_ACCESS_THRESHOLD) {
          // This memory survives well — give it slower decay
          // Note: we don't modify the row here, we just track it
          details.push(`Spaced repetition: ${row.id} (conf=${newConfidence.toFixed(2)}, accesses=${row.access_count})`)
        }

        // Accelerated decay: low confidence, low access, old
        const ageDays = (now - row.created_at) / 86400000
        if (newConfidence < ACCELERATED_DECAY_CONFIDENCE_THRESHOLD &&
            (row.access_count ?? 0) < ACCELERATED_DECAY_ACCESS_THRESHOLD &&
            ageDays > ACCELERATED_DECAY_AGE_DAYS) {
          // This memory isn't being used — accelerate its decay
          // Note: λ adjustment happens during Phase 2 sleep cycle, not here
          details.push(`Candidate for accelerated decay: ${row.id} (age=${Math.round(ageDays)}d, accesses=${row.access_count})`)
        }
      } else {
        activeIds.add(row.id)
      }
    }

    // Phase 2: merge near-duplicates (among active, non-pruned entries)
    let merged = 0
    const mergedIds = new Set<string>()
    const mergeActions: { keepId: string; removeId: string; mergedContent: string }[] = []

    if (!dryRun) {
      // Only merge non-pruned entries
      const pruneSet = new Set(toPrune)
      const candidates = allRows.filter((r) => !pruneSet.has(r.id) && !mergedIds.has(r.id))

      for (let i = 0; i < candidates.length; i++) {
        if (mergedIds.has(candidates[i].id)) continue
        for (let j = i + 1; j < candidates.length; j++) {
          if (mergedIds.has(candidates[j].id)) continue

          const sim = contentSimilarity(candidates[i].content, candidates[j].content)
          if (sim >= SIMILARITY_THRESHOLD) {
            // Merge: keep the one with higher importance, combine content
            const keep = candidates[i].importance >= candidates[j].importance ? candidates[i] : candidates[j]
            const remove = candidates[i].importance >= candidates[j].importance ? candidates[j] : candidates[i]

            // Only merge if same project and type
            if (keep.project_id !== remove.project_id || keep.memory_type !== remove.memory_type) continue

            mergedIds.add(remove.id)
            merged++

            const mergedContent = `${keep.content}\n\n[Merged from duplicate: ${remove.content}]`
            mergeActions.push({
              keepId: keep.id,
              removeId: remove.id,
              mergedContent,
            })
          }
        }
      }
    }

    // Phase 3: apply mutations (only if not dry run)
    if (!dryRun) {
      // Apply confidence decay
      for (const item of toDecay) {
        if (toPrune.includes(item.id)) continue // skip pruning candidates
        yield* store.updateConfidence(item.id, item.newConfidence)
        details.push(
          `Decayed "${item.id}" confidence → ${item.newConfidence.toFixed(3)}`,
        )
      }

      // Apply merges
      for (const action of mergeActions) {
        yield* store.updateContent(action.keepId, action.mergedContent)
        yield* store.deleteById(action.removeId)
        details.push(
          `Merged "${action.removeId}" into "${action.keepId}" (similarity >= ${SIMILARITY_THRESHOLD})`,
        )
      }

      // Prune low-confidence entries
      for (const id of toPrune) {
        yield* store.deleteById(id)
        details.push(`Pruned "${id}" (confidence < ${PRUNE_THRESHOLD})`)
      }
    }

    const allRowsAfter = dryRun ? allRows : yield* store.getAll()
    const remainingAfter = dryRun
      ? remainingBefore - pruned - merged
      : allRowsAfter.length

    return {
      decayed: dryRun ? toDecay.length : decayed,
      pruned,
      merged,
      remainingBefore,
      remainingAfter,
      details,
    }
  })
}
