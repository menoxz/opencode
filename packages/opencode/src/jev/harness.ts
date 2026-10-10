/**
 * The harness transport for System One questions.
 *
 * Jev's hooks are written against one wire contract — a batch of typed questions
 * in, one calibrated answer per question out (`./schema`). Historically the only
 * way to answer that batch was the pinned System One HTTP endpoint. This module
 * adds a second transport: when the user names a **decision model** (any model the
 * harness knows, chosen in the TUI with `/decision-model`), the same batch is
 * rendered into a single chat request and the answers are parsed back into the
 * same `JevSchema.Response`.
 *
 * Why it matters: every Jev feature then works with a model the install already
 * has credentials for — no System One key, no second provider to configure — and
 * the user picks the model once, centrally, instead of per hook.
 *
 * Contract, mirroring every other decision path here:
 *   - Active ONLY when a decision model is configured. An install that says
 *     nothing new keeps using the System One endpoint unchanged.
 *   - Never throws: any failure (no model, bad JSON, missing answers, timeout)
 *     returns `undefined`, and the caller keeps its own deterministic fallback.
 *   - An answered batch is a real answer, even when it selects nothing.
 */

import { Effect } from "effect"
import { generateText } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import { DecisionModel } from "@/decision/model"
import { JevSchema } from "./schema"

const log = Log.create({ service: "jev-harness" })

/**
 * Bound on one decision round-trip through the harness.
 *
 * A chat model must read the state, decide one question per candidate and emit
 * the JSON, where the System One endpoint answered the same batch in ~0.7–2 s.
 * Under-bounding here would silently disable the selector — the failure mode this
 * whole area just paid for — so the harness gets a wider budget than the wire
 * transport, and the per-hook `timeout_ms` still wins when it is smaller.
 */
export const DEFAULT_TIMEOUT_MS = 10_000

const SYSTEM = [
  "You answer closed questions about a coding agent's situation.",
  'Reply ONLY with a JSON object shaped {"answers":{"<question id>":<answer>}}.',
  "No prose, no explanation, no code fences.",
  "For a noul question the answer is the probability between 0 and 1 that the answer is YES.",
  "For a score question the answer is the position between 0 and 1 across the ordered levels.",
  "For a choice question the answer is exactly one of the option names.",
  "Answer every question id you were given.",
].join("\n")

/** A `Payload` (`string | unknown[] | Record`) flattened to text for the prompt. */
export function renderPayload(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Render one question batch as a readable prompt. Pure, so it is unit-testable. */
export function render(request: JevSchema.Request): string {
  const lines: string[] = ["--- STATE ---", renderPayload(request.state), "", "--- QUESTIONS ---"]
  const ids = Object.keys(request.questions)
  for (const id of ids) {
    const question = request.questions[id]!
    lines.push(`id: ${id}`, `type: ${question.type}`, `question: ${renderPayload(question.instructions)}`)
    if (question.type === "noul" && question.criteria) {
      lines.push(`yes means: ${renderPayload(question.criteria.true)}`)
      lines.push(`no means: ${renderPayload(question.criteria.false)}`)
    }
    if (question.type === "choice") lines.push(`options: ${Object.keys(question.criteria).join(" | ")}`)
    if (question.type === "score") lines.push(`levels (lowest first): ${question.criteria.map(renderPayload).join(" | ")}`)
    lines.push("")
  }
  lines.push(`Answer all ${ids.length} question(s) as JSON.`)
  return lines.join("\n")
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

function asNumber(value: unknown, type: string): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value !== null && typeof value === "object" && typeof (value as any)[type] === "number") {
    const nested = (value as any)[type]
    return Number.isFinite(nested) ? nested : undefined
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asChoice(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value !== null && typeof value === "object" && typeof (value as any).choice === "string") return (value as any).choice
  return undefined
}

/**
 * Parse the model's reply into answers, keeping only ids this batch asked for and
 * only values of the declared type. An unusable reply yields `undefined` — an
 * abstention, never a fabricated verdict. Pure, so it is unit-testable.
 */
export function parse(text: string, request: JevSchema.Request): Record<string, JevSchema.Answer> | undefined {
  if (typeof text !== "string" || text.trim().length === 0) return undefined
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) raw = fence[1].trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return undefined

  let payload: unknown
  try {
    payload = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return undefined
  }
  const table = (payload as any)?.answers ?? payload
  if (!table || typeof table !== "object") return undefined

  const answers: Record<string, JevSchema.Answer> = {}
  for (const [id, question] of Object.entries(request.questions)) {
    const value = (table as any)[id]
    if (value === undefined || value === null) continue
    if (question.type === "choice") {
      const option = asChoice(value)
      if (!option || !(option in question.criteria)) continue
      answers[id] = { type: "choice", choice: option, confidence: 1 }
      continue
    }
    const number = asNumber(value, question.type)
    if (number === undefined) continue
    answers[id] =
      question.type === "score"
        ? { type: "score", score: clamp01(number), confidence: 1 }
        : { type: "noul", noul: clamp01(number) }
  }
  return Object.keys(answers).length > 0 ? answers : undefined
}

/**
 * Answer a question batch with the configured decision model.
 *
 * Returns `undefined` when no decision model is configured (the caller then uses
 * the System One transport), when the model failed, or when its reply carried no
 * usable answer.
 */
export const answer = Effect.fnUntraced(function* (request: JevSchema.Request) {
  const ids = Object.keys(request.questions)
  if (ids.length === 0) return undefined

  const picked = yield* DecisionModel.resolve({ requireConfigured: true })
  if (!picked) return undefined

  const text = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: picked.language,
        system: SYSTEM,
        prompt: render(request),
        temperature: 0,
      } as Parameters<typeof generateText>[0]).then((result) => result.text ?? ""),
    catch: (error) => new Error(String(error)),
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => log.warn("decision model call failed", { model: picked.id, error: String(error).slice(0, 200) })),
    ),
    Effect.timeout(DEFAULT_TIMEOUT_MS),
    Effect.orElseSucceed(() => undefined as string | undefined),
  )
  if (text === undefined) return undefined

  const answers = parse(text, request)
  if (!answers) {
    log.warn("decision model returned no usable answer", { model: picked.id, questions: ids.length })
    return undefined
  }
  log.info("jev decision answered by the harness model", {
    model: picked.id,
    source: picked.source,
    questions: ids.length,
    answered: Object.keys(answers).length,
  })
  // Annotated, not `satisfies`: `JevClient.decide` must keep returning the same
  // `JevSchema.Response` for both transports, and a narrowed literal would hide
  // the optional `usage` field from every caller.
  const response: JevSchema.Response = { model: picked.id, answers }
  return response
})

export * as JevHarness from "./harness"
