import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { SystemPrompt } from "../../src/session/system"
import { PromptComposer } from "../../src/prompt-composer"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  SystemPrompt.layer.pipe(
    Layer.provide(PromptComposer.defaultLayer),
    Layer.provide(TestConfig.layer({ get: () => Effect.succeed({}) })),
    Layer.provide(
      Layer.succeed(
        Skill.Service,
        Skill.Service.of({
          get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
          require: (name) => {
            const info = skills.find((skill) => skill.name === name)
            if (info) return Effect.succeed(info)
            return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
          },
          all: () => Effect.succeed(skills),
          dirs: () => Effect.succeed([]),
          available: () => Effect.succeed(skills),
          reload: () => Effect.succeed(0),
          revision: () => Effect.succeed(0),
        }),
      ),
    ),
  ),
)

describe("session.system", () => {
  it.effect("preloads configured skill bodies once from their source", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const lean = { ...build, name: "lean", preloadSkills: ["alpha-skill", "alpha-skill"] } as Agent.Info
      const output = yield* prompt.preloadedSkills(lean)
      const catalog = yield* prompt.skills(lean)

      expect(output).toContain('<preloaded_skills>')
      expect(output).toContain('<skill_content name="alpha-skill" source="/tmp/alpha-skill/SKILL.md">')
      expect(output).toContain('# alpha-skill')
      expect(output?.match(/<skill_content /g)).toHaveLength(1)
      expect(catalog).not.toContain('alpha-skill')
    }),
  )

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("- **alpha-skill**: Alpha skill.")
      const middle = output.indexOf("- **middle-skill**: Middle skill.")
      const zeta = output.indexOf("- **zeta-skill**: Zeta skill.")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
      expect(output).not.toContain("<available_skills>")
    }),
  )
})
