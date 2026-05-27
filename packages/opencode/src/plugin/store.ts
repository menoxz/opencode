export * as PluginStore from "."

import { Effect, Context, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { execSync } from "child_process"

const log = Log.create({ service: "plugin.store" })

export interface PluginInfo {
  name: string
  description: string
  version: string
  author?: string
  tags: string[]
  downloads: number
  opencodeVersion: string
  hooks: string[]
}

export interface Interface {
  readonly search: (query: string) => Effect.Effect<PluginInfo[]>
  readonly install: (name: string) => Effect.Effect<void>
  readonly uninstall: (name: string) => Effect.Effect<void>
  readonly list: () => Effect.Effect<PluginInfo[]>
  readonly info: (name: string) => Effect.Effect<PluginInfo | null>
  readonly update: (name: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PluginStore") {}

const npmSearch = (query: string): Effect.Effect<PluginInfo[]> =>
  Effect.tryPromise({
    try: () =>
      fetch(
        `https://registry.npmjs.org/-/v1/search?text=keywords:opencode-plugin+${encodeURIComponent(query)}&size=20`,
      ).then((r) => r.json()),
    catch: (err) => err,
  }).pipe(
    Effect.map((response: any) => {
      const objects = response.objects ?? []
      return objects.map((obj: any) => ({
        name: obj.package.name,
        description: obj.package.description,
        version: obj.package.version,
        author: obj.package.author?.name,
        tags: obj.package.keywords ?? [],
        downloads: obj.package.downloads?.monthly ?? 0,
        opencodeVersion: ">=1.0.0",
        hooks: [],
      })) as PluginInfo[]
    }),
    Effect.catch(() => Effect.succeed([] as PluginInfo[])),
  )

const npmExec = (cmd: string): Effect.Effect<void> =>
  Effect.sync(() => {
    const installDir = process.env.HOME || process.env.USERPROFILE || process.cwd()
    execSync(cmd, { cwd: installDir, stdio: "pipe" })
  }).pipe(Effect.catch(() => Effect.void))

const npmList = (): Effect.Effect<PluginInfo[]> =>
  Effect.sync(() => {
    const output = execSync("npm list --json --depth=0 2>/dev/null", { encoding: "utf-8" })
    const parsed = JSON.parse(output)
    const deps = { ...parsed.dependencies, ...parsed.devDependencies }
    const plugins: PluginInfo[] = []
    for (const [name, info] of Object.entries(deps)) {
      if (name.includes("opencode-") || name.includes("mcp-")) {
        plugins.push({
          name,
          description: "",
          version: (info as any).version ?? "0.0.0",
          tags: [],
          downloads: 0,
          opencodeVersion: ">=1.0.0",
          hooks: [],
        })
      }
    }
    return plugins
  }).pipe(Effect.catch(() => Effect.succeed([] as PluginInfo[])))

export const defaultLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    log.info("PluginStore service initialized")

    const search = (query: string) => {
      log.info(`Searching for plugins: ${query}`)
      return npmSearch(query)
    }

    const install = (name: string) => {
      log.info(`Installing plugin: ${name}`)
      return npmExec(`npm install ${name} --save`).pipe(
        Effect.tap(() => Effect.sync(() => log.info(`Plugin installed: ${name}`))),
      )
    }

    const uninstall = (name: string) => {
      log.info(`Uninstalling plugin: ${name}`)
      return npmExec(`npm uninstall ${name}`).pipe(
        Effect.tap(() => Effect.sync(() => log.info(`Plugin uninstalled: ${name}`))),
      )
    }

    const list = () => {
      return npmList()
    }

    const info = (name: string) => {
      return npmSearch(name).pipe(Effect.map((results) => results.find((p) => p.name === name) ?? null))
    }

    const update = (name: string) => {
      log.info(`Updating plugin: ${name}`)
      return install(name)
    }

    return Service.of({ search, install, uninstall, list, info, update } as Interface)
  }),
)
