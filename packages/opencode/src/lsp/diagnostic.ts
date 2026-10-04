import * as LSPClient from "./client"

const MAX_PER_FILE = 20
const MAX_PROJECT_FILES = 5

export function boundProjectDiagnostics(
  diagnostics: Record<string, LSPClient.Diagnostic[]>,
  priority: string[] = [],
): { diagnostics: Record<string, LSPClient.Diagnostic[]>; truncated: boolean } {
  const rank = (file: string) => (priority.includes(file) ? 0 : 1)
  const entries = Object.entries(diagnostics).sort(
    (a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length,
  )
  const kept = entries.slice(0, MAX_PROJECT_FILES)
  const truncated =
    entries.length > MAX_PROJECT_FILES || kept.some(([, issues]) => issues.length > MAX_PER_FILE)
  return {
    diagnostics: Object.fromEntries(kept.map(([file, issues]) => [file, issues.slice(0, MAX_PER_FILE)])),
    truncated,
  }
}

export function pretty(diagnostic: LSPClient.Diagnostic) {
  const severityMap = {
    1: "ERROR",
    2: "WARN",
    3: "INFO",
    4: "HINT",
  }

  const severity = severityMap[diagnostic.severity || 1]
  const line = diagnostic.range.start.line + 1
  const col = diagnostic.range.start.character + 1

  return `${severity} [${line}:${col}] ${diagnostic.message}`
}

export function report(file: string, issues: LSPClient.Diagnostic[]) {
  const errors = issues.filter((item) => item.severity === 1)
  if (errors.length === 0) return ""
  const limited = errors.slice(0, MAX_PER_FILE)
  const more = errors.length - MAX_PER_FILE
  const suffix = more > 0 ? `\n... and ${more} more` : ""
  return `<diagnostics file="${file}">\n${limited.map(pretty).join("\n")}${suffix}\n</diagnostics>`
}

export * as Diagnostic from "./diagnostic"
