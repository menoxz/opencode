import { Effect, Schema } from "effect"
import { buildEnvironmentCapsule, ledgerFor, normalizeScope } from "@/session/environment"
import { progressCapsule, progressFor } from "@/session/progress"
import { buildRecipeListCapsule, recipeVerdict, recipesFor } from "@/session/recipes"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  action: Schema.optional(
    Schema.Literals(["state", "observe", "anchor", "expect", "recipes", "recipe_save", "recipe_validate"]),
  ).annotate({
    description:
      "state (default): return the current normalized environment, progress and recipe state. observe: register a structured observation you derived (for example from a screenshot). anchor: check whether an earlier observation id is still current. expect: declare what a successful next action should produce. recipes: list known recipes. recipe_save: store a proven procedure. recipe_validate: mark a recipe validated after an observed success.",
  }),
  scope: Schema.optional(Schema.String).annotate({
    description: "Target the observation belongs to (tab, url, window, application). Defaults to the general environment.",
  }),
  summary: Schema.optional(Schema.String).annotate({
    description: "One-line description of what was observed (required for action=observe).",
  }),
  truth: Schema.optional(Schema.Literals(["observed", "inferred", "unknown", "error"])).annotate({
    description: "How certain the observation is. Defaults to observed.",
  }),
  detail: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Optional structured fields, for example url, title or the selected filter.",
  }),
  id: Schema.optional(Schema.String).annotate({ description: "Observation id to check (required for action=anchor)." }),
  tool: Schema.optional(Schema.String).annotate({
    description: "Tool whose next result should satisfy the expectation (used by action=expect), for example browser_use.",
  }),
  recipe_id: Schema.optional(Schema.String).annotate({ description: "Recipe id (required for action=recipe_validate)." }),
  title: Schema.optional(Schema.String).annotate({ description: "Short recipe title (action=recipe_save)." }),
  objective: Schema.optional(Schema.String).annotate({
    description: "What the recipe achieves; used to match future objectives (action=recipe_save).",
  }),
  preconditions: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Conditions that must hold before running the recipe (action=recipe_save).",
  }),
  steps: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Ordered steps of the recipe (action=recipe_save).",
  }),
  verify: Schema.optional(Schema.String).annotate({
    description: "How to confirm the recipe succeeded (action=recipe_save).",
  }),
  adapter: Schema.optional(Schema.Literals(["browser", "desktop", "mobile", "generic"])).annotate({
    description: "Adapter the recipe targets (action=recipe_save).",
  }),
  success: Schema.optional(Schema.Boolean).annotate({
    description: "Whether the observed run succeeded (action=recipe_validate).",
  }),
})

type Metadata = {
  action: string
  observationID?: string
  current?: boolean
}

export const EnvironmentTool = Tool.define<typeof Parameters, Metadata, never>(
  "environment",
  Effect.gen(function* () {
    return {
      description:
        "Read or update the harness-level environment observation ledger for computer-use tasks. Use `state` to get the compact current state, `observe` to register what a screenshot or tool result showed, and `anchor` to check whether an earlier observation is still current before acting on it. The harness marks observations superseded when a newer one arrives for the same scope.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const ledger = ledgerFor(ctx.sessionID)
          const action = params.action ?? "state"

          if (action === "observe") {
            const summary = params.summary?.trim()
            if (!summary) {
              return {
                title: "environment observe needs a summary",
                metadata: { action },
                output: "Provide `summary` (and optionally `scope`) to record an observation.",
              }
            }
            const observation = ledger.record({
              scope: normalizeScope(params.scope),
              source: { kind: "model", name: "environment" },
              summary,
              detail: params.detail,
              truth: params.truth ?? "observed",
            })
            return {
              title: `Observed ${observation.id} (${observation.scope}, rev ${observation.revision})`,
              metadata: { action, observationID: observation.id },
              output: `Recorded ${observation.id} for scope ${observation.scope} at revision ${observation.revision}. Older observations of that scope are now superseded.`,
            }
          }

          if (action === "expect") {
            const summary = params.summary?.trim()
            if (!summary) {
              return {
                title: "environment expect needs a summary",
                metadata: { action },
                output: "Provide `summary` describing what a successful next action should produce.",
              }
            }
            progressFor(ctx.sessionID).expect({
              name: params.tool?.trim() || "next action",
              scope: normalizeScope(params.scope),
              summary,
            })
            return {
              title: `Expecting: ${summary}`,
              metadata: { action },
              output: `Expectation recorded. After the next action on ${normalizeScope(params.scope)}, the harness compares the observed result and reports expected / different / no-progress.`,
            }
          }

          if (action === "anchor") {
            const id = params.id?.trim()
            if (!id) {
              return {
                title: "environment anchor needs an id",
                metadata: { action },
                output: "Provide `id` (for example obs-3) to check whether it is still current.",
              }
            }
            const observation = ledger.anchor(id)
            if (!observation) {
              return {
                title: `Unknown observation ${id}`,
                metadata: { action, observationID: id, current: false },
                output: `No observation ${id} is registered; treat its content as unknown and re-observe.`,
              }
            }
            const current = !observation.supersededBy
            return {
              title: current ? `${observation.id} is current` : `${observation.id} is superseded`,
              metadata: { action, observationID: observation.id, current },
              output: current
                ? `${observation.id} is current: ${observation.scope} rev ${observation.revision} — ${observation.summary}`
                : `${observation.id} was superseded by ${observation.supersededBy}; re-observe before acting on it.`,
            }
          }

          if (action === "recipes") {
            const recipes = recipesFor(ctx.sessionID).list()
            const list = recipes
              .map((recipe) => `- [${recipe.id}] ${recipe.title} (${recipe.adapter}, ${recipeVerdict(recipe)})`)
              .join("\n")
            return {
              title: recipes.length ? `${recipes.length} recipe(s)` : "no recipes",
              metadata: { action },
              output: recipes.length ? list : "No recipes have been saved for this session yet.",
            }
          }

          if (action === "recipe_save") {
            const title = params.title?.trim()
            const objective = params.objective?.trim()
            if (!title || !objective) {
              return {
                title: "environment recipe_save needs a title and objective",
                metadata: { action },
                output: "Provide `title` and `objective` (preconditions, steps and verify are strongly recommended).",
              }
            }
            const recipe = recipesFor(ctx.sessionID).save({
              title,
              objective,
              adapter: params.adapter,
              preconditions: params.preconditions,
              steps: params.steps,
              verify: params.verify,
            })
            return {
              title: `Saved recipe ${recipe.id}`,
              metadata: { action },
              output: `Recipe ${recipe.id} saved as draft. It becomes validated after an observed success (action=recipe_validate success=true); a failure invalidates it.`,
            }
          }

          if (action === "recipe_validate") {
            const id = params.recipe_id?.trim()
            if (!id || params.success === undefined) {
              return {
                title: "environment recipe_validate needs recipe_id and success",
                metadata: { action },
                output: "Provide `recipe_id` and `success` (true after an observed success, false after a failure).",
              }
            }
            const recipe = recipesFor(ctx.sessionID).validate(id, { success: params.success })
            if (!recipe) {
              return {
                title: `Unknown recipe ${id}`,
                metadata: { action },
                output: `No recipe ${id} is registered.`,
              }
            }
            return {
              title: `${recipe.id} → ${recipeVerdict(recipe)}`,
              metadata: { action },
              output: `${recipe.id}: successes=${recipe.successes}, failures=${recipe.failures}, status=${recipeVerdict(recipe)}.`,
            }
          }

          const parts = [
            buildEnvironmentCapsule(ledger),
            progressCapsule(ctx.sessionID),
            buildRecipeListCapsule(recipesFor(ctx.sessionID).list()),
          ].filter(Boolean)
          const output = parts.join("\n\n")
          return {
            title: output ? `${ledger.surface().length} current observation(s)` : "no environment observations yet",
            metadata: { action },
            output: output || "No environment observations have been recorded yet for this session.",
          }
        }),
    }
  }),
)
