import { describe, expect, test } from "bun:test"
import { taskFollowUp, taskFollowUpIcon, taskFollowUpText } from "../../../src/cli/cmd/tui/routes/session/task-followup"

describe("tui.task-followup", () => {
  test("nomme l'action pendant l'attente", () => {
    expect(taskFollowUpText("wait", false)).toBe("Waiting for subagent...")
    expect(taskFollowUpText("check", false)).toBe("Checking subagent...")
    expect(taskFollowUpText("cancel", false)).toBe("Stopping subagent...")
  })

  // Une fois l'attente finie, la ligne ne repete plus l'action en cours : elle dit le resultat.
  test("dit le resultat une fois termine", () => {
    expect(taskFollowUpText("wait", true)).toBe("Subagent finished")
    expect(taskFollowUpText("check", true)).toBe("Subagent checked")
    expect(taskFollowUpText("cancel", true)).toBe("Subagent stopped")
  })

  // L'ancienne ligne commencait par une barre verticale nue, qui se lisait comme un « | ».
  test("donne une icone reelle a chaque suivi", () => {
    for (const action of ["wait", "check", "cancel"]) {
      const icon = taskFollowUpIcon(action, "⇢")
      expect(icon).not.toBe("│")
      expect(icon).not.toBe("|")
      expect(icon).toBe(taskFollowUp(action)!.icon)
    }
  })

  test("une delegation simple garde l'icone de repli", () => {
    expect(taskFollowUpText(undefined, false)).toBe("")
    expect(taskFollowUpText("", true)).toBe("")
    expect(taskFollowUpIcon(undefined, "⇢")).toBe("⇢")
    expect(taskFollowUpIcon("inconnue", "⇢")).toBe("⇢")
  })
})
