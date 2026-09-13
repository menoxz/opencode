import type { LanguageModelMiddleware } from "ai"
import type { CachePrefix } from "./cache-prefix"

export type Observer = (boundary: CachePrefix.Summary["boundary"], payload: CachePrefix.Payload) => void

const aborted = (): CachePrefix.Payload => ({ options: [], system: [], tools: [], messages: [], aborted: true })

// Catch only diagnostics. doStream/transport must stay outside this boundary.
function observeSafely(
  observe: Observer,
  boundary: CachePrefix.Summary["boundary"],
  extract: () => CachePrefix.Payload,
) {
  let payload = aborted()
  try {
    payload = extract()
  } catch {
    /* Invalidate the consecutive comparison. */
  }
  try {
    observe(boundary, payload)
  } catch {
    /* Never log exception content. */
  }
}

// No Object.entries/spread over payloads: every visited property is charged,
// including undefined and inherited ones. Engine enumeration itself is not bounded.
function project(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return
  const result: Record<string, unknown> = Object.create(null)
  let nodes = 256
  let bytes = 65_536
  for (const name in value) {
    if (--nodes < 0 || (bytes -= name.length * 2) < 0) return
    if (!Object.hasOwn(value, name)) continue
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (!descriptor || !("value" in descriptor)) return
    if (descriptor.value !== undefined) result[name] = descriptor.value
  }
  return result
}

export function aiSDK(observe: Observer): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapStream: async ({ doStream, params, model }) => {
      observeSafely(observe, "ai-sdk", () => {
        const options = project(params)
        if (!options) return aborted()
        const prompt = options.prompt
        const tools = options.tools
        delete options.prompt
        delete options.tools
        delete options.headers
        delete options.abortSignal
        options.provider = model.provider
        options.model = model.modelId
        return {
          options: [options],
          system: [],
          tools: Array.isArray(tools) ? tools : [],
          messages: Array.isArray(prompt) ? prompt : [],
        }
      })
      return doStream()
    },
  }
}

export function native(observe: Observer, body: unknown) {
  observeSafely(observe, "native", () => {
    const options = project(body)
    if (!options) return aborted()
    const system = ["system", "instructions"].filter((name) => name in options).map((name) => [name, options[name]])
    const tools = options.tools
    const messages = options.messages ?? options.input
    for (const name of ["system", "instructions", "tools", "messages", "input"]) delete options[name]
    return {
      options: [options],
      system,
      tools: Array.isArray(tools) ? tools : [],
      messages: Array.isArray(messages) ? messages : messages === undefined ? [] : [messages],
    }
  })
}

export * as CachePrefixAdapters from "./cache-prefix-adapters"
