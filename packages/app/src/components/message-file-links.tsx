import { detectFileLinks } from "@/utils/file-link-detector"

// Inline `code`/`pre` content and existing links are left alone: the markdown renderer
// already owns that DOM structure (copy-button wiring, external-link anchors), so
// rewriting their text nodes here would fight it.
const skipTags = new Set(["CODE", "PRE", "A"])

function transformTextNode(node: Text) {
  const text = node.textContent ?? ""
  const matches = detectFileLinks(text)
  if (matches.length === 0) return

  const fragment = document.createDocumentFragment()
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)))

    const link = document.createElement("span")
    link.textContent = match.text
    link.className = "file-link cursor-pointer underline decoration-dotted underline-offset-2 hover:text-text-strong"
    link.dataset.component = "file-link"
    link.dataset.filePath = match.path
    if (match.line) link.dataset.fileLine = String(match.line)
    fragment.appendChild(link)

    cursor = match.end
  }
  if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)))

  node.parentNode?.replaceChild(fragment, node)
}

function walkAndTransform(node: Node) {
  if (node instanceof Text) {
    transformTextNode(node)
    return
  }
  if (!(node instanceof Element)) return
  if (skipTags.has(node.tagName)) return
  Array.from(node.childNodes).forEach(walkAndTransform)
}

/**
 * Post-processes already-rendered markdown HTML in `container`, wrapping detected file
 * paths in clickable `<span data-file-path>` elements and delegating their clicks to
 * `onOpenFile`. Returns a cleanup function that removes the click listener.
 *
 * The DOM rewrite is a one-shot pass: call this again whenever the markdown renderer
 * replaces `container`'s content (e.g. streaming updates), since a fresh render won't
 * carry over the injected spans.
 */
export function attachFileLinkHandlers(container: HTMLElement, onOpenFile: (path: string, line?: number) => void) {
  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const path = target.dataset.filePath
    if (!path) return
    const line = target.dataset.fileLine
    onOpenFile(path, line ? parseInt(line, 10) : undefined)
  }

  container.addEventListener("click", handleClick)
  walkAndTransform(container)

  return () => container.removeEventListener("click", handleClick)
}
