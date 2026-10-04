// Proactive view of what the model already holds.
//
// The read tool answers a repeated read with an `<unchanged>` stub, but that
// saving lands only *after* the model has spent a turn asking. This capsule
// moves the same knowledge forward: it lists the file ranges still present in
// the context, so a read can be skipped instead of discovered unnecessary.
// Bounded on purpose — an unbounded list would cost more context than the
// reads it prevents.

import { ReadLedger } from "@/tool/read-ledger"

const MAX_ENTRIES = 40
const MAX_CHARS = 1_600
const PATH_MAX = 120

function clip(value: string, max: number) {
  return value.length > max ? `…${value.slice(-(max - 1))}` : value
}

/**
 * Renders the session's read holdings as a bounded prompt capsule, or
 * `undefined` when nothing is held yet.
 */
export function contextHoldingsCapsule(sessionID: string): string | undefined {
  const held = ReadLedger.holdings(sessionID, MAX_ENTRIES)
  if (held.length === 0) return undefined

  const lines: string[] = []
  let used = 0
  for (const holding of held) {
    const line = `- ${clip(holding.filepath, PATH_MAX)} (${holding.range})`
    if (used + line.length + 1 > MAX_CHARS) break
    used += line.length + 1
    lines.push(line)
  }

  return [
    "<context-holdings>",
    "Files whose content is already in your context this session. Reuse it — do not re-read these ranges.",
    ...lines,
    "</context-holdings>",
  ].join("\n")
}
