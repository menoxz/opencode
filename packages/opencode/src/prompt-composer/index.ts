/**
 * PromptComposer — Adaptive system prompt composition based on task type.
 *
 * Analyzes the user's message to detect the task type (bug fix, feature,
 * refactor, research, architecture, debug, code review, test) and composes
 * the optimal system prompt by injecting task-specific instructions.
 *
 * Architecture:
 * ┌────────────┐    ┌──────────────┐    ┌──────────────┐
 * │ User Msg   │───▶│ TaskDetector │───▶│ TaskType     │
 * │            │    │ (heuristic)  │    │ (enum)       │
 * └────────────┘    └──────────────┘    └──────┬───────┘
 *                                              │
 *                                     ┌────────▼───────┐
 *                                     │ PromptComposer │
 *                                     │ - base prompt  │
 *                                     │ + task prompt  │
 *                                     │ + env + skills │
 *                                     └────────────────┘
 *
 * Module shape: single-namespace directory with self-reexport at bottom.
 */

import { Effect, Context, Layer, Schema } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { serviceUse } from "@opencode-ai/core/effect/service-use"

// Import task-specific prompt texts
import PROMPT_BUG_FIX from "../session/prompt/task-specific/bug-fix.txt"
import PROMPT_FEATURE from "../session/prompt/task-specific/feature.txt"
import PROMPT_REFACTOR from "../session/prompt/task-specific/refactor.txt"
import PROMPT_RESEARCH from "../session/prompt/task-specific/research.txt"
import PROMPT_ARCHITECTURE from "../session/prompt/task-specific/architecture.txt"
import PROMPT_DEBUG from "../session/prompt/task-specific/debug.txt"
import PROMPT_CODE_REVIEW from "../session/prompt/task-specific/code-review.txt"
import PROMPT_TEST from "../session/prompt/task-specific/test.txt"
import PROMPT_GENERAL from "../session/prompt/task-specific/general.txt"

const log = Log.create({ service: "prompt-composer" })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const TaskType = {
  BUG_FIX: "bug-fix",
  FEATURE: "feature",
  REFACTOR: "refactor",
  RESEARCH: "research",
  ARCHITECTURE: "architecture",
  DEBUG: "debug",
  CODE_REVIEW: "code-review",
  TEST: "test",
  GENERAL: "general",
} as const

export type TaskType = (typeof TaskType)[keyof typeof TaskType]

export interface DetectedTask {
  type: TaskType
  confidence: number
  reason: string
}

export interface Interface {
  /** Detect the task type from a user message. */
  readonly detect: (message: string, context?: {
    files?: string[]
    toolsUsed?: string[]
  }) => Effect.Effect<DetectedTask>

  /** Get the task-specific prompt fragment for a task type. */
  readonly getTaskPrompt: (type: TaskType) => string

  /** Compose the full system prompt: base + task instructions + context. */
  readonly compose: (input: {
    basePrompt: string
    taskMessage: string
    environmentInfo: string[]
    instructions: string[]
    skills?: string
    contextFiles?: string[]
    toolHistory?: string[]
  }) => Effect.Effect<string[]>
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class Service extends Context.Service<Service, Interface>()("@opencode/PromptComposer") {}

// ---------------------------------------------------------------------------
// Heuristic task detection
// ---------------------------------------------------------------------------

const TASK_PATTERNS: Record<string, { type: TaskType; weight: number; patterns: RegExp[] }> = {
  bugFix: {
    type: TaskType.BUG_FIX,
    weight: 1,
    patterns: [
      /bug|fix|broken|wrong|incorrect|error|issue|not working|doesn't work|fails?|crash|panic/i,
      /unexpected|regression|defect|glitch|malfunction/i,
      /repair|patch|hotfix|workaround/i,
    ],
  },
  debug: {
    type: TaskType.DEBUG,
    weight: 1.2,
    patterns: [
      /debug|stack trace|exception|uncaught|throw|typeerror|referenceerror/i,
      /undefined is not|null|undefined|failed with|exit code/i,
      /diagnos|investigate why|why is|what causes|root cause/i,
    ],
  },
  feature: {
    type: TaskType.FEATURE,
    weight: 0.8,
    patterns: [
      /add (a |an |the )?new|build a|create a|implement a/i,
      /new feature|new function|new component|new module/i,
      /support for|allow users|enable .+ to/i,
      /feat:|feature request/i,
    ],
  },
  refactor: {
    type: TaskType.REFACTOR,
    weight: 1.3,
    patterns: [
      /refactor|restructure|reorganize|clean up|simplify|extract|deduplicate/i,
      /improve code|reduce complexity|technical debt|reusab/i,
      /split|merge|rename|move|consolidate/i,
    ],
  },
  research: {
    type: TaskType.RESEARCH,
    weight: 1.5,
    patterns: [
      /^research|investigate|^explore|find out|learn about/i,
      /documentation|compare alternatives|options for/i,
      /look into|spike|proof of concept|evaluate (the|this|these)/i,
      /how does (this|it|the) work|what is the best|should i use/i,
    ],
  },
  architecture: {
    type: TaskType.ARCHITECTURE,
    weight: 1.4,
    patterns: [
      /architect|design|architecture|high.level|system design|component design/i,
      /schema|data model|api design|interface|protocol/i,
      /decision|trade.off|scalab|modular|microservice/i,
    ],
  },
  codeReview: {
    type: TaskType.CODE_REVIEW,
    weight: 1.5,
    patterns: [
      /review|code review|pull request|pr review|audit|inspect/i,
      /check my code|review this|look at this code/i,
    ],
  },
  test: {
    type: TaskType.TEST,
    weight: 1,
    patterns: [
      /test|unit test|integration test|e2e|spec|coverage|assert/i,
      /tdd|test.driven|testing|test case|test suite/i,
      /write tests|add tests|test coverage/i,
    ],
  },
}

const OVERRIDE_PATTERNS: { type: TaskType; patterns: RegExp[] }[] = [
  { type: TaskType.DEBUG, patterns: [/debug this|help me debug/i] },
  { type: TaskType.BUG_FIX, patterns: [/fix this bug|bug report/i] },
  { type: TaskType.CODE_REVIEW, patterns: [/review this pr|code review request/i] },
  { type: TaskType.REFACTOR, patterns: [/refactor this|technical debt/i] },
  { type: TaskType.TEST, patterns: [/write tests for|add unit tests/i] },
]

export function heuristicDetect(message: string, context?: {
  files?: string[]
  toolsUsed?: string[]
}): DetectedTask {
  const lower = message.toLowerCase()

  // Check for explicit overrides first
  for (const override of OVERRIDE_PATTERNS) {
    if (override.patterns.some((p) => p.test(lower))) {
      return { type: override.type, confidence: 0.95, reason: "Explicit override match" }
    }
  }

  // Score each task type
  const scores = new Map<TaskType, number>()
  for (const [, config] of Object.entries(TASK_PATTERNS)) {
    let score = 0
    for (const pattern of config.patterns) {
      const matches = lower.match(pattern)
      if (matches) score += matches.length * config.weight
    }
    if (score > 0) {
      scores.set(config.type, (scores.get(config.type) ?? 0) + score)
    }
  }

  // Consider context clues from tool history
  if (context?.toolsUsed) {
      if (context.toolsUsed.some((t) => t.includes("debug") || t.includes("inspect"))) {
        scores.set(TaskType.DEBUG, (scores.get(TaskType.DEBUG) ?? 0) + 2)
      }
      if (context.toolsUsed.some((t) => t.includes("test"))) {
      scores.set(TaskType.TEST, (scores.get(TaskType.TEST) ?? 0) + 2)
    }
  }

  // Consider file references
  if (context?.files && context.files.length > 3 && scores.size === 0) {
    scores.set(TaskType.FEATURE, 1) // Multiple files → likely a feature
  }

  // If no clear match, return general
  if (scores.size === 0) {
    return { type: TaskType.GENERAL as TaskType, confidence: 1, reason: "No specific pattern matched" }
  }

  // Find the highest scoring type
  let bestType: TaskType = TaskType.GENERAL
  let bestScore = 0
  let totalScore = 0

  for (const [type, score] of scores) {
    totalScore += score
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }

  const confidence = Math.min(1, bestScore / (totalScore || 1) * (1 + 0.1 * Math.log2(bestScore + 1)))

  return {
    type: bestType as TaskType,
    confidence,
    reason: `Matched ${scores.size} pattern group(s), best: ${bestType} (score: ${bestScore})`,
  }
}

// ---------------------------------------------------------------------------
// Task prompt map
// ---------------------------------------------------------------------------

const TASK_PROMPTS: Record<TaskType, string> = {
  [TaskType.BUG_FIX]: PROMPT_BUG_FIX,
  [TaskType.FEATURE]: PROMPT_FEATURE,
  [TaskType.REFACTOR]: PROMPT_REFACTOR,
  [TaskType.RESEARCH]: PROMPT_RESEARCH,
  [TaskType.ARCHITECTURE]: PROMPT_ARCHITECTURE,
  [TaskType.DEBUG]: PROMPT_DEBUG,
  [TaskType.CODE_REVIEW]: PROMPT_CODE_REVIEW,
  [TaskType.TEST]: PROMPT_TEST,
  [TaskType.GENERAL]: PROMPT_GENERAL, // Research-first instructions for all general tasks
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const detect = Effect.fn("PromptComposer.detect")(function* (
      message: string,
      context?: { files?: string[]; toolsUsed?: string[] },
    ) {
      const result = heuristicDetect(message, context)
      log.info("task detection", { type: result.type, confidence: result.confidence.toFixed(2) })
      return result
    })

    const getTaskPrompt = (type: TaskType): string => {
      return TASK_PROMPTS[type] ?? ""
    }

    const compose = Effect.fn("PromptComposer.compose")(function* (input: {
      basePrompt: string
      taskMessage: string
      environmentInfo: string[]
      instructions: string[]
      skills?: string
      contextFiles?: string[]
      toolHistory?: string[]
    }) {
      // Detect task type
      const task = yield* detect(input.taskMessage, {
        files: input.contextFiles,
        toolsUsed: input.toolHistory,
      })

      // Get task-specific instructions
      const taskPrompt = getTaskPrompt(task.type)

      // Build the system prompt array
      const system: string[] = []

      // 1. Base agent prompt (personality)
      system.push(input.basePrompt)

      // 2. Task-specific instructions (if confidence is high enough)
      if (taskPrompt && task.confidence > 0.4) {
        system.push(taskPrompt)
      }

      // 3. Environment info
      system.push(...input.environmentInfo)

      // 4. Loaded instructions (AGENTS.md, CLAUDE.md)
      system.push(...input.instructions)

      // 5. Skills listing
      if (input.skills) {
        system.push(input.skills)
      }

      log.info("prompt composed", {
        taskType: task.type,
        confidence: task.confidence.toFixed(2),
        sections: system.length,
      })

      return system
    })

    return Service.of({
      detect,
      getTaskPrompt,
      compose,
    })
  }),
)

export const defaultLayer = layer

export const use = serviceUse(Service)

export * as PromptComposer from "."
