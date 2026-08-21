export const LEAN_INSPECT_MAX_ACTIONS = 8
export const LEAN_INSPECT_TOTAL_CHARS = 16_000
export const LEAN_INSPECT_MAX_CHARS_PER_RESULT = 4_000
export const LEAN_INSPECT_DEFAULT_CHARS_PER_RESULT = 2_000
export const LEAN_TERMINAL_MAX_CHARS = 4_000
export const LEAN_TERMINAL_MAX_LINES = 120
export const LEAN_BROWSER_MAX_CHARS = 8_000
export const LEAN_BROWSER_MAX_LINES = 250

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

export function leanToolOutputBudget(tool: string): { maxChars: number; maxLines: number; direction: "head" | "tail" } | undefined {
  if (isLeanTerminalTool(tool)) {
    return { maxChars: LEAN_TERMINAL_MAX_CHARS, maxLines: LEAN_TERMINAL_MAX_LINES, direction: "tail" }
  }
  const normalized = tool.replaceAll("__", "_").toLowerCase()
  if (normalized.includes("web-browser_")) {
    return { maxChars: LEAN_BROWSER_MAX_CHARS, maxLines: LEAN_BROWSER_MAX_LINES, direction: "head" }
  }
}

const MUTATION_TOOLS = new Set(["apply_patch", "edit", "write"])

export type MutationTarget = { tool: "apply_patch" | "edit" | "write"; filePath?: string }

function normalizeMutationPath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase()
}

function sameMutationPath(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false
  const a = normalizeMutationPath(left)
  const b = normalizeMutationPath(right)
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)
}

function patchPaths(patchText: unknown) {
  if (typeof patchText !== "string") return []
  return [...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) => match[1].trim())
}

export function requiresMutationCause(
  messages: readonly { parts?: readonly unknown[] }[],
  current?: MutationTarget,
) {
  const prior = messages.flatMap((message) => (message.parts ?? []).flatMap((part) => {
    if (!part || typeof part !== "object") return []
    const value = part as { type?: string; tool?: string; state?: { status?: string; input?: Record<string, unknown> } }
    if (value.type !== "tool" || !value.tool || !MUTATION_TOOLS.has(value.tool) || value.state?.status !== "completed") return []
    return [{ tool: value.tool, input: value.state.input ?? {} }]
  }))
  if (!current) return prior.length > 0
  if (current.tool === "apply_patch") return prior.length > 0
  return prior.some((item) => {
    if (item.tool === "edit" || item.tool === "write") {
      return sameMutationPath(item.input.filePath as string | undefined, current.filePath)
    }
    return patchPaths(item.input.patchText).some((file) => sameMutationPath(file, current.filePath))
  })
}
