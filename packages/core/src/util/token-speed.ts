export type TokenSpeedPart = {
  type: string
  time?: { start?: number; end?: number; [key: string]: unknown }
}

/**
 * Decode throughput (tokens/second) measured over the actual generation
 * windows of a message instead of its total wall-clock duration.
 *
 * The assistant message duration also covers prefill/TTFT, network, tool
 * execution and permission waits, so dividing output tokens by it badly
 * understates the model speed. Text and reasoning parts carry the stream
 * window (`time.start` at the first delta, `time.end` at the last), and
 * summing those windows isolates decoding time.
 *
 * `output + reasoning` is the raw provider output token count: the stored
 * `output` field already excludes reasoning (see Session.getUsage).
 */
export function generationTokensPerSecond(input: {
  parts?: readonly TokenSpeedPart[]
  output: number
  reasoning: number
}): number | undefined {
  const tokens = input.output + input.reasoning
  if (tokens <= 0) return undefined

  const ms = (input.parts ?? []).reduce((sum, part) => {
    if (part.type !== "text" && part.type !== "reasoning") return sum
    const start = part.time?.start
    const end = part.time?.end
    if (start === undefined || end === undefined || end <= start) return sum
    return sum + (end - start)
  }, 0)
  if (ms <= 0) return undefined

  const value = tokens / (ms / 1000)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return value
}
