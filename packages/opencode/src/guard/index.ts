/**
 * Service de découverte des garde-fous injectables — spec : `specs/injectable-guards.md`.
 *
 * Un garde-fou est un `.md` dans `guards/` (global) ou `<projet>/.opencode/guards/`. Ce service
 * découvre, valide et expose : il n'injecte rien. La décision d'injecter reste une fonction pure
 * testable (`./triggers`), et le parse est partagé avec la commande de dry-run (`./parse`), pour que
 * l'instrument et le service ne puissent pas diverger.
 *
 * Une garde invalide ne disparaît pas en silence : elle est écartée du catalogue et son message est
 * exposé par `errors()`. Sans ça on retombe sur le mode d'échec mesuré : une consigne présente sur
 * disque, absente de l'esprit du modèle, sans aucune trace.
 */
import path from "path"
import fs from "fs"
import { Effect, Layer, Context } from "effect"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { CompiledGuard } from "./triggers"
import { loadGuardRoots, type GuardError } from "./parse"

const log = Log.create({ service: "guard" })

const DEBOUNCE_MS = 300

type State = {
  guards: Record<string, CompiledGuard>
  errors: GuardError[]
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
  readonly errors: () => Effect.Effect<GuardError[]>
  readonly reload: () => Effect.Effect<number>
  readonly revision: () => Effect.Effect<number>
}

/** Dossiers de découverte : global d'abord, puis projet (le projet gagne sur un nom identique). */
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
        const roots = guardRoots({ configDir: global.config, directory: ctx.directory, worktree: ctx.worktree })
        // Pas de `knownTools` ici : le service ne dépend volontairement pas du registre d'outils, qui
        // n'est pas résolu à ce point du cycle de vie. La disponibilité est vérifiée à l'évaluation,
        // avec les outils réellement offerts au step — c'est le seul endroit où l'information existe.
        const result = yield* Effect.promise(() => loadGuardRoots(roots))
        const guards: Record<string, CompiledGuard> = {}
        for (const guard of result.guards) guards[guard.name] = guard
        for (const error of result.errors) log.warn("invalid guard", { guard: error.location, message: error.message })
        log.info("init", { count: result.guards.length, errors: result.errors.length })
        return { guards, errors: result.errors } satisfies State
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

    // Une seule implémentation du rechargement, partagée par le déclencheur de veilleur et par l'API
    // publique : deux copies divergeraient sur le comptage de révision.
    const doReload = Effect.fnUntraced(function* (watch: WatchState) {
      watch.revision += 1
      yield* InstanceState.invalidate(state)
      const s = yield* InstanceState.get(state)
      const count = Object.keys(s.guards).length
      log.info("reload", { count, revision: watch.revision, errors: s.errors.length })
      yield* setupWatchers(watch).pipe(Effect.catchCause(() => Effect.void))
      return count
    })

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
            bridge.promise(doReload(watch)).catch((err) => log.error("reload error", { err }))
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
      return yield* doReload(yield* InstanceState.get(watchState))
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

export * as Guard from "."
