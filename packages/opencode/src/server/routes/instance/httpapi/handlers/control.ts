import { Auth } from "@/auth"
import { ProviderID } from "@/provider/schema"
import * as Log from "@opencode-ai/core/util/log"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: Auth.Info
    }) {
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: { params: { providerID: ProviderID } }) {
      yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie)
      return true
    })

    const authKeysList = Effect.fn("ControlHttpApi.authKeysList")(function* (ctx: {
      params: { providerID: ProviderID }
    }) {
      const keys = yield* auth.listApiKeys(ctx.params.providerID).pipe(Effect.orDie)
      return { keys: keys.map((key, index) => ({ index, masked: Auth.maskApiKey(key) })) }
    })

    const authKeysAdd = Effect.fn("ControlHttpApi.authKeysAdd")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: { key: string; metadata?: Record<string, string> }
    }) {
      yield* auth.addApiKey(ctx.params.providerID, ctx.payload.key, ctx.payload.metadata).pipe(Effect.orDie)
      return true
    })

    const authKeysRemove = Effect.fn("ControlHttpApi.authKeysRemove")(function* (ctx: {
      params: { providerID: ProviderID; index: string }
    }) {
      yield* auth.removeApiKey(ctx.params.providerID, Number(ctx.params.index)).pipe(Effect.orDie)
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const logger = Log.create({ service: ctx.payload.service })
      logger[ctx.payload.level](ctx.payload.message, ctx.payload.extra)
      return true
    })

    return handlers
      .handle("authSet", authSet)
      .handle("authRemove", authRemove)
      .handle("authKeysList", authKeysList)
      .handle("authKeysAdd", authKeysAdd)
      .handle("authKeysRemove", authKeysRemove)
      .handle("log", log)
  }),
)
