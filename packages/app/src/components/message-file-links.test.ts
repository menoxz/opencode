import { describe, expect, test } from "bun:test"
import { attachFileLinkHandlers } from "./message-file-links"

function click(el: Element) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }))
}

describe("attachFileLinkHandlers", () => {
  test("wraps a file path mention in a clickable span and preserves surrounding text", () => {
    const container = document.createElement("div")
    container.textContent = "please check src/foo/bar.ts:42 for details"
    attachFileLinkHandlers(container, () => {})

    const link = container.querySelector('[data-file-path]')
    expect(link?.textContent).toBe("src/foo/bar.ts:42")
    expect(container.textContent).toBe("please check src/foo/bar.ts:42 for details")
  })

  test("invokes onOpenFile with path and line when the link is clicked", () => {
    const container = document.createElement("div")
    container.textContent = "see src/foo.ts:42 now"
    const opened: Array<{ path: string; line?: number }> = []
    attachFileLinkHandlers(container, (path, line) => opened.push({ path, line }))

    const link = container.querySelector<HTMLElement>('[data-file-path]')
    expect(link).not.toBeNull()
    click(link!)

    expect(opened).toEqual([{ path: "src/foo.ts", line: 42 }])
  })

  test("passes undefined line when the path has no line number", () => {
    const container = document.createElement("div")
    container.textContent = "see README.md now"
    const opened: Array<{ path: string; line?: number }> = []
    attachFileLinkHandlers(container, (path, line) => opened.push({ path, line }))

    click(container.querySelector<HTMLElement>('[data-file-path]')!)

    expect(opened).toEqual([{ path: "README.md", line: undefined }])
  })

  test("clicking outside a file link does not call onOpenFile", () => {
    const container = document.createElement("div")
    container.textContent = "see src/foo.ts now"
    let calls = 0
    attachFileLinkHandlers(container, () => {
      calls += 1
    })

    click(container)

    expect(calls).toBe(0)
  })

  test("skips paths inside code, pre, and existing links", () => {
    const container = document.createElement("div")
    container.innerHTML = '<code>src/foo.ts</code><pre>src/bar.ts</pre><a href="#">src/baz.ts</a><span>src/qux.ts</span>'
    attachFileLinkHandlers(container, () => {})

    expect(container.querySelectorAll('[data-file-path]')).toHaveLength(1)
    const survivor = container.querySelector<HTMLElement>('[data-file-path]')
    expect(survivor?.dataset.filePath).toBe("src/qux.ts")
  })

  test("handles multiple matches within a single text node", () => {
    const container = document.createElement("div")
    container.textContent = "compare src/a.ts and src/b.ts please"
    attachFileLinkHandlers(container, () => {})

    const links = Array.from(container.querySelectorAll('[data-file-path]'))
    expect(links.map((el) => el.textContent)).toEqual(["src/a.ts", "src/b.ts"])
    expect(container.textContent).toBe("compare src/a.ts and src/b.ts please")
  })

  test("cleanup removes the click handler", () => {
    const container = document.createElement("div")
    container.textContent = "see src/foo.ts now"
    let calls = 0
    const cleanup = attachFileLinkHandlers(container, () => {
      calls += 1
    })

    const link = container.querySelector<HTMLElement>('[data-file-path]')
    cleanup()
    click(link!)

    expect(calls).toBe(0)
  })
})
