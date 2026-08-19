import { describe, expect, test } from "bun:test"
import { hasTaskResultNotification, taskResultNotificationKey } from "./task-notification"

describe("task result notification idempotency", () => {
  test("uses a stable child/state key and detects persisted duplicates", () => {
    const key = taskResultNotificationKey("ses_child" as any, "completed")
    expect(key).toBe("task-result:ses_child:completed")
    expect(hasTaskResultNotification([
      { parts: [{ type: "text", metadata: { background_notification: true, task_result_key: key } }] },
    ] as any, key)).toBe(true)
    expect(hasTaskResultNotification([{ parts: [] }] as any, key)).toBe(false)
  })
})