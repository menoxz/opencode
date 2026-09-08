import type { LanguageModelV3, LanguageModelV3CallOptions } from "@ai-sdk/provider"

// OpenAI's Responses converter reserves tool_search even for ordinary functions.
// Keep the workaround at the SDK boundary so persisted/executed names stay local.
export function wrapResponsesToolSearch(model: LanguageModelV3, npm: string): LanguageModelV3 {
  if (!["@ai-sdk/openai", "@ai-sdk/azure"].includes(npm) || !model.provider.endsWith(".responses")) return model
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    async doGenerate(options) {
      const mapped = mapToolSearch(options)
      const result = await model.doGenerate(mapped.options)
      return { ...result, content: result.content.map((part) => restore(part, mapped.alias)) }
    },
    async doStream(options) {
      const mapped = mapToolSearch(options)
      const result = await model.doStream(mapped.options)
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              controller.enqueue(restore(part, mapped.alias))
            },
          }),
        ),
      }
    },
  }
}

function restore<T>(part: T, alias: string | undefined): T {
  if (!alias || !part || typeof part !== "object" || !("toolName" in part) || part.toolName !== alias) return part
  return { ...part, toolName: "tool_search" }
}

type Part = Exclude<LanguageModelV3CallOptions["prompt"][number]["content"], string>[number]

function mapToolSearch(options: LanguageModelV3CallOptions) {
  const parts = options.prompt.flatMap<Part>((message) => (typeof message.content === "string" ? [] : message.content))
  const hosted = new Set(options.tools?.filter((tool) => tool.type === "provider").map((tool) => tool.name))
  const hostedCalls = new Set(
    parts
      .filter((part) => part.type === "tool-call" && part.providerExecuted)
      .map((part) => ("toolCallId" in part ? part.toolCallId : "")),
  )
  const local = (name: string) => name === "tool_search" && !hosted.has(name)
  const active =
    options.tools?.some((tool) => tool.type === "function" && local(tool.name)) ||
    parts.some(
      (part) =>
        (part.type === "tool-call" || part.type === "tool-result") &&
        local(part.toolName) &&
        !hostedCalls.has(part.toolCallId),
    )
  if (!active) return { options, alias: undefined }
  const names = new Set([
    ...(options.tools?.map((tool) => tool.name) ?? []),
    ...(options.tools?.flatMap((tool) =>
      tool.type === "provider" && typeof tool.args.name === "string" ? [tool.args.name] : [],
    ) ?? []),
    ...parts.flatMap((part) => ("toolName" in part ? [part.toolName] : [])),
  ])
  let alias = "opencode_tool_search"
  while (names.has(alias)) alias += "_"
  function rename<T extends Part>(part: T): T {
    return (part.type === "tool-call" || part.type === "tool-result") &&
      local(part.toolName) &&
      !hostedCalls.has(part.toolCallId)
      ? { ...part, toolName: alias }
      : part
  }
  return {
    alias,
    options: {
      ...options,
      tools: options.tools?.map((tool) =>
        tool.type === "function" && local(tool.name) ? { ...tool, name: alias } : tool,
      ),
      toolChoice:
        options.toolChoice?.type === "tool" && local(options.toolChoice.toolName)
          ? { ...options.toolChoice, toolName: alias }
          : options.toolChoice,
      prompt: options.prompt.map((message) => {
        if (message.role === "assistant") return { ...message, content: message.content.map(rename) }
        if (message.role === "tool") return { ...message, content: message.content.map(rename) }
        return message
      }),
    } satisfies LanguageModelV3CallOptions,
  }
}
