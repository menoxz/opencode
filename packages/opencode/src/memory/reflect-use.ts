/**
 * reflect-use.ts — Automatic free-model reflection on memory usefulness.
 *
 * After an assistant response, a tiny free model (cost.input === 0) judges
 * whether each retrieved memory was actually helpful in producing the answer.
 * The result feeds back into `Memory.Service.recordUsage`, which updates
 * confidence/importance/access stats.
 *
 * Principles:
 *   - Never spends paid credits.
 *   - Never throws: all LLM failures become "neutral" outcomes.
 *   - Fast: capped tokens, no tool calls.
 */
import { Effect } from "effect"
import { generateText } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import type { Interface as MemoryService } from "@/memory"
import { resolveFreeLanguageModel } from "@/memory/model-picker"

const log = Log.create({ category: "memory.reflect-use" })

export interface ReflectionInput {
  userMessage: string
  assistantMessage: string
  memories: Array<{ id: string; content: string }>
}

export type ReflectionResult = "useful" | "not-useful" | "neutral"

/**
 * Ask a free model to classify each retrieved memory by usefulness.
 * Returns a map of memoryId -> outcome. Missing/unknown ids become neutral.
 */
export const reflectUse = Effect.fnUntraced(function* (
  input: ReflectionInput,
  opts: { overrideModel?: string } = {},
) {
  if (input.memories.length === 0) {
    return new Map<string, ReflectionResult>()
  }

  const resolved = yield* resolveFreeLanguageModel({ override: opts.overrideModel })
  if (!resolved) {
    log.info("No free model available; skipping memory reflection")
    return new Map(input.memories.map((m) => [m.id, "neutral" as ReflectionResult]))
  }

  const { language, id: modelId } = resolved
  log.info("Reflecting memory usefulness", {
    model: modelId,
    memories: input.memories.length,
  })

  const system = [
    "You are an evaluator. Given a user message, an assistant response, and a list of memory snippets that were retrieved for context, decide for EACH memory whether it actually helped the assistant answer.",
    "Respond ONLY with a JSON array of booleans in the same order as the memory list: true=helpful/useful, false=not useful or irrelevant.",
    "Do not explain. Do not include any other text.",
  ].join("\n")

  const memoryList = input.memories
    .map((m, i) => `${i + 1}. ${m.content.replace(/\n/g, " ").slice(0, 200)}`)
    .join("\n")

  const user = [
    "--- USER MESSAGE ---",
    input.userMessage.slice(0, 1000),
    "",
    "--- ASSISTANT RESPONSE ---",
    input.assistantMessage.slice(0, 1500),
    "",
    "--- MEMORIES ---",
    memoryList,
    "",
    "JSON array [true, false, ...]:",
  ].join("\n")

  const response = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: language,
        system,
        prompt: user,
        temperature: 0.1,
      } as Parameters<typeof generateText>[0]).then((r) => ({ text: r.text ?? "" })),
    catch: (e) => new Error(String(e)),
  }).pipe(
    Effect.tapError((e) => Effect.sync(() => log.error(`Reflection LLM failed: ${e}`))),
    Effect.timeout(20000),
    Effect.orElseSucceed(() => ({ text: "[]" })),
  )

  const booleans = parseJsonBooleanArray(response.text)
  const result = new Map<string, ReflectionResult>()
  for (let i = 0; i < input.memories.length; i++) {
    const outcome = booleans[i] === true ? "useful" : booleans[i] === false ? "not-useful" : "neutral"
    result.set(input.memories[i].id, outcome)
  }
  return result
})

function parseJsonBooleanArray(text: string): Array<boolean | null> {
  if (typeof text !== "string" || text.length === 0) return []
  let raw = text.trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) raw = fence[1].trim()
  const start = raw.indexOf("[")
  const end = raw.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => (typeof x === "boolean" ? x : null))
  } catch {
    return []
  }
}

export const reflectAndRecord = (
  input: ReflectionInput,
  memory: MemoryService,
  opts?: { overrideModel?: string },
) =>
  Effect.gen(function* () {
    if (input.memories.length === 0) return
    const outcomes = yield* reflectUse(input, opts)
    for (const [id, outcome] of outcomes.entries()) {
      yield* memory.recordUsage(id, outcome).pipe(
        Effect.tapError((e) => Effect.sync(() => log.error("recordUsage failed", { id, outcome, e }))),
        Effect.orElseSucceed(() => undefined),
      )
    }
  }).pipe(Effect.catchCause((cause) => Effect.sync(() => log.error("reflectAndRecord failed", { cause }))))
