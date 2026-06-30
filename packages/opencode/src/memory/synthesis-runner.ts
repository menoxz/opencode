/**
 * synthesis-runner — Wires the pure `synthesize()` pass to real services.
 *
 * This is the daemon-facing adapter: it builds a `SynthesisStore` over the
 * live `MemoryStore.Service`, binds a free LLM `generate` via the shared
 * model-picker (DeepSeek V4 Flash Free first), and runs one synthesis pass.
 *
 * Kept separate from triggers.ts so it stays unit-testable and so the daemon
 * trigger body remains a thin call. Requires `MemoryStore.Service` and
 * (optionally) `Provider.Service` in context — both provided by AppRuntime,
 * the same runtime under which `memoryConsolidate` already runs every 6h.
 *
 * Fail-safe: if no free model is available, the pass becomes a no-op (it never
 * throws and never spends paid credits).
 */

import { Effect } from "effect"
import { generateText as aiGenerateText } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import { Config } from "@/config/config"
import * as MemoryStore from "./store"
import { resolveFreeLanguageModel, parseJsonStringArray } from "./model-picker"
import {
  synthesize,
  defaultSynthesisConfig,
  type SynthesisStore,
  type SynthesizedMemory,
  type SynthesisRow,
  type GenerateFn,
} from "./synthesis"

const log = Log.create({ service: "memory.synthesis-runner" })

/** Build a SynthesisStore over the live MemoryStore service. */
export function makeStore(store: MemoryStore.Interface): SynthesisStore {
  return {
    getCandidates: () =>
      store.getAll().pipe(
        Effect.map((rows) =>
          rows.map(
            (r): SynthesisRow => ({
              id: r.id,
              content: r.content,
              memory_type: r.memory_type,
              project_id: r.project_id,
              importance: r.importance,
              confidence: r.confidence,
              embedding: r.embedding,
              created_at: r.created_at,
            }),
          ),
        ),
      ),

    insertSynthesized: (m: SynthesizedMemory) =>
      store.insert({
        content: m.content,
        memory_type: m.memoryType,
        tags: JSON.stringify(m.tags),
        importance: m.importance,
        project_id: m.projectId,
        source: m.source,
        confidence: 1.0,
        // Embedding is generated lazily on next retrieve/consolidate; leaving it
        // null keeps the synthesis pass free of an extra embed round-trip.
        embedding: null,
        embedding_model: null,
      }),

    link: (sourceId: string, targetId: string) =>
      store
        .createOrUpdateLink({
          sourceMemoryId: sourceId,
          targetMemoryId: targetId,
          linkType: "synthesized-from",
        })
        .pipe(Effect.asVoid),

    getCoveredSourceIds: () =>
      store.getAllLinks().pipe(
        Effect.map((links) => {
          const covered = new Set<string>()
          for (const l of links) {
            if (l.link_type === "synthesized-from") covered.add(l.target_memory_id)
          }
          return covered
        }),
      ),
  }
}

/**
 * Run one synthesis pass against the live store + a free model.
 * Returns the stats, or a zeroed result when disabled / no model.
 */
export const runSynthesis = Effect.fnUntraced(function* (dryRun: boolean = false) {
  const store = yield* MemoryStore.Service

  // Feature gate (default OFF). Reuses the experimental config namespace.
  const config = yield* Config.Service
  const cfg = yield* config.get().pipe(Effect.catch(() => Effect.succeed({} as any)))
  const enabled = cfg?.experimental?.memory?.synthesis === true
  if (!enabled) {
    log.info("memory synthesis disabled (experimental.memory.synthesis != true)")
    return { candidates: 0, clusters: 0, synthesized: 0, skipped: 0, details: ["disabled"] }
  }

  // Resolve a free language model (DeepSeek V4 Flash Free first).
  const override = cfg?.experimental?.memory?.synthesis_model
  const picked = yield* resolveFreeLanguageModel({
    override: typeof override === "string" ? override : undefined,
  })
  if (!picked) {
    log.info("no free model available, skipping synthesis")
    return { candidates: 0, clusters: 0, synthesized: 0, skipped: 0, details: ["no free model"] }
  }
  log.info("synthesis using free model", { model: picked.id })

  // Bounded, fully guarded generate. Empty string => skip that cluster.
  const generate: GenerateFn = (prompt: string) =>
    Effect.tryPromise(() =>
      (aiGenerateText as any)({
        model: picked.language,
        prompt,
        maxTokens: 120,
        temperature: 0.2,
      }),
    ).pipe(
      Effect.timeout("25 seconds"),
      Effect.map((r: any) => String(r?.text ?? "")),
      Effect.catch(() => Effect.succeed("")),
    )

  const synthStore = makeStore(store)
  const stats = yield* synthesize(synthStore, generate, parseJsonStringArray, defaultSynthesisConfig, dryRun)

  log.info("synthesis complete", {
    candidates: stats.candidates,
    clusters: stats.clusters,
    synthesized: stats.synthesized,
    skipped: stats.skipped,
  })
  return stats
})
