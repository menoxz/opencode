import path from "path"
import { Effect, Layer, Context, Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import { Global } from "@opencode-ai/core/global"
import { Permission } from "@/permission"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Config } from "@/config/config"
import * as ConfigPaths from "@/config/paths"
import { ConfigMarkdown } from "@/config/markdown"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Glob } from "@opencode-ai/core/util/glob"
import * as Log from "@opencode-ai/core/util/log"
import { Discovery } from "./discovery"
import CUSTOMIZE_OPENCODE_SKILL_BODY from "./prompt/customize-opencode.md" with { type: "text" }
import { isRecord } from "@/util/record"
import { isSkillFile, isConfigFile } from "@/hotreload"
import * as fs from "fs"

const log = Log.create({ service: "skill" })
const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"
// Sub-directories that hold skills themselves: the `skill` and `skills` entries of a root,
// matching the `{skill,skills}` alternative of OPENCODE_SKILL_PATTERN.
const CONTAINER_DIRS: readonly string[] = ["skill", "skills"]

/** A directory under watch, and whether every change inside it concerns the skill catalog. */
export type WatchTarget = { dir: string; container: boolean }

/**
 * What a raw `fs.watch` callback means for the skill catalog: the key to debounce the reload on,
 * or `null` when the event must be ignored.
 *
 * A recursive watch cannot be relied on to report nested changes: a change inside
 * `<root>/skills/<name>/SKILL.md` arrives as the bare first-level entry `skills`, which no file
 * filter can match (measured on Windows, 2026-10-18). Hence a container target — a directory that
 * holds skills — treats every event as a catalog change, while a root target still filters, so
 * unrelated writes next to a root (`*.sqlite-wal`, logs) never trigger a reload storm.
 */
export function watchEventKey(target: WatchTarget, filename?: string | null): string | null {
  if (target.container) return target.dir
  // Sans nom (renommage, ou plateforme qui ne le fournit pas), on ne peut pas trier : on recharge.
  if (filename == null) return target.dir
  const changed = path.join(target.dir, filename.toString())
  // Anything at or below one of this root's skills containers concerns the catalog.
  for (const name of CONTAINER_DIRS) {
    const dir = path.join(target.dir, name)
    if (changed === dir || changed.startsWith(dir + path.sep)) return changed
  }
  if (isSkillFile(changed) || isConfigFile(changed)) return changed
  return null
}

// Built-in skill that ships with opencode. The model's intuition for what an
// opencode.json should look like is often wrong, and opencode hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch opencode's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_OPENCODE_SKILL_NAME = "customize-opencode"
const CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencodev2/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
})
export type Info = Schema.Schema.Type<typeof Info>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
}) {}

export class NameMismatchError extends Schema.TaggedErrorClass<NameMismatchError>()("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Skill.NotFoundError", {
  name: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Skill "${this.name}" not found. Available skills: ${this.available.join(", ") || "none"}`
  }
}

type State = {
  skills: Record<string, Info>
  dirs: Set<string>
}

type DiscoveryState = {
  matches: string[]
  dirs: string[]
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly require: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  readonly reload: () => Effect.Effect<number>
  /** Monotonic counter bumped on every reload, used to invalidate downstream caches. */
  readonly revision: () => Effect.Effect<number>
}

const add = Effect.fnUntraced(function* (state: State, match: string, bus: Bus.Interface) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) {
    // Without a name in the frontmatter a skill cannot be referenced, so it is skipped. Say so:
    // those files stay invisible in the catalog with no other trace anywhere.
    log.warn("ignored skill without a frontmatter name", { skill: match })
    return
  }

  if (state.skills[md.data.name]) {
    log.warn("duplicate skill name", {
      name: md.data.name,
      existing: state.skills[md.data.name].location,
      duplicate: match,
    })
  }

  state.dirs.add(path.dirname(match))
  state.skills[md.data.name] = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
  }
})

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      log.error(`failed to scan ${opts.scope} skills`, { dir: root, error })
      return Effect.succeed([] as string[])
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: AppFileSystem.Interface,
  global: Global.Interface,
  disableExternalSkills: boolean,
  disableClaudeCodeSkills: boolean,
  directory: string,
  worktree: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }

  const externalDirs: string[] = []
  if (!disableExternalSkills) {
    if (!disableClaudeCodeSkills) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  // Recomputed on every discovery rather than read from `config.directories()`: that one is cached in
  // the instance state at boot (config.ts:768), so a reload kept scanning the boot-time root list and
  // a skill created in a directory that appeared later stayed invisible to the `skill` tool until the
  // process restarted — the exact hole in "100% hot reload".
  const configDirs = yield* ConfigPaths.directories(directory, worktree)
  for (const dir of configDirs) {
    yield* scan(state, dir, OPENCODE_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      log.warn("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
  }
})

const loadSkills = Effect.fnUntraced(function* (state: State, discovered: DiscoveryState, bus: Bus.Interface) {
  yield* Effect.forEach(discovered.matches, (match) => add(state, match, bus), {
    concurrency: "unbounded",
    discard: true,
  })

  log.info("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    const fsys = yield* AppFileSystem.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(
          config,
          discovery,
          fsys,
          global,
          flags.disableExternalSkills,
          flags.disableClaudeCodeSkills,
          ctx.directory,
          ctx.worktree,
        )
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const s: State = { skills: {}, dirs: new Set() }
        // Register the built-in skill BEFORE disk discovery so a user-disk
        // skill with the same name can override it.
        s.skills[CUSTOMIZE_OPENCODE_SKILL_NAME] = {
          name: CUSTOMIZE_OPENCODE_SKILL_NAME,
          description: CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION,
          location: "<built-in>",
          content: CUSTOMIZE_OPENCODE_SKILL_BODY,
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), bus)
        return s
      }),
    )

    // --- Hot-reload file watcher ---
    // Watches every skill discovery root (config dirs, project/global .claude and
    // .agents, configured skills.paths), not just the global config directory:
    // discovery already scanned those, so watching only ~/.config/opencodev2 left
    // project/external skills silently stale. Events are debounced, and a null
    // filename (Windows buffer overflow) reloads everything.
    let _started = false
    let _watchers: fs.FSWatcher[] = []
    const _timers = new Map<string, ReturnType<typeof setTimeout>>()
    const DEBOUNCE_MS = 300
    let _revision = 0

    const setupWatchers = Effect.fnUntraced(function* () {
      for (const w of _watchers) w.close()
      _watchers = []
      for (const t of _timers.values()) clearTimeout(t)
      _timers.clear()

      const bridge = yield* EffectBridge.make()
      const trigger = (key: string) => {
        clearTimeout(_timers.get(key))
        _timers.set(key, setTimeout(() => {
          _timers.delete(key)
          bridge.promise(reload()).catch((err) => log.error("reload error", { err }))
        }, DEBOUNCE_MS))
      }

      const ctx = yield* InstanceState.context
      const cfg = yield* config.get()
      const roots = new Set<string>([Global.Path.config, ...(yield* config.directories())])
      // A configured skills path holds the skills itself (`**/SKILL.md`), so it is its own container.
      const containers = new Set<string>()
      if (!flags.disableExternalSkills) {
        const externalDirs = flags.disableClaudeCodeSkills
          ? [AGENTS_EXTERNAL_DIR]
          : [CLAUDE_EXTERNAL_DIR, AGENTS_EXTERNAL_DIR]
        for (const dir of externalDirs) roots.add(path.join(global.home, dir))
        const ups = yield* fsys
          .up({ targets: externalDirs, start: ctx.directory, stop: ctx.worktree })
          .pipe(Effect.catch(() => Effect.succeed([] as string[])))
        for (const dir of ups) roots.add(dir)
      }
      for (const item of cfg.skills?.paths ?? []) {
        const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
        const dir = path.isAbsolute(expanded) ? expanded : path.join(ctx.directory, expanded)
        roots.add(dir)
        containers.add(dir)
      }
      for (const root of roots) {
        for (const name of CONTAINER_DIRS) containers.add(path.join(root, name))
      }

      // A recursive watch is not dependable here: a change inside `<root>/skills/<name>/SKILL.md`
      // reaches the callback as the bare first-level entry `skills` — matched by no file filter, so
      // skills never reloaded (measured 2026-10-18). Watching non-recursively and adding the skills
      // containers as their own targets turns every change inside a skill into a first-level child
      // of a watched directory, which the OS always reports.
      const targets = new Map<string, boolean>()
      for (const dir of roots) targets.set(dir, false)
      for (const dir of containers) if (fs.existsSync(dir)) targets.set(dir, true)
      // A content change inside a skill directory never reaches the container watch — the directory
      // entry does not change — so every skill directory is watched as well. Deriving them from the
      // catalog also means a reload re-arms them, which is how a newly created skill starts being
      // watched.
      const current = yield* InstanceState.get(state)
      for (const info of Object.values(current.skills)) {
        const dir = path.dirname(info.location)
        if (fs.existsSync(dir)) targets.set(dir, true)
      }
      log.debug("hot-reload targets", { count: targets.size, roots: [...roots] })

      for (const [dir, container] of targets) {
        if (!fs.existsSync(dir)) continue
        try {
          _watchers.push(
            fs.watch(dir, { recursive: false }, (_eventType, filename) => {
              const key = watchEventKey({ dir, container }, filename)
              if (key) trigger(key)
            }),
          )
        } catch (err) {
          log.warn("cannot watch directory for skills", { dir, err })
        }
      }
      if (_watchers.length > 0) log.info("hot-reload watchers active", { dirs: _watchers.length })
    })

    const ensureStarted = Effect.fnUntraced(function* () {
      if (_started) return
      log.info("ensureStarted: setting up watchers")
      yield* setupWatchers().pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => log.warn("ensureStarted: setupWatchers failed", { cause: String(cause) })),
        ),
      )
      _started = true
      log.info("ensureStarted: done")
    })

    const get = Effect.fn("Skill.get")(function* (name: string) {
      yield* ensureStarted()
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const require = Effect.fn("Skill.require")(function* (name: string) {
      yield* ensureStarted()
      const s = yield* InstanceState.get(state)
      const info = s.skills[name]
      if (info) return info
      return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
    })

    const all = Effect.fn("Skill.all")(function* () {
      yield* ensureStarted()
      const s = yield* InstanceState.get(state)
      return Object.values(s.skills)
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      yield* ensureStarted()
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      yield* ensureStarted()
      const s = yield* InstanceState.get(state)
      const list = Object.values(s.skills).toSorted((a, b) => a.name.localeCompare(b.name))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    const reload = Effect.fn("Skill.reload")(function* () {
      yield* ensureStarted()
      // Bump the revision so downstream caches (prompt injection, retrieval
      // ranking) drop stale skill text.
      _revision += 1
      // Invalidate both caches — next get() re-runs discovery + loading
      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
      const s = yield* InstanceState.get(state)
      const count = Object.keys(s.skills).length
      log.info("reload", { count, revision: _revision })
      // Re-establish watchers (roots may have changed after re-discovery)
      yield* setupWatchers().pipe(Effect.catchCause(() => Effect.void))
      return count
    })

    const revision = Effect.fn("Skill.revision")(function* () {
      return _revision
    })

    // Close every watcher when the layer scope is torn down so the process (and
    // tests) do not leak fs.watch handles.
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const w of _watchers) w.close()
        _watchers = []
        for (const t of _timers.values()) clearTimeout(t)
        _timers.clear()
      }),
    )

    return Service.of({ get, require, all, dirs, available, reload, revision })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Discovery.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Bus.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export type FormatMode = "verbose" | "summary" | "caveman"

function formatMode(opts: { verbose: boolean } | { mode: FormatMode }): FormatMode {
  return "mode" in opts ? opts.mode : opts.verbose ? "verbose" : "summary"
}

/**
 * Display cap for descriptions in the injected skills list.
 *
 * The list exists so the model can decide which skills to load on demand —
 * a name plus a one-line hint is enough for that decision. Descriptions are
 * frequently long keyword blocks (the full text is still used for BM25
 * ranking and for the `skill` tool payload), so showing them verbatim in the
 * system prompt burns tokens on every turn for no discovery gain.
 */
const DESCRIPTION_DISPLAY_CHARS = 200

function clipDescription(description: string): string {
  if (description.length <= DESCRIPTION_DISPLAY_CHARS) return description
  return `${description.slice(0, DESCRIPTION_DISPLAY_CHARS - 1)}…`
}

export function fmt(list: Info[], opts: { verbose: boolean } | { mode: FormatMode }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  const mode = formatMode(opts)
  if (mode === "verbose") {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${clipDescription(skill.description!)}</description>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }
  if (mode === "caveman") {
    return [
      "SKILLS:",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((skill) => `- ${skill.name} :: ${clipDescription(skill.description!)}`),
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${clipDescription(skill.description!)}`),
  ].join("\n")
}

export * as Skill from "."
