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

const workingPlugin = (marker: string) =>
  [
    "export default async () => ({",
    `  ${JSON.stringify(systemHook)}: (_input, output) => {`,
    `    output.system.unshift(${JSON.stringify(marker)})`,
    "  },",
    "})",
    "",
  ].join("\n")

// A plugin file that cannot be imported at all: this is the realistic outcome of a bad edit, and it
// fails inside the loader (stage "load"), not inside the plugin factory.
const brokenPlugin = "export default async () => {\n  throw new Error(\n}\n"

describe("plugin reload atomicity", () => {
  it.live("keeps the previous hook generation when the edited plugin no longer loads", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, "plugin.ts")
        yield* Effect.promise(() => Bun.write(file, workingPlugin("v1")))

        const plugin = yield* Plugin.Service
        const trigger = Effect.fn("PluginReloadRollback.probe")(function* () {
          const out = { system: [] as string[] }
          yield* plugin.trigger(
            systemHook,
            { model: { providerID: ProviderID.anthropic, modelID: ModelID.make("claude-sonnet-4-6") } },
            out,
          )
          return out.system
        })

        const first = yield* trigger()
        const firstVersion = yield* plugin.version()

        // Break the plugin, then reload: the session must not lose the hooks it was served.
        yield* Effect.promise(() => Bun.write(file, brokenPlugin))
        yield* plugin.reload()

        const afterBreak = yield* trigger()
        const afterBreakVersion = yield* plugin.version()

        // Repair it and reload again: the swap must go through.
        yield* Effect.promise(() => Bun.write(file, workingPlugin("v3")))
        yield* plugin.reload()
        const afterRepair = yield* trigger()

        console.log(
          `RELOAD_ROLLBACK_OBSERVATION first=${JSON.stringify(first)} afterBreak=${JSON.stringify(afterBreak)} ` +
            `afterRepair=${JSON.stringify(afterRepair)} version=${firstVersion}->${afterBreakVersion}`,
        )

        expect(first).toEqual(["v1"])
        expect(afterBreak).toEqual(["v1"])
        expect(afterRepair).toEqual(["v3"])
      }),
    ),
  )
})
