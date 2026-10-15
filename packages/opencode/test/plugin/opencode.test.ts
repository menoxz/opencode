import { expect, test } from "bun:test"
import { OpencodeAuthPlugin } from "@/plugin/opencode"

const pluginInput = {
  client: {} as never,
  project: {} as never,
  directory: "",
  worktree: "",
  experimental_workspace: {
    register() {},
  },
  serverUrl: new URL("https://example.com"),
  $: {} as never,
}

test("declares an API key method for the opencode provider", async () => {
  const hooks = await OpencodeAuthPlugin(pluginInput)
  expect(hooks.auth?.provider).toBe("opencode")
  expect(hooks.auth?.methods).toEqual([{ type: "api", label: "API key" }])
})
