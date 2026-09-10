import type { AssistantMessage, Message, Part, StepFinishPart } from "@opencode-ai/sdk/v2"

export type CostSession = { id: string; parentID?: string; cost?: number }
export type CostSnapshot = { sessions: readonly CostSession[]; status: "loaded" | "error" }

export function updateCostRows(rows: readonly CostSession[], row: CostSession, deleted = false) {
  return [...rows.filter((value) => value.id !== row.id), ...(deleted ? [] : [row])].slice(-200)
}

// The public state API cannot enumerate sessions. One bounded snapshot, never a global total.
export async function loadCostSnapshot(
  list: () => Promise<{ data?: readonly CostSession[]; error?: unknown }>,
): Promise<CostSnapshot> {
  return list().then(
    (result) =>
      result.error || !result.data
        ? { sessions: [], status: "error" }
        : { sessions: result.data.slice(0, 200), status: "loaded" },
    () => ({ sessions: [], status: "error" }),
  )
}

export function costTree(root: string, rows: readonly CostSession[], parentCost?: number) {
  const sessions = new Map(rows.map((row) => [row.id, row]))
  const seen = new Set([root])
  const pending = [root]
  const descendants: CostSession[] = []
  for (const id of pending) {
    for (const row of sessions.values()) {
      if (row.parentID !== id || seen.has(row.id)) continue
      seen.add(row.id)
      pending.push(row.id)
      descendants.push(row)
    }
  }
  const known = descendants.filter((row) => validAmount(row.cost) !== undefined)
  const subtotal = known.reduce((sum, row) => sum + row.cost!, 0)
  const cost = descendants.length > 0 && known.length === descendants.length ? subtotal : undefined
  const parent = validAmount(parentCost)
  return {
    count: descendants.length,
    missing: descendants.length - known.length,
    duplicates: rows.length - sessions.size,
    subtotal: known.length ? subtotal : undefined,
    cost,
    combined: parent !== undefined && cost !== undefined ? parent + cost : undefined,
  }
}

export function loadedUsage(
  sessionID: string,
  messages: readonly Message[],
  parts: (messageID: string) => readonly Part[],
) {
  const assistants = messages.filter(
    (message): message is AssistantMessage => message.role === "assistant" && message.sessionID === sessionID,
  )
  const unique = new Map(assistants.map((message) => [message.id, message]))
  const records = [...unique.values()].flatMap((message) => {
    const steps = parts(message.id).filter(
      (part): part is StepFinishPart =>
        part.type === "step-finish" && part.sessionID === sessionID && part.messageID === message.id,
    )
    return steps.map((step) => ({ message, step }))
  })
  const calls = [...new Map(records.map((record) => [record.step.id, record])).values()]
  const values = calls.map(({ step }) => tokenCount(step.tokens))
  const last = calls.at(-1)
  const previous = calls.at(-2)
  return {
    last,
    previous,
    calls: calls.length,
    duplicates: assistants.length - unique.size + records.length - calls.length,
    missing: [...unique.keys()].filter((id) => !calls.some((call) => call.message.id === id)).length,
    processed:
      values.length && values.every((value) => value !== undefined)
        ? values.reduce<number>((sum, value) => sum + value!, 0)
        : undefined,
    readRatio: cacheReadRatio(last?.step.tokens),
    previousReadRatio: cacheReadRatio(previous?.step.tokens),
  }
}

export function cacheReadRatio(tokens?: AssistantMessage["tokens"]) {
  if (!tokens || tokenCount(tokens) === undefined) return
  const input = tokens.input + tokens.cache.read + tokens.cache.write
  return input > 0 ? Math.round((tokens.cache.read / input) * 100) : undefined
}

function validAmount(value?: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

function tokenCount(tokens: AssistantMessage["tokens"]) {
  const values = [tokens.input, tokens.output, tokens.reasoning, tokens.cache.read, tokens.cache.write]
  return values.every((value) => validAmount(value) !== undefined)
    ? values.reduce((sum, value) => sum + value, 0)
    : undefined
}

export function lastCompletedAssistant(messages: readonly Message[], now: number) {
  // A step can publish usage/finish before the assistant finishes; errors also get a completion timestamp.
  return messages.findLast(
    (item): item is AssistantMessage =>
      item.role === "assistant" &&
      item.time.completed !== undefined &&
      item.time.completed >= item.time.created &&
      item.time.completed <= now &&
      !!item.finish &&
      item.finish !== "error" &&
      !item.error,
  )
}

export function contextMetrics(
  message: AssistantMessage | undefined,
  limit: number | undefined,
  cost: number | undefined,
  parts?: readonly Part[],
) {
  const step = message
    ? parts?.findLast(
        (part): part is StepFinishPart =>
          part.type === "step-finish" && part.messageID === message.id && part.sessionID === message.sessionID,
      )
    : undefined
  const usage = step?.tokens ?? message?.tokens
  const tokens = usage ? tokenCount(usage) : undefined
  return {
    tokens,
    percent: tokens !== undefined && limit !== undefined && limit > 0 ? Math.round((tokens / limit) * 100) : undefined,
    input: usage?.input,
    cacheRead: usage?.cache.read,
    cacheWrite: usage?.cache.write,
    // Message cost accumulates steps and must never substitute for an unavailable call cost.
    callCost: validAmount(step?.cost),
    sessionCost: validAmount(cost),
  }
}
