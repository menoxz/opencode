import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import type { Tool } from "@/tool/tool"
import { MessageID } from "@/session/schema"
import { ModelID, ProviderID } from "@/provider/schema"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderID.opencode,
  modelID: ModelID.make("test-model"),
}

const layer = Layer.mergeAll(
  Agent.defaultLayer,
  BackgroundJob.defaultLayer,
  Bus.defaultLayer,
  Config.defaultLayer,
  CrossSpawnSpawner.defaultLayer,
  Session.defaultLayer,
  SessionRunState.defaultLayer,
  SessionStatus.defaultLayer,
  Truncate.defaultLayer,
  ToolRegistry.defaultLayer,
  RuntimeFlags.layer({}),
)

const it = testEffect(layer)

function parseResult(result: { output: string }) {
  return JSON.parse(result.output) as {
    status: "ok" | "error"
    action: "create" | "edit" | "suggest" | "apply"
    updatedFields: string[]
    warnings: string[]
    suggestion?: { objective: string; dod: string[]; outOfScope: string[] }
    goalState?: { goal: string; dod: string[]; outOfScope: string[]; source: string; status: string }
  }
}

const getTool = Effect.fn("GoalContractTest.getTool")(function* (id: string) {
  const registry = yield* ToolRegistry.Service
  const agent = yield* Agent.Service
  const build = yield* agent.get("build")
  const list = yield* registry.tools({ ...ref, agent: build })
  const tool = list.find((item) => item.id === id)
  if (!tool) throw new Error(`tool not found: ${id}`)
  return tool
})

const mkContext = (sessionID: string, messages: Tool.Context["messages"] = []): Tool.Context => ({
  sessionID: sessionID as any,
  messageID: MessageID.ascending(),
  agent: "build",
  abort: new AbortController().signal,
  messages,
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

describe("tool.goal-contract", () => {
  it.instance("does not rewrite an unchanged goal contract", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "idempotent goal contract" })
      const create = yield* getTool("create_objective")
      const input = { objective: "Ship safely", dod: ["tests pass"], outOfScope: ["no deploy"] }

      yield* create.execute(input, mkContext(session.id))
      const first = (yield* sessions.get(session.id)).goalState
      const result = parseResult(yield* create.execute(input, mkContext(session.id)))
      const second = (yield* sessions.get(session.id)).goalState

      expect(result.status).toBe("ok")
      expect(result.updatedFields).toEqual([])
      expect(result.warnings).toContain("No semantic change; goalState was not rewritten.")
      expect(second?.version).toBe(first?.version)
      expect(second?.updatedAt).toBe(first?.updatedAt)
    }),
  )

  it.instance("create_objectif creates goalState with structured response", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "goal contract test" })
      const create = yield* getTool("create_objectif")

      const result = yield* create.execute(
        {
          objective: "Compacter Objective dans la sidebar",
          dod: ["2 lignes max", "ellipsis"],
          outOfScope: ["refonte complète TUI"],
        },
        mkContext(session.id),
      )

      const parsed = parseResult(result)
      expect(parsed.status).toBe("ok")
      expect(parsed.action).toBe("create")
      expect(parsed.updatedFields).toContain("objective")
      expect(parsed.goalState?.goal).toBe("Compacter Objective dans la sidebar")

      const updated = yield* sessions.get(session.id)
      expect(updated.goalState?.goal).toBe("Compacter Objective dans la sidebar")
      expect(updated.goalState?.dod).toEqual(["2 lignes max", "ellipsis"])
    }),
  )

  it.instance("create_objective alias works and rejects empty objective", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "goal contract alias" })
      const create = yield* getTool("create_objective")

      const fail = yield* create.execute({ objective: "   " }, mkContext(session.id))
      const parsedFail = parseResult(fail)
      expect(parsedFail.status).toBe("error")
      expect(parsedFail.warnings.join(" ")).toContain("Objective cannot be empty")

      const ok = yield* create.execute({ objective: "Create from alias" }, mkContext(session.id))
      const parsedOk = parseResult(ok)
      expect(parsedOk.status).toBe("ok")
      expect(parsedOk.goalState?.goal).toBe("Create from alias")
    }),
  )

  it.instance("edit_objectif updates only provided fields", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "goal edit test" })
      const create = yield* getTool("create_objectif")
      const edit = yield* getTool("edit_objectif")

      yield* create.execute(
        {
          objective: "Initial objective",
          dod: ["initial dod"],
          outOfScope: ["initial oos"],
        },
        mkContext(session.id),
      )

      const result = yield* edit.execute({ objective: "Edited objective" }, mkContext(session.id))
      const parsed = parseResult(result)
      expect(parsed.status).toBe("ok")
      expect(parsed.updatedFields).toEqual(["objective"])
      expect(parsed.goalState?.goal).toBe("Edited objective")
      expect(parsed.goalState?.dod).toEqual(["initial dod"])
    }),
  )

  it.instance("suggest_objectif suggests from prompt/context and does not persist", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "goal suggest test" })
      const suggest = yield* getTool("suggest_objectif")

      const result = yield* suggest.execute(
        {
          prompt: "Objectif: améliorer la lisibilité\nDoD:\n- compacter\nHors périmètre:\n- migration",
        },
        mkContext(session.id),
      )
      const parsed = parseResult(result)
      expect(parsed.status).toBe("ok")
      expect(parsed.action).toBe("suggest")
      expect(parsed.suggestion?.objective).toBe("améliorer la lisibilité")
      expect(parsed.suggestion?.outOfScope).toEqual(["migration"])

      const unchanged = yield* sessions.get(session.id)
      expect(unchanged.goalState).toBeUndefined()
    }),
  )

  it.instance("apply_contract_from_prompt applies FR/EN sections and handles invalid prompt", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ title: "goal apply test" })
      const apply = yield* getTool("apply_contract_from_prompt")

      const invalid = yield* apply.execute({ prompt: "   " }, mkContext(session.id))
      const parsedInvalid = parseResult(invalid)
      expect(parsedInvalid.status).toBe("error")

      const result = yield* apply.execute(
        {
          prompt: [
            "Objective: Add native contract tools",
            "Definition of Done:",
            "- create/edit tools",
            "- tests pass",
            "Hors périmètre:",
            "- db migration",
          ].join("\n"),
        },
        mkContext(session.id),
      )

      const parsed = parseResult(result)
      expect(parsed.status).toBe("ok")
      expect(parsed.updatedFields).toEqual(["objective", "dod", "outOfScope"])
      expect(parsed.goalState?.goal).toBe("Add native contract tools")
      expect(parsed.goalState?.dod).toEqual(["create/edit tools", "tests pass"])
      expect(parsed.goalState?.outOfScope).toEqual(["db migration"])

      const updated = yield* sessions.get(session.id)
      expect(updated.goalState?.goal).toBe("Add native contract tools")
    }),
  )
})
