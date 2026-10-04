import type { Provider } from "@/provider/provider"

const PDF_ADAPTERS = new Set([
  "@ai-sdk/anthropic",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
])

const AUDIO_ADAPTERS = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
])

export function supportsExtractedAudio(model: Provider.Model | undefined) {
  return Boolean(model?.capabilities.input.audio && AUDIO_ADAPTERS.has(model.api.npm))
}

export function supportsPdfInput(model: Provider.Model | undefined) {
  return Boolean(model?.capabilities.input.pdf && PDF_ADAPTERS.has(model.api.npm))
}
