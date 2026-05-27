/**
 * PostMortem — Session analysis, learning extraction, and improvement suggestions.
 *
 * Analyzes completed coding sessions to extract:
 * - What tools were used and how
 * - What errors occurred and why
 * - What decisions were made
 * - What patterns emerged (successful or failed)
 * - Concrete improvement suggestions
 *
 * These learnings are then stored back into the Memory system for future reference,
 * creating a continuous improvement loop.
 *
 * Architecture:
 * ┌──────────────┐     ┌───────────────┐     ┌──────────┐
 * │ Session      │────▶│ PostMortem    │────▶│ Memory   │
 * │ (messages,   │     │ - analyze()   │     │ (store)  │
 * │  tools,      │     │ - extract()   │     │          │
 * │  errors)     │     │ - suggest()   │     │          │
 * └──────────────┘     └───────────────┘     └──────────┘
 */

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"

const log = Log.create({ service: "memory.post-mortem" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionSummary {
  sessionId: string
  taskDescription: string
  duration: number
  toolsUsed: string[]
  toolCallCount: number
  errors: ErrorRecord[]
  success: boolean
  keyDecisions: string[]
  patternsFound: string[]
  suggestions: string[]
  fileChanges: FileChange[]
  tokenUsage: TokenUsage
}

export interface ErrorRecord {
  tool: string
  message: string
  count: number
  recovered: boolean
}

export interface FileChange {
  path: string
  type: "create" | "edit" | "delete"
}

export interface TokenUsage {
  input: number
  output: number
  total: number
  cost: number
}

export interface Learning {
  type: "pattern" | "decision" | "pitfall" | "optimization"
  content: string
  context: string
  confidence: number
  tags: string[]
}

export interface PostMortemReport {
  summary: SessionSummary
  learnings: Learning[]
  recommendations: string[]
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface Interface {
  /** Analyze a completed session and generate a full report. */
  readonly analyze: (sessionId: string) => Effect.Effect<PostMortemReport>

  /** Extract structured learnings from a report. */
  readonly extractLearnings: (report: PostMortemReport) => Effect.Effect<Learning[]>

  /** Generate improvement suggestions based on historical patterns. */
  readonly suggestImprovements: () => Effect.Effect<string[]>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/PostMortem") {}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Classify a tool usage pattern based on the tool name and its arguments.
 */
function classifyToolUsage(toolName: string, args: Record<string, unknown>): string[] {
  const patterns: string[] = []

  if (toolName === "edit" || toolName === "write") {
    patterns.push("file-modification")
    if (typeof args.oldString === "string" && args.oldString.length > 50) {
      patterns.push("large-edit")
    }
  }
  if (toolName === "bash" || toolName === "shell") {
    patterns.push("shell-execution")
    if (typeof args.command === "string" && args.command.includes("test")) {
      patterns.push("test-execution")
    }
    if (typeof args.command === "string" && (args.command.includes("install") || args.command.includes("add"))) {
      patterns.push("dependency-management")
    }
  }
  if (toolName === "task") {
    patterns.push("subagent-delegation")
    if (typeof args.subagent_type === "string") {
      patterns.push(`subagent-${args.subagent_type}`)
    }
  }
  if (toolName === "websearch" || toolName === "webfetch") {
    patterns.push("web-research")
  }
  if (toolName === "grep" || toolName === "glob") {
    patterns.push("code-search")
  }
  if (toolName === "skill") {
    patterns.push("skill-loading")
  }

  return patterns
}

/**
 * Determine if a session was successful based on available signals.
 */
function assessSuccess(errors: ErrorRecord[]): boolean {
  const fatalErrors = errors.filter((e) => !e.recovered)
  return fatalErrors.length === 0
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service

    const analyze = Effect.fn("PostMortem.analyze")(function* (sessionId: string) {
      log.info("analyzing session", { sessionId })

      // 1. Load session and messages
      const session = yield* (sessions.get as any)(sessionId as any).pipe(
        Effect.catch(() => Effect.succeed(null as any)),
      )
      if (!session) {
        log.warn("session not found", { sessionId })
        return {
          summary: {
            sessionId, taskDescription: "", duration: 0, toolsUsed: [], toolCallCount: 0,
            errors: [], success: true, keyDecisions: [], patternsFound: [], suggestions: [],
            fileChanges: [], tokenUsage: { input: 0, output: 0, total: 0, cost: 0 },
          },
          learnings: [],
          recommendations: [],
        } satisfies PostMortemReport
      }
      const messages = yield* (sessions.messages as any)({ sessionID: sessionId as any }).pipe(
        Effect.catch(() => Effect.succeed([] as any)),
      )

      // 2. Analyze tool usage
      const toolUsage = new Map<string, number>()
      const errorMap = new Map<string, ErrorRecord>()
      const fileChanges: FileChange[] = []
      const seenFiles = new Set<string>()

      for (const msg of messages) {
        for (const part of msg.parts) {
          // Track tool calls
          if (part.type === "tool") {
            const toolName = part.tool
            toolUsage.set(toolName, (toolUsage.get(toolName) ?? 0) + 1)

            // Track file changes from completed tool states
            const state = part.state
            if (state.status === "completed" || state.status === "running") {
              const input = state.input ?? {}
              if (toolName === "edit" && typeof input.filePath === "string") {
                if (!seenFiles.has(input.filePath)) {
                  seenFiles.add(input.filePath)
                  fileChanges.push({ path: input.filePath, type: "edit" })
                }
              }
              if (toolName === "write" && typeof input.filePath === "string") {
                if (!seenFiles.has(input.filePath)) {
                  seenFiles.add(input.filePath)
                  fileChanges.push({ path: input.filePath, type: "create" })
                }
              }
            }

            // Track errors
            if (state.status === "error") {
              const errMsg = state.error.slice(0, 200)
              const existing = errorMap.get(toolName)
              if (existing) {
                existing.count++
              } else {
                errorMap.set(toolName, {
                  tool: toolName,
                  message: errMsg,
                  count: 1,
                  recovered: false,
                })
              }
            }

            // Also check completed states with isError
            if (state.status === "completed" && state.isError) {
              const errMsg = typeof state.output === "string" ? state.output.slice(0, 200) : "Error"
              const existing = errorMap.get(toolName)
              if (existing) {
                existing.count++
                if (state.metadata?.recovered) {
                  existing.recovered = true
                }
              } else {
                errorMap.set(toolName, {
                  tool: toolName,
                  message: errMsg,
                  count: 1,
                  recovered: state.metadata?.recovered ?? false,
                })
              }
            }
          }
        }
      }

      // 3. Extract patterns from tool usage
      const patternsFound: string[] = []
      for (const [tool, count] of toolUsage) {
        if (count >= 3) {
          patternsFound.push(`Heavy use of ${tool} (${count} calls)`)
        }
      }

      // 4. Extract key decisions from text parts
      const keyDecisions: string[] = []
      for (const msg of messages) {
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            const text = part.text.toLowerCase()
            if (text.includes("i will use") || text.includes("let's use") || text.includes("we'll use")) {
              keyDecisions.push(part.text.slice(0, 150))
            }
            if (text.includes("decision:") || text.includes("chose to")) {
              keyDecisions.push(part.text.slice(0, 150))
            }
          }
        }
      }

      // 5. Compute task description from first user message
      const taskDescription = (() => {
        for (const msg of messages) {
          for (const part of msg.parts) {
            if (part.type === "text" && typeof part.text === "string" && part.text.length > 10) {
              return part.text.slice(0, 300)
            }
          }
        }
        return ""
      })()

      // 6. Build errors list
      const errors = Array.from(errorMap.values())

      // 7. Assess success
      const success = assessSuccess(errors)

      // 8. Generate suggestions
      const suggestions: string[] = []
      if (toolUsage.has("bash") && (toolUsage.get("bash") ?? 0) > 5) {
        suggestions.push("Considérer d'utiliser des sous-agents pour les séquences de commandes complexes")
      }
      if (errors.length > 2) {
        suggestions.push("Augmenter la vérification après chaque modification importante")
      }
      if (!toolUsage.has("task")) {
        suggestions.push("Utiliser les sous-agents (Task tool) pour les tâches exploratoires")
      }
      if (!toolUsage.has("skill")) {
        suggestions.push("Charger des skills spécialisés pour les tâches récurrentes")
      }

      const report: PostMortemReport = {
        summary: {
          sessionId,
          taskDescription,
          duration: (session.tokens?.input ?? 0) > 0 ? Date.now() - session.time.created : 0,
          toolsUsed: Array.from(toolUsage.keys()),
          toolCallCount: Array.from(toolUsage.values()).reduce((a, b) => a + b, 0),
          errors,
          success,
          keyDecisions: keyDecisions.slice(0, 5),
          patternsFound: patternsFound.slice(0, 5),
          suggestions: suggestions.slice(0, 3),
          fileChanges: fileChanges.slice(0, 20),
          tokenUsage: {
            input: session.tokens?.input ?? 0,
            output: session.tokens?.output ?? 0,
            total: (session.tokens?.input ?? 0) + (session.tokens?.output ?? 0),
            cost: session.cost ?? 0,
          },
        },
        learnings: [],
        recommendations: suggestions,
      }

      log.info("session analysis complete", {
        toolsUsed: report.summary.toolsUsed.length,
        errors: report.summary.errors.length,
        success: report.summary.success,
      })

      return report
    })

    const extractLearnings = Effect.fn("PostMortem.extractLearnings")(function* (report: PostMortemReport) {
      const learnings: Learning[] = []

      // From patterns
      for (const pattern of report.summary.patternsFound) {
        learnings.push({
          type: "pattern",
          content: pattern,
          context: report.summary.taskDescription.slice(0, 100),
          confidence: 0.6,
          tags: ["pattern", "usage"],
        })
      }

      // From decisions
      for (const decision of report.summary.keyDecisions) {
        learnings.push({
          type: "decision",
          content: decision,
          context: report.summary.taskDescription.slice(0, 100),
          confidence: 0.7,
          tags: ["decision", "architecture"],
        })
      }

      // From errors
      for (const error of report.summary.errors) {
        learnings.push({
          type: "pitfall",
          content: `${error.tool}: ${error.message} (x${error.count}, recovered: ${error.recovered})`,
          context: report.summary.taskDescription.slice(0, 100),
          confidence: error.recovered ? 0.5 : 0.8,
          tags: ["pitfall", error.tool],
        })
      }

      // From file changes
      if (report.summary.fileChanges.length > 5) {
        learnings.push({
          type: "optimization",
          content: `Large batch of ${report.summary.fileChanges.length} file changes in one session — consider breaking into smaller tasks`,
          context: report.summary.taskDescription.slice(0, 100),
          confidence: 0.4,
          tags: ["optimization", "granularity"],
        })
      }

      // From tool diversity
      if (report.summary.toolsUsed.length <= 2) {
        learnings.push({
          type: "optimization",
          content: `Only used ${report.summary.toolsUsed.join(", ")} — explore more specialized tools for better results`,
          context: report.summary.taskDescription.slice(0, 100),
          confidence: 0.3,
          tags: ["optimization", "tool-diversity"],
        })
      }

      return learnings
    })

    const suggestImprovements = Effect.fn("PostMortem.suggestImprovements")(function* () {
      // In a full implementation, this would query historical post-mortem results
      // and generate personalized suggestions based on patterns.
      return [
        "Utiliser des sous-agents spécialisés pour les tâches complexes (Task tool)",
        "Charger les skills pertinents avant de commencer une tâche",
        "Valider les changements par des tests après chaque modification",
        "Explorer plusieurs approches avant d'implémenter",
        "Documenter les décisions architecturales dans la mémoire",
      ]
    })

    return Service.of({ analyze: analyze as any, extractLearnings: extractLearnings as any, suggestImprovements: suggestImprovements as any })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Session.defaultLayer),
)

export const use = serviceUse(Service)

export * as PostMortem from "."
