import { Context, Effect, Layer, Option } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_CORE from "./prompt/core.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { SkillUsage } from "@/skill/usage"
import { PromptComposer } from "@/prompt-composer"
import { SelfImprove } from "@/self-improve"
import type { MessageV2 } from "./message-v2"
import { rankDocuments } from "@/memory/search"
import { Config } from "@/config/config"
import { Shell } from "@/shell/shell"
import { SessionContextRollout } from "./context-rollout"
import { SECURITY_GATED_TOOLS, type SecurityMode } from "@/tool/security"

/**
 * Single unified system prompt for all models.
 * All model-specific variations removed — the core.txt contains only
 * method-level instructions. Everything else is loaded via skills on demand.
 */
export function provider(_model: Provider.Model): string[] {
  return [PROMPT_CORE]
}

const MAX_RELEVANT_SKILLS = 30

/**
 * Number of characters of a skill body folded into its retrieval text.
 * A description is a one-liner; the body is where the real vocabulary lives —
 * the symptoms, error strings and synonyms a user actually types. Ranking on
 * `name + description` alone means a skill is only findable if whoever wrote
 * its frontmatter happened to guess the user's wording.
 * Bounded so BM25 length normalisation keeps documents comparable.
 */
const SKILL_BODY_INDEX_CHARS = 2000

const skillSearchTextCache = new Map<string, string>()

function skillSearchText(skill: Skill.Info): string {
  const head = `${skill.name} ${skill.description ?? ""}`
  if (!skill.content) return head
  const key = `${skill.location}:${skill.content.length}`
  const cached = skillSearchTextCache.get(key)
  if (cached !== undefined) return cached
  const body = skill.content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, SKILL_BODY_INDEX_CHARS)
  const text = `${head} ${body}`
  if (skillSearchTextCache.size > 1000) skillSearchTextCache.clear()
  skillSearchTextCache.set(key, text)
  return text
}

/**
 * Multi-shell + tasks guidance injected into every agent's system prompt.
 * Reminds the model that shells differ across platforms, and surfaces any
 * named tasks defined in config / tasks.json so it can run them via the
 * `tasks` tool instead of hand-rolling fragile shell one-liners.
 */
export function tasksAndShellGuidance(cfg: Config.Info): string {
  const shell = Shell.acceptable(cfg.shell)
  const shellName = shell ? Shell.name(shell) : "the platform default shell"
  const tasks = cfg.tasks ?? {}
  const taskNames = Object.keys(tasks)

  const lines: string[] = [
    `<shell-and-tasks>`,
    `Shell: commands run through ${shellName} on ${process.platform}.`,
    `Shell syntax is NOT portable — POSIX shells (bash/zsh/sh) and PowerShell (pwsh)`,
    `differ on quoting, env vars, pipes, path separators, and command chaining.`,
    `Detect the active shell before writing commands; do not assume bash on Windows`,
    `(no \`tail\`/\`head\`/\`grep\` in pwsh — use \`Select-Object\`/\`Select-String\`).`,
    `Prefer cross-platform tools and absolute paths.`,
    `Terminal commands: request only the information needed for the next decision. Prefer native summary/quiet modes and selected fields; avoid verbose/debug logs and full stack traces by default.`,
    `Preserve the exit code, failure counts, error message and relevant location. For noisy commands, retain a diagnostic log and return a bounded summary with its path; inspect a targeted trace only when needed for diagnosis. Never hide failures or truncate a running producer in a way that changes its result.`,
    ``,
    `Tasks: prefer the \`tasks\` tool for repeatable project commands (build, test,`,
    `lint, run) instead of re-typing shell one-liners. Tasks come from the \`tasks\``,
    `key of opencode config and/or a workspace tasks.json (VSCode-style), support`,
    `dependsOn ordering, and stream running/done/failed status to the UI.`,
  ]
  if (taskNames.length > 0) {
    lines.push(``, `Defined tasks (run with the \`tasks\` tool, action='run'):`)
    for (const name of taskNames) {
      const t = tasks[name]!
      lines.push(`  • ${name}: ${t.description ?? t.command}`)
    }
  } else {
    lines.push(``, `No tasks are defined yet; use action='list' on the \`tasks\` tool to confirm.`)
  }
  lines.push(`</shell-and-tasks>`)
  return lines.join("\n")
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly preloadedSkills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly skills: (agent: Agent.Info, lastUserMessage?: string) => Effect.Effect<string | undefined>
  /** Adaptive system prompt composed by PromptComposer module based on detected task type. */
  readonly adaptivePrompt: (input: {
    messages: MessageV2.WithParts[]
    agent: Agent.Info
  }) => Effect.Effect<{ prompt: string | undefined; memories: Array<{ id: string; content: string }> }>
  /** Personality context section — learned user preferences for prompt adaptation. */
  readonly personality: () => Effect.Effect<string | undefined>
  /** Advertises which write/shell tools are gated based on the active security mode. */
  readonly toolList: (securityMode: SecurityMode) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const config = yield* Config.Service
    const promptComposer = yield* PromptComposer.Service
    const selfImprove = yield* Effect.serviceOption(SelfImprove.Service).pipe(Effect.map(Option.getOrUndefined))

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const cfg = yield* config.get()
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
          tasksAndShellGuidance(cfg),
        ]
      }),

      preloadedSkills: Effect.fn("SystemPrompt.preloadedSkills")(function* (agent: Agent.Info) {
        const names = [...new Set(agent.preloadSkills ?? [])]
        if (names.length === 0) return

        const parts: string[] = ["<preloaded_skills>"]
        for (const name of names) {
          if (Permission.evaluate("skill", name, agent.permission).action === "deny") {
            return yield* Effect.die(
              new Error(`Configured preload skill "${name}" is denied for agent "${agent.name}".`),
            )
          }
          const info = yield* skill.require(name).pipe(Effect.orDie)
          SkillUsage.record(info.name)
          const source = info.location
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
          parts.push(`<skill_content name="${info.name}" source="${source}">`, info.content.trim(), "</skill_content>")
        }
        parts.push("</preloaded_skills>")
        return parts.join("\n")
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info, lastUserMessage?: string) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const settings = yield* config.get()
        const rollout = SessionContextRollout.resolve(settings)

        let list = yield* skill.available(agent)
        const preloaded = new Set(agent.preloadSkills ?? [])
        list = list.filter((info) => !preloaded.has(info.name))
        if (list.length === 0) return

        // BM25 relevance filter: rank skills by semantic + keyword match
        if (lastUserMessage && list.length > MAX_RELEVANT_SKILLS) {
          const docs = list.map((s) => ({
            id: s.name,
            content: skillSearchText(s),
            importance: 1.0 as const,
            confidence: 1.0 as const,
          }))
          const ranked = rankDocuments(lastUserMessage, docs, MAX_RELEVANT_SKILLS)
          // Use the whole budget. Dropping every score==0 skill left slots unused
          // for no benefit, and the old "fewer than 3 matches" branch fell back to
          // the alphabetical head of the list, which is strictly worse than score
          // order. Ranking already put the best candidates first.
          const kept = new Set(ranked.map((r) => r.id))
          list = list.filter((s) => kept.has(s.name))
        }

        // Budget enforcement (D3). The BM25 branch above is skipped whenever the
        // turn carries no user text, and the whole catalog — 193 skills, 73 % of
        // them never loaded once in 45 days — was being emitted in that case.
        // Fall back to real usage recency and cap unconditionally; everything
        // outside the budget remains reachable through the skill_search tool.
        if (list.length > MAX_RELEVANT_SKILLS) {
          yield* Effect.promise(() => SkillUsage.ready())
          list = SkillUsage.prioritize(list, MAX_RELEVANT_SKILLS)
        }

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          Skill.fmt(list, {
            mode:
              rollout.injectionSkills === "verbose"
                ? "verbose"
                : settings.instruction_injection?.skills === "caveman"
                  ? "caveman"
                  : "summary",
          }),
        ].join("\n")
      }),

      adaptivePrompt: Effect.fn("SystemPrompt.adaptivePrompt")(function* (input: {
        messages: MessageV2.WithParts[]
        agent: Agent.Info
      }) {
        if (Permission.disabled(["skill"], input.agent.permission).has("skill")) {
          return { prompt: undefined as string | undefined, memories: [] as Array<{ id: string; content: string }> }
        }

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

        if (!lastUserText)
          return { prompt: undefined as string | undefined, memories: [] as Array<{ id: string; content: string }> }

        const detected = yield* promptComposer.detect(lastUserText)
        if (detected.confidence < 0.3)
          return { prompt: undefined as string | undefined, memories: [] as Array<{ id: string; content: string }> }

        // Compose adaptive system prompt using the full composer pipeline
        const { sections: composed, memories } = yield* promptComposer.compose({
          basePrompt: "",
          taskMessage: lastUserText,
          environmentInfo: [],
          instructions: [],
        })

        if (!composed || composed.length === 0) return { prompt: undefined as string | undefined, memories }

        const taskPrompt = promptComposer.getTaskPrompt(detected.type)
        if (!taskPrompt) return { prompt: undefined as string | undefined, memories }

        return {
          prompt: [
            `<task_context type="${detected.type}" confidence="${(detected.confidence * 100).toFixed(0)}%">`,
            taskPrompt,
            `</task_context>`,
          ].join("\n"),
          memories,
        }
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

      toolList: Effect.fn("SystemPrompt.toolList")(function* (securityMode: SecurityMode) {
        // Default interactive mode: write/shell always visible and pre-approved, nothing to advertise.
        if (securityMode === "interactive-tui") return

        const gated = Array.from(SECURITY_GATED_TOOLS).join(", ")
        if (securityMode === "eval") {
          return [
            `<tool_availability security_mode="eval">`,
            `The following tools are disabled for this run: ${gated}.`,
            `They are not present in the tool list — do not attempt to call them.`,
            `</tool_availability>`,
          ].join("\n")
        }

        return [
          `<tool_availability security_mode="cli-batch">`,
          `The following tools are visible but require explicit user approval before each execution: ${gated}.`,
          `They are not pre-approved.`,
          `</tool_availability>`,
        ].join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Skill.defaultLayer),
  Layer.provide(PromptComposer.defaultLayer),
  Layer.provide(Config.defaultLayer),
)

export * as SystemPrompt from "./system"
