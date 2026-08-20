type MessageLike = {
  id: string
  role: string
  time?: { completed?: number }
  finish?: string
  error?: unknown
}

export function pendingAssistantID(messages: readonly MessageLike[]) {
  return messages.findLast((message) =>
    message.role === "assistant" && !message.time?.completed && !message.finish && !message.error,
  )?.id
}
