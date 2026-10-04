import { test, expect, afterEach } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { globalConfigFile } from "@/config/config"

// The /model dialog names this file in its confirmation toast after writing the
// global default model. If the name drifts from the file Config.updateGlobal
// actually writes, the toast sends the user editing the wrong file to find a
// setting that lives somewhere else.

const previous = Global.Path.config
const dirs: string[] = []

const withConfigDir = async (files: string[]) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-globalconfig-"))
  dirs.push(dir)
  for (const file of files) await fs.writeFile(path.join(dir, file), "{}")
  ;(Global.Path as { config: string }).config = dir
  return dir
}

afterEach(async () => {
  ;(Global.Path as { config: string }).config = previous
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

test("names the existing opencode.json", async () => {
  const dir = await withConfigDir(["opencode.json"])
  expect(globalConfigFile()).toBe(path.join(dir, "opencode.json"))
})

test("prefers opencode.jsonc when both exist", async () => {
  const dir = await withConfigDir(["opencode.json", "opencode.jsonc"])
  expect(globalConfigFile()).toBe(path.join(dir, "opencode.jsonc"))
})

test("falls back to the legacy config.json when it is the only one", async () => {
  const dir = await withConfigDir(["config.json"])
  expect(globalConfigFile()).toBe(path.join(dir, "config.json"))
})

test("names a creatable path when no config file exists yet", async () => {
  const dir = await withConfigDir([])
  expect(globalConfigFile()).toBe(path.join(dir, "opencode.jsonc"))
})
