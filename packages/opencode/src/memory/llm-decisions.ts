/**
 * llm-decisions — Optional LLM enrichment of post-mortem key decisions.
 *
 * Opt-in, fail-safe, free-model-only. Sits ON TOP of the deterministic
 * structural extractor in post-mortem.ts. If anything is missing or fails
 * (no provider, no free model, timeout, bad JSON), it returns [] and the
 * caller keeps the structural decisions. It NEVER throws and NEVER spends
 * paid credits.
 *
 * Auto mode: scans all loaded providers, keeps only free models
 * (cost.input === 0), and prefers DeepSeek V4 Flash, then any deepseek,
 * then any other free model. Re-scanned every session, so a retired model
 * id can never get pinned.
 *
 * Gated by config: experimental.postmortem.llm_decisions (default false).
 */

import { Effect } from "effect"
import { generateText as aiGenerateText } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import { Config } from "@/config/config"
import { resolveFreeLanguageModel, parseJsonStringArray } from "./model-picker"

const log = Log.create({ service: "memory.llm-decisions" })

// Parse the LLM response into capped key-decision strings (max 150 chars,
// min 3). Delegates JSON extraction to the shared tolerant parser.
function parseDecisions(text: string): string[] {
  return parseJsonStringArray(text)
    .map((s) => s.slice(0, 150))
    .filter((s) => s.length >= 3)
}

/**
 * enrichDecisions — best-effort LLM decisions. Returns [] unless the feature
 * is enabled AND a free model is available AND the call succeeds.
 *
 * taskDescription + structural decisions are passed in as grounding context.
 */
export const enrichDecisions = Effect.fnUntraced(function* (input: {
  taskDescription: string
  structuralDecisions: string[]
  transcript: string
}) {
  // 1. Feature gate (default OFF).
  const config = yield* Config.Service
  const cfg = yield* config.get().pipe(
    Effect.catch(() => Effect.succeed({} as any)),
  )
  const enabled = cfg?.experimental?.postmortem?.llm_decisions === true
  if (!enabled) return [] as string[]

  // 2-4. Resolve a free language model (explicit override wins, else auto-pick).
  // Any failure (no provider, no free model, no language api) => structural-only.
  const override = cfg?.experimental?.postmortem?.llm_model
  const picked = yield* resolveFreeLanguageModel({
    override: typeof override === "string" ? override : undefined,
  })
  if (!picked) {
    log.info("no free model available, skipping llm decisions")
    return [] as string[]
  }
  const language = picked.language
  log.info("resolved free model for decisions", { model: picked.id })

  // 5. Build a language-neutral prompt. Reply must be a JSON array.
  const known =
    input.structuralDecisions.length > 0
      ? `Already captured:\n${input.structuralDecisions
          .map((d) => `- ${d}`)
          .join("\n")}\n\n`
      : ""
  const prompt =
    `You analyze a coding session and list the KEY DECISIONS made ` +
    `(design choices, tradeoffs, approach changes). ` +
    `Reply in the SAME language as the session. ` +
    `Return ONLY a JSON array of short strings (max 12 words each), ` +
    `no prose. Do NOT repeat already-captured items.\n\n` +
    `${known}Task: ${input.taskDescription.slice(0, 300)}\n\n` +
    `Session excerpt:\n${input.transcript.slice(0, 6000)}`

  // 6. Bounded, fully guarded call. Timeout protects the session.
  const result: any = yield* Effect.tryPromise(() =>
    (aiGenerateText as any)({
      model: language,
      prompt,
      maxTokens: 300,
      temperature: 0.3,
    }),
  ).pipe(
    Effect.timeout("20 seconds"),
    Effect.catch(() => Effect.succeed(null as any)),
  )
  if (!result) {
    log.info("llm decisions call failed or timed out")
    return [] as string[]
  }

  const decisions = parseDecisions(String(result.text ?? ""))
  log.info("llm decisions extracted", { count: decisions.length })
  return decisions
})
