// Reusable, validated recipes (Lot 3).
//
// A recipe is a proven path: preconditions, steps and a verification. The point
// is that a weak model should not rediscover a known procedure from scratch. A
// recipe stays a draft until a run is observed to succeed (see the progress
// controller); a failure invalidates it so a broken path is not replayed.

import type { AdapterKind } from "./adapters"

export interface Recipe {
  readonly id: string
  readonly title: string
  readonly adapter: AdapterKind
  readonly objective: string
  readonly preconditions: readonly string[]
  readonly steps: readonly string[]
  readonly verify: string
  validatedAt?: number
  successes: number
  failures: number
}

export interface RecipeInput {
  title: string
  objective: string
  adapter?: AdapterKind
  preconditions?: readonly string[]
  steps?: readonly string[]
  verify?: string
}

export type RecipeVerdict = "validated" | "draft" | "failed"

const TITLE_MAX = 120
const LINE_MAX = 300

function clean(value: string, max = LINE_MAX): string {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return base || "recipe"
}

function uniqueID(recipes: Map<string, Recipe>, title: string): string {
  const base = slug(title)
  if (!recipes.has(base)) return base
  let index = 2
  while (recipes.has(`${base}-${index}`)) index++
  return `${base}-${index}`
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  )
}

export function recipeVerdict(recipe: Recipe): RecipeVerdict {
  if (recipe.validatedAt !== undefined) return "validated"
  if (recipe.failures > 0) return "failed"
  return "draft"
}

export class RecipeBook {
  #recipes = new Map<string, Recipe>()

  save(input: RecipeInput): Recipe {
    const steps = (input.steps ?? []).map((step) => clean(step)).filter(Boolean)
    const preconditions = (input.preconditions ?? []).map((item) => clean(item)).filter(Boolean)
    const recipe: Recipe = {
      id: uniqueID(this.#recipes, input.title),
      title: clean(input.title, TITLE_MAX) || "untitled recipe",
      adapter: input.adapter ?? "generic",
      objective: clean(input.objective),
      preconditions,
      steps,
      verify: clean(input.verify ?? ""),
      successes: 0,
      failures: 0,
    }
    this.#recipes.set(recipe.id, recipe)
    return recipe
  }

  list(): readonly Recipe[] {
    return [...this.#recipes.values()]
  }

  get(id: string): Recipe | undefined {
    return this.#recipes.get(id)
  }

  /** Called after an observed run: success validates, failure invalidates. */
  validate(id: string, input: { success: boolean; now?: number }): Recipe | undefined {
    const recipe = this.#recipes.get(id)
    if (!recipe) return undefined
    if (input.success) {
      recipe.successes += 1
      recipe.validatedAt = input.now ?? Date.now()
    } else {
      recipe.failures += 1
      recipe.validatedAt = undefined
    }
    return recipe
  }

  /** Best matching recipe for an objective, preferring the active adapter. */
  match(objective: string, adapter?: AdapterKind): Recipe | undefined {
    const wanted = tokens(objective)
    if (wanted.size === 0) return undefined
    let best: { recipe: Recipe; score: number } | undefined
    for (const recipe of this.#recipes.values()) {
      const candidate = tokens(`${recipe.objective} ${recipe.title}`)
      const shared = [...candidate].filter((token) => wanted.has(token))
      if (shared.length === 0) continue
      const strong = shared.filter((token) => token.length >= 4).length
      if (strong === 0 && shared.length < 2) continue
      const score =
        shared.length + (adapter !== undefined && recipe.adapter === adapter ? 1 : 0) + (recipeVerdict(recipe) === "validated" ? 0.5 : 0)
      if (!best || score > best.score) best = { recipe, score }
    }
    return best?.recipe
  }

  reset() {
    this.#recipes.clear()
  }
}

const books = new Map<string, RecipeBook>()
const MAX_BOOKS = 200

export function recipesFor(key: string): RecipeBook {
  const existing = books.get(key)
  if (existing) return existing
  const created = new RecipeBook()
  books.set(key, created)
  while (books.size > MAX_BOOKS) {
    const oldest = books.keys().next().value
    if (oldest === undefined) break
    books.delete(oldest)
  }
  return created
}

export function resetRecipes(key?: string) {
  if (key === undefined) books.clear()
  else books.delete(key)
}

export function buildRecipeCapsule(recipe: Recipe | undefined, options: { maxChars?: number } = {}): string {
  if (!recipe) return ""
  const lines = ["<recipe>", `[${recipe.id}] ${recipe.title} (${recipe.adapter}, ${recipeVerdict(recipe)})`]
  if (recipe.objective) lines.push(`objective: ${recipe.objective}`)
  if (recipe.preconditions.length) lines.push(`preconditions: ${recipe.preconditions.join("; ")}`)
  recipe.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
  if (recipe.verify) lines.push(`verify: ${recipe.verify}`)
  lines.push("Treat this as a proven path, but re-check each precondition against the current environment before acting.")
  lines.push("</recipe>")
  const capsule = lines.join("\n")
  const maxChars = options.maxChars ?? 1_200
  return capsule.length <= maxChars ? capsule : `${capsule.slice(0, maxChars - 16)}…\n</recipe>`
}

export function buildRecipeListCapsule(recipes: readonly Recipe[], options: { maxChars?: number } = {}): string {
  const visible = recipes.filter((recipe) => recipeVerdict(recipe) !== "failed")
  if (visible.length === 0) return ""
  const lines = ["<recipes>"]
  for (const recipe of visible) lines.push(`[${recipe.id}] ${recipe.title} (${recipe.adapter}, ${recipeVerdict(recipe)})`)
  lines.push("Use the environment tool action=recipe_validate after an observed run to keep a recipe trustworthy.")
  lines.push("</recipes>")
  const capsule = lines.join("\n")
  const maxChars = options.maxChars ?? 800
  return capsule.length <= maxChars ? capsule : `${capsule.slice(0, maxChars - 18)}…\n</recipes>`
}

export function matchedRecipeCapsule(
  key: string,
  objective: string,
  adapter?: AdapterKind,
  options?: { maxChars?: number },
): string {
  return buildRecipeCapsule(recipesFor(key).match(objective, adapter), options)
}

export * as Recipes from "./recipes"
