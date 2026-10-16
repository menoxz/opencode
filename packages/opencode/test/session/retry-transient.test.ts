import { describe, expect, test } from "bun:test"
import type { NamedError } from "@opencode-ai/core/util/error"
import { Effect, Schedule, Schema } from "effect"
import { SessionRetry } from "../../src/session/retry"
import { MessageV2 } from "../../src/session/message-v2"

const retryProvider = "test"

function apiError(input: { statusCode?: number; headers?: Record<string, string> }): MessageV2.APIError {
  return Schema.decodeUnknownSync(MessageV2.APIError.Schema)(
    new MessageV2.APIError({
      message: "boom",
      isRetryable: input.statusCode === undefined,
      responseHeaders: input.headers,
      statusCode: input.statusCode,
    }).toObject(),
  )
}

function wrap(message: unknown): ReturnType<NamedError["toObject"]> {
  return { name: "", data: { message } }
}

/**
 * Ces erreurs interrompaient la session alors qu'elles se résolvent seules : un délai
 * dépassé, un flux fermé avant la fin, une connexion coupée. Elles rejoignent les 5xx, et
 * elles n'ont pas besoin que le SDK du provider les marque.
 */
describe("session.retry.transient", () => {
  test("retries the statuses that cut a session, without the SDK flag", () => {
    for (const status of [408, 425, 429, 500, 503]) {
      expect(SessionRetry.retryable(apiError({ statusCode: status }), retryProvider)).toBeDefined()
    }
  })

  test("keeps refusing the statuses that are not transient", () => {
    for (const status of [400, 401, 404]) {
      expect(SessionRetry.retryable(apiError({ statusCode: status }), retryProvider)).toBeUndefined()
    }
  })

  test("retries transport and stream cuts, which arrive without any status", () => {
    for (const message of [
      "fetch failed",
      "socket hang up",
      "read ECONNRESET",
      "stream closed before completion",
      "The operation timed out",
    ]) {
      expect(SessionRetry.retryable(wrap(message), retryProvider)).toEqual({ message })
    }
  })

  test("never retries an abort the user asked for", () => {
    expect(SessionRetry.retryable({ name: "AbortError", data: { message: "Aborted" } }, retryProvider)).toBeUndefined()
  })
})

/**
 * Le plafond : sans lui, un `retry-after` serveur de plusieurs heures retenait la session
 * pour toujours. Passé RETRY_MAX_ATTEMPTS, l'erreur est rendue au client.
 */
describe("session.retry.cap", () => {
  test("stops at RETRY_MAX_ATTEMPTS and never schedules one more", async () => {
    const attempts: number[] = []
    const step = await Effect.runPromise(
      Schedule.toStepWithMetadata(
        SessionRetry.policy({
          provider: "test",
          parse: Schema.decodeUnknownSync(MessageV2.APIError.Schema),
          set: (info) => Effect.sync(() => void attempts.push(info.attempt)),
        }),
      ),
    )
    const error = apiError({ headers: { "retry-after-ms": "0" } })

    for (let index = 0; index < SessionRetry.RETRY_MAX_ATTEMPTS + 5; index++) {
      await Effect.runPromise(Effect.exit(step(error)))
    }

    expect(attempts).toHaveLength(SessionRetry.RETRY_MAX_ATTEMPTS)
    expect(attempts.at(-1)).toBe(SessionRetry.RETRY_MAX_ATTEMPTS)
  })

  test("an error that is not retryable stops at the first attempt", async () => {
    const attempts: number[] = []
    const step = await Effect.runPromise(
      Schedule.toStepWithMetadata(
        SessionRetry.policy({
          provider: "test",
          parse: Schema.decodeUnknownSync(MessageV2.APIError.Schema),
          set: (info) => Effect.sync(() => void attempts.push(info.attempt)),
        }),
      ),
    )

    await Effect.runPromise(Effect.exit(step(apiError({ statusCode: 400 }))))

    expect(attempts).toHaveLength(0)
  })
})
