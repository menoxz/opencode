import { Cause, Effect, Layer, Context, Schema, Stream, Schedule, Duration } from "effect"
import * as Session from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID } from "./schema"
import { Provider } from "@/provider/provider"
import { Agent } from "../agent/agent"
import { LLM } from "./llm"
import { LLMEvent } from "@opencode-ai/llm"
import { Config } from "@/config/config"
import { SessionContextRollout } from "./context-rollout"
import { ModelID, ProviderID } from "@/provider/schema"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session-title" })

export interface Interface {
  readonly generate: (input: {
    session: Session.Info
    providerID: ProviderID
    modelID: ModelID
    history: MessageV2.WithParts[]
  }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionTitle") {}

const titlePolicy = Schedule.exponential(Duration.millis(200)).pipe(
  Schedule.both(Schedule.recurs(2)),
  Schedule.map(() => undefined as void),
)

/**
 * Models that may generate the title, in the order they should be tried.
 *
 * The session model comes first: it is known to be available and authenticated.
 * The title agent's own model, then the small model, are the fallbacks used when
 * the session model turns out to be unusable at request time.
 */
function resolveModelCandidates(
  agents: Agent.Interface,
  provider: Provider.Interface,
  agentName: string,
  providerID: ProviderID,
  modelID: ModelID,
): Effect.Effect<Provider.Model[]> {
  const attempt = (effect: Effect.Effect<Provider.Model | undefined, unknown>, label: string) =>
    effect.pipe(
      Effect.catch((error) => {
        log.warn("title model candidate unavailable", { candidate: label, error: String(error) })
        return Effect.succeed(undefined)
      }),
    )

  return Effect.gen(function* () {
    const ag = yield* agents.get(agentName)
    const candidates: Provider.Model[] = []
    const push = (model: Provider.Model | undefined) => {
      if (!model) return
      if (candidates.some((c) => c.providerID === model.providerID && c.id === model.id)) return
      candidates.push(model)
    }

    push(yield* attempt(provider.getModel(providerID, modelID), "session"))
    if (ag?.model) push(yield* attempt(provider.getModel(ag.model.providerID, ag.model.modelID), "agent"))
    push(yield* attempt(provider.getSmallModel(providerID), "small"))
    return candidates
  }).pipe(
    Effect.catch((error) => {
      log.error("title model resolution failed", { error: String(error) })
      return Effect.succeed([] as Provider.Model[])
    }),
  )
}

/**
 * Whether a failed title attempt is worth retrying on the same model.
 *
 * A deprecated model or a refused tier answers the same way however often it is
 * asked, so retrying it only delays the fallback to the next candidate. Measured
 * on this install: the session model was a free model that had been deprecated,
 * every new session paid two retries, and one title only landed after 17s of
 * retrying a model that was never going to answer. Anything without a retryable
 * verdict stays retryable, so genuine transient failures keep their retries.
 */
function isRetryableModelError(error: unknown): boolean {
  const candidate = error as { isRetryable?: unknown; statusCode?: unknown } | undefined
  if (candidate && typeof candidate.isRetryable === "boolean") return candidate.isRetryable
  const status = candidate?.statusCode
  if (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  return true
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const llm = yield* LLM.Service
    const config = yield* Config.Service

    const generate = Effect.fn("SessionTitle.generate")(function* (input: {
      session: Session.Info
      providerID: ProviderID
      modelID: ModelID
      history: MessageV2.WithParts[]
    }) {
      // Skip if session already has a non-default title or this is a child session
      if (input.session.parentID) return
      if (!Session.isDefaultTitle(input.session.title)) return

      const last = input.history[input.history.length - 1]
      if (last?.info.role === "assistant") return

      const real = (m: MessageV2.WithParts) =>
        m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic)
      const idx = input.history.findIndex(real)
      if (idx === -1) return
      if (input.history.filter(real).length > 3) return

      const candidates = yield* resolveModelCandidates(agents, provider, "title", input.providerID, input.modelID)
      if (candidates.length === 0) return

      const context = input.history.slice(0, idx + 1)
      const firstUser = context[idx]
      if (!firstUser || firstUser.info.role !== "user") return
      const firstInfo = firstUser.info

      const subtasks = firstUser.parts.filter(
        (p): p is MessageV2.SubtaskPart => p.type === "subtask",
      )
      const onlySubtasks =
        subtasks.length > 0 && firstUser.parts.every((p) => p.type === "subtask")

      const ag = yield* agents.get("title")
      if (!ag) return

      const promptRollout = SessionContextRollout.resolve(yield* config.get())

      // Try each candidate in order. A model that cannot answer at all must not
      // end the title: the next candidate gets the turn. Retries stay bounded to
      // the failures that can actually change their answer.
      let text = ""
      for (const mdl of candidates) {
        const msgs = onlySubtasks
          ? [{ role: "user" as const, content: subtasks.map((p) => p.prompt).join("\n") }]
          : yield* MessageV2.toModelMessagesEffect(context, mdl, {
              replayToolInputs: promptRollout.replayToolInputs,
              replayToolOutputs: promptRollout.replayToolOutputs,
              replayReasoning: promptRollout.replayReasoning,
            })

        const produced = yield* llm
          .stream({
            agent: ag,
            user: firstInfo,
            system: [],
            small: true,
            tools: {},
            model: mdl,
            sessionID: input.session.id,
            retries: 2,
            messages: [{ role: "user", content: "Generate a title for this conversation:\n" }, ...msgs],
          })
          .pipe(
            Stream.filter(LLMEvent.is.textDelta),
            Stream.map((e) => e.text),
            Stream.mkString,
            Effect.retry({ schedule: titlePolicy, while: isRetryableModelError }),
            Effect.catch((error) =>
              Effect.sync(() =>
                log.warn("title model failed; falling back to the next candidate", {
                  model: `${mdl.providerID}/${mdl.id}`,
                  error: String(error),
                }),
              ).pipe(Effect.as("")),
            ),
          )

        if (produced) {
          text = produced
          break
        }
      }

      if (!text) return
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line: string) => line.trim())
        .find((line: string) => line.length > 0)
      if (!cleaned) return
      const t = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
      yield* sessions
        .setTitle({ sessionID: input.session.id, title: t })
        .pipe(Effect.catchCause((cause) => Effect.sync(() => log.error("failed to set session title", { error: Cause.squash(cause) }))))
    })

    return Service.of({ generate })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Session.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(LLM.defaultLayer),
    Layer.provide(Config.defaultLayer),
  ),
)

export * as SessionTitle from "./title"
