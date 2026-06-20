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
export type GoalDodMode = "on" | "off"
export type Profile = "baseline" | "measured"

export type Info = {
  replayToolInputs: ReplayToolInputsMode
  replayToolOutputs: ReplayToolOutputsMode
  replayReasoning: ReplayReasoningMode
  injectionSkills: InjectionSkillsMode
  injectionInstructions: InjectionInstructionsMode
  systemBoilerplate: SystemBoilerplateMode
  cavemanSyntheticArtifacts: CavemanSyntheticArtifactsMode
  goalDod: GoalDodMode
}

export const DEFAULTS: Info = {
  replayToolInputs: "full",
  replayToolOutputs: "full",
  replayReasoning: "on",
  injectionSkills: "short",
  injectionInstructions: "summary",
  systemBoilerplate: "full",
  cavemanSyntheticArtifacts: "on",
  goalDod: "on",
}

const PROFILES: Record<Profile, Info> = {
  baseline: DEFAULTS,
  measured: {
    ...DEFAULTS,
    replayToolInputs: "summary",
    replayToolOutputs: "summary",
    replayReasoning: "off",
    systemBoilerplate: "light",
  },
}

export function resolve(config: Config.Info, _flags?: Pick<RuntimeFlags.Info, never>): Info {
  const rollout = config.experimental?.context_rollout
  const profile = PROFILES[rollout?.profile ?? "baseline"]
  const instructionInjection = config.instruction_injection?.agents
  const skillInjection = config.instruction_injection?.skills
  const syntheticInjection = config.instruction_injection?.synthetic
  return {
    replayToolInputs: rollout?.replay_tool_inputs ?? profile.replayToolInputs,
    replayToolOutputs: rollout?.replay_tool_outputs ?? profile.replayToolOutputs,
    replayReasoning: rollout?.replay_reasoning ?? profile.replayReasoning,
    injectionSkills:
      rollout?.injection_skills ??
      (skillInjection === "full" ? "verbose" : skillInjection ? "short" : profile.injectionSkills),
    injectionInstructions: rollout?.injection_instructions ?? instructionInjection ?? profile.injectionInstructions,
    systemBoilerplate: rollout?.system_boilerplate ?? profile.systemBoilerplate,
    cavemanSyntheticArtifacts:
      rollout?.caveman_synthetic_artifacts ??
      (syntheticInjection === "normal" ? "off" : syntheticInjection ? "on" : profile.cavemanSyntheticArtifacts),
    goalDod: rollout?.goal_dod ?? profile.goalDod,
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
