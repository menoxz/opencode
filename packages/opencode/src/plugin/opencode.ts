import type { Hooks, PluginInput } from "@opencode-ai/plugin"

/**
 * Gives the `opencode` (Zen) provider an authentication method.
 *
 * The provider auth methods only ever come from plugin hooks (`ProviderAuth`
 * builds its map from `x.auth.provider`), and nothing declared one for
 * `opencode` — so the subcommand could not store a Zen credential for it: the
 * provider was stuck on the anonymous key (`apiKey: "public"`), whose free tier
 * is closed server-side. Measured 2026-10-15: `Bearer public` answers 403
 * FreeTierError for every header variant tried, and the official 1.18.58 client
 * on an isolated config gets the same refusal.
 *
 * The CLI collects the key itself for a method of type "api" and stores
 * `{ type: "api", key }` under this provider id (`cli/cmd/providers.ts:172-189`),
 * which is exactly the record the provider loader reads.
 */
export async function OpencodeAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "opencode",
      methods: [
        {
          type: "api",
          label: "API key",
        },
      ],
    },
  }
}
