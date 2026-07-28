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
 * Resolve the model for title generation: always prefer the model of the current
 * session turn, since it is known to be available and authenticated. Only fall
 * back to an explicitly configured title-agent model, then to the small model,
 * when the session model cannot be resolved.
 */
function resolveModel(
  agents: Agent.Interface,
  provider: Provider.Interface,
  agentName: string,
  providerID: ProviderID,
  modelID: ModelID,
): Effect.Effect<Provider.Model | undefined> {
  const attempt = (effect: Effect.Effect<Provider.Model | undefined, unknown>, label: string) =>
    effect.pipe(
      Effect.catch((error) => {
        log.warn("title model candidate unavailable", { candidate: label, error: String(error) })
        return Effect.succeed(undefined)
      }),
    )

  return Effect.gen(function* () {
    const ag = yield* agents.get(agentName)
    if (!ag) return undefined

    const session = yield* attempt(provider.getModel(providerID, modelID), "session")
    if (session) return session

    if (ag.model) {
      const configured = yield* attempt(provider.getModel(ag.model.providerID, ag.model.modelID), "agent")
      if (configured) return configured
    }

    return yield* attempt(provider.getSmallModel(providerID), "small")
  }).pipe(
    Effect.catch((error) => {
      log.error("title model resolution failed", { error: String(error) })
      return Effect.succeed(undefined)
    }),
  )
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

      const mdl = yield* resolveModel(agents, provider, "title", input.providerID, input.modelID)
      if (!mdl) return

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
      const msgs = onlySubtasks
        ? [{ role: "user" as const, content: subtasks.map((p) => p.prompt).join("\n") }]
        : yield* MessageV2.toModelMessagesEffect(context, mdl, {
            replayToolInputs: promptRollout.replayToolInputs,
            replayToolOutputs: promptRollout.replayToolOutputs,
            replayReasoning: promptRollout.replayReasoning,
          })

      const text = yield* llm
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
          Effect.retry(titlePolicy),
          Effect.catch((error) => {
            log.error("title stream failed", { error: String(error) })
            return Effect.succeed("" as const)
          }),
        )

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
