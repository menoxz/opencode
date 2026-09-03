type MessageLike = {
  id: string
  role: string
  time?: { created?: number; completed?: number }
  finish?: string
  error?: unknown
}

export function pendingAssistantID(messages: readonly MessageLike[], busy: boolean) {
  if (!busy) return
  return messages.findLast((message) =>
    message.role === "assistant" && !message.time?.completed && !message.finish && !message.error,
  )?.id
}
