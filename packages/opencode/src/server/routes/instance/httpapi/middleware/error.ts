import { NamedError } from "@opencode-ai/core/util/error"
import * as Log from "@opencode-ai/core/util/log"
import { Cause, Effect } from "effect"
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerRespondable, HttpServerResponse } from "effect/unstable/http"
import { ConfigError } from "@/config/error"

const log = Log.create({ service: "server" })

// Keep typed HttpApi failures on their declared error path; this boundary only replaces defect-only empty 500s.
export const errorLayer = HttpRouter.middleware<{ handles: unknown }>()((effect) =>
  effect.pipe(
    Effect.catchCause((cause) => {
      const defect = cause.reasons.filter(Cause.isDieReason).find((reason) => {
        if (HttpServerResponse.isHttpServerResponse(reason.defect)) return false
        if (HttpServerError.isHttpServerError(reason.defect)) return false
        if (HttpServerRespondable.isRespondable(reason.defect)) return false
        return true
      })
      if (!defect) return Effect.failCause(cause)

      const error = defect.defect

      // An invalid opencode.json is the user's own doing and every client already
      // knows how to render these two errors. Hiding them behind a generic 500
      // turned a one-line fix into "Unexpected server error. Check server logs",
      // and at startup it hit four requests at once with no actionable detail.
      if (ConfigError.InvalidError.isInstance(error) || ConfigError.JsonError.isInstance(error)) {
        log.error("invalid config", { error })
        return Effect.succeed(HttpServerResponse.jsonUnsafe(error.toObject(), { status: 400 }))
      }

      const ref = `err_${crypto.randomUUID().slice(0, 8)}`

      log.error("failed", { ref, error, cause: Cause.pretty(cause) })

      // "Check server logs for details" without naming the log, the file or the
      // actual error left users guessing — it is the single most reported
      // complaint about this message. Carry the cause and the log path, but only
      // to a client on the same machine: over a tunnel / LAN the raw message and
      // the absolute log path leak internals (paths, SQL, the Windows username).
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      const logfile = Log.file()

      return HttpServerRequest.HttpServerRequest.pipe(
        Effect.map((request) => {
          const host = request.headers.host ?? ""
          const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
          const message = local
            ? [`Unexpected server error: ${detail}`, logfile ? `Log: ${logfile}` : undefined]
                .filter((line) => Boolean(line))
                .join(" — ")
            : `Unexpected server error (ref ${ref}). Check the server log for details.`
          return HttpServerResponse.jsonUnsafe(new NamedError.Unknown({ message, ref }).toObject(), { status: 500 })
        }),
      )
    }),
  ),
).layer
