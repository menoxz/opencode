/**
 * The decision model — ONE harness model, ONE configuration point.
 *
 * Every feature that asks a model to *decide* something — the Jev hooks
 * (skills, tools, guard, relevance, intake, review, next action, compaction,
 * route, plan, complexity, untrusted) and every harness-side scoring pass
 * (skill selection, memory extraction, episodic synthesis, reflection) — resolves
 * its model here, and only here. The user picks the model once, from the TUI
 * (`/decision-model`), and every feature follows.
 *
 * Resolution order, highest first:
 *
 *   1. `jev.decision_model` — the configured choice, a harness model id of the
 *      form `providerID/modelID` (exactly what `provider.list` exposes).
 *   2. `options.override` — a call site's own ref. It now ranks *below* the
 *      configuration on purpose: the whole point of a central knob is that it
 *      wins, and a feature that overrode it would silently ignore the user.
 *   3. The best free model, auto-picked (see `@/memory/model-picker`). This keeps
 *      the previous behaviour byte-for-byte when nothing is configured — a
 *      decision pass still never spends paid credits by itself.
 *
 * A configured model that no longer resolves (retired id, provider removed) falls
 * back to the auto pick with a warning rather than disabling the feature, and is
 * never silently swapped without the warning.
 */

import { Effect, Option } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { parseModelRef, resolveFreeLanguageModel } from "@/memory/model-picker"

const log = Log.create({ service: "decision-model" })

/** Where the decision model lives in `opencode.json`. */
export const CONFIG_PATH = "jev.decision_model" as const

export type Source = "configured" | "override" | "auto"

export type Resolved = {
  /** The AI-SDK language model, ready for `generateText`. */
  readonly language: any
  /** Lowercased id, for provenance and logs. */
  readonly id: string
  /** The `providerID/modelID` that was asked for, or the auto-picked id. */
  readonly ref: string
  readonly source: Source
}

/**
 * The configured decision model, or `undefined`.
 *
 * Reads the config through `serviceOption`, so a caller that has no `Config` in
 * its context degrades to the auto pick instead of failing — the same posture as
 * the provider lookup below.
 */
export const configured = Effect.fnUntraced(function* () {
  const service = Option.getOrUndefined(yield* Effect.serviceOption(Config.Service))
  if (!service) return undefined
  const info = yield* service.get().pipe(Effect.catch(() => Effect.succeed(undefined)))
  const value = info?.jev?.decision_model
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
})

const resolveRef = Effect.fnUntraced(function* (providerID: string, modelID: string) {
  const provider = Option.getOrUndefined(yield* Effect.serviceOption(Provider.Service))
  if (!provider) return undefined
  const model = yield* provider
    .getModel(providerID as any, modelID as any)
    .pipe(Effect.catch(() => Effect.succeed(undefined as any)))
  if (!model) return undefined
  const language = yield* provider
    .getLanguage(model)
    .pipe(Effect.catch(() => Effect.succeed(undefined as any)))
  if (!language) return undefined
  return { language, providerID, modelID }
})

/**
 * Resolve the model a decision pass should use.
 *
 * `requireConfigured` is for the Jev transport: it must stay on the System One
 * wire API unless the user explicitly chose a harness model, so that an install
 * whose configuration says nothing new keeps the exact behaviour it had.
 */
export const resolve = Effect.fnUntraced(function* (options: { override?: string; requireConfigured?: boolean } = {}) {
  const fromConfig = yield* configured()

  // The Jev transport asks for "only what the user configured": with nothing
  // configured it must keep the System One wire API rather than answer its own
  // questions with a model nobody chose.
  if (options.requireConfigured && !fromConfig) return null

  const requested = fromConfig ?? options.override
  if (requested) {
    const parsed = parseModelRef(requested)
    const picked = parsed ? yield* resolveRef(parsed.providerID, parsed.modelID) : undefined
    if (parsed && picked)
      return { language: picked.language, id: requested.toLowerCase(), ref: requested, source: fromConfig ? "configured" : "override" }
    log.warn(
      parsed
        ? "decision model is configured but unavailable; using the fallback"
        : "decision model is not a provider/model id; using the fallback",
      { configPath: CONFIG_PATH, requested: requested.slice(0, 120) },
    )
    // A configured model is never traded for a caller's own override — that would
    // hide the configuration. On the Jev transport it also never degrades to an
    // arbitrary free model; the caller's own fallback (the deterministic ranking)
    // is the only safe answer there.
    if (fromConfig && options.requireConfigured) return null
  }

  if (options.requireConfigured) return null

  const auto = yield* resolveFreeLanguageModel({ override: options.override })
  if (!auto) return null
  return { language: auto.language, id: auto.id, ref: auto.id, source: "auto" }
})

export * as DecisionModel from "./model"
