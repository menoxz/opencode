import type { Provider } from "@/provider/provider"

const AUDIO_ADAPTERS = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
])

export function supportsExtractedAudio(model: Provider.Model | undefined) {
  return Boolean(model?.capabilities.input.audio && AUDIO_ADAPTERS.has(model.api.npm))
}
