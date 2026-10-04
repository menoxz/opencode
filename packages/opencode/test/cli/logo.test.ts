import { describe, expect, test } from "bun:test"
import { logo, wordmark } from "../../src/cli/logo"

const upstream = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

describe("OPENCODEV2 logo", () => {
  test("preserves the official OPEN and CODE glyphs", () => {
    expect(logo.left).toEqual(upstream.left)
    logo.right.forEach((row, index) => expect(row.startsWith(upstream.right[index])).toBeTrue())
  })

  test("uses the approved full-height V and segmented 2", () => {
    expect(logo.right.slice(1).map((row) => row.slice(-10, -5))).toEqual(["█___█", "▀▄_▄▀", "_▀▄▀_"])
    expect(logo.right.slice(1).map((row) => row.slice(-4))).toEqual(["▀▀▀█", "█▀▀▀", "▀▀▀▀"])
  })

  test("derives the plain wordmark from the terminal glyphs", () => {
    const plain = (row: string) => row.replaceAll("_", " ").replaceAll("^", "▀").replaceAll("~", " ")
    expect(wordmark).toEqual(logo.left.map((row, index) => plain(row) + " " + plain(logo.right[index] ?? "")))
  })
})
