import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevSchema } from "./schema"
import type { Route } from "./state"

/**
 * Pre-loop routing. Jev reads the user's request and picks the reasoning tier
 * before any model call, so a short, well-specified turn never pays for the
 * full model. The decision also yields the guard threshold for the turn: a
 * harder task is screened more eagerly.
 */

export const MAX_PROMPT_CHARS = 4_000

export const COMPLEXITY_LEVELS = ["trivial", "simple", "moderate", "complex", "open-ended"] as const

export function routeQuestions(prompt: string): Record<string, JevSchema.Question> {
  const excerpt = prompt.slice(0, MAX_PROMPT_CHARS)
  return {
    model: {
      type: "choice",
      instructions: `Choose the reasoning tier for the user request below. "lite" suits a short, well-specified, low-stakes turn that is mostly retrieval or a single edit. "build" suits multi-step planning, architecture, debugging, ambiguity or high stakes.\n\nREQUEST:\n${excerpt}`,
      criteria: {
        lite: "A small, fast model can handle this turn",
        build: "The full model is required for this turn",
      },
    },
    complexity: {
      type: "score",
      instructions: `Rate the complexity of the user request below on the ordered scale, lowest first.\n\nREQUEST:\n${excerpt}`,
      criteria: COMPLEXITY_LEVELS,
    },
  }
}

/**
 * Harder tasks lower the guard's ask threshold: a complex turn is more likely
 * to contain a step nobody explicitly requested, so the guard should ask
 * sooner. Bounded to 0.2..0.9 so it never neutralises the guard.
 */
export function thresholdFor(complexity: number, base: number): number {
  return Math.min(0.9, Math.max(0.2, base - (complexity - 0.5) * 0.4))
}

/** Returns `undefined` when Jev gave no usable choice, so the caller keeps the default tier. */
export const route = Effect.fn("JevRoute.route")(function* (
  http: HttpClient.HttpClient,
  settings: JevClient.Settings | undefined,
  input: { prompt: string; baseThreshold: number },
) {
  const response = yield* JevClient.decide(
    http,
    { state: "Route the next turn.", questions: routeQuestions(input.prompt) },
    settings,
  )
  const choice = response.answers["model"]
  if (choice?.type !== "choice") return undefined
  const complexityAnswer = response.answers["complexity"]
  const complexity =
    complexityAnswer?.type === "score" ? Math.min(1, Math.max(0, complexityAnswer.score)) : 0.5
  return {
    model: choice.choice === "lite" ? ("lite" as const) : ("build" as const),
    complexity,
    threshold: thresholdFor(complexity, input.baseThreshold),
  } satisfies Route
})

export function render(route: Route): string {
  return `[jev route] tier=${route.model} complexity=${route.complexity.toFixed(2)} guard-threshold=${route.threshold.toFixed(2)}`
}

export * as JevRoute from "./route"
