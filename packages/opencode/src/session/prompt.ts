import path from "path"
import { supportsExtractedAudio } from "@/document/provider-support"
import { ArtifactStore } from "@/artifact/store"
import { DocumentExtractor } from "@/document/extractor"
import os from "os"
import { createHash } from "node:crypto"
import { SessionID, MessageID, PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import { PromptQueue } from "./prompt-queue"
import * as Log from "@opencode-ai/core/util/log"
import { SessionRevert } from "./revert"
import { TriggerHandler } from "../daemon/trigger-handler"
import { readUnacknowledged, acknowledgeAll } from "../daemon/notifications"
import * as AutoMemory from "../daemon/auto-memory"
import * as Memory from "@/memory"
import * as ReflectUse from "@/memory/reflect-use"
import * as Session from "./session"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "../provider/schema"
import { type Tool as AITool, tool, jsonSchema } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { SessionCompaction } from "./compaction"
import { Bus } from "../bus"
import { SystemPrompt } from "./system"
import { SelfImprove } from "@/self-improve"
import { Instruction } from "./instruction"
import { Plugin } from "../plugin"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import PROMPT_CORE from "./prompt/core.txt"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../mcp"
import { LSP } from "@/lsp/lsp"
import { ulid } from "ulid"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import * as Stream from "effect/Stream"
import { Command } from "../command"
import { pathToFileURL, fileURLToPath } from "url"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import type { ConfigAttachment } from "@/config/attachment"
import { SessionSummary } from "./summary"
import { SessionContextRollout } from "./context-rollout"
import { NamedError } from "@opencode-ai/core/util/error"
import { SessionProcessor } from "./processor"
import { SessionTitle } from "./title"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { Shell } from "@/shell/shell"
import { ShellID } from "@/tool/shell/id"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Truncate } from "@/tool/truncate"
import { Service as ToolCacheService } from "@/tool/cache"
import { Image } from "@/image/image"
import { decodeDataUrl } from "@/util/data-url"
import { Process } from "@/util/process"
import { Cause, Effect, Exit, Latch, Layer, Option, Scope, Context, Schema, Types } from "effect"
import * as EffectLogger from "@opencode-ai/core/effect/logger"
import { InstanceState } from "@/effect/instance-state"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { PlanEngine, type ExecutionPlan } from "@/plan-engine"
import * as PostMortem from "@/memory/post-mortem"
import { SessionRunState } from "./run-state"
import * as PromptMethodology from "./prompt-methodology"
import { createPromptContextSummary, createPromptInjectionCache } from "./prompt-context-summary"
import { derivePhaseCapsule } from "./phase-capsule"
import { buildQaProofAdvisory, buildRiskAdvisory, collectStickyFindings } from "./lean-advisory"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionEvent } from "@opencode-ai/core/session-event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AgentAttachment, FileAttachment, ReferenceAttachment, Source } from "@opencode-ai/core/session-prompt"
import { Reference } from "@/reference/reference"
import * as DateTime from "effect/DateTime"
import { eq } from "@/storage/db"
import * as Database from "@/storage/db"
import { SessionTable } from "./session.sql"
import { referencePromptMetadata, referenceTextPart } from "./prompt/reference"
import { SessionReminders } from "./reminders"
import { SessionTools } from "./tools"
import { LLMEvent } from "@opencode-ai/llm"
import { Question } from "@/question"
import type { GoalState } from "./goal-state"
import { hasObjective } from "./goal-state"
import { compressGoalState, formatGoalContext } from "./compaction"

// Finish reasons that leave the turn unfinished when the assistant carries no
// error: a reply truncated by the output-token budget, and a provider reason
// the adapter could not map (already treated as unfinished by the processor).
// Continuing these is what removes the manual "continue" prompt; the step
// explicitly configured agent step budget bounds repetition, and an errored
// turn always stops.
const UNFINISHED_FINISH = ["length", "unknown"]

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

const decodeMessageInfo = Schema.decodeUnknownExit(MessageV2.Info)
const decodeMessagePart = Schema.decodeUnknownExit(MessageV2.Part)

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

Guidelines:
- Call this tool once when you are ready to provide the final structured response.
- The input must be valid JSON matching the requested schema.
- Complete useful research, tool calls, and verification before calling it.
- Treat the tool call as the final answer for this turn.`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `The user requested structured output. Provide the final response through the StructuredOutput tool using JSON that matches the requested schema.`

/**
 * Format pending trigger tasks as an XML section for the system prompt.
 */
function formatPendingTasksSection(tasks: TriggerHandler.TaskItem[]): string {
  const lines = tasks.map((t, i) => {
    const payloadStr = t.payload ? JSON.stringify(t.payload, null, 2) : ""
    return `  <task index="${i + 1}">
    <triggerId>${xmlEscape(t.triggerId)}</triggerId>
    <source>${xmlEscape(t.source)}</source>
    <receivedAt>${t.receivedAt}</receivedAt>${payloadStr ? `\n    <payload>${xmlEscape(payloadStr)}</payload>` : ""}
  </task>`
  })

  return [
    "",
    `<pending_tasks>`,
    `You have ${tasks.length} pending trigger task(s) from the background daemon.`,
    `Review each task and take the appropriate action.`,
    tasks.length === 1
      ? `When you have processed the task, mark it as done by running:`
      : `When you have processed all the tasks, mark each as done by running for each task:`,
    `  opencodev2 tasks process <triggerId>`,
    "",
    ...lines,
    `</pending_tasks>`,
    "",
  ].join("\n")
}

// ── Notifications section ───────────────────────────────────────────────

function formatNotificationsSection(): string {
  const notifications = readUnacknowledged()
  if (notifications.length === 0) return ""

  const lines = notifications.map((n) => {
    const typeIcon =
      n.type === "task_committed" ? "✅📝" :
      n.type === "task_success" ? "✅" :
      n.type === "task_failure" ? "❌" :
      n.type === "task_escalated" ? "⚠️" :
      n.type === "critical_alert" ? "🚨" : "ℹ️"
    const summary = xmlEscape(n.summary)
    const details = xmlEscape(n.details.slice(0, 500))
    const source = n.source ? xmlEscape(n.source) : "daemon"
    return [
      `  <notification>`,
      `    <id>${xmlEscape(n.id)}</id>`,
      `    <type>${n.type}</type>`,
      `    <source>${source}</source>`,
      `    <summary>${summary}</summary>`,
      `    <details>${details}</details>`,
      `    <timestamp>${n.timestamp}</timestamp>`,
      `  </notification>`,
    ].join("\n")
  })

  return [
    "",
    `<daemon_notifications>`,
    `The background daemon has ${notifications.length} unacknowledged notification(s):`,
    "",
    ...lines,
    `</daemon_notifications>`,
    "",
  ].join("\n")
}

// ── Learnings section ───────────────────────────────────────────────────

function formatLearningsSection(): string {
  const learnings = AutoMemory.readUnacknowledgedLearnings()
  if (learnings.length === 0) return ""

  const lines = learnings.map((l) => {
    const summary = xmlEscape(l.summary)
    const source = xmlEscape(l.source)
    const files = l.diffs.map((d) => `      <file type="${xmlEscape(d.type)}">${xmlEscape(d.file)}</file>`).join("\n")
    return [
      `  <learning>`,
      `    <id>${xmlEscape(l.id)}</id>`,
      `    <source>${source}</source>`,
      `    <summary>${summary}</summary>`,
      l.commitHash ? `    <commit>${xmlEscape(l.commitHash)}</commit>` : "",
      l.commitMessage ? `    <commitMessage>${xmlEscape(l.commitMessage)}</commitMessage>` : "",
      l.model ? `    <model>${xmlEscape(l.model)}</model>` : "",
      `    <filesChanged>${l.filesChanged}</filesChanged>`,
      files ? `    <files>\n${files}\n    </files>` : "",
      `  </learning>`,
    ].join("\n")
  })

  return [
    "",
    `<daemon_learnings>`,
    `The background daemon has processed ${learnings.length} task(s) autonomously since your last session.`,
    `These actions were already performed — you don't need to repeat them.`,
    `Review the changes for awareness:`,
    "",
    ...lines,
    `</daemon_learnings>`,
    "",
  ].join("\n")
}

/**
 * Format an execution plan as an XML section for the system prompt.
 * The plan is purely instructional — the LLM decides whether to follow it.
 */
function formatPlanSection(plan: ExecutionPlan): string {
  const stepLines = plan.steps.flatMap((step, i) => {
    const lines = [
      `    <step index="${i + 1}" id="${xmlEscape(step.id)}">`,
      `      <description>${xmlEscape(step.description)}</description>`,
      `      <agent>${xmlEscape(step.agent)}</agent>`,
    ]
    if (step.depends.length > 0) {
      lines.push(`      <depends>${step.depends.map(xmlEscape).join(", ")}</depends>`)
    }
    lines.push(`    </step>`)
    return lines
  })

  const groupLines = plan.parallelGroups.map(
    (group, i) => `    <group index="${i + 1}">${group.map(xmlEscape).join(", ")}</group>`,
  )

  return [
    "",
    `<auto_plan>`,
    `A structured execution plan has been generated to help you organize this complex task:`,
    `  <goal>${xmlEscape(plan.goal)}</goal>`,
    `  <complexity>${plan.complexity}</complexity>`,
    `  <estimatedTokens>${plan.estimatedTokens}</estimatedTokens>`,
    `  <steps>`,
    ...stepLines,
    `  </steps>`,
    `  <parallelGroups>`,
    ...groupLines,
    `  </parallelGroups>`,
    `  <instruction>`,
    `  Treat this as guidance: follow or adapt it when it helps the user's objective.`,
    `  Use sub-agents only for useful independent work; keep verification ownership in the main flow.`,
    `  </instruction>`,
    `</auto_plan>`,
    "",
  ].join("\n")
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}



function getUserPromptText(msg: MessageV2.WithParts): string {
  // Defensive: a malformed/partially-hydrated message (e.g. read mid-write,
  // or produced by a code path that skipped `info`) must never crash the
  // whole prompt loop here. This function runs on every step (skill
  // relevance, goal state, auto-planning) against the full message history,
  // so a single bad entry previously took down the entire session silently.
  if (!msg?.info || msg.info.role !== "user") return ""
  return msg.parts
    .filter((p): p is MessageV2.TextPart => p.type === "text" && !p.synthetic && !p.ignored)
    .map((p) => p.text)
    .join("\n")
    .trim()
}

function getCurrentTaskText(msgs: MessageV2.WithParts[]): string {
  for (const m of msgs.toReversed()) {
    const text = getUserPromptText(m)
    if (text.trim()) return text
  }
  return ""
}

function isValidGoalState(goalState: GoalState | null | undefined): goalState is GoalState {
  if (!goalState) return false
  if (goalState.status === "skipped") return false
  if (!goalState.goal?.trim()) return false
  if (!Array.isArray(goalState.dod)) return false
  return goalState.dod.some((item) => item?.trim().length > 0)
}

function buildGoalSourceText(input: { msgs: MessageV2.WithParts[]; lastUserID: MessageID }): string {
  const currentUserMsg = input.msgs.findLast(
    (candidate) => candidate.info.role === "user" && candidate.info.id === input.lastUserID,
  )
  const currentUserText = currentUserMsg ? getUserPromptText(currentUserMsg).trim() : ""
  const isShortPrompt = currentUserText.length > 0 && currentUserText.length < 40
  const useFallback = !currentUserText || isShortPrompt || isContinuationPrompt(currentUserText)
  if (!useFallback) return currentUserText

  const recentUserTexts = input.msgs
    .filter((m) => m.info.role === "user")
    .map((m) => getUserPromptText(m).trim())
    .filter(Boolean)
    .filter((text) => !isContinuationPrompt(text) || text.length > 40)
    .slice(-3)

  return recentUserTexts.join("\n") || currentUserText
}

const AUTO_PLAN_CONTINUATION_TOKENS = new Set([
  "ok",
  "okay",
  "continue",
  "continuer",
  "commence",
  "commencer",
  "reprends",
  "reprendre",
  "poursuis",
  "poursuivre",
  "resume",
  "reprend",
  "go",
  "suite",
  "next",
  "vas",
  "y",
])

const AUTO_PLAN_CONTINUATION_FILLER_TOKENS = new Set([
  "please",
  "pls",
  "stp",
  "svp",
  "now",
  "maintenant",
  "alors",
])

function isContinuationPrompt(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

  if (!normalized) return false

  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 4) return false

  let hasContinuationToken = false
  for (const token of tokens) {
    if (AUTO_PLAN_CONTINUATION_FILLER_TOKENS.has(token)) continue
    if (AUTO_PLAN_CONTINUATION_TOKENS.has(token)) {
      hasContinuationToken = true
      continue
    }
    return false
  }

  return hasContinuationToken
}



const log = Log.create({ service: "session.prompt" })
const elog = EffectLogger.create({ service: "session.prompt" })

export function reachedStepLimit(step: number, maxSteps?: number) {
  return maxSteps !== undefined && step >= maxSteps
}

function isOrphanedInterruptedTool(part: MessageV2.ToolPart) {
  // cleanup() marks abandoned tool_use blocks this way after retries/aborts.
  // They are not pending work and must not trigger an assistant-prefill request.
  return part.state.status === "error" && part.state.metadata?.interrupted === true
}

export interface Interface {
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts, Image.Error>
  readonly loop: (input: LoopInput) => Effect.Effect<MessageV2.WithParts>
  readonly shell: (input: ShellInput) => Effect.Effect<MessageV2.WithParts, Session.BusyError>
  readonly command: (input: CommandInput) => Effect.Effect<MessageV2.WithParts, Image.Error>
  readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const status = yield* SessionStatus.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const processor = yield* SessionProcessor.Service
    const compaction = yield* SessionCompaction.Service
    const plugin = yield* Plugin.Service
    const commands = yield* Command.Service
    const config = yield* Config.Service
    const permission = yield* Permission.Service
    const fsys = yield* AppFileSystem.Service
    const mcp = yield* MCP.Service
    const lsp = yield* LSP.Service
    const registry = yield* ToolRegistry.Service
    const truncate = yield* Truncate.Service
    const image = yield* Image.Service
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const scope = yield* Scope.Scope
    const instruction = yield* Instruction.Service
    const state = yield* SessionRunState.Service
    const revert = yield* SessionRevert.Service
    const summary = yield* SessionSummary.Service
    const sys = yield* SystemPrompt.Service
    const llm = yield* LLM.Service
    const references = yield* Reference.Service
    const sessionTitle = yield* SessionTitle.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service
    const toolCache = yield* ToolCacheService
    const memory = yield* Effect.serviceOption(Memory.Service).pipe(Effect.map(Option.getOrUndefined))
    const planEngine = yield* Effect.serviceOption(PlanEngine.Service).pipe(Effect.map(Option.getOrUndefined))
    const selfImprove = yield* Effect.serviceOption(SelfImprove.Service).pipe(Effect.map(Option.getOrUndefined))

    const ops = Effect.fn("SessionPrompt.ops")(function* () {
      return {
        cancel: (sessionID: SessionID) => cancel(sessionID),
        resolvePromptParts: (template: string) => resolvePromptParts(template),
        prompt: (input: PromptInput) => prompt(input).pipe(Effect.catch(Effect.die)),
      } satisfies TaskPromptOps
    })

    const VISION_CACHE_TTL = 24 * 60 * 60 * 1000

    function imagePayloadHash(url: string) {
      const comma = url.indexOf(",")
      return createHash("sha256").update(comma === -1 ? url : url.slice(comma + 1)).digest("hex")
    }

    const visionAnalysis = Effect.fn("SessionPrompt.visionAnalysis")(function* (input: {
      attachment: MessageV2.FilePart
      imageConfig: ConfigAttachment.Image
      user: MessageV2.User
      sessionID: SessionID
      agent: Agent.Info
      promptRollout: ReturnType<typeof SessionContextRollout.resolve>
    }) {
      const vision = input.imageConfig.vision_model ? Provider.parseModel(input.imageConfig.vision_model) : undefined
      if (!vision) {
        return [
          `ERROR: Cannot read ${input.attachment.filename ? `"${input.attachment.filename}"` : "image"}: the active model does not support image input.`,
          "Configure attachment.image.vision_model from the TUI or opencode config to enable fallback image reading.",
        ].join(" ")
      }

      const visionModel = yield* provider
        .getModel(vision.providerID, vision.modelID)
        .pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (!visionModel || !visionModel.capabilities.input.image) {
        return `ERROR: Configured vision model ${vision.providerID}/${vision.modelID} is not available or does not support image input. Choose a vision-capable model that is connected.`
      }

      const hash = imagePayloadHash(input.attachment.url)
      const cacheKey = [
        "vision-analysis",
        input.attachment.mime,
        hash,
        visionModel.providerID,
        visionModel.id,
        input.imageConfig.auto_resize ?? "default-resize",
        input.imageConfig.max_width ?? "default-width",
        input.imageConfig.max_height ?? "default-height",
        input.imageConfig.max_base64_bytes ?? "default-bytes",
      ].join(":")
      if (input.imageConfig.cache !== false) {
        const cached = yield* toolCache.get(cacheKey)
        if (cached && typeof cached.data === "string") return cached.data
      }

      const filePart: MessageV2.FilePart = {
        id: PartID.ascending(),
        sessionID: input.sessionID,
        messageID: input.user.id,
        type: "file",
        mime: input.attachment.mime,
        filename: input.attachment.filename,
        url: input.attachment.url,
      }
      const normalized = yield* image.normalize(filePart).pipe(
        Effect.catchCause(() => Effect.succeed(filePart)),
      )
      const message: MessageV2.WithParts = {
        info: {
          ...input.user,
          model: {
            providerID: visionModel.providerID,
            modelID: visionModel.id,
          },
        },
        parts: [
          {
            id: PartID.ascending(),
            sessionID: input.sessionID,
            messageID: input.user.id,
            type: "text",
            text: [
              "Analyze this image for a downstream coding agent.",
              "Return concise but complete text: visible text/OCR, UI elements, diagrams, errors, file names, and any details needed to answer user requests.",
              "Do not mention that you are a separate vision model.",
            ].join(" "),
          },
          {
            ...normalized,
            id: PartID.ascending(),
            sessionID: input.sessionID,
            messageID: input.user.id,
          },
        ],
      }
      const modelMsgs = yield* MessageV2.toModelMessagesEffect([message], visionModel, {
        replayToolInputs: input.promptRollout.replayToolInputs,
        replayToolOutputs: input.promptRollout.replayToolOutputs,
        replayReasoning: input.promptRollout.replayReasoning,
      })
      const text = yield* llm
        .stream({
          agent: { ...input.agent, options: {}, temperature: 0 },
          user: input.user,
          system: [],
          tools: {},
          model: visionModel,
          sessionID: input.sessionID,
          retries: 1,
          toolChoice: "none",
          messages: modelMsgs,
        })
        .pipe(
          Stream.filter(LLMEvent.is.textDelta),
          Stream.map((e) => e.text),
          Stream.mkString,
          Effect.catchCause((cause) => {
            const defect = Cause.squash(cause)
            return Effect.succeed(`ERROR: vision model call failed: ${defect instanceof Error ? defect.message : String(defect)}`)
          }),
        )
      const trimmed = text.trim() || "No image details returned by the configured vision model."
      const result = [
        `[Image analysis by ${visionModel.providerID}/${visionModel.id}]`,
        input.attachment.filename ? `filename: ${input.attachment.filename}` : undefined,
        `mime: ${input.attachment.mime}`,
        `sha256: ${hash}`,
        trimmed,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
      if (input.imageConfig.cache !== false) yield* toolCache.set(cacheKey, result, VISION_CACHE_TTL)
      return result
    })

    const applyVisionFallback = Effect.fn("SessionPrompt.applyVisionFallback")(function* (input: {
      messages: MessageV2.WithParts[]
      model: Provider.Model
      user: MessageV2.User
      sessionID: SessionID
      agent: Agent.Info
      imageConfig: ConfigAttachment.Image | undefined
      promptRollout: ReturnType<typeof SessionContextRollout.resolve>
    }) {
      if (input.model.capabilities.input.image) return input.messages
      const imageConfig = input.imageConfig ?? {}
      const analyze = (attachment: MessageV2.FilePart) =>
        visionAnalysis({
          attachment,
          imageConfig,
          user: input.user,
          sessionID: input.sessionID,
          agent: input.agent,
          promptRollout: input.promptRollout,
        }).pipe(
          Effect.catchCause((cause) => {
            const defect = Cause.squash(cause)
            return Effect.succeed(
              `ERROR: Image analysis failed (${defect instanceof Error ? defect.message : String(defect)}). The image could not be read by the configured vision model.`,
            )
          }),
        )
      const isImage = (attachment: { mime: string }) => attachment.mime.startsWith("image/")
      const next: MessageV2.WithParts[] = []
      for (const msg of input.messages) {
        let changed = false
        const parts: MessageV2.Part[] = []
        for (const part of msg.parts) {
          const images = unreadableImages(part)
          if (!images.length) {
            parts.push(part)
            continue
          }
          changed = true
          const analyses = yield* Effect.forEach(images, analyze)
          if (part.type === "file") {
            parts.push({
              id: PartID.ascending(),
              sessionID: part.sessionID,
              messageID: part.messageID,
              type: "text",
              synthetic: true,
              text: analyses.join("\n\n"),
            })
            continue
          }
          if (part.type === "tool" && part.state.status === "completed") {
            const rest = (part.state.attachments ?? []).filter((attachment) => !isImage(attachment))
            parts.push({
              ...part,
              state: {
                ...part.state,
                output: [part.state.output, ...analyses].filter((line) => Boolean(line)).join("\n\n"),
                attachments: rest.length ? rest : undefined,
              },
            })
            continue
          }
          parts.push(part)
        }
        next.push(changed ? { ...msg, parts } : msg)
      }
      return next
    })

    const cancel = Effect.fn("SessionPrompt.cancel")(function* (sessionID: SessionID) {
      yield* elog.info("cancel", { sessionID })
      yield* state.cancel(sessionID)
    })

    const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
      const ctx = yield* InstanceState.context
      const parts: Types.DeepMutable<PromptInput["parts"]> = [{ type: "text", text: template }]
      const files = ConfigMarkdown.files(template)
      const seen = new Set<string>()
      const seenReferenceMessages = new Set<string>()
      const mentionSource = (match: RegExpMatchArray) => {
        const start = match.index ?? 0
        return { value: match[0], start, end: start + match[0].length }
      }
      const pushReference = (part: ReturnType<typeof referenceTextPart>) => {
        const key = JSON.stringify(part.metadata?.reference)
        if (seenReferenceMessages.has(key)) return
        seenReferenceMessages.add(key)
        parts.push(part)
      }
      yield* Effect.forEach(
        files,
        Effect.fnUntraced(function* (match) {
          const name = match[1]
          if (!name) return
          if (seen.has(name)) return
          seen.add(name)

          const slash = name.indexOf("/")
          const alias = slash === -1 ? name : name.slice(0, slash)
          const reference = yield* references.get(alias)
          if (reference) {
            const source = mentionSource(match)
            if (reference.kind === "invalid") {
              pushReference(
                referenceTextPart({ reference, source, target: slash === -1 ? undefined : name.slice(slash + 1) }),
              )
              return
            }

            yield* references.ensure(reference.path)
            if (slash === -1) {
              pushReference(referenceTextPart({ reference, source }))
              return
            }

            const target = name.slice(slash + 1)
            const targetPath = path.resolve(reference.path, target)
            if (!AppFileSystem.contains(reference.path, targetPath)) {
              pushReference(
                referenceTextPart({
                  reference,
                  source,
                  target,
                  targetPath,
                  problem: `Path escapes configured reference @${alias}: ${target}`,
                }),
              )
              return
            }

            const info = yield* fsys.stat(targetPath).pipe(Effect.option)
            if (Option.isNone(info)) {
              pushReference(
                referenceTextPart({
                  reference,
                  source,
                  target,
                  targetPath,
                  problem: `Path does not exist inside configured reference @${alias}: ${target}`,
                }),
              )
              return
            }

            parts.push({
              type: "file",
              url: pathToFileURL(targetPath).href,
              filename: name,
              mime: info.value.type === "Directory" ? "application/x-directory" : "text/plain",
            })
            return
          }

          const filepath = name.startsWith("~/")
            ? path.join(os.homedir(), name.slice(2))
            : path.resolve(ctx.worktree, name)

          const info = yield* fsys.stat(filepath).pipe(Effect.option)
          if (Option.isNone(info)) {
            const found = yield* agents.get(name)
            if (found) parts.push({ type: "agent", name: found.name })
            return
          }
          const stat = info.value
          parts.push({
            type: "file",
            url: pathToFileURL(filepath).href,
            filename: name,
            mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
          })
        }),
        { concurrency: "unbounded", discard: true },
      )
      return parts
    })

    const handleSubtask = Effect.fn("SessionPrompt.handleSubtask")(function* (input: {
      task: MessageV2.SubtaskPart
      model: Provider.Model
      lastUser: MessageV2.User
      sessionID: SessionID
      session: Session.Info
      msgs: MessageV2.WithParts[]
    }) {
      const { task, model, lastUser, sessionID, session, msgs } = input
      const ctx = yield* InstanceState.context
      const promptOps = yield* ops()
      const { task: taskTool } = yield* registry.named()
      const taskModel = task.model ? yield* getModel(task.model.providerID, task.model.modelID, sessionID) : model
      const assistantMessage: MessageV2.Assistant = yield* sessions.updateMessage({
        id: MessageV2.nextID(sessionID),
        role: "assistant",
        parentID: lastUser.id,
        sessionID,
        mode: task.agent,
        agent: task.agent,
        variant: lastUser.model.variant,
        path: { cwd: ctx.directory, root: ctx.worktree },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: taskModel.id,
        providerID: taskModel.providerID,
        time: { created: Date.now() },
      })
      let part: MessageV2.ToolPart = yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistantMessage.id,
        sessionID: assistantMessage.sessionID,
        type: "tool",
        callID: ulid(),
        tool: TaskTool.id,
        state: {
          status: "running",
          input: {
            prompt: task.prompt,
            description: task.description,
            subagent_type: task.agent,
            command: task.command,
          },
          time: { start: Date.now() },
        },
      })
      const taskArgs = {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      }
      yield* plugin.trigger(
        "tool.execute.before",
        { tool: TaskTool.id, sessionID, callID: part.id },
        { args: taskArgs },
      )

      const taskAgent = yield* agents.get(task.agent)
      if (!taskAgent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${task.agent}".${hint}` })
        yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })
        throw error
      }

      let error: Error | undefined
      const taskAbort = new AbortController()
      const result = yield* taskTool
        .execute(taskArgs, {
          agent: task.agent,
          messageID: assistantMessage.id,
          sessionID,
          abort: taskAbort.signal,
          callID: part.callID,
          extra: { bypassAgentCheck: true, promptOps },
          messages: msgs,
          metadata: (val: { title?: string; metadata?: Record<string, any> }) =>
            Effect.gen(function* () {
              part = yield* sessions.updatePart({
                ...part,
                type: "tool",
                state: { ...part.state, ...val },
              } satisfies MessageV2.ToolPart)
            }),
          ask: (req: any) =>
            permission
              .ask({
                ...req,
                sessionID,
                ruleset: Permission.merge(taskAgent.permission, session.permission ?? []),
              })
              .pipe(Effect.orDie),
        })
        .pipe(
          Effect.catchCause((cause) => {
            const defect = Cause.squash(cause)
            error = defect instanceof Error ? defect : new Error(String(defect))
            log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
            return Effect.void
          }),
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              taskAbort.abort()
              assistantMessage.finish = "tool-calls"
              assistantMessage.time.completed = Date.now()
              yield* sessions.updateMessage(assistantMessage)
              if (part.state.status === "running") {
                yield* sessions.updatePart({
                  ...part,
                  state: {
                    status: "error",
                    error: "Cancelled",
                    time: { start: part.state.time.start, end: Date.now() },
                    metadata: part.state.metadata,
                    input: part.state.input,
                  },
                } satisfies MessageV2.ToolPart)
              }
            }),
          ),
        )

      const attachments = result?.attachments?.map((attachment) => ({
        ...attachment,
        id: PartID.ascending(),
        sessionID,
        messageID: assistantMessage.id,
      }))

      yield* plugin.trigger(
        "tool.execute.after",
        { tool: TaskTool.id, sessionID, callID: part.id, args: taskArgs },
        result,
      )

      assistantMessage.finish = "tool-calls"
      assistantMessage.time.completed = Date.now()
      yield* sessions.updateMessage(assistantMessage)

      if (result && part.state.status === "running") {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "completed",
            input: part.state.input,
            title: result.title,
            metadata: result.metadata,
            output: result.output,
            attachments,
            time: { ...part.state.time, end: Date.now() },
          },
        } satisfies MessageV2.ToolPart)
      }

      if (!result) {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "error",
            error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
            time: {
              start: part.state.status === "running" ? part.state.time.start : Date.now(),
              end: Date.now(),
            },
            metadata: part.state.status === "pending" ? undefined : part.state.metadata,
            input: part.state.input,
          },
        } satisfies MessageV2.ToolPart)
      }

      if (!task.command) return

      const summaryUserMsg: MessageV2.User = {
        id: MessageV2.nextID(sessionID),
        sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: lastUser.agent,
        model: lastUser.model,
      }
      yield* sessions.updateMessage(summaryUserMsg)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: summaryUserMsg.id,
        sessionID,
        type: "text",
        text: "Summarize the task tool output above and continue with your task.",
        synthetic: true,
      } satisfies MessageV2.TextPart)
    })

    const shellImpl = Effect.fn("SessionPrompt.shellImpl")(function* (input: ShellInput, ready?: Latch.Latch) {
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void
          const { msg, part, cwd } = yield* Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
            if (session.revert) {
              yield* revert.cleanup(session)
            }
            const agent = yield* agents.get(input.agent)
            if (!agent) {
              const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
              const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
              const error = new NamedError.Unknown({ message: `Agent not found: "${input.agent}".${hint}` })
              yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
              throw error
            }
            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))
            const userMsg: MessageV2.User = {
              id: MessageV2.nextID(input.sessionID, input.messageID),
              sessionID: input.sessionID,
              time: { created: Date.now() },
              role: "user",
              agent: input.agent,
              model: { providerID: model.providerID, modelID: model.modelID },
            }
            yield* sessions.updateMessage(userMsg)
            const userPart: MessageV2.Part = {
              type: "text",
              id: PartID.ascending(),
              messageID: userMsg.id,
              sessionID: input.sessionID,
              text: "The following tool was executed by the user",
              synthetic: true,
            }
            yield* sessions.updatePart(userPart)

            const msg: MessageV2.Assistant = {
              id: MessageV2.nextID(input.sessionID),
              sessionID: input.sessionID,
              parentID: userMsg.id,
              mode: input.agent,
              agent: input.agent,
              cost: 0,
              path: { cwd: ctx.directory, root: ctx.worktree },
              time: { created: Date.now() },
              role: "assistant",
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: model.modelID,
              providerID: model.providerID,
            }
            yield* sessions.updateMessage(msg)
            const started = Date.now()
            const part: MessageV2.ToolPart = {
              type: "tool",
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: input.sessionID,
              tool: ShellID.ToolID,
              callID: ulid(),
              state: {
                status: "running",
                time: { start: started },
                input: { command: input.command },
              },
            }
            yield* sessions.updatePart(part)
            if (flags.experimentalEventSystem) {
              yield* events.publish(SessionEvent.Shell.Started, {
                sessionID: input.sessionID,
                timestamp: DateTime.makeUnsafe(started),
                callID: part.callID,
                command: input.command,
              })
            }
            return { msg, part, cwd: ctx.directory }
          }).pipe(Effect.ensuring(markReady))

          const cfg = yield* config.get()
          const sh = Shell.preferred(cfg.shell)
          const args = Shell.args(sh, input.command, cwd)
          let output = ""
          let aborted = false

          const finish = Effect.uninterruptible(
            Effect.gen(function* () {
              if (aborted) {
                output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
              }
              const completed = Date.now()
              if (flags.experimentalEventSystem) {
                yield* events.publish(SessionEvent.Shell.Ended, {
                  sessionID: input.sessionID,
                  timestamp: DateTime.makeUnsafe(completed),
                  callID: part.callID,
                  output,
                })
              }
              if (!msg.time.completed) {
                msg.time.completed = completed
                yield* sessions.updateMessage(msg)
              }
              if (part.state.status === "running") {
                part.state = {
                  status: "completed",
                  time: { ...part.state.time, end: completed },
                  input: part.state.input,
                  title: "",
                  metadata: { output, description: "" },
                  output,
                }
                yield* sessions.updatePart(part)
              }
            }),
          )

          const exit = yield* restore(
            Effect.gen(function* () {
              const shellEnv = yield* plugin.trigger(
                "shell.env",
                { cwd, sessionID: input.sessionID, callID: part.callID },
                { env: {} },
              )
              const cmd = ChildProcess.make(sh, args, {
                cwd,
                extendEnv: true,
                env: { ...shellEnv.env, TERM: "dumb" },
                stdin: "ignore",
                forceKillAfter: "3 seconds",
              })
              const handle = yield* spawner.spawn(cmd)
              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
                Effect.gen(function* () {
                  output += chunk
                  if (part.state.status === "running") {
                    part.state.metadata = { output, description: "" }
                    yield* sessions.updatePart(part)
                  }
                }),
              )
              yield* handle.exitCode
            }).pipe(Effect.scoped, Effect.orDie),
          ).pipe(Effect.exit)

          if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause)) {
            aborted = true
          }
          yield* finish

          if (Exit.isFailure(exit) && !aborted && !Cause.hasInterruptsOnly(exit.cause)) {
            return yield* Effect.failCause(exit.cause)
          }

          return { info: msg, parts: [part] }
        }),
      )
    })

    const getModel = Effect.fn("SessionPrompt.getModel")(function* (
      providerID: ProviderID,
      modelID: ModelID,
      sessionID: SessionID,
    ) {
      const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value
      const err = Cause.squash(exit.cause)
      if (Provider.ModelNotFoundError.isInstance(err)) {
        const hint = err.suggestions?.length ? ` Did you mean: ${err.suggestions.join(", ")}?` : ""
        yield* bus.publish(Session.Event.Error, {
          sessionID,
          error: new NamedError.Unknown({
            message: `Model not found: ${err.providerID}/${err.modelID}.${hint}`,
          }).toObject(),
        })
      }
      return yield* Effect.die(err)
    })

    const currentModel = Effect.fnUntraced(function* (sessionID: SessionID) {
      const current = Database.use((db) =>
        db.select({ model: SessionTable.model }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get(),
      )
      if (current?.model) {
        return {
          providerID: ProviderID.make(current.model.providerID),
          modelID: ModelID.make(current.model.id),
          ...(current.model.variant && current.model.variant !== "default" ? { variant: current.model.variant } : {}),
        }
      }
      const match = yield* sessions
        .findMessage(sessionID, (m) => m.info.role === "user" && !!m.info.model)
        .pipe(Effect.orDie)
      if (Option.isSome(match) && match.value.info.role === "user") return match.value.info.model
      return yield* provider.defaultModel().pipe(Effect.orDie)
    })

    const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (input: PromptInput) {
      const agentName = input.agent
      const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!ag) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const current = Database.use((db) =>
        db
          .select({ agent: SessionTable.agent, model: SessionTable.model })
          .from(SessionTable)
          .where(eq(SessionTable.id, input.sessionID))
          .get(),
      )
      const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))
      const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
      const full =
        !input.variant && ag.variant && same
          ? yield* provider
              .getModel(model.providerID, model.modelID)
              .pipe(Effect.catchIf(Provider.ModelNotFoundError.isInstance, () => Effect.succeed(undefined)))
          : undefined
      const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)

      const info: MessageV2.User = {
        id: MessageV2.nextID(input.sessionID, input.messageID),
        role: "user",
        sessionID: input.sessionID,
        time: { created: Date.now() },
        tools: input.tools,
        agent: ag.name,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
          variant,
        },
        system: input.system,
        format: input.format,
      }

      if (current?.agent !== info.agent) {
        yield* events.publish(SessionEvent.AgentSwitched, {
          sessionID: input.sessionID,
          timestamp: DateTime.makeUnsafe(info.time.created),
          agent: info.agent,
        })
      }
      if (
        current?.model?.providerID !== info.model.providerID ||
        current.model.id !== info.model.modelID ||
        (current.model.variant === "default" ? undefined : current.model.variant) !== info.model.variant
      ) {
        yield* events.publish(SessionEvent.ModelSwitched, {
          sessionID: input.sessionID,
          timestamp: DateTime.makeUnsafe(info.time.created),
          model: {
            id: ModelV2.ID.make(info.model.modelID),
            providerID: ProviderV2.ID.make(info.model.providerID),
            variant: ModelV2.VariantID.make(info.model.variant ?? "default"),
          },
        })
      }

      yield* Effect.addFinalizer(() => instruction.clear(info.id))

      type Draft<T> = T extends MessageV2.Part ? Omit<T, "id"> & { id?: string } : never
      const assign = (part: Draft<MessageV2.Part>): MessageV2.Part => ({
        ...part,
        id: part.id ? PartID.make(part.id) : PartID.ascending(),
      })

      const referenceContextFromFilePart = Effect.fnUntraced(function* (
        part: Extract<PromptInput["parts"][number], { type: "file" }>,
        filepath: string,
      ) {
        const name = part.filename?.replace(/#\d+(?:-\d*)?$/, "")
        if (!name) return
        const slash = name.indexOf("/")
        if (slash === -1) return

        const reference = yield* references.get(name.slice(0, slash))
        if (!reference || reference.kind === "invalid") return
        if (!AppFileSystem.contains(reference.path, filepath)) return

        const target = path.relative(reference.path, filepath).split(path.sep).join("/")
        if (!target || target.startsWith("../") || target === "..") return

        return referenceTextPart({
          reference,
          source: part.source?.text ?? { value: `@${name}`, start: 0, end: name.length + 1 },
          target,
          targetPath: filepath,
        })
      })

      const resolvePart: (part: PromptInput["parts"][number]) => Effect.Effect<Draft<MessageV2.Part>[]> = Effect.fn(
        "SessionPrompt.resolveUserPart",
      )(function* (part) {
        if (part.type === "file") {
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            log.info("mcp resource", { clientName, uri, mime: part.mime })
            const pieces: Draft<MessageV2.Part>[] = [
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]
            const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)
            if (Exit.isSuccess(exit)) {
              const content = exit.value
              if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)
              const items = Array.isArray(content.contents) ? content.contents : [content.contents]
              for (const c of items) {
                if ("text" in c && c.text) {
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: c.text,
                  })
                } else if ("blob" in c && c.blob) {
                  const mime = "mimeType" in c ? c.mimeType : part.mime
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary content: ${mime}]`,
                  })
                }
              }
              pieces.push({ ...part, messageID: info.id, sessionID: input.sessionID })
            } else {
              const error = Cause.squash(exit.cause)
              log.error("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }
            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:": {
              const documentKind = DocumentExtractor.kind(part.filename ?? "attachment", part.mime)
              if (documentKind) {
                const comma = part.url.indexOf(",")
                if (comma === -1) throw new Error("Invalid document data URL")
                const header = part.url.slice(0, comma)
                const payload = part.url.slice(comma + 1)
                const estimatedBytes = header.endsWith(";base64") ? Math.floor(payload.length * 3 / 4) : payload.length
                if (estimatedBytes > DocumentExtractor.maxInputBytes(documentKind)) throw new Error(`${documentKind.toUpperCase()} source size exceeds safety limit`)
                const bytes = header.endsWith(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8")
                const extraction = yield* Effect.promise(() => DocumentExtractor.extractBytes(bytes, { filename: part.filename ?? `attachment.${documentKind}`, mime: part.mime }))
                const attachmentModel = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(Effect.orDie)
                const includeAudio = supportsExtractedAudio(attachmentModel)
                return [
                  { messageID: info.id, sessionID: input.sessionID, type: "text", synthetic: true, text: extraction.text },
                  ...extraction.assets.filter((asset) => asset.mime.startsWith("image/") || (includeAudio && asset.mime.startsWith("audio/"))).map((asset) => ({
                    type: "file" as const, mime: asset.mime, filename: asset.filename, url: asset.url, synthetic: true, messageID: info.id, sessionID: input.sessionID,
                  })),
                  ...(extraction.kind === "pdf" && extraction.source.size <= 10 * 1024 * 1024
                    ? [{ type: "file" as const, mime: "application/pdf", filename: part.filename, url: extraction.source.url, synthetic: true, messageID: info.id, sessionID: input.sessionID }]
                    : []),
                ]
              }
              if (part.mime === "text/plain") {
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: decodeDataUrl(part.url),
                  },
                  { ...part, messageID: info.id, sessionID: input.sessionID },
                ]
              }
              break
            }
            case "file:": {
              log.info("file", { mime: part.mime })
              const filepath = fileURLToPath(part.url)
              const referenceContext = yield* referenceContextFromFilePart(part, filepath)
              const mime = (yield* fsys.isDir(filepath)) ? "application/x-directory" : part.mime

              const { read } = yield* registry.named()
              const execRead = (args: Parameters<typeof read.execute>[0], extra?: Tool.Context["extra"]) => {
                const controller = new AbortController()
                return read
                  .execute(args, {
                    sessionID: input.sessionID,
                    abort: controller.signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true, ...extra },
                    messages: [],
                    metadata: () => Effect.void,
                    ask: () => Effect.void,
                  })
                  .pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())))
              }

              if (mime === "text/plain") {
                let offset: number | undefined
                let limit: number | undefined
                const range = { start: url.searchParams.get("start"), end: url.searchParams.get("end") }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  if (start === end) {
                    const symbols = yield* lsp.documentSymbol(filePathURI).pipe(Effect.catch(() => Effect.succeed([])))
                    for (const symbol of symbols) {
                      let r: LSP.Range | undefined
                      if ("range" in symbol) r = symbol.range
                      else if ("location" in symbol) r = symbol.location.range
                      if (r?.start?.line && r?.start?.line === start) {
                        start = r.start.line
                        end = r?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start, 1)
                  if (end) limit = end - (offset - 1)
                }
                const args = { filePath: filepath, offset, limit }
                const pieces: Draft<MessageV2.Part>[] = [
                  ...(referenceContext
                    ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]
                    : []),
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]
                const exit = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(
                  Effect.flatMap((mdl) => execRead(args, { model: mdl })),
                  Effect.exit,
                )
                if (Exit.isSuccess(exit)) {
                  const result = exit.value
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  })
                  if (result.attachments?.length) {
                    pieces.push(
                      ...result.attachments.map((a) => ({
                        ...a,
                        synthetic: true,
                        filename: a.filename ?? part.filename,
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })),
                    )
                  } else {
                    pieces.push({ ...part, mime, messageID: info.id, sessionID: input.sessionID })
                  }
                } else {
                  const error = Cause.squash(exit.cause)
                  log.error("failed to read file", { error })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* bus.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                  })
                }
                return pieces
              }

              if (mime === "application/x-directory") {
                const args = { filePath: filepath }
                const exit = yield* execRead(args).pipe(Effect.exit)
                if (Exit.isFailure(exit)) {
                  const error = Cause.squash(exit.cause)
                  log.error("failed to read directory", { error })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* bus.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  return [
                    ...(referenceContext
                      ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]
                      : []),
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    },
                  ]
                }
                return [
                  ...(referenceContext
                    ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }]
                    : []),
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: exit.value.output,
                  },
                  { ...part, mime, messageID: info.id, sessionID: input.sessionID },
                ]
              }

              if (DocumentExtractor.kind(filepath, mime)) {
                const args = { filePath: filepath }
                const attachmentModel = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(Effect.orDie)
                const exit = yield* execRead(args, { model: attachmentModel }).pipe(Effect.exit)
                if (Exit.isFailure(exit)) {
                  const error = Cause.squash(exit.cause)
                  const message = error instanceof Error ? error.message : String(error)
                  return [{ messageID: info.id, sessionID: input.sessionID, type: "text", synthetic: true, text: `Read tool failed to extract ${filepath}: ${message}` }]
                }
                return [
                  ...(referenceContext ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }] : []),
                  { messageID: info.id, sessionID: input.sessionID, type: "text", synthetic: true, text: `Called the Read tool with the following input: ${JSON.stringify(args)}` },
                  { messageID: info.id, sessionID: input.sessionID, type: "text", synthetic: true, text: exit.value.output },
                  ...(exit.value.attachments ?? []).map((attachment) => ({ ...attachment, synthetic: true, messageID: info.id, sessionID: input.sessionID })),
                ]
              }
              return [
                ...(referenceContext ? [{ ...referenceContext, messageID: info.id, sessionID: input.sessionID }] : []),
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                },
                {
                  id: part.id,
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url:
                    `data:${mime};base64,` +
                    Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString("base64"),
                  mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
            }
          }
        }

        if (part.type === "agent") {
          const perm = Permission.evaluate("task", part.name, ag.permission)
          const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            { ...part, messageID: info.id, sessionID: input.sessionID },
            {
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
                hint,
            },
          ]
        }

        return [{ ...part, messageID: info.id, sessionID: input.sessionID }]
      })

      const resolvedParts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" }).pipe(
        Effect.map((x) => x.flat().map(assign)),
      )

      yield* plugin.trigger(
        "chat.message",
        {
          sessionID: input.sessionID,
          agent: input.agent,
          model: input.model,
          messageID: input.messageID,
          variant: input.variant,
        },
        { message: info, parts: resolvedParts },
      )

      const parts = yield* Effect.forEach(resolvedParts, (part) =>
        part.type === "file" && part.mime.startsWith("image/") && !ArtifactStore.isReference(part.url)
          ? image.normalize(part).pipe(
              Effect.catchIf(
                (error) => error instanceof Image.ResizerUnavailableError,
                () => Effect.succeed(part),
              ),
            )
          : Effect.succeed(part),
      )

      const parsed = decodeMessageInfo(info, { errors: "all", propertyOrder: "original" })
      if (Exit.isFailure(parsed)) {
        log.error("invalid user message before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          agent: info.agent,
          model: info.model,
          cause: Cause.pretty(parsed.cause),
        })
      }
      parts.forEach((part, index) => {
        const p = decodeMessagePart(part, { errors: "all", propertyOrder: "original" })
        if (Exit.isSuccess(p)) return
        log.error("invalid user part before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          partID: part.id,
          partType: part.type,
          index,
          cause: Cause.pretty(p.cause),
          part,
        })
      })

      yield* sessions.updateMessage(info)
      for (const part of parts) yield* sessions.updatePart(part)
      const nextPrompt = parts.reduce(
        (result, part) => {
          if (part.type === "text") {
            if (part.synthetic) result.synthetic.push(part.text)
            else result.text.push(part.text)
            const reference = referencePromptMetadata(part.metadata?.reference)
            if (reference) {
              result.references.push(
                new ReferenceAttachment({
                  name: reference.name,
                  kind: reference.kind,
                  uri: reference.path ? pathToFileURL(reference.path).href : undefined,
                  repository: reference.repository,
                  branch: reference.branch,
                  target: reference.target,
                  targetUri: reference.targetPath ? pathToFileURL(reference.targetPath).href : undefined,
                  problem: reference.problem,
                  source: new Source({
                    start: reference.source.start,
                    end: reference.source.end,
                    text: reference.source.value,
                  }),
                }),
              )
            }
          }
          if (part.type === "file") {
            result.files.push(
              new FileAttachment({
                uri: part.url,
                mime: part.mime,
                name: part.filename,
                source: part.source
                  ? new Source({
                      start: part.source.text.start,
                      end: part.source.text.end,
                      text: part.source.text.value,
                    })
                  : undefined,
              }),
            )
          }
          if (part.type === "agent") {
            result.agents.push(
              new AgentAttachment({
                name: part.name,
                source: part.source
                  ? new Source({
                      start: part.source.start,
                      end: part.source.end,
                      text: part.source.value,
                    })
                  : undefined,
              }),
            )
          }
          return result
        },
        {
          text: [] as string[],
          files: [] as FileAttachment[],
          agents: [] as AgentAttachment[],
          references: [] as ReferenceAttachment[],
          synthetic: [] as string[],
        },
      )
      // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
      if (flags.experimentalEventSystem) {
        yield* events.publish(SessionEvent.Prompted, {
          sessionID: input.sessionID,
          timestamp: DateTime.makeUnsafe(info.time.created),
          prompt: {
            text: nextPrompt.text.join("\n"),
            files: nextPrompt.files,
            agents: nextPrompt.agents,
            references: nextPrompt.references,
          },
        })
      }
      for (const text of nextPrompt.synthetic) {
        // TODO(v2): Temporary dual-write while migrating session messages to v2 events.
        if (flags.experimentalEventSystem) {
          yield* events.publish(SessionEvent.Synthetic, {
            sessionID: input.sessionID,
            timestamp: DateTime.makeUnsafe(info.time.created),
            text,
          })
        }
      }

      return { info, parts }
    }, Effect.scoped)

    const prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts, Image.Error> = Effect.fn(
      "SessionPrompt.prompt",
    )(function* (input: PromptInput) {
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      yield* revert.cleanup(session)



      const createUserMessageStart = Date.now()
      const message = yield* createUserMessage(input)
      log.info("prompt context summary", {
        sessionID: input.sessionID,
        step: 0,
        sections: [
          {
            section: "createUserMessage",
            added: true,
            reason: "persist user prompt before assistant loop",
            size: message.parts.reduce((sum, part) => sum + ("text" in part && typeof part.text === "string" ? part.text.length : 0), 0),
            durationMs: Date.now() - createUserMessageStart,
          },
        ],
      })
      yield* sessions.touch(input.sessionID)

      const permissions: Permission.Rule[] = []
      for (const [t, enabled] of Object.entries(input.tools ?? {})) {
        permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
      }
      if (permissions.length > 0) {
        session.permission = permissions
        yield* sessions.setPermission({ sessionID: session.id, permission: permissions })
      }

      if (input.noReply === true) return message
      return yield* loop({ sessionID: input.sessionID })
    })

    const lastAssistant = Effect.fnUntraced(function* (sessionID: SessionID) {
      const match = yield* sessions.findMessage(sessionID, (m) => m.info.role !== "user").pipe(Effect.orDie)
      if (Option.isSome(match)) return match.value
      const msgs = yield* sessions.messages({ sessionID, limit: 1 }).pipe(Effect.orDie)
      if (msgs.length > 0) return msgs[0]
      throw new Error("Impossible")
    })

    const runLoop = Effect.fn("SessionPrompt.run")(function* (sessionID: SessionID) {
        const ctx = yield* InstanceState.context
        const slog = elog.with({ sessionID })
        let structured: unknown
        let step = 0
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
        const injectionCache = createPromptInjectionCache()

        // Anchor this run to the oldest user prompt whose turn is not closed.
        // Prompts queued while this run is active are never absorbed: they are
        // excluded from the run's message view below and picked up by a fresh
        // run after this one settles (see loop()'s re-arm).
        const anchorMsgs = yield* MessageV2.filterCompactedEffect(sessionID)
        const anchorUserID =
          PromptQueue.pendingUserID(anchorMsgs) ?? anchorMsgs.findLast((m) => m.info.role === "user")?.info.id
        if (!anchorUserID) throw new Error("No user message found in stream. This should never happen.")

        while (true) {
          const contextSummary = createPromptContextSummary(step + 1)
          yield* status.set(sessionID, { type: "busy" })
          yield* slog.info("loop", { step })

          const messageFilteringStart = Date.now()
          let msgs = yield* MessageV2.filterCompactedEffect(sessionID)
          // Keep only the anchored turn (plus run-internal compaction users). A
          // user prompt queued mid-run stays invisible until a fresh run starts.
          msgs = PromptQueue.boundToRun(msgs, anchorUserID)
          contextSummary.add(
            "messageFiltering",
            "filter compacted messages before latest-state selection",
            msgs,
            Date.now() - messageFilteringStart,
          )
          if (flags.experimentalPhaseCapsuleShadow) {
            const capsule = derivePhaseCapsule(msgs)
            contextSummary.add(
              "phaseCapsuleShadow",
              "derive deterministic phase/epoch telemetry without changing prompt context",
              capsule,
              0,
            )
          }

          const latest = MessageV2.latest(msgs)
          // `boundToRun` deliberately keeps newer internal users (compaction
          // continuations and background task notifications) in context. They
          // are data for this run, not the real user turn it was anchored to.
          // Always answer the FIFO anchor; otherwise a newer closed internal
          // turn can replace an older queued prompt and make the fresh run exit
          // without writing an assistant child for that prompt.
          const anchoredUser = msgs.find(
            (msg): msg is MessageV2.WithParts & { info: MessageV2.User } =>
              msg.info.role === "user" && msg.info.id === anchorUserID,
          )
          const lastUser = anchoredUser?.info
          const lastAssistant = latest.assistant
          const lastFinished = latest.finished
          const tasks = latest.tasks

          if (!lastUser) throw new Error("Anchored user message not found in stream. This should never happen.")

          const hasPriorAssistantForCurrentUser = msgs.some(
            (message) => message.info.role === "assistant" && message.info.parentID === lastUser.id,
          )

          const lastAssistantMsg = msgs.findLast(
            (msg) => msg.info.role === "assistant" && msg.info.id === lastAssistant?.id,
          )
          // Some providers return "stop" even when the assistant message contains
          // tool calls. Keep the loop running so tool results can be sent back to
          // the model, but ignore cleanup-marked interrupted orphans.
          const hasToolCalls =
            lastAssistantMsg?.parts.some(
              (part) => part.type === "tool" && !part.metadata?.providerExecuted && !isOrphanedInterruptedTool(part),
            ) ?? false

          // A turn stays open while tool calls are pending, and — when it
          // carries no error — while the provider cut it short (`length`) or
          // returned a reason the adapter could not map (`unknown`).
          const keepGoing =
            lastAssistant?.finish === "tool-calls" ||
            (lastAssistant?.finish !== undefined &&
              UNFINISHED_FINISH.includes(lastAssistant.finish) &&
              lastAssistant.error === undefined)

          // `lastUser.id < lastAssistant.id` alone is not proof the anchored
          // turn was answered: a prompt queued mid-run is older than every
          // assistant the previous turn kept writing after it, yet none of them
          // is its answer. Exiting there leaves that prompt pending forever —
          // the run writes nothing, so the caller re-arms on it endlessly and
          // every later prompt anchors behind it. Require its own assistant.
          if (
            lastAssistant?.finish &&
            !keepGoing &&
            !hasToolCalls &&
            lastUser.id < lastAssistant.id &&
            PromptQueue.turnClosed(msgs, lastUser.id)
          ) {
            const orphan = lastAssistantMsg?.parts.find(
              (part): part is MessageV2.ToolPart => part.type === "tool" && isOrphanedInterruptedTool(part),
            )
            if (orphan) {
              yield* slog.warn("loop exit with orphaned interrupted tool", {
                messageID: lastAssistant.id,
                tool: orphan.tool,
                callID: orphan.callID,
              })
            }
            yield* slog.info("exiting loop")
            break
          }

          step++
          if (step === 1)
            yield* sessionTitle.generate({
              session,
              providerID: lastUser.model.providerID,
              modelID: lastUser.model.modelID,
              history: msgs,
            }).pipe(
              // Non-blocking by design — SessionTitle handles retry/backoff
              // and logging internally so the loop is never blocked or killed.
              Effect.forkIn(scope),
            )

          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
          const task = tasks.pop()

          if (task?.type === "subtask") {
            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })
            continue
          }

          if (task?.type === "compaction") {
            const result = yield* compaction.process({
              messages: msgs,
              parentID: lastUser.id,
              sessionID,
              auto: task.auto,
              overflow: task.overflow,
            })
            if (result === "stop") break
            continue
          }

          if (
            lastFinished &&
            lastFinished.summary !== true &&
            (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }))
          ) {
            yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
            continue
          }

          const agent = yield* agents.get(lastUser.agent)
          if (!agent) {
            const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
            const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
            const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
            yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })
            throw error
          }

          const msg: MessageV2.Assistant = {
            id: MessageV2.nextID(sessionID),
            parentID: lastUser.id,
            role: "assistant",
            mode: agent.name,
            agent: agent.name,
            variant: lastUser.model.variant,
            path: { cwd: ctx.directory, root: ctx.worktree },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: model.id,
            providerID: model.providerID,
            time: { created: Date.now() },
            sessionID,
          }
          yield* sessions.updateMessage(msg)

          // ── Auto-planning for complex tasks ──────────────────────────
          // On the first step of the `build` agent, check if the task is complex
          // and generate a structured execution plan as guidance for the LLM.
          let executionPlan: ExecutionPlan | undefined
          if (
            step === 1 &&
            !hasPriorAssistantForCurrentUser &&
            (lastUser.agent === "build" || lastUser.agent === "orchestrator")
          ) {
            const currentUserMsg = msgs.findLast(
              (candidate) => candidate.info.role === "user" && candidate.info.id === lastUser.id,
            )
            const currentUserText = currentUserMsg ? getUserPromptText(currentUserMsg) : ""
            if (currentUserText && !isContinuationPrompt(currentUserText)) {
              const complexity = PlanEngine.heuristicComplexity(currentUserText)
              if (complexity === "complex" && planEngine) {
                yield* slog.info("auto-planning triggered for complex task")

                // Inform user in TUI that auto-planning is in progress
                const planPart: MessageV2.ReasoningPart = {
                  type: "reasoning",
                  id: PartID.ascending(),
                  messageID: msg.id,
                  sessionID,
                  text: "Planning and decomposing complex task... 📋",
                  time: { start: Date.now() },
                }
                yield* sessions.updatePart(planPart)

                const plan = yield* planEngine.generatePlan(currentUserText).pipe(Effect.option)
                if (Option.isSome(plan)) {
                  executionPlan = plan.value
                  yield* slog.info("execution plan generated", {
                    steps: executionPlan.steps.length,
                    parallelGroups: executionPlan.parallelGroups.length,
                  })
                }

                // Clear temporary reasoning part before starting model generation
                yield* sessions.removePart({ sessionID, messageID: msg.id, partID: planPart.id })
              }
            }
          }

          // ── Ensure Goal/DoD state (non-blocking, every turn) ──
          const goalStateStart = Date.now()
          const goalState = yield* ensureGoalState({
            sessionID,
            msgs,
            lastUserID: lastUser.id,
          })
          contextSummary.add("goal", "ensure task contract state", goalState, Date.now() - goalStateStart)

          const maxSteps = agent.steps
          const isLastStep = reachedStepLimit(step, maxSteps)
          const remindersStart = Date.now()
          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(
            Effect.provideService(RuntimeFlags.Service, flags),
            Effect.provideService(AppFileSystem.Service, fsys),
            Effect.provideService(Session.Service, sessions),
          )
          contextSummary.add("reminders", "apply session reminders to message history", msgs, Date.now() - remindersStart)

          const finalizeInterruptedAssistant = Effect.gen(function* () {
            if (msg.time.completed) return
            msg.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), {
              providerID: msg.providerID,
              aborted: true,
            })
            msg.time.completed = Date.now()
            yield* sessions.updateMessage(msg)
            })

          const handle = yield* processor
            .create({
              assistantMessage: msg,
              sessionID,
              model,
            })
            .pipe(Effect.onInterrupt(() => finalizeInterruptedAssistant))

          const outcome: "break" | "continue" = yield* Effect.gen(function* () {
            const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
            const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false
            const promptOps = yield* ops()

            // Security mode detection:
            // - Set OPENCODE_SECURITY=eval to strip write/shell from model entirely
            // - Set OPENCODE_SECURITY=cli-batch to show tools but require explicit approval
            // - Default (interactive-tui): write/shell always visible and executable
            const securityMode = (process.env.OPENCODE_SECURITY ?? "interactive-tui") as "interactive-tui" | "eval" | "cli-batch"
            const forceWriteTools = securityMode === "interactive-tui" || securityMode === "cli-batch"
            const toolResolutionStart = Date.now()
            const tools = yield* SessionTools.resolve({
              agent,
              session,
              model,
              processor: handle,
              bypassAgentCheck,
              messages: msgs,
              promptOps,
              forceWriteTools,
              securityMode,
              query: anchoredUser.parts
                .flatMap((part) => (part.type === "text" && !part.ignored ? [part.text] : []))
                .join("\n"),
              userTools: lastUser.tools,
            }).pipe(
              Effect.provideService(Plugin.Service, plugin),
              Effect.provideService(Permission.Service, permission),
              Effect.provideService(ToolRegistry.Service, registry),
              Effect.provideService(MCP.Service, mcp),
              Effect.provideService(Truncate.Service, truncate),
              Effect.provideService(Config.Service, config),
              Effect.provideService(Provider.Service, provider),
              Effect.provideService(Image.Service, image),
              Effect.provideService(LLM.Service, llm),
              Effect.provideService(ToolCacheService, toolCache),
            )
            contextSummary.add("toolResolution", "resolve enabled tool definitions", Object.keys(tools), Date.now() - toolResolutionStart)

            if (lastUser.format?.type === "json_schema") {
              tools["StructuredOutput"] = createStructuredOutputTool({
                schema: lastUser.format.schema,
                onSuccess(output) {
                  structured = output
                },
              })
            }

            if (step === 1)
              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))

            const cfg = yield* config.get()
            const promptRollout = SessionContextRollout.resolve(cfg)

            if (step > 1 && lastFinished) {
              for (const m of msgs) {
                if (m.info.role !== "user" || m.info.id <= lastFinished.id) continue
                for (const p of m.parts) {
                  if (p.type !== "text" || p.ignored || p.synthetic) continue
                  if (!p.text.trim()) continue
                  p.text = promptRollout.cavemanSyntheticArtifacts === "on"
                    ? ["REMINDER:", p.text, "Address it if still relevant, then continue toward the current objective."].join("\n")
                    : [
                        "<system-reminder>",
                        "The user sent the following message:",
                        p.text,
                        "",
                        "Address this message if it is still relevant, then continue toward the current objective.",
                        "</system-reminder>",
                      ].join("\n")
                }
              }
            }

            yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

            const preparedMsgs = yield* applyVisionFallback({
              messages: msgs,
              model,
              user: lastUser,
              sessionID,
              agent,
              imageConfig: cfg.attachment?.image,
              promptRollout,
            })

            const [env, loadedInstructions] = yield* Effect.all([
              sys.environment(model),
              instruction.system().pipe(Effect.orDie),
            ])
            const instructions = process.env.OPENCODE_NATIVE_EVAL === "1" ? [] : loadedInstructions
            // Track the fixed system fragments so the context summary covers the
            // FULL system prompt, not only the variable sections.
            contextSummary.add("core", "base agent prompt (PROMPT_CORE or agent.prompt)", agent.prompt ?? PROMPT_CORE, 0)
            contextSummary.add("env", "inject environment info", env, 0)
            contextSummary.add("instructions", "inject AGENTS.md instruction files", instructions, 0)
            const modelMessageConversionStart = Date.now()
            const modelMsgs = yield* MessageV2.toModelMessagesEffect(preparedMsgs, model, {
              replayToolInputs: promptRollout.replayToolInputs,
              replayToolOutputs: promptRollout.replayToolOutputs,
              replayReasoning: promptRollout.replayReasoning,
            })
            contextSummary.add(
              "modelMessageConversion",
              "convert session messages for provider model",
              modelMsgs,
              Date.now() - modelMessageConversionStart,
            )
            const system = [...env, ...instructions]

            // Extract the last user message for skill relevance filtering (every turn)
            const lastUserText = getCurrentTaskText(msgs) || undefined

            // Inject available skills every turn so the agent can always discover them
            const skillsStart = Date.now()
            const skillsKey = `skills:${agent.name}:${createHash("sha1").update(lastUserText ?? "").digest("hex")}`
            const cachedSkills = injectionCache.get(skillsKey)
            const skills = cachedSkills.cached ? cachedSkills.value : injectionCache.set(skillsKey, yield* sys.skills(agent, lastUserText))
            if (skills) system.push(skills)
            contextSummary.add("skills", skills ? "inject relevant skill summary" : "no relevant skill summary", skills, Date.now() - skillsStart, { cached: cachedSkills.cached })

            // Conditionally advertise write/shell tools based on security mode
            const toolListStart = Date.now()
            const cachedToolList = injectionCache.get(`toolList:${securityMode}`)
            const toolList = cachedToolList.cached ? cachedToolList.value : injectionCache.set(`toolList:${securityMode}`, yield* sys.toolList(securityMode))
            if (toolList) system.push(toolList)
            contextSummary.add(
              "toolList",
              toolList ? `inject tool list for security mode ${securityMode}` : "no tool list available",
              toolList,
              Date.now() - toolListStart,
              { cached: cachedToolList.cached },
            )

            // Inject task contract (Goal/DoD) once per turn if available
            if (!system.some((entry) => entry.includes("<task-contract")) && goalState.status !== "skipped") {
              const goalInjectionStart = Date.now()
              const goalKey = `goal:${createHash("sha1").update(JSON.stringify(goalState)).digest("hex")}`
              const cachedGoal = injectionCache.get(goalKey)
              const goalCtx = cachedGoal.cached ? cachedGoal.value : injectionCache.set(goalKey, formatGoalContext(goalState))
              if (goalCtx) system.push(goalCtx)
              contextSummary.add(
                "goal",
                goalCtx ? "inject task contract context" : "task contract produced no context",
                goalCtx,
                Date.now() - goalInjectionStart,
                { cached: cachedGoal.cached },
              )
            }

            // Nudge the agent to drive the objective lifecycle (only while an objective
            // is actively being worked on — not when skipped or already completed).
            const goalActive =
              goalState.status !== "skipped" && goalState.status !== "completed" && goalState.goal?.trim()
            if (goalActive && !system.some((entry) => entry.includes("<goal_reminder"))) {
              const goalReminderStart = Date.now()
              const reminderKey = `goalReminder:active:${goalState.version}:${flags.experimentalLeanProtocolDedupe}:${flags.experimentalQaProofAdvisory}:${flags.experimentalRiskPlannerAdvisory}`
              const cachedGoalReminder = injectionCache.get(reminderKey)
              const editTool = flags.experimentalLeanProtocolDedupe ? "`edit_objective`" : "`edit_objectif`/`edit_objective`"
              const completeTool = flags.experimentalLeanProtocolDedupe ? "`complete_objective`" : "`complete_objectif`/`complete_objective`"
              const qaAdvisory = flags.experimentalQaProofAdvisory ? buildQaProofAdvisory(goalState) : ""
              const riskAdvisory = flags.experimentalRiskPlannerAdvisory
                ? buildRiskAdvisory(goalState, collectStickyFindings(msgs))
                : ""
              const goalReminderText = [
                  "<goal_reminder>",
                  "- Compare the user's latest message with the current objective before acting.",
                  `- If the latest message changes the objective, update it with ${editTool}; if the previous objective is already satisfied, complete it first.`,
                  "- Before finishing, verify the objective and DoD against the actual result and todo state.",
                  `- When objective and DoD are satisfied, call ${completeTool}; it completes without routine user approval.`,
                  "</goal_reminder>",
                  qaAdvisory,
                  riskAdvisory,
                ].filter(Boolean).join("\n") + "\n"
              const goalReminder = cachedGoalReminder.cached && cachedGoalReminder.value !== undefined
                ? cachedGoalReminder.value
                : (injectionCache.set(reminderKey, goalReminderText) ?? goalReminderText)
              system.push(goalReminder)
              contextSummary.add("goal", "inject active objective lifecycle reminder", goalReminder, Date.now() - goalReminderStart, { cached: cachedGoalReminder.cached })
            }

            const stepOneTail: string[] = []
            const turnMemories: Array<{ id: string; content: string }> = []
            if (step === 1) {
              const { prompt: adaptive, memories } = process.env.OPENCODE_NATIVE_EVAL === "1"
                ? { prompt: "", memories: [] }
                : yield* sys.adaptivePrompt({ messages: msgs, agent })
              if (adaptive) stepOneTail.push(adaptive)
              turnMemories.push(...memories)

              // Inject personality context (learned user preferences)
              const personality = process.env.OPENCODE_NATIVE_EVAL === "1" ? "" : yield* sys.personality()
              if (personality) stepOneTail.push(personality)

              // Pending trigger tasks from background daemon
              const daemonStart = Date.now()
              const pendingTasks = process.env.OPENCODE_NATIVE_EVAL === "1"
                ? []
                : yield* Effect.sync(() => TriggerHandler.listPendingTasks())
              if (pendingTasks.length > 0) {
                stepOneTail.push(formatPendingTasksSection(pendingTasks))
              }

              // Daemon notifications (results of auto-execution)
              const notificationsSection = formatNotificationsSection()
              if (notificationsSection) {
                stepOneTail.push(notificationsSection)
                // Acknowledge them so they don't reappear next session
                yield* Effect.sync(() => acknowledgeAll())
              }

              // Daemon learnings (auto-committed tasks from previous sessions)
              const learningsSection = formatLearningsSection()
              if (learningsSection) {
                stepOneTail.push(learningsSection)
                // Acknowledge learnings so they don't reappear next session
                yield* Effect.sync(() => AutoMemory.acknowledgeAllLearnings())
              }

              // Auto-generated execution plan for complex tasks (guidance only)
              if (executionPlan) {
                stepOneTail.push(formatPlanSection(executionPlan))
              }
              contextSummary.add("daemon", "inject first-step adaptive/personality/daemon/plan context", stepOneTail, Date.now() - daemonStart)
            }

            const stepOneMessage = stepOneTail.length ? stepOneTail.join("\n\n") : undefined

            const format = lastUser.format ?? { type: "text" as const }
            if (format.type === "json_schema") system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
            const handleProcessStart = Date.now()
            const result = yield* handle.process({
              user: lastUser,
              agent,
              permission: session.permission,
              sessionID,
              parentSessionID: session.parentID,
              system,
              messages: [
                ...modelMsgs,
                ...(stepOneMessage ? [{ role: "user" as const, content: PromptMethodology.wrapInjectedGuidance(stepOneMessage)! }] : []),
                ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : []),
              ],
              tools,
              model,
              firstStep: step === 1,
              toolChoice: format.type === "json_schema" ? "required" : undefined,
            })
            contextSummary.add("handleProcess", "run provider/model processing", handle.message, Date.now() - handleProcessStart)
            if (isLastStep && !handle.message.error) {
              handle.message.finish = "step-limit"
              yield* sessions.updateMessage(handle.message)
            }
            log.info("prompt context summary", { sessionID, ...contextSummary.snapshot() })

            if (structured !== undefined) {
              handle.message.structured = structured
              handle.message.finish = handle.message.finish ?? "stop"
              yield* sessions.updateMessage(handle.message)
              return "break" as const
            }

            const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
            if (finished && !handle.message.error) {
              if (format.type === "json_schema") {
                handle.message.error = new MessageV2.StructuredOutputError({
                  message: "Model did not produce structured output",
                  retries: 0,
                }).toObject()
                yield* sessions.updateMessage(handle.message)
                return "break" as const
              }
            }

            if (result === "stop") return "break" as const
            if (result === "compact") {
              yield* compaction.create({
                sessionID,
                agent: lastUser.agent,
                model: lastUser.model,
                auto: true,
                overflow: !handle.message.finish,
              })
            }

            // Auto memory-use reflection (non-blocking, fire-and-forget)
            // Uses the bundled free model to judge if retrieved memories helped.
            if (memory && turnMemories.length > 0) {
              const lastUserFull = msgs.findLast((m) => m.info.role === "user" && m.info.id === lastUser.id)
              const userText = lastUserFull ? getUserPromptText(lastUserFull) : ""
              const assistantFull = yield* sessions.findMessage(
                sessionID,
                (m) => m.info.role === "assistant" && m.info.id === handle.message.id,
              )
              const assistantText = Option.isSome(assistantFull)
                ? assistantFull.value.parts
                    .filter((p: MessageV2.Part): p is MessageV2.TextPart => p.type === "text")
                    .filter((p: MessageV2.TextPart) => !p.synthetic && !p.ignored)
                    .map((p: MessageV2.TextPart) => p.text)
                    .join("\n")
                    .trim()
                : ""

              if (userText && assistantText) {
                yield* Effect.forkIn(scope)(
                  ReflectUse.reflectAndRecord(
                    {
                      userMessage: userText,
                      assistantMessage: assistantText,
                      memories: turnMemories,
                    },
                    memory,
                  ).pipe(Effect.ignore),
                )
              }
            }

            return "continue" as const
          }).pipe(
            Effect.ensuring(instruction.clear(handle.message.id)),
            Effect.onInterrupt(() => finalizeInterruptedAssistant),
          )
          if (outcome === "break") break
          // Hard stop only when the agent explicitly configured a step budget.
          // An omitted budget intentionally leaves the agentic loop unbounded.
          if (reachedStepLimit(step, maxSteps)) break
          continue
        }

        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))

        // Auto post-mortem (non-blocking, fire-and-forget)
        // Memory is optional in some tests / lightweight runtimes.
        if (memory) {
          yield* Effect.forkIn(scope)(
            Effect.gen(function* () {
              const report = yield* memory.analyzeSession(sessionID)
              log.info("auto post-mortem completed", {
                sessionID,
                learningsStored: report.learnings.length,
                success: report.summary.success,
              })
            }).pipe(Effect.ignore),
          )
        }

        // Record interaction for adaptive personality (non-blocking)
        if (selfImprove) {
          yield* Effect.gen(function* () {
            const lastMsg = yield* lastAssistant(sessionID)
            if (lastMsg.parts.length > 1) {
              yield* selfImprove.recordInteraction({
                sessionId: sessionID, taskType: "general", toolsUsed: [],
                agentsUsed: [], messageLength: "medium",
                assistantResponseLength: "medium", success: true, errorCount: 0,
              })
            }
          }).pipe(Effect.ignore, Effect.forkIn(scope))
        }

        return yield* lastAssistant(sessionID)
      }) as (sessionID: SessionID) => Effect.Effect<MessageV2.WithParts>

    const ensureGoalState = Effect.fn("SessionPrompt.ensureGoalState")(function* (input: {
      sessionID: SessionID
      msgs: MessageV2.WithParts[]
      lastUserID: MessageID
    }) {
      const currentSession = yield* sessions.get(input.sessionID).pipe(Effect.option)
      const existing = Option.isSome(currentSession) ? currentSession.value.goalState : undefined
      const previousVersion = Option.isSome(currentSession) ? (currentSession.value.goalState?.version ?? 0) : 0

      // A completed objective must NOT be resurrected within the same turn, nor on a
      // continuation prompt ("ok"/"continue"), which would fall back to old user text
      // (buildGoalSourceText) and make the agent redo the finished work. Only a real,
      // substantial new prompt (new lastUserID) re-derives a fresh objective.
      if (existing && existing.status === "completed") {
        if (existing.anchorUserID === input.lastUserID) return existing
        const currentUserMsg = input.msgs.findLast(
          (candidate) => candidate.info.role === "user" && candidate.info.id === input.lastUserID,
        )
        const currentUserText = currentUserMsg ? getUserPromptText(currentUserMsg).trim() : ""
        const isSubstantial = currentUserText.length >= 40 && !isContinuationPrompt(currentUserText)
        if (!isSubstantial) return existing
        // else: fall through to regeneration from the new prompt below
      } else if (isValidGoalState(existing)) {
        return existing
      }

      const sourceText = buildGoalSourceText({ msgs: input.msgs, lastUserID: input.lastUserID })
      const draft = generateGoalDraft(sourceText)
      // The objective is the business goal: persistent across a session. A goal set
      // by the user must stay sticky and only its DoD (specific objectives/measures)
      // evolves with new prompts; only an auto-derived goal may be replaced. todos
      // remain the real-task layer handled separately by todowrite.
      const stickyUserGoal = existing?.source === "user" && hasObjective(existing)
      const goal = stickyUserGoal
        ? existing.goal
        : draft?.goal?.trim() ||
          sourceText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean) ||
          "Continuer la tâche demandée par l'utilisateur"
      const nextState: GoalState = {
        status: "draft",
        source: stickyUserGoal ? "user" : "auto",
        goal,
        dod: draft?.dod?.length
          ? draft.dod
          : ["Produire une réponse utile et actionnable alignée avec la demande en cours."],
        outOfScope: stickyUserGoal ? existing.outOfScope : (draft?.outOfScope ?? []),
        compressed: "",
        anchorUserID: input.lastUserID,
        version: previousVersion + 1,
        updatedAt: Date.now(),
      }

      try {
        nextState.compressed = compressGoalState(nextState)
      } catch {
        // keep non-blocking behavior
      }

      yield* sessions.setGoalState({ sessionID: input.sessionID, goalState: nextState })

      return nextState
    })

    const loop: (input: LoopInput) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.loop")(function* (
      input: LoopInput,
    ) {
      const arm = () =>
        state.ensureRunning(
          input.sessionID,
          lastAssistant(input.sessionID) as Effect.Effect<MessageV2.WithParts>,
          runLoop(input.sessionID) as Effect.Effect<MessageV2.WithParts>,
        )

      // Coalesced re-arm against a lost-wakeup race.
      //
      // A queued user prompt can be persisted in the narrow window after the
      // active run takes its final message read (and decides to break) but
      // before the runner transitions to idle. Concurrent loop callers share
      // that run's `done` latch, so they return its (now stale) assistant and
      // would leave the queued prompt unprocessed forever.
      //
      // After a run settles, re-check: if any user prompt is still pending,
      // arm again. `state.ensureRunning` re-fetches the runner per call (the
      // idle runner is removed from the session map), so this starts a real
      // fresh run once the previous one is idle rather than re-joining a
      // finished one. Each fresh run anchors to the oldest pending prompt, so
      // multiple queued prompts drain in FIFO order, and a normally completed
      // turn (its user closed by a finished assistant) never re-arms.
      //
      // Re-arm only while the oldest pending prompt keeps changing. A prompt
      // queued mid-run whose run never answered it (its assistants stay
      // parented to the earlier prompt) can never close its turn: a fresh run
      // anchored to it exits on the break invariant without writing anything,
      // so re-arming on it spins forever — burning CPU, flipping session
      // status busy/idle on every pass and never releasing the client's turn.
      const pendingUser = Effect.gen(function* () {
        const msgs = yield* MessageV2.filterCompactedEffect(input.sessionID)
        return PromptQueue.pendingUserID(msgs)
      })

      let result = yield* arm()
      let pending = yield* pendingUser
      while (pending !== undefined) {
        result = yield* arm()
        const next = yield* pendingUser
        if (next === pending) break
        pending = next
      }
      return result
    })

    const shell: (input: ShellInput) => Effect.Effect<MessageV2.WithParts, Session.BusyError> = Effect.fn(
      "SessionPrompt.shell",
    )(function* (input: ShellInput) {
      const ready = yield* Latch.make()
      return yield* state.startShell(input.sessionID, lastAssistant(input.sessionID), shellImpl(input, ready), ready)
    })

    const command = Effect.fn("SessionPrompt.command")(function* (input: CommandInput) {
      yield* elog.info("command", { sessionID: input.sessionID, command: input.command, agent: input.agent })
      const cmd = yield* commands.get(input.command)
      if (!cmd) {
        const available = (yield* commands.list()).map((c) => c.name)
        const hint = available.length ? ` Available commands: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Command not found: "${input.command}".${hint}` })
        yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }
      const agentName = cmd.agent ?? input.agent

      const raw = input.arguments.match(argsRegex) ?? []
      const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))
      const templateCommand = yield* Effect.promise(async () => cmd.template)

      const placeholders = templateCommand.match(placeholderRegex) ?? []
      let last = 0
      for (const item of placeholders) {
        const value = Number(item.slice(1))
        if (value > last) last = value
      }

      const withArgs = templateCommand.replaceAll(placeholderRegex, (_, index) => {
        const position = Number(index)
        const argIndex = position - 1
        if (argIndex >= args.length) return ""
        if (position === last) return args.slice(argIndex).join(" ")
        return args[argIndex]
      })
      const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
      let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

      if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
        template = template + "\n\n" + input.arguments
      }

      const shellMatches = ConfigMarkdown.shell(template)
      if (shellMatches.length > 0) {
        const cfg = yield* config.get()
        const sh = Shell.preferred(cfg.shell)
        const results = yield* Effect.promise(() =>
          Promise.all(
            shellMatches.map(async ([, cmd]) => (await Process.text([cmd], { shell: sh, nothrow: true })).text),
          ),
        )
        let index = 0
        template = template.replace(bashRegex, () => results[index++])
      }
      template = template.trim()

      const taskModel = yield* Effect.gen(function* () {
        if (cmd.model) return Provider.parseModel(cmd.model)
        if (cmd.agent) {
          const cmdAgent = yield* agents.get(cmd.agent)
          if (cmdAgent?.model) return cmdAgent.model
        }
        if (input.model) return Provider.parseModel(input.model)
        return yield* currentModel(input.sessionID)
      })

      yield* getModel(taskModel.providerID, taskModel.modelID, input.sessionID)

      const agent = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!agent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const templateParts = yield* resolvePromptParts(template)
      const isSubtask = (agent.mode === "subagent" && cmd.subtask !== false) || cmd.subtask === true
      const parts = isSubtask
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: cmd.description ?? "",
              command: input.command,
              model: { providerID: taskModel.providerID, modelID: taskModel.modelID },
              prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
            },
          ]
        : [...templateParts, ...(input.parts ?? [])]

      const userAgent = isSubtask ? (input.agent ?? (yield* agents.defaultInfo()).name) : agent.name
      const userModel = isSubtask
        ? input.model
          ? Provider.parseModel(input.model)
          : yield* currentModel(input.sessionID)
        : taskModel

      yield* plugin.trigger(
        "command.execute.before",
        { command: input.command, sessionID: input.sessionID, arguments: input.arguments },
        { parts },
      )

      const result = yield* prompt({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: userModel,
        agent: userAgent,
        parts,
        variant: input.variant,
      })
      yield* bus.publish(Command.Event.Executed, {
        name: input.command,
        sessionID: input.sessionID,
        arguments: input.arguments,
        messageID: result.info.id,
      })
      return result
    })

    return Service.of({
      cancel,
      prompt,
      loop,
      shell,
      command,
      resolvePromptParts,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        SessionRunState.defaultLayer,
        SessionStatus.defaultLayer,
        SessionCompaction.defaultLayer,
        SessionProcessor.defaultLayer,
        Command.defaultLayer,
        Permission.defaultLayer,
        MCP.defaultLayer,
        LSP.defaultLayer,
        ToolRegistry.defaultLayer,
        Truncate.defaultLayer,
        Question.defaultLayer,
        ToolCacheService.defaultLayer,
      ),
    ),
    Layer.provide(
      Layer.mergeAll(
        Provider.defaultLayer,
        Config.defaultLayer,
        Instruction.defaultLayer,
        AppFileSystem.defaultLayer,
        Plugin.defaultLayer,
        Session.defaultLayer,
        SessionRevert.defaultLayer,
        SessionSummary.defaultLayer,
        SessionTitle.defaultLayer,
        SessionContextRollout.defaultLayer,
        Image.defaultLayer,
      ),
    ),
    Layer.provide(
      Layer.mergeAll(
        EventV2Bridge.defaultLayer,
        Agent.defaultLayer,
        SystemPrompt.defaultLayer,
        LLM.defaultLayer,
        Reference.defaultLayer,
        Memory.defaultLayer,
        // 🔇 PlanEngine.defaultLayer, — désactivé : auto_plan cause des dysfonctionnements

        Bus.layer,
        CrossSpawnSpawner.defaultLayer,
        RuntimeFlags.defaultLayer,
        PostMortem.defaultLayer,
      ),
    ),
  ),
)
const ModelRef = Schema.Struct({
  providerID: ProviderID,
  modelID: ModelID,
})

export const PromptInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  noReply: Schema.optional(Schema.Boolean),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
    description:
      "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
  }),
  format: Schema.optional(MessageV2.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: Schema.Array(
    Schema.Union([
      MessageV2.TextPartInput,
      MessageV2.FilePartInput,
      MessageV2.AgentPartInput,
      MessageV2.SubtaskPartInput,
    ]).annotate({ discriminator: "type" }),
  ),
})
export type PromptInput = Schema.Schema.Type<typeof PromptInput>

export class LoopInput extends Schema.Class<LoopInput>("SessionPrompt.LoopInput")({
  sessionID: SessionID,
}) {}

export const ShellInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  agent: Schema.String,
  model: Schema.optional(ModelRef),
  command: Schema.String,
})
export type ShellInput = Schema.Schema.Type<typeof ShellInput>

export const CommandInput = Schema.Struct({
  messageID: Schema.optional(MessageID),
  sessionID: SessionID,
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  arguments: Schema.String,
  command: Schema.String,
  variant: Schema.optional(Schema.String),
  // Inlined (no identifier annotation) to keep the original SDK output — the
  // PromptInput call site below references FilePartInput by ref via the
  // Schema export in message-v2.ts.
  parts: Schema.optional(
    Schema.Array(
      Schema.Union([
        Schema.Struct({
          id: Schema.optional(PartID),
          type: Schema.Literal("file"),
          mime: Schema.String,
          filename: Schema.optional(Schema.String),
          url: Schema.String,
          source: Schema.optional(MessageV2.FilePartSource),
        }),
      ]).annotate({ discriminator: "type" }),
    ),
  ),
})
export type CommandInput = Schema.Schema.Type<typeof CommandInput>

/** @internal Exported for testing */
export function createStructuredOutputTool(input: {
  schema: Record<string, any>
  onSuccess: (output: unknown) => void
}): AITool {
  // Remove $schema property if present (not needed for tool input)
  const { $schema: _, ...toolSchema } = input.schema

  return tool({
    description: STRUCTURED_OUTPUT_DESCRIPTION,
    inputSchema: jsonSchema(toolSchema as JSONSchema7),
    async execute(args) {
      // AI SDK validates args against inputSchema before calling execute()
      input.onSuccess(args)
      return {
        output: "Structured output captured successfully.",
        title: "Structured Output",
        metadata: { valid: true },
      }
    },
    toModelOutput({ output }) {
      return {
        type: "text",
        value: output.output,
      }
    },
  })
}
const bashRegex = /!`([^`]+)`/g
// Match [Image N] as single token, quoted strings, or non-space sequences
const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

/**
 * Generate a goal/DoD draft from user text using simple heuristics.
 * Accepts both direct prompt text and enriched text built from recent history.
 * Returns undefined only when no meaningful source text is available.
 */
function generateGoalDraft(userText: string): { goal: string; dod: string[]; outOfScope: string[] } | undefined {
  const text = userText.trim()
  if (!text) return undefined

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean)
  let goal = ""
  const dod: string[] = []
  const oos: string[] = []

  // First meaningful sentence = goal
  for (const line of lines) {
    const clean = line.replace(/^[#>\s]*/, "")
    if (!goal && clean.length > 10 && !clean.startsWith("-") && !clean.startsWith("*")) {
      const sentence = (clean.split(/[.!?]\s/)[0] ?? clean).slice(0, 200)
      goal = sentence
      break
    }
  }

  // Bullet items = DoD or OOS
  for (const line of lines) {
    if (!line.startsWith("-") && !line.startsWith("*")) continue
    const item = line.replace(/^[-*\s]+/, "").trim()
    if (!item || item.length < 3) continue
    const lower = item.toLowerCase()
    if (lower.includes("hors scope") || lower.includes("out of scope") || lower.includes("ne pas ") || lower.includes("exclu")) {
      oos.push(item)
    } else if (!lower.startsWith("goal") && !lower.startsWith("objectif")) {
      dod.push(item)
    }
  }

  if (!goal) return undefined
  if (dod.length === 0) {
    dod.push("Fournir une implémentation/réponse exploitable qui adresse explicitement l'objectif.")
  }

  return { goal, dod, outOfScope: oos }
}

/**
 * Images a model without image input cannot consume, for one message part.
 *
 * Both delivery paths must be covered: the user attaches an image to the prompt
 * (file part), and a tool returns one (read, webfetch…) as a tool-result
 * attachment. Only the first path used to be handled, so reading an image with
 * a non-vision model silently produced an unusable result.
 */
export function unreadableImages(part: MessageV2.Part): MessageV2.FilePart[] {
  const isImage = (attachment: { mime: string }) => attachment.mime.startsWith("image/")
  if (part.type === "file") return isImage(part) ? [part] : []
  if (part.type === "tool" && part.state.status === "completed")
    return (part.state.attachments ?? []).filter(isImage)
  return []
}

export * as SessionPrompt from "./prompt"
