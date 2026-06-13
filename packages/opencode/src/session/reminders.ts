import path from "path"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Config } from "@/config/config"
import { PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import * as Session from "./session"
import PROMPT_PLAN from "./prompt/plan.txt"
import BUILD_SWITCH from "./prompt/build-switch.txt"
import PLAN_MODE from "./prompt/plan-mode.txt"
import { SessionContextRollout } from "./context-rollout"

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

  if (input.agent.name === "orchestrator") {
    userMessage.parts.push({
      id: PartID.ascending(),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text:
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
      synthetic: true,
    })
  }

  if (!flags.experimentalPlanMode) {
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: PartID.ascending(),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: PartID.ascending(),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const ctx = yield* InstanceState.context
    const plan = Session.plan(input.session, ctx)
    const exists = yield* fsys.existsSafe(plan)
    const part = yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text: exists
        ? `${BUILD_SWITCH}\n\nA plan file exists at ${plan}. You should execute on the plan defined within it`
        : BUILD_SWITCH,
      synthetic: true,
    })
    userMessage.parts.push(part)
    return input.messages
  }

  if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") return input.messages

  const ctx = yield* InstanceState.context
  const plan = Session.plan(input.session, ctx)
  const exists = yield* fsys.existsSafe(plan)
  if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
  const part = yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: userMessage.info.id,
    sessionID: userMessage.info.sessionID,
    type: "text",
    text: PLAN_MODE.replace("${planInfo}", () =>
      exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`,
    ),
    synthetic: true,
  })
  userMessage.parts.push(part)
  return input.messages
})

export * as SessionReminders from "./reminders"
