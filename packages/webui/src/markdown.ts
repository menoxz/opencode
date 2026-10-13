/**
 * Markdown — un analyseur qui produit un **arbre**, jamais du HTML.
 *
 * Pourquoi pas une bibliothèque, ni `innerHTML` : la prose vient d'un modèle, donc c'est une
 * **donnée**. La rendre par `innerHTML` ouvrirait une injection (un `<img onerror=…>` dans une
 * réponse suffit). Ici l'analyseur ne rend que du texte et des **nœuds typés** ; le composant Solid
 * les transforme en balises qu'il construit lui-même, et Solid échappe le texte par défaut. La
 * propriété tient donc **par construction**, pas par un assainisseur qu'on pourrait oublier.
 *
 * Le sous-ensemble couvert est celui qui sert vraiment (cf. `CIBLE.md` §12.1) : titres, listes,
 * code clôturé, citations, tableaux, filets, et en ligne : code, gras, italique, liens, images.
 * Ce qui n'est pas reconnu reste du **texte**, ce qui est toujours plus sûr que de le deviner.
 */

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: MdInline[] }
  | { kind: "em"; children: MdInline[] }
  | { kind: "link"; href: string; children: MdInline[] }
  | { kind: "image"; src: string; alt: string }

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; children: MdInline[] }
  | { kind: "paragraph"; children: MdInline[] }
  | { kind: "code"; lang?: string; text: string }
  | { kind: "quote"; children: MdInline[] }
  | { kind: "list"; ordered: boolean; items: MdListItem[] }
  | { kind: "table"; header: MdInline[][]; align: Array<"left" | "center" | "right">; rows: MdInline[][][] }
  | { kind: "rule" }

/** Un élément de liste : son contenu en ligne, et éventuellement une sous-liste (un seul niveau). */
export type MdListItem = { children: MdInline[]; sub?: MdBlock }

const isSpace = (char: string | undefined) => char === " " || char === "\t"

/** `[label](href)`, à partir du `[`. Rend `undefined` si ce n'en est pas un (crochets non fermés). */
function matchBracket(text: string, open: number): { label: string; href: string; end: number } | undefined {
  if (text[open] !== "[") return undefined
  const close = text.indexOf("]", open + 1)
  if (close === -1) return undefined
  if (text[close + 1] !== "(") return undefined
  const end = text.indexOf(")", close + 2)
  if (end === -1) return undefined
  const href = text.slice(close + 2, end).trim()
  // Un lien sans destination ne mène nulle part : on le laisse en texte plutôt que d'inventer.
  if (!href) return undefined
  return { label: text.slice(open + 1, close), href, end: end + 1 }
}

const AUTOLINK = /^https?:\/\/[^\s<>()]+/

/** Le texte en ligne, découpé en nœuds. Récursif : `**gras avec `code` dedans**` marche. */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = []
  let buffer = ""
  let i = 0
  const flush = () => {
    if (buffer.length > 0) {
      out.push({ kind: "text", text: buffer })
      buffer = ""
    }
  }

  while (i < text.length) {
    const char = text[i]!

    // Code en ligne : prioritaire sur tout le reste, son contenu n'est jamais interprété.
    if (char === "`") {
      const end = text.indexOf("`", i + 1)
      if (end > i + 1) {
        flush()
        out.push({ kind: "code", text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    if (char === "!" && text[i + 1] === "[") {
      const link = matchBracket(text, i + 1)
      if (link) {
        flush()
        out.push({ kind: "image", src: link.href, alt: link.label })
        i = link.end
        continue
      }
    }

    if (char === "[") {
      const link = matchBracket(text, i)
      if (link) {
        flush()
        out.push({ kind: "link", href: link.href, children: parseInline(link.label) })
        i = link.end
        continue
      }
    }

    // Gras avant italique, sinon `**` serait lu comme deux `*`.
    if ((char === "*" || char === "_") && text[i + 1] === char) {
      const marker = char + char
      const end = text.indexOf(marker, i + 2)
      // Les bornes ne doivent pas être des espaces, sinon `2 * 3 * 4` deviendrait du gras.
      if (end > i + 2 && !isSpace(text[i + 2]) && !isSpace(text[end - 1])) {
        flush()
        out.push({ kind: "strong", children: parseInline(text.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }

    if (char === "*" || char === "_") {
      // `_` ne démarre un italique qu'en début de mot : sinon `snake_case_name` serait découpé.
      const wordBoundary = char !== "_" || i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1] ?? "")
      const end = text.indexOf(char, i + 1)
      if (wordBoundary && end > i + 1 && !isSpace(text[i + 1]) && !isSpace(text[end - 1])) {
        flush()
        out.push({ kind: "em", children: parseInline(text.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }

    // Lien nu : une URL collée sans markdown reste cliquable.
    if (char === "h" && (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1] ?? ""))) {
      const match = AUTOLINK.exec(text.slice(i))
      if (match) {
        flush()
        // La ponctuation finale fait partie de la phrase, pas de l'adresse.
        const url = match[0].replace(/[.,;:!?]+$/, "")
        out.push({ kind: "link", href: url, children: [{ kind: "text", text: url }] })
        i += url.length
        continue
      }
    }

    buffer += char
    i += 1
  }

  flush()
  return out
}

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const UL = /^(\s*)([-*+])\s+(.*)$/
const OL = /^(\s*)(\d+)[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** Découpe une ligne de tableau en cellules, en ignorant les filets de bord. */
function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

function parseTableRow(line: string): MdInline[][] {
  return tableCells(line).map((cell) => parseInline(cell))
}

function parseAlign(line: string): Array<"left" | "center" | "right"> {
  return tableCells(line).map((cell) => {
    const left = cell.startsWith(":")
    const right = cell.endsWith(":")
    if (left && right) return "center"
    if (right) return "right"
    return "left"
  })
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (line.trim() === "") {
      i += 1
      continue
    }

    // Code clôturé : tout est littéral jusqu'à la clôture.
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]!
      const lang = fence[2] || undefined
      const body: string[] = []
      i += 1
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i]!)) {
        body.push(lines[i]!)
        i += 1
      }
      i += 1 // la clôture, ou la fin
      blocks.push({ kind: "code", lang, text: body.join("\n") })
      continue
    }

    if (RULE.test(line) && !UL.test(line)) {
      blocks.push({ kind: "rule" })
      i += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(heading[1]!.length, 4) as 1 | 2 | 3 | 4
      blocks.push({ kind: "heading", level, children: parseInline(heading[2]!.trim()) })
      i += 1
      continue
    }

    // Tableau : une ligne à filets, puis la ligne de séparation.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) {
      const header = parseTableRow(line)
      const align = parseAlign(lines[i + 1]!)
      const rows: MdInline[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") {
        rows.push(parseTableRow(lines[i]!))
        i += 1
      }
      blocks.push({ kind: "table", header, align, rows })
      continue
    }

    if (QUOTE.test(line)) {
      const collected: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        collected.push(QUOTE.exec(lines[i]!)![1]!)
        i += 1
      }
      blocks.push({ kind: "quote", children: parseInline(collected.join(" ").trim()) })
      continue
    }

    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line)
      const items: MdListItem[] = []
      let current: MdListItem | undefined
      while (i < lines.length) {
        const match = (ordered ? OL : UL).exec(lines[i]!)
        if (match) {
          const indent = match[1]!.length
          const content = match[3]!
          // Une indentation sous l'élément précédent = une sous-liste (un seul niveau).
          if (indent >= 2 && current) {
            const sub = (ordered ? OL : UL).exec(lines[i]!)
            if (sub) {
              current.sub = { kind: "list", ordered, items: [{ children: parseInline(sub[3]!) }] }
              i += 1
              continue
            }
          }
          current = { children: parseInline(content) }
          items.push(current)
          i += 1
          continue
        }
        // Une ligne non vide, non indentée, après une liste : la liste est finie.
        break
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }

    // Paragraphe : jusqu'à une ligne vide ou le début d'un autre bloc.
    const paragraph: string[] = []
    while (i < lines.length) {
      const candidate = lines[i]!
      if (
        candidate.trim() === "" ||
        FENCE.test(candidate) ||
        HEADING.test(candidate) ||
        RULE.test(candidate) ||
        QUOTE.test(candidate) ||
        UL.test(candidate) ||
        OL.test(candidate)
      ) {
        break
      }
      paragraph.push(candidate.trim())
      i += 1
    }
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) })
  }

  return blocks
}

/**
 * Une destination de lien acceptable — ou rien.
 *
 * Le markdown vient d'un modèle : `[clique](javascript:…)` produirait un `href` **exécutable**, et
 * `data:text/html` une page injectée. Un lien dont le schéma n'est pas reconnu n'est donc pas rendu
 * comme lien — on garde son libellé, on jette la destination. Un lien qui ne mène nulle part vaut
 * mieux qu'un lien qui exécute quelque chose.
 *
 * Les adresses **relatives** (sans schéma) restent acceptées : elles sont locales par nature.
 * `data:image/…` n'est accepté que pour une **image**, où c'est le cas normal d'une pièce jointe.
 */
export function safeHref(href: string, allowDataImage = false): string | undefined {
  const trimmed = href.trim()
  if (trimmed.length === 0) return undefined
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  if (!scheme) return trimmed
  const name = scheme[1]!.toLowerCase()
  if (name === "http" || name === "https" || name === "mailto") return trimmed
  if (allowDataImage && name === "data" && /^data:image\//i.test(trimmed)) return trimmed
  return undefined
}
