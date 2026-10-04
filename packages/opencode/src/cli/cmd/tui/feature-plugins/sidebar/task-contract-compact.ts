export const MAX_DOD_PREVIEW = 1
export const MAX_OOS_PREVIEW = 1

const DEFAULT_OBJECTIVE_MAX_CHARS = 88

function stripMarkdownNoise(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, "$1$2")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>+\s?/, "")
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function truncateSingleLine(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (!value) return { text: "", truncated: false }
  if (value.length <= maxChars) return { text: value, truncated: false }
  const clipped = value.slice(0, Math.max(0, maxChars - 1)).trimEnd()
  return { text: `${clipped}…`, truncated: true }
}

function compactList(items: string[], maxVisible: number) {
  const normalized = items.map(stripMarkdownNoise).map((item) => item.trim()).filter(Boolean)
  const visible = normalized.slice(0, maxVisible)
  const hidden = Math.max(0, normalized.length - visible.length)
  const summary = visible[0] ?? "-"
  return {
    total: normalized.length,
    visible,
    hidden,
    summary,
  }
}

export function formatTaskContractCompact(
  input: {
    goal: string
    dod: string[]
    outOfScope: string[]
  },
  options?: {
    objectiveMaxChars?: number
  },
) {
  const objective = truncateSingleLine(
    stripMarkdownNoise(input.goal),
    options?.objectiveMaxChars ?? DEFAULT_OBJECTIVE_MAX_CHARS,
  )

  return {
    objective,
    dod: compactList(input.dod, MAX_DOD_PREVIEW),
    outOfScope: compactList(input.outOfScope, MAX_OOS_PREVIEW),
  }
}

export function formatTaskContractCompactLines(
  compact: ReturnType<typeof formatTaskContractCompact>,
  labels: {
    objective: string
    dod: string
    oos: string
  } = {
    objective: "Obj",
    dod: "DoD",
    oos: "OOS",
  },
) {
  return {
    objectiveLine: `${labels.objective}: ${compact.objective.text || "-"}`,
    dodLine: `${labels.dod} (${compact.dod.total}): ${compact.dod.summary}${compact.dod.hidden > 0 ? `… +${compact.dod.hidden}` : ""}`,
    oosLine: `${labels.oos} (${compact.outOfScope.total}): ${compact.outOfScope.summary}${compact.outOfScope.hidden > 0 ? `… +${compact.outOfScope.hidden}` : ""}`,
  }
}
