import type { ModelMessage, Tool } from "ai"

/**
 * Snapshot fidèle du contexte réel envoyé au fournisseur LLM.
 * Activable par la variable d'environnement OPENCODE_CONTEXT_FILE :
 * à chaque tour, le payload assemblé (system + messages + tools) est écrit
 * dans ce fichier sans troncature, pour évaluer la qualité du context builder.
 */

type ContentPart = Record<string, unknown> & { type?: string }

const jsonSafe = (value: unknown): string =>
  JSON.stringify(
    value,
    (key, v) => (typeof v === "function" ? undefined : v),
    2,
  )

const partToText = (part: ContentPart): string => {
  if (part.type === "text") return String(part.text ?? "")
  return jsonSafe(part)
}

const contentToText = (content: ModelMessage["content"]): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((p) => partToText(p as ContentPart)).join("\n")
  return jsonSafe(content ?? null)
}

export const formatContextMarkdown = (input: {
  sessionID: string
  agent: string
  model: string
  system: string[]
  messages: ModelMessage[]
  tools?: Record<string, Tool>
}): string => {
  const messages = input.messages
    .map((msg, i) => `### ${i} ${msg.role}\n\n${contentToText(msg.content)}`)
    .join("\n\n")
  const tools = Object.entries(input.tools ?? {})
    .map(([name, tool]) => `### ${name}\n\n\`\`\`json\n${jsonSafe(tool)}\n\`\`\``)
    .join("\n\n")
  return [
    `# session=${input.sessionID} agent=${input.agent} model=${input.model} date=${new Date().toISOString()} messages=${input.messages.length} tools=${Object.keys(input.tools ?? {}).length}`,
    "",
    "## SYSTEM",
    "",
    input.system.join("\n\n"),
    "",
    "## MESSAGES",
    "",
    messages,
    ...(tools
      ? [
          "",
          "## TOOLS",
          "",
          tools,
        ]
      : []),
    "",
  ].join("\n")
}

export const writeContextSnapshot = (input: {
  sessionID: string
  agent: string
  model: string
  system: string[]
  messages: ModelMessage[]
  tools?: Record<string, Tool>
}): void => {
  const path = Bun.env.OPENCODE_CONTEXT_FILE
  if (!path) return
  const markdown = formatContextMarkdown(input)
  void Bun.write(path, markdown).catch(() => {})
}

export * as ContextFile from "./context-file"
