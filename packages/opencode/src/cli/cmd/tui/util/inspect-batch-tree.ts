import { Schema } from "effect"
import stripAnsi from "strip-ansi"

export type InspectBatchViewInput = {
  input: unknown
  output?: string
  metadata?: unknown
  status: string
  error?: unknown
}

const decodeJSON = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export function inspectBatchTree(props: InspectBatchViewInput) {
  const input = record(typeof props.input === "string" ? json(props.input, 131_072) : props.input)
  const actions = Array.isArray(input.actions) ? input.actions : []
  const metadata = record(props.metadata)
  const parsed = record(json(props.output, 2_000_000))
  const results = Array.isArray(parsed.results) ? parsed.results.slice(0, 16).map(record) : []
  const truncated = Array.isArray(metadata.truncated) ? metadata.truncated.slice(0, 16) : []
  const status = ["pending", "running", "completed", "error"].includes(props.status) ? props.status : "unknown"
  const rows = actions.slice(0, 16).map((value, index) => {
    const action = record(value)
    const valid =
      typeof action.type === "string" && ["read", "grep", "glob"].includes(action.type) && typeof action.id === "string"
    const matches =
      valid && actions.length <= 16 && actions.filter((item) => record(item).id === action.id).length === 1
        ? results.filter((item) => item.id === action.id && item.type === action.type)
        : []
    const result = matches.length === 1 ? matches[0] : {}
    const available =
      typeof result.status === "string" && ["success", "empty", "error", "skipped"].includes(result.status)
    const state = available
      ? result.status
      : status === "pending"
        ? "pending"
        : status === "running"
          ? "awaiting result"
          : "result unavailable"
    const cut = result.truncated === true || truncated.includes(action.id)
    const dependencies = Array.isArray(action.dependsOn)
      ? action.dependsOn.length === 0
        ? ""
        : `after ${action.dependsOn
            .slice(0, 4)
            .map((id) => {
              const position = actions.findIndex((value) => record(value).id === id)
              const dependency = record(actions[position])
              return position < 0 ? "?" : `${concise(dependency.type, 12)} #${position + 1}`
            })
            .join(", ")}${action.dependsOn.length > 4 ? ` (+${action.dependsOn.length - 4})` : ""}`
      : action.dependsOn === undefined
        ? ""
        : "dependencies unavailable"
    const target =
      action.type === "read"
        ? concise(action.filePath, 80)
        : `"${concise(action.pattern, 40)}" @ ${concise(action.path ?? ".", 40)}`
    const extra =
      action.type === "read"
        ? ["offset", "limit"]
            .flatMap((key) => (positive(action[key]) ? [`${key}=${positive(action[key])}`] : []))
            .join(", ")
        : action.type === "grep" && typeof action.include === "string"
          ? `include=${concise(action.include, 30)}`
          : ""
    return {
      label: `${index === Math.min(actions.length, 16) - 1 ? "└─" : "├─"} ${valid ? action.type : "invalid action"} ${valid ? target : ""}${extra ? ` [${extra}]` : ""}${dependencies ? ` · ${dependencies}` : ""}${cut ? " · truncated" : ""}${state === "empty" ? " · empty" : ""}`,
      state,
      icon:
        state === "success" || state === "empty"
          ? "✓"
          : state === "error"
            ? "✗"
            : state === "skipped"
              ? "−"
              : state === "pending" || state === "awaiting result"
                ? "…"
                : "?",
    }
  })
  return {
    title: `inspect_batch · ${Array.isArray(input.actions) ? actions.length : (positive(metadata.actions) ?? "?")} actions`,
    rows,
    note: [
      actions.length === 0 ? (status === "pending" ? "Waiting for actions" : "Actions unavailable") : "",
      actions.length > 16 ? `+${actions.length - 16} actions hidden (limit 16)` : "",
      metadata.truncated === true ? "Batch output truncated" : "",
      status === "completed" && !Array.isArray(parsed.results)
        ? "Child results unavailable (missing, malformed or oversized output)"
        : "",
      status === "error" ? "Batch failed" : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function json(value: unknown, limit: number): unknown {
  if (typeof value !== "string" || value.length > limit) return
  const parsed = decodeJSON(value)
  return parsed._tag === "Some" ? parsed.value : undefined
}

function positive(value: unknown) {
  const number = typeof value === "string" && value.length < 16 ? Number(value) : value
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : undefined
}

function concise(value: unknown, max: number) {
  if (typeof value !== "string" || !value) return "?"
  // Bound work before sanitizing; keep both ends so long paths retain the filename.
  const bounded = value.length > max * 2 ? `${value.slice(0, max)}…${value.slice(-max)}` : value
  const text = stripAnsi(bounded)
    .replace(/[\x00-\x1f\x7f-\x9f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.length <= max
    ? text
    : `${text.slice(0, Math.ceil((max - 1) / 2))}…${text.slice(-Math.floor((max - 1) / 2))}`
}
