/**
 * Cœur des garde-fous injectables — spec : `specs/injectable-guards.md`.
 *
 * Deux fonctions pures, sans modèle et sans service :
 * - `compileGuard` valide les déclencheurs d'un `.md` de garde au chargement, en refusant avec un
 *   message ce qu'elle ne comprend pas (un déclencheur ignoré en silence est pire qu'un refus) ;
 * - `shouldInject` / `selectGuards` décident, pour un état de step donné, quelles gardes tirent.
 *
 * Aucune injection ici : le branchement sur le prompt est une étape séparée.
 */
import { Wildcard } from "@opencode-ai/core/util/wildcard"

export type Operator = ">=" | "<=" | ">" | "<" | "=" | "!="

export const OPERATORS: readonly Operator[] = [">=", "<=", ">", "<", "=", "!="]

/** Signaux numériques, indexés par leur orthographe frontmatter. */
export const NUMERIC_SIGNALS = {
  since_last_tokens: "tokensSinceLastGuard",
  context_ratio: "contextRatio",
  tool_calls_in_turn: "toolCallsInTurn",
  error_streak: "errorStreak",
  repeat_action: "repeatAction",
  steps_in_turn: "stepsInTurn",
  turns_since_injection: "turnsSinceInjection",
  step: "step",
  turn: "turn",
} as const

export const BOOLEAN_SIGNALS = {
  after_compaction: "afterCompaction",
} as const

export const LIST_SIGNALS = {
  path_match: "paths",
} as const

export const ENUM_SIGNALS = {
  agent: "agent",
  phase: "phase",
} as const

export const SIGNAL_KEYS: readonly string[] = [
  ...Object.keys(NUMERIC_SIGNALS),
  ...Object.keys(BOOLEAN_SIGNALS),
  ...Object.keys(LIST_SIGNALS),
  ...Object.keys(ENUM_SIGNALS),
]

/** Ordre de priorité : c'est l'ordre du tableau de la spec, pas l'ordre du fichier. */
export const PRIORITY: readonly string[] = [
  "since_last_tokens",
  "context_ratio",
  "after_compaction",
  "tool_calls_in_turn",
  "error_streak",
  "repeat_action",
  "steps_in_turn",
  "path_match",
  "turns_since_injection",
  "agent",
  "phase",
]

export type GuardState = {
  step: number
  turn: number
  stepsInTurn: number
  toolCallsInTurn: number
  tokensSinceLastGuard: number
  contextRatio: number
  afterCompaction: boolean
  errorStreak: number
  repeatAction: number
  turnsSinceInjection: number
  paths: string[]
  agent?: string
  phase?: string
}

export type NumericCondition = { key: string; operator: Operator; value: number }
export type BooleanCondition = { key: string; value: boolean }
export type ListCondition = { key: string; globs: string[] }
export type EnumCondition = { key: string; values: string[] }

export type CompiledGuard = {
  name: string
  description?: string
  body: string
  numeric: NumericCondition[]
  boolean: BooleanCondition[]
  list: ListCondition[]
  enumeration: EnumCondition[]
}

export class GuardDefinitionError extends Error {
  constructor(
    readonly guard: string,
    readonly detail: string,
  ) {
    super(`guard "${guard}": ${detail}`)
    this.name = "GuardDefinitionError"
  }
}

const NUMERIC_PATTERN = /^\s*(>=|<=|>|<|!=|=)?\s*(-?\d+(?:\.\d+)?)\s*$/

function compileNumeric(guard: string, key: string, raw: unknown): NumericCondition {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : undefined
  if (text === undefined) {
    throw new GuardDefinitionError(guard, `trigger "${key}" expects a comparison like ">= 4", got ${JSON.stringify(raw)}`)
  }
  const match = NUMERIC_PATTERN.exec(text)
  if (!match) {
    throw new GuardDefinitionError(
      guard,
      `trigger "${key}" expects a comparison like ">= 4", got ${JSON.stringify(raw)}`,
    )
  }
  const operator = (match[1] ?? "=") as Operator
  const value = Number(match[2])
  if (!Number.isFinite(value)) {
    throw new GuardDefinitionError(guard, `trigger "${key}" has a non-finite threshold ${JSON.stringify(raw)}`)
  }
  return { key, operator, value }
}

function compileBoolean(guard: string, key: string, raw: unknown): BooleanCondition {
  if (typeof raw === "boolean") return { key, value: raw }
  if (typeof raw === "string") {
    const text = raw.trim().replace(/^=\s*/, "").toLowerCase()
    if (text === "true") return { key, value: true }
    if (text === "false") return { key, value: false }
  }
  throw new GuardDefinitionError(guard, `trigger "${key}" expects true or false, got ${JSON.stringify(raw)}`)
}

function compileList(guard: string, key: string, raw: unknown): ListCondition {
  const globs =
    typeof raw === "string" ? [raw] : Array.isArray(raw) && raw.every((item) => typeof item === "string") ? raw : undefined
  if (!globs || globs.length === 0) {
    throw new GuardDefinitionError(guard, `trigger "${key}" expects a glob or a list of globs, got ${JSON.stringify(raw)}`)
  }
  return { key, globs: globs as string[] }
}

function compileEnum(guard: string, key: string, raw: unknown): EnumCondition {
  const values =
    typeof raw === "string" ? [raw] : Array.isArray(raw) && raw.every((item) => typeof item === "string") ? raw : undefined
  if (!values || values.length === 0) {
    throw new GuardDefinitionError(guard, `trigger "${key}" expects a value or a list of values, got ${JSON.stringify(raw)}`)
  }
  return { key, values: values as string[] }
}

/**
 * Valide les déclencheurs d'une garde. Tout ce qui n'est pas compris lève, avec le nom de la garde et
 * la liste des déclencheurs connus : une garde silencieusement inerte est indétectable.
 */
export function compileGuard(input: {
  name: string
  description?: string
  body: string
  when?: Record<string, unknown>
}): CompiledGuard {
  const compiled: CompiledGuard = {
    name: input.name,
    description: input.description,
    body: input.body,
    numeric: [],
    boolean: [],
    list: [],
    enumeration: [],
  }
  for (const [key, raw] of Object.entries(input.when ?? {})) {
    if (key in NUMERIC_SIGNALS) {
      compiled.numeric.push(compileNumeric(input.name, key, raw))
      continue
    }
    if (key in BOOLEAN_SIGNALS) {
      compiled.boolean.push(compileBoolean(input.name, key, raw))
      continue
    }
    if (key in LIST_SIGNALS) {
      compiled.list.push(compileList(input.name, key, raw))
      continue
    }
    if (key in ENUM_SIGNALS) {
      compiled.enumeration.push(compileEnum(input.name, key, raw))
      continue
    }
    throw new GuardDefinitionError(
      input.name,
      `unknown trigger "${key}" (known: ${SIGNAL_KEYS.join(", ")})`,
    )
  }
  if (compiled.numeric.length + compiled.boolean.length + compiled.list.length + compiled.enumeration.length === 0) {
    throw new GuardDefinitionError(input.name, "no trigger: a guard without condition would fire every step")
  }
  return compiled
}

function compare(actual: number, operator: Operator, expected: number): boolean {
  switch (operator) {
    case ">=":
      return actual >= expected
    case "<=":
      return actual <= expected
    case ">":
      return actual > expected
    case "<":
      return actual < expected
    case "!=":
      return actual !== expected
    case "=":
      return actual === expected
  }
}

function readNumber(state: GuardState, key: string): number {
  const field = NUMERIC_SIGNALS[key as keyof typeof NUMERIC_SIGNALS]
  return (state as unknown as Record<string, number>)[field] ?? 0
}

/**
 * Toutes les conditions doivent tenir (ET). `reasons` porte le déclencheur satisfait et la valeur
 * observée : c'est ce qui part au journal, sans quoi on ne peut pas distinguer « n'a pas tiré » de
 * « a tiré pour une mauvaise raison ».
 */
export function shouldInject(guard: CompiledGuard, state: GuardState): { inject: boolean; reasons: string[] } {
  const reasons: string[] = []

  for (const condition of guard.numeric) {
    const actual = readNumber(state, condition.key)
    if (!compare(actual, condition.operator, condition.value)) return { inject: false, reasons: [] }
    reasons.push(`${condition.key}${condition.operator}${condition.value} (${actual})`)
  }

  for (const condition of guard.boolean) {
    const field = BOOLEAN_SIGNALS[condition.key as keyof typeof BOOLEAN_SIGNALS]
    const actual = Boolean((state as unknown as Record<string, unknown>)[field])
    if (actual !== condition.value) return { inject: false, reasons: [] }
    reasons.push(`${condition.key}=${actual}`)
  }

  for (const condition of guard.list) {
    const field = LIST_SIGNALS[condition.key as keyof typeof LIST_SIGNALS]
    const paths = ((state as unknown as Record<string, unknown>)[field] as string[] | undefined) ?? []
    const hit = paths.find((candidate) => condition.globs.some((glob) => Wildcard.match(candidate, glob)))
    if (!hit) return { inject: false, reasons: [] }
    reasons.push(`${condition.key}=${hit}`)
  }

  for (const condition of guard.enumeration) {
    const field = ENUM_SIGNALS[condition.key as keyof typeof ENUM_SIGNALS]
    const actual = (state as unknown as Record<string, string | undefined>)[field]
    if (!actual || !condition.values.includes(actual)) return { inject: false, reasons: [] }
    reasons.push(`${condition.key}=${actual}`)
  }

  return { inject: true, reasons }
}

function rank(guard: CompiledGuard): number {
  const positions = [...guard.numeric, ...guard.boolean, ...guard.list, ...guard.enumeration]
    .map((condition) => PRIORITY.indexOf(condition.key))
    .filter((index) => index >= 0)
  return positions.length === 0 ? PRIORITY.length : Math.min(...positions)
}

/**
 * Sélectionne les gardes à injecter dans un step : priorité d'abord, puis plafonds de nombre et de
 * caractères. Sans plafond le dispositif recrée le mur de consignes qu'il est censé corriger.
 */
export function selectGuards(
  guards: CompiledGuard[],
  state: GuardState,
  options?: { max?: number; maxChars?: number },
): { selected: { guard: CompiledGuard; reasons: string[] }[]; skipped: CompiledGuard[] } {
  const max = options?.max ?? 2
  const maxChars = options?.maxChars ?? 600
  const candidates: { guard: CompiledGuard; reasons: string[] }[] = []
  const skipped: CompiledGuard[] = []

  for (const guard of guards) {
    const verdict = shouldInject(guard, state)
    if (verdict.inject) candidates.push({ guard, reasons: verdict.reasons })
    else skipped.push(guard)
  }

  candidates.sort((a, b) => rank(a.guard) - rank(b.guard) || a.guard.name.localeCompare(b.guard.name))

  const selected: { guard: CompiledGuard; reasons: string[] }[] = []
  let chars = 0
  for (const candidate of candidates) {
    const size = candidate.guard.body.length
    if (selected.length >= max || chars + size > maxChars) {
      skipped.push(candidate.guard)
      continue
    }
    selected.push(candidate)
    chars += size
  }
  return { selected, skipped }
}
