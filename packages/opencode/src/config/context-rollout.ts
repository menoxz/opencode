export * as ConfigContextRollout from "./context-rollout"

import { Schema } from "effect"

const ReplayToolOutputs = Schema.Literals(["full", "summary", "off"])
const ReplayToolInputs = Schema.Literals(["full", "summary", "off"])
const ReplayReasoning = Schema.Literals(["on", "off"])
const InjectionSkills = Schema.Literals(["verbose", "short"])
const InjectionInstructions = Schema.Literals(["full", "summary", "off"])
const SystemBoilerplate = Schema.Literals(["full", "light", "minimal"])
const CavemanSyntheticArtifacts = Schema.Literals(["on", "off"])

export const Info = Schema.Struct({
  replay_tool_inputs: Schema.optional(ReplayToolInputs).annotate({
    description: "Controls how historical tool inputs are replayed into model context.",
  }),
  replay_tool_outputs: Schema.optional(ReplayToolOutputs).annotate({
    description: "Controls how historical tool outputs are replayed into model context.",
  }),
  replay_reasoning: Schema.optional(ReplayReasoning).annotate({
    description: "Controls whether historical reasoning blocks are replayed into model context.",
  }),
  injection_skills: Schema.optional(InjectionSkills).annotate({
    description: "Controls whether available skills are injected in verbose or short form.",
  }),
  injection_instructions: Schema.optional(InjectionInstructions).annotate({
    description: "Controls how AGENTS/instruction files are injected into model context.",
  }),
  system_boilerplate: Schema.optional(SystemBoilerplate).annotate({
    description: "Controls how much system methodology boilerplate is injected.",
  }),
  caveman_synthetic_artifacts: Schema.optional(CavemanSyntheticArtifacts).annotate({
    description: "Controls caveman compression for synthetic prompt artifacts only.",
  }),
}).annotate({
  identifier: "ConfigContextRollout",
  description: "Experimental rollout controls for context-reduction optimizations.",
})

export type Info = Schema.Schema.Type<typeof Info>
