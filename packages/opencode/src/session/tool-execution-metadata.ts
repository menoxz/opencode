export type ToolExecutionMetadata = {
  readonly readOnlyHint?: boolean
  readonly idempotentHint?: boolean
  readonly destructiveHint?: boolean
}

const values = new WeakMap<object, ToolExecutionMetadata>()

export function set(tool: object, metadata: ToolExecutionMetadata) {
  values.set(tool, metadata)
  return tool
}

export function get(tool: object) {
  return values.get(tool)
}

export * as ToolExecutionMetadata from "./tool-execution-metadata"
