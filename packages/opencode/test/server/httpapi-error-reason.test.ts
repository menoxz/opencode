import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test"
import { Effect } from "effect"
import { Session } from "@/session/session"
import { badRequest, internalError, reasonOf } from "../../src/server/routes/instance/httpapi/errors"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Handler failures used to collapse into the built-in `HttpApiError.BadRequest`,
// whose payload is `{ _tag }` only, so the cause never reached the client. That is
// why a Lean tool-cap mismatch stayed an opaque "Sending the prompt failed".
const instance = testEffect(Session.defaultLayer)

// This host's git/DB setup and teardown routinely exceed bun's 5s default: the
// untouched sibling `httpapi-schema-error-body` fails the same way.
setDefaultTimeout(30_000)

// `resetDatabase` already disposes the instances; calling both doubled the work
// past bun's 5s hook budget on this host.
afterEach(async () => {
  await resetDatabase()
})

describe("error reason extraction", () => {
  it("keeps the cause and redacts absolute paths and secret assignments", () => {
    const message = reasonOf(
      new Error(
        "lean dynamic tool cap 28 is too small at C:\\Users\\jeanl\\.secrets\\opencode.json token=sk-live-SENTINEL-VALUE",
      ),
    )
    expect(message).toContain("lean dynamic tool cap 28 is too small")
    expect(message).toContain("<path>")
    expect(message).toContain("<redacted>")
    expect(message).not.toContain("sk-live-SENTINEL-VALUE")
    expect(message).not.toContain("C:\\Users")
  })

  it("bounds the reason length", () => {
    const message = reasonOf(new Error("X".repeat(5000)))
    expect(message.length).toBeLessThanOrEqual(340)
    expect(message).toContain("more chars")
  })

  it("falls back when the cause carries no message", () => {
    expect(reasonOf(undefined)).toBe("Request failed")
    expect(reasonOf(new Error(""))).toBe("Request failed")
  })

  it("reads the message off non-Error tagged causes", () => {
    expect(reasonOf({ message: "storage unavailable" })).toBe("storage unavailable")
  })

  it("preserves the lean tool-cap numbers verbatim", () => {
    const reason = "lean dynamic tool cap too small: configuredMax=28 requiredCount=23 minimum=29"
    expect(reasonOf(new Error(reason))).toBe(reason)
  })

  it("maps to the message-carrying declared contracts", () => {
    const bad = badRequest(new Error("boom"))
    expect(bad._tag).toBe("InvalidRequestError")
    expect(bad.message).toBe("boom")
    const internal = internalError(new Error("kaboom"))
    expect(internal._tag).toBe("UnknownError")
    expect(internal.message).toBe("kaboom")
  })
})

describe("handler failures over HTTP", () => {
  instance.instance(
    "the messages endpoint carries the handler reason with the unchanged 400 status",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* Session.Service
        const info = yield* session.create({})
        // `before` without `limit` is rejected inside the handler (not by schema
        // decoding), so the body proves the handler mapping carries the reason.
        const url = `${SessionPaths.messages.replace(":sessionID", info.id)}?before=abc&directory=${encodeURIComponent(test.directory)}`
        const res = yield* Effect.promise(async () => Server.Default().app.request(url))
        const body = yield* Effect.promise(async () => res.text())
        expect(res.status).toBe(400)
        // Previously the body was `{"_tag":"BadRequest"}` with no reason.
        const parsed = JSON.parse(body)
        expect(parsed._tag).toBe("InvalidRequestError")
        expect(parsed.message).toBe('"before" requires "limit"')
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  instance.instance(
    "the share endpoint carries the handler reason with the unchanged 500 status",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* Session.Service
        const info = yield* session.create({})
        const url = `${SessionPaths.share.replace(":sessionID", info.id)}?directory=${encodeURIComponent(test.directory)}`
        const res = yield* Effect.promise(async () =>
          Server.Default().app.request(url, { method: "POST" }),
        )
        const body = yield* Effect.promise(async () => res.text())
        expect(res.status).toBe(500)
        expect(JSON.parse(body)).toEqual({
          _tag: "UnknownError",
          message: "Sharing is disabled in configuration",
        })
      }),
    { git: true, config: { share: "disabled", formatter: false, lsp: false } },
  )
})
