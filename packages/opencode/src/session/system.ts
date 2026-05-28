import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_DEEPSEEK from "./prompt/deepseek.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { PromptComposer } from "@/prompt-composer"
import type { MessageV2 } from "./message-v2"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("deepseek")) return [PROMPT_DEEPSEEK]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  /** Adaptive system prompt composed by PromptComposer module based on detected task type. */
  readonly adaptivePrompt: (input: {
    messages: MessageV2.WithParts[]
    agent: Agent.Info
  }) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const promptComposer = yield* PromptComposer.Service

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

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

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
        // We pass only what we have available in this context
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
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Skill.defaultLayer),
  Layer.provide(PromptComposer.defaultLayer),
)

export * as SystemPrompt from "./system"
