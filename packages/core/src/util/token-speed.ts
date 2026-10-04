export type TokenSpeedPart = {
  type: string
  time?: { start?: number; end?: number; [key: string]: unknown }
}

/**
 * A buffered, non-streamed reply arrives as a single chunk, so its window is a
 * few milliseconds for a full answer and would report an absurd rate. Anything
 * above this ceiling is an unreliable sample, not a fast model, so it is hidden
 * rather than shown.
 */
const MAX_PLAUSIBLE_TOKENS_PER_SECOND = 500

/**
 * Decode throughput (tokens/second) measured over the actual generation
 * windows of a message instead of its total wall-clock duration.
 *
 * The message duration also covers prefill/TTFT, network, tool execution and
 * permission waits, so dividing output tokens by it understates the model
 * speed. The model generates one token at a time, so text, reasoning and
 * tool-call argument windows are consecutive segments of the same decode
 * stream; tool-call arguments in particular are completion tokens that carry
 * no text part, so omitting them inflated the rate whenever a turn was mostly a
 * tool call. Windows are merged because a provider may stream parallel tool
 * calls whose windows overlap, and the gaps between them (tool execution) are
 * correctly excluded.
 */
export function generationTokensPerSecond(input: {
  parts?: readonly TokenSpeedPart[]
  output: number
  reasoning: number
}): number | undefined {
  const tokens = input.output + input.reasoning
  if (tokens <= 0) return undefined

  const windows = (input.parts ?? [])
    .filter((part) => part.type === "text" || part.type === "reasoning" || part.type === "tool")
    .map((part) => [part.time?.start, part.time?.end] as const)
    .filter((window): window is readonly [number, number] => {
      const [start, end] = window
      return start !== undefined && end !== undefined && end > start
    })
    .sort((a, b) => a[0] - b[0])

  let start = -1
  let end = -1
  let ms = 0
  for (const window of windows) {
    if (start < 0) {
      start = window[0]
      end = window[1]
      continue
    }
    if (window[0] > end) {
      ms += end - start
      start = window[0]
      end = window[1]
      continue
    }
    end = Math.max(end, window[1])
  }
  if (start >= 0) ms += end - start
  if (ms <= 0) return undefined

  const value = tokens / (ms / 1000)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PLAUSIBLE_TOKENS_PER_SECOND) return undefined
  return value
}
