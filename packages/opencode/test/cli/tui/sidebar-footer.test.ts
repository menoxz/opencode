import { describe, expect, test } from "bun:test"
import { formatFooterPath, selectFooterBranch } from "@/cli/cmd/tui/feature-plugins/sidebar/footer"

describe("selectFooterBranch", () => {
  test("uses the branch resolved for the displayed folder", () => {
    expect(
      selectFooterBranch({
        resolved: "feat/x",
        directory: "C:/jeanluc/integrationATD",
        currentDirectory: "C:/jeanluc/opencode-fork",
        currentBranch: "dev",
      }),
    ).toBe("feat/x")
  })

  test("does not leak the launch folder's branch onto another folder", () => {
    expect(
      selectFooterBranch({
        resolved: undefined,
        directory: "C:/jeanluc/integrationATD",
        currentDirectory: "C:/jeanluc/opencode-fork",
        currentBranch: "dev",
      }),
    ).toBeUndefined()
  })

  test("shows no branch when the displayed folder has no repository", () => {
    expect(
      selectFooterBranch({
        resolved: null,
        directory: "C:/jeanluc/integrationATD",
        currentDirectory: "C:/jeanluc/integrationATD",
        currentBranch: "dev",
      }),
    ).toBeUndefined()
  })

  test("falls back to the workspace branch for the launch folder while loading", () => {
    expect(
      selectFooterBranch({
        resolved: undefined,
        directory: "C:/jeanluc/opencode-fork",
        currentDirectory: "C:/jeanluc/opencode-fork",
        currentBranch: "dev",
      }),
    ).toBe("dev")
  })
})

describe("formatFooterPath", () => {
  test("appends the branch to the folder name", () => {
    expect(formatFooterPath({ directory: "/home/me/proj", branch: "dev", home: "/home/me" })).toEqual({
      parent: "~",
      name: "proj:dev",
    })
  })

  test("omits the branch when there is none", () => {
    expect(formatFooterPath({ directory: "/home/me/proj", branch: undefined, home: "/home/me" })).toEqual({
      parent: "~",
      name: "proj",
    })
  })
})
