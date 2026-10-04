import { describe, expect, test } from "bun:test"
import { classifyUserTurn, isContinuationPrompt } from "./turn-intent"

describe("isContinuationPrompt", () => {
  test("recognises short continuation verbs", () => {
    for (const text of ["ok", "continue", "go", "poursuis", "vas-y", "suite", "reprends maintenant"])
      expect(isContinuationPrompt(text)).toBe(true)
  })

  test("rejects substantial requests and empty input", () => {
    for (const text of ["implement the three lots", "why did the agent stop", ""])
      expect(isContinuationPrompt(text)).toBe(false)
  })
})

describe("classifyUserTurn", () => {
  test("steering messages are interventions", () => {
    expect(classifyUserTurn({ text: "please explain the design before continuing", steer: true })).toBe("intervention")
  })

  test("continuation verbs and step advances keep the mission", () => {
    for (const text of ["ok", "continue", "lot 2", "étape suivante", "oui", "next", "poursuis"])
      expect(classifyUserTurn({ text })).toBe("continuation")
  })

  test("empty prompts are continuations, substantial prompts are new topics", () => {
    expect(classifyUserTurn({ text: "   " })).toBe("continuation")
    expect(classifyUserTurn({ text: "Add OAuth login to the admin console and migrate the schema." })).toBe("new_topic")
    expect(classifyUserTurn({ text: "Why did the agent stop in the middle of the plan?" })).toBe("new_topic")
  })
})
