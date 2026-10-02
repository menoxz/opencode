/**
 * select.ts — LLM-backed skill selection.
 *
 * The language-agnostic replacement for the BM25 lexical fallback in the system
 * prompt. Skill names and descriptions are written in English while a user may
 * write in any language, so a lexical match silently misses a relevant skill
 * (different words) and then over-injects an arbitrary top-N. A small free model
 * judges each description by meaning, not wording, and returns the few skills
 * that actually apply — in any language.
 *
 * Contract (mirrors the memory LLM passes, see memory/model-picker):
 *   - Free model only (`cost.input === 0`); never spends paid credits.
 *   - Never throws: any failure (no provider, no free model, timeout, bad JSON)
 *     resolves to `undefined` so the caller keeps its deterministic safety net.
 *   - An empty array is a real answer: the request genuinely needs no skill.
 */
import { Effect } from "effect"
import { generateText } from "ai"
import * as Log from "@opencode-ai/core/util/log"
import { resolveFreeLanguageModel, parseJsonStringArray } from "@/memory/model-picker"

const log = Log.create({ service: "skill.select" })

export interface Candidate {
  name: string
  description: string
}

/**
 * Keep only names that exist in the catalogue, in catalogue order and without
 * duplicates. Tolerant of prose and code fences (delegated to
 * {@link parseJsonStringArray}). Pure, so it is unit-testable without a model.
 */
export function interpret(text: string, candidates: readonly Candidate[]): string[] {
  const valid = new Set(candidates.map((c) => c.name))
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of parseJsonStringArray(text)) {
    if (!valid.has(name) || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * Ask a free model which skills a request needs. Returns the chosen names,
 * `[]` when none apply, or `undefined` when no model was available or the call
 * failed — the caller must treat `undefined` as "keep the deterministic net".
 */
export const select = Effect.fnUntraced(function* (input: { prompt: string; skills: readonly Candidate[] }) {
  if (input.skills.length === 0) return [] as string[]

  const picked = yield* resolveFreeLanguageModel({})
  if (!picked) {
    log.info("no free model available; skill selection keeps the deterministic fallback")
    return undefined
  }

  const catalogue = input.skills
    .map((s) => `- ${s.name}: ${(s.description || "").replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n")

  const system = [
    "You select the skills a request actually needs from a catalogue.",
    "The request may be written in a language different from the catalogue: match on MEANING, never on literal wording.",
    "Keep a candidate only when it is genuinely required to carry out the request.",
    "Respond ONLY with a JSON array of the exact skill names to load, chosen from the catalogue. Use [] when no skill applies. No prose.",
  ].join("\n")

  const prompt = [
    "--- REQUEST ---",
    input.prompt.slice(0, 2000),
    "",
    "--- SKILL CATALOGUE ---",
    catalogue,
    "",
    "JSON array of skill names:",
  ].join("\n")

  const response = yield* Effect.tryPromise({
    try: () =>
      generateText({
        model: picked.language,
        system,
        prompt,
        temperature: 0,
      } as Parameters<typeof generateText>[0]).then((r) => r.text ?? ""),
    catch: (e) => new Error(String(e)),
  }).pipe(
    Effect.tapError((e) =>
      Effect.sync(() => log.warn("skill selection LLM failed", { error: String(e).slice(0, 200) })),
    ),
    Effect.timeout(20000),
    Effect.orElseSucceed(() => undefined as string | undefined),
  )
  if (response === undefined) return undefined

  const names = interpret(response, input.skills)
  log.info("llm skill selection", { model: picked.id, candidates: input.skills.length, kept: names.length })
  return names
})

export * as SkillSelect from "./select"
