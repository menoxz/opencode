/**
 * Deterministic pre-filters in front of the JEV hooks.
 *
 * Measured over 400 real sessions (47 579 tool calls): a shell command matching
 * the destructive patterns below is 1.6% of bash calls (220 of 13 405), and a
 * read-like call repeating an already-seen file with different arguments is
 * 13.7% of all calls. Screening only those candidates therefore costs one JEV
 * round-trip on 0.55 calls per session instead of 33.5 for an unfiltered guard
 * and 118.9 for an unfiltered relevance.
 *
 * A pre-filter is a cost control, not a safety boundary. It narrows what the
 * model is asked about; it never authorises anything. The permission layer stays
 * the only place where an action can actually be refused, so a pattern missed
 * here means "the model was not asked", never "the action is safe". Each
 * predicate is a pure named function so a test can target it directly.
 */

const MAX_ARGS_CHARS = 8_000

function truncate(args: string): string {
  return args.length > MAX_ARGS_CHARS ? args.slice(0, MAX_ARGS_CHARS) : args
}

/**
 * `rm` is only dangerous when the same invocation carries both a recursive and
 * a force flag, in either order. Matching the whole flag cluster is more robust
 * than a regex over `rm -rf`, which misses `rm -r -f` and `rm --recursive`.
 */
function rmIsForceRecursive(command: string): boolean {
  for (const match of command.matchAll(/(?:^|[;&|(]\s*|\b)rm\s+((?:-{1,2}[A-Za-z-]+\s+)*)/g)) {
    const letters = (match[1] ?? "").replace(/[^A-Za-z]/g, "")
    if (letters.includes("r") && letters.includes("f")) return true
    if (/recursive/i.test(match[1] ?? "") && /force/i.test(match[1] ?? "")) return true
  }
  return false
}

/** Every predicate is `command -> signal name | undefined`, kept testable alone. */
export const DESTRUCTIVE: readonly ((command: string) => string | undefined)[] = [
  (command) => (rmIsForceRecursive(command) ? "rm-recursive-force" : undefined),
  (command) =>
    /\b(Remove-Item|rd|rmdir|del|erase)\b[^\n]*(?:-Recurse|-Force|\/s|\/q)/i.test(command)
      ? "windows-recursive-delete"
      : undefined,
  (command) => (/\bgit\b[^\n]*\bpush\b[^\n]*(--force(?!-with-lease)|-f\b)/i.test(command) ? "git-force-push" : undefined),
  (command) => (/\bgit\b[^\n]*\breset\b[^\n]*--hard/i.test(command) ? "git-reset-hard" : undefined),
  (command) => (/\bgit\b[^\n]*\bclean\b[^\n]*-[a-z]*f/i.test(command) ? "git-clean-force" : undefined),
  (command) => (/\bgit\b[^\n]*\b(checkout|restore)\b[^\n]*\s\.\s*$/im.test(command) ? "git-discard-working-tree" : undefined),
  (command) => (/\bgit\b[^\n]*\bbranch\b[^\n]*\s-D\b/.test(command) ? "git-force-branch-delete" : undefined),
  (command) => (/\b(DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(command) ? "sql-destructive-ddl" : undefined),
  (command) => (/\bDELETE\s+FROM\b/i.test(command) && !/\bWHERE\b/i.test(command) ? "sql-unbounded-delete" : undefined),
  (command) =>
    /\b(Invoke-WebRequest|iwr|curl|wget)\b[^\n]*\s(-f|--fail)?\s*(-O|--remote-name|--output)\b/i.test(command)
      ? "remote-write-download"
      : undefined,
  (command) => (/\bgit\b[^\n]*\brebase\b[^\n]*(-i|--interactive)\b/i.test(command) ? "git-interactive-rebase" : undefined),
]

/** Tools whose arguments are data, not something that will be executed. */
export function isShell(tool: string): boolean {
  return tool === "bash" || tool === "shell"
}

export type Candidate = {
  /** Whether the call is worth one JEV round-trip. */
  readonly screen: boolean
  /** Why, or the signals that made it worth screening. Empty when not screened. */
  readonly signals: readonly string[]
}

/**
 * Which pre-tool calls deserve a model round-trip. Only executed shell text is
 * considered: the same pattern inside a `write` payload is prose the agent
 * authored, not a command it is about to run.
 */
export function guardCandidate(tool: string, args: string): Candidate {
  if (!isShell(tool)) return { screen: false, signals: [] }
  const command = truncate(args)
  const signals = DESTRUCTIVE.flatMap((predicate) => {
    const signal = predicate(command)
    return signal ? [signal] : []
  })
  return { screen: signals.length > 0, signals }
}

export const READ_LIKE: ReadonlySet<string> = new Set(["read", "glob", "grep", "inspect_batch"])

/**
 * The target a call is about, used to spot a repeat.
 *
 * A shell command is a target too, and it is the one the relevance hook mostly
 * exists for: its contract is a shorter or differently-formatted form of the
 * same command. Excluding shell here silently empties that case, so the command
 * text stands in for the path a file read would name. Mutating tools stay out:
 * the hook never blocks them, so screening them would only cost a round-trip.
 */
export function fileTarget(tool: string, args: string): string | undefined {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(args) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (READ_LIKE.has(tool)) {
    for (const key of ["filePath", "path", "pattern"]) {
      const value = parsed[key]
      if (typeof value === "string" && value.length > 0) return value
    }
    return undefined
  }
  if (isShell(tool)) {
    const command = parsed.command
    return typeof command === "string" && command.length > 0 ? command : undefined
  }
  return undefined
}

export type SeenTarget = { readonly tool: string; readonly target: string }

/** Case and whitespace insensitive, so `Git  status` and `git status` match. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Whether a candidate and an observed target are the same thing reached
 * differently. Exact equality is not enough and would empty the hook: its
 * contract is a shorter or differently-formatted form of the same call, so
 * `git status` is a repeat of an observed `git status --short`. Containment is
 * accepted only on a word or path boundary, so `git` never matches `github-ci`
 * by accident.
 */
export function sameTarget(candidate: string, observed: string): boolean {
  const a = normalize(candidate)
  const b = normalize(observed)
  if (a === b) return true
  const boundary = (longer: string, shorter: string) => {
    const next = longer.charAt(shorter.length)
    return next === "" || next === " " || next === "/" || next === "-" || next === "\\"
  }
  if (b.startsWith(a)) return boundary(b, a)
  if (a.startsWith(b)) return boundary(a, b)
  return false
}

/**
 * Which calls deserve a relevance round-trip. Only a repeat of an already-seen
 * target qualifies: a first read of a target can never be redundant, and asking
 * about it every time is exactly the cost this filter exists to avoid.
 */
export function relevanceCandidate(tool: string, args: string, seen: readonly SeenTarget[]): Candidate {
  const target = fileTarget(tool, args)
  if (target === undefined) return { screen: false, signals: [] }
  const repeat = seen.filter((entry) => entry.tool === tool && sameTarget(target, entry.target))
  if (repeat.length === 0) return { screen: false, signals: [] }
  return { screen: true, signals: [`repeat-target:${repeat.length}`] }
}

export * as JevPrefilter from "./prefilter"