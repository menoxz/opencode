import { beforeEach, describe, expect, test } from "bun:test"
import {
  RecipeBook,
  buildRecipeCapsule,
  matchedRecipeCapsule,
  recipeVerdict,
  recipesFor,
  resetRecipes,
} from "./recipes"

describe("RecipeBook", () => {
  let book: RecipeBook
  beforeEach(() => {
    book = new RecipeBook()
  })

  test("saves a draft recipe and slugs duplicate titles", () => {
    const recipe = book.save({
      title: "Export June Sales",
      objective: "export the June sales report",
      adapter: "browser",
      preconditions: ["  logged in as  ", "correct month selected"],
      steps: ["open Reports", "select June", "click Export"],
      verify: "file exists and covers June",
    })
    expect(recipe.id).toBe("export-june-sales")
    expect(recipeVerdict(recipe)).toBe("draft")
    expect(recipe.preconditions).toEqual(["logged in as", "correct month selected"])
    expect(recipe.steps).toHaveLength(3)
    expect(book.list()).toHaveLength(1)

    const duplicate = book.save({ title: "Export June Sales", objective: "same" })
    expect(duplicate.id).toBe("export-june-sales-2")
  })

  test("is validated only after an observed success, and invalidated by a failure", () => {
    const recipe = book.save({ title: "Checkout", objective: "complete checkout", adapter: "browser" })
    expect(recipeVerdict(recipe)).toBe("draft")

    const validated = book.validate(recipe.id, { success: true, now: 1_000 })
    expect(recipeVerdict(validated!)).toBe("validated")
    expect(validated!.successes).toBe(1)
    expect(validated!.validatedAt).toBe(1_000)

    const failed = book.validate(recipe.id, { success: false })
    expect(recipeVerdict(failed!)).toBe("failed")
    expect(failed!.failures).toBe(1)
    expect(failed!.validatedAt).toBeUndefined()

    expect(book.validate("missing", { success: true })).toBeUndefined()
  })

  test("matches an objective, preferring the active adapter and validated recipes", () => {
    const browser = book.save({ title: "Export report", objective: "export the monthly sales report", adapter: "browser" })
    book.save({ title: "Export report desktop", objective: "export the monthly sales report", adapter: "desktop" })
    expect(book.match("export the monthly sales report for June", "browser")?.id).toBe(browser.id)

    book.validate(browser.id, { success: true })
    expect(book.match("export monthly sales report", "browser")?.id).toBe(browser.id)

    book.save({ title: "Send invoice", objective: "email the invoice to the customer", adapter: "browser" })
    expect(book.match("email invoice customer", "browser")?.title).toBe("Send invoice")
    expect(book.match("something totally unrelated", "browser")).toBeUndefined()
  })

  test("reset clears the book", () => {
    book.save({ title: "One", objective: "one" })
    book.reset()
    expect(book.list()).toHaveLength(0)
  })
})

describe("recipe capsule", () => {
  test("is empty without a recipe and renders steps otherwise", () => {
    const book = new RecipeBook()
    expect(buildRecipeCapsule(undefined)).toBe("")
    const recipe = book.save({
      title: "Login",
      objective: "log into the portal",
      preconditions: ["portal reachable"],
      steps: ["open portal", "fill credentials", "submit"],
      verify: "dashboard visible",
    })
    const capsule = buildRecipeCapsule(recipe)
    expect(capsule).toContain("<recipe>")
    expect(capsule).toContain("[login] Login (generic, draft)")
    expect(capsule).toContain("1. open portal")
    expect(capsule).toContain("verify: dashboard visible")
    expect(capsule.endsWith("</recipe>")).toBe(true)
  })

  test("stays within a character budget", () => {
    const book = new RecipeBook()
    const recipe = book.save({
      title: "Long",
      objective: "long recipe",
      steps: Array.from({ length: 30 }, (_, index) => `step ${index} with a fairly long description here`),
    })
    const capsule = buildRecipeCapsule(recipe, { maxChars: 200 })
    expect(capsule.length).toBeLessThanOrEqual(200)
    expect(capsule.endsWith("</recipe>")).toBe(true)
  })

  test("matches through the registry per key", () => {
    resetRecipes()
    recipesFor("ses_a").save({ title: "Checkout flow", objective: "complete the checkout flow", adapter: "browser" })
    expect(matchedRecipeCapsule("ses_a", "complete checkout flow", "browser")).toContain("<recipe>")
    expect(matchedRecipeCapsule("ses_b", "complete checkout flow", "browser")).toBe("")
    resetRecipes("ses_a")
    expect(matchedRecipeCapsule("ses_a", "complete checkout flow", "browser")).toBe("")
    resetRecipes()
  })
})
