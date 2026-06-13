export * as ConfigInstructionInjection from "./instruction-injection"

import { Schema } from "effect"

const Agents = Schema.Literals(["full", "summary", "off"])
const Skills = Schema.Literals(["full", "summary", "caveman"])
const Synthetic = Schema.Literals(["normal", "compact", "caveman"])

export const Info = Schema.Struct({
  agents: Schema.optional(Agents).annotate({
    description: "Controls how AGENTS.md and related instruction files are injected into the prompt.",
  }),
  skills: Schema.optional(Skills).annotate({
    description: "Controls how the available skills list is injected into the system prompt.",
  }),
  synthetic: Schema.optional(Synthetic).annotate({
    description: "Controls how synthetic prompt artifacts are formatted.",
  }),
}).annotate({
  identifier: "ConfigInstructionInjection",
})

export type Info = Schema.Schema.Type<typeof Info>
