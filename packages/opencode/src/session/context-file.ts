import type { ModelMessage } from "ai"

/**
 * Snapshot du contexte réel envoyé au fournisseur LLM.
 * Activable par la variable d'environnement OPENCODE_CONTEXT_FILE :
 * à chaque tour, le prompt assemblé (system + messages) est écrit dans ce fichier.
 */

export const MAX_CONTENT_CHARS = 2_000

type ContentPart = Record<string, unknown> & { type?: string }

const truncate = (text: string): string =>
  text.length > MAX_CONTENT_CHARS ? `${text.slice(0, MAX_CONTENT_CHARS)}\n… [tronqué: ${text.length} caractères]` : text

const partToText = (part: ContentPart): string => {
  const type = part.type ?? "unknown"
  if (type === "text") return String(part.text ?? "")
  if (type === "reasoning") return `[reasoning] ${String(part.text ?? "")}`
  if (type === "tool-call")
    return `[tool-call] ${String(part.toolName ?? "?")}(${String(part.toolCallId ?? "?")}): ${JSON.stringify(part.input ?? part.args ?? {})}`
  if (type === "tool-result")
    return `[tool-result] ${String(part.toolCallId ?? "?")}: ${JSON.stringify(part.result ?? part.output ?? "")}`
  return `[${type}] ${JSON.stringify(part)}`
}

const contentToText = (content: ModelMessage["content"]): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((p) => partToText(p as ContentPart)).join("\n")
  return String(content ?? "")
}

const messageToText = (msg: ModelMessage): string => {
  const body = truncate(contentToText(msg.content))
  if (msg.role !== "tool") return `[${msg.role}]\n${body}`
  const toolId = Array.isArray(msg.content)
    ? ((msg.content as ContentPart[]).find((p) => p.type === "tool-result")?.toolCallId ?? "")
    : ""
  return `[tool:${toolId}]\n${body}`
}

export const formatContextMarkdown = (input: {
  sessionID: string
  agent: string
  model: string
  system: string[]
  messages: ModelMessage[]
}): string => {
  const system = input.system.join("\n\n")
  const messages = input.messages
    .map((msg, i) => `### ${i} ${msg.role}\n\n${messageToText(msg)}`)
    .join("\n\n")
  return [
    `# CONTEXTE RÉEL — ${input.sessionID}`,
    `- Date : ${new Date().toISOString()}`,
    `- Agent : ${input.agent}`,
    `- Modèle : ${input.model}`,
    `- Messages : ${input.messages.length}`,
    "",
    "## SYSTEM PROMPT",
    "",
    "```text",
    truncate(system),
    "```",
    "",
    "## MESSAGES",
    "",
    messages,
    "",
  ].join("\n")
}

export const writeContextSnapshot = (input: {
  sessionID: string
  agent: string
  model: string
  system: string[]
  messages: ModelMessage[]
}): void => {
  const path = Bun.env.OPENCODE_CONTEXT_FILE
  if (!path) return
  const markdown = formatContextMarkdown(input)
  void Bun.write(path, markdown).catch(() => {})
}

export * as ContextFile from "./context-file"
