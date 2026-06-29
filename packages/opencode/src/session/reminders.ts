import path from "path"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Config } from "@/config/config"
import * as Log from "@opencode-ai/core/util/log"
import { PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import * as Session from "./session"
import PROMPT_PLAN from "./prompt/plan.txt"
import BUILD_SWITCH from "./prompt/build-switch.txt"
import PLAN_MODE from "./prompt/plan-mode.txt"
import { SessionContextRollout } from "./context-rollout"

const log = Log.create({ service: "session.reminders" })

export const apply = Effect.fn("SessionReminders.apply")(function* (input: {
  messages: MessageV2.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  const flags = yield* RuntimeFlags.Service
  const config = yield* Config.Service
  const fsys = yield* AppFileSystem.Service
  const sessions = yield* Session.Service
  const rollout = SessionContextRollout.resolve(yield* config.get())
  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage) return input.messages

  const stats = {
    candidates: 0,
    added: 0,
    skippedDuplicate: 0,
    persisted: 0,
  }

  // Reminders are appended to the latest user message immediately before model input.
  // `apply` may be called more than once over the same message list, so only exact
  // duplicate synthetic text is skipped; changed rollout/config text is still allowed.
  const hasReminder = (text: string) =>
    userMessage.parts.some((part) => part.type === "text" && part.synthetic === true && part.text === text)
  const reminderPart = (text: string): MessageV2.TextPart => ({
    id: PartID.ascending(),
    messageID: userMessage.info.id,
    sessionID: userMessage.info.sessionID,
    type: "text",
    text,
    synthetic: true,
  })
  const addReminder = (text: string) => {
    stats.candidates++
    if (hasReminder(text)) {
      stats.skippedDuplicate++
      return false
    }
    userMessage.parts.push(reminderPart(text))
    stats.added++
    return true
  }
  const addPersistedReminder = (text: string) =>
    Effect.gen(function* () {
      stats.candidates++
      if (hasReminder(text)) {
        stats.skippedDuplicate++
        return false
      }
      const part = yield* sessions.updatePart(reminderPart(text))
      userMessage.parts.push(part)
      stats.added++
      stats.persisted++
      return true
    })
  const finish = (reason: string) => {
    if (stats.candidates > 0 || stats.skippedDuplicate > 0) {
      log.debug("session reminders applied", {
        agent: input.agent.name,
        reason,
        experimentalPlanMode: flags.experimentalPlanMode,
        systemBoilerplate: rollout.systemBoilerplate,
        cavemanSyntheticArtifacts: rollout.cavemanSyntheticArtifacts,
        ...stats,
      })
    }
    return input.messages
  }

  if (input.agent.name === "orchestrator") {
    addReminder(
      rollout.systemBoilerplate === "minimal"
        ? ["ORCHESTRATOR:", "- no code edit", "- delegate via task", "- require verified reports"].join("\n")
        : rollout.systemBoilerplate === "light"
          ? [
              "<agent_reminder role=\"orchestrator\">",
              "  <identity>Workspace CTO. Do not edit code directly.</identity>",
              "  <rule critical=\"true\">Delegate execution/research/modification via task tool.</rule>",
              "  <rule critical=\"true\">Require verified reports (tests/compile) before accepting work.</rule>",
              "</agent_reminder>",
            ].join("\n")
          : rollout.cavemanSyntheticArtifacts === "on"
            ? [
                "ORCHESTRATOR:",
                "- no code write/edit",
                "- delegate with task tool",
                "- demand verified reports",
                "- learn after every task",
              ].join("\n")
            : [
                "<agent_reminder color=\"#f97316\">",
                "  <identity>You are the Orchestrator (CTO) of this workspace.</identity>",
                "  <constraint type=\"role\" critical=\"true\">",
                "    YOU ARE STRICTLY FORBIDDEN FROM WRITING OR MODIFYING CODE DIRECTLY (edit: deny).",
                "    Always delegate execution, research, exploration, or modification tasks to specialized sub-agents using the 'task' tool.",
                "  </constraint>",
                "  <requirement type=\"reports\" critical=\"true\">",
                "    Require structured reports with verification (tests and compilation) from your sub-agents before accepting their work.",
                "  </requirement>",
                "  <requirement type=\"learning\" critical=\"true\">",
                "    EVALUATE after every task: 'Is this repeatable?'. LEARN by creating/improving a skill.",
                "    Chaque exécution == une opportunité d'améliorer ton intelligence.",
                "  </requirement>",
                "</agent_reminder>",
              ].join("\n"),
    )
  }

  if (!flags.experimentalPlanMode) {
    if (input.agent.name === "plan") {
      addReminder(PROMPT_PLAN)
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      addReminder(BUILD_SWITCH)
    }
    return finish("legacy-plan-mode")
  }

  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const ctx = yield* InstanceState.context
    const plan = Session.plan(input.session, ctx)
    const exists = yield* fsys.existsSafe(plan)
    yield* addPersistedReminder(
      exists
        ? `${BUILD_SWITCH}\n\nA plan file exists at ${plan}. You should execute on the plan defined within it`
        : BUILD_SWITCH,
    )
    return finish("build-after-plan")
  }

  if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") return finish("not-applicable")

  const ctx = yield* InstanceState.context
  const plan = Session.plan(input.session, ctx)
  const exists = yield* fsys.existsSafe(plan)
  if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
  yield* addPersistedReminder(
    PLAN_MODE.replace("${planInfo}", () =>
      exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`,
    ),
  )
  return finish("plan-mode")
})

export * as SessionReminders from "./reminders"
