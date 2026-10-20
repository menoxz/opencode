/**
 * Découverte des garde-fous injectables — spec : `specs/injectable-guards.md`.
 *
 * Un garde-fou est un `.md` dans `guards/` (global) ou `<projet>/.opencode/guards/`, avec un
 * frontmatter `name` / `description` / `when`. Ce module ne fait que découvrir, valider et exposer :
 * il n'injecte rien. Le branchement sur le prompt est une étape séparée, et c'est voulu — la décision
 * d'injecter reste une fonction pure testable (`./triggers`).
 *
 * Une garde invalide ne disparaît pas en silence : elle est écartée du catalogue et son message est
 * exposé par `errors()`. Sinon on retombe sur le mode d'échec mesuré sur cette session — une consigne
 * présente sur disque et absente de l'esprit du modèle, sans aucune trace.
 */
import path from "path"
import fs from "fs"
import { Effect, Layer, Context, Schema } from "effect"
import { Global } from "@opencode-ai/core/global"
import { Glob } from "@opencode-ai/core/util/glob"
import * as Log from "@opencode-ai/core/util/log"
import { ConfigMarkdown } from "@/config/markdown"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import { compileGuard, GuardDefinitionError, type CompiledGuard } from "./triggers"

const log = Log.create({ service: "guard" })

/** Un dossier de gardes, et s'il contient directement les fichiers (il est alors sa propre cible). */
export type WatchTarget = { dir: string; container: boolean }

export const GUARD_PATTERN = "*.md"
const DEBOUNCE_MS = 300

export type GuardInfo = {
  name: string
  description?: string
  location: string
  body: string
}

type State = {
  guards: Record<string, CompiledGuard>
  errors: { location: string; message: string }[]
}

type WatchState = {
  started: boolean
  watchers: fs.FSWatcher[]
  timers: Map<string, ReturnType<typeof setTimeout>>
  revision: number
}

export interface Interface {
  readonly all: () => Effect.Effect<CompiledGuard[]>
  readonly get: (name: string) => Effect.Effect<CompiledGuard | undefined>
  readonly errors: () => Effect.Effect<{ location: string; message: string }[]>
  readonly reload: () => Effect.Effect<number>
  readonly revision: () => Effect.Effect<number>
}

/** Dossiers de découverte pour l'instance courante : le global, puis le projet. */
export function guardRoots(input: { configDir: string; directory: string; worktree: string }): string[] {
  const roots = [path.join(input.configDir, "guards"), path.join(input.directory, ".opencode", "guards")]
  if (input.worktree && input.worktree !== input.directory) {
    roots.push(path.join(input.worktree, ".opencode", "guards"))
  }
  return [...new Set(roots)]
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Guard") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Guard.state")(function* (ctx) {
        const s: State = { guards: {}, errors: [] }
        const roots = guardRoots({ configDir: global.config, directory: ctx.directory, worktree: ctx.worktree })
        for (const root of roots) {
          if (!fs.existsSync(root)) continue
          // Le canal d'erreur doit rester `never` : cet Effect construit l'état d'instance. Un scan
          // qui échoue dégrade en « aucune garde dans ce dossier », il ne casse pas le service — d'où
          // le `catch` au point d'appel plutôt qu'un try/catch synchrone autour du `yield*`.
          const files = yield* Effect.tryPromise(() =>
            Glob.scan(GUARD_PATTERN, { cwd: root, absolute: true, include: "file" }),
          ).pipe(
            Effect.catch((error) => {
              log.error("failed to scan guards", { dir: root, error })
              return Effect.succeed([] as string[])
            }),
          )
          for (const file of files) {
            const parsed = yield* Effect.tryPromise(() => ConfigMarkdown.parse(file)).pipe(
              Effect.catch((error) =>
                Effect.sync(() => {
                  const message = String((error as { message?: string })?.message ?? error)
                  s.errors.push({ location: file, message })
                  log.warn("failed to parse guard", { guard: file, message })
                  return undefined
                }),
              ),
            )
            if (!parsed) continue
            const data = parsed.data as { name?: unknown; description?: unknown; when?: unknown }
            const name = typeof data.name === "string" ? data.name : undefined
            if (!name) {
              s.errors.push({ location: file, message: "missing name in frontmatter" })
              log.warn("ignored guard without a name", { guard: file })
              continue
            }
            const when =
              data.when && typeof data.when === "object" && !Array.isArray(data.when)
                ? (data.when as Record<string, unknown>)
                : {}
            try {
              // compileGuard lève : on garde le message pour `errors()` plutôt que de perdre la garde
              // sur disque sans trace.
              s.guards[name] = compileGuard({
                name,
                description: typeof data.description === "string" ? data.description : undefined,
                body: parsed.content,
                when,
              })
            } catch (error) {
              const message = error instanceof GuardDefinitionError ? error.message : String(error)
              s.errors.push({ location: file, message })
              log.warn("invalid guard", { guard: file, message })
            }
          }
        }
        log.info("init", { count: Object.keys(s.guards).length, errors: s.errors.length })
        return s
      }),
    )

    // --- Veilleurs, PAR INSTANCE ---
    // Même leçon que le correctif des skills (`c7dedab05`) : un registre au scope du layer ne serait
    // armé que par la première instance, et les autres ne rechargeraient jamais leur catalogue.
    const opened = new Set<fs.FSWatcher>()
    const watchState = yield* InstanceState.make<WatchState>(
      Effect.fn("Guard.watch")(function* () {
        return { started: false, watchers: [], timers: new Map(), revision: 0 } satisfies WatchState
      }),
    )

    const setupWatchers = Effect.fnUntraced(function* (watch: WatchState) {
      for (const w of watch.watchers) {
        w.close()
        opened.delete(w)
      }
      watch.watchers = []
      for (const t of watch.timers.values()) clearTimeout(t)
      watch.timers.clear()

      const bridge = yield* EffectBridge.make()
      const trigger = (key: string) => {
        clearTimeout(watch.timers.get(key))
        watch.timers.set(
          key,
          setTimeout(() => {
            watch.timers.delete(key)
            bridge.promise(reload()).catch((err) => log.error("reload error", { err }))
          }, DEBOUNCE_MS),
        )
      }

      const ctx = yield* InstanceState.context
      const roots = guardRoots({ configDir: global.config, directory: ctx.directory, worktree: ctx.worktree })
      for (const dir of roots) {
        if (!fs.existsSync(dir)) continue
        try {
          const watcher = fs.watch(dir, { recursive: false }, () => trigger(dir))
          watch.watchers.push(watcher)
          opened.add(watcher)
        } catch (err) {
          log.warn("cannot watch directory for guards", { dir, err })
        }
      }
      if (watch.watchers.length > 0) log.info("hot-reload watchers active", { dirs: watch.watchers.length })
    })

    const ensureStarted = Effect.fnUntraced(function* () {
      const watch = yield* InstanceState.get(watchState)
      if (watch.started) return
      yield* setupWatchers(watch).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => log.warn("ensureStarted: setupWatchers failed", { cause: String(cause) })),
        ),
      )
      watch.started = true
    })

    const all = Effect.fn("Guard.all")(function* () {
      yield* ensureStarted()
      const s = yield* InstanceState.get(state)
      return Object.values(s.guards).toSorted((a, b) => a.name.localeCompare(b.name))
    })

    const get = Effect.fn("Guard.get")(function* (name: string) {
      yield* ensureStarted()
      return (yield* InstanceState.get(state)).guards[name]
    })

    const errors = Effect.fn("Guard.errors")(function* () {
      yield* ensureStarted()
      return (yield* InstanceState.get(state)).errors
    })

    const reload = Effect.fn("Guard.reload")(function* () {
      yield* ensureStarted()
      const watch = yield* InstanceState.get(watchState)
      watch.revision += 1
      yield* InstanceState.invalidate(state)
      const s = yield* InstanceState.get(state)
      const count = Object.keys(s.guards).length
      log.info("reload", { count, revision: watch.revision, errors: s.errors.length })
      yield* setupWatchers(watch).pipe(Effect.catchCause(() => Effect.void))
      return count
    })

    const revision = Effect.fn("Guard.revision")(function* () {
      return (yield* InstanceState.get(watchState)).revision
    })

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const w of opened) w.close()
        opened.clear()
      }),
    )

    return Service.of({ all, get, errors, reload, revision })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Global.layer))

export type Info = Schema.Schema.Type<typeof GuardInfoSchema>
const GuardInfoSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  body: Schema.String,
})

export * as Guard from "."
