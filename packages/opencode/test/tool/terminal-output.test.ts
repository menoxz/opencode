import { expect } from "bun:test"
import { Effect } from "effect"
import { lstat, symlink, unlink } from "node:fs/promises"
import { Truncate } from "../../src/tool/truncate"
import { compactTerminalOutput, createTerminalPollState } from "../../src/tool/terminal-output"
import { testEffect } from "../lib/effect"

const it = testEffect(Truncate.defaultLayer)
const fixtures = {
  silent: "",
  failure: `prelude\nerror: first failure\n  expected 1, received 2\n${"diagnostic detail\n".repeat(1000)}last failure tail`,
  diff: "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new",
  passes: `bun test v1.3.14\n${Array.from({ length: 1000 }, (_, i) => `(pass) test ${i} [1ms]`).join("\n")}\n1000 pass\n0 fail\nRan 1000 tests`,
  unicode: `bun test v1.3.14\n\u001b[32m(pass) good [1ms]\u001b[0m\r⠋ loading\r${"😀漢字é\n".repeat(1000)}warning: Unicode tail 😀`,
}

for (const [name, output] of Object.entries(fixtures)) {
  it.live(`terminal fixture ${name}: bounded evidence and raw journal`, () => Effect.gen(function* () {
    const store = yield* Truncate.Service
    const result = yield* compactTerminalOutput({ tool: "bash", args: { command: name === "diff" ? "git diff" : "bun test" }, sessionID: "fixture", output, metadata: { exit: name === "failure" ? 1 : 0 }, polls: createTerminalPollState(), store })
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(4000)
    expect(result.output.split("\n").length).toBeLessThanOrEqual(120)
    expect(result.output).not.toContain("\ufffd")
    expect(result.output).not.toContain("Task tool")
    if (name === "silent") {
      expect(result.output).toContain("exit=0")
      expect(result.output).toContain("No output")
      expect(result.output).not.toContain("passed")
    }
    if (name === "failure") {
      expect(result.output).toContain("first failure")
      expect(result.output).toContain("expected 1")
      expect(result.output).toContain("last failure tail")
      expect(result.output).not.toContain("succeeded")
    }
    if (name === "diff") expect(result.output).toContain(output)
    if (name === "passes") {
      expect(result.output).toContain("1000 pass")
      expect(result.output).not.toContain("(pass)")
    }
    if (name === "unicode") expect(result.output).toContain("Unicode tail 😀")
    const journal = result.metadata.outputPath
    if (typeof journal === "string") expect(yield* Effect.promise(() => Bun.file(journal).text())).toBe(output)
    console.log(`RATIO ${name} raw=${Buffer.byteLength(output)} delivered=${Buffer.byteLength(result.output)}`)
  }))
}

it.live("structured MCP controls, unknown data, raw-path reuse and exact polling", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const polls = createTerminalPollState()
  const run = (output: string, args: Record<string, unknown> = { commandId: "c1" }, tool = "mcp-terminal_command_status", sessionID = "s1", metadata = {}) => compactTerminalOutput({ tool, args, sessionID, output, metadata, polls, store })
  const first = JSON.stringify({ commandId: "c1", terminalId: "t1", status: "running", stdout: "first\n", unknown: { evidence: "keep me" } })
  const a = yield* run(first)
  expect(a.output).toContain('"commandId":"c1"')
  expect(a.output).toContain("keep me")
  const braw = JSON.stringify({ commandId: "c1", terminalId: "t1", status: "done", exitCode: 2, stdout: "first\nsecond\n", unknown: { evidence: "keep me" } })
  // Changed non-log evidence is part of the prefix check: no unsafe dedupe.
  const b = yield* run(braw)
  expect(b.output).toContain("exit=2")
  expect(b.output).toContain("second")
  const raw = JSON.stringify({ commandId: "c1", stdout: "first\n" })
  yield* run(raw)
  const delta = yield* run(JSON.stringify({ commandId: "c1", stdout: "first\nsecond\n" }))
  expect(delta.output).toContain("cumulative delta")
  expect(delta.output).not.toContain("first\n")
  expect(yield* Effect.promise(() => Bun.file(String(delta.metadata.outputPath)).text())).toBe(JSON.stringify({ commandId: "c1", stdout: "first\nsecond\n" }))
  for (const [args, sessionID] of [[{ commandId: "c2" }, "s1"], [{ commandId: "c1", maxTokens: 100 }, "s1"], [{ commandId: "c1" }, "s2"]] as const) {
    expect((yield* run(raw, args, undefined, sessionID)).output).not.toContain("cumulative delta")
  }
  expect((yield* run(JSON.stringify({ commandId: "c1", stdout: "rotated\n" }))).output).toContain("rotated")
  expect((yield* run(JSON.stringify({ commandId: "c1", stdout: "delta only\n" }))).output).not.toContain("cumulative delta")
  yield* run(raw, { command: "same" }, "mcp-terminal_command_run")
  expect((yield* run(JSON.stringify({ commandId: "c1", stdout: "first\nsecond\n" }), { command: "same" }, "mcp-terminal_command_run")).output).not.toContain("cumulative delta")
  const long = JSON.stringify({ commandId: "large", status: "failed", exitCode: 1, stderr: fixtures.failure })
  const truncated = yield* store.output(long, { maxBytes: 100 })
  if (!truncated.truncated) throw new Error("expected initial truncation")
  const reused = yield* run(truncated.content, {}, "mcp-terminal_command_run", "s1", { outputPath: truncated.outputPath })
  expect(reused.metadata.outputPath).toBe(truncated.outputPath)
  expect(reused.output).not.toContain('"commandId":"large"')
  expect(reused.output).toContain("exit unknown")
  expect(reused.output).not.toContain("last failure tail")
  expect(reused.output).toContain("unverified; not opened")
  const embedded = yield* run(truncated.content, {}, "bash")
  expect(embedded.metadata.outputPath).toBeUndefined()
  expect(embedded.metadata.upstreamOutputPaths).toEqual([truncated.outputPath])
  expect(yield* Effect.promise(() => Bun.file(truncated.outputPath).text())).toBe(long)
  const again = yield* store.output(truncated.content, { maxBytes: 20 })
  expect(again.truncated && again.outputPath).not.toBe(truncated.outputPath)
  if (again.truncated) expect(yield* Effect.promise(() => Bun.file(again.outputPath).text())).toBe(truncated.content)
}))

it.live("polling is bounded and control actions are unchanged", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const polls = createTerminalPollState()
  for (let index = 0; index < 30; index++) yield* compactTerminalOutput({ tool: "mcp-terminal_command_status", args: { commandId: String(index) }, sessionID: "s", output: "old", metadata: {}, polls, store })
  expect(polls.size).toBeLessThanOrEqual(16)
  const unchanged = yield* compactTerminalOutput({ tool: "developer-tools_native_terminal", args: { action: "signal" }, sessionID: "s", output: "control response", metadata: { terminalId: "t" }, polls, store })
  expect(unchanged).toEqual({ output: "control response", metadata: { terminalId: "t" } })
}))

it.live("all terminal result actions preserve nested controls and unknown evidence", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  for (const [tool, args] of [
    ["mcp-terminal_command_chain", {}], ["mcp-terminal_command_wait", { commandId: "c" }],
    ["mcp-terminal_terminal_read", { target: "t" }], ["mcp-terminal_ssh_run", {}],
    ["mcp-terminal_command_stream", { action: "read", streamId: "stream" }],
    ["developer-tools_native_terminal", { action: "execute" }],
    ["developer-tools_native_terminal", { action: "read", terminalId: "t" }],
    ["developer-tools_native_terminal", { action: "stream_read", streamId: "stream" }],
  ] as const) {
    const raw = JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ commandId: "c", terminalId: "t", streamId: "stream", status: "failed", exitCode: 7, stdout: fixtures.failure, custom: "retain this" }) }] })
    const result = yield* compactTerminalOutput({ tool, args, sessionID: "s", output: raw, metadata: { attachmentHandle: "keep" }, polls: createTerminalPollState(), store })
    expect(result.output).toContain('"commandId":"c"')
    expect(result.output).toContain('"streamId":"stream"')
    expect(result.output).toContain("exit=7")
    expect(result.output).toContain("retain this")
    expect(result.output).toContain("first failure")
    expect(result.output).toContain("last failure tail")
    expect(result.metadata.attachmentHandle).toBe("keep")
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(4000)
  }
}))

it.live("missing journals, shell timeout metadata, and failed polls retain evidence", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const polls = createTerminalPollState()
  const run = (output: string, metadata = {}) => compactTerminalOutput({ tool: "mcp-terminal_command_status", args: { commandId: "c" }, sessionID: "s", output, metadata, polls, store })
  yield* run("error: old failure\n")
  const failed = yield* run("error: old failure\nnew tail", { exit: 1 })
  expect(failed.output).toContain("old failure")
  expect(failed.output).not.toContain("cumulative delta")
  const missing = `${Truncate.DIR}/tool_missing_terminal_test`
  const unavailable = yield* run(fixtures.failure, { outputPath: missing })
  expect(unavailable.metadata.outputPath).not.toBe(missing)
  expect(unavailable.metadata.upstreamOutputPaths).toEqual([missing])
  expect(yield* Effect.promise(() => Bun.file(String(unavailable.metadata.outputPath)).text())).toBe(fixtures.failure)
  expect(unavailable.output).toContain("first failure")
  expect(yield* Effect.promise(() => Bun.file(missing).exists())).toBe(false)
  const journal = yield* store.write(fixtures.failure)
  const timeout = yield* run(`Full output saved to: ${journal}\n<shell_metadata>command timed out</shell_metadata>`, { outputPath: journal })
  expect(timeout.output).toContain("command timed out")
  expect(timeout.metadata.outputPath).toBe(journal)
}))

it.live("F1/F3: real canary, symlink and 32 MiB references never supply compactor content", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  expect("read" in store).toBe(false)
  const canary = yield* store.write("PRIVATE_CROSS_SESSION_CANARY")
  const large = yield* store.write("LARGE_UNREAD_CANARY\n" + "x".repeat(32 * 1024 * 1024))
  const link = `${canary}-symlink`
  yield* Effect.promise(() => symlink(canary, link, "file"))
  yield* Effect.gen(function* () {
    expect((yield* Effect.promise(() => lstat(link))).isSymbolicLink()).toBe(true)
    for (const reference of [canary, link, large]) {
      for (const metadata of [{}, { outputPath: reference }]) {
        const raw = `public output\nFull output saved to: ${reference}`
        const result = yield* compactTerminalOutput({ tool: "bash", args: {}, sessionID: "other-session", output: raw, metadata, polls: createTerminalPollState(), store })
        expect(result.output).not.toContain("PRIVATE_CROSS_SESSION_CANARY")
        expect(result.output).not.toContain("LARGE_UNREAD_CANARY")
        expect(result.output).toContain("unverified; not opened")
        expect(result.metadata.terminalOutput).toMatchObject({ rawBytes: Buffer.byteLength(raw) })
        expect(Buffer.byteLength(result.output)).toBeLessThan(1000)
      }
    }
  }).pipe(Effect.ensuring(Effect.promise(() => Promise.all([unlink(link), unlink(canary), unlink(large)]))))
}))

it.live("F2: expired reference cannot suppress journaling newly omitted received evidence", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const expired = yield* store.write("old output")
  yield* Effect.promise(() => unlink(expired))
  const raw = `${"first\n".repeat(800)}UNIQUE_NEW_OMITTED_EVIDENCE\n${"last\n".repeat(800)}Full output saved to: ${expired}`
  const result = yield* compactTerminalOutput({ tool: "bash", args: {}, sessionID: "expired", output: raw, metadata: { outputPath: expired }, polls: createTerminalPollState(), store })
  expect(result.output).not.toContain("UNIQUE_NEW_OMITTED_EVIDENCE")
  expect(result.metadata.outputPath).not.toBe(expired)
  expect(result.metadata.upstreamOutputPaths).toEqual([expired])
  expect(result.output).toContain("Received output saved to:")
  expect(yield* Effect.promise(() => Bun.file(String(result.metadata.outputPath)).text())).toBe(raw)
}))

it.live("F4: bash JSON is data and MCP claims cannot override executor failures", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const raw = JSON.stringify({ exitCode: 0, stdout: "reported success", success: true, status: "done", commandId: "remote" })
  for (const tool of ["bash", "mcp-terminal_command_run"]) {
    for (const metadata of [{ exit: 7 }, { exitCode: 7 }, { exit_code: 7 }, { exit: 7, exitCode: 0 }]) {
      const result = yield* compactTerminalOutput({ tool, args: {}, sessionID: "conflict", output: raw, metadata, polls: createTerminalPollState(), store })
      expect(result.output).toContain("; exit=7")
      expect(result.output).toContain("; failed")
      if (tool === "bash") {
        expect(result.output).toContain(raw)
        expect(result.metadata.terminalOutput).toMatchObject({ reportedControls: {} })
      }
      if (tool !== "bash") expect(result.output).toContain('"commandId":"remote"')
    }
  }
  const failure = yield* compactTerminalOutput({ tool: "mcp-terminal_command_run", args: {}, sessionID: "conflict", output: raw, metadata: { isError: true, status: "failed" }, polls: createTerminalPollState(), store })
  expect(failure.output).toContain("; failed")
}))

it.live("single-line Unicode, mid-log failure context, and duration units", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  for (const output of ["😀漢字é".repeat(10000), `${"prelude\n".repeat(300)}error: middle failure\nexpected 1, got 2\n${"detail\n".repeat(1000)}tail evidence`]) {
    const result = yield* compactTerminalOutput({ tool: "bash", args: { command: "unknown" }, sessionID: "s", output, metadata: { exit: 1, duration: 1.5 }, polls: createTerminalPollState(), store })
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(4000)
    expect(result.output).not.toContain("\ufffd")
    expect(result.output).not.toContain("duration=1.5ms")
    if (output.includes("middle failure")) {
      expect(result.output).toContain("middle failure")
      expect(result.output).toContain("expected 1, got 2")
      expect(result.output).toContain("tail evidence")
    }
  }
}))

it.live("poll snapshots expire, reject oversized data and distinguish returned handles and delta mode", () => Effect.gen(function* () {
  const store = yield* Truncate.Service
  const polls = createTerminalPollState()
  const run = (stdout: string, controls = {}) => compactTerminalOutput({ tool: "mcp-terminal_command_status", args: { commandId: "c" }, sessionID: "s", output: JSON.stringify({ stdout, ...controls }), metadata: {}, polls, store })
  yield* run("old\n", { terminalId: "first" })
  expect((yield* run("old\nnew\n", { terminalId: "second" })).output).not.toContain("cumulative delta")
  yield* run("old\n")
  expect((yield* run("old\nnew\n", { mode: "delta" })).output).not.toContain("cumulative delta")
  for (const entry of polls.values()) entry.time = 0
  expect((yield* run("old\nnew\n")).output).not.toContain("cumulative delta")
  yield* run("x".repeat(150000))
  expect(polls.size).toBe(0)
}))
