import { Context, Effect, Layer, Option } from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { createHash } from "node:crypto"

import { InstanceState } from "@/effect/instance-state"

import * as Log from "@opencode-ai/core/util/log"
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
import { SkillSelect } from "@/skill/select"
import { JevSkills } from "@/jev/skills"
import { JevClient } from "@/jev/client"
import { Config } from "@/config/config"
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

const log = Log.create({ service: "system-prompt" })

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

/**
 * Verdicts of the LLM skill selector, keyed by agent + prompt.
 *
 * The verdict is *advisory*: the deterministic ranking below is a correct answer
 * on its own. It therefore never sits on the step's critical path — a refresh
 * runs in the background (one flight per key) and the next step picks the result
 * up. Measured on a 258-message session: awaiting it held a step for 227 s while
 * the auto-picked endpoint stalled and a full CPU core stayed busy, and because
 * the saturated thread never ran the timer, neither its 20 s timeout nor any
 * watchdog could fire — the TUI's keyboard went with it.
 */
const skillSelectionCache = new Map<string, string[]>()
const skillSelectionInflight = new Set<string>()

const skillSelectionKey = (agent: string, prompt: string) =>
  `${agent}\u0000${createHash("sha1").update(prompt).digest("hex")}`

const skillSelection = {
  peek(agent: string, prompt: string): string[] | undefined {
    return skillSelectionCache.get(skillSelectionKey(agent, prompt))
  },
  /** Claims a refresh slot. `undefined` means a verdict exists or one is in flight. */
  begin(agent: string, prompt: string): string | undefined {
    const key = skillSelectionKey(agent, prompt)
    if (skillSelectionInflight.has(key) || skillSelectionCache.has(key)) return undefined
    skillSelectionInflight.add(key)
    return key
  },
  settle(key: string, names: string[] | undefined) {
    skillSelectionInflight.delete(key)
    // A failure is not cached: the next step may retry it. Only a real verdict is.
    if (names === undefined) return
    if (skillSelectionCache.size > 100) skillSelectionCache.clear()
    skillSelectionCache.set(key, names)
  },
}

function skillSearchText(skill: Skill.Info): string {
  const head = `${skill.name} ${skill.description ?? ""}`
  if (!skill.content) return head
  // Key by a content hash, not length: a same-length body edit reused stale ranking text.
  const key = `${skill.location}:${createHash("sha256").update(skill.content).digest("hex")}`
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

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<{ stable: string; runtime: string }>
  readonly preloadedSkills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly skills: (agent: Agent.Info, lastUserMessage?: string, sessionID?: string) => Effect.Effect<string | undefined>
  /** Adaptive system prompt composed by PromptComposer module based on detected task type. */
  readonly adaptivePrompt: (input: {
    messages: MessageV2.WithParts[]
    agent: Agent.Info
  }) => Effect.Effect<{ prompt: string | undefined; memories: Array<{ id: string; content: string }> }>
  /** Personality context section — learned user preferences for prompt adaptation. */
  readonly personality: () => Effect.Effect<string | undefined>
  /** Advertises which write/shell tools are gated based on the active security mode. */
  readonly toolList: (securityMode: SecurityMode) => Effect.Effect<string | undefined>
  /** Monotonic skill revision, so callers can drop caches when skills reload. */
  readonly skillRevision: () => Effect.Effect<number>
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
        return {
          runtime: [
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
          // Usage guidance now lives in the tool definitions (shell, tasks);
          // only the runtime environment block stays in the system prompt.
          stable: "",
        }
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

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info, lastUserMessage?: string, sessionID?: string) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const settings = yield* config.get()
        const rollout = SessionContextRollout.resolve(settings)

        const availableStart = Date.now()
        let list = yield* skill.available(agent)
        const availableMs = Date.now() - availableStart
        const preloaded = new Set(agent.preloadSkills ?? [])
        list = list.filter((info) => !preloaded.has(info.name))
        if (list.length === 0) return

        // Jev decides which skills are worth injecting, when enabled and keyed.
        // One closed "does this task need this skill?" question per candidate,
        // judged on meaning rather than on wording, and with NO fixed cap: the
        // count follows the request, so injecting zero or a hundred are both valid
        // outcomes. A disabled, keyless or unreachable Jev yields undefined here
        // (see JevSkills.select) and the lexical fallback below runs unchanged.
        const jev = settings.jev
        // Always build the transport from `FetchHttpClient` here rather than
        // reusing whatever `HttpClient.HttpClient` the ambient context holds.
        // The selector is on the critical path of the step — nothing can be sent
        // to the model until it answers — so it must not inherit middleware it
        // neither controls nor can bound. Measured on a live install: the same
        // request answered in ~130 ms on the dedicated transport while the step
        // through the ambient one was parked for 285 s, one core pegged, no log
        // line, and the interrupt key reaching nothing.
        const jevHttp =
          lastUserMessage && sessionID && JevSkills.skillsApplies(jev?.skills, list.length)
            ? yield* HttpClient.HttpClient.pipe(Effect.provide(FetchHttpClient.layer))
            : undefined
        const selectStart = Date.now()
        const jevSelected =
          jevHttp && lastUserMessage
            ? yield* JevSkills.select(jevHttp, jev, {
                prompt: lastUserMessage,
                skills: list.map((s) => ({ name: s.name, description: s.description, text: skillSearchText(s) })),
                threshold: jev?.skills?.threshold,
                timeoutMs: jev?.skills?.timeout_ms,
              }).pipe(
                // The fallback is silent by design, but a selector that never
                // succeeds is a defect an operator must see: log the reason so a
                // misconfigured key, endpoint or runtime cannot hide behind the
                // deterministic ranking.
                Effect.catch((error) =>
                  Effect.sync(() => {
                    const key = JevClient.apiKey(jev)
                    log.warn("jev skills selector failed; lexical fallback", {
                      candidates: list.length,
                      baseUrl: JevClient.baseUrl(jev),
                      keyLength: key?.length ?? 0,
                      keyPrefix: key ? key.slice(0, 6) : "",
                      error: String((error as any)?.message ?? error).slice(0, 300),
                    })
                    return undefined
                  }),
                ),
              )
            : undefined
        log.info("jev skills decision", {
          candidates: list.length,
          http: jevHttp !== undefined,
          outcome: jevSelected === undefined ? (jevHttp ? "abstain" : "skipped") : jevSelected.length,
          availableMs,
          selectMs: Date.now() - selectStart,
        })

        if (jevSelected) {
          const kept = new Set(jevSelected)
          list = list.filter((s) => kept.has(s.name))
          if (list.length === 0) return
        } else {
          // The lexical BM25 ranking matches wording, not meaning. Skill names and
          // descriptions are written in English while the request may not be, so it
          // both misses relevant skills and over-injects an arbitrary top-N (up to
          // MAX_RELEVANT_SKILLS) that the model then pays for every turn. A model
          // the user chose selects by meaning instead (see SkillSelect) — but it is
          // advisory, so it is read from the cache and refreshed off the step's
          // critical path. BM25 stays as the answer whenever no verdict is ready.
          const llmSelected = lastUserMessage ? skillSelection.peek(agent.name, lastUserMessage) : undefined
          if (lastUserMessage && list.length > 0) {
            const key = skillSelection.begin(agent.name, lastUserMessage)
            if (key) {
              const candidates = list.map((s) => ({ name: s.name, description: s.description ?? "" }))
              yield* Effect.forkDetach(
                SkillSelect.select({ prompt: lastUserMessage, skills: candidates }).pipe(
                  Effect.tap((names) => Effect.sync(() => skillSelection.settle(key, names))),
                  Effect.catch(() => Effect.sync(() => skillSelection.settle(key, undefined))),
                ),
              )
            }
          }
          log.info("llm skills decision", {
            candidates: list.length,
            outcome: llmSelected === undefined ? "unavailable" : llmSelected.length,
            cached: llmSelected !== undefined,
          })
          if (llmSelected) {
            const kept = new Set(llmSelected)
            list = list.filter((s) => kept.has(s.name))
            if (list.length === 0) return
          } else if (lastUserMessage && list.length > MAX_RELEVANT_SKILLS) {
            // No model produced a decision: deterministic BM25 safety net.
            const docs = list.map((s) => ({
              id: s.name,
              content: skillSearchText(s),
              importance: 1.0 as const,
              confidence: 1.0 as const,
            }))
            const ranked = rankDocuments(lastUserMessage, docs, MAX_RELEVANT_SKILLS)
            const kept = new Set(ranked.map((r) => r.id))
            list = list.filter((s) => kept.has(s.name))
          }

          // Budget enforcement (D3), last-resort path only. Jev and the model set
          // their own count; when neither decided, clamp the catalogue by real
          // usage recency so the whole list (193 skills, 73 % never loaded once in
          // 45 days) is not emitted when the turn carries no user text.
          if (list.length > MAX_RELEVANT_SKILLS) {
            yield* Effect.promise(() => SkillUsage.ready())
            list = SkillUsage.prioritize(list, MAX_RELEVANT_SKILLS)
          }
        }

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Explore the project enough to understand its shape first, then use the skill tool to load a skill when a task matches its description.",
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

      skillRevision: Effect.fn("SystemPrompt.skillRevision")(function* () {
        return yield* skill.revision()
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
