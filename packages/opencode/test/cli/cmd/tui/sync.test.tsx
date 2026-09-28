/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait, worktree } from "./sync-fixture"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"

function branchEvent(branch: string, workspace?: string): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    workspace,
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

describe("tui sync", () => {
  test("all dirs lists every project's sessions through the machine-wide endpoint, and this dir narrows to the current folder", async () => {
    const previous = Global.Path.state
    await using tmp = await tmpdir()
    Global.Path.state = tmp.path
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const pages: URL[] = []
    const session = (id: string, projectID: string, directory: string, updated: number) => ({
      id,
      slug: id,
      projectID,
      directory,
      title: id,
      version: "0.0.0",
      time: { created: updated, updated },
    })
    const { app, kv, sync, session: sessionCalls } = await mount((url) => {
      if (url.pathname !== "/experimental/session") return
      pages.push(url)
      if (url.searchParams.get("cursor") === "1") return json([session("ses_other", "proj_other", "/other", 1)])
      return json([session("ses_here", "proj_test", worktree, 2)], { headers: { "x-next-cursor": "1" } })
    })

    try {
      expect(kv.get("session_directory_scope", "project")).toBe("project")
      await wait(() => sync.data.session.length === 2)

      // Machine-wide: every project's session is listed, not just the current project's directories.
      expect(pages[0]?.searchParams.get("roots")).toBe("true")
      expect(pages[0]?.searchParams.get("start")).toBeNull()
      expect(pages[0]?.searchParams.get("scope")).toBeNull()
      expect(pages[0]?.searchParams.get("cursor")).toBeNull()
      expect(pages[1]?.searchParams.get("cursor")).toBe("1")
      expect(sync.data.session.map((item) => item.id)).toEqual(["ses_here", "ses_other"])

      kv.set("session_directory_scope", "directory")
      await sync.session.refresh()

      expect(sessionCalls.at(-1)?.searchParams.get("scope")).toBeNull()
      expect(sessionCalls.at(-1)?.searchParams.get("path")).toBe("packages/opencode")
    } finally {
      app.renderer.destroy()
      Global.Path.state = previous
    }
  })

  test("vcs branch updates only apply for the active workspace", async () => {
    const previous = Global.Path.state
    await using tmp = await tmpdir()
    Global.Path.state = tmp.path
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount()

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      project.workspace.set("ws_a")
      emit(branchEvent("other", "ws_b"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", "ws_a"))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
      Global.Path.state = previous
    }
  })
})
