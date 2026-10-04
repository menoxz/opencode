import { Effect, Layer, Context, Schema } from "effect"
import { Bus } from "@/bus"
import { Snapshot } from "@/snapshot"
import { Storage } from "@/storage/storage"
import * as Session from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID } from "./schema"

function unquoteGitPath(input: string) {
  if (!input.startsWith('"')) return input
  if (!input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0))
      continue
    }

    const next = body[i + 1]
    if (!next) {
      bytes.push("\\".charCodeAt(0))
      continue
    }

    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4)
      const match = chunk.match(/^[0-7]{1,3}/)
      if (!match) {
        bytes.push(next.charCodeAt(0))
        i++
        continue
      }
      bytes.push(parseInt(match[0], 8))
      i += match[0].length
      continue
    }

    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === "\\" || next === '"'
                    ? next
                    : undefined

    bytes.push((escaped ?? next).charCodeAt(0))
    i++
  }

  return Buffer.from(bytes).toString()
}

export interface Interface {
  readonly summarize: (input: { sessionID: SessionID; messageID: MessageID }) => Effect.Effect<void>
  readonly diff: (input: { sessionID: SessionID; messageID?: MessageID }) => Effect.Effect<Snapshot.FileDiff[]>
  readonly computeDiff: (input: { messages: MessageV2.WithParts[] }) => Effect.Effect<Snapshot.FileDiff[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSummary") {}

function diffStats(diffs: Snapshot.FileDiff[]) {
  let additions = 0
  let deletions = 0
  for (const diff of diffs) {
    additions += diff.additions
    deletions += diff.deletions
  }
  return { additions, deletions, files: diffs.length }
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const storage = yield* Storage.Service
    const bus = yield* Bus.Service

    const computeDiff = Effect.fn("SessionSummary.computeDiff")(function* (input: { messages: MessageV2.WithParts[] }) {
      let from: string | undefined
      let to: string | undefined
      for (const item of input.messages) {
        for (const part of item.parts) {
          if (!from && part.type === "step-start" && part.snapshot) from = part.snapshot
          if (part.type === "step-finish" && part.snapshot) to = part.snapshot
        }
      }
      if (from && to) return yield* snapshot.diffFull(from, to)
      return []
    })

    const summarize = Effect.fn("SessionSummary.summarize")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      const started = Date.now()
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      if (!all.length) {
        yield* Effect.logDebug("session summary skipped").pipe(
          Effect.annotateLogs({
            sessionID: input.sessionID,
            messageID: input.messageID,
            reason: "empty_messages",
            elapsedMs: Date.now() - started,
          }),
        )
        return
      }

      const diffStarted = Date.now()
      const diffs = yield* computeDiff({ messages: all })
      const totals = diffStats(diffs)
      yield* sessions.setSummary({
        sessionID: input.sessionID,
        summary: totals,
      })
      yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
      yield* bus.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })

      let messageDiffs: Snapshot.FileDiff[] | undefined
      const target = all.find((m) => m.info.id === input.messageID)
      const targetIsUser = target?.info.role === "user"
      const diffElapsedMs = Date.now() - diffStarted
      let messageDiffElapsedMs: number | undefined
      if (target && targetIsUser) {
        const messageDiffStarted = Date.now()
        const messages = all.filter(
          (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
        )
        messageDiffs = yield* computeDiff({ messages })
        messageDiffElapsedMs = Date.now() - messageDiffStarted
        target.info.summary = {
          ...(typeof target.info.summary === "object" && target.info.summary !== null ? target.info.summary : {}),
          diffs: messageDiffs,
        }
        yield* sessions.updateMessage(target.info)
      }

      yield* Effect.logDebug("session summary generated").pipe(
        Effect.annotateLogs({
          sessionID: input.sessionID,
          messageID: input.messageID,
          messages: all.length,
          diffFiles: totals.files,
          diffAdditions: totals.additions,
          diffDeletions: totals.deletions,
          diffElapsedMs,
          messageSummaryUpdated: Boolean(messageDiffs),
          messageDiffFiles: messageDiffs?.length,
          messageDiffElapsedMs,
          targetRole: target?.info.role,
          targetFound: Boolean(target),
          elapsedMs: Date.now() - started,
        }),
      )
    })

    const diff = Effect.fn("SessionSummary.diff")(function* (input: { sessionID: SessionID; messageID?: MessageID }) {
      const diffs = yield* storage
        .read<Snapshot.FileDiff[]>(["session_diff", input.sessionID])
        .pipe(Effect.catch(() => Effect.succeed([] as Snapshot.FileDiff[])))
      const next = diffs.map((item) => {
        if (item.file === undefined) return item
        const file = unquoteGitPath(item.file)
        if (file === item.file) return item
        return { ...item, file }
      })
      const changed = next.some((item, i) => item.file !== diffs[i]?.file)
      if (changed) yield* storage.write(["session_diff", input.sessionID], next).pipe(Effect.ignore)
      return next
    })

    return Service.of({ summarize, diff, computeDiff })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Session.defaultLayer),
    Layer.provide(Snapshot.defaultLayer),
    Layer.provide(Storage.defaultLayer),
    Layer.provide(Bus.layer),
  ),
)

export const DiffInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
})
export type DiffInput = Schema.Schema.Type<typeof DiffInput>

export * as SessionSummary from "./summary"
