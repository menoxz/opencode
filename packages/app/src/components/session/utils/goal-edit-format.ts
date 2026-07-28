/**
 * Build a text template for editing a goal contract.
 * Produces the format:
 *   Goal: <goal>
 *   DoD:
 *   - <item1>
 *   - <item2>
 *   OOS:
 *   - <item1>
 */
export function buildGoalEditTemplate(goalState: {
  goal?: string
  dod?: string[]
  outOfScope?: string[]
}): string {
  const goal = goalState.goal?.trim() ?? ""
  const dod = Array.isArray(goalState.dod)
    ? goalState.dod.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []
  const outOfScope = Array.isArray(goalState.outOfScope)
    ? goalState.outOfScope.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : []

  const lines: string[] = []
  lines.push(`Goal: ${goal}`)
  lines.push("DoD:")
  for (const item of dod) {
    lines.push(`- ${item}`)
  }
  lines.push("OOS:")
  for (const item of outOfScope) {
    lines.push(`- ${item}`)
  }
  return lines.join("\n")
}

/**
 * Parse text in the goal edit format back to structured data.
 * Returns null if the input is empty.
 */
export function parseGoalEditInput(
  text: string,
): { goal: string; dod: string[]; outOfScope: string[] } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const lines = trimmed.split("\n")
  let goal = ""
  const dod: string[] = []
  const outOfScope: string[] = []
  let section: "goal" | "dod" | "oos" | null = null

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith("Goal:")) {
      goal = line.slice("Goal:".length).trim()
      section = "goal"
    } else if (line === "DoD:") {
      section = "dod"
    } else if (line === "OOS:") {
      section = "oos"
    } else if (section === "dod" && line.startsWith("- ")) {
      const item = line.slice(2).trim()
      if (item) dod.push(item)
    } else if (section === "oos" && line.startsWith("- ")) {
      const item = line.slice(2).trim()
      if (item) outOfScope.push(item)
    }
    // Ignore lines that don't match any pattern
  }

  return { goal, dod, outOfScope }
}
