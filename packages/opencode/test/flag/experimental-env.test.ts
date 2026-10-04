import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { loadExperimentalEnv } from "@/flag/experimental-env"

const touched: string[] = []
const tmpFile = (content: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exp-env-"))
  const file = path.join(dir, "experimental.env")
  fs.writeFileSync(file, content)
  return file
}

afterEach(() => {
  for (const key of touched) delete process.env[key]
  touched.length = 0
})

describe("loadExperimentalEnv", () => {
  test("applies KEY=VALUE lines, skips comments and blanks, strips quotes", () => {
    touched.push("OPENCODE_EXPERIMENTAL_TEST_A", "OPENCODE_EXPERIMENTAL_TEST_B")
    const applied = loadExperimentalEnv(
      tmpFile(`# comment\n\nOPENCODE_EXPERIMENTAL_TEST_A=true\r\nOPENCODE_EXPERIMENTAL_TEST_B="60000"\n`),
    )
    expect(applied.sort()).toEqual(["OPENCODE_EXPERIMENTAL_TEST_A", "OPENCODE_EXPERIMENTAL_TEST_B"])
    expect(process.env.OPENCODE_EXPERIMENTAL_TEST_A).toBe("true")
    expect(process.env.OPENCODE_EXPERIMENTAL_TEST_B).toBe("60000")
  })

  // The file is a declarative default: an operator's explicit environment must win.
  test("never overrides a variable already present in the environment", () => {
    touched.push("OPENCODE_EXPERIMENTAL_TEST_C")
    process.env.OPENCODE_EXPERIMENTAL_TEST_C = "false"
    const applied = loadExperimentalEnv(tmpFile("OPENCODE_EXPERIMENTAL_TEST_C=true\n"))
    expect(applied).toEqual([])
    expect(process.env.OPENCODE_EXPERIMENTAL_TEST_C).toBe("false")
  })

  test("ignores malformed keys and a missing file", () => {
    touched.push("lowercase")
    expect(loadExperimentalEnv(tmpFile("lowercase=1\n=novalue\nNOEQUALS\n"))).toEqual([])
    expect(process.env.lowercase).toBeUndefined()
    expect(loadExperimentalEnv(path.join(os.tmpdir(), "does-not-exist", "x.env"))).toEqual([])
  })
})
