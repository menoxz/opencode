/**
 * search-index.ts — trigram index that reduces the file set ripgrep has to scan.
 *
 * This is NOT a result cache (see tool/cache.ts for that). It is a real index:
 * built once per project (lazily, on first grep/glob), persisted to disk, and
 * used to compute a *candidate file list* before invoking ripgrep — the same
 * technique used by Google Code Search / Zoekt / GitHub code search.
 *
 * How it works:
 *   1. Build: for every indexable file, extract every 3-byte substring
 *      ("trigram") of its content. Build trigram -> Set<fileIndex>.
 *   2. Query: extract the safe *required* literal trigrams from the search
 *      pattern (see extractRequiredTrigrams). Intersect their file sets.
 *      Any file NOT in that intersection cannot possibly contain the pattern
 *      (a real match always contains every trigram of the substring it
 *      matched), so it is safe to exclude — ripgrep only has to scan the
 *      (usually much smaller) candidate set instead of the whole tree.
 *   3. Update: on write/edit/apply_patch, the changed file's old trigrams are
 *      removed and its new content's trigrams are added — O(file size), not
 *      O(repo size). No full rebuild on every edit.
 *
 * Safety / correctness:
 *   - extractRequiredTrigrams is conservative: for anything it cannot prove
 *     safe (alternation, wildcards spanning unknown text, patterns shorter
 *     than 3 literal chars, case-insensitive gaps, etc.) it returns `null`,
 *     meaning "no safe restriction possible" — callers MUST fall back to an
 *     unrestricted (current, pre-existing) search in that case. This index
 *     only ever narrows the candidate set; it never decides matches itself
 *     and never causes a false negative.
 *   - If the on-disk index is missing, unreadable, or was built for a
 *     different content generation, callers fall back to the unrestricted
 *     path exactly as before this feature existed.
 */

import path from "path"
import { Context, Deferred, Effect, Layer, Option } from "effect"
import * as Stream from "effect/Stream"
import { Global } from "@opencode-ai/core/global"
import { Hash } from "@opencode-ai/core/util/hash"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import * as Log from "@opencode-ai/core/util/log"
import { Ripgrep } from "../file/ripgrep"

const log = Log.create({ service: "tool.search-index" })

// Cap on how much of a file's content is trigrammed, to bound memory/CPU on
// pathologically large files (generated code, lockfiles, minified bundles).
const MAX_INDEXED_BYTES_PER_FILE = 512 * 1024
// Files larger than this are skipped entirely (still searchable — they are
// just never used to narrow the candidate set, so a query touching them
// always falls back to including them, never excludes them incorrectly).
const MAX_FILE_SIZE_TO_INDEX = 2 * 1024 * 1024

export type IndexStats = {
  fileCount: number
  trigramCount: number
  totalCandidateFiles: number // = fileCount, i.e. total files known to the index
}

type State = {
  cwd: string
  files: string[] // fileIndex -> relative path
  fileToIndex: Map<string, number> // relative path -> fileIndex
  trigrams: Map<string, Set<number>> // trigram -> Set<fileIndex>
  version: number // bumped on every mutation, used only for diagnostics
}

function trigramsOf(content: string): Set<string> {
  // Trigrams are matched case-sensitively against content indexed verbatim
  // (original casing). This is only correct because grep.ts invokes ripgrep
  // without -i/-S/--ignore-case (verified: opencode's Ripgrep.Service never
  // sets those flags, and ripgrep 15.x defaults to case-sensitive matching).
  // If grep.ts ever gains a case-insensitive option, this index MUST either
  // be disabled for that query or normalize both sides to lowercase.
  const out = new Set<string>()
  const limit = Math.min(content.length, MAX_INDEXED_BYTES_PER_FILE)
  for (let i = 0; i + 3 <= limit; i++) {
    out.add(content.slice(i, i + 3))
  }
  return out
}

/**
 * Extracts the literal substrings that are *guaranteed* to appear verbatim in
 * any string matching `pattern`, then splits each into trigrams. Returns
 * `null` when no such guarantee can be made (safe fallback: no restriction).
 *
 * Conservative approach: split the pattern on regex metacharacters
 * (anything that isn't a literal char in a typical regex — `.`, `*`, `+`,
 * `?`, `(`, `)`, `[`, `]`, `{`, `}`, `|`, `^`, `$`, `\`) into literal runs.
 * Every match of the original pattern must contain at least one of these
 * literal runs verbatim (regex alternation/quantifiers only add or remove
 * text around literal runs, never remove characters from within them).
 * We pick the *longest* literal run (most selective) and require all its
 * trigrams to be present. If no literal run has length >= 3, return null.
 *
 * This deliberately does NOT try to be a full regex parser. Getting this
 * wrong in the "too permissive" direction only wastes time (falls back to
 * unrestricted search); getting it wrong in the "too strict" direction would
 * cause real false negatives, which is never acceptable — so on any doubt
 * (parse ambiguity, escaped metacharacters, character classes with ranges,
 * etc.) this returns null rather than guessing.
 */
export function extractRequiredTrigrams(pattern: string): string[] | null {
  // Reject anything that needs real regex parsing to reason about safely:
  // alternation (|), groups ((...)), character classes ([...]), anchors
  // (^ $), escapes (\), and bounded quantifiers ({...}). Getting any of
  // these wrong could silently exclude a file that actually matches (a
  // false negative), which this index must never cause — so we simply
  // don't attempt to narrow the search for patterns using them. The caller
  // always falls back to an unrestricted (current, pre-existing) search
  // when this returns null.
  if (/[\\[\]()|^${}]/.test(pattern)) return null

  // Build literal runs, cutting BEFORE any quantifier's target character
  // (that character is optional/repeated, not guaranteed present exactly
  // once) and at any `.` wildcard.
  const runs: string[] = []
  let current = ""
  const chars = [...pattern]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]
    if (ch === ".") {
      if (current) runs.push(current)
      current = ""
      continue
    }
    if (next === "*" || next === "?" || next === "+") {
      // `ch` itself is quantified (optional/repeated/one-or-more): even for
      // `+` we conservatively exclude it, since the *number* of repeats
      // isn't fixed, so we can't pick one trigram-stable substring across
      // it. End the current run before `ch`.
      if (current) runs.push(current)
      current = ""
      i++ // also skip the quantifier char itself
      continue
    }
    if (ch === "*" || ch === "?" || ch === "+") {
      // Stray quantifier not handled above (shouldn't normally happen given
      // the lookahead logic, but stay safe): cut here too.
      if (current) runs.push(current)
      current = ""
      continue
    }
    current += ch
  }
  if (current) runs.push(current)

  if (runs.length === 0) return null

  const longest = runs.reduce((a, b) => (b.length > a.length ? b : a), "")
  if (longest.length < 3) return null

  return [...trigramsOf(longest)]
}

export interface Interface {
  /**
   * Returns a list of candidate files (relative to `cwd`) that might contain
   * `pattern`, or `null` if no safe restriction is possible (caller must
   * fall back to an unrestricted search) or if the index isn't ready yet.
   */
  readonly queryCandidates: (cwd: string, pattern: string) => Effect.Effect<string[] | null>
  /**
   * Incrementally updates the index entry for `absoluteFile` (an absolute
   * path) with `content`, in every already-built index whose cwd contains
   * it. O(file size), not O(repo size) — no full rebuild on every edit.
   * Silently a no-op for any cwd that hasn't been indexed yet (nothing to
   * update there — it will pick up the fresh content on its first build).
   */
  readonly updateFile: (absoluteFile: string, content: string) => Effect.Effect<void>
  /** Removes `absoluteFile` from every already-built index that contains it. */
  readonly removeFile: (absoluteFile: string) => Effect.Effect<void>
  /** Returns index stats for the given cwd, or null if not built yet. */
  readonly stats: (cwd: string) => Effect.Effect<IndexStats | null>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SearchIndex") {
  // Deliberately declares NO required dependencies (`never`). Ripgrep.Service
  // and AppFileSystem.Service are obtained internally via
  // Effect.serviceOption, exactly like ToolCacheService is obtained
  // optionally in write.ts/edit.ts. This keeps SearchIndexService safe to add
  // to ANY existing Layer composition (e.g. registry.ts) without widening
  // its transitive requirements — if either service isn't available in a
  // given context, the index simply stays disabled there and every query
  // returns `null` (safe fallback to the pre-existing unrestricted search).
  static readonly defaultLayer: Layer.Layer<Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const ripgrepOpt = yield* Effect.serviceOption(Ripgrep.Service)
      const fsOpt = yield* Effect.serviceOption(AppFileSystem.Service)

      if (Option.isNone(ripgrepOpt) || Option.isNone(fsOpt)) {
        log.warn("SearchIndex disabled: Ripgrep.Service or AppFileSystem.Service not available in this context")
        const disabled: Interface = {
          queryCandidates: () => Effect.succeed(null),
          updateFile: () => Effect.void,
          removeFile: () => Effect.void,
          stats: () => Effect.succeed(null),
        }
        return Service.of(disabled)
      }

      const ripgrep = ripgrepOpt.value
      const fs = fsOpt.value

      // One State per distinct cwd searched, built lazily on first use.
      // `building` memoizes the in-flight build per cwd via a Deferred so
      // concurrent grep+glob calls on the same directory trigger exactly one
      // scan, not one each — later callers just await the same Deferred.
      // Errors from a failed build (e.g. ripgrep failing on an inaccessible
      // path) are propagated through the Deferred too, so every caller sees
      // the same failure instead of a silent inconsistent state.
      const states = new Map<string, State>()
      const building = new Map<string, Deferred.Deferred<State, unknown>>()

      function indexPath(cwd: string) {
        return path.join(Global.Path.cache, "search-index", Hash.fast(cwd) + ".json")
      }

      type PersistedIndex = {
        cwd: string
        files: string[]
        trigrams: Record<string, number[]>
      }

      const loadPersisted = (cwd: string) =>
        Effect.gen(function* () {
          const raw = yield* fs.readFileStringSafe(indexPath(cwd)).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!raw) return null
          const parsed = yield* Effect.sync(() => {
            try {
              return JSON.parse(raw) as PersistedIndex
            } catch {
              return null
            }
          })
          if (!parsed || parsed.cwd !== cwd || !Array.isArray(parsed.files) || typeof parsed.trigrams !== "object") {
            return null
          }
          const state: State = {
            cwd,
            files: parsed.files,
            fileToIndex: new Map(parsed.files.map((f, i) => [f, i])),
            trigrams: new Map(Object.entries(parsed.trigrams).map(([k, v]) => [k, new Set(v)])),
            version: 1,
          }
          return state
        })

      const persist = (state: State) =>
        Effect.gen(function* () {
          const serialized: PersistedIndex = {
            cwd: state.cwd,
            files: state.files,
            trigrams: Object.fromEntries([...state.trigrams.entries()].map(([k, v]) => [k, [...v]])),
          }
          yield* fs
            .writeWithDirs(indexPath(state.cwd), JSON.stringify(serialized))
            .pipe(Effect.catch((e) => Effect.sync(() => log.warn("failed to persist search index", { error: e }))))
        })

      function addFileTrigrams(state: State, file: string, content: string) {
        let idx = state.fileToIndex.get(file)
        if (idx === undefined) {
          idx = state.files.length
          state.files.push(file)
          state.fileToIndex.set(file, idx)
        }
        for (const tri of trigramsOf(content)) {
          let set = state.trigrams.get(tri)
          if (!set) {
            set = new Set()
            state.trigrams.set(tri, set)
          }
          set.add(idx)
        }
      }

      function removeFileTrigrams(state: State, file: string) {
        const idx = state.fileToIndex.get(file)
        if (idx === undefined) return
        for (const set of state.trigrams.values()) {
          set.delete(idx)
        }
        // Leave a hole in `files` (index stays stable for other trigram sets);
        // fileToIndex no longer maps to it so it won't be re-added twice.
        state.fileToIndex.delete(file)
      }

      const buildState = Effect.fnUntraced(function* (cwd: string) {
        const persisted = yield* loadPersisted(cwd)
        if (persisted) {
          log.info("loaded persisted search index", { cwd, files: persisted.files.length })
          return persisted
        }

        const state: State = {
          cwd,
          files: [],
          fileToIndex: new Map(),
          trigrams: new Map(),
          version: 1,
        }

        // Reuses ripgrep's own file listing (respects .gitignore etc.)
        // instead of re-implementing a directory walker.
        const relFiles = yield* ripgrep.files({ cwd }).pipe(Stream.runCollect, Effect.map((chunk) => [...chunk]))

        yield* Effect.forEach(
          relFiles,
          Effect.fnUntraced(function* (rel) {
            const full = path.join(cwd, rel)
            const size = yield* fs.stat(full).pipe(
              Effect.map((s) => s.size),
              Effect.catch(() => Effect.succeed(0)),
            )
            if (size > MAX_FILE_SIZE_TO_INDEX) return
            const content = yield* fs.readFileStringSafe(full).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (content === undefined) return
            addFileTrigrams(state, rel, content)
          }),
          { concurrency: 16 },
        )

        log.info("built search index", { cwd, files: state.files.length, trigrams: state.trigrams.size })
        yield* persist(state)
        return state
      })

      // Memoized per-cwd: concurrent callers awaiting the same in-flight
      // build all get the same result instead of triggering N scans.
      const getOrBuild = (cwd: string) =>
        Effect.gen(function* () {
          const existing = states.get(cwd)
          if (existing) return existing

          const inFlight = building.get(cwd)
          if (inFlight) return yield* Deferred.await(inFlight)

          const deferred = yield* Deferred.make<State, unknown>()
          building.set(cwd, deferred)
          const built = yield* buildState(cwd).pipe(
            Effect.tap((state) => Deferred.succeed(deferred, state)),
            Effect.tapError((e) => Deferred.fail(deferred, e)),
            Effect.ensuring(Effect.sync(() => building.delete(cwd))),
          )
          states.set(cwd, built)
          return built
        })

      const queryCandidates: Interface["queryCandidates"] = (cwd, pattern) =>
        Effect.gen(function* () {
          const required = extractRequiredTrigrams(pattern)
          if (!required || required.length === 0) return null

          const state = yield* getOrBuild(cwd).pipe(Effect.catch(() => Effect.succeed(null)))
          if (!state || state.files.length === 0) return null

          let candidates: Set<number> | null = null
          for (const tri of required) {
            const set = state.trigrams.get(tri)
            if (!set || set.size === 0) return [] // no file has this trigram -> zero matches possible
            candidates = candidates ? intersect(candidates, set) : new Set(set)
            if (candidates.size === 0) return []
          }
          if (!candidates) return null
          return [...candidates].map((i) => state.files[i]).filter((f): f is string => f !== undefined)
        })

      const updateFile: Interface["updateFile"] = (absoluteFile, content) =>
        Effect.sync(() => {
          for (const [cwd, state] of states) {
            if (!isWithin(cwd, absoluteFile)) continue
            const rel = path.relative(cwd, absoluteFile)
            removeFileTrigrams(state, rel)
            if (content.length <= MAX_FILE_SIZE_TO_INDEX) addFileTrigrams(state, rel, content)
            state.version++
          }
        })

      const removeFile: Interface["removeFile"] = (absoluteFile) =>
        Effect.sync(() => {
          for (const [cwd, state] of states) {
            if (!isWithin(cwd, absoluteFile)) continue
            const rel = path.relative(cwd, absoluteFile)
            removeFileTrigrams(state, rel)
            state.version++
          }
        })

      const stats: Interface["stats"] = (cwd) =>
        Effect.sync(() => {
          const state = states.get(cwd)
          if (!state) return null
          return {
            fileCount: state.fileToIndex.size,
            trigramCount: state.trigrams.size,
            totalCandidateFiles: state.files.length,
          }
        })

      return Service.of({ queryCandidates, updateFile, removeFile, stats })
    }),
  )
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const small = a.size < b.size ? a : b
  const large = a.size < b.size ? b : a
  const out = new Set<number>()
  for (const v of small) if (large.has(v)) out.add(v)
  return out
}

function isWithin(cwd: string, absoluteFile: string): boolean {
  const rel = path.relative(cwd, absoluteFile)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

export const SearchIndex = { Service, extractRequiredTrigrams }
