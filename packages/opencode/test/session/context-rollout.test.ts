import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { ConfigParse } from "@/config/parse"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SessionContextRollout } from "../../src/session/context-rollout"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

describe("session.context-rollout.resolve", () => {
  test("uses explicit backward-compatible defaults when flags are absent", () => {
    const parsed = ConfigParse.schema(Config.Info, {}, "test:config")
    expect(SessionContextRollout.resolve(parsed)).toEqual(SessionContextRollout.DEFAULTS)
  })

  test("accepts experimental context rollout config", () => {
    const parsed = ConfigParse.schema(
      Config.Info,
      {
        experimental: {
          context_rollout: {
            replay_tool_inputs: "summary",
            replay_tool_outputs: "summary",
            replay_reasoning: "off",
            injection_skills: "short",
            injection_instructions: "summary",
            system_boilerplate: "light",
            caveman_synthetic_artifacts: "on",
          },
        },
      },
      "test:config",
    )

    expect(parsed.experimental?.context_rollout).toEqual({
      replay_tool_inputs: "summary",
      replay_tool_outputs: "summary",
      replay_reasoning: "off",
      injection_skills: "short",
      injection_instructions: "summary",
      system_boilerplate: "light",
      caveman_synthetic_artifacts: "on",
    })
  })

  test("resolves configured overrides without changing unspecified defaults", () => {
    const parsed = ConfigParse.schema(
      Config.Info,
        {
          experimental: {
            context_rollout: {
              replay_tool_inputs: "off",
              replay_tool_outputs: "off",
              system_boilerplate: "minimal",
            },
          },
        },
      "test:config",
    )

    expect(SessionContextRollout.resolve(parsed)).toEqual({
      ...SessionContextRollout.DEFAULTS,
      replayToolInputs: "off",
      replayToolOutputs: "off",
      systemBoilerplate: "minimal",
    })
  })

  test("uses stable instruction injection alias as fallback when rollout flag is absent", () => {
    const parsed = ConfigParse.schema(
      Config.Info,
      {
        instruction_injection: {
          agents: "summary",
        },
      },
      "test:config",
    )

    expect(SessionContextRollout.resolve(parsed)).toEqual({
      ...SessionContextRollout.DEFAULTS,
      injectionInstructions: "summary",
    })
  })
})

const it = testEffect(
  SessionContextRollout.layer.pipe(
    Layer.provide(TestConfig.layer({
        get: () =>
          Effect.succeed({
            experimental: {
              context_rollout: {
                replay_tool_inputs: "summary",
                injection_skills: "short",
                injection_instructions: "off",
              },
            },
          }),
    })),
    Layer.provide(RuntimeFlags.layer()),
  ),
)

describe("session.context-rollout service", () => {
  it.effect("returns resolved runtime rollout config", () =>
    Effect.gen(function* () {
      const rollout = yield* SessionContextRollout.Service
      expect(yield* rollout.get()).toEqual({
        ...SessionContextRollout.DEFAULTS,
        replayToolInputs: "summary",
        injectionSkills: "short",
        injectionInstructions: "off",
      })
    }),
  )
})
