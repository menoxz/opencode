import { Effect, Option, Schema } from "effect"
import { Truncate } from "./truncate"
import { isLeanTerminalTool } from "./lean-output-policy"

const MAX_BYTES = 4_000
const MAX_LINES = 120
const MAX_ENTRIES = 16
const MAX_SNAPSHOT_BYTES = 128 * 1024
const TTL = 30 * 60 * 1000
const decode = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const LOG_KEYS = new Set(["output", "stdout", "stderr"])
const CONTROL_KEYS = new Set([
  "commandId",
  "terminalId",
  "streamId",
  "status",
  "state",
  "exit",
  "exitCode",
  "exit_code",
  "duration",
  "durationMs",
  "isError",
  "success",
  "cumulative",
  "mode",
])
const ERROR = /\b(error|failed|failure|fatal|exception|panic)\b|^\s*\(fail\)/i

export function createTerminalPollState() {
  return new Map<string, { text: string; time: number }>()
}

type PollState = ReturnType<typeof createTerminalPollState>
type RecordValue = Record<string, unknown>
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** This is an excerpt budget, not a token estimate. Never split a Unicode code point. */
function bytes(text: string, limit: number, tail = false) {
  const points = Array.from(tail ? text.slice(-limit * 2) : text.slice(0, limit * 2))
  const ordered = tail ? points.reverse() : points
  const result: string[] = []
  let size = 0
  for (const point of ordered) {
    size += Buffer.byteLength(point)
    if (size > limit) break
    result.push(point)
  }
  return (tail ? result.reverse() : result).join("")
}

function preview(text: string, limit: number, lines: number, failure = false) {
  const all = text.split("\n")
  if (Buffer.byteLength(text) <= limit && all.length <= lines) return text
  const error = failure ? all.findIndex((line) => ERROR.test(line)) : -1
  const marker = "\n[... omitted; see raw journal ...]\n"
  const pieces = error > 2 ? 3 : 2
  const budget = Math.max(0, Math.floor((limit - Buffer.byteLength(marker) * (pieces - 1)) / pieces))
  const count = Math.max(1, Math.floor((lines - (pieces - 1) * 2) / pieces))
  return [
    bytes(all.slice(0, count).join("\n"), budget),
    ...(pieces === 3 ? [bytes(all.slice(Math.max(0, error - 2), error + count - 2).join("\n"), budget)] : []),
    bytes(all.slice(-count).join("\n"), budget, true),
  ].join(marker)
}

/** Preserve unknown fields as data, rather than interpreting JSON as terminal lines. */
function payload(value: unknown, depth = 0): { text: string; controls: RecordValue; logs: boolean } {
  if (!record(value) || depth >= 16) return { text: JSON.stringify(value) ?? "", controls: {}, logs: false }
  const controls = Object.fromEntries(
    Object.entries(value).filter(([key, item]) => CONTROL_KEYS.has(key) && (typeof item !== "object" || item === null)),
  )
  const parts = Object.entries(value)
    .filter(([key]) => !Object.hasOwn(controls, key))
    .map(([key, item]) => {
      if (LOG_KEYS.has(key) && typeof item === "string") return { text: `${key}:\n${item}`, logs: true }
      // The MCP content envelope and chain results can contain nested result objects.
      if (["result", "results", "steps", "data", "content"].includes(key) && (record(item) || Array.isArray(item))) {
        const children = (Array.isArray(item) ? item : [item]).map((child) => {
          if (record(child) && child.type === "text" && typeof child.text === "string") {
            const decoded = decode(child.text)
            return Option.isSome(decoded) && record(decoded.value)
              ? payload(decoded.value, depth + 1)
              : { text: JSON.stringify(child), controls: {}, logs: false }
          }
          return payload(child, depth + 1)
        })
        const nested = children.map((child) => child.controls)
        if (nested.some((child) => Object.keys(child).length)) controls[key] = nested
        // A single envelope identifies one result; chains keep per-step controls,
        // without inventing an aggregate exit code or an ambiguous polling handle.
        if (children.length === 1 && !["steps", "results"].includes(key)) {
          for (const [name, control] of Object.entries(children[0].controls)) {
            if (CONTROL_KEYS.has(name) && !Object.hasOwn(controls, name)) controls[name] = control
          }
        }
        return {
          text: `${key}:\n${children.map((child) => child.text).join("\n")}`,
          logs: children.some((child) => child.logs),
        }
      }
      return { text: JSON.stringify({ [key]: item }), logs: false }
    })
  return { text: parts.map((part) => part.text).join("\n"), controls, logs: parts.some((part) => part.logs) }
}

function pollingKey(tool: string, input: RecordValue, controls: RecordValue, sessionID: string) {
  if (!/(?:command_status|command_wait|terminal_read|command_stream|native_terminal)$/.test(tool)) return
  if (tool.endsWith("command_stream") && input.action !== "read") return
  if (tool.endsWith("native_terminal") && input.action !== "read") return
  if (controls.cumulative === false || controls.mode === "delta") return
  // Streams are commonly delta-only. Require an explicit cumulative declaration.
  if (tool.endsWith("command_stream") && controls.cumulative !== true) return
  const handle = ["commandId", "terminalId", "streamId"].find(
    (key) => typeof input[key] === "string" && input[key] !== "",
  )
  const target = typeof input.target === "string" && input.target === controls.terminalId ? "target" : undefined
  const key = handle ?? target
  if (!key || (controls[key] !== undefined && controls[key] !== input[key])) return
  if (Object.values(input).some((value) => value !== null && typeof value === "object")) return
  const query = JSON.stringify([
    sessionID,
    tool,
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
    [controls.commandId, controls.terminalId, controls.streamId],
  ])
  return query.length <= 4096 ? query : undefined
}

export const compactTerminalOutput = Effect.fn("TerminalOutput.compact")(function* (input: {
  tool: string
  args: RecordValue
  sessionID: string
  output: string
  metadata: RecordValue
  durationMs?: number
  polls: PollState
  store: Truncate.Interface
}) {
  if (!isLeanTerminalTool(input.tool, input.args)) return { output: input.output, metadata: input.metadata }
  const references = [...new Set([
    typeof input.metadata.outputPath === "string" ? input.metadata.outputPath : undefined,
    Truncate.savedOutputPath(input.output),
  ].filter((value): value is string => value !== undefined))]
  // References are untrusted data, never a capability to open another journal.
  const raw = input.output
  const normalized = input.tool.replaceAll("__", "_").toLowerCase()
  const decoded = normalized === "bash" ? Option.none() : decode(raw)
  const structured = Option.isSome(decoded)
  const extracted = structured ? payload(decoded.value) : { text: raw, controls: {}, logs: true }
  const host = Object.fromEntries(Object.entries(input.metadata).filter(([key]) => CONTROL_KEYS.has(key)))
  const controls = {
    ...extracted.controls,
    ...host,
  }
  const hostExits = [host.exit, host.exitCode, host.exit_code].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  const reportedExits = [extracted.controls.exit, extracted.controls.exitCode, extracted.controls.exit_code].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
  const exit = hostExits.find((value) => value !== 0) ?? hostExits[0] ?? reportedExits.find((value) => value !== 0) ?? reportedExits[0]
  const duration = [controls.durationMs, input.durationMs].find(
    (value) => typeof value === "number" && Number.isFinite(value),
  )
  const failed =
    [...hostExits, ...reportedExits].some((value) => value !== 0) ||
    [host, extracted.controls].some((value) => value.isError === true || value.success === false || /^(failed|error)$/i.test(String(value.status)))
  const key =
    extracted.logs && references.length === 0
      ? pollingKey(normalized, input.args, controls, input.sessionID)
      : undefined
  const now = Date.now()
  for (const [id, item] of input.polls) if (now - item.time > TTL) input.polls.delete(id)
  const previous = key ? input.polls.get(key)?.text : undefined
  const incremental =
    !failed && !!previous && extracted.text.length > previous.length && extracted.text.startsWith(previous)
  const text = incremental ? extracted.text.slice(previous.length) : extracted.text
  if (key) {
    input.polls.delete(key)
    if (Buffer.byteLength(extracted.text) <= MAX_SNAPSHOT_BYTES) {
      for (const id of input.polls.keys()) {
        if (input.polls.size < MAX_ENTRIES) break
        input.polls.delete(id)
      }
      input.polls.set(key, { text: extracted.text, time: now })
    }
  }
  const command = String(input.args.command ?? "")
  const clean = extracted.logs
    ? text
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
    : text
  const known =
    extracted.logs &&
    /\b(?:bun|npm|pnpm|yarn)\b.*\b(?:test|build|typecheck)\b/.test(command) &&
    /(?:^|\n)(?:bun test v|\s*\(pass\)|PASS |TAP version|\s*✓ )/.test(clean)
  const useful = [
    known
      ? clean
          .split("\n")
          .filter(
            (line) =>
              ERROR.test(line) ||
              /\bwarn(?:ing)?\b/i.test(line) ||
              !/^\s*(?:\(pass\) .+|PASS .+|ok \d+(?: - .*)?|✓ .+|[\u280b\u2819\u2839\u2838\u283c\u2834\u2826\u2827\u2807\u280f]\s*.*|\d{1,3}%\s*)$/.test(
                line,
              ),
          )
          .join("\n")
      : clean,
  ]
    .filter((part) => part !== undefined)
    .join("\n")
  const header = `[Terminal result${exit === undefined ? "; exit unknown" : `; exit=${exit}`}${duration === undefined ? "" : `; duration=${duration}ms`}${failed ? "; failed" : ""}${incremental ? "; cumulative delta" : ""}]`
  const controlText = [
    Object.keys(host).length ? `\nexecutor controls: ${JSON.stringify(host)}` : "",
    Object.keys(extracted.controls).length ? `\nreported controls: ${JSON.stringify(extracted.controls)}` : "",
  ].join("")
  const budget = !failed && !ERROR.test(useful) && known ? 2_000 : MAX_BYTES
  const referenceText = references.map((reference) => `\nUpstream reference (unverified; not opened): ${JSON.stringify(reference)}`).join("")
  const initial = preview(
    useful,
    Math.max(0, budget - Buffer.byteLength(header + controlText + referenceText) - 600),
    MAX_LINES - 10,
    known || failed,
  )
  const reduced = incremental || useful !== extracted.text || initial !== useful || (structured && initial !== raw)
  const outputPath = reduced ? yield* input.store.write(raw) : undefined
  const footer = [
    referenceText,
    outputPath ? `\nReceived output saved to: ${outputPath}` : "",
  ].join("")
  const omission = reduced && initial === useful ? "\n[Content compacted; see raw journal]" : ""
  const prefix = `${header}${controlText}${omission}\n`
  const body = preview(
    useful || "[No output]",
    Math.max(0, budget - Buffer.byteLength(prefix + footer)),
    MAX_LINES - prefix.split("\n").length - footer.split("\n").length,
    known || failed,
  )
  const output = `${prefix}${body}${footer}`
  return {
    output,
    metadata: {
      ...input.metadata,
      ...(outputPath ? { outputPath } : {}),
      ...(references.length ? { upstreamOutputPaths: references } : {}),
      terminalOutput: {
        version: 1,
        summary: output,
        controls,
        reportedControls: extracted.controls,
        upstreamReferences: references,
        journalKind: "received output",
        rawBytes: Buffer.byteLength(raw),
        deliveredBytes: Buffer.byteLength(output),
        incremental,
        reduced,
        ...(outputPath ? { outputPath } : {}),
      },
      leanOutputBudget: {
        applied: true,
        maxChars: MAX_BYTES,
        maxLines: MAX_LINES,
        truncated: reduced,
        ...(outputPath ? { outputPath } : {}),
      },
    },
  }
})
