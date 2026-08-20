import { describe, expect, test } from "bun:test"
import { hasTaskResultNotification, taskResultNotificationKey } from "./task-notification"

describe("task result notification idempotency", () => {
  test("uses a stable child/state key and detects persisted duplicates", () => {
    const key = taskResultNotificationKey("call-1", 1)
    expect(key).toBe("task-result:call-1:1")
    expect(hasTaskResultNotification([
      { parts: [{ type: "text", metadata: { background_notification: true, task_result_key: key } }] },
    ] as any, key)).toBe(true)
    expect(hasTaskResultNotification([{ parts: [] }] as any, key)).toBe(false)
    expect(taskResultNotificationKey("call-2", 1)).not.toBe(key)
    expect(taskResultNotificationKey("call-1", 2)).not.toBe(key)
  })
})