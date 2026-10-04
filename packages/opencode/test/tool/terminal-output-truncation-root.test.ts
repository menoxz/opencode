import { expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { Truncate } from "../../src/tool/truncate"
import { compactTerminalOutput, createTerminalPollState } from "../../src/tool/terminal-output"
import { testEffect } from "../lib/effect"

const it = testEffect(Truncate.defaultLayer)
const ROOT = path.resolve(Truncate.DIR)

/**
 * The pre-fix check, kept local on purpose: it must accept the sibling below, otherwise the guard
 * would carry no weight and every rejection assertion would pass whatever the implementation is.
 */
const naivePrefix = (value: string) => String(value).startsWith(ROOT)

/** The exact shape `Truncate.savedOutputPath` recovers a reference from. */
const hint = (saved: string) => `...output truncated...\n\nFull output saved to: ${saved}\n\ntail`
const REFERENCE = "Upstream reference (unverified; not opened)"
const upstream = (metadata: Record<string, unknown>) =>
  (metadata.terminalOutput as { upstreamReferences: string[] }).upstreamReferences

const SIBLING = `${ROOT}_EVIL/secret`
const TRAVERSAL = path.join(ROOT, "..", "..", "..", "etc", "shadow")
const ABSOLUTE = "C:\\etc\\shadow"

const compact = (sessionID: string, output: string, metadata: Record<string, unknown> = {}) =>
  Effect.gen(function* () {
    const store = yield* Truncate.Service
    return yield* compactTerminalOutput({
      tool: "bash",
      args: { command: "bun test" },
      sessionID,
      output,
      metadata,
      polls: createTerminalPollState(),
      store,
    })
  })

it.live("sibling vector: a path merely prefixed by the truncation root is not retained", () =>
  Effect.gen(function* () {
    const output = hint(SIBLING)
    // The fixture must actually carry a recoverable reference, so a green result below is the
    // guard rejecting it, not a hint that never parsed.
    expect(Truncate.savedOutputPath(output)).toBe(SIBLING)
    const result = yield* compact("p16-sibling", output)
    expect(upstream(result.metadata)).toEqual([])
    expect(result.metadata.upstreamOutputPaths).toBeUndefined()
    expect(result.output).not.toContain(REFERENCE)
  }))

it.live("traversal vector: a reference climbing out of the truncation root is not retained", () =>
  Effect.gen(function* () {
    const output = hint(TRAVERSAL)
    expect(Truncate.savedOutputPath(output)).toBe(TRAVERSAL)
    const result = yield* compact("p16-traversal", output)
    expect(upstream(result.metadata)).toEqual([])
    expect(result.metadata.upstreamOutputPaths).toBeUndefined()
    expect(result.output).not.toContain(REFERENCE)
  }))

it.live("absolute vector: a foreign absolute path is not retained", () =>
  Effect.gen(function* () {
    const output = hint(ABSOLUTE)
    expect(Truncate.savedOutputPath(output)).toBe(ABSOLUTE)
    const result = yield* compact("p16-absolute", output)
    expect(upstream(result.metadata)).toEqual([])
    expect(result.metadata.upstreamOutputPaths).toBeUndefined()
    expect(result.output).not.toContain(REFERENCE)
  }))

it.live("negative control: the naive prefix check accepts the sibling the guard rejects", () =>
  Effect.sync(() => {
    expect(naivePrefix(SIBLING)).toBe(true)
    expect(naivePrefix(ROOT + path.sep + "tool_legitimate")).toBe(true)
    expect(naivePrefix(TRAVERSAL)).toBe(false)
    expect(naivePrefix(ABSOLUTE)).toBe(false)
    console.log(`NAIVE_PREDICATE_ACCEPTS_SIBLING ${naivePrefix(SIBLING)} :: ${SIBLING}`)
  }))

it.live("a journal inside the truncation root is still retained as a reference", () =>
  Effect.gen(function* () {
    const store = yield* Truncate.Service
    const journal = yield* store.write("journal payload")
    expect(path.resolve(journal).startsWith(ROOT + path.sep)).toBe(true)
    const result = yield* compact("p16-legitimate", hint(journal))
    expect(upstream(result.metadata)).toEqual([journal])
    expect(result.metadata.upstreamOutputPaths).toEqual([journal])
    expect(result.output).toContain(`${REFERENCE}: ${JSON.stringify(journal)}`)
  }))

it.live("host metadata.outputPath passes through unfiltered while a sibling hint in the text is dropped", () =>
  Effect.gen(function* () {
    const store = yield* Truncate.Service
    const journal = yield* store.write("host journal")
    const result = yield* compact("p16-passthrough", hint(SIBLING), { outputPath: journal })
    expect(upstream(result.metadata)).toEqual([journal])
    expect(result.metadata.upstreamOutputPaths).toEqual([journal])
    expect(result.metadata.outputPath).toBe(journal)
  }))