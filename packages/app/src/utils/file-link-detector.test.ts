import { describe, expect, test } from "bun:test"
import { detectFileLinks } from "./file-link-detector"

describe("detectFileLinks", () => {
  test("detects a relative path with a directory", () => {
    const matches = detectFileLinks("see src/foo/bar.ts for details")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ path: "src/foo/bar.ts", text: "src/foo/bar.ts", line: undefined })
  })

  test("detects ./ and ../ prefixed paths", () => {
    expect(detectFileLinks("edit ./config.json please")[0]).toMatchObject({ path: "./config.json" })
    expect(detectFileLinks("see ../lib/utils.py now")[0]).toMatchObject({ path: "../lib/utils.py" })
  })

  test("detects a bare filename with no directory", () => {
    const matches = detectFileLinks("see file.ts:42 now")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ path: "file.ts", line: 42, text: "file.ts:42" })
  })

  test("extracts the line number and fully consumes a trailing column", () => {
    const matches = detectFileLinks("error at index.ts:10:5 here")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ path: "index.ts", line: 10, text: "index.ts:10:5" })
  })

  test("does not truncate extensions that share a prefix with a shorter one", () => {
    expect(detectFileLinks("check packages/app/src/App.tsx please")[0]).toMatchObject({
      path: "packages/app/src/App.tsx",
    })
    expect(detectFileLinks("open components/Foo.jsx now")[0]).toMatchObject({ path: "components/Foo.jsx" })
    expect(detectFileLinks("open package.json now")[0]).toMatchObject({ path: "package.json" })
    expect(detectFileLinks("run script.js now")[0]).toMatchObject({ path: "script.js" })
  })

  test("recognizes every documented extension", () => {
    const extensions = [
      "a.ts",
      "a.tsx",
      "a.js",
      "a.jsx",
      "a.py",
      "a.rs",
      "a.go",
      "a.java",
      "a.json",
      "a.md",
      "a.yaml",
      "a.yml",
      "a.css",
      "a.html",
      "a.sql",
      "a.sh",
      "a.txt",
      "a.toml",
    ]
    for (const file of extensions) {
      expect(detectFileLinks(`open ${file} now`)[0]?.path).toBe(file)
    }
  })

  test("does not match URLs or version-like strings", () => {
    expect(detectFileLinks("visit https://example.com/path.html for docs")).toHaveLength(0)
    expect(detectFileLinks("v1.2.3 released")).toHaveLength(0)
    expect(detectFileLinks("this is nothing special here")).toHaveLength(0)
  })

  test("finds multiple matches and reconstructs the original text from start/end offsets", () => {
    const original = "Files: src/a.ts:1 and ./b/c.py and README.md end"
    const matches = detectFileLinks(original)
    expect(matches).toHaveLength(3)

    let rebuilt = ""
    let cursor = 0
    for (const match of matches) {
      rebuilt += original.slice(cursor, match.start) + match.text
      cursor = match.end
    }
    rebuilt += original.slice(cursor)

    expect(rebuilt).toBe(original)
  })

  test("keeps the leading boundary character out of the match (start points at the path itself)", () => {
    const original = "see src/foo/bar.ts:42 for details"
    const matches = detectFileLinks(original)
    expect(matches[0]?.start).toBe(original.indexOf("src/foo/bar.ts"))
  })

  test("matches a path at the very start of the string and after a newline", () => {
    expect(detectFileLinks("src/foo.ts is broken")[0]).toMatchObject({ path: "src/foo.ts", start: 0 })
    const afterNewline = "Some text.\nsrc/foo.ts:42 has a bug"
    const match = detectFileLinks(afterNewline)[0]
    expect(match).toMatchObject({ path: "src/foo.ts", line: 42 })
    expect(match?.start).toBe(afterNewline.indexOf("src/foo.ts"))
  })

  test("matches paths wrapped in backticks or parentheses without including the wrapper", () => {
    expect(detectFileLinks("in `src/a.ts` file")[0]).toMatchObject({ path: "src/a.ts", text: "src/a.ts" })
    expect(detectFileLinks("(src/a.ts) note")[0]).toMatchObject({ path: "src/a.ts", text: "src/a.ts" })
  })

  test("returns an empty array when there is no match", () => {
    expect(detectFileLinks("")).toEqual([])
    expect(detectFileLinks("nothing to see here")).toEqual([])
  })
})
