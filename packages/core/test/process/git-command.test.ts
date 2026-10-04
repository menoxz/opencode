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

  test("prefers the real arch binary over the re-execing launcher on Windows", () => {
    if (process.platform !== "win32") return
    const command = gitCommand()
    if (command === "git") return
    const launcher = /[\\/]git[\\/](cmd|bin)[\\/]git\.exe$/i.test(command)
    if (!launcher) {
      expect(fs.existsSync(command)).toBe(true)
      return
    }
    // The regression this guards: the launcher re-execs a second process, which intermittently fails
    // with EPERM and escapes the launch retry. Git-for-Windows keeps the real binary under an
    // architecture directory (`mingw64` on classic builds, `ucrt64`/`clang64`/`clangarm64` on newer
    // ones); if one exists it must have been preferred over the launcher.
    const root = path.dirname(path.dirname(command))
    for (const directory of ["mingw64", "ucrt64", "clang64", "clangarm64", "mingw32", "usr"]) {
      const real = path.join(root, directory, "bin", "git.exe")
      if (fs.existsSync(real)) throw new Error(`gitCommand returned the re-exec launcher ${command} while ${real} exists`)
    }
  })

  test("is cached so repeated resolution returns the same command", () => {
    expect(gitCommand()).toBe(gitCommand())
  })
})
