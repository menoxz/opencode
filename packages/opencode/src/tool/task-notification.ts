export function taskResultNotificationKey(taskCallID: string, revision: number) {
  return `task-result:${taskCallID}:${revision}`
}

export function hasTaskResultNotification(messages: readonly { parts: readonly unknown[] }[], key: string) {
  return messages.some((message) => message.parts.some((part) => {
    if (!part || typeof part !== "object" || !("metadata" in part)) return false
    const metadata = part.metadata
    return !!metadata && typeof metadata === "object" && "task_result_key" in metadata && metadata.task_result_key === key
  }))
}
