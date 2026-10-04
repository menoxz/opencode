import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Workspace } from "../../src/control-plane/workspace"
import { planRequest } from "../../src/server/routes/instance/httpapi/middleware/workspace-routing"

/**
 * Regression for the multi-folder workspace defect.
 *
 * A session created in an added folder (C:\jeanluc) was served from the folder the TUI was launched
 * in (C:\jeanluc\opencode-fork): the request carried the launch directory and the middleware never
 * consulted the session. `planRequest` shapes what the request is served from — for a Local plan
 * that directory becomes `WorkspaceRouteContext.directory`, which `session/instruction.ts` walks to
 * load AGENTS.md/CLAUDE.md and which the git worktree is resolved from. Serving from the wrong
 * directory is exactly what injected the launch folder's AGENTS.md and worktree into the session.
 *
 * These tests pin the decision: when the routing middleware passes the session's own directory,
 * the plan serves from it — never from the client/launch directory.
 */

const launchDirectory = "C:\\jeanluc\\opencode-fork"
const sessionDirectory = "C:\\jeanluc"

const sessionRequest = (directory?: string) =>
  ({
    url: "/session/ses_test",
    method: "GET",
    headers: directory === undefined ? {} : { "x-opencode-directory": directory },
  }) as unknown as Parameters<typeof planRequest>[0]

const planFor = (directory: string | undefined, sessionDir: string | undefined) =>
  Effect.runPromise(
    planRequest(sessionRequest(directory), undefined, sessionDir).pipe(
      Effect.provide(Layer.mock(Workspace.Service)({})),
    ),
  )

describe("session-scoped workspace routing (plan)", () => {
  test("serves a session request from the session's own directory, not the client's launch directory", async () => {
    const plan = (await planFor(launchDirectory, sessionDirectory)) as { _tag: string; directory: string }
    expect(plan._tag).toBe("Local")
    expect(plan.directory).toBe(sessionDirectory)
  })

  test("falls back to the request/launch directory when the session directory is unknown", async () => {
    const plan = (await planFor(launchDirectory, undefined)) as { _tag: string; directory: string }
    expect(plan._tag).toBe("Local")
    expect(plan.directory).toBe(launchDirectory)
  })

  test("falls back to the process working directory when no directory is provided at all", async () => {
    const plan = (await planFor(undefined, undefined)) as { _tag: string; directory: string }
    expect(plan._tag).toBe("Local")
    expect(plan.directory).toBe(process.cwd())
  })
})
