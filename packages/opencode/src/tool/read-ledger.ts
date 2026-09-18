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
 * Three dedup axes:
 *
 *  1. KEY — the same `(filepath, offset, limit)` was already sent. Answered
 *     from the ledger without touching the disk when `(mtime, size)` still
 *     prove the bytes identical, and from the digest of the fresh rendering
 *     otherwise.
 *  2. CONTENT — the rendering digests to bytes already sent under a *different*
 *     key: another path to the same file, or a different limit that renders the
 *     same lines. See `duplicateOf`: at most one withheld copy per digest and
 *     per epoch, so the model always obtains the bytes on the next request and
 *     no withhold loop can form.
 *  3. PRODUCED — the file was written earlier in this session by `write`, `edit`
 *     or `apply_patch`, so its bytes already reached the context as the arguments
 *     the model sent. See `recordProduced`/`takeProduced`: the read is answered
 *     by a stub while `(mtime, size)` still prove the file unchanged, withheld at
 *     most once per produced version and per epoch.
 *
 * Cache safety is why a withheld copy is a *written artifact* and never a
 * rewrite: the stub becomes the tool result once, joins the immutable prefix of
 * the conversation, and is never re-rendered. A transform that rewrote earlier
 * messages would invalidate the provider's cached prefix and re-bill it.
 *
 * State is a module-level session-keyed map for the same reason as
 * tool/repetition.ts: the saving must apply on every read path with no layer
 * wiring to forget. It is snapshotted to the state directory so a restart
 * resumes the saving instead of re-sending bytes the model still holds — the
 * snapshot preserves a saving, it is not what makes the dedup correct.
 *
 * Epoch: a compaction can drop earlier `read` output from the context, so the
 * ledger forgets every entry and increments its epoch (session/compaction.ts
 * calls `reset`). That clear is persisted, so a restart can never resurrect a
 * stub pointing at bytes a compaction removed.
 */
import { Effect, Option, Schema } from "effect"
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"

/** Sessions retained before the oldest ledger is evicted. */
export const MAX_SESSIONS = 64

/** Distinct read keys retained per session. */
export const MAX_ENTRIES = 512

/** Distinct content fingerprints retained per session (the cross-key index). */
export const MAX_CONTENT = 512

/** Distinct files the model produced itself retained per session. */
export const MAX_PRODUCED = 512

/**
 * Shortest interval between two snapshots of one session. A crash inside the
 * window loses at most the entries written since the last snapshot — a lost
 * saving, never a wrong answer. `reset` and `flush` always write.
 */
export const FLUSH_MS = 250

/** Snapshot format version; an unrecognised version loads as an empty ledger. */
const VERSION = 1

export type Seen = {
  digest: string
  mtime: number
  size: number
  /** Human-readable range description reused in the stub, e.g. "lines 303-352 of 1200". */
  range: string
}

/** Where an identical rendering was first sent in a session. */
export type Duplicate = {
  filepath: string
  range: string
}

/** A file the model produced itself this session with write, edit or apply_patch. */
export type Produced = {
  /** Digest of the content the model wrote, for identity and diagnostics. */
  digest: string
  mtime: number
  size: number
  /** The tool that produced the file: "write", "edit" or "apply_patch". */
  by: string
  /** Set once a withhold was decided, so the same version is served next time. */
  withheld: boolean
}

type Tracked = Duplicate & {
  /** Set once a withhold was decided, so the same bytes are served next time. */
  withheld: boolean
}

type Book = {
  epoch: number
  entries: Map<string, Seen>
  content: Map<string, Tracked>
  produced: Map<string, Produced>
  /** Nothing is written while clean, so a session that never changed is silent. */
  dirty: boolean
}

const sessions = new Map<string, Book>()
const writtenAt = new Map<string, number>()

const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

/** Directory of the snapshots. Overridable so tests never touch the real state dir. */
function dir(): string {
  return process.env.OPENCODE_READ_LEDGER_DIR ?? path.join(Global.Path.state, "read-ledger")
}

function file(sessionID: string): string {
  return path.join(dir(), `${sessionID.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSeen(value: unknown): value is Seen {
  if (!isRecord(value)) return false
  return (
    typeof value.digest === "string" &&
    typeof value.mtime === "number" &&
    typeof value.size === "number" &&
    typeof value.range === "string"
  )
}

function isTracked(value: unknown): value is Tracked {
  if (!isRecord(value)) return false
  return (
    typeof value.filepath === "string" && typeof value.range === "string" && typeof value.withheld === "boolean"
  )
}

function isProduced(value: unknown): value is Produced {
  if (!isRecord(value)) return false
  return (
    typeof value.digest === "string" &&
    typeof value.mtime === "number" &&
    typeof value.size === "number" &&
    typeof value.by === "string" &&
    typeof value.withheld === "boolean"
  )
}

/** A snapshot is honoured only when its shape is intact; anything else loads empty. */
function parse(text: string): Book | undefined {
  const raw = Option.getOrUndefined(decode(text))
  if (!isRecord(raw) || raw.v !== VERSION) return undefined
  if (typeof raw.epoch !== "number" || !Number.isInteger(raw.epoch)) return undefined
  if (!isRecord(raw.entries) || !isRecord(raw.content)) return undefined
  return {
    epoch: raw.epoch,
    entries: new Map(Object.entries(raw.entries).flatMap(([k, v]) => (isSeen(v) ? [[k, v] as [string, Seen]] : []))),
    content: new Map(
      Object.entries(raw.content).flatMap(([k, v]) => (isTracked(v) ? [[k, v] as [string, Tracked]] : [])),
    ),
    // A snapshot written before PRODUCED existed has no `produced` map: load it
    // empty rather than discarding the whole ledger.
    produced: new Map(
      Object.entries(isRecord(raw.produced) ? raw.produced : {}).flatMap(([k, v]) =>
        isProduced(v) ? [[k, v] as [string, Produced]] : [],
      ),
    ),
    dirty: false,
  }
}

function readText(target: string): string {
  return Effect.runSync(
    Effect.try({ try: () => readFileSync(target, "utf8"), catch: () => undefined }).pipe(
      Effect.orElseSucceed(() => ""),
    ),
  )
}

/** Atomic write: a crash can leave a stale snapshot, never a half-written one. */
function persist(sessionID: string, state: Book): void {
  const target = file(sessionID)
  const payload = JSON.stringify({
    v: VERSION,
    epoch: state.epoch,
    entries: Object.fromEntries(state.entries),
    content: Object.fromEntries(state.content),
    produced: Object.fromEntries(state.produced),
  })
  Effect.runSync(
    Effect.try({
      try: () => {
        mkdirSync(dir(), { recursive: true })
        writeFileSync(`${target}.tmp`, payload)
        renameSync(`${target}.tmp`, target)
      },
      catch: () => undefined,
    }).pipe(Effect.ignore),
  )
  state.dirty = false
  writtenAt.set(sessionID, Date.now())
}

function snapshot(sessionID: string, state: Book): void {
  if (!state.dirty) return
  if (Date.now() - (writtenAt.get(sessionID) ?? 0) < FLUSH_MS) return
  persist(sessionID, state)
}

function ledger(sessionID: string): Book {
  const hit = sessions.get(sessionID)
  if (hit) return hit
  const next = parse(readText(file(sessionID))) ?? {
    epoch: 0,
    entries: new Map(),
    content: new Map(),
    produced: new Map(),
    dirty: false,
  }
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next()
    if (!oldest.done) {
      const evicted = sessions.get(oldest.value)
      if (evicted?.dirty) persist(oldest.value, evicted)
      sessions.delete(oldest.value)
      writtenAt.delete(oldest.value)
    }
  }
  sessions.set(sessionID, next)
  return next
}

export function key(filepath: string, offset: number, limit: number): string {
  return `${filepath}\u0000${offset}\u0000${limit}`
}

/**
 * The path a file is known by across `read` and the writing tools. `read`
 * resolves the real path on Windows; the writing tools do not, so that
 * normalisation lives here once. Without it, a produced file would never be
 * recognised by the read that follows it.
 */
export function fileKey(filepath: string): string {
  return process.platform === "win32" ? AppFileSystem.normalizePath(filepath) : filepath
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

export function get(sessionID: string, entryKey: string): Seen | undefined {
  return ledger(sessionID).entries.get(entryKey)
}

export function put(sessionID: string, entryKey: string, seen: Seen): void {
  const state = ledger(sessionID)
  state.entries.delete(entryKey)
  state.entries.set(entryKey, seen)
  while (state.entries.size > MAX_ENTRIES) {
    const oldest = state.entries.keys().next()
    if (oldest.done) break
    state.entries.delete(oldest.value)
  }
  state.dirty = true
  snapshot(sessionID, state)
}

/** Record where the bytes behind `digestKey` were sent, keeping any withhold decision. */
export function putContent(sessionID: string, digestKey: string, where: Duplicate): void {
  const state = ledger(sessionID)
  const sent = state.content.get(digestKey)
  state.content.delete(digestKey)
  state.content.set(digestKey, { ...where, withheld: sent?.withheld ?? false })
  while (state.content.size > MAX_CONTENT) {
    const oldest = state.content.keys().next()
    if (oldest.done) break
    state.content.delete(oldest.value)
  }
  state.dirty = true
  snapshot(sessionID, state)
}

/**
 * Record that the model itself produced `filepath` with `content` via `by`
 * (write, edit or apply_patch). A later `read` of the file returns a stub instead
 * of re-sending bytes the model already wrote into its own context; the
 * `(mtime, size)` of the file just after the write is the proof the read checks.
 */
export function recordProduced(
  sessionID: string,
  filepath: string,
  content: string,
  mtime: number,
  size: number,
  by: string,
): void {
  const state = ledger(sessionID)
  const k = fileKey(filepath)
  state.produced.delete(k)
  state.produced.set(k, { digest: digest(content), mtime, size, by, withheld: false })
  while (state.produced.size > MAX_PRODUCED) {
    const oldest = state.produced.keys().next()
    if (oldest.done) break
    state.produced.delete(oldest.value)
  }
  state.dirty = true
  snapshot(sessionID, state)
}

/**
 * The location of bytes already sent under a *different* key, when this
 * rendering may be withheld. Identity is the content digest alone: the same
 * rendering can be produced by several keys (another limit, another spelling of
 * the path), and those bytes are in context whatever key produced them.
 *
 * Withholds at most once per digest and per epoch: the second request for the
 * same content returns `undefined`, so the caller sends the bytes. That bound is
 * what makes the dedup livelock-free.
 */
export function duplicateOf(sessionID: string, digestKey: string): Duplicate | undefined {
  const state = ledger(sessionID)
  const sent = state.content.get(digestKey)
  if (!sent || sent.withheld) return undefined
  sent.withheld = true
  state.dirty = true
  snapshot(sessionID, state)
  return sent
}

/**
 * Withhold the bytes of a file the model produced earlier in this session, when
 * `(mtime, size)` still prove it unchanged. Withheld at most once per produced
 * version and per epoch, so the request after a withhold always receives bytes.
 * `undefined` means the caller must render and send the file.
 */
export function takeProduced(
  sessionID: string,
  filepath: string,
  mtime: number,
  size: number,
): Produced | undefined {
  const state = ledger(sessionID)
  const hit = state.produced.get(fileKey(filepath))
  if (!hit || hit.withheld) return undefined
  if (!provenUnchanged(hit, mtime, size)) return undefined
  hit.withheld = true
  state.dirty = true
  snapshot(sessionID, state)
  return hit
}

/** The compaction generation this session's dedup decisions belong to. */
export function epoch(sessionID: string): number {
  return ledger(sessionID).epoch
}

/**
 * True when `(mtime, size)` prove the file cannot have changed since `seen`, so
 * the re-read can be answered without touching the disk at all.
 */
export function provenUnchanged(seen: { mtime: number; size: number }, mtime: number, size: number): boolean {
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

/** The stub returned in place of bytes already sent under a different key. */
export function duplicateStub(filepath: string, where: Duplicate): string {
  return [
    `<path>${filepath}</path>`,
    `<type>file</type>`,
    `<duplicate>`,
    `These bytes are already in your context: the identical content was returned earlier in this session as ${where.range} of ${where.filepath}.`,
    `The bytes are deliberately not repeated here: re-sending content you already hold is the single largest source of wasted context in this harness.`,
    `Requesting these bytes again returns them in full: a copy is withheld at most once per compaction epoch.`,
    `</duplicate>`,
  ].join("\n")
}

/** The stub returned in place of bytes the model itself produced this session. */
export function producedStub(filepath: string, produced: Produced): string {
  return [
    `<path>${filepath}</path>`,
    `<type>file</type>`,
    `<produced>`,
    `This file has not changed since your ${produced.by} call earlier in this session: that call is the last thing that touched it.`,
    `You produced its current content yourself, so you already hold it — scroll back to what you sent rather than fetching it again.`,
    `The bytes are deliberately not repeated here: re-sending content you already hold is the single largest source of wasted context in this harness.`,
    `If you need the file's exact current text, read it a second time: a produced file is withheld at most once per compaction epoch.`,
    `</produced>`,
  ].join("\n")
}

/** Force the snapshot of one session, or of every loaded session. */
export function flush(sessionID?: string): void {
  if (sessionID === undefined) {
    for (const [id, state] of sessions) if (state.dirty) persist(id, state)
    return
  }
  const state = ledger(sessionID)
  if (state.dirty) persist(sessionID, state)
}

/**
 * Forget a session's ledger and open a new epoch. Called by compaction, whose
 * dropped bytes must never be pointed at by a later stub; the clear is written
 * out so it survives a restart. Without an argument this is the test hook and
 * also removes the snapshots this process wrote.
 */
export function reset(sessionID?: string): void {
  if (sessionID === undefined) {
    for (const id of writtenAt.keys())
      Effect.runSync(
        Effect.try({ try: () => rmSync(file(id), { force: true }), catch: () => undefined }).pipe(Effect.ignore),
      )
    sessions.clear()
    writtenAt.clear()
    return
  }
  const state = ledger(sessionID)
  state.entries.clear()
  state.content.clear()
  state.produced.clear()
  state.epoch += 1
  state.dirty = true
  persist(sessionID, state)
}

/**
 * Test/maintenance hook: drop in-memory state without writing anything, which
 * is exactly what a process restart does. The next access reloads the snapshot.
 */
export function unload(sessionID?: string): void {
  if (sessionID === undefined) sessions.clear()
  else sessions.delete(sessionID)
}

export * as ReadLedger from "./read-ledger"
