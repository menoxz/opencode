import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { Bus } from "@/bus"
import { Installation } from "@/installation"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { InstanceStore } from "@/project/instance-store"
import { JevCatalogue } from "@/jev/catalogue"
import { JevClient } from "@/jev/client"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import * as Log from "@opencode-ai/core/util/log"
import { Effect, Option, Queue, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpClient, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { RootHttpApi } from "../api"
import { GlobalUpgradeInput } from "../groups/global"

const log = Log.create({ service: "server" })

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

function parseBody(body: string) {
  try {
    return JSON.parse(body || "{}") as unknown
  } catch {
    return undefined
  }
}

function eventResponse() {
  log.info("global event connected")
  const events = Stream.callback<GlobalBusEvent>((queue) => {
    const handler = (event: GlobalBusEvent) => Queue.offerUnsafe(queue, event)
    return Effect.acquireRelease(
      Effect.sync(() => GlobalBus.on("event", handler)),
      () => Effect.sync(() => GlobalBus.off("event", handler)),
    )
  })
  const heartbeat = Stream.tick("10 seconds").pipe(
    Stream.drop(1),
    Stream.map(() => ({ payload: { id: Bus.createID(), type: "server.heartbeat", properties: {} } })),
  )

  return HttpServerResponse.stream(
    Stream.make({ payload: { id: Bus.createID(), type: "server.connected", properties: {} } }).pipe(
      Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
      Stream.map(eventData),
      Stream.pipeThroughChannel(Sse.encode()),
      Stream.encodeText,
      Stream.ensuring(Effect.sync(() => log.info("global event disconnected"))),
    ),
    {
      contentType: "text/event-stream",
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    },
  )
}

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    // Optional on purpose: this group is also built by harnesses that provide only what the other
    // global routes need, and a missing store must degrade the Jev refresh, not the whole group.
    const store = Option.getOrUndefined(yield* Effect.serviceOption(InstanceStore.Service))
    const http = yield* HttpClient.HttpClient
    const bridge = yield* EffectBridge.make()

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* () {
      return eventResponse()
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    /**
     * Drops the config cache of every live instance, in place.
     *
     * The Jev settings are re-read through `Config.get()` on the decision itself, so a cache drop
     * is all it takes for a new choice to apply — where `disposeAllInstances`, the historical
     * path for a global config change, also rebuilt every instance and aborted the turn in
     * flight. Only used for patches `Config.hotReloadablePatch` classifies as safe.
     */
    const refreshConfig = Effect.fnUntraced(function* () {
      if (!store) {
        yield* Effect.logWarning(
          "global config changed but the instance store is unavailable; live instances keep their cached config",
        )
        return
      }
      for (const directory of store.directories()) {
        yield* store.provide({ directory }, config.invalidate()).pipe(
          Effect.catchCause((cause) => Effect.logWarning("config refresh failed", { directory, cause })),
        )
      }
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      if (result.changed) {
        if (Config.hotReloadablePatch(ctx.payload)) yield* refreshConfig()
        else bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      }
      return result.info
    })

    /**
     * The decision models the configured Jev host serves.
     *
     * The picker cannot see them through `provider.list` — a Jev host is not a chat provider —
     * so it asks here. The host's own `/v1/models` listing wins; the preset's documented models
     * are the fallback, and `error` says why the host was not used so the picker can show it.
     */
    const jevModels = Effect.fn("GlobalHttpApi.jevModels")(function* () {
      const settings = (yield* config.getGlobal()).jev
      const provider = JevClient.providerOf(settings)
      const base_url = JevClient.baseUrl(settings)
      const endpoint = JevClient.resolveEndpoint(settings)
      const default_model = JevClient.resolveModel(settings)
      const key = JevClient.apiKey(settings)
      const preset = {
        provider,
        base_url,
        endpoint,
        default_model,
        authenticated: key !== undefined,
        source: "preset" as const,
        models: [...JevCatalogue.PRESET_MODELS[provider]],
      }
      if (!key) return { ...preset, error: `no key in ${JevClient.PROVIDER_ENV_KEYS[provider]}` }
      const models = yield* JevCatalogue.listHostModels(http, { baseUrl: base_url, apiKey: key })
      if (!models) return { ...preset, error: "the host did not list its models" }
      return { ...preset, source: "host" as const, models }
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: { payload: typeof GlobalUpgradeInput.Type }) {
      const method = yield* installation.method()
      if (method === "unknown") {
        return {
          status: 400,
          body: { success: false as const, error: "Unknown installation method" },
        }
      }
      const target = ctx.payload.target || (yield* installation.latest(method))
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ status: 200, body: { success: true as const, version: target } }),
        Effect.catch((err) =>
          Effect.succeed({
            status: 500,
            body: {
              success: false as const,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        ),
      )
      if (!result.body.success) return result
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return result
    })

    const upgradeRaw = Effect.fn("GlobalHttpApi.upgradeRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const json = parseBody(body)
      if (json === undefined) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const payload = yield* Schema.decodeUnknownEffect(GlobalUpgradeInput)(json).pipe(
        Effect.map((payload) => ({ valid: true as const, payload })),
        Effect.catch(() => Effect.succeed({ valid: false as const })),
      )
      if (!payload.valid) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const result = yield* upgrade({ payload: payload.payload })
      return HttpServerResponse.jsonUnsafe(result.body, { status: result.status })
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("dispose", dispose)
      .handleRaw("upgrade", upgradeRaw)
      .handle("jevModels", jevModels)
  }),
)
