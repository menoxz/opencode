/**
 * Usage-driven ranking for the skill catalog.
 *
 * Measured problem (see AUDIT-opencodev2.md, D3): 193 skills are installed,
 * only 58 were ever loaded in 45 days, and 141 (73 %) have never been loaded
 * once — yet the catalog is rebuilt into the system prompt on every turn of
 * every session. Presence on disk was being treated as capability.
 *
 * `session/system.ts` already ranks by BM25 against the user's message, but
 * that filter is skipped whenever no user text is available, and in that case
 * the *entire* catalog was emitted. This module supplies the fallback ordering
 * and, above all, guarantees the budget is always applied.
 *
 * Ranking policy: most-recently-loaded skills first, because real usage is the
 * only honest relevance signal available without the user's text. A slice of
 * the budget is reserved for skills with no usage history so that a newly
 * installed skill is still discoverable and the ranking cannot become
 * self-fulfilling. Anything outside the budget stays reachable through the
 * `skill_search` tool.
 *
 * Usage is persisted as a small JSON map in the state directory so the signal
 * survives restarts. Loss of that file is harmless: it degrades to "no usage
 * history", which is the behaviour on a fresh install.
 */
import path from "path"
import { Global } from "@opencode-ai/core/global"

/** Slots reserved for skills with no recorded usage, so new skills surface. */
export const DISCOVERY_RESERVE = 10

/** Usage older than this stops counting as a recency signal. */
export const STALE_MS = 60 * 24 * 60 * 60 * 1000

export const FILE = path.join(Global.Path.state, "skill-usage.json")

type Usage = Record<string, number>

let usage: Usage = {}
let loading: Promise<void> | undefined
let flushing: Promise<void> | undefined

function isUsage(value: unknown): value is Usage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "number")
}

/** Load the persisted usage map once. Safe to await on every turn. */
export function ready(): Promise<void> {
  loading ??= Bun.file(FILE)
    .json()
    .then((data: unknown) => {
      if (isUsage(data)) usage = data
    })
    .catch(() => {})
  return loading
}

function flush(): void {
  if (flushing) return
  flushing = Bun.write(FILE, JSON.stringify(usage))
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      flushing = undefined
    })
}

/** Note that a skill was actually loaded. Called from the `skill` tool. */
export function record(name: string, now = Date.now()): void {
  usage[name] = now
  flush()
}

export function lastUsed(name: string): number | undefined {
  return usage[name]
}

/** Recency score: higher is more recent, 0 for never-used or stale usage. */
export function score(name: string, now = Date.now()): number {
  const at = usage[name]
  if (at === undefined) return 0
  if (now - at > STALE_MS) return 0
  return at
}

/**
 * Apply the catalog budget. Recently-used skills first, then a reserved slice
 * of never-used skills in their original order so new skills stay discoverable.
 * Returns `list` untouched when it already fits.
 */
export function prioritize<T extends { name: string }>(
  list: T[],
  limit: number,
  now = Date.now(),
  reserve = DISCOVERY_RESERVE,
): T[] {
  if (list.length <= limit) return list

  const used = list
    .map((item, index) => ({ item, index, score: score(item.name, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const usedBudget = Math.max(0, limit - reserve)
  const chosen = used.slice(0, usedBudget)
  const taken = new Set(chosen.map((entry) => entry.index))

  const filler = list
    .map((item, index) => ({ item, index }))
    .filter((entry) => !taken.has(entry.index))
    .slice(0, limit - chosen.length)

  return [...chosen, ...filler].sort((a, b) => a.index - b.index).map((entry) => entry.item)
}

/** Test hook: replace the in-memory usage map without touching disk. */
export function seed(next: Usage): void {
  usage = { ...next }
  loading = Promise.resolve()
}

/** Test hook: drop all in-memory usage. */
export function reset(): void {
  usage = {}
  loading = Promise.resolve()
}

export * as SkillUsage from "./usage"
