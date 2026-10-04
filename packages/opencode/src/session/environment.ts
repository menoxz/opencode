// Environment observation ledger for computer-use style tasks.
//
// A weak model cannot reliably remember what it observed, when, on which
// target, or whether its last action actually happened. Raw MCP output (text,
// screenshots, transport errors) is not enough: the harness must keep a
// normalized, bounded record and answer "where are we, what is fresh, what is
// still unknown" instead of asking the model to reconstruct it every step.
//
// Nothing here calls a model. Observations are recorded by the tool layer and
// read back as a compact capsule, so the reasoning stays with the model while
// the bookkeeping stays with the harness.

import { adapterFor, isEnvironmentCall, scopeKeysFor, type AdapterKind } from "./adapters"

export type EnvironmentTruth = "observed" | "inferred" | "unknown" | "error"

export interface EnvironmentSource {
  readonly kind: "mcp" | "model" | "system"
  readonly name: string
}

export interface EnvironmentObservation {
  readonly id: string
  readonly scope: string
  readonly source: EnvironmentSource
  readonly summary: string
  readonly detail: Readonly<Record<string, string>>
  readonly truth: EnvironmentTruth
  readonly at: number
  readonly revision: number
  readonly attachmentCount: number
  // Non-environment MCP calls are still recorded, but excluded from the prompt
  // capsule so a memory or search result never masquerades as screen state.
  readonly relevant: boolean
  readonly adapter: AdapterKind
  readonly action?: string
  // Set when a newer observation of the same scope replaces this one. An
  // anchor that points here is stale and must not be used to act.
  supersededBy?: string
}

export interface EnvironmentObservationInput {
  scope?: string
  source: EnvironmentSource
  summary: string
  detail?: Record<string, string>
  truth: EnvironmentTruth
  at?: number
  attachmentCount?: number
  relevant?: boolean
  adapter?: AdapterKind
  action?: string
}

export interface CapsuleOptions {
  now?: number
  freshMs?: number
  maxScopes?: number
  maxChars?: number
}

export const DEFAULT_SCOPE = "environment"
export const DEFAULT_FRESH_MS = 120_000
const DEFAULT_MAX_SCOPES = 6
const DEFAULT_MAX_CHARS = 1_800
const SUMMARY_MAX = 200
const DETAIL_MAX = 160
const SCOPE_MAX = 80
const MAX_SESSIONS = 200
const MAX_OBSERVATIONS = 500

function clip(value: string, max = SUMMARY_MAX) {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function normalizeScope(scope: string | undefined): string {
  const value = scope?.trim()
  return value ? clip(value, SCOPE_MAX) : DEFAULT_SCOPE
}

/** Scope of an MCP call, preferring an explicit target given to the tool. */
export function inferScope(args: unknown, fallback: string): string {
  if (args && typeof args === "object") {
    const record = args as Record<string, unknown>
    for (const key of scopeKeysFor(fallback)) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return normalizeScope(value)
    }
  }
  return normalizeScope(fallback)
}

/** A clean tool failure is a definite error; an empty result is unknown. */
export function interpretMcpOutcome(result: { isError?: boolean }): EnvironmentTruth {
  return result.isError === true ? "error" : "observed"
}

function contentItems(result: { content?: readonly unknown[] }) {
  return Array.isArray(result.content) ? result.content : []
}

/** One-line summary of an MCP result, from its text parts when present. */
export function summarizeMcpResult(result: { isError?: boolean; content?: readonly unknown[] }) {
  const texts = contentItems(result).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    return record.type === "text" && typeof record.text === "string" ? [record.text] : []
  })
  const images = contentItems(result).filter((item) => {
    if (!item || typeof item !== "object") return false
    return (item as Record<string, unknown>).type === "image"
  }).length
  const joined = texts.join(" ").replace(/\s+/g, " ").trim()
  const body = joined || (images > 0 ? `returned ${images} image(s)` : "tool returned no textual content")
  return result.isError === true ? `error: ${body}` : body
}

/** True when a tool call drives or reads a visible environment (Lot 3 adapters). */
export function isEnvironmentTool(name: string, args: unknown): boolean {
  return isEnvironmentCall(name, args)
}

export function recordToolResult(
  ledger: EnvironmentLedger,
  input: {
    name: string
    args: unknown
    at: number
    relevant: boolean
    attachmentCount: number
    result: { isError?: boolean; content?: readonly unknown[] }
  },
): EnvironmentObservation {
  return ledger.record({
    scope: inferScope(input.args, input.name),
    source: { kind: "mcp", name: input.name },
    summary: summarizeMcpResult(input.result),
    truth: interpretMcpOutcome(input.result),
    at: input.at,
    attachmentCount: input.attachmentCount,
    relevant: input.relevant,
    adapter: adapterFor(input.name).kind,
    action: input.name,
  })
}

/** A thrown/disconnected MCP call: the action may or may not have happened. */
export function recordUnknownOutcome(
  ledger: EnvironmentLedger,
  input: { name: string; args: unknown; at: number; relevant: boolean; cause: string },
): EnvironmentObservation {
  return ledger.record({
    scope: inferScope(input.args, input.name),
    source: { kind: "mcp", name: input.name },
    summary: `outcome unknown after tool error: ${input.cause}`,
    truth: "unknown",
    at: input.at,
    relevant: input.relevant,
    adapter: adapterFor(input.name).kind,
    action: input.name,
  })
}

export function formatAge(ms: number): string {
  if (ms < 1_000) return "now"
  const seconds = Math.round(ms / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.round(minutes / 60)}h`
}

export class EnvironmentLedger {
  #counter = 0
  #observations: EnvironmentObservation[] = []

  record(input: EnvironmentObservationInput): EnvironmentObservation {
    const scope = normalizeScope(input.scope)
    const revision = this.#observations.filter((item) => item.scope === scope).length + 1
    const observation: EnvironmentObservation = {
      id: `obs-${++this.#counter}`,
      scope,
      source: input.source,
      summary: clip(input.summary),
      detail: Object.fromEntries(
        Object.entries(input.detail ?? {}).map(([key, value]) => [clip(key, SCOPE_MAX), clip(value, DETAIL_MAX)]),
      ),
      truth: input.truth,
      at: input.at ?? Date.now(),
      revision,
      attachmentCount: input.attachmentCount ?? 0,
      relevant: input.relevant ?? true,
      adapter: input.adapter ?? "generic",
      action: input.action,
    }
    // A newer observation of the same scope supersedes the previous ones. The
    // model must anchor to the current revision, never to a stale screen.
    for (const previous of this.#observations) {
      if (previous.scope === scope) previous.supersededBy = observation.id
    }
    this.#observations.push(observation)
    this.#trim()
    return observation
  }

  list(): readonly EnvironmentObservation[] {
    return this.#observations
  }

  /** Current (non-superseded) observations, optionally restricted to a scope. */
  current(scope?: string): readonly EnvironmentObservation[] {
    return this.#observations.filter((item) => !item.supersededBy && (scope === undefined || item.scope === scope))
  }

  /** What the prompt capsule shows: environment-relevant state, plus every anomaly. */
  surface(): readonly EnvironmentObservation[] {
    return this.current().filter((item) => item.relevant || item.truth === "error" || item.truth === "unknown")
  }

  // Drop oldest superseded entries once the history grows; never drop a current
  // observation, so anchoring stays valid for the whole session.
  #trim() {
    if (this.#observations.length <= MAX_OBSERVATIONS) return
    this.#observations = this.#observations.filter(
      (item, index) => item.supersededBy === undefined || index >= this.#observations.length - MAX_OBSERVATIONS,
    )
  }

  anchor(id: string): EnvironmentObservation | undefined {
    return this.#observations.find((item) => item.id === id)
  }

  reset() {
    this.#counter = 0
    this.#observations = []
  }
}

const ledgers = new Map<string, EnvironmentLedger>()

export function ledgerFor(sessionID: string): EnvironmentLedger {
  const existing = ledgers.get(sessionID)
  if (existing) return existing
  const created = new EnvironmentLedger()
  ledgers.set(sessionID, created)
  while (ledgers.size > MAX_SESSIONS) {
    const oldest = ledgers.keys().next().value
    if (oldest === undefined) break
    ledgers.delete(oldest)
  }
  return created
}

export function resetEnvironment(sessionID?: string) {
  if (sessionID === undefined) ledgers.clear()
  else ledgers.delete(sessionID)
}

export function buildEnvironmentCapsule(ledger: EnvironmentLedger, options: CapsuleOptions = {}): string {
  const now = options.now ?? Date.now()
  const freshMs = options.freshMs ?? DEFAULT_FRESH_MS
  const maxScopes = options.maxScopes ?? DEFAULT_MAX_SCOPES
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const current = [...ledger.surface()].sort((a, b) => b.at - a.at).slice(0, maxScopes)
  if (current.length === 0) return ""

  const header = [
    "<environment_state>",
    "Normalized observations from your tools. Trust the ids, revision and truth; a superseded or missing scope is unknown.",
  ]
  const body: string[] = []
  let used = header.join("\n").length
  for (const observation of current) {
    const age = now - observation.at
    const origin = observation.source.kind === "mcp" ? `mcp:${observation.source.name}[${observation.adapter}]` : observation.source.kind
    const stale = age > freshMs ? " · STALE" : ""
    const block = [
      `- [${observation.id}] ${observation.scope} · rev ${observation.revision} · ${observation.truth} · ${formatAge(age)}${stale} · ${origin}`,
      `  ${observation.summary}`,
    ]
    const details = Object.entries(observation.detail)
      .slice(0, 4)
      .map(([key, value]) => `${key}=${value}`)
    if (details.length) block.push(`  ${details.join(" | ")}`)
    const cost = block.join("\n").length
    if (used + cost > maxChars) break
    body.push(...block)
    used += cost + 1
  }
  if (body.length === 0) return ""

  const produced = ledger.list()
  const lastAction = [...produced].reverse().find((item) => item.action)
  const tail = lastAction ? [`last action: ${lastAction.action} → ${lastAction.truth} (${lastAction.id})`] : []
  return [...header, ...body, ...tail, "</environment_state>"].join("\n")
}

export function environmentStateEnabled(input: { configFlag?: boolean; agentFlag?: boolean }): boolean {
  return input.agentFlag ?? input.configFlag ?? false
}

export function capsuleFor(sessionID: string, options?: CapsuleOptions): string {
  return buildEnvironmentCapsule(ledgerFor(sessionID), options)
}

export * as Environment from "./environment"
