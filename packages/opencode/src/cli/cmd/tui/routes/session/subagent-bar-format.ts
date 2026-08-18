/**
 * Pure formatting for the subagent bar.
 *
 * The bar sits in the few lines above the prompt, so every label has to earn
 * its width: a row is only useful if it says, at a glance, whether a subagent
 * is still working, on what, and what it has cost so far.
 */

export type SubagentRowInput = {
  id: string
  title: string
  created: number
  updated: number
  cost?: number
  working: boolean
  now: number
}

export type SubagentRow = {
  id: string
  title: string
  agent?: string
  working: boolean
  duration?: string
  cost?: string
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** "3m07s". Hidden entirely when the clock would lie: unknown or running backwards. */
export function formatElapsed(from: number, to: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined
  const seconds = Math.round((to - from) / 1000)
  if (seconds < 0) return undefined
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
}

/** A child session is titled "Audit backend (@explore subagent)": split the two. */
export function splitSubagentTitle(title: string) {
  const match = title.match(/^(.*?)\s*\(@([\w-]+) subagent\)\s*$/)
  if (!match) return { title: title.trim(), agent: undefined }
  return { title: match[1].trim(), agent: match[2] }
}

export function formatSubagentRow(input: SubagentRowInput): SubagentRow {
  const { title, agent } = splitSubagentTitle(input.title)
  return {
    id: input.id,
    title,
    agent,
    working: input.working,
    // A finished subagent keeps the duration it actually took; a working one
    // counts against now, never against a stale updated timestamp.
    duration: formatElapsed(input.created, input.working ? input.now : input.updated),
    cost: input.cost !== undefined && input.cost > 0 ? money.format(input.cost) : undefined,
  }
}

/** "2 working · 6 total", or "all idle · 6 total" once every child has settled. */
export function formatSubagentSummary(rows: readonly SubagentRow[]) {
  const working = rows.filter((row) => row.working).length
  return `${working > 0 ? `${working} working` : "all idle"} · ${rows.length} total`
}
