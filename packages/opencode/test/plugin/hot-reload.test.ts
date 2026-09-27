import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { InstanceState } from "../../src/effect/instance-state"
import path from "path"
import { pathToFileURL } from "url"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { emptyConsoleState } from "../../src/config/console-state"
import { PluginLoader } from "../../src/plugin/loader"
import { Plugin } from "../../src/plugin/index"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const originLayer = Layer.effect(
  Config.Service,
  Effect.gen(function* () {
    return Config.Service.of({
      get: () =>
        InstanceState.directory.pipe(
          Effect.map((dir) => ({
            plugin_origins: [
              {
                spec: pathToFileURL(path.join(dir, "plugin.ts")).href,
                source: path.join(dir, "opencode.json"),
                scope: "global" as const,
              },
            ],
          })),
        ),
      getGlobal: () => Effect.succeed({}),
      getConsoleState: () => Effect.succeed(emptyConsoleState),
      update: () => Effect.void,
      updateGlobal: (config: Config.Info) => Effect.succeed({ info: config, changed: false }),
      invalidate: () => Effect.void,
      directories: () => Effect.succeed([]),
      waitForDependencies: () => Effect.void,
    })
  }),
)

const it = testEffect(
  Layer.mergeAll(
    Plugin.layer.pipe(
      Layer.provide(Bus.layer),
      Layer.provide(originLayer),
      Layer.provide(RuntimeFlags.layer({ disableDefaultPlugins: true })),
    ),
    CrossSpawnSpawner.defaultLayer,
  ),
)

const systemHook = "experimental.chat.system.transform"

const pluginSource = (marker: string) =>
  [
    "export default async () => ({",
    `  ${JSON.stringify(systemHook)}: (_input, output) => {`,
    `    output.system.unshift(${JSON.stringify(marker)})`,
    "  },",
    "})",
    "",
  ].join("\n")

// Characterization tests for the plugin hot-reload path.
//
// As of this study the plugin file watcher fires `Plugin.reload()` correctly, but
// `PluginLoader` re-imports the *same* file URL and Bun returns the cached ESM
// module, so edited plugin *code* does not take effect without a process restart.
// The label "hot reload" holds for config/agents/skills/MCP and for plugin
// *listing* changes, not for plugin code.
//
// WHEN THE FIX LANDS (cache-busted import URL on reload) the two assertions
// marked `expected after fix` must be inverted to `"v2"`.
describe("plugin hot reload", () => {
  it.live("keeps serving the cached module for the same specifier", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, "plugin.ts")
        yield* Effect.promise(() => Bun.write(file, pluginSource("v1")))

        const plugin = yield* Plugin.Service
        const trigger = Effect.fn("PluginHotReload.probe")(function* () {
          const out = { system: [] as string[] }
          yield* plugin.trigger(
            systemHook,
            { model: { providerID: ProviderID.anthropic, modelID: ModelID.make("claude-sonnet-4-6") } },
            out,
          )
          return out.system
        })

        const first = yield* trigger()
        yield* Effect.promise(() => Bun.write(file, pluginSource("v2")))
        yield* plugin.reload()
        const second = yield* trigger()

        console.log(`HOTRELOAD_OBSERVATION first=${JSON.stringify(first)} second=${JSON.stringify(second)}`)
        expect(first).toEqual(["v1"])
        expect(second).toEqual(["v1"]) // expected after fix: ["v2"]
      }),
    ),
  )

  it.live("re-reads changed code when the imported file path changes", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, "cache-bust-plugin.ts")
        yield* Effect.promise(() => Bun.write(file, `export const marker = "v1"\n`))
        const spec = pathToFileURL(file).href

        const first = (yield* Effect.promise(() => import(spec))) as { marker: string }
        yield* Effect.promise(() => Bun.write(file, `export const marker = "v2"\n`))
        const cached = (yield* Effect.promise(() => import(spec))) as { marker: string }
        const queryBusted = (yield* Effect.promise(() => import(`${spec}?v=${Date.now()}`))) as { marker: string }

        // Distinct path, same content as the edited file: bypasses any path-keyed cache.
        const copy = path.join(dir, `cache-bust-plugin.reload-${Date.now()}.ts`)
        yield* Effect.promise(() => Bun.write(copy, `export const marker = "v2"\n`))
        const copied = (yield* Effect.promise(() => import(pathToFileURL(copy).href))) as { marker: string }

        console.log(
          `CACHE_BUST_OBSERVATION first=${first.marker} cached=${cached.marker} queryBusted=${queryBusted.marker} copied=${copied.marker}`,
        )
        expect(first.marker).toBe("v1")
        expect(cached.marker).toBe("v1")
        expect(copied.marker).toBe("v2")
      }),
    ),
  )

  it.live("PluginLoader returns the first import for a repeated specifier", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, "loader-plugin.ts")
        yield* Effect.promise(() => Bun.write(file, `export const marker = "v1"\nexport default async () => ({})\n`))
        const spec = pathToFileURL(file).href
        const first = yield* Effect.promise(() =>
          PluginLoader.loadExternal({
            items: [{ spec, scope: "global", source: path.join(dir, "opencode.json") }],
            kind: "server",
          }),
        )
        yield* Effect.promise(() => Bun.write(file, `export const marker = "v2"\nexport default async () => ({})\n`))
        const second = yield* Effect.promise(() =>
          PluginLoader.loadExternal({
            items: [{ spec, scope: "global", source: path.join(dir, "opencode.json") }],
            kind: "server",
          }),
        )

        const observed = {
          first: (first[0]?.mod as { marker?: string } | undefined)?.marker,
          second: (second[0]?.mod as { marker?: string } | undefined)?.marker,
        }
        console.log(`LOADER_OBSERVATION ${JSON.stringify(observed)}`)
        expect(observed.first).toBe("v1")
        expect(observed.second).toBe("v1") // expected after fix: "v2"
      }),
    ),
  )
})
