import { describe, expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import {
  SESSION_DIRECTORY_HEADER,
  directoryHeaderValue,
  directoryMatches,
  directoryRequestOptions,
  normalizeDirectoryPath,
  sessionDirectory,
} from "./session-directory"

describe("session directory routing", () => {
  test("a directory travels raw, because the server reads the header value as the path itself", () => {
    expect(directoryHeaderValue("C:\\jeanluc")).toBe("C:\\jeanluc")
    expect(directoryHeaderValue("C:\\jeanluc\\opencode-fork")).toBe("C:\\jeanluc\\opencode-fork")
  })

  test("an unknown or blank directory sends nothing, rather than falling back to the server's own cwd", () => {
    expect(directoryHeaderValue(undefined)).toBeUndefined()
    expect(directoryHeaderValue("")).toBeUndefined()
    expect(directoryHeaderValue("   ")).toBeUndefined()
    expect(directoryRequestOptions(undefined)).toEqual({})
  })

  test("request options carry the directory under the header the server reads", () => {
    expect(SESSION_DIRECTORY_HEADER).toBe("x-opencode-directory")
    expect(directoryRequestOptions("C:\\jeanluc")).toEqual({
      headers: { [SESSION_DIRECTORY_HEADER]: "C:\\jeanluc" },
    })
  })

  test("a session's directory comes from the session it belongs to", () => {
    const sessions = [
      { id: "a", directory: "C:\\jeanluc" },
      { id: "b", directory: "C:\\jeanluc\\opencode-fork" },
    ]
    expect(sessionDirectory(sessions, "a")).toBe("C:\\jeanluc")
    expect(sessionDirectory(sessions, "b")).toBe("C:\\jeanluc\\opencode-fork")
    expect(sessionDirectory(sessions, "missing")).toBeUndefined()
    expect(sessionDirectory(sessions, undefined)).toBeUndefined()
  })

  test("a session displayed under one directory but worked in another is a mismatch — the defect this fixes", () => {
    // Observed live: session stored under C:\jeanluc while every message journaled cwd = C:\jeanluc\opencode-fork.
    expect(
      directoryMatches("C:\\jeanluc", { cwd: "C:\\jeanluc\\opencode-fork", root: "C:\\jeanluc\\opencode-fork" }),
    ).toBe(false)
    expect(directoryMatches("C:\\jeanluc", { cwd: "C:\\jeanluc", root: "C:\\jeanluc" })).toBe(true)
  })

  test("comparison ignores separators and case, and treats an unknown side as unknown", () => {
    expect(normalizeDirectoryPath("C:\\jeanluc\\")).toBe(normalizeDirectoryPath("c:/jeanluc"))
    expect(directoryMatches("C:\\jeanluc", { cwd: "c:/jeanluc/" })).toBe(true)
    expect(directoryMatches(undefined, { cwd: "C:\\jeanluc" })).toBe(false)
    expect(directoryMatches("C:\\jeanluc", undefined)).toBe(false)
    expect(directoryMatches("C:\\jeanluc", {})).toBe(false)
  })
})

describe("a session-scoped call reaches the server under the session's directory", () => {
  test("the per-call directory overrides the client's launch directory on a write, and becomes a query parameter on a read", async () => {
    const calls: Array<{ method: string; header: string | null; query: string | null }> = []
    // Bun's `typeof fetch` also wants `preconnect`; the SDK's own client casts the same way.
    const customFetch: any = async (request: Request) => {
      calls.push({
        method: request.method,
        header: request.headers.get(SESSION_DIRECTORY_HEADER),
        query: new URL(request.url).searchParams.get("directory"),
      })
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    }
    const client = createOpencodeClient({
      baseUrl: "http://127.0.0.1:1",
      directory: "C:\\jeanluc\\opencode-fork",
      fetch: customFetch,
    })

    const session = "C:\\jeanluc"
    // A write keeps the header; a read is rewritten into ?directory= by the client interceptor.
    await client.session.abort({ sessionID: "ses_x" }, directoryRequestOptions(session))
    await client.session.get({ sessionID: "ses_x" }, directoryRequestOptions(session))
    // Without routing, the same write is executed under the client's launch directory: the defect.
    await client.session.abort({ sessionID: "ses_x" })

    const routed = calls[0]!
    const read = calls[1]!
    const unrouted = calls[2]!

    expect(routed.method).toBe("POST")
    expect(routed.header).toBe(session)
    expect(read.header).toBeNull()
    expect(read.query).toBe(session)
    expect(unrouted.header).toBe(encodeURIComponent("C:\\jeanluc\\opencode-fork"))
    expect(unrouted.header).not.toBe(routed.header)
  })
})
