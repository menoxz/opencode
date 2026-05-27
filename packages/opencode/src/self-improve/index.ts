/**
 * Self-Improvement System — learns optimal parameters and patterns from experience.
 *
 * @module self-improve
 */

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as SelfImproveOptMod from "./optimization-store"
import type { ParameterProfile, OptimizationStats } from "./optimization-store"

const log = Log.create({ service: "self-improve" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionOutcome {
  sessionId: string
  taskType: string
  modelId: string
  success: boolean
  tokensUsed: number
  toolCalls: number
  errors: string[]
  durationMs: number
  paramsUsed: {
    temperature?: number
    topP?: number
    maxOutputTokens?: number
  }
}

export interface ImprovementTip {
  category: "param-tuning" | "prompt-pattern" | "tool-usage" | "general"
  title: string
  description: string
  expectedImpact: "high" | "medium" | "low"
  applicableTo: string[]
}

export interface SelfImproveReport {
  totalSessionsAnalyzed: number
  avgSuccessRate: number
  profiles: OptimizationStats
  tips: ImprovementTip[]
  topPerformingConfigs: { taskType: string; modelId: string; successRate: number; samples: number }[]
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  readonly recordOutcome: (outcome: SessionOutcome) => Effect.Effect<void>
  readonly getOptimalParams: (
    taskType: string,
    modelId: string,
    currentParams: { temperature?: number; topP?: number; maxOutputTokens?: number },
  ) => Effect.Effect<{ temperature?: number; topP?: number; maxOutputTokens?: number; confidence: number }>
  readonly generateTips: () => Effect.Effect<ImprovementTip[]>
  readonly report: () => Effect.Effect<SelfImproveReport>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/SelfImprove") {}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

const SMOOTHING_FACTOR = 0.2

/**
 * Update a ParameterProfile with a new session outcome.
 * Uses exponential moving average. Exported for testing.
 */
export function updateProfile(
  existing: ParameterProfile | null,
  outcome: SessionOutcome,
): ParameterProfile {
  const base = existing ?? {
    taskType: outcome.taskType,
    modelId: outcome.modelId,
    samples: 0,
    avgSuccessRate: 0,
    avgTokensUsed: 0,
    avgToolCalls: 0,
    updatedAt: 0,
  }

  const newSamples = base.samples + 1
  const alpha = 1 / Math.min(newSamples, 1 / SMOOTHING_FACTOR)

  return {
    taskType: outcome.taskType,
    modelId: outcome.modelId,
    temperature: outcome.paramsUsed.temperature,
    topP: outcome.paramsUsed.topP,
    maxOutputTokens: outcome.paramsUsed.maxOutputTokens,
    samples: newSamples,
    avgSuccessRate: base.avgSuccessRate * (1 - alpha) + (outcome.success ? 1 : 0) * alpha,
    avgTokensUsed: base.avgTokensUsed * (1 - alpha) + outcome.tokensUsed * alpha,
    avgToolCalls: base.avgToolCalls * (1 - alpha) + outcome.toolCalls * alpha,
    updatedAt: Date.now(),
  }
}

function computeParamAdjustment(
  profile: ParameterProfile | null,
  current: { temperature?: number; topP?: number; maxOutputTokens?: number },
): { temperature?: number; topP?: number; maxOutputTokens?: number } {
  if (!profile || profile.samples < 2) return { ...current }
  return {
    temperature: profile.temperature ?? current.temperature,
    topP: profile.topP ?? current.topP,
    maxOutputTokens: profile.maxOutputTokens ?? current.maxOutputTokens,
  }
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const optStore = yield* SelfImproveOptMod.Service

    const recordOutcome: Interface["recordOutcome"] = (outcome) =>
      Effect.gen(function* () {
        if (!outcome.taskType || outcome.taskType === "general") return
        const existing = yield* optStore.getProfile(outcome.taskType, outcome.modelId)
        const updated = updateProfile(existing, outcome)
        yield* optStore.saveProfile(updated)
        log.info("recorded session outcome", {
          taskType: outcome.taskType,
          model: outcome.modelId,
          success: outcome.success,
          samples: updated.samples,
          avgSuccessRate: updated.avgSuccessRate.toFixed(2),
        })
      })

    const getOptimalParams: Interface["getOptimalParams"] = (taskType, modelId, currentParams) =>
      Effect.gen(function* () {
        const profile = yield* optStore.getProfile(taskType, modelId)
        if (!profile || profile.samples < 3) {
          return { ...currentParams, confidence: 0 }
        }
        const adjusted = computeParamAdjustment(profile, currentParams)
        const confidence = Math.min(1, profile.samples / 20) * profile.avgSuccessRate
        return { ...adjusted, confidence }
      })

    const generateTips: Interface["generateTips"] = () =>
      Effect.gen(function* () {
        const profiles: ParameterProfile[] = yield* optStore.listProfiles()
        const tips: ImprovementTip[] = []

        if (!profiles.length) return tips

        const profilesByType = new Map<string, ParameterProfile[]>()
        for (const p of profiles) {
          const list = profilesByType.get(p.taskType) ?? []
          list.push(p)
          profilesByType.set(p.taskType, list)
        }

        for (const [taskType, typeProfiles] of profilesByType) {
          const avgRate = typeProfiles.reduce((s: number, p: ParameterProfile) => s + p.avgSuccessRate, 0) / typeProfiles.length
          if (avgRate < 0.5 && typeProfiles.length >= 3) {
            const best = typeProfiles.reduce((a: ParameterProfile, b: ParameterProfile) =>
              a.avgSuccessRate > b.avgSuccessRate ? a : b,
            )
            tips.push({
              category: "param-tuning",
              title: `Tune parameters for "${taskType}" tasks`,
              description: `Current avg success rate: ${(avgRate * 100).toFixed(0)}%. Best config: temp=${best.temperature ?? "default"}, topP=${best.topP ?? "default"} with ${(best.avgSuccessRate * 100).toFixed(0)}% success (${best.samples} samples)`,
              expectedImpact: "high",
              applicableTo: [taskType],
            })
          }
        }
        return tips
      })

    const report: Interface["report"] = () => {
      const eff = Effect.gen(function* () {
        const allResult: any = yield* Effect.all([
          (optStore.stats() as any) as Effect.Effect<OptimizationStats>,
          (generateTips() as any) as Effect.Effect<ImprovementTip[]>,
          (optStore.listProfiles() as any) as Effect.Effect<ParameterProfile[]>,
        ])
        const optStats: OptimizationStats = allResult[0]
        const tips: ImprovementTip[] = allResult[1]
        const typedProfiles: ParameterProfile[] = allResult[2]
        const topPerforming = typedProfiles
          .filter((p) => p.samples >= 3)
          .sort((a, b) => b.avgSuccessRate - a.avgSuccessRate)
          .slice(0, 10)
          .map((p) => ({
            taskType: p.taskType,
            modelId: p.modelId,
            successRate: p.avgSuccessRate,
            samples: p.samples,
          }))

        const result: SelfImproveReport = {
          totalSessionsAnalyzed: optStats.totalSamples,
          avgSuccessRate: optStats.avgSuccessRate,
          profiles: optStats,
          tips,
          topPerformingConfigs: topPerforming,
        }
        return result
      }) as any
      return eff
    }

    return Service.of({
      recordOutcome: recordOutcome as any,
      getOptimalParams: getOptimalParams as any,
      generateTips: generateTips as any,
      report: report as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as SelfImprove from "./index"
