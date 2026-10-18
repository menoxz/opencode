import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@opencode-ai/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import { SystemPrompt, provider } from "../../src/session/system"
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

  // The catalogue used to state only that a skill exists when a task matches. Measured on an
  // eval suite: telling the agent to invoke the skill first made it read docs first, anchor on
  // doc patterns and miss project context; "explore the project first, then invoke" scored far
  // better. The intro must carry that ordering, not just the availability.
  it.effect("skills intro tells the agent to explore before loading a skill", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = (yield* prompt.skills(build)) ?? ""

      expect(output).toMatch(/explore[^\n]*first/i)
      expect(output).toContain("its description")
    }),
  )

  it.effect("core policy requires targeted inspection, bounded output, and deliberate delegation", () =>
    Effect.sync(() => {
      const core = provider({} as never).join("\n")
      // Wording re-baselined 2026-10-10: 837b653d0 restructured and reworded this block
      // (removed <tool_policy>/<runtime_awareness>/<memory_and_skills>/<user_interaction> and
      // rewrote the tools and delegation lines) without updating these strings, so the guard
      // had been dead since then. Assertions pin the current wording, same intent.
      // Re-baselined 2026-10-18: core.txt now carries rules as `X ⇒ Y` keys with no prose, so
      // no sentence of it exists for a human reader. Same five policies, same intent; the
      // anchors below are the new wording and this edit is the review signal.
      expect(core).toContain("Localiser avant lire")
      expect(core).toContain("Sorties bornées")
      expect(core).toContain("DÉLÉGUER")
      expect(core).toContain("¬déléguer trivial")
      expect(core).toContain("sous-agent ⇒ vérifier")
    }),
  )
})

// A trivial prompt (".") must not pull the whole catalogue in. This only works
// when skills() can reach Jev — i.e. when HttpClient is present in the effect
// context. The regression was exactly that absence: serviceOption returned None
// on every turn, the Jev branch was skipped, and the lexical fallback injected
// up to MAX_RELEVANT_SKILLS. This suite pins the wired-up behaviour.
let jevEndpoint = ""

const jevConfigLayer = TestConfig.layer({
  get: () =>
    Effect.succeed({
      jev: { skills: { enabled: true }, api_key: "test-key", endpoint: `${jevEndpoint}/v1/systemone` },
    } as never),
})

const itJev = testEffect(
  Layer.mergeAll(
    FetchHttpClient.layer,
    SystemPrompt.layer.pipe(
      Layer.provide(PromptComposer.defaultLayer),
      Layer.provide(jevConfigLayer),
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
  ),
)

type Answers = Record<string, { type: "noul"; noul: number }>

const withJevServer = <A, E, R>(answers: Answers, fn: (base: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: async () => Response.json({ model: "jev-latest", answers }),
      }),
    ),
    (server) => fn(server.url.origin),
    (server) => Effect.sync(() => server.stop(true)),
  )

describe("session.system Jev skill selection", () => {
  itJev.live("a trivial prompt selects no skill once Jev is reachable", () =>
    withJevServer(
      {
        "alpha-skill": { type: "noul", noul: 0.01 },
        "middle-skill": { type: "noul", noul: 0.02 },
        "zeta-skill": { type: "noul", noul: 0.03 },
      },
      (base) =>
        Effect.gen(function* () {
          jevEndpoint = base
          const prompt = yield* SystemPrompt.Service
          const output = yield* prompt.skills(build, ".", "ses_jev_trivial")
          // A total rejection by Jev must survive as "no skill injected" — the
          // regression let the lexical fallback re-fill the catalogue here.
          expect(output ?? "").not.toContain("- **")
        }),
    ),
  )

  itJev.live("a relevant prompt keeps only the skills Jev affirms", () =>
    withJevServer(
      { "middle-skill": { type: "noul", noul: 0.92 } },
      (base) =>
        Effect.gen(function* () {
          jevEndpoint = base
          const prompt = yield* SystemPrompt.Service
          const output = yield* prompt.skills(build, "middle-skill work please", "ses_jev_relevant")
          expect(output).toContain("- **middle-skill**: Middle skill.")
          expect(output).not.toContain("alpha-skill")
          expect(output).not.toContain("zeta-skill")
        }),
    ),
  )
})
