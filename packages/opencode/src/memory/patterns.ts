/**
 * PatternDetector — Cross-session pattern recognition for continuous improvement.
 *
 * Analyzes memories and session data to detect:
 * - Recurring patterns (tools, workflows, errors)
 * - Success patterns (what leads to successful outcomes)
 * - Anti-patterns (what leads to errors or failures)
 * - Improvement opportunities
 *
 * This is the "meta-learning" layer of the memory system. It runs periodically
 * (or on demand) and feeds its findings back into the memory store.
 *
 * Architecture:
 * ┌──────────────┐    ┌───────────────┐    ┌──────────┐
 * │ Memory Store │───▶│ PatternDetect │───▶│ Memory   │
 * │ (all entries)│    │ - cluster()   │    │ (store)  │
 * │              │    │ - detect()    │    │          │
 * └──────────────┘    └───────────────┘    └──────────┘
 */

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as MemoryStore from "./store"
import { tokenize } from "./search"

// Tags are persisted as a JSON string. A single malformed row (external
// writer, old migration) must not abort the whole 24h pattern-detection job,
// so decode defensively — same contract as Memory.parseRowTags, duplicated
// here because index.ts already imports this module.
const rowTags = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : []
  } catch {
    return []
  }
}

const log = Log.create({ service: "memory.patterns" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecurringPattern {
  id: string
  description: string
  frequency: number
  confidence: number
  tags: string[]
  firstSeen: number
  lastSeen: number
  examples: string[]
}

export interface AntiPattern {
  id: string
  description: string
  impact: "high" | "medium" | "low"
  frequency: number
  suggestions: string[]
  relatedErrors: string[]
}

export interface SuccessPattern {
  id: string
  description: string
  frequency: number
  conditions: string[]
  outcome: string
}

export interface PatternReport {
  generatedAt: number
  totalMemoriesAnalyzed: number
  recurringPatterns: RecurringPattern[]
  antiPatterns: AntiPattern[]
  successPatterns: SuccessPattern[]
  suggestions: string[]
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Run full pattern detection across all memories. */
  readonly detect: (sinceDays?: number) => Effect.Effect<PatternReport>

  /** Find recurring error patterns (anti-patterns). */
  readonly findAntiPatterns: (entries: MemoryStore.MemoryRow[]) => Effect.Effect<AntiPattern[]>

  /** Cluster similar memories into recurring patterns. */
  readonly clusterPatterns: (entries: MemoryStore.MemoryRow[]) => Effect.Effect<RecurringPattern[]>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/PatternDetector") {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const item of a) {
    if (b.has(item)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Extract significant keywords from content (words that appear 2+ times).
 */
function extractKeywords(content: string, minFrequency: number = 2): Set<string> {
  const tokens = tokenize(content)
  const freq = new Map<string, number>()
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  return new Set(
    Array.from(freq.entries())
      .filter(([, count]) => count >= minFrequency)
      .map(([word]) => word),
  )
}

/**
 * Categorize a memory entry by content analysis.
 */
function categorizeContent(content: string, tags: string[]): string[] {
  const categories: string[] = []
  const lower = content.toLowerCase()

  if (tags.includes("architecture") || lower.includes("architecture") || lower.includes("design")) {
    categories.push("architecture")
  }
  if (tags.includes("error") || lower.includes("error") || lower.includes("bug") || lower.includes("fix")) {
    categories.push("bug-fix")
  }
  if (tags.includes("test") || lower.includes("test")) {
    categories.push("testing")
  }
  if (tags.includes("deploy") || lower.includes("deploy") || lower.includes("ci/cd")) {
    categories.push("deployment")
  }
  if (lower.includes("refactor") || lower.includes("restructur")) {
    categories.push("refactoring")
  }
  if (lower.includes("performance") || lower.includes("optimize") || lower.includes("slow")) {
    categories.push("performance")
  }
  if (lower.includes("security") || lower.includes("vulnerability") || lower.includes("auth")) {
    categories.push("security")
  }
  if (lower.includes("api") || lower.includes("endpoint") || lower.includes("route")) {
    categories.push("api")
  }
  if (lower.includes("database") || lower.includes("sql") || lower.includes("query") || lower.includes("schema")) {
    categories.push("database")
  }
  if (lower.includes("docker") || lower.includes("container") || lower.includes("kubernetes")) {
    categories.push("container")
  }

  return categories
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* MemoryStore.Service

    const clusterPatterns = Effect.fn("PatternDetector.clusterPatterns")(
      function* (entries: MemoryStore.MemoryRow[]) {
        if (entries.length === 0) return []

        const clusters: Map<string, { ids: string[]; contents: string[]; tags: Set<string> }> = new Map()

        for (const entry of entries) {
          const keywords = extractKeywords(entry.content)
          const contentKeywords = Array.from(keywords).join(" ")
          const categories = categorizeContent(entry.content, rowTags(entry.tags))

          for (const cat of categories) {
            const key = cat
            if (!clusters.has(key)) {
              clusters.set(key, { ids: [], contents: [], tags: new Set() })
            }
            const cluster = clusters.get(key)!
            cluster.ids.push(entry.id)
            cluster.contents.push(entry.content)
            for (const tag of rowTags(entry.tags)) {
              cluster.tags.add(tag)
            }
          }
        }

        const patterns: RecurringPattern[] = []
        const now = Date.now()

        for (const [category, cluster] of clusters) {
          if (cluster.ids.length < 2) continue // Need at least 2 for a pattern

          const timestamps = entries
            .filter((e) => cluster.ids.includes(e.id))
            .map((e) => e.created_at)
            .sort()

          patterns.push({
            id: `pattern-${category}-${now}`,
            description: `Recurring topic: ${category} (${cluster.ids.length} occurrences)`,
            frequency: cluster.ids.length,
            confidence: Math.min(1, cluster.ids.length / 10),
            tags: Array.from(cluster.tags).slice(0, 5),
            firstSeen: timestamps[0] ?? now,
            lastSeen: timestamps[timestamps.length - 1] ?? now,
            examples: cluster.contents.slice(0, 3),
          })
        }

        // Sort by frequency descending
        patterns.sort((a, b) => b.frequency - a.frequency)
        return patterns
      },
    )

    const findAntiPatterns = Effect.fn("PatternDetector.findAntiPatterns")(
      function* (entries: MemoryStore.MemoryRow[]) {
        const antiPatterns: AntiPattern[] = []

        // Find memories tagged as pitfalls/errors
        const pitfallEntries = entries.filter((e) => {
          const tags = rowTags(e.tags)
          return tags.includes("pitfall") || tags.includes("error") || e.memory_type === "episodic"
        })

        // Group by similar content using keyword overlap
        const groups = new Map<string, { entries: MemoryStore.MemoryRow[]; keywords: Set<string> }>()

        for (const entry of pitfallEntries) {
          const keywords = extractKeywords(entry.content, 1)
          let matched = false

          for (const [, group] of groups) {
            const sim = jaccardSimilarity(keywords, group.keywords)
            if (sim > 0.3) {
              group.entries.push(entry)
              for (const k of keywords) group.keywords.add(k)
              matched = true
              break
            }
          }

          if (!matched) {
            groups.set(entry.id, { entries: [entry], keywords })
          }
        }

        for (const [, group] of groups) {
          if (group.entries.length < 2) continue

          const errorMessages = group.entries.map((e) => e.content.slice(0, 100))
          antiPatterns.push({
            id: `anti-pattern-${group.entries[0].id}`,
            description: `Recurring issue: ${Array.from(group.keywords).slice(0, 5).join(", ")} (${group.entries.length} occurrences)`,
            impact: group.entries.length > 5 ? "high" : group.entries.length > 2 ? "medium" : "low",
            frequency: group.entries.length,
            suggestions: [
              "Review the recurring issue and create a preventive checklist",
              "Consider adding tests specifically for this pattern",
              "Document the solution in a skill for future reference",
            ],
            relatedErrors: errorMessages,
          })
        }

        antiPatterns.sort((a, b) => b.frequency - a.frequency)
        return antiPatterns
      },
    )

    const detect = Effect.fn("PatternDetector.detect")(function* (sinceDays: number = 30) {
      log.info("running pattern detection", { sinceDays })

      const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000
      const allEntries = yield* store.getAll()

      // Filter entries within the time window
      const recentEntries = allEntries.filter((e) => e.created_at >= sinceMs)

      log.info("analyzing entries for patterns", { total: allEntries.length, recent: recentEntries.length })

      // Cluster patterns
      const recurringPatterns = yield* clusterPatterns(recentEntries)

      // Find anti-patterns
      const antiPatterns = yield* findAntiPatterns(allEntries)

      // Find success patterns (from high-confidence, high-importance memories)
      const successEntries = allEntries.filter((e) => e.confidence >= 0.8 && e.importance >= 0.7)
      const successPatterns: SuccessPattern[] = successEntries.slice(0, 10).map((e) => ({
        id: `success-${e.id}`,
        description: e.content.slice(0, 200),
        frequency: Math.round(e.confidence * 10),
        conditions: [`confidence >= ${e.confidence}`, `importance >= ${e.importance}`],
        outcome: "Positive (high confidence + importance)",
      }))

      // Generate suggestions
      const suggestions: string[] = []
      if (antiPatterns.length > 0) {
        suggestions.push(`Corriger ${antiPatterns.length} anti-pattern(s) récurrent(s) détecté(s)`)
      }
      if (recurringPatterns.length > 0) {
        suggestions.push(`Créer des skills pour les ${recurringPatterns.length} patterns récurrents identifiés`)
      }
      if (successPatterns.length > 0) {
        suggestions.push("Documenter et reproduire les patterns de succès identifiés")
      }
      if (allEntries.length < 10) {
        suggestions.push("Continuer à stocker des connaissances — plus de données = meilleurs patterns")
      }

      const report: PatternReport = {
        generatedAt: Date.now(),
        totalMemoriesAnalyzed: allEntries.length,
        recurringPatterns,
        antiPatterns,
        successPatterns,
        suggestions,
      }

      log.info("pattern detection complete", {
        patterns: recurringPatterns.length,
        antiPatterns: antiPatterns.length,
        successPatterns: successPatterns.length,
      })

      return report
    })

    return Service.of({
      detect,
      findAntiPatterns: findAntiPatterns as any,
      clusterPatterns: clusterPatterns as any,
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(MemoryStore.defaultLayer))

export const use = serviceUse(Service)

export * as PatternDetector from "."
