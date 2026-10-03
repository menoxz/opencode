import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { gitCommand } from "../../src/process"

describe("git command resolution", () => {
  test("resolves to an existing executable, or the bare command when git is absent", () => {
    const command = gitCommand()
    // `git` alone is the fallback for a host without git: only a resolved absolute path must exist.
    if (command !== "git") expect(fs.existsSync(command)).toBe(true)
  })

  test("prefers the real mingw64 binary over the re-execing launcher on Windows", () => {
    if (process.platform !== "win32") return
    const command = gitCommand()
    if (command === "git") return
    const launcher = /[\\/]git[\\/](cmd|bin)[\\/]git\.exe$/i.test(command)
    if (!launcher) {
      expect(fs.existsSync(command)).toBe(true)
      return
    }
    // The regression this guards: the launcher re-execs a second process, which intermittently fails
    // with EPERM and escapes the launch retry. If the real binary exists it must have been preferred.
    const real = path.join(path.dirname(path.dirname(command)), "mingw64", "bin", "git.exe")
    if (fs.existsSync(real)) throw new Error(`gitCommand returned the re-exec launcher ${command} while ${real} exists`)
  })

  test("is cached so repeated resolution returns the same command", () => {
    expect(gitCommand()).toBe(gitCommand())
  })
})
