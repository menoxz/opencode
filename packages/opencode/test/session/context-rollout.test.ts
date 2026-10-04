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

  test("summarizes replayed tool output by default", () => {
    // Measured against real sessions replayed through MessageV2.toModelMessages:
    // tool results were 67-87% of the model-visible context, and under "full"
    // every historical result replayed verbatim for the whole session. Making
    // "summary" the default removed 62.1% of the bytes the provider receives
    // (811,969 tokens over 7 real sessions). Pin the value so the win cannot
    // silently regress back to full replay.
    expect(SessionContextRollout.DEFAULTS.replayToolOutputs).toBe("summary")
  })

  test("keeps replayed tool input in full because elision was reproduced verbatim", () => {
    // message-v2.ts records two incidents where a summarized tool input was
    // replayed back to the model as a real call, once emitting the
    // {__elided: ...} marker itself as a grep pattern, which errored the tool
    // and crashed the TUI.
    expect(SessionContextRollout.DEFAULTS.replayToolInputs).toBe("full")
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

  test("resolves measured profile while preserving explicit overrides", () => {
    const parsed = ConfigParse.schema(
      Config.Info,
      {
        experimental: {
          context_rollout: {
            profile: "measured",
            replay_tool_outputs: "off",
          },
        },
      },
      "test:config",
    )

    expect(SessionContextRollout.resolve(parsed)).toEqual({
      ...SessionContextRollout.DEFAULTS,
      replayToolInputs: "summary",
      replayToolOutputs: "off",
      replayReasoning: "off",
      reasoningMaxChars: 1_000,
      systemBoilerplate: "light",
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

  test("resolves an explicit reasoning compaction budget and keep window", () => {
    const parsed = ConfigParse.schema(
      Config.Info,
      {
        experimental: {
          context_rollout: {
            reasoning_max_chars: 1_200,
            reasoning_keep_recent: 2,
          },
        },
      },
      "test:config",
    )

    expect(SessionContextRollout.resolve(parsed)).toEqual({
      ...SessionContextRollout.DEFAULTS,
      reasoningMaxChars: 1_200,
      reasoningKeepRecent: 2,
    })
  })

  test("goal_dod defaults to on and accepts an explicit off", () => {
    const off = ConfigParse.schema(
      Config.Info,
      { experimental: { context_rollout: { goal_dod: "off" } } },
      "test:config",
    )
    const unset = ConfigParse.schema(Config.Info, {}, "test:config")

    expect(SessionContextRollout.DEFAULTS.goalDod).toBe("on")
    expect(SessionContextRollout.resolve(off).goalDod).toBe("off")
    expect(SessionContextRollout.resolve(unset).goalDod).toBe("on")
    expect(SessionContextRollout.resolve(off, undefined).goalDod).toBe("off")
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
