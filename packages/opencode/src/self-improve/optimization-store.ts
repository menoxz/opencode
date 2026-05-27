/**
 * Optimization Store — persists learned parameter profiles using the memory system.
 *
 * @module self-improve/optimization-store
 */

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as MemoryMod from "@/memory"

const log = Log.create({ service: "self-improve.optimization" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParameterProfile {
  taskType: string
  modelId: string
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  samples: number
  avgSuccessRate: number
  avgTokensUsed: number
  avgToolCalls: number
  updatedAt: number
}

export interface OptimizationStats {
  totalProfiles: number
  totalSamples: number
  avgSuccessRate: number
  bestTaskTypes: { taskType: string; successRate: number; samples: number }[]
  recentUpdates: number
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly saveProfile: (profile: ParameterProfile) => Effect.Effect<void>
  readonly getProfile: (taskType: string, modelId: string) => Effect.Effect<ParameterProfile | null>
  readonly listProfiles: (opts?: { modelId?: string; taskType?: string }) => Effect.Effect<ParameterProfile[]>
  readonly deleteProfile: (taskType: string, modelId: string) => Effect.Effect<boolean>
  readonly stats: () => Effect.Effect<OptimizationStats>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/SelfImproveOptimization") {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROFILE_TAG = "adaptive-config"
const PROFILE_PREFIX = "param-profile:"

function profileSource(taskType: string, modelId: string): string {
  return `adaptive-config/${taskType}/${modelId}`
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const memory = yield* MemoryMod.Service

    const saveProfile: Interface["saveProfile"] = (profile) =>
      Effect.gen(function* () {
        yield* memory.store({
          content: JSON.stringify(profile),
          memoryType: "procedural",
          tags: [PROFILE_TAG, profile.taskType, profile.modelId],
          importance: 0.7,
          projectId: "default",
          source: profileSource(profile.taskType, profile.modelId),
          confidence: Math.min(1, profile.samples / 10),
        })
      })

    const getProfile: Interface["getProfile"] = (taskType, modelId) =>
      Effect.gen(function* () {
        const src = profileSource(taskType, modelId)
        const items = yield* memory.retrieve(src, { topK: 5, minScore: 0.1, projectId: "default" })
        for (const r of items.results) {
          if (r.entry.source === src) {
            try { return JSON.parse(r.entry.content) as ParameterProfile }
            catch { /* skip */ }
          }
        }
        return null
      })

    const listProfiles: Interface["listProfiles"] = (opts) =>
      Effect.gen(function* () {
        const items = yield* memory.list({ memoryType: "procedural", pageSize: 100 })
        const profiles: ParameterProfile[] = []
        for (const entry of items.entries) {
          if (!entry.tags.includes(PROFILE_TAG)) continue
          if (opts?.modelId && !entry.tags.includes(opts.modelId)) continue
          if (opts?.taskType && !entry.tags.includes(opts.taskType)) continue
          try { profiles.push(JSON.parse(entry.content) as ParameterProfile) }
          catch { /* skip */ }
        }
        return profiles
      })

    const deleteProfile: Interface["deleteProfile"] = (taskType, modelId) =>
      Effect.gen(function* () {
        const src = profileSource(taskType, modelId)
        const items = yield* memory.retrieve(src, { topK: 5, minScore: 0.1, projectId: "default" })
        for (const r of items.results) {
          if (r.entry.source === src) {
            return yield* memory.delete(r.entry.id)
          }
        }
        return false
      })

    const stats: Interface["stats"] = () =>
      Effect.gen(function* () {
        const profiles = yield* listProfiles()
        const totalSamples = (profiles as ParameterProfile[]).reduce((s: number, p: ParameterProfile) => s + p.samples, 0)
        const now = Date.now()
        const recentUpdates = (profiles as ParameterProfile[]).filter((p) => now - p.updatedAt < 7 * 24 * 60 * 60 * 1000).length
        const bestByType = (profiles as ParameterProfile[])
          .filter((p) => p.samples >= 3)
          .sort((a, b) => b.avgSuccessRate - a.avgSuccessRate)
          .slice(0, 10)
          .map((p) => ({ taskType: p.taskType, successRate: p.avgSuccessRate, samples: p.samples }))

        const result: OptimizationStats = {
          totalProfiles: profiles.length,
          totalSamples,
          avgSuccessRate: totalSamples > 0
            ? (profiles as ParameterProfile[]).reduce((s: number, p: ParameterProfile) => s + p.avgSuccessRate * p.samples, 0) / totalSamples
            : 0,
          bestTaskTypes: bestByType,
          recentUpdates,
        }
        return result
      })

    return Service.of({
      saveProfile: saveProfile as any,
      getProfile: getProfile as any,
      listProfiles: listProfiles as any,
      deleteProfile: deleteProfile as any,
      stats: stats as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as SelfImproveOptimization from "./optimization-store"
