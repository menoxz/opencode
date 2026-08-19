import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import * as Log from "@opencode-ai/core/util/log"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000
const DEFAULT_THRESHOLD = 0.95
const log = Log.create({ service: "session.overflow" })

// Compacting is not free: it rewrites the whole prompt prefix, which throws away
// the provider cache, and it spends a summarisation call that reads the entire
// context. Roughly 2.50 $ at a 256k context, against ~0.06 $/turn saved by
// carrying a smaller one — it only pays back after ~40 turns. So compact late,
// just short of the usable window rather than well inside it. A lower value is
// only worth it when the provider cache is unavailable.
function threshold(cfg: Config.Info) {
  const configured = cfg.compaction?.threshold
  if (configured === undefined) return DEFAULT_THRESHOLD
  return Math.min(1, Math.max(0.1, configured))
}


function limits(input: { cfg: Config.Info; model: Provider.Model; outputTokenMax?: number }) {
  const context = input.model.limit.context
  const maxOutput = ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax)
  const reserved = input.cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, maxOutput)
  const usable = context === 0
    ? 0
    : input.model.limit.input
      ? Math.max(0, input.model.limit.input - reserved)
      : Math.max(0, context - maxOutput)

  return {
    context,
    input: input.model.limit.input,
    maxOutput,
    reserved,
    usable,
  }
}

function tokenCount(tokens: MessageV2.Assistant["tokens"]) {
  // Prefer provider-reported total when it is non-zero; otherwise use the already-recorded parts.
  // This avoids any expensive recounting while preserving the previous undercount guard for total=0.
  return tokens.total || tokens.input + tokens.output + tokens.cache.read + tokens.cache.write
}

function modelLabel(model: Provider.Model) {
  return `${model.providerID}/${model.id}`
}

export function usable(input: { cfg: Config.Info; model: Provider.Model; outputTokenMax?: number }) {
  return limits(input).usable
}

export function isOverflow(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
  sessionID?: string
}) {
  if (input.cfg.compaction?.auto === false) {
    log.debug("context overflow skipped", {
      reason: "compaction disabled",
      model: modelLabel(input.model),
      session: input.sessionID,
    })
    return false
  }

  const limit = limits(input)
  if (limit.context === 0) {
    log.debug("context overflow skipped", {
      reason: "model has no context limit",
      model: modelLabel(input.model),
      session: input.sessionID,
    })
    return false
  }

  const count = tokenCount(input.tokens)
  const trigger = Math.floor(limit.usable * threshold(input.cfg))
  const result = count >= trigger
  log.debug("context overflow evaluated", {
    result,
    reason: result ? "token count reached usable context threshold" : "token count below usable context threshold",
    model: modelLabel(input.model),
    session: input.sessionID,
    tokens: count,
    trigger,
    usable: limit.usable,
    context: limit.context,
    input: limit.input,
    maxOutput: limit.maxOutput,
    reserved: limit.reserved,
  })
  return result
}
