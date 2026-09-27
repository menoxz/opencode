import { Config } from "@/config/config"
import { Plugin } from "@/plugin/index"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { AddPayload } from "../groups/plugin"

export const pluginHandlers = HttpApiBuilder.group(InstanceHttpApi, "plugin", (handlers) =>
  Effect.gen(function* () {
    const plugin = yield* Plugin.Service
    const config = yield* Config.Service

    const status = Effect.fn("PluginHttpApi.status")(function* () {
      const loaded = yield* plugin.list()
      const info = yield* config.get()
      return {
        version: yield* plugin.version(),
        origins: (info.plugin_origins ?? []).map((origin) => ({
          // An origin may be declared as [spec, options]; only the specifier is meaningful here.
          spec: Array.isArray(origin.spec) ? String(origin.spec[0]) : String(origin.spec),
          scope: String(origin.scope),
        })),
        hooks: [
          ...new Set(
            loaded.flatMap((entry) =>
              Object.keys(entry).filter((name) => typeof (entry as Record<string, unknown>)[name] === "function"),
            ),
          ),
        ],
      }
    })

    const reload = Effect.fn("PluginHttpApi.reload")(function* () {
      yield* plugin.reload()
      return yield* status()
    })

    const add = Effect.fn("PluginHttpApi.add")(function* (ctx: { payload: typeof AddPayload.Type }) {
      const current = yield* config.getGlobal()
      yield* config.updateGlobal({ ...current, plugin: [...new Set([...(current.plugin ?? []), ctx.payload.spec])] })
      yield* plugin.reload()
      return yield* status()
    })

    const remove = Effect.fn("PluginHttpApi.remove")(function* (ctx: { params: { spec: string } }) {
      const current = yield* config.getGlobal()
      yield* config.updateGlobal({ ...current, plugin: (current.plugin ?? []).filter((item) => item !== ctx.params.spec) })
      yield* plugin.reload()
      return yield* status()
    })

    return handlers.handle("list", () => status()).handle("reload", () => reload()).handle("add", add).handle("remove", remove)
  }),
)
