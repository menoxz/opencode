export const LEAN_INSPECT_MAX_ACTIONS = 16
export const LEAN_INSPECT_TOTAL_CHARS = 16_000
export const LEAN_INSPECT_MAX_CHARS_PER_RESULT = 4_000
export const LEAN_TERMINAL_MAX_CHARS = 4_000
export const LEAN_TERMINAL_MAX_LINES = 120
export const LEAN_BROWSER_MAX_CHARS = 8_000
export const LEAN_BROWSER_MAX_LINES = 250
// Minimum number of dynamic (tool_search) slots the lean cap must leave free
// on top of the mandatory core tools, so activations stop evicting each other.
export const LEAN_DYNAMIC_SLOT_MARGIN = 6

// An agent opts into the lean profile via `lean: true`; the historical
// hard-coded name is kept as a fallback so existing configs keep working.
export function isLeanAgent(agent: { name: string; lean?: boolean }) {
  return agent.lean ?? agent.name === "lean"
}

export function inspectBudget(input: { enabled: boolean; actionCount: number; requestedChars?: number }) {
  if (!input.enabled && input.requestedChars !== undefined)
    return { maxActions: 16, maxCharsPerResult: input.requestedChars, totalChars: Number.POSITIVE_INFINITY }
  const count = Math.max(1, input.actionCount)
  // The per-result default scales with the wave: a 2-action wave may read up
  // to the hard per-result cap, a 16-action wave gets 1k each. An explicit
  // request is still honoured but never exceeds the per-result cap or the
  // fair share of the total budget.
  const perWave = Math.max(1_000, Math.floor(LEAN_INSPECT_TOTAL_CHARS / count))
  const requested = input.requestedChars ?? Math.min(LEAN_INSPECT_MAX_CHARS_PER_RESULT, perWave)
  return {
    maxActions: LEAN_INSPECT_MAX_ACTIONS,
    maxCharsPerResult: Math.min(requested, LEAN_INSPECT_MAX_CHARS_PER_RESULT, perWave),
    totalChars: LEAN_INSPECT_TOTAL_CHARS,
  }
}

export function isLeanTerminalTool(tool: string, input: Record<string, unknown> = {}) {
  const normalized = tool.replaceAll("__", "_").toLowerCase()
  if (normalized === "bash") return true
  if (normalized.endsWith("developer-tools_native_terminal")) {
    return ["execute", "read", "stream_read"].includes(String(input.action))
  }
  if (normalized.endsWith("mcp-terminal_command_stream")) return ["start", "read"].includes(String(input.action))
  return /(?:^|_)mcp-terminal_(?:command_run|command_chain|command_status|command_wait|terminal_read|ssh_run)$/.test(
    normalized,
  )
}

export function leanToolOutputBudget(
  tool: string,
): { maxChars: number; maxLines: number; direction: "head" | "tail" } | undefined {
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

export function requiresMutationCause(messages: readonly { parts?: readonly unknown[] }[], current?: MutationTarget) {
  const prior = messages.flatMap((message) =>
    (message.parts ?? []).flatMap((part) => {
      if (!part || typeof part !== "object") return []
      const value = part as {
        type?: string
        tool?: string
        state?: { status?: string; input?: Record<string, unknown> }
      }
      if (
        value.type !== "tool" ||
        !value.tool ||
        !MUTATION_TOOLS.has(value.tool) ||
        value.state?.status !== "completed"
      )
        return []
      return [{ tool: value.tool, input: value.state.input ?? {} }]
    }),
  )
  if (!current) return prior.length > 0
  if (current.tool === "apply_patch") return prior.length > 0
  return prior.some((item) => {
    if (item.tool === "edit" || item.tool === "write") {
      return sameMutationPath(item.input.filePath as string | undefined, current.filePath)
    }
    return patchPaths(item.input.patchText).some((file) => sameMutationPath(file, current.filePath))
  })
}
