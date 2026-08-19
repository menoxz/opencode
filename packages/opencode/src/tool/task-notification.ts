import type { SessionID } from "@/session/schema"

export type TaskTerminalState = "completed" | "error" | "budget_exceeded"

export function taskResultNotificationKey(sessionID: SessionID, state: TaskTerminalState) {
  return `task-result:${sessionID}:${state}`
}

export function hasTaskResultNotification(messages: readonly { parts: readonly unknown[] }[], key: string) {
  return messages.some((message) => message.parts.some((part) => {
    if (!part || typeof part !== "object" || !("metadata" in part)) return false
    const metadata = part.metadata
    return !!metadata && typeof metadata === "object" && "task_result_key" in metadata && metadata.task_result_key === key
  }))
}
