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
import { homedir } from "os"
import { Effect, Layer, Context, Option } from "effect"
import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import { ToolRegistry } from "@/tool/registry"
import { Config } from "@/config/config"
import type { CompiledGuard } from "./triggers"
import { loadGuardRoots, type GuardError } from "./parse"

const log = Log.create({ service: "guard" })

const DEBOUNCE_MS = 300

type State = {
  guards: Record<string, CompiledGuard>
  errors: GuardError[]
  /** Répartition par provenance, pour l'affichage : global (config utilisateur) ou dépôt local. */
  summary: { global: string[]; project: string[] }
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
  /** Gardes chargées, réparties par provenance — sert à l'affichage du stream. */
  readonly summary: () => Effect.Effect<{ global: string[]; project: string[] }>
  readonly reload: () => Effect.Effect<number>
  readonly revision: () => Effect.Effect<number>
}

/** Dossiers de découverte : global, projet, puis les dossiers déclarés dans `guards.paths`. */
export function guardRoots(input: {
  configDir: string
  directory: string
  worktree: string
  extra?: readonly string[]
}): string[] {
  const roots = [path.join(input.configDir, "guards"), path.join(input.directory, ".opencode", "guards")]
  if (input.worktree && input.worktree !== input.directory) {
    roots.push(path.join(input.worktree, ".opencode", "guards"))
  }
  for (const item of input.extra ?? []) {
    const trimmed = item?.trim()
    if (!trimmed) continue
    // `~/` est la seule forme relative acceptée : le reste est résolu tel quel, pour qu'un chemin
    // relatif ne dépende pas du dossier courant du processus.
    const expanded = trimmed.startsWith("~/") ? path.join(homedir(), trimmed.slice(2)) : trimmed
    roots.push(path.resolve(expanded))
  }
  // Dédoublonnage sur le chemin **résolu** : `path.join("/cfg","guards")` et `path.resolve("/cfg/guards")`
  // désignent le même dossier mais ne s'écrivent pas pareil sur Windows. On rend la première forme
  // rencontrée, pour que les racines par défaut gardent leur écriture d'origine.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const root of roots) {
    const key = path.resolve(root)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(root)
  }
  return unique
}

/**
 * Cibles de veille : le dossier de gardes lui-même (tout événement le concerne) et son **parent**,
 * filtré. Sans le parent, un dossier `guards/` créé après le démarrage n'était jamais surveillé : le
 * service ne le voyait qu'au redémarrage suivant, alors que les skills, elles, apparaissent à chaud.
 */
export function guardWatchTargets(roots: string[]): Map<string, boolean> {
  const targets = new Map<string, boolean>()
  for (const root of roots) {
    const parent = path.dirname(root)
    if (parent !== root && fs.existsSync(parent)) targets.set(parent, false)
    if (fs.existsSync(root)) targets.set(root, true)
  }
  return targets
}

/**
 * Ce qu'un événement brut signifie pour le catalogue des gardes : la clé de debounce, ou `null` si
 * l'écriture ne concerne pas les gardes. Le filtre est indispensable sur un parent partagé : sans
 * lui, chaque écriture dans `.opencode/skills` ou dans la config globale rechargerait les gardes.
 */
export function guardWatchKey(
  roots: string[],
  target: { dir: string; container: boolean },
  filename?: string | null,
): string | null {
  if (target.container) return target.dir
  if (filename == null) return target.dir
  const changed = path.join(target.dir, filename.toString())
  for (const root of roots) {
    if (changed === root || changed.startsWith(root + path.sep)) return changed
  }
  return null
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Guard") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service

    // Réglages lus de façon optionnelle : le service ne doit pas exiger `Config` dans ses
    // requirements (ce qui casserait les layers de test et l'ordre de résolution). Absent, on
    // retombe sur les racines par défaut et tout est actif.
    const guardConfig = Effect.fnUntraced(function* () {
      const config = Option.getOrUndefined(yield* Effect.serviceOption(Config.Service))
      if (!config) return { extra: [] as string[], enabled: true, disable: [] as string[] }
      const info = (yield* config.get()).guards
      return {
        extra: info?.paths ?? [],
        enabled: info?.enabled !== false,
        disable: info?.disable ?? [],
      }
    })

    const state = yield* InstanceState.make<State>(
      Effect.fn("Guard.state")(function* (ctx) {
        const settings = yield* guardConfig()
        if (!settings.enabled) {
          log.info("init", { count: 0, errors: 0, disabled: true })
          return { guards: {}, errors: [], summary: { global: [], project: [] } } satisfies State
        }
        const roots = guardRoots({
          configDir: global.config,
          directory: ctx.directory,
          worktree: ctx.worktree,
          extra: settings.extra,
        })
        // Le registre est lu de façon **optionnelle** : il n'est pas toujours résolu à ce point du
        // cycle de vie, et l'exiger changerait les requirements du layer (ce qui avait cassé le
        // câblage). Présent, il sert de référence pour refuser un nom d'outil inexistant ; absent, on
        // ne valide pas les noms ici — la disponibilité reste vérifiée à l'évaluation, avec les outils
        // réellement offerts au step.
        const registry = Option.getOrUndefined(yield* Effect.serviceOption(ToolRegistry.Service))
        const knownTools = registry ? yield* registry.ids() : undefined
        const result = yield* Effect.promise(() =>
          loadGuardRoots(roots, { knownTools, globalRoot: path.join(global.config, "guards") }),
        )
        const guards: Record<string, CompiledGuard> = {}
        const disabled = new Set(settings.disable)
        for (const guard of result.guards) {
          // `disable` est une sourdine par nom : le fichier reste sur disque, la garde ne charge pas.
          if (disabled.has(guard.name)) continue
          guards[guard.name] = guard
        }
        if (disabled.size > 0) log.info("guards disabled by config", { names: [...disabled] })
        for (const error of result.errors) log.warn("invalid guard", { guard: error.location, message: error.message })
        if (knownTools) {
          const available = new Set(knownTools)
          const unavailable = [
            ...new Set(
              result.guards.flatMap((guard) =>
                guard.tools.map((condition) => condition.tool).filter((tool) => !available.has(tool)),
              ),
            ),
          ].sort()
          if (unavailable.length > 0) log.warn("guards reference unavailable tools", { tools: unavailable })
        }
        const summary: { global: string[]; project: string[] } = { global: [], project: [] }
        for (const guard of Object.values(guards)) {
          summary[guard.origin === "global" ? "global" : "project"].push(guard.name)
        }
        log.info("init", { count: result.guards.length, errors: result.errors.length, validated: Boolean(knownTools) })
        return { guards, errors: result.errors, summary } satisfies State
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
      const settings = yield* guardConfig()
      const roots = guardRoots({
        configDir: global.config,
        directory: ctx.directory,
        worktree: ctx.worktree,
        extra: settings.extra,
      })
      for (const [dir, container] of guardWatchTargets(roots)) {
        try {
          const watcher = fs.watch(dir, { recursive: false }, (_event, filename) => {
            const key = guardWatchKey(roots, { dir, container }, filename?.toString())
            if (key) trigger(key)
          })
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

    const summary = Effect.fn("Guard.summary")(function* () {
      yield* ensureStarted()
      return (yield* InstanceState.get(state)).summary
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

    return Service.of({ all, get, errors, summary, reload, revision })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Global.layer))

export * as Guard from "."
