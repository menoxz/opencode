import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevGuard } from "./guard"
import { JevReview } from "./review"
import { JevUntrusted } from "./untrusted"
import * as State from "./state"

/**
 * The two hooks the ReAct loop actually calls, wired to the real fork API.
 *
 * `tool.execute.before` cannot refuse a call by itself: its output is the
 * mutable `args` bag, its return value is ignored and a thrown error is
 * swallowed upstream. The systematic guard therefore runs natively in
 * `session/tools.ts`, right after the plugin trigger, and refuses there. The
 * plugin hook contract gains a `block` channel so a plugin can do the same;
 * both paths land on the same refusal.
 *
 * Every call here fails open: an error, a timeout or an absent answer is
 * `undefined`, and `undefined` never blocks anything. That is the documented
 * safety posture — Jev adds judgement, it is never the thing that breaks a run.
 */

/** Structural view of `config.jev`, so this module never imports the config schema. */
export type JevSettings = JevClient.Settings & {
  shadow?: boolean
  guard?: { enabled?: boolean; threshold?: number; permissions?: readonly string[] }
  route?: { enabled?: boolean; threshold?: number }
  review?: { enabled?: boolean }
  untrusted?: { enabled?: boolean; threshold?: number }
}

const MAX_ARG_CHARS = 4_000

export const UNTRUSTED_CONFIRM_THRESHOLD = 0.5

function renderArgs(args: unknown) {
  return (JSON.stringify(args) ?? "").slice(0, MAX_ARG_CHARS)
}

/**
 * Pre-tool guard. Returns `undefined` when the guard is off, unconfigured or
 * unreachable — the caller then proceeds. Returns an outcome otherwise, even
 * when the outcome is `allow`, so the caller can log the decision.
 */
export const guard = Effect.fn("JevHooks.guard")(function* (
  http: HttpClient.HttpClient,
  settings: JevSettings | undefined,
  input: { sessionID: string; tool: string; args: unknown; lastUser: string },
) {
  const section = settings?.guard
  if (section?.enabled !== true) return undefined
  return yield* JevGuard.screen(http, settings, {
    tool: input.tool,
    args: renderArgs(input.args),
    lastUser: input.lastUser.slice(0, MAX_ARG_CHARS),
    untrusted: State.untrusted(input.sessionID),
    threshold: section.threshold ?? JevGuard.DEFAULT_THRESHOLD,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
})

/**
 * Post-tool screening. Injection markers are always recorded (deterministic,
 * no round-trip); the review scores are recorded and rendered only when
 * enabled. The annotation is returned rather than applied so the caller keeps
 * control of the tool output it completes.
 */
export const post = Effect.fn("JevHooks.post")(function* (
  http: HttpClient.HttpClient,
  settings: JevSettings | undefined,
  input: { sessionID: string; tool: string; args: unknown; output: string },
) {
  const untrusted = yield* JevUntrusted.scan(http, settings, {
    tool: input.tool,
    output: input.output,
    confirm: settings?.untrusted?.enabled === true,
    threshold: settings?.untrusted?.threshold ?? UNTRUSTED_CONFIRM_THRESHOLD,
  }).pipe(Effect.catch(() => Effect.succeed([] as State.UntrustedHit[])))
  State.markUntrusted(input.sessionID, untrusted)

  if (settings?.review?.enabled !== true) return { untrusted, annotation: undefined }
  const scores = yield* JevReview.review(http, settings, {
    tool: input.tool,
    args: renderArgs(input.args),
    output: input.output,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!scores) return { untrusted, annotation: undefined }
  State.recordScores(input.sessionID, input.tool, scores)
  return { untrusted, annotation: JevReview.render(scores, settings.guard?.threshold ?? JevGuard.DEFAULT_THRESHOLD) }
})

export * as JevHooks from "./hooks"
