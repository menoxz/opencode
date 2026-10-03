import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect, FileSystem, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { NodeFileSystem } from "@effect/platform-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Instruction } from "../../src/session/instruction"
import type { MessageV2 } from "../../src/session/message-v2"
import { Workspace } from "../../src/control-plane/workspace"
import { planRequest } from "../../src/server/routes/instance/httpapi/middleware/workspace-routing"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { Global } from "@opencode-ai/core/global"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { provideInstance, provideTmpdirInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestConfig } from "../fixture/config"

const it = testEffect(Layer.mergeAll(CrossSpawnSpawner.defaultLayer, NodeFileSystem.layer))

const configLayer = TestConfig.layer()

const instructionLayer = (global: Partial<Global.Interface>, flags: Partial<RuntimeFlags.Info> = {}) =>
  Instruction.layer.pipe(
    Layer.provide(configLayer),
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Global.layerWith(global)),
    Layer.provide(RuntimeFlags.layer(flags)),
  )

const provideInstruction =
  (global: Partial<Global.Interface>, flags?: Partial<RuntimeFlags.Info>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(Effect.provide(instructionLayer(global, flags)))

const write = (filepath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(path.dirname(filepath), { recursive: true })
    yield* fs.writeFileString(filepath, content)
  })

const writeFiles = (dir: string, files: Record<string, string>) =>
  Effect.all(
    Object.entries(files).map(([file, content]) => write(path.join(dir, file), content)),
    { discard: true },
  )

const withFiles = <A, E, R>(files: Record<string, string>, self: (dir: string) => Effect.Effect<A, E, R>) =>
  provideTmpdirInstance((dir) =>
    Effect.gen(function* () {
      yield* writeFiles(dir, files)
      return yield* self(dir).pipe(provideInstruction({ home: dir, config: dir }))
    }),
  )

const tmpWithFiles = (files: Record<string, string>) =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    yield* writeFiles(dir, files)
    return dir
  })

function loaded(filepath: string): MessageV2.WithParts[] {
  const sessionID = SessionID.make("session-loaded-1")
  const messageID = MessageID.make("msg_message-loaded-1")

  return [
    {
      info: {
        id: messageID,
        sessionID,
        role: "user",
        time: { created: 0 },
        agent: "build",
        model: {
          providerID: ProviderID.make("anthropic"),
          modelID: ModelID.make("claude-sonnet-4-20250514"),
        },
      },
      parts: [
        {
          id: PartID.make("prt_part-loaded-1"),
          messageID,
          sessionID,
          type: "tool",
          callID: "call-loaded-1",
          tool: "read",
          state: {
            status: "completed",
            input: {},
            output: "done",
            title: "Read",
            metadata: { loaded: [filepath] },
            time: { start: 0, end: 1 },
          },
        },
      ],
    },
  ]
}

describe("Instruction.resolve", () => {
  it.live("returns empty when AGENTS.md is at project root (already in systemPaths)", () =>
    withFiles({ "AGENTS.md": "# Root Instructions", "src/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const system = yield* svc.systemPaths()
        expect(system.has(path.join(dir, "AGENTS.md"))).toBe(true)

        const results = yield* svc.resolve([], path.join(dir, "src", "file.ts"), MessageID.make("msg_message-test-1"))
        expect(results).toEqual([])
      }),
    ),
  )

  it.live("returns AGENTS.md from subdirectory (not in systemPaths)", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const system = yield* svc.systemPaths()
        expect(system.has(path.join(dir, "subdir", "AGENTS.md"))).toBe(false)

        const results = yield* svc.resolve(
          [],
          path.join(dir, "subdir", "nested", "file.ts"),
          MessageID.make("msg_message-test-2"),
        )
        expect(results.length).toBe(1)
        expect(results[0].filepath).toBe(path.join(dir, "subdir", "AGENTS.md"))
      }),
    ),
  )

  it.live("doesn't reload AGENTS.md when reading it directly", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const filepath = path.join(dir, "subdir", "AGENTS.md")
        const system = yield* svc.systemPaths()
        expect(system.has(filepath)).toBe(false)

        const results = yield* svc.resolve([], filepath, MessageID.make("msg_message-test-3"))
        expect(results).toEqual([])
      }),
    ),
  )

  it.live("does not reattach the same nearby instructions twice for one message", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const filepath = path.join(dir, "subdir", "nested", "file.ts")
        const id = MessageID.make("msg_message-claim-1")

        const first = yield* svc.resolve([], filepath, id)
        const second = yield* svc.resolve([], filepath, id)

        expect(first).toHaveLength(1)
        expect(first[0].filepath).toBe(path.join(dir, "subdir", "AGENTS.md"))
        expect(second).toEqual([])
      }),
    ),
  )

  it.live("clear allows nearby instructions to be attached again for the same message", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const filepath = path.join(dir, "subdir", "nested", "file.ts")
        const id = MessageID.make("msg_message-claim-2")

        const first = yield* svc.resolve([], filepath, id)
        yield* svc.clear(id)
        const second = yield* svc.resolve([], filepath, id)

        expect(first).toHaveLength(1)
        expect(second).toHaveLength(1)
        expect(second[0].filepath).toBe(path.join(dir, "subdir", "AGENTS.md"))
      }),
    ),
  )

  it.live("skips instructions already reported by prior read metadata", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const agents = path.join(dir, "subdir", "AGENTS.md")
        const filepath = path.join(dir, "subdir", "nested", "file.ts")
        const id = MessageID.make("msg_message-claim-3")

        const results = yield* svc.resolve(loaded(agents), filepath, id)
        expect(results).toEqual([])
      }),
    ),
  )

  test.todo("fetches remote instructions from config URLs via HttpClient", () => {})
})

describe("Instruction.system", () => {
  it.live("loads both project and global AGENTS.md when both exist", () =>
    Effect.gen(function* () {
      const globalTmp = yield* tmpWithFiles({ "AGENTS.md": "# Global Instructions" })
      const projectTmp = yield* tmpWithFiles({ "AGENTS.md": "# Project Instructions" })

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const paths = yield* svc.systemPaths()
        expect(paths.has(path.join(projectTmp, "AGENTS.md"))).toBe(true)
        expect(paths.has(path.join(globalTmp, "AGENTS.md"))).toBe(true)

        const rules = yield* svc.system()
        expect(rules).toHaveLength(2)
        expect(rules[0]).toContain(`Instructions from: ${path.join(globalTmp, "AGENTS.md")}`)
        expect(rules[0]).toContain("summary")
        expect(rules[0]).not.toBe(`Instructions from: ${path.join(globalTmp, "AGENTS.md")}\n# Global Instructions`)
        expect(rules[1]).toContain(`Instructions from: ${path.join(projectTmp, "AGENTS.md")}`)
        expect(rules[1]).toContain("summary")
        expect(rules[1]).not.toBe(`Instructions from: ${path.join(projectTmp, "AGENTS.md")}\n# Project Instructions`)
      }).pipe(provideInstance(projectTmp), provideInstruction({ home: globalTmp, config: globalTmp }))
    }),
  )

  it.live("end-to-end: a session in an added folder loads that folder's AGENTS.md, never the launch folder's", () =>
    Effect.gen(function* () {
      // The TUI was launched in `launch`; the session lives in the added folder `added`.
      const launch = yield* tmpWithFiles({ "AGENTS.md": "# Launch Instructions" })
      const added = yield* tmpWithFiles({ "AGENTS.md": "# Added Instructions" })

      // The routing middleware decides which folder serves the session request. The client sends its
      // launch directory as a fallback header, but the session's own directory must win. This is the
      // exact chain that injected the wrong AGENTS.md: request -> plan.directory -> Instruction.
      const request = {
        url: "/session/ses_added",
        method: "GET",
        headers: { "x-opencode-directory": launch },
      } as unknown as Parameters<typeof planRequest>[0]
      const plan = (yield* planRequest(request, undefined, added).pipe(
        Effect.provide(Layer.mock(Workspace.Service)({})),
      )) as { _tag: string; directory: string }
      expect(plan._tag).toBe("Local")
      expect(plan.directory).toBe(added)

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const paths = yield* svc.systemPaths()
        expect(paths.has(path.join(added, "AGENTS.md"))).toBe(true)
        expect(paths.has(path.join(launch, "AGENTS.md"))).toBe(false)

        const rules = yield* svc.system()
        expect(rules.some((rule) => rule.includes(path.join(added, "AGENTS.md")))).toBe(true)
        expect(rules.every((rule) => !rule.includes(path.join(launch, "AGENTS.md")))).toBe(true)
      }).pipe(provideInstance(plan.directory), provideInstruction({ home: added, config: added }))
    }),
  )

  it.live("loads full AGENTS.md when configured with full injection", () =>
    Effect.gen(function* () {
      const globalTmp = yield* tmpWithFiles({ "AGENTS.md": "# Global Instructions" })
      const projectTmp = yield* tmpWithFiles({ "AGENTS.md": "# Project Instructions" })

      const fullConfig = TestConfig.layer({
        get: () =>
          Effect.succeed({
            instruction_injection: {
              agents: "full",
            },
          }),
      })

      const fullInstruction = Instruction.layer.pipe(
        Layer.provide(fullConfig),
        Layer.provide(AppFileSystem.defaultLayer),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(Global.layerWith({ home: globalTmp, config: globalTmp })),
        Layer.provide(RuntimeFlags.layer({})),
      )

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const rules = yield* svc.system()
        expect(rules).toHaveLength(2)
        expect(rules[0]).toBe(`Instructions from: ${path.join(globalTmp, "AGENTS.md")}\n# Global Instructions`)
        expect(rules[1]).toBe(`Instructions from: ${path.join(projectTmp, "AGENTS.md")}\n# Project Instructions`)
      }).pipe(provideInstance(projectTmp), Effect.provide(fullInstruction))
    }),
  )

  it.live("skips project and global CLAUDE.md when Claude Code prompt is disabled", () =>
    Effect.gen(function* () {
      const globalTmp = yield* tmpWithFiles({ ".claude/CLAUDE.md": "# Global Claude" })
      const projectTmp = yield* tmpWithFiles({ "CLAUDE.md": "# Project Claude" })

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const paths = yield* svc.systemPaths()
        expect(paths.has(path.join(globalTmp, ".claude", "CLAUDE.md"))).toBe(false)
        expect(paths.has(path.join(projectTmp, "CLAUDE.md"))).toBe(false)
        expect(yield* svc.system()).toEqual([])
      }).pipe(
        provideInstance(projectTmp),
        provideInstruction({ home: globalTmp, config: globalTmp }, { disableClaudeCodePrompt: true }),
      )
    }),
  )

  it.live("resolves relative config instructions against the config directory", () =>
    Effect.gen(function* () {
      // The instruction file lives next to the config file (globalTmp), NOT in
      // the project tree. "./rules.md" patterns must resolve against the
      // config directory instead of being silently dropped.
      const globalTmp = yield* tmpWithFiles({ "rules.md": "# Config Rules" })
      const projectTmp = yield* tmpWithFiles({ "AGENTS.md": "# Project" })

      const configLayer = TestConfig.layer({
        get: () =>
          Effect.succeed({
            instructions: ["./rules.md"],
          }),
      })

      const instructionLayer = Instruction.layer.pipe(
        Layer.provide(configLayer),
        Layer.provide(AppFileSystem.defaultLayer),
        Layer.provide(FetchHttpClient.layer),
        Layer.provide(Global.layerWith({ home: globalTmp, config: globalTmp })),
        Layer.provide(RuntimeFlags.layer({})),
      )

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const rules = yield* svc.system()
        const rule = rules.find((item) => item.includes("Config Rules"))
        expect(rule).toBeDefined()
        expect(rule).toContain(path.join(globalTmp, "rules.md"))
      }).pipe(provideInstance(projectTmp), Effect.provide(instructionLayer))
    }),
  )
})

describe("Instruction.systemPaths global config", () => {
  it.live("uses Global.Service config AGENTS.md", () =>
    Effect.gen(function* () {
      const globalTmp = yield* tmpWithFiles({ "AGENTS.md": "# Global Instructions" })
      const projectTmp = yield* tmpdirScoped()

      yield* Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const paths = yield* svc.systemPaths()
        expect(paths.has(path.join(globalTmp, "AGENTS.md"))).toBe(true)
      }).pipe(provideInstance(projectTmp), provideInstruction({ home: globalTmp, config: globalTmp }))
    }),
  )

  it.live("summarizes nearby AGENTS.md when resolving file reads", () =>
    withFiles({ "subdir/AGENTS.md": "# Subdir Instructions", "subdir/nested/file.ts": "const x = 1" }, (dir) =>
      Effect.gen(function* () {
        const svc = yield* Instruction.Service
        const results = yield* svc.resolve([], path.join(dir, "subdir", "nested", "file.ts"), MessageID.make("msg_message-test-4"))
        expect(results).toHaveLength(1)
        expect(results[0].content).toContain(`Instructions from: ${path.join(dir, "subdir", "AGENTS.md")}`)
        expect(results[0].content).toContain("summary")
        expect(results[0].content).not.toBe(`Instructions from: ${path.join(dir, "subdir", "AGENTS.md")}\n# Subdir Instructions`)
      }),
    ),
  )
})
