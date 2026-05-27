/**
 * MemoryConsolidation — Automatic memory decay, pruning, and deduplication.
 *
 * Consolidation policy:
 * 1. Decay confidence of old memories:
 *    - > 7 days old:   confidence *= 0.9  (‑0.1 relative)
 *    - > 30 days old:  confidence *= 0.7  (‑0.3 relative)
 *    - > 90 days old:  confidence *= 0.5  (‑0.5 relative)
 * 2. Prune (delete) memories with confidence < 0.1
 * 3. Merge near-duplicate memories (content similarity > 80%)
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

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const PRUNE_THRESHOLD = 0.1
const SIMILARITY_THRESHOLD = 0.8

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

/**
 * Compute the decay multiplier based on age.
 */
function decayMultiplier(ageMs: number): number {
  if (ageMs > NINETY_DAYS_MS) return 0.5
  if (ageMs > THIRTY_DAYS_MS) return 0.7
  if (ageMs > SEVEN_DAYS_MS) return 0.9
  return 1.0
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
      const ageMs = now - row.created_at
      const multiplier = decayMultiplier(ageMs)

      if (multiplier < 1.0) {
        const newConfidence = row.confidence * multiplier
        toDecay.push({ id: row.id, newConfidence })
        activeIds.add(row.id)

        if (dryRun) {
          details.push(
            `[DRY RUN] Would decay "${row.id}" confidence ${row.confidence.toFixed(3)} → ${newConfidence.toFixed(3)} (age=${Math.round(ageMs / 86400000)}d)`,
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
