/**
 * Self-Improvement System — learns optimal parameters and patterns from experience.
 *
 * @module self-improve
 */

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import * as SelfImproveOptMod from "./optimization-store"
import * as MemoryMod from "@/memory"
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
// Adaptive Personality Types
// ---------------------------------------------------------------------------

export interface UserProfile {
  preferredTools: string[]
  preferredAgents: string[]
  commonTaskTypes: string[]
  communicationStyle: "concise" | "detailed" | "balanced"
  errorSensitivity: "high" | "medium" | "low"
  successRateByTaskType: Record<string, number>
  sessionsCompleted: number
  lastActive: number
}

export interface InteractionRecord {
  sessionId: string
  taskType: string
  toolsUsed: string[]
  agentsUsed: string[]
  messageLength: "short" | "medium" | "long"
  assistantResponseLength: "short" | "medium" | "long"
  success: boolean
  errorCount: number
}

export interface PersonalityConfig {
  verbosity: number
  toolSuggestions: boolean
  errorPrevention: "relaxed" | "normal" | "strict"
  exploration: "conservative" | "balanced" | "aggressive"
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

  // Adaptive personality
  readonly getUserProfile: () => Effect.Effect<UserProfile>
  readonly recordInteraction: (interaction: InteractionRecord) => Effect.Effect<void>
  readonly generatePersonalityConfig: () => Effect.Effect<PersonalityConfig>
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

export function applyLearnedParams<T extends { temperature?: number; topP?: number; maxOutputTokens?: number }>(
  current: T,
  learned: { temperature?: number; topP?: number; maxOutputTokens?: number; confidence: number },
  threshold = 0.6,
): T {
  if (learned.confidence < threshold) return current
  return {
    ...current,
    ...(learned.temperature === undefined ? {} : { temperature: learned.temperature }),
    ...(learned.topP === undefined ? {} : { topP: learned.topP }),
    ...(learned.maxOutputTokens === undefined ? {} : { maxOutputTokens: learned.maxOutputTokens }),
  }
}

export function storedProfileFromMemoryEntries(
  entries: Iterable<{ source?: string; content: string }>,
  source: string,
): ParameterProfile | null {
  let best: ParameterProfile | null = null
  for (const entry of entries) {
    if (entry.source !== source) continue
    try {
      const parsed = JSON.parse(entry.content) as ParameterProfile
      if (!best || (parsed.samples ?? 0) > (best.samples ?? 0)) best = parsed
    } catch {
      // Ignore corrupt legacy entries and keep scanning for a usable cumulative profile.
    }
  }
  return best
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

    // -------------------------------------------------------------------
    // Adaptive Personality
    // -------------------------------------------------------------------

    const memory = yield* MemoryMod.Service

    const INTERACTION_TAG = "user-interaction"
    const DEFAULT_PROJECT = "default"

    const recordInteraction: Interface["recordInteraction"] = (interaction) =>
      Effect.gen(function* () {
        yield* memory.store({
          content: JSON.stringify(interaction),
          memoryType: "episodic",
          tags: [INTERACTION_TAG, `session:${interaction.sessionId}`],
          importance: 0.6,
          projectId: DEFAULT_PROJECT,
          source: `interaction/${interaction.sessionId}`,
          confidence: 1.0,
        })
        log.info("interaction recorded", {
          sessionId: interaction.sessionId,
          taskType: interaction.taskType,
          success: interaction.success,
        })
      })

    const getUserProfile: Interface["getUserProfile"] = () =>
      Effect.gen(function* () {
        // Get stored user preferences
        const prefs = yield* optStore.getAllUserPreferences()

        // Get all interaction records
        const items = yield* memory.list({ memoryType: "episodic", pageSize: 200 })
        const interactions: InteractionRecord[] = []
        for (const entry of items.entries) {
          if (!entry.tags.includes(INTERACTION_TAG)) continue
          try {
            interactions.push(JSON.parse(entry.content) as InteractionRecord)
          } catch { /* skip malformed entries */ }
        }

        const sessionsCompleted = interactions.length
        const lastActive = sessionsCompleted > 0
          ? Math.max(...interactions.map((i) => Date.now()))
          : Date.now()

        // Aggregate preferred tools (top 5 by frequency)
        const toolCounts = new Map<string, number>()
        for (const i of interactions) {
          for (const t of i.toolsUsed) {
            toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1)
          }
        }
        const preferredTools = [...toolCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tool]) => tool)

        // Aggregate preferred agents (top 5)
        const agentCounts = new Map<string, number>()
        for (const i of interactions) {
          for (const a of i.agentsUsed) {
            agentCounts.set(a, (agentCounts.get(a) ?? 0) + 1)
          }
        }
        const preferredAgents = [...agentCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([agent]) => agent)

        // Aggregate common task types (top 5)
        const taskCounts = new Map<string, number>()
        for (const i of interactions) {
          taskCounts.set(i.taskType, (taskCounts.get(i.taskType) ?? 0) + 1)
        }
        const commonTaskTypes = [...taskCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([type]) => type)

        // Compute success rate per task type
        const taskSuccess: Record<string, { success: number; total: number }> = {}
        for (const i of interactions) {
          const acc = taskSuccess[i.taskType] ?? { success: 0, total: 0 }
          acc.total++
          if (i.success) acc.success++
          taskSuccess[i.taskType] = acc
        }
        const successRateByTaskType: Record<string, number> = {}
        for (const [type, acc] of Object.entries(taskSuccess)) {
          successRateByTaskType[type] = acc.total > 0 ? acc.success / acc.total : 0
        }

        // Communication style from preference or derive from avg message length
        let communicationStyle: UserProfile["communicationStyle"] = "balanced"
        const storedStyle = prefs["communication-style"]
        if (storedStyle === "concise" || storedStyle === "detailed" || storedStyle === "balanced") {
          communicationStyle = storedStyle
        } else if (interactions.length >= 3) {
          const shortCount = interactions.filter((i) => i.messageLength === "short").length
          const longCount = interactions.filter((i) => i.messageLength === "long").length
          if (shortCount > longCount && shortCount > interactions.length / 2) {
            communicationStyle = "concise"
          } else if (longCount > shortCount && longCount > interactions.length / 2) {
            communicationStyle = "detailed"
          }
        }

        // Error sensitivity from preference or derive from error rate
        let errorSensitivity: UserProfile["errorSensitivity"] = "medium"
        const storedSensitivity = prefs["error-sensitivity"]
        if (storedSensitivity === "high" || storedSensitivity === "medium" || storedSensitivity === "low") {
          errorSensitivity = storedSensitivity
        } else if (interactions.length >= 5) {
          const totalErrors = interactions.reduce((s, i) => s + i.errorCount, 0)
          const avgErrors = totalErrors / interactions.length
          if (avgErrors > 2) {
            errorSensitivity = "high"
          } else if (avgErrors < 0.5) {
            errorSensitivity = "low"
          }
        }

        return {
          preferredTools,
          preferredAgents,
          commonTaskTypes,
          communicationStyle,
          errorSensitivity,
          successRateByTaskType,
          sessionsCompleted,
          lastActive,
        } satisfies UserProfile
      })

    const generatePersonalityConfig: Interface["generatePersonalityConfig"] = () =>
      Effect.gen(function* () {
        const profile = yield* getUserProfile()

        // Verbosity based on communication style
        const verbosity = profile.communicationStyle === "concise" ? 0.3
          : profile.communicationStyle === "detailed" ? 0.8
          : 0.5

        // Show tool suggestions when user has completed enough sessions
        const toolSuggestions = profile.sessionsCompleted >= 3

        // Error prevention based on sensitivity
        const errorPrevention: PersonalityConfig["errorPrevention"] = 
          profile.errorSensitivity === "high" ? "strict"
          : profile.errorSensitivity === "low" ? "relaxed"
          : "normal"

        // Exploration based on experience level
        const exploration: PersonalityConfig["exploration"] =
          profile.sessionsCompleted < 5 ? "conservative"
          : profile.sessionsCompleted > 20 ? "aggressive"
          : "balanced"

        return { verbosity, toolSuggestions, errorPrevention, exploration } satisfies PersonalityConfig
      })

    return Service.of({
      recordOutcome: recordOutcome as any,
      getOptimalParams: getOptimalParams as any,
      generateTips: generateTips as any,
      report: report as any,
      getUserProfile: getUserProfile as any,
      recordInteraction: recordInteraction as any,
      generatePersonalityConfig: generatePersonalityConfig as any,
    })
  }),
)

export const defaultLayer = layer
export const use = serviceUse(Service)
export * as SelfImprove from "./index"
