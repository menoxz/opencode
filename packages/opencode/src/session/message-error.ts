import { Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"

/**
 * Raised when a provider stops generation because the response hit the model's
 * maximum output-token limit. Carries no data: the truncation is the signal.
 * Surfaced to the user so they can retry, shorten the prompt, or raise the cap.
 */
export const OutputLengthError = NamedError.create("MessageOutputLengthError", {})

/**
 * Raised when a provider rejects the request for credential reasons (missing,
 * invalid, or expired API key). `providerID` identifies which provider failed
 * so the UI can point the user at the right `auth login`; `message` is the
 * upstream reason, kept human-readable for direct display.
 */
export const AuthError = NamedError.create("ProviderAuthError", {
  providerID: Schema.String,
  message: Schema.String,
})

/**
 * Error shapes persisted on an assistant message and replayed to clients.
 * Order matters: known errors are matched before the `Unknown` catch-all.
 */
export const Shared = [AuthError.EffectSchema, NamedError.Unknown.EffectSchema, OutputLengthError.EffectSchema] as const
export const SharedSchema = Schema.Union(Shared)

/** Decoded form of any persisted message error. */
export type Info = typeof SharedSchema.Type

/**
 * Produce a short, single-line description of a persisted message error for
 * logs and diagnostics. Diagnostics-only: does not alter persisted shape or
 * client behavior. Falls back gracefully on malformed/unknown payloads.
 */
export function summarize(error: Info): string {
  switch (error.name) {
    case "ProviderAuthError":
      return `auth: ${error.data.providerID} rejected credentials (${error.data.message})`
    case "MessageOutputLengthError":
      return "output truncated: response hit the model output-token limit"
    default: {
      const data = error.data as { message?: unknown } | undefined
      const detail = typeof data?.message === "string" && data.message ? `: ${data.message}` : ""
      return `${error.name ?? "UnknownError"}${detail}`
    }
  }
}

export * as MessageError from "./message-error"
