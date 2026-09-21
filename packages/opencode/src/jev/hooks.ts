import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { JevClient } from "./client"
import { JevGuard } from "./guard"
import { JevNextAction } from "./next-action"
import { JevRelevance } from "./relevance"
import { JevReview } from "./review"
import { JevSchema } from "./schema"
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
  relevance?: { enabled?: boolean; threshold?: number; ambiguous_threshold?: number }
  next_action?: { enabled?: boolean }
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
 *
 * The verdict is memoised per (tool, args, user turn, threshold, untrusted
 * version). The ReAct loop replays the same call constantly — the same file
 * read, the same `git status`, the same failing command retried — and each
 * replay used to pay a full Jev round-trip to reach the same answer. A replay
 * now reuses the stored outcome. Any input the decision actually depends on is
 * in the key, so the only thing the cache can hide is a deliberation that would
 * have returned the same bytes.
 */
export const guard = Effect.fn("JevHooks.guard")(function* (
  http: HttpClient.HttpClient,
  settings: JevSettings | undefined,
  input: { sessionID: string; tool: string; args: unknown; lastUser: string },
) {
  const section = settings?.guard
  if (section?.enabled !== true) return undefined
  const threshold = section.threshold ?? JevGuard.DEFAULT_THRESHOLD
  const args = renderArgs(input.args)
  const key = [
    input.tool,
    args,
    input.lastUser.slice(0, MAX_ARG_CHARS),
    String(threshold),
    String(State.untrustedVersion(input.sessionID)),
  ].join("\u0000")
  const cached = State.cachedVerdict<JevGuard.Outcome>(input.sessionID, key)
  if (cached) return { ...cached, cached: true }
  const outcome = yield* JevGuard.screen(http, settings, {
    tool: input.tool,
    args,
    lastUser: input.lastUser.slice(0, MAX_ARG_CHARS),
    untrusted: State.untrusted(input.sessionID),
    threshold,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!outcome) return undefined
  State.cacheVerdict(input.sessionID, key, outcome)
  return { ...outcome, cached: false }
})

/**
 * Pre-tool relevance judge. Answers whether a call still adds information,
 * given what the loop has already observed. It is a *separate* question from
 * the guard: relevance never refuses a call and never asks the user — the
 * caller may answer a redundant read-only call from the context ledger, and
 * anything else simply runs.
 *
 * Memoised on (tool, args, observed surface, thresholds) for the same reason as
 * the guard: the loop replays near-identical calls, and a replay must not pay a
 * second round-trip to reach the same verdict.
 */
export const relevance = Effect.fn("JevHooks.relevance")(function* (
  http: HttpClient.HttpClient,
  settings: JevSettings | undefined,
  input: {
    sessionID: string
    tool: string
    args: unknown
    observed: readonly JevRelevance.Surface[]
    request?: string
  },
) {
  const section = settings?.relevance
  if (section?.enabled !== true) return undefined
  const redundantAt = section.threshold ?? JevRelevance.DEFAULT_REDUNDANT_AT
  const ambiguousAt = section.ambiguous_threshold ?? JevRelevance.DEFAULT_AMBIGUOUS_AT
  const args = renderArgs(input.args)
  const surface = JevRelevance.observedSurface(input.observed)
  const key = ["relevance", input.tool, args, surface, String(redundantAt), String(ambiguousAt)].join("\u0000")
  const cached = State.cachedVerdict<JevRelevance.Assessment>(input.sessionID, key)
  if (cached) return { ...cached, cached: true }
  const assessment = yield* JevRelevance.judge(http, settings, {
    tool: input.tool,
    args,
    observed: input.observed,
    request: input.request,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!assessment) return undefined
  const decided = JevRelevance.assess(assessment.probability, { redundantAt, ambiguousAt })
  State.cacheVerdict(input.sessionID, key, decided)
  return { ...decided, cached: false }
})

/**
 * Post-tool screening. Injection markers are always recorded (deterministic,
 * no round-trip); the review scores and the next-action guidance are recorded
 * and rendered only when enabled. The annotation is returned rather than
 * applied so the caller keeps control of the tool output it completes.
 *
 * Both optional questions travel in a single request, so a step costs at most
 * one Jev round-trip whichever hooks are on and never two.
 */
export const post = Effect.fn("JevHooks.post")(function* (
  http: HttpClient.HttpClient,
  settings: JevSettings | undefined,
  input: {
    sessionID: string
    tool: string
    args: unknown
    output: string
    nextAction?: {
      verdict?: string
      stagnant?: number
      phase?: string
      steps?: readonly string[]
      goal?: string
      observed?: string
    }
  },
) {
  const untrusted = yield* JevUntrusted.scan(http, settings, {
    tool: input.tool,
    output: input.output,
    confirm: settings?.untrusted?.enabled === true,
    threshold: settings?.untrusted?.threshold ?? UNTRUSTED_CONFIRM_THRESHOLD,
  }).pipe(Effect.catch(() => Effect.succeed([] as State.UntrustedHit[])))
  State.markUntrusted(input.sessionID, untrusted)

  const wantsReview = settings?.review?.enabled === true
  const wantsNextAction = settings?.next_action?.enabled === true
  if (!wantsReview && !wantsNextAction) return { untrusted, annotation: undefined }
  const args = renderArgs(input.args)
  const questions: Record<string, JevSchema.Question> = {
    ...(wantsReview ? JevReview.reviewQuestions({ tool: input.tool, args, output: input.output }) : {}),
    ...(wantsNextAction
      ? JevNextAction.nextActionQuestions({
          tool: input.tool,
          verdict: input.nextAction?.verdict ?? "observed",
          stagnant: input.nextAction?.stagnant ?? 0,
          summary: input.output,
          phase: input.nextAction?.phase,
          steps: input.nextAction?.steps,
          goal: input.nextAction?.goal,
          observed: input.nextAction?.observed,
        })
      : {}),
  }
  const response = yield* JevClient.decide(
    http,
    { state: `Post-execution screening of the ${input.tool} call.`, questions },
    settings,
  ).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!response) return { untrusted, annotation: undefined }
  const lines: string[] = []
  if (wantsReview) {
    const scores = JevReview.interpret(response)
    if (scores) {
      State.recordScores(input.sessionID, input.tool, scores)
      lines.push(JevReview.render(scores, settings?.guard?.threshold ?? JevGuard.DEFAULT_THRESHOLD))
    }
  }
  if (wantsNextAction) {
    const guidance = JevNextAction.interpret(response)
    if (guidance) {
      State.setNextAction(input.sessionID, input.tool, guidance)
      lines.push(JevNextAction.render(guidance))
    }
  }
  return { untrusted, annotation: lines.length > 0 ? lines.join("\n") : undefined }
})

export * as JevHooks from "./hooks"
