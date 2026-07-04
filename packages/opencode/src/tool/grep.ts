import path from "path"
import { Schema } from "effect"
import { Effect } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Ripgrep } from "../file/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"
import { Reference } from "@/reference/reference"
import { DEFAULT_TTL, Service as ToolCacheService } from "./cache"
import { Service as SearchIndexService } from "./search-index"

const MAX_LINE_LENGTH = 2000

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "The regex pattern to search for in file contents" }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
  }),
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const rg = yield* Ripgrep.Service
    const reference = yield* Reference.Service
    const cache = yield* ToolCacheService
    const searchIndex = yield* SearchIndexService

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { pattern: string; path?: string; include?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false },
            output: "No files found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: params.include,
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          yield* reference.ensure(requested)
          const requestedInfo = yield* fs.stat(requested).pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: yield* reference.contains(requested),
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = AppFileSystem.resolve(requested)
          const info = yield* fs.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          let file = info?.type === "Directory" ? undefined : [path.relative(cwd, search)]

          // Real index-based narrowing (trigram index, see search-index.ts):
          // when searching an entire directory (not a single file) without an
          // --include glob (kept separate to avoid combining two filters in
          // v1), ask the index for a candidate file list. If it can safely
          // narrow the pattern, ripgrep only scans those files instead of the
          // whole directory. `null` means "no safe restriction possible" or
          // "index not ready" — falls back to the exact pre-existing
          // unrestricted behavior, same results either way.
          if (file === undefined && !params.include) {
            const candidates = yield* searchIndex.queryCandidates(cwd, params.pattern).pipe(
              Effect.catch(() => Effect.succeed(null)),
            )
            if (candidates !== null) file = candidates
          }

          const cacheKey = `grep:${search}:${params.pattern}:${params.include ?? ""}`
          const cached = yield* cache.get(cacheKey)
          if (cached) return cached.data as Tool.ExecuteResult

          if (file !== undefined && file.length === 0) {
            // Index proved no file can contain the pattern: skip ripgrep
            // entirely (0 files to scan is a valid, correct answer).
            yield* cache.set(cacheKey, empty, DEFAULT_TTL.grep)
            return empty
          }

          const result = yield* rg.search({
            cwd,
            pattern: params.pattern,
            glob: params.include ? [params.include] : undefined,
            file,
            signal: ctx.abort,
          })
          if (result.items.length === 0) {
            yield* cache.set(cacheKey, empty, DEFAULT_TTL.grep)
            return empty
          }

          const rows = result.items.map((item) => ({
            path: AppFileSystem.resolve(
              path.isAbsolute(item.path.text) ? item.path.text : path.join(cwd, item.path.text),
            ),
            line: item.line_number,
            text: item.lines.text,
          }))
          const times = new Map(
            (yield* Effect.forEach(
              [...new Set(rows.map((row) => row.path))],
              Effect.fnUntraced(function* (file) {
                const info = yield* cache.getStatMtime(fs, file)
                if (!info || info.isDirectory) return undefined
                return [file, info.mtime] as const
              }),
              { concurrency: 16 },
            )).filter((entry): entry is readonly [string, number] => Boolean(entry)),
          )
          const matches = rows.flatMap((row) => {
            const mtime = times.get(row.path)
            if (mtime === undefined) return []
            return [{ ...row, mtime }]
          })

          matches.sort((a, b) => b.mtime - a.mtime)

          const limit = 100
          const truncated = matches.length > limit
          const final = truncated ? matches.slice(0, limit) : matches
          if (final.length === 0) {
            yield* cache.set(cacheKey, empty, DEFAULT_TTL.grep)
            return empty
          }

          const total = matches.length
          const output = [`Found ${total} matches${truncated ? ` (showing first ${limit})` : ""}`]

          let current = ""
          for (const match of final) {
            if (current !== match.path) {
              if (current !== "") output.push("")
              current = match.path
              output.push(`${match.path}:`)
            }
            const text =
              match.text.length > MAX_LINE_LENGTH ? match.text.substring(0, MAX_LINE_LENGTH) + "..." : match.text
            output.push(`  Line ${match.line}: ${text}`)
          }

          if (truncated) {
            output.push("")
            output.push(
              `(Results truncated: showing ${limit} of ${total} matches (${total - limit} hidden). Consider using a more specific path or pattern.)`,
            )
          }

          if (result.partial) {
            output.push("")
            output.push("(Some paths were inaccessible and skipped)")
          }

          const outputResult = {
            title: params.pattern,
            metadata: {
              matches: total,
              truncated,
            },
            output: output.join("\n"),
          }
          yield* cache.set(cacheKey, outputResult, DEFAULT_TTL.grep)
          return outputResult
        }).pipe(Effect.orDie),
    }
  }),
)
