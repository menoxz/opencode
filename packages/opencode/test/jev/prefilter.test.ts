import { describe, expect, test } from "bun:test"
import { JevPrefilter } from "@/jev/prefilter"

const bash = (command: string) => JevPrefilter.guardCandidate("bash", JSON.stringify({ command }))
const other = (tool: string, command: string) => JevPrefilter.guardCandidate(tool, JSON.stringify({ content: command }))

describe("jev.prefilter guard", () => {
  test("does not screen a benign shell command", () => {
    expect(bash("git status --short").screen).toBe(false)
    expect(bash("bun test test/jev").screen).toBe(false)
    expect(bash("Remove-Item build.log").screen).toBe(false)
  })

  test("screens a recursive force delete in either flag order", () => {
    expect(bash("rm -rf ./build").signals).toContain("rm-recursive-force")
    expect(bash("rm -r -f ./build").signals).toContain("rm-recursive-force")
    expect(bash("rm -fr ./build").signals).toContain("rm-recursive-force")
  })

  test("does not screen a delete missing the force flag", () => {
    expect(bash("rm -r ./build").screen).toBe(false)
  })

  test("screens the irreversible git operations", () => {
    expect(bash("git push --force origin main").signals).toContain("git-force-push")
    expect(bash("git reset --hard HEAD").signals).toContain("git-reset-hard")
    expect(bash("git clean -fd").signals).toContain("git-clean-force")
  })

  test("does not screen a force push that keeps the lease", () => {
    expect(bash("git push --force-with-lease origin main").screen).toBe(false)
  })

  test("screens a windows recursive delete", () => {
    expect(bash("Remove-Item -Recurse -Force C:/temp/x").signals).toContain("windows-recursive-delete")
  })

  test("screens an unbounded sql delete but not a scoped one", () => {
    expect(bash("psql -c 'DELETE FROM sessions'").signals).toContain("sql-unbounded-delete")
    expect(bash("psql -c 'DELETE FROM sessions WHERE id = 3'").screen).toBe(false)
  })

  test("never screens text the agent merely authored", () => {
    expect(other("write", "remember to run rm -rf ./build eventually").screen).toBe(false)
    expect(other("edit", "git reset --hard HEAD").screen).toBe(false)
  })
})

describe("jev.prefilter relevance", () => {
  const read = (filePath: string) => JSON.stringify({ filePath })
  const seen = [{ tool: "read", target: "src/jev/hooks.ts" }]

  test("does not screen a first read of a target", () => {
    expect(JevPrefilter.relevanceCandidate("read", read("src/jev/hooks.ts"), []).screen).toBe(false)
  })

  test("screens a repeat of an already observed target", () => {
    expect(JevPrefilter.relevanceCandidate("read", read("src/jev/hooks.ts"), seen).screen).toBe(true)
  })

  test("does not screen a repeat observed through another tool", () => {
    expect(JevPrefilter.relevanceCandidate("grep", read("src/jev/hooks.ts"), seen).screen).toBe(false)
  })

  test("never screens a mutating tool", () => {
    expect(JevPrefilter.relevanceCandidate("write", read("src/jev/hooks.ts"), seen).screen).toBe(false)
    expect(JevPrefilter.relevanceCandidate("bash", JSON.stringify({ command: "cat src/jev/hooks.ts" }), seen).screen).toBe(
      false,
    )
  })

  test("tolerates unparsable arguments without throwing", () => {
    expect(JevPrefilter.relevanceCandidate("read", "not json", seen).screen).toBe(false)
  })
})