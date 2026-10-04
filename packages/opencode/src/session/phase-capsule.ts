import { createHash } from "crypto"

type StructuralMessage = {
  info: { id: unknown; role: string; mode?: string }
  parts: ReadonlyArray<{ type: string }>
}

export type PhaseCapsuleShadow = {
  epoch: number
  phase: "discovery" | "implementation" | "unknown"
  compactions: number
  messageCount: number
  structureHash: string
}

export function derivePhaseCapsule(messages: readonly StructuralMessage[]): PhaseCapsuleShadow {
  let epoch = 0
  let compactions = 0
  let previousMode: string | undefined
  let currentMode: string | undefined
  const structural: string[] = []

  for (const message of messages) {
    const mode = message.info.role === "assistant" ? message.info.mode : undefined
    if (mode && previousMode && mode !== previousMode && [mode, previousMode].every((item) => item === "plan" || item === "build")) {
      epoch++
    }
    if (mode) {
      previousMode = mode
      currentMode = mode
    }
    const types = message.parts.map((part) => part.type)
    const count = types.filter((type) => type === "compaction").length
    epoch += count
    compactions += count
    structural.push(`${String(message.info.id)}:${message.info.role}:${mode ?? ""}:${types.join(",")}`)
  }

  const phase = currentMode === "plan" ? "discovery" : currentMode === "build" ? "implementation" : "unknown"
  return {
    epoch,
    phase,
    compactions,
    messageCount: messages.length,
    structureHash: createHash("sha256").update(structural.join("|")).digest("hex").slice(0, 16),
  }
}
