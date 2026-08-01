/**
 * Integration test: the MCP harness must detect a dead server process and
 * reconnect it automatically, instead of staying "connected" forever.
 *
 * Run: bun test src/mcp/reconnect.test.ts
 */

import { describe, it, expect, afterAll } from "bun:test"
import { Effect, Schema } from "effect"
import { join } from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { MCP } from "./index"
import { makeRuntime } from "@/effect/run-service"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import type { InstanceContext } from "@/project/instance-context"
import { ProjectID } from "@/project/schema"
import { WorkspaceID } from "@/control-plane/schema"

const fixture = join(import.meta.dir, "..", "..", "test", "fixtures", "dummy-mcp-server.mjs")
const dir = mkdtempSync(join(tmpdir(), "opencode-mcp-reconnect-"))
const traceFile = join(dir, "dummy-trace.log")

process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
  mcp: {
    dummy: {
      type: "local",
      command: ["node", fixture],
      environment: { MCP_DUMMY_LOG: traceFile },
      enabled: true,
    },
  },
  experimental: {
    mcp_health_interval_ms: 200,
    mcp_autoreconnect: true,
  },
})

const projectId = Schema.decodeSync(ProjectID)("mcp-reconnect-test")
const workspaceId = Schema.decodeSync(WorkspaceID)("wrk-mcp-reconnect-test")

const instance: InstanceContext = {
  directory: dir,
  worktree: dir,
  project: {
    id: projectId,
    worktree: dir,
    time: { created: 0, updated: 0 },
    sandboxes: [],
  },
}

const rt = makeRuntime(MCP.Service, MCP.defaultLayer)

const run = <A>(fn: (svc: MCP.Interface) => Effect.Effect<A>) =>
  rt.runPromise((svc) =>
    fn(svc).pipe(
      Effect.provideService(InstanceRef, instance),
      Effect.provideService(WorkspaceRef, workspaceId),
    ),
  )

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number, stepMs = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(stepMs)
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}

describe("MCP auto-reconnect", () => {
  afterAll(async () => {
    delete process.env.OPENCODE_CONFIG_CONTENT
    try {
      const clients = await run((svc) => svc.clients())
      const client = clients["dummy"]
      const transport = client?.transport
      if (transport instanceof StdioClientTransport && transport.pid) {
        process.kill(transport.pid, "SIGKILL")
      }
    } catch {}
    await sleep(500)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  })

  it("reconnects a server whose process dies", async () => {
    // 1. Initially connected with tools exposed.
    await waitFor(async () => (await run((svc) => svc.status()))["dummy"]?.status === "connected", 10_000)
    const tools1 = await run((svc) => svc.tools())
    expect(Object.keys(tools1)).toContain("dummy_echo")

    // 2. Kill the server process out from under the harness.
    const clients = await run((svc) => svc.clients())
    const client = clients["dummy"]
    expect(client).toBeDefined()
    const transport = client!.transport
    expect(transport).toBeInstanceOf(StdioClientTransport)
    const killedPid = (transport as StdioClientTransport).pid
    expect(killedPid).toBeGreaterThan(0)
    process.kill(killedPid!, "SIGKILL")

    // 3. The harness must notice the death and auto-reconnect: the live client
    //    must become a NEW process (different pid) with tools available again.
    await waitFor(async () => {
      const st = (await run((svc) => svc.status()))["dummy"]
      const c = (await run((svc) => svc.clients()))["dummy"]
      const tp = c?.transport
      return st?.status === "connected" && tp instanceof StdioClientTransport && tp.pid !== killedPid
    }, 20_000)

    // 4. Tools work again through the reconnected server.
    const tools2 = await run((svc) => svc.tools())
    expect(Object.keys(tools2)).toContain("dummy_echo")
  })
})
