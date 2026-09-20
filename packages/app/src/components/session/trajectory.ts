import type { Message, Part, ToolPart, UserMessage } from "@opencode-ai/sdk/v2/client"

/**
 * Projection of an opencode session into the DeepSeek-harness "Trajectory"
 * model: ordered records grouped by turn, plus a time/lane view used by the
 * overview timeline.
 *
 * The mapping keeps opencode's own vocabulary (messages + parts) and only
 * relabels it:
 *   - user message (all text parts)  -> USER   (lane "input"), one per message
 *   - file / agent / subtask part   -> CONTEXT (lane "input")
 *   - compaction part               -> COMPACTED (lane "input")
 *   - assistant step (text or none) -> ASSISTANT (lane "model")
 *   - tool part                     -> TOOL   (lane "tools")
 *   - tool part of a `task` child   -> SUBTOOL (lane "tools")
 *
 * SUBTOOL records come from the child session a `task` tool call spawns; the
 * harness equivalent is a tool invoked from inside another tool.
 */

export type TrajectoryKind = "user" | "context" | "assistant" | "tool" | "subtool" | "compacted"
export type TrajectoryLane = "input" | "model" | "tools"
export type TrajectoryStatus = "pending" | "running" | "completed" | "error"
export type TrajectoryMode = "duration" | "turns" | "calls"

export type TrajectoryRecord = {
  index: number
  kind: TrajectoryKind
  lane: TrajectoryLane
  label: string
  details?: string
  args?: string
  result?: string
  error?: string
  status: TrajectoryStatus
  turn: number
  messageID: string
  partID?: string
  callID?: string
  childSessionID?: string
  start?: number
  end?: number
  tokens?: number
  cost?: number
}

export type TrajectoryTurn = { turn: number; start?: number; records: TrajectoryRecord[] }

export type TrajectorySpan = {
  index: number
  lane: TrajectoryLane
  kind: TrajectoryKind
  label: string
  start: number
  end: number
  error: boolean
}

export type TrajectoryModel = {
  records: TrajectoryRecord[]
  turns: TrajectoryTurn[]
  spans: TrajectorySpan[]
  bounds: { start: number; end: number }
  marks: { turn: number; time: number }[]
  stats: { turns: number; calls: number; errors: number; duration: number; tokens: number; cost: number }
  childSessions: string[]
}

export type TrajectoryChild = { sessionID: string; messages: Message[]; parts: (messageID: string) => Part[] }

export type TrajectoryInput = {
  messages: Message[]
  parts: (messageID: string) => Part[]
  childOf: (childSessionID: string) => TrajectoryChild | undefined
}

const LANE_OF: Record<TrajectoryKind, TrajectoryLane> = {
  user: "input",
  context: "input",
  compacted: "input",
  assistant: "model",
  tool: "tools",
  subtool: "tools",
}

export const emptyModel: TrajectoryModel = {
  records: [],
  turns: [],
  spans: [],
  bounds: { start: 0, end: 0 },
  marks: [],
  stats: { turns: 0, calls: 0, errors: 0, duration: 0, tokens: 0, cost: 0 },
  childSessions: [],
}

const stringify = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value) ?? "")

/** Child session id a `task` tool call spawned, when the tool exposed it. */
function taskChildSession(part: ToolPart) {
  const metadata = part.metadata ?? (part.state.status === "pending" ? undefined : part.state.metadata)
  const nested = metadata as { sessionId?: unknown; sessionID?: unknown; parentSessionId?: unknown } | undefined
  if (typeof nested?.sessionId === "string") return nested.sessionId
  if (typeof nested?.sessionID === "string") return nested.sessionID
  const match = /<task id="([^"]+)"/.exec(part.state.status === "completed" ? part.state.output : "")
  return match ? match[1] : undefined
}

/** Normalise the several `time` shapes a tool part can carry. */
function timingOf(part: ToolPart): { start?: number; end?: number } {
  if (part.time) return { start: part.time.start, end: part.time.end }
  const state = part.state
  if (state.status === "running") return { start: state.time.start }
  if (state.status === "completed" || state.status === "error") return { start: state.time.start, end: state.time.end }
  return {}
}

function toolRecord(part: ToolPart, kind: TrajectoryKind, turn: number, index: number): TrajectoryRecord {
  const state = part.state
  const status: TrajectoryStatus =
    state.status === "pending" || state.status === "running" ? state.status : state.status
  const timing = timingOf(part)
  const childSessionID = kind === "tool" && part.tool === "task" ? taskChildSession(part) : undefined
  return {
    index,
    kind,
    lane: LANE_OF[kind],
    label: part.tool,
    details: state.status === "running" ? state.title : undefined,
    args: stringify(state.input),
    result: state.status === "completed" ? state.output : undefined,
    error: state.status === "error" ? state.error : undefined,
    status,
    turn,
    messageID: part.messageID,
    partID: part.id,
    callID: part.callID,
    childSessionID,
    start: timing.start,
    end: timing.end,
  }
}

type Step = { parts: Part[] }

function groupIntoSteps(parts: Part[]): Step[] {
  const steps: Step[] = []
  let current: Step | undefined
  for (const part of parts) {
    if (part.type === "step-start" || current === undefined) {
      current = { parts: [part] }
      steps.push(current)
      continue
    }
    current.parts.push(part)
  }
  return steps
}

function contextRecord(part: Part, turn: number, index: number, at?: number): TrajectoryRecord | undefined {
  if (part.type === "file") {
    return {
      index,
      kind: "context",
      lane: "input",
      label: part.source?.type === "symbol" ? part.source.name : "file",
      details: part.filename ?? part.url,
      result: part.mime,
      status: "completed",
      turn,
      messageID: part.messageID,
      partID: part.id,
      start: at,
      end: at,
    }
  }
  if (part.type === "agent") {
    return {
      index,
      kind: "context",
      lane: "input",
      label: "agent",
      details: part.name,
      status: "completed",
      turn,
      messageID: part.messageID,
      partID: part.id,
      start: at,
      end: at,
    }
  }
  if (part.type === "subtask") {
    return {
      index,
      kind: "context",
      lane: "input",
      label: `subtask @${part.agent}`,
      details: part.description,
      args: part.prompt,
      status: "completed",
      turn,
      messageID: part.messageID,
      partID: part.id,
      start: at,
      end: at,
    }
  }
  return undefined
}

/**
 * Fold messages + their parts into the trajectory model. `childOf` resolves a
 * `task` child session so its tool calls become SUBTOOL records.
 */
export function buildTrajectory(input: TrajectoryInput): TrajectoryModel {
  const records: TrajectoryRecord[] = []
  const turns: TrajectoryTurn[] = []
  const marks: { turn: number; time: number }[] = []
  const childSessions = new Set<string>()
  let turn = 0

  const push = (record: TrajectoryRecord) => {
    records.push(record)
    if (record.childSessionID) childSessions.add(record.childSessionID)
  }

  const nextIndex = () => records.length

  const emitUser = (message: UserMessage) => {
    turn += 1
    const active = turn
    const parts = input.parts(message.id)
    const text = parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n")
      .trim()
    const before = records.length
    if (text.length > 0) {
      push({
        index: nextIndex(),
        kind: "user",
        lane: "input",
        label: "user",
        args: text,
        status: "completed",
        turn: active,
        messageID: message.id,
        partID: parts.find((part) => part.type === "text")?.id,
        start: message.time.created,
        end: message.time.created,
      })
    }
    for (const part of parts) {
      const context = contextRecord(part, active, nextIndex(), message.time.created)
      if (context) push(context)
    }
    if (records.length === before) {
      push({
        index: nextIndex(),
        kind: "user",
        lane: "input",
        label: "user",
        status: "completed",
        turn: active,
        messageID: message.id,
        start: message.time.created,
        end: message.time.created,
      })
    }
  }

  const emitAssistant = (message: Extract<Message, { role: "assistant" }>) => {
    const active = turn
    const parts = input.parts(message.id)
    const steps = groupIntoSteps(parts)
    steps.forEach((step, stepIndex) => {
      const text = step.parts
        .filter((part) => part.type === "text" && !part.ignored)
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim()
      const tools = step.parts.filter((part): part is ToolPart => part.type === "tool")
      const finish = step.parts.find((part) => part.type === "step-finish")
      const started =
        tools.flatMap((tool) => (tool.time?.start === undefined ? [] : [tool.time.start])).at(0) ??
        step.parts.flatMap((part) => (part.type === "text" && part.time ? [part.time.start] : [])).at(0) ??
        message.time.created
      const lastTool = tools[tools.length - 1]
      const completed = message.time.completed ?? lastTool?.time?.end ?? started
      const isLastStep = stepIndex === steps.length - 1
      if (text.length > 0 || tools.length > 0 || step.parts.length > 0) {
        push({
          index: nextIndex(),
          kind: "assistant",
          lane: "model",
          label: "assistant",
          details: text.length === 0 ? "(tool call only)" : undefined,
          args: text.length > 0 ? text : undefined,
          status: message.error ? "error" : message.time.completed ? "completed" : "running",
          error: message.error ? stringify(message.error) : undefined,
          turn: active,
          messageID: message.id,
          partID: step.parts[0]?.id,
          start: started,
          end: completed,
          tokens:
            finish && finish.type === "step-finish"
              ? finish.tokens.output
              : isLastStep
                ? message.tokens.output
                : undefined,
          cost: finish && finish.type === "step-finish" ? finish.cost : isLastStep ? message.cost : undefined,
        })
      }
      for (const part of step.parts) {
        if (part.type === "tool") {
          const record = toolRecord(part, "tool", active, nextIndex())
          push(record)
          if (record.childSessionID) {
            const child = input.childOf(record.childSessionID)
            if (child) {
              for (const childMessage of child.messages) {
                for (const childPart of child.parts(childMessage.id)) {
                  if (childPart.type !== "tool") continue
                  push(toolRecord(childPart, "subtool", active, nextIndex()))
                }
              }
            }
          }
          continue
        }
        if (part.type === "compaction") {
          push({
            index: nextIndex(),
            kind: "compacted",
            lane: "input",
            label: part.auto ? "compacted (auto)" : "compacted",
            status: "completed",
            turn: active,
            messageID: message.id,
            partID: part.id,
          })
          continue
        }
        const context = contextRecord(part, active, nextIndex(), message.time.created)
        if (context) push(context)
      }
    })
    if (steps.length === 0 && message.error) {
      push({
        index: nextIndex(),
        kind: "assistant",
        lane: "model",
        label: "assistant",
        status: "error",
        error: stringify(message.error),
        turn: active,
        messageID: message.id,
        start: message.time.created,
        end: message.time.completed,
      })
    }
  }

  for (const message of input.messages) {
    if (message.role === "user") {
      emitUser(message)
      marks.push({ turn, time: message.time.created })
      continue
    }
    emitAssistant(message)
  }

  for (const record of records) {
    const bucket = turns.find((item) => item.turn === record.turn)
    if (bucket) {
      bucket.records.push(record)
      continue
    }
    turns.push({ turn: record.turn, start: record.start, records: [record] })
  }

  const start = records.reduce<number | undefined>(
    (min, record) => (record.start === undefined ? min : min === undefined ? record.start : Math.min(min, record.start)),
    undefined,
  )
  const end = records.reduce<number | undefined>(
    (max, record) => (record.end === undefined ? max : max === undefined ? record.end : Math.max(max, record.end)),
    undefined,
  )
  const bounds = { start: start ?? 0, end: Math.max(end ?? 0, (start ?? 0) + 1) }
  const spanOf = (record: TrajectoryRecord): TrajectorySpan | undefined => {
    if (record.start === undefined) return undefined
    return {
      index: record.index,
      lane: record.lane,
      kind: record.kind,
      label: record.label,
      start: record.start,
      end: Math.max(record.end ?? record.start, record.start + 1),
      error: record.status === "error",
    }
  }

  return {
    records,
    turns,
    spans: records.flatMap((record) => {
      const span = spanOf(record)
      return span ? [span] : []
    }),
    bounds,
    marks,
    childSessions: [...childSessions],
    stats: {
      turns: turns.length,
      calls: records.filter((record) => record.kind === "tool" || record.kind === "subtool").length,
      errors: records.filter((record) => record.status === "error").length,
      duration: bounds.end - bounds.start,
      tokens: records.reduce((sum, record) => sum + (record.tokens ?? 0), 0),
      cost: records.reduce((sum, record) => sum + (record.cost ?? 0), 0),
    },
  }
}

export const formatDuration = (ms: number) => {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`
}
