export const MINIMAL_DOD_ITEM = "Produire une réponse utile et actionnable alignée avec la demande en cours."

export const GOAL_EDIT_COPY = {
  objectiveLabel: "Objective",
  dodLabel: "Definition of Done",
  outOfScopeLabel: "Out of Scope",
} as const

type GoalSection = "goal" | "dod" | "oos"

export function normalizeGoalList(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const out: string[] = []
  for (const item of items) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (!trimmed) continue
    if (!out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

function parseSectionHeader(line: string): { section: GoalSection; inline: string } | undefined {
  const match = line.match(
    /^\s*(goal|objectif|objective|dod|definition of done|d[ée]finition\s*de\s*done|out\s*of\s*scope|out[-\s]*of[-\s]*scope|oos|scope\s*exclusions?|hors\s*p[ée]rim[èe]tre)\s*:\s*(.*)$/i,
  )
  if (!match) return undefined

  const label = match[1]?.toLowerCase().replace(/\s+/g, " ").trim()
  const inline = (match[2] ?? "").trim()

  if (!label) return undefined
  if (label === "goal" || label === "objectif" || label === "objective") return { section: "goal", inline }
  if (label === "dod" || label === "definition of done" || label === "définition de done") {
    return { section: "dod", inline }
  }
  return { section: "oos", inline }
}

function parseBullet(line: string): string | undefined {
  const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/)
  if (!bullet || !bullet[1]) return undefined
  const item = bullet[1].trim()
  return item || undefined
}

function firstFallbackGoal(text: string): string {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)

  for (const paragraph of paragraphs) {
    const lines = paragraph.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (const line of lines) {
      if (parseSectionHeader(line)) continue
      const fromBullet = parseBullet(line)
      if (fromBullet) return fromBullet
      return line
    }
  }
  return ""
}

export function parseGoalEditInput(text: string): { goal: string; dod: string[]; outOfScope: string[] } {
  const lines = text.split(/\r?\n/)
  let current: GoalSection | undefined
  const goalLines: string[] = []
  const dod: string[] = []
  const outOfScope: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const header = parseSectionHeader(rawLine)
    if (header) {
      current = header.section
      if (header.inline) {
        if (current === "goal") {
          goalLines.push(header.inline)
        } else {
          const fromBullet = parseBullet(header.inline)
          const item = (fromBullet ?? header.inline).trim()
          if (item) {
            if (current === "dod") dod.push(item)
            if (current === "oos") outOfScope.push(item)
          }
        }
      }
      continue
    }

    if (!line || !current) continue
    if (current === "goal") {
      goalLines.push(line)
      continue
    }

    const item = parseBullet(rawLine)
    if (!item) continue
    if (current === "dod") dod.push(item)
    if (current === "oos") outOfScope.push(item)
  }

  const goal = (goalLines.find((line) => line.trim().length > 0) ?? firstFallbackGoal(text)).trim()
  return {
    goal,
    dod: normalizeGoalList(dod),
    outOfScope: normalizeGoalList(outOfScope),
  }
}

export function buildGoalEditTemplate(goalState: {
  goal?: unknown
  dod?: unknown
  outOfScope?: unknown
}): string {
  const goal = typeof goalState.goal === "string" ? goalState.goal.trim() : ""
  const dod = normalizeGoalList(goalState.dod)
  const outOfScope = normalizeGoalList(goalState.outOfScope)

  const dodLines = dod.length > 0 ? dod : ["item 1", "item 2"]
  const oosLines = outOfScope.length > 0 ? outOfScope : ["item A"]

  return [
    `${GOAL_EDIT_COPY.objectiveLabel}: ${goal}`,
    "",
    `${GOAL_EDIT_COPY.dodLabel}:`,
    ...dodLines.map((item) => `- ${item}`),
    "",
    `${GOAL_EDIT_COPY.outOfScopeLabel}:`,
    ...oosLines.map((item) => `- ${item}`),
  ].join("\n")
}

export function serializeGoalStateCompressed(goal: string, dod: string[], outOfScope: string[]): string {
  const serializedGoal = goal.split(/[.!?]\s/)[0]?.replace(/\n/g, " ").trim().slice(0, 200) ?? goal
  const serializedDod = dod.map((item) => item.trim()).filter(Boolean).join("|")
  const serializedOos = outOfScope.map((item) => item.trim()).filter(Boolean).join("|")
  return [`GOAL: ${serializedGoal}`, ...(serializedDod ? [`DOD: ${serializedDod}`] : []), ...(serializedOos ? [`OOS: ${serializedOos}`] : [])].join("\n") + "\n"
}
