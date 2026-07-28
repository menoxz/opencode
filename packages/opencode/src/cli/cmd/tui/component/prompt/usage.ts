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

export function formatTokensPerSecond(input: { output: number; created?: number; completed?: number }) {
  if (!input.created || !input.completed || input.completed <= input.created || input.output <= 0) return undefined
  const value = input.output / ((input.completed - input.created) / 1000)
  if (!Number.isFinite(value) || value <= 0) return undefined
  const formatted = value >= 10 ? Math.round(value).toLocaleString() : value.toFixed(1)
  return `${formatted} tok/s`
}

export function formatPromptUsage(input: {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
  created?: number
  completed?: number
  cost: number
  contextLimit?: number
}) {
  const tokens = input.input + input.output + input.reasoning + input.cache.read + input.cache.write
  if (tokens <= 0) return undefined
  const pct = input.contextLimit ? `${Math.round((tokens / input.contextLimit) * 100)}%` : undefined
  return {
    context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
    cost: input.cost > 0 ? money.format(input.cost) : undefined,
    tokensPerSecond: formatTokensPerSecond({
      output: input.output,
      created: input.created,
      completed: input.completed,
    }),
  }
}
