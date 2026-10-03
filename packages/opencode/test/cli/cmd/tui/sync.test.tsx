/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../../../fixture/fixture"
import { directory, json, mount, wait } from "./sync-fixture"
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
  test("starts on the current folder, drops sessions past the age bound, and adds then removes a folder", async () => {
    const previous = Global.Path.state
    await using tmp = await tmpdir()
    Global.Path.state = tmp.path
    // A kv left behind by an earlier version: it holds the old default `"project"` under the legacy
    // key. The bar must not honour it, or it would keep listing every folder on the machine.
    await Bun.write(`${tmp.path}/kv.json`, JSON.stringify({ session_directory_scope: "project" }))

    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const session = (id: string, projectID: string, folder: string, updated: number) => ({
      id,
      slug: id,
      projectID,
      directory: folder,
      title: id,
      version: "0.0.0",
      time: { created: updated, updated },
    })

    const { app, kv, sync, session: sessionCalls } = await mount((url) => {
      if (url.pathname !== "/session") return
      if (url.searchParams.get("directory") === "/tmp/elsewhere") {
        return json([session("ses_added", "proj_other", "/tmp/elsewhere", now)])
      }
      // Older than the bound: it must not be listed even though the endpoint returned it.
      return json([
        session("ses_here", "proj_test", directory, now),
        session("ses_stale", "proj_test", directory, now - 400 * day),
      ])
    })

    try {
      // The legacy value is still in the kv and is deliberately not read; the assertions below prove
      // the default by behaviour rather than by a stored value.
      expect(kv.get("session_directory_scope")).toBe("project")
      await wait(() => sync.data.session.length > 0)

      // Only the current folder's recent session is listed: the stale one and the other
      // project's session stay out.
      expect(sync.data.session.map((item) => item.id)).toEqual(["ses_here"])

      // It asks for that folder, not the whole machine, and passes an explicit age bound. The
      // `directory` param is the SDK client's own injection for the folder the client runs in, and
      // it is only added when the request does not already carry one: an added folder keeps its own.
      expect(sessionCalls[0]?.searchParams.get("path")).toBe("packages/opencode")
      expect(sessionCalls[0]?.searchParams.get("directory")).toBe(directory)
      expect(sessionCalls.some((url) => url.searchParams.get("directory") === "/tmp/elsewhere")).toBe(false)
      expect(sessionCalls[0]?.searchParams.get("start")).not.toBeNull()

      // A folder the user adds joins the list, with its own session.
      await sync.session.addDirectory("/tmp/elsewhere")
      await wait(() => sync.data.session.length === 2)
      expect(sync.session.extraDirectories()).toEqual(["/tmp/elsewhere"])
      expect(kv.get("session_extra_directories")).toEqual(["/tmp/elsewhere"])
      expect(sync.data.session.map((item) => item.id)).toEqual(["ses_added", "ses_here"])
      expect(sessionCalls.some((url) => url.searchParams.get("directory") === "/tmp/elsewhere")).toBe(true)

      // Removing it takes the folder and its session back out of the list.
      await sync.session.removeDirectory("/tmp/elsewhere")
      await wait(() => sync.data.session.length === 1)
      expect(sync.session.extraDirectories()).toEqual([])
      expect(sync.data.session.map((item) => item.id)).toEqual(["ses_here"])


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
