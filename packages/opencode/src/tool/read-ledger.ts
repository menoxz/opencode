/**
 * Per-session ledger of what the model has already been shown by `read`.
 *
 * Measured problem (see AUDIT-opencodev2.md, D4): of 15 816 `read` calls,
 * 11 153 (71 %) were re-reads of a (session, file) pair already read, pushing
 * 91.2 MB of file bytes back into contexts that already contained them.
 * `dashboard_page.dart` alone was re-read 793 times for 5.5 MB of pure waste.
 *
 * The existing tool cache (tool/cache.ts) saves the *disk read* but still
 * returns the full payload, so it saves no tokens at all — and tokens are the
 * entire cost. This ledger closes that gap: when a re-read would produce bytes
 * the model has already received in this session, it returns a short stub
 * instead of the file.
 *
 * Correctness comes first: the stub is emitted only when the content is proven
 * identical, either because `(mtime, size)` are unchanged since the last read,
 * or because the freshly rendered output digests to the same value. Any real
 * change — including a change that preserves size — produces the full output.
 *
 * State is a module-level session-keyed map for the same reason as
 * tool/repetition.ts: the saving must apply on every read path with no layer
 * wiring to forget.
 */

/** Sessions retained before the oldest ledger is evicted. */
export const MAX_SESSIONS = 64

/** Distinct read keys retained per session. */
export const MAX_ENTRIES = 512

export type Seen = {
  digest: string
  mtime: number
  size: number
  /** Human-readable range description reused in the stub, e.g. "lines 303-352 of 1200". */
  range: string
}

type Ledger = Map<string, Seen>

const sessions = new Map<string, Ledger>()

export function key(filepath: string, offset: number, limit: number): string {
  return `${filepath}\u0000${offset}\u0000${limit}`
}

/** Cheap, allocation-light digest of rendered read output. */
export function digest(output: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < output.length; i++) {
    const c = output.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 + c, 0x85ebca6b) ^ (h2 >>> 13)
  }
  return `${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${output.length}`
}

function ledger(sessionID: string): Ledger {
  const hit = sessions.get(sessionID)
  if (hit) return hit
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next()
    if (!oldest.done) sessions.delete(oldest.value)
  }
  const next: Ledger = new Map()
  sessions.set(sessionID, next)
  return next
}

export function get(sessionID: string, entryKey: string): Seen | undefined {
  return sessions.get(sessionID)?.get(entryKey)
}

export function put(sessionID: string, entryKey: string, seen: Seen): void {
  const book = ledger(sessionID)
  book.delete(entryKey)
  book.set(entryKey, seen)
  while (book.size > MAX_ENTRIES) {
    const oldest = book.keys().next()
    if (oldest.done) break
    book.delete(oldest.value)
  }
}

/**
 * True when `(mtime, size)` prove the file cannot have changed since `seen`, so
 * the re-read can be answered without touching the disk at all.
 */
export function provenUnchanged(seen: Seen, mtime: number, size: number): boolean {
  // mtime 0 means the platform gave us no timestamp — never claim proof from it.
  return seen.mtime !== 0 && mtime !== 0 && seen.mtime === mtime && seen.size === size
}

/** The stub returned in place of bytes the model already holds. */
export function stub(filepath: string, seen: Seen): string {
  return [
    `<path>${filepath}</path>`,
    `<type>file</type>`,
    `<unchanged>`,
    `This file is byte-for-byte unchanged since you read it earlier in this session (${seen.range}).`,
    `Its content is already in your context above — scroll back and use it.`,
    `The bytes are deliberately not repeated here: re-sending an unchanged file is the single largest source of wasted context in this harness.`,
    `If you believe it changed, it did not: this check compares the file's modification time, size and a digest of its content.`,
    `If you genuinely cannot see it any more, re-read the exact range you need with offset and limit — do not fetch the whole file again through the shell.`,
    `</unchanged>`,
  ].join("\n")
}

/** Test/maintenance hook: drop a session's ledger (or all of them). */
export function reset(sessionID?: string): void {
  if (sessionID === undefined) sessions.clear()
  else sessions.delete(sessionID)
}

export * as ReadLedger from "./read-ledger"
