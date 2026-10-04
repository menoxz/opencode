import { describe, expect, test } from "bun:test"
import { taskFollowUpLabel } from "../../../src/cli/cmd/tui/routes/session/task-followup"

describe("task follow-up label", () => {
  test("labels each follow-up action so a poll is not shown as a new delegation", () => {
    expect(taskFollowUpLabel("wait")).toBe("Waiting for subagent...")
    expect(taskFollowUpLabel("check")).toBe("Checking subagent...")
    expect(taskFollowUpLabel("cancel")).toBe("Stopping subagent...")
  })

  test("stays empty for a launch so the Delegating label is used", () => {
    expect(taskFollowUpLabel(undefined)).toBe("")
    expect(taskFollowUpLabel("")).toBe("")
  })
})
