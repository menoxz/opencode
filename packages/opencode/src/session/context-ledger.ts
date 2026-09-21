/**
 * Context allocation ledger.
 *
 * Measured problem: a long session re-observes what it already holds. The same
 * `git status`, the same directory listing, the same page, again — and every
 * repeat pushes a second copy of bytes the context already contains.
 *
 * Two deterministic brakes already exist and this module does not replace them.
 * `ToolRepetition` refuses a call *proven* unproductive (three identical
 * failures, or three identical outputs), and `ReadLedger` answers a re-read of
 * the same file range from its own persisted ledger. Neither covers the case
 * this ledger exists for: a *different* call that returns the *same*
 * information — `git status` after `git status --short`, a directory listed
 * again after a failed edit, a page fetched twice from two code paths.
 *
 * The ledger allocates one slot per observation target — a file, a URL, a
 * command, a query — and keeps that slot canonical. Instead of pushing a
 * second copy of an unchanged target into the context, the harness answers the
 * call from the slot with a presence notice; when the target is genuinely
 * re-observed, the slot is refreshed in place, so one bounded line of memory
 * per target replaces an unbounded series of copies. That projection is what
 * `capsule()` renders for the prompt.
 *
 * Freshness is decided deterministically, never guessed. Every call classified
 * as mutating advances a session epoch, and an observation stays valid only
 * while the epoch has not moved and its time-to-live has not expired. The
 * classification is deliberately conservative: anything not on the read-only
 * allowlist counts as mutating. A false "mutating" only costs a missed
 * optimisation, while a false "read-only" would suppress a call that was
 * needed — so composition, redirection and command substitution all disqualify
 * a command from the read-only allowlist.
 *
 * State is module-level and session-keyed rather than an Effect service, for
 * the same reason as `ToolRepetition`: the gate must be active on every tool
 * call path with no layer wiring to forget.
 */

export type Truth = "observed" | "inferred" | "unknown" | "error"

/** Half-open line range `[start, end)` of a file already present in context. */
export type Coverage = { readonly start: number; readonly end: number }

export type Slot = {
  /** Stable identity of the observation target within its tool family. */
  readonly key: string
  readonly tool: string
  readonly target: string
  /** Tool-call ordinal this target was last observed at. */
  readonly step: number
  readonly at: number
  readonly truth: Truth
  readonly summary: string
  /** World epoch the observation belongs to; any mutating call advances it. */
  readonly epoch: number
  readonly coverage: readonly Coverage[]
  /** How many times this target has been observed in this session. */
  readonly calls: number
  /** Set when a compaction may have summarized the observation out of context. */
  readonly elided: boolean
}

export type CallClass = {
  /** True only when the call provably cannot mutate the observable world. */
  readonly readOnly: boolean
  /** Whether the call advances the epoch; the conservative default is yes. */
  readonly mutating: boolean
  readonly target: string
}

export type Presence = {
  readonly slot: Slot
  readonly notice: string
}

export type ObservedCall = {
  readonly tool: string
  readonly args: unknown
}

export type Observation = ObservedCall & {
  readonly step: number
  readonly at: number
  readonly truth: Truth
  readonly output: string
}

/** Retained slots per session; a long session must not grow one map without bound. */
export const MAX_SLOTS = 120

/** Sessions retained before the oldest ledger is evicted. */
export const MAX_SESSIONS = 200

/**
 * Upper bound on how long an unrefreshed observation may answer a call. The
 * epoch already proves that *this agent* changed nothing; the TTL bounds the
 * changes it cannot see (the user's editor, a remote page, a background job).
 */
export const DEFAULT_TTL_MS = 120_000

/** Summary length carried by a slot and quoted in a presence notice. */
const MAX_SUMMARY_CHARS = 240

const MAX_CAPSULE_CHARS = 1_600
const MAX_CAPSULE_TARGETS = 14

/**
 * Tools whose output is a pure function of the observed world, so an unchanged
 * world makes a repeat provably redundant. Everything outside this set is
 * treated as mutating.
 */
const READ_ONLY_TOOLS = new Set(["glob", "grep", "list", "webfetch", "websearch"])

/**
 * Read-only tools that are never answered from a slot: `read` has its own
 * persisted ledger with digest-level proofs, and a batch inspection is a
 * composed request whose value is in running it.
 */
const EXEMPT_TOOLS = new Set(["read", "inspect_batch"])

/**
 * Tools that neither change the observed world nor may be suppressed. Keying
 * the epoch on the mutating set only, instead of on "not read-only", keeps
 * bookkeeping calls from invalidating every slot in a lean session.
 */
const NEUTRAL_TOOLS = new Set([
  "tool_search",
  "environment",
  "question",
  "todowrite",
  "skill",
  "skill_search",
  "session_info",
  "session_context",
  "repo_overview",
])

const NEUTRAL_PREFIXES = ["llm-memory-tool_"] as const

/** Single simple commands whose output observes the world without changing it. */
const READ_COMMANDS = new Set([
  "ls",
  "dir",
  "cat",
  "type",
  "head",
  "tail",
  "wc",
  "find",
  "rg",
  "grep",
  "select-string",
  "test-path",
  "pwd",
  "get-location",
  "get-childitem",
  "gci",
  "get-content",
  "get-item",
  "get-filehash",
  "get-date",
  "stat",
  "du",
  "df",
  "tree",
  "where",
  "where.exe",
  "which",
  "whoami",
  "hostname",
  "echo",
  "git",
  "rg.exe",
])

/**
 * Commands that execute arbitrary code. Their name alone proves nothing — `bun
 * --version` observes, `bun add` installs — so only a version, help or explicit
 * `--noEmit` form counts as read-only, and every other form counts as mutating.
 */
const CODE_RUNNERS = new Set(["bun", "node", "npm", "pnpm", "yarn", "npx", "python", "python3", "deno", "tsgo", "tsc"])

const VERSION_FLAGS = new Set(["--version", "-v", "--help", "-h"])

const TYPE_CHECKERS = new Set(["tsgo", "tsc"])

/** `git` subcommands that only read history or the working tree. */
const GIT_READ_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "rev-parse",
  "describe",
  "ls-files",
  "blame",
  "shortlog",
  "config",
  "remote",
  "worktree",
  "stash",
  "tag",
  "reflog",
  "cat-file",
  "ls-tree",
  "count-objects",
  "status",
])

const TARGETS: Record<string, (args: Record<string, unknown>) => string | undefined> = {
  read: (args) => text(args.filePath) ?? text(args.path),
  glob: (args) => join(text(args.pattern), text(args.path)),
  grep: (args) => join(text(args.pattern), text(args.path), text(args.include)),
  list: (args) => text(args.path) ?? ".",
  webfetch: (args) => text(args.url),
  websearch: (args) => text(args.query),
  bash: (args) => text(args.command),
  shell: (args) => text(args.command),
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function join(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => part !== undefined)
  return kept.length > 0 ? kept.join(" \u0001 ") : undefined
}

function recordOf(args: unknown): Record<string, unknown> {
  return args !== null && typeof args === "object" ? (args as Record<string, unknown>) : {}
}

/**
 * A command is read-only only when it is one simple command with no
 * composition, redirection or substitution: `git status | tee out` and
 * `ls > files.txt` both write, and `$(...)` can hide anything. The default is
 * therefore "not read-only", and a white-listed first token is required to
 * leave it.
 */
export function commandReadOnly(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false
  if (/[|;&`$><\n\r]/.test(trimmed)) return false
  const tokens = trimmed.split(/\s+/)
  const first = (tokens[0] ?? "").replace(/\.exe$/i, "").replace(/^.*[\\/]/, "").toLowerCase()
  if (CODE_RUNNERS.has(first)) {
    const rest = tokens.slice(1).map((token) => token.toLowerCase())
    if (rest.length === 0) return false
    if (rest.every((token) => VERSION_FLAGS.has(token))) return true
    return TYPE_CHECKERS.has(first) && rest.includes("--noemit")
  }
  if (!READ_COMMANDS.has(first)) return false
  if (first !== "git") return true
  return GIT_READ_SUBCOMMANDS.has((tokens[1] ?? "").toLowerCase())
}

/** Read-only, mutating or neutral, plus the target a slot would be allocated to. */
export function classify(tool: string, args: unknown): CallClass {
  const record = recordOf(args)
  const target = TARGETS[tool]?.(record) ?? tool
  if (tool === "bash" || tool === "shell")
    return { readOnly: commandReadOnly(String(record.command ?? "")), mutating: !commandReadOnly(String(record.command ?? "")), target }
  if (EXEMPT_TOOLS.has(tool)) return { readOnly: true, mutating: false, target }
  if (READ_ONLY_TOOLS.has(tool)) return { readOnly: true, mutating: false, target }
  if (NEUTRAL_TOOLS.has(tool) || NEUTRAL_PREFIXES.some((prefix) => tool.startsWith(prefix)))
    return { readOnly: true, mutating: false, target }
  return { readOnly: false, mutating: true, target }
}

/** True when the tool may be answered from a slot instead of being executed. */
export function suppressible(tool: string): boolean {
  return READ_ONLY_TOOLS.has(tool) || tool === "bash" || tool === "shell"
}

export function keyOf(tool: string, target: string): string {
  return `${tool}\u0000${target}`
}

/** Collapses the output to one bounded line, so a slot stays cheap to carry. */
export function summarize(output: string): string {
  const flat = output.replace(/\s+/g, " ").trim()
  return flat.length > MAX_SUMMARY_CHARS ? `${flat.slice(0, MAX_SUMMARY_CHARS)}…` : flat
}

/**
 * Coverage recorded by a range read. `read` numbers lines from 1 and defaults
 * to a 2000-line window, so an absent offset or limit has to be resolved here
 * for the union to mean anything.
 */
export function coverageOf(tool: string, args: unknown): Coverage[] {
  if (tool !== "read") return []
  const record = recordOf(args)
  const offset = Number.isFinite(Number(record.offset)) ? Math.max(1, Math.trunc(Number(record.offset))) : 1
  const limit = Number.isFinite(Number(record.limit)) ? Math.max(1, Math.trunc(Number(record.limit))) : 2_000
  return [{ start: offset, end: offset + limit }]
}

/** Union of overlapping or adjacent ranges, so a slot never carries duplicates. */
export function mergeCoverage(ranges: readonly Coverage[]): Coverage[] {
  const sorted = [...ranges].toSorted((left, right) => left.start - right.start || left.end - right.end)
  const merged: Coverage[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      if (range.end > last.end) merged[merged.length - 1] = { start: last.start, end: range.end }
      continue
    }
    merged.push({ start: range.start, end: range.end })
  }
  return merged
}

class Ledger {
  #slots = new Map<string, Slot>()
  #epoch = 0
  #step = 0

  epoch() {
    return this.#epoch
  }

  /** Advances the call ordinal, and the world epoch when the call can mutate. */
  note(input: ObservedCall): number {
    this.#step += 1
    if (classify(input.tool, input.args).mutating) this.#epoch += 1
    return this.#step
  }

  /**
   * Answers from a slot when the observation is provably still valid: the same
   * target, the same epoch, within its time-to-live, and a call that cannot
   * mutate. A compaction invalidates every slot outright, because the notice
   * promises the observation is still in the window and only the harness can
   * know whether it survived summarization.
   */
  presence(input: ObservedCall, now: number, ttlMs: number): Presence | undefined {
    if (!suppressible(input.tool)) return undefined
    const shape = classify(input.tool, input.args)
    if (!shape.readOnly) return undefined
    const slot = this.#slots.get(keyOf(input.tool, shape.target))
    if (!slot || slot.elided) return undefined
    if (slot.epoch !== this.#epoch) return undefined
    if (now - slot.at > ttlMs) return undefined
    const freshness = slot.calls > 1 ? `unchanged since step ${slot.step} (no mutation since)` : `observed at step ${slot.step}`
    const notice = [
      `[present] ${input.tool} ${slot.target} — ${freshness}.`,
      slot.summary ? `Already in your context: ${slot.summary}` : "Its result is already in your context.",
      "Reuse it; repeat the call only if you know the world changed (a file edited outside this session, a page that moved on).",
    ].join(" ")
    return { slot, notice }
  }

  /** Refreshes the slot in place: one canonical entry per target, never a copy. */
  observe(input: Observation) {
    const shape = classify(input.tool, input.args)
    const key = keyOf(input.tool, shape.target)
    const existing = this.#slots.get(key)
    const slot: Slot = {
      key,
      tool: input.tool,
      target: shape.target,
      step: input.step,
      at: input.at,
      truth: input.truth,
      summary: summarize(input.output),
      epoch: this.#epoch,
      coverage: mergeCoverage([...(existing?.coverage ?? []), ...coverageOf(input.tool, input.args)]),
      calls: (existing?.calls ?? 0) + 1,
      elided: false,
    }
    // Refresh recency: re-inserting moves the target to the end of the Map order.
    if (existing) this.#slots.delete(key)
    this.#slots.set(key, slot)
    while (this.#slots.size > MAX_SLOTS) {
      const oldest = this.#slots.keys().next()
      if (oldest.done) break
      this.#slots.delete(oldest.value)
    }
    return slot
  }

  /** A compaction may have dropped an observation the notice still promised. */
  invalidate() {
    for (const [key, slot] of this.#slots) this.#slots.set(key, { ...slot, elided: true })
    this.#epoch += 1
  }

  slots(): Slot[] {
    return [...this.#slots.values()]
  }

  reset() {
    this.#slots.clear()
    this.#epoch = 0
    this.#step = 0
  }
}

const ledgers = new Map<string, Ledger>()

export function ledgerFor(sessionID: string): Ledger {
  const existing = ledgers.get(sessionID)
  if (existing) return existing
  if (ledgers.size >= MAX_SESSIONS) {
    const oldest = ledgers.keys().next()
    if (!oldest.done) ledgers.delete(oldest.value)
  }
  const created = new Ledger()
  ledgers.set(sessionID, created)
  return created
}

export function note(sessionID: string, input: ObservedCall): number {
  return ledgerFor(sessionID).note(input)
}

export function presenceFor(
  sessionID: string,
  input: ObservedCall,
  options: { now?: number; ttlMs?: number } = {},
): Presence | undefined {
  return ledgerFor(sessionID).presence(input, options.now ?? Date.now(), options.ttlMs ?? DEFAULT_TTL_MS)
}

export function observe(sessionID: string, input: Observation): Slot {
  return ledgerFor(sessionID).observe(input)
}

export function slots(sessionID: string): readonly Slot[] {
  return ledgerFor(sessionID).slots()
}

/** Called when a compaction runs: a summarized observation must not answer a call. */
export function invalidate(sessionID: string) {
  ledgerFor(sessionID).invalidate()
}

export function reset(sessionID?: string) {
  if (sessionID === undefined) ledgers.clear()
  else ledgers.delete(sessionID)
}

/** `1-200,303-352` — a compact view of which lines of a file are already held. */
export function renderCoverage(coverage: readonly Coverage[]): string {
  return coverage.map((range) => `${range.start}-${range.end - 1}`).join(",")
}

export type Capsule = {
  readonly text: string
  readonly current: number
  readonly superseded: number
}

/**
 * The allocation view injected into the prompt: one canonical line per target,
 * so the model reads a single current version instead of trusting scattered
 * historical copies. Superseded targets are named, never quoted, because the
 * exact repair is a re-read the model still has to make.
 */
export function buildCapsule(ledger: Ledger, options: { maxChars?: number; maxTargets?: number } = {}): Capsule {
  const all = ledger.slots()
  if (all.length === 0) return { text: "", current: 0, superseded: 0 }
  const epoch = ledger.epoch()
  const current = all.filter((slot) => !slot.elided && slot.epoch === epoch).slice(-(options.maxTargets ?? MAX_CAPSULE_TARGETS))
  const superseded = all.filter((slot) => slot.elided || slot.epoch !== epoch)
  if (current.length === 0 && superseded.length === 0) return { text: "", current: 0, superseded: 0 }
  const lines = ["<context_slots>"]
  if (current.length > 0) {
    lines.push(
      `${current.length} allocated target(s) — each line is the canonical version already in your context. Reuse it instead of calling again:`,
    )
    for (const slot of current) {
      const range = slot.coverage.length > 0 ? ` lines ${renderCoverage(slot.coverage)}` : ""
      const repeated = slot.calls > 1 ? `, observed ${slot.calls}x` : ""
      lines.push(`- ${slot.tool} ${slot.target}${range} — held since step ${slot.step}${repeated}`)
    }
  }
  if (superseded.length > 0) {
    const names = superseded
      .slice(-6)
      .map((slot) => `${slot.tool} ${slot.target}`)
      .join("; ")
    lines.push(`Superseded (changed or summarized away since they were read) — re-read before relying on them: ${names}`)
  }
  lines.push("</context_slots>")
  const maxChars = options.maxChars ?? MAX_CAPSULE_CHARS
  const text = lines.join("\n")
  return { text: text.length > maxChars ? `${text.slice(0, maxChars - 12)}\n…\n</context_slots>` : text, current: current.length, superseded: superseded.length }
}

export function capsule(sessionID: string, options: { maxChars?: number; maxTargets?: number } = {}): Capsule {
  return buildCapsule(ledgerFor(sessionID), options)
}

/** Injection-ready form, symmetric with `progressCapsule`. */
export function contextCapsule(sessionID: string, options: { maxChars?: number; maxTargets?: number } = {}): string {
  return capsule(sessionID, options).text
}

/** The slot for this exact target, valid or not; `undefined` when never observed. */
export function slotFor(sessionID: string, input: ObservedCall): Slot | undefined {
  const shape = classify(input.tool, input.args)
  const key = keyOf(input.tool, shape.target)
  return ledgerFor(sessionID).slots().find((slot) => slot.key === key)
}

/**
 * Slots that could already hold what this call would fetch: the same tool on
 * another target, or another tool on the same target. This is the cheap trigger
 * for the Jev relevance judge — the near repeat the deterministic gate cannot
 * settle from bytes alone, and the only case worth a round-trip.
 */
export function related(sessionID: string, input: ObservedCall): Slot[] {
  const shape = classify(input.tool, input.args)
  const key = keyOf(input.tool, shape.target)
  return ledgerFor(sessionID)
    .slots()
    .filter((slot) => slot.key !== key && (slot.tool === input.tool || slot.target === shape.target))
}

/** Bounded projection of the allocation, as the relevance judge's state. */
export function surface(sessionID: string, max = 20): { tool: string; target: string; step: number; summary: string }[] {
  return ledgerFor(sessionID)
    .slots()
    .slice(-max)
    .map((slot) => ({ tool: slot.tool, target: slot.target, step: slot.step, summary: slot.summary }))
}

/** The notice returned when Jev confirms a read-only call repeats what is held. */
export function redundantNotice(slot: Slot, reason: string): string {
  return [
    `[present] ${slot.tool} ${slot.target} was observed at step ${slot.step} and is still in your context.`,
    slot.summary ? `Already held: ${slot.summary}` : "",
    `${reason}.`,
    "Reuse that observation instead of calling again; repeat the call if you know the world changed.",
  ]
    .filter(Boolean)
    .join(" ")
}

export * as ContextLedger from "./context-ledger"
