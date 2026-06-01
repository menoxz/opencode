import { Context, Effect, Layer, Option } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_CORE from "./prompt/core.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { PromptComposer } from "@/prompt-composer"
import { SelfImprove } from "@/self-improve"
import type { MessageV2 } from "./message-v2"
import { rankDocuments } from "@/memory/search"

/**
 * Single unified system prompt for all models.
 * All model-specific variations removed — the core.txt contains only
 * method-level instructions. Everything else is loaded via skills on demand.
 */
export function provider(_model: Provider.Model): string[] {
  return [PROMPT_CORE]
}

const MAX_RELEVANT_SKILLS = 30

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info, lastUserMessage?: string) => Effect.Effect<string | undefined>
  /** Adaptive system prompt composed by PromptComposer module based on detected task type. */
  readonly adaptivePrompt: (input: {
    messages: MessageV2.WithParts[]
    agent: Agent.Info
  }) => Effect.Effect<string | undefined>
  /** Personality context section — learned user preferences for prompt adaptation. */
  readonly personality: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const promptComposer = yield* PromptComposer.Service
    const selfImprove = yield* Effect.serviceOption(SelfImprove.Service).pipe(Effect.map(Option.getOrUndefined))

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
        ]
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info, lastUserMessage?: string) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        let list = yield* skill.available(agent)

        // BM25 relevance filter: rank skills by semantic + keyword match
        if (lastUserMessage && list.length > MAX_RELEVANT_SKILLS) {
          const docs = list.map((s) => ({
            id: s.name,
            content: `${s.name} ${s.description ?? ""}`,
            importance: 1.0 as const,
            confidence: 1.0 as const,
          }))
          const ranked = rankDocuments(lastUserMessage, docs, MAX_RELEVANT_SKILLS)
          const kept = new Set(ranked.filter((r) => r.score > 0).map((r) => r.id))
          if (kept.size >= 3) {
            list = list.filter((s) => kept.has(s.name))
          } else {
            list = list.slice(0, MAX_RELEVANT_SKILLS)
          }
        }

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),

      adaptivePrompt: Effect.fn("SystemPrompt.adaptivePrompt")(function* (input: {
        messages: MessageV2.WithParts[]
        agent: Agent.Info
      }) {
        if (Permission.disabled(["skill"], input.agent.permission).has("skill")) return

        // Extract the latest user text message to detect task type
        let lastUserText: string | undefined
        for (const m of input.messages.toReversed()) {
          for (const p of m.parts) {
            if (p.type === "text" && !(p as any).synthetic && typeof (p as any).text === "string") {
              lastUserText = (p as any).text as string
              break
            }
          }
          if (lastUserText) break
        }

        if (!lastUserText) return

        const detected = yield* promptComposer.detect(lastUserText)
        if (detected.confidence < 0.3) return

        // Compose adaptive system prompt using the full composer pipeline
        const composed = yield* promptComposer.compose({
          basePrompt: "",
          taskMessage: lastUserText,
          environmentInfo: [],
          instructions: [],
        })

        if (!composed || composed.length === 0) return

        const taskPrompt = promptComposer.getTaskPrompt(detected.type)
        if (!taskPrompt) return

        return [
          `<task_context type="${detected.type}" confidence="${(detected.confidence * 100).toFixed(0)}%">`,
          taskPrompt,
          `</task_context>`,
        ].join("\n")
      }),

      personality: Effect.fn("SystemPrompt.personality")(function* () {
        if (!selfImprove) return
        const profile = yield* selfImprove.getUserProfile()

        // Only inject personality context when enough session data exists
        if (profile.sessionsCompleted < 3) return

        const config = yield* selfImprove.generatePersonalityConfig()

        const lines: string[] = [
          `<personality_context>`,
          `  <verbosity level="${config.verbosity.toFixed(1)}">${profile.communicationStyle}</verbosity>`,
          `  <tool_suggestions enabled="${config.toolSuggestions}" />`,
          `  <error_prevention level="${config.errorPrevention}" />`,
          `  <exploration mode="${config.exploration}" />`,
        ]

        if (profile.preferredTools.length > 0) {
          lines.push(`  <preferred_tools>${profile.preferredTools.join(", ")}</preferred_tools>`)
        }
        if (profile.commonTaskTypes.length > 0) {
          lines.push(`  <common_tasks>${profile.commonTaskTypes.join(", ")}</common_tasks>`)
        }
        if (profile.preferredAgents.length > 0) {
          lines.push(`  <preferred_agents>${profile.preferredAgents.join(", ")}</preferred_agents>`)
        }

        lines.push(`  <sessions_completed>${profile.sessionsCompleted}</sessions_completed>`)
        lines.push(`</personality_context>`)

        return lines.join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Skill.defaultLayer),
  Layer.provide(PromptComposer.defaultLayer),
)

export * as SystemPrompt from "./system"
