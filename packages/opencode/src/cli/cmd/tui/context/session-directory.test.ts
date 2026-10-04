import { describe, expect, test } from "bun:test"
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

describe("a session is displayed under the directory it executes in", () => {
  test("creation pins the client's own directory, so the stored directory is the one execution uses", () => {
    // The TUI creates a session under the directory it works in, and later requests are served by
    // that same instance: the displayed and executed directories are then the same by construction.
    const clientDirectory = "C:\\jeanluc\\opencode-fork"
    expect(directoryRequestOptions(clientDirectory)).toEqual({
      headers: { [SESSION_DIRECTORY_HEADER]: clientDirectory },
    })
    expect(directoryMatches(clientDirectory, { cwd: clientDirectory, root: "C:\\jeanluc" })).toBe(true)
  })

  test("a session stored under a directory other than the working one is the regression this guards", () => {
    // Routing execution to such a session would emit its events under another project, which the
    // TUI drops (event.ts) — the session would appear never to start — and would reload that
    // instance per request, restarting its MCP servers. Execution must follow the TUI.
    expect(directoryMatches("C:\\jeanluc", { cwd: "C:\\jeanluc\\opencode-fork" })).toBe(false)
  })
})
