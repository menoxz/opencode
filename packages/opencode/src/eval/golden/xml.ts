/**
 * Minimal deterministic XML scanner.
 *
 * BPMN 2.0 files are XML with namespaced tags (`bpmndi:BPMNShape`). The fork has
 * no XML dependency and a golden fingerprint must not depend on one: the whole
 * point is that the same bytes always produce the same numbers. This scanner is
 * intentionally small and total — it never throws. Anything it cannot interpret
 * is skipped, and the resulting absence is what the structural rules report.
 *
 * @module eval/golden/xml
 */

/** A parsed XML element. Attribute names keep their namespace prefix verbatim. */
export interface XmlElement {
  /** Tag name including its namespace prefix, e.g. `bpmndi:BPMNShape`. */
  name: string
  /** Tag name without its namespace prefix, e.g. `BPMNShape`. */
  local: string
  attrs: Record<string, string>
  children: XmlElement[]
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

/** Decode the five predefined XML entities plus numeric character references. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16))
    if (body.startsWith("#")) return String.fromCodePoint(Number.parseInt(body.slice(1), 10))
    return ENTITIES[body] ?? match
  })
}

/** Parse XML into a forest of elements. Text nodes are not retained. */
export function parseXml(source: string): XmlElement[] {
  const roots: XmlElement[] = []
  const stack: XmlElement[] = []
  let i = 0

  while (i < source.length) {
    const open = source.indexOf("<", i)
    if (open === -1) break
    i = open

    if (source.startsWith("<!--", i)) {
      i = skipUntil(source, i + 4, "-->")
      continue
    }
    if (source.startsWith("<![CDATA[", i)) {
      i = skipUntil(source, i + 9, "]]>")
      continue
    }
    if (source.startsWith("<?", i)) {
      i = skipUntil(source, i + 2, "?>")
      continue
    }
    if (source.startsWith("<!", i)) {
      i = skipUntil(source, i + 2, ">")
      continue
    }
    if (source.startsWith("</", i)) {
      stack.pop()
      i = skipUntil(source, i + 2, ">")
      continue
    }

    const tag = readTag(source, i)
    if (!tag) {
      i += 1
      continue
    }
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(tag.element)
    if (!parent) roots.push(tag.element)
    if (!tag.selfClosing) stack.push(tag.element)
    i = tag.next
  }

  return roots
}

/** Every element in the forest, parents before children. */
export function flatten(elements: XmlElement[]): XmlElement[] {
  const out: XmlElement[] = []
  const walk = (nodes: XmlElement[]) => {
    for (const node of nodes) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(elements)
  return out
}

/** Direct children matching a local name (namespace prefix ignored). */
export function childrenNamed(element: XmlElement, local: string): XmlElement[] {
  return element.children.filter((c) => c.local === local)
}

function skipUntil(source: string, from: number, terminator: string): number {
  const end = source.indexOf(terminator, from)
  if (end === -1) return source.length
  return end + terminator.length
}

function readTag(
  source: string,
  start: number,
): { element: XmlElement; selfClosing: boolean; next: number } | undefined {
  const nameMatch = /^<([^\s/>]+)/.exec(source.slice(start, start + 256))
  if (!nameMatch) return undefined
  const name = nameMatch[1]

  let i = start + nameMatch[0].length
  const attrs: Record<string, string> = {}

  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i++
    if (source.startsWith("/>", i)) {
      return { element: makeElement(name, attrs), selfClosing: true, next: i + 2 }
    }
    if (source[i] === ">") {
      return { element: makeElement(name, attrs), selfClosing: false, next: i + 1 }
    }

    const attr = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(source.slice(i))
    if (!attr) {
      // Unquoted or malformed attribute: skip one character and keep scanning
      // rather than aborting the whole document.
      i += 1
      continue
    }
    attrs[attr[1]] = decodeEntities(attr[3] ?? attr[4] ?? "")
    i += attr[0].length
  }

  return { element: makeElement(name, attrs), selfClosing: true, next: source.length }
}

function makeElement(name: string, attrs: Record<string, string>): XmlElement {
  const colon = name.indexOf(":")
  return {
    name,
    local: colon === -1 ? name : name.slice(colon + 1),
    attrs,
    children: [],
  }
}
