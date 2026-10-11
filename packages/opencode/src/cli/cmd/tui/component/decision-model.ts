/**
 * The pure half of the `/decision-model` picker: what a selection means.
 *
 * The picker offers two transports and they are not interchangeable:
 *
 *   - a **System One** model, listed under "Jev decision models", answers Jev's question
 *     batches on the configured Jev host. `openjev-latest` and friends can never appear in
 *     `provider.list` — a Jev host is not a chat provider (measured 2026-10-11: `POST
 *     /v1/chat/completions` with `openjev-latest` answers HTTP 404) — so the picker gets them
 *     from `GET /global/jev/models` instead;
 *   - a **chat model**, the rest of the list, replaces that transport entirely
 *     (`src/jev/harness.ts`), so the host and its key stop being used.
 *
 * Picking the first is what "use the OpenJev decision model" means: it pins
 * `jev.provider`/`jev.model` and clears `jev.decision_model`. The clearing travels as `""`
 * because JSON cannot carry `undefined`; `Config.writableGlobal` removes the key when it sees it.
 */
export type JevSettings = {
  readonly provider?: string
  readonly model?: string
  readonly decision_model?: string
}

/** The host the picker is offering models from. */
export type Host = {
  readonly provider: string
  readonly default_model: string
}

/** Prefix that marks a picker value as a System One model rather than a chat model id. */
export const SYSTEM_ONE_PREFIX = "jev:"

/** The picker value of one System One model. */
export function systemOneValue(provider: string, model: string): string {
  return `${SYSTEM_ONE_PREFIX}${provider}/${model}`
}

/**
 * The value the picker highlights as current, whichever transport is live.
 *
 * A configured `decision_model` wins: it is what the harness actually uses. Otherwise the live
 * choice is the host's model — `jev.model` when pinned, the host default when not.
 */
export function currentDecisionModelValue(jev: JevSettings | undefined, host: Host | undefined): string | undefined {
  if (jev?.decision_model) return jev.decision_model
  if (!host) return undefined
  return systemOneValue(host.provider, jev?.model ?? host.default_model)
}

/**
 * The patch a System One selection writes, or `undefined` when the config already says it.
 *
 * `provider` and `model` are pinned explicitly so the choice does not drift when a preset's
 * default model changes under it, and the blank `decision_model` removes the key — the wire
 * transport only runs while it is unset.
 */
export function systemOnePatch(jev: JevSettings | undefined, host: Host, model: string) {
  const already = !jev?.decision_model && jev?.provider === host.provider && (jev?.model ?? host.default_model) === model
  if (already) return undefined
  return { jev: { provider: host.provider, model, decision_model: "" } }
}

/** The patch a chat-model selection writes, or `undefined` when it is already the choice. */
export function chatPatch(jev: JevSettings | undefined, value: string) {
  if (jev?.decision_model === value) return undefined
  return { jev: { decision_model: value } }
}
