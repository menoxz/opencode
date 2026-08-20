export const LEAN_INSPECT_MAX_ACTIONS = 8
export const LEAN_INSPECT_TOTAL_CHARS = 16_000
export const LEAN_INSPECT_MAX_CHARS_PER_RESULT = 4_000
export const LEAN_INSPECT_DEFAULT_CHARS_PER_RESULT = 2_000
export const LEAN_TERMINAL_MAX_CHARS = 4_000
export const LEAN_TERMINAL_MAX_LINES = 120

export function inspectBudget(input: { enabled: boolean; actionCount: number; requestedChars?: number }) {
  if (!input.enabled) return { maxActions: 16, maxCharsPerResult: input.requestedChars ?? 8_000, totalChars: Number.POSITIVE_INFINITY }
  const count = Math.max(1, input.actionCount)
  const requested = input.requestedChars ?? LEAN_INSPECT_DEFAULT_CHARS_PER_RESULT
  const perWave = Math.max(1_000, Math.floor(LEAN_INSPECT_TOTAL_CHARS / count))
  return {
    maxActions: LEAN_INSPECT_MAX_ACTIONS,
    maxCharsPerResult: Math.min(requested, LEAN_INSPECT_MAX_CHARS_PER_RESULT, perWave),
    totalChars: LEAN_INSPECT_TOTAL_CHARS,
  }
}

export function isLeanTerminalTool(tool: string) {
  const normalized = tool.replaceAll("__", "_").toLowerCase()
  return normalized === "bash" || normalized.endsWith("mcp-terminal_command_run")
}

export function requiresPatchCause(messages: readonly { parts?: readonly unknown[] }[]) {
  return messages.some((message) => (message.parts ?? []).some((part) => {
    if (!part || typeof part !== "object") return false
    const value = part as { type?: string; tool?: string; state?: { status?: string } }
    return value.type === "tool" && value.tool === "apply_patch" && value.state?.status === "completed"
  }))
}
