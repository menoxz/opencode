import { generationTokensPerSecond, type TokenSpeedPart } from "@opencode-ai/core/util/token-speed"
import { Locale } from "@/util/locale"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export const helpUsageHints = ["Type @ to tag files in the prompt.", "Type / to open commands."] as const

export function formatCost(cost: number) {
  if (!Number.isFinite(cost) || cost <= 0) return undefined
  return money.format(cost)
}

export function formatFileTagHint() {
  return "@ tag files"
}

export function formatTaggedFileCount(count: number) {
  if (count <= 0) return undefined
  return `${count.toLocaleString()} ${count === 1 ? "file" : "files"} tagged`
}

export function formatTokensPerSecond(input: {
  parts?: readonly TokenSpeedPart[]
  output: number
  reasoning: number
}) {
  const value = generationTokensPerSecond(input)
  if (value === undefined) return undefined
  return value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1)
}

export function formatPromptUsage(input: {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
  parts?: readonly TokenSpeedPart[]
  cost: number
  contextLimit?: number
}) {
  const tokens = input.input + input.output + input.reasoning + input.cache.read + input.cache.write
  if (tokens <= 0) return undefined
  const pct = input.contextLimit ? `${Math.round((tokens / input.contextLimit) * 100)}%` : undefined
  const speed = formatTokensPerSecond({
    parts: input.parts,
    output: input.output,
    reasoning: input.reasoning,
  })
  return {
    context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
    cost: input.cost > 0 ? money.format(input.cost) : undefined,
    tokensPerSecond: speed ? `${speed} tok/s` : undefined,
  }
}
