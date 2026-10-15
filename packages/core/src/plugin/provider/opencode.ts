import { Effect } from "effect"
import { PluginV2 } from "../../plugin"
import { ProviderV2 } from "../../provider"

export const OpencodePlugin = PluginV2.define({
  id: PluginV2.ID.make("opencode"),
  effect: Effect.gen(function* () {
    let hasKey = false
    return {
      "catalog.transform": Effect.fn(function* (evt) {
        const item = evt.data.find((record) => record.provider.id === ProviderV2.ID.opencode)
        if (!item) return
        hasKey = Boolean(
          process.env.OPENCODE_API_KEY ||
            item.provider.env.some((env) => process.env[env]) ||
            item.provider.options.aisdk.provider.apiKey ||
            (item.provider.enabled && item.provider.enabled.via === "account"),
        )
        evt.provider.update(item.provider.id, (provider) => {
          if (!hasKey) provider.options.aisdk.provider.apiKey = "public"
        })
        if (hasKey) return
        // With no credential none of these models can be served: the anonymous
        // free tier is closed server-side (measured 2026-10-15 — `Bearer public`
        // answers 403 FreeTierError for every header variant tried, session
        // `ses_`-shaped or not, and the official 1.18.58 client on an isolated
        // config gets the same refusal). Keeping the cost-0 models enabled would
        // only offer models that always fail.
        for (const model of item.models.values()) {
          evt.model.update(item.provider.id, model.id, (draft) => {
            draft.enabled = false
          })
        }
      }),
    }
  }),
})
