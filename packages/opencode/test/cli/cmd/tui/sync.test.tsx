/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"
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
  test("lists every folder of the machine, bounded by age", async () => {
    const previous = Global.Path.state
    await using tmp = await tmpdir()
    Global.Path.state = tmp.path
    await Bun.write(`${tmp.path}/kv.json`, "{}")

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

    const machine: URL[] = []
    const { app, sync } = await mount((url) => {
      if (url.pathname !== "/experimental/session") return
      machine.push(url)
      // The machine-wide listing returns a recent session and an ancient one: the bound drops the old.
      return json([
        session("ses_machine", "proj_other", "/other", now),
        session("ses_ancient", "proj_other", "/other", now - 400 * day),
      ])
    })

    try {
      await wait(() => sync.data.session.length > 0)
      // Every folder is listed, not only the current one, and the age bound still drops the ancient session.
      expect(machine.length).toBeGreaterThan(0)
      expect(machine[0]?.searchParams.get("roots")).toBe("true")
      expect(sync.data.session.map((item) => item.id)).toEqual(["ses_machine"])
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
