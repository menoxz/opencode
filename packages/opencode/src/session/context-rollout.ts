import { Context, Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"

export * as SessionContextRollout from "./context-rollout"

export type ReplayToolOutputsMode = "full" | "summary" | "off"
export type ReplayToolInputsMode = "full" | "summary" | "off"
export type ReplayReasoningMode = "on" | "off"
export type InjectionSkillsMode = "verbose" | "short"
export type InjectionInstructionsMode = "full" | "summary" | "off"
export type SystemBoilerplateMode = "full" | "light" | "minimal"
export type CavemanSyntheticArtifactsMode = "on" | "off"

export type Info = {
  replayToolInputs: ReplayToolInputsMode
  replayToolOutputs: ReplayToolOutputsMode
  replayReasoning: ReplayReasoningMode
  injectionSkills: InjectionSkillsMode
  injectionInstructions: InjectionInstructionsMode
  systemBoilerplate: SystemBoilerplateMode
  cavemanSyntheticArtifacts: CavemanSyntheticArtifactsMode
}

export const DEFAULTS: Info = {
  replayToolInputs: "full",
  replayToolOutputs: "full",
  replayReasoning: "on",
  injectionSkills: "short",
  injectionInstructions: "summary",
  systemBoilerplate: "full",
  cavemanSyntheticArtifacts: "on",
}

export function resolve(config: Config.Info, _flags?: Pick<RuntimeFlags.Info, never>): Info {
  const rollout = config.experimental?.context_rollout
  const instructionInjection = config.instruction_injection?.agents
  const skillInjection = config.instruction_injection?.skills
  const syntheticInjection = config.instruction_injection?.synthetic
  return {
    replayToolInputs: rollout?.replay_tool_inputs ?? DEFAULTS.replayToolInputs,
    replayToolOutputs: rollout?.replay_tool_outputs ?? DEFAULTS.replayToolOutputs,
    replayReasoning: rollout?.replay_reasoning ?? DEFAULTS.replayReasoning,
    injectionSkills:
      rollout?.injection_skills ??
      (skillInjection === "full" ? "verbose" : skillInjection ? "short" : DEFAULTS.injectionSkills),
    injectionInstructions: rollout?.injection_instructions ?? instructionInjection ?? DEFAULTS.injectionInstructions,
    systemBoilerplate: rollout?.system_boilerplate ?? DEFAULTS.systemBoilerplate,
    cavemanSyntheticArtifacts:
      rollout?.caveman_synthetic_artifacts ??
      (syntheticInjection === "normal" ? "off" : syntheticInjection ? "on" : DEFAULTS.cavemanSyntheticArtifacts),
  }
}

export interface Interface {
  readonly get: () => Effect.Effect<Info>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionContextRollout") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service
    return Service.of({
      get: Effect.fn("SessionContextRollout.get")(function* () {
        return resolve(yield* config.get(), flags)
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
