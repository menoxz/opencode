import path from "path"
import { Effect, Layer, Context, Option } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Flag } from "@opencode-ai/core/flag/flag"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"
import type { MessageV2 } from "./message-v2"
import type { MessageID } from "./schema"
import { SessionContextRollout } from "./context-rollout"

const log = Log.create({ service: "session.instruction" })

const files = (disableClaudeCodePrompt: boolean) => [
  "AGENTS.md",
  ...(disableClaudeCodePrompt ? [] : ["CLAUDE.md"]),
  "CONTEXT.md", // deprecated
]

function extract(messages: MessageV2.WithParts[]) {
  const paths = new Set<string>()
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
        if (part.state.time.compacted) continue
        const loaded = part.state.metadata?.loaded
        if (!loaded || !Array.isArray(loaded)) continue
        for (const p of loaded) {
          if (typeof p === "string") paths.add(p)
        }
      }
    }
  }
  return paths
}

function renderInstruction(filepath: string, content: string, mode: SessionContextRollout.InjectionInstructionsMode) {
  if (mode === "off") return undefined
  if (mode === "full") return `Instructions from: ${filepath}\n${content}`
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
  return [
    `Instructions from: ${filepath}`,
    "<summary>",
    ...(lines.length ? lines.map((line) => `- ${line}`) : ["- instruction file loaded in summary mode"]),
    "</summary>",
  ].join("\n")
}

function elapsed(start: number) {
  return Date.now() - start
}

export interface Interface {
  readonly clear: (messageID: MessageID) => Effect.Effect<void>
  readonly systemPaths: () => Effect.Effect<Set<string>, AppFileSystem.Error>
  readonly system: () => Effect.Effect<string[], AppFileSystem.Error>
  readonly find: (dir: string) => Effect.Effect<string | undefined, AppFileSystem.Error>
  readonly resolve: (
    messages: MessageV2.WithParts[],
    filepath: string,
    messageID: MessageID,
  ) => Effect.Effect<{ filepath: string; content: string }[], AppFileSystem.Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Instruction") {}

export const layer: Layer.Layer<
  Service,
  never,
  AppFileSystem.Service | Config.Service | Global.Service | HttpClient.HttpClient | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const fs = yield* AppFileSystem.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
    const globalFiles = [
      path.join(global.config, "AGENTS.md"),
      ...(!flags.disableClaudeCodePrompt ? [path.join(global.home, ".claude", "CLAUDE.md")] : []),
    ]
    const instructionFiles = files(flags.disableClaudeCodePrompt)

    const state = yield* InstanceState.make(
      Effect.fn("Instruction.state")(() =>
        Effect.succeed({
          // Track which instruction files have already been attached for a given assistant message.
          claims: new Map<MessageID, Set<string>>(),
          // Cache file reads only when size/mtime prove the content is unchanged.
          reads: new Map<string, { signature: string; content: string }>(),
        }),
      ),
    )

    const relative = Effect.fnUntraced(function* (instruction: string) {
      const ctx = yield* InstanceState.context
      if (Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
        return yield* fs
          .globUp(instruction, global.config, global.config)
          .pipe(Effect.catch(() => Effect.succeed([] as string[])))
      }
      const project = yield* fs
        .globUp(instruction, ctx.directory, ctx.worktree)
        .pipe(Effect.catch(() => Effect.succeed([] as string[])))
      if (project.length > 0) return project
      // Relative patterns in the global config ("instructions": ["./rules.md"])
      // mean "next to the config file". They are routinely missed by the
      // project-tree walk, so fall back to the config directory instead of
      // silently dropping the configured instruction files.
      return yield* fs
        .glob(instruction, { cwd: global.config, absolute: true, include: "file" })
        .pipe(Effect.catch(() => Effect.succeed([] as string[])))
    })

    const read = Effect.fn("Instruction.read")(function* (filepath: string) {
      const start = Date.now()
      const stat = yield* fs.stat(filepath).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!stat) {
        log.debug("instruction file skipped", { filepath, reason: "missing", duration: elapsed(start) })
        return ""
      }
      const mtime = stat.mtime.pipe(
        Option.map((time) => time.getTime()),
        Option.getOrElse(() => 0),
      )
      const signature = `${stat.size}:${mtime}`
      const store = yield* InstanceState.get(state)
      const cached = store.reads.get(filepath)
      if (cached?.signature === signature) {
        log.debug("instruction file cache hit", { filepath, bytes: cached.content.length, duration: elapsed(start) })
        return cached.content
      }
      const content = yield* fs.readFileString(filepath).pipe(Effect.catch(() => Effect.succeed("")))
      store.reads.set(filepath, { signature, content })
      log.debug("instruction file read", { filepath, bytes: content.length, duration: elapsed(start) })
      return content
    })

    const fetch = Effect.fnUntraced(function* (url: string) {
      const start = Date.now()
      const res = yield* http.execute(HttpClientRequest.get(url)).pipe(
        Effect.timeout(5000),
        Effect.catch(() => Effect.succeed(null)),
      )
      if (!res) {
        log.debug("instruction file skipped", { filepath: url, source: "remote", reason: "empty-or-error", duration: elapsed(start) })
        return ""
      }
      const body = yield* res.arrayBuffer.pipe(Effect.catch(() => Effect.succeed(new ArrayBuffer(0))))
      const content = new TextDecoder().decode(body)
      if (content) log.debug("instruction file read", { filepath: url, source: "remote", bytes: content.length, duration: elapsed(start) })
      else log.debug("instruction file skipped", { filepath: url, source: "remote", reason: "empty", duration: elapsed(start) })
      return content
    })

    const clear = Effect.fn("Instruction.clear")(function* (messageID: MessageID) {
      const s = yield* InstanceState.get(state)
      s.claims.delete(messageID)
    })

    const discoverSystemPaths = Effect.fn("Instruction.discoverSystemPaths")(function* () {
      const start = Date.now()
      const config = yield* cfg.get()
      const ctx = yield* InstanceState.context
      const paths = new Set<string>()

      for (const file of globalFiles) {
        if (yield* fs.existsSafe(file)) {
          const filepath = path.resolve(file)
          paths.add(filepath)
          log.debug("instruction file found", { filepath, source: "global" })
          break
        }
        log.debug("instruction file skipped", { filepath: file, source: "global", reason: "missing" })
      }

      // The first project-level match wins so we don't stack AGENTS.md/CLAUDE.md from every ancestor.
      if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
        for (const file of instructionFiles) {
          const matches = yield* fs
            .findUp(file, ctx.directory, ctx.worktree)
            .pipe(Effect.catch(() => Effect.succeed([])))
          if (matches.length > 0) {
            matches.forEach((item) => {
              const filepath = path.resolve(item)
              paths.add(filepath)
              log.debug("instruction file found", { filepath, source: "project", target: file })
            })
            break
          }
          log.debug("instruction file skipped", { source: "project", target: file, reason: "missing" })
        }
      } else {
        log.debug("instruction discovery skipped", { source: "project", reason: "disabled" })
      }

      if (config.instructions) {
        for (const raw of config.instructions) {
          if (raw.startsWith("https://") || raw.startsWith("http://")) {
            log.debug("instruction file skipped", { filepath: raw, source: "config", reason: "remote" })
            continue
          }
          const instruction = raw.startsWith("~/") ? path.join(global.home, raw.slice(2)) : raw
          const matches = yield* (
            path.isAbsolute(instruction)
              ? fs.glob(path.basename(instruction), {
                  cwd: path.dirname(instruction),
                  absolute: true,
                  include: "file",
                })
              : relative(instruction)
          ).pipe(Effect.catch(() => Effect.succeed([] as string[])))
          if (matches.length === 0) {
            log.debug("instruction file skipped", { filepath: raw, source: "config", reason: "missing" })
          }
          matches.forEach((item) => {
            const filepath = path.resolve(item)
            paths.add(filepath)
            log.debug("instruction file found", { filepath, source: "config", pattern: raw })
          })
        }
      }

      log.debug("instruction paths discovered", { count: paths.size, duration: elapsed(start) })
      return paths
    })

    const systemPaths = Effect.fn("Instruction.systemPaths")(function* () {
      return yield* discoverSystemPaths()
    })

    const system = Effect.fn("Instruction.system")(function* () {
      const start = Date.now()
      const config = yield* cfg.get()
      const rollout = SessionContextRollout.resolve(config)
      const paths = yield* systemPaths()
      const urls = (config.instructions ?? []).filter(
        (item) => item.startsWith("https://") || item.startsWith("http://"),
      )
      if (rollout.injectionInstructions === "off") {
        log.debug("instruction injection skipped", { reason: "disabled", paths: paths.size, urls: urls.length })
        return []
      }

      const files = yield* Effect.forEach(Array.from(paths), read, { concurrency: 8 })
      const remote = yield* Effect.forEach(urls, fetch, { concurrency: 4 })

      const result = [
        ...Array.from(paths).flatMap((item, i) => {
          const rendered = files[i] ? renderInstruction(item, files[i], rollout.injectionInstructions) : undefined
          if (!rendered) log.debug("instruction file skipped", { filepath: item, reason: "empty-or-disabled" })
          return rendered ? [rendered] : []
        }),
        ...urls.flatMap((item, i) => {
          const rendered = remote[i] ? renderInstruction(item, remote[i], rollout.injectionInstructions) : undefined
          if (!rendered) log.debug("instruction file skipped", { filepath: item, source: "remote", reason: "empty-or-disabled" })
          return rendered ? [rendered] : []
        }),
      ]
      log.debug("instruction system loaded", {
        paths: paths.size,
        urls: urls.length,
        applied: result.length,
        mode: rollout.injectionInstructions,
        duration: elapsed(start),
      })
      return result
    })

    const find = Effect.fn("Instruction.find")(function* (dir: string) {
      for (const file of instructionFiles) {
        const filepath = path.resolve(path.join(dir, file))
        if (yield* fs.existsSafe(filepath)) return filepath
      }
      return undefined
    })

    const resolve = Effect.fn("Instruction.resolve")(function* (
      messages: MessageV2.WithParts[],
      filepath: string,
      messageID: MessageID,
    ) {
      const rollout = SessionContextRollout.resolve(yield* cfg.get())
      if (rollout.injectionInstructions === "off") return []
      const sys = yield* systemPaths()
      const already = extract(messages)
      const results: { filepath: string; content: string }[] = []
      const s = yield* InstanceState.get(state)
      const root = path.resolve(yield* InstanceState.directory)

      const target = path.resolve(filepath)
      let current = path.dirname(target)

      // Walk upward from the file being read and attach nearby instruction files once per message.
      while (current.startsWith(root) && current !== root) {
        const found = yield* find(current)
        if (!found || found === target || sys.has(found) || already.has(found)) {
          current = path.dirname(current)
          continue
        }

        let set = s.claims.get(messageID)
        if (!set) {
          set = new Set()
          s.claims.set(messageID, set)
        }
        if (set.has(found)) {
          current = path.dirname(current)
          continue
        }
        
        set.add(found)
        const content = yield* read(found)
        const rendered = content ? renderInstruction(found, content, rollout.injectionInstructions) : undefined
        if (rendered) {
          results.push({ filepath: found, content: rendered })
        }

        current = path.dirname(current)
      }

      return results
    })

    return Service.of({ clear, systemPaths, system, find, resolve })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(Global.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export function loaded(messages: MessageV2.WithParts[]) {
  return extract(messages)
}

export * as Instruction from "./instruction"
