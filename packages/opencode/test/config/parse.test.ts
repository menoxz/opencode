import { describe, expect, test } from "bun:test"
import { Config } from "@/config/config"
import { ConfigParse } from "../../src/config/parse"

const parse = (data: unknown) => ConfigParse.schema(Config.Info, data, "test:config")

/** Messages of the config issues raised by a failing parse. */
const issuesOf = (run: () => unknown): string[] => {
  try {
    run()
  } catch (error) {
    const data = (error as { data?: { issues?: Array<{ message: string }> } }).data
    return (data?.issues ?? []).map((issue) => issue.message)
  }
  return []
}

describe("ConfigParse.schema comment keys", () => {
  // Regression: a "//" key made every startup request fail. JSON has no
  // comments, so "//" is the conventional workaround and people use it in
  // opencode.json exactly like they do in package.json.
  test('accepts the conventional "//" comment key', () => {
    const config = parse({ "//": "why this file exists", shell: "bash" })
    expect(config.shell).toBe("bash")
    expect(config).not.toHaveProperty("//")
  })

  test("accepts several prefixed comment keys", () => {
    const config = parse({ "// note": "first", "//2": "second", shell: "bash" })
    expect(config.shell).toBe("bash")
    expect(Object.keys(config).filter((key) => key.startsWith("//"))).toEqual([])
  })

  test("still rejects a genuinely unknown key", () => {
    expect(issuesOf(() => parse({ shel: "bash" }))).toEqual(["Unrecognized key: shel"])
  })

  test("reports every unknown key while ignoring comments", () => {
    expect(issuesOf(() => parse({ "//": "note", shel: "bash", modle: "x" }))).toEqual([
      "Unrecognized keys: shel, modle",
    ])
  })

  test("parses a real project guard config that used a comment key", () => {
    const config = parse({
      $schema: "https://opencode.ai/config.json",
      "//": "Guard against editing the sibling worktree without confirmation.",
      permission: {
        edit: { "*": "allow", "C:/jeanluc/boutikV2/**": "deny" },
        bash: { "*": "allow", "git checkout *": "ask" },
      },
    })
    expect(config.permission?.edit).toMatchObject({ "C:/jeanluc/boutikV2/**": "deny" })
    expect(config).not.toHaveProperty("//")
  })
})
