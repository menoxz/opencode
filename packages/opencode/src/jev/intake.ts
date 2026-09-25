import { JevCompaction } from "./compaction"
import { JevSchema } from "./schema"

/**
 * Extractive intake filter — the write-boundary half of context hygiene.
 *
 * A tool result is the largest thing a step adds to the context. Some of it is
 * load-bearing and some is noise, and the bytes are what carries the meaning: a
 * rewrite can alter a path, a number or an error string, so this module never
 * rewrites. It splits the result into numbered blocks, asks Jev one typed
 * question per *unprotected* block ("is this load-bearing?"), and the caller
 * deletes exactly the blocks Jev refuted. Everything kept is carried through
 * verbatim, so the model reads the original bytes and a deletion is auditable.
 *
 * Two guarantees make the deletion safe. First, anchor blocks are never asked
 * about and never dropped: a block that contains a path, a command, an
 * identifier or an error string is protected deterministically, so a wrong Jev
 * answer can never delete load-bearing bytes. Second, an absent or unreadable
 * answer is not a "no": only an explicit refutation prunes, so the default is
 * always to keep. Both are what let the caller trust a model to cut context.
 */

/** Maximum blocks a single result is split into and asked about. */
export const MAX_BLOCKS = 12

/** Results shorter than this are never filtered and cost no round-trip. */
export const MIN_CHARS = 1_200

/** Probability at or above which a block counts as load-bearing and is kept. */
export const DEFAULT_THRESHOLD = 0.5

/** Characters of a block quoted to Jev, so one question stays cheap. */
export const MAX_BLOCK_CHARS = 600

export type Block = {
  readonly id: string
  /** Half-open line range `[start, end)` this block covers. */
  readonly start: number
  readonly end: number
  /** Bounded excerpt quoted to Jev; the caller cuts from the original lines. */
  readonly text: string
  /** A block carrying an anchor is never asked about and never dropped. */
  readonly protected: boolean
}

export type Decision = {
  /** Blocks Jev explicitly refuted; the only ones the caller may drop. */
  readonly pruned: readonly Block[]
  /** Blocks kept: affirmed, unanswered, or protected. */
  readonly kept: readonly Block[]
  /** How many blocks were kept because they carry an anchor. */
  readonly protectedKept: number
}

/** Deterministic anchor test, reusing the compaction extractor so they agree. */
function hasAnchor(text: string): boolean {
  return JevCompaction.candidatesFromText(text, 1).length > 0
}

/** Deterministic split into at most `max` contiguous line blocks, covering every line. */
export function blocksFromText(text: string, max = MAX_BLOCKS): Block[] {
  const lines = text.split("\n")
  const size = Math.max(1, Math.ceil(lines.length / Math.max(1, max)))
  const blocks: Block[] = []
  for (let start = 0; start < lines.length; start += size) {
    const end = Math.min(lines.length, start + size)
    const body = lines.slice(start, end).join("\n")
    blocks.push({
      id: `b${blocks.length + 1}`,
      start,
      end,
      text: body.slice(0, MAX_BLOCK_CHARS),
      protected: hasAnchor(body),
    })
  }
  return blocks
}

/**
 * One `noul` per unprotected block. Protected blocks carry an anchor and are
 * kept without a question, so they cost nothing and can never be pruned.
 */
export function intakeQuestions(blocks: readonly Block[]): Record<string, JevSchema.Question> {
  return Object.fromEntries(
    blocks
      .filter((block) => !block.protected)
      .map((block) => [
        block.id,
        {
          type: "noul" as const,
          instructions: `A tool result was split into numbered blocks before entering a coding agent's context. Is block ${block.id} load-bearing — does the next step depend on reading it (a value to act on, a failure to explain, context needed to interpret the rest)? Say yes to keep it. Say no only for boilerplate, repetition, progress noise or decoration that can be dropped without losing information.\n\nBLOCK ${block.id}:\n${block.text}`,
          criteria: {
            true: "The block carries information the task still needs; keep it, verbatim",
            false: "The block is boilerplate, redundant or noise; safe to drop verbatim",
          },
        },
      ]),
  )
}

/**
 * Only an explicit refutation prunes. An absent answer is unknown, not a "no",
 * and a protected block is kept regardless of what Jev said about its id.
 */
export function decide(
  blocks: readonly Block[],
  answers: Record<string, JevSchema.Answer>,
  threshold = DEFAULT_THRESHOLD,
): Decision {
  const pruned: Block[] = []
  const kept: Block[] = []
  let protectedKept = 0
  for (const block of blocks) {
    if (block.protected) {
      kept.push(block)
      protectedKept += 1
      continue
    }
    if (JevCompaction.refuted(answers[block.id], threshold)) pruned.push(block)
    else kept.push(block)
  }
  return { pruned, kept, protectedKept }
}

/** Terse marker left where a block was removed; the raw stays in the ledger. */
export function prunedMarker(lines: number): string {
  return `[intake: pruned ${lines}L; raw in ledger]`
}

/** Splices the original lines, replacing only the pruned ranges with a marker. */
export function apply(text: string, blocks: readonly Block[], decision: Decision): string {
  if (decision.pruned.length === 0 || decision.kept.length === 0) return text
  const dropped = new Set(decision.pruned.map((block) => block.id))
  const lines = text.split("\n")
  const out: string[] = []
  let cursor = 0
  for (const block of blocks) {
    if (!dropped.has(block.id)) continue
    out.push(...lines.slice(cursor, block.start))
    out.push(prunedMarker(block.end - block.start))
    cursor = block.end
  }
  out.push(...lines.slice(cursor))
  const filtered = out.join("\n")
  // Never inflate: a marker must not cost more than the lines it replaces.
  return filtered.length < text.length ? filtered : text
}

/** One line of accounting attached to the tool result. */
export function render(decision: Decision, total: number): string {
  return `[jev intake] kept ${decision.kept.length}/${total} block(s), pruned ${decision.pruned.length} (${decision.protectedKept} anchored, protected)`
}

export * as JevIntake from "./intake"
