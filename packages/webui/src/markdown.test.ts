import { describe, expect, test } from "vitest"
import { parseMarkdown, safeHref, type MdBlock, type MdInline } from "./markdown"

/** Raccourci : le markdown d'un seul paragraphe, pour tester l'en ligne sans bruit. */
const inline = (text: string): MdInline[] => {
  const blocks = parseMarkdown(text)
  const first = blocks[0]
  if (first?.kind !== "paragraph") throw new Error(`attendu un paragraphe, reçu ${first?.kind}`)
  return first.children
}

const kinds = (nodes: MdInline[]) => nodes.map((node) => node.kind)

describe("markdown — blocs", () => {
  test("un titre porte son niveau, borné à 4", () => {
    const blocks = parseMarkdown("# un\n\n### trois\n\n###### six")
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "heading", "heading"])
    expect((blocks[0] as Extract<MdBlock, { kind: "heading" }>).level).toBe(1)
    expect((blocks[1] as Extract<MdBlock, { kind: "heading" }>).level).toBe(3)
    // Au-delà de 4, la hiérarchie ne se lit plus : on borne au lieu d'inventer des niveaux.
    expect((blocks[2] as Extract<MdBlock, { kind: "heading" }>).level).toBe(4)
  })

  test("un paragraphe joint ses lignes, un blanc le termine", () => {
    const blocks = parseMarkdown("une ligne\net une autre\n\nsecond paragraphe")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.kind).toBe("paragraph")
    const first = (blocks[0] as Extract<MdBlock, { kind: "paragraph" }>).children[0]
    expect(first).toEqual({ kind: "text", text: "une ligne et une autre" })
  })

  test("un bloc de code retient sa langue et garde son contenu littéral", () => {
    const blocks = parseMarkdown("```ts\nconst a = **pas du gras**\n```")
    expect(blocks).toHaveLength(1)
    const code = blocks[0] as Extract<MdBlock, { kind: "code" }>
    expect(code.lang).toBe("ts")
    // Le contenu d'un bloc de code n'est jamais interprété : c'est le cas qui casserait tout.
    expect(code.text).toBe("const a = **pas du gras**")
  })

  test("une liste non ordonnée, puis ordonnée", () => {
    const blocks = parseMarkdown("- un\n- deux")
    const list = blocks[0] as Extract<MdBlock, { kind: "list" }>
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(2)

    const ordered = parseMarkdown("1. premier\n2. second")[0] as Extract<MdBlock, { kind: "list" }>
    expect(ordered.ordered).toBe(true)
    expect(ordered.items).toHaveLength(2)
  })

  test("une sous-liste se rattache à son élément", () => {
    const list = parseMarkdown("- a\n- b\n  - b1")[0] as Extract<MdBlock, { kind: "list" }>
    expect(list.items).toHaveLength(2)
    expect(list.items[0]!.sub).toBeUndefined()
    expect(list.items[1]!.sub?.kind).toBe("list")
  })

  test("une citation, et un filet", () => {
    const blocks = parseMarkdown("> une remarque\n\n---")
    expect(blocks[0]!.kind).toBe("quote")
    expect(blocks[1]!.kind).toBe("rule")
  })

  test("un tableau retient son en-tête, ses lignes et son alignement", () => {
    const blocks = parseMarkdown("| a | b |\n| :--- | ---: |\n| 1 | 2 |\n| 3 | 4 |")
    const table = blocks[0] as Extract<MdBlock, { kind: "table" }>
    expect(table.header.map((cell) => (cell[0] as { text: string }).text)).toEqual(["a", "b"])
    expect(table.align).toEqual(["left", "right"])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]![0]![0]).toEqual({ kind: "text", text: "3" })
  })

  test("une ligne à filets sans séparation reste un paragraphe", () => {
    // Sinon un simple `a | b` tapé au hasard deviendrait un tableau d'une ligne.
    expect(parseMarkdown("a | b")[0]!.kind).toBe("paragraph")
  })
})

describe("markdown — en ligne", () => {
  test("le code en ligne, le gras et l'italique", () => {
    expect(kinds(inline("`a`"))).toEqual(["code"])
    expect(kinds(inline("**a**"))).toEqual(["strong"])
    expect(kinds(inline("*a*"))).toEqual(["em"])
    expect(kinds(inline("_a_"))).toEqual(["em"])
  })

  test("le gras avant l'italique : `**` n'est pas deux `*`", () => {
    const nodes = inline("**a**")
    expect(nodes[0]!.kind).toBe("strong")
    expect((nodes[0] as Extract<MdInline, { kind: "strong" }>).children).toEqual([{ kind: "text", text: "a" }])
  })

  test("le gras peut contenir du code", () => {
    const strong = inline("**voir `x` ici**")[0] as Extract<MdInline, { kind: "strong" }>
    expect(kinds(strong.children)).toEqual(["text", "code", "text"])
  })

  test("un lien, et une image", () => {
    expect(inline("[texte](https://a.b)")).toEqual([
      { kind: "link", href: "https://a.b", children: [{ kind: "text", text: "texte" }] },
    ])
    expect(inline("![alt](https://a.b/x.png)")).toEqual([
      { kind: "image", src: "https://a.b/x.png", alt: "alt" },
    ])
  })

  test("une URL nue devient un lien, sans sa ponctuation finale", () => {
    expect(inline("voir https://a.b/c.")).toEqual([
      { kind: "text", text: "voir " },
      { kind: "link", href: "https://a.b/c", children: [{ kind: "text", text: "https://a.b/c" }] },
      { kind: "text", text: "." },
    ])
  })

  test("ce qui n'est pas reconnu reste du texte", () => {
    // Un crochet non fermé, un lien sans destination, une étoile isolée : rien n'est inventé.
    expect(kinds(inline("[pas un lien"))).toEqual(["text"])
    expect(kinds(inline("[]("))).toEqual(["text"])
    expect(kinds(inline("2 * 3 * 4"))).toEqual(["text"])
  })

  test("`snake_case_name` n'est pas mis en italique", () => {
    // Le cas qui abîmerait du code ou des identifiants dans une réponse.
    expect(kinds(inline("snake_case_name"))).toEqual(["text"])
    expect(inline("snake_case_name")[0]).toEqual({ kind: "text", text: "snake_case_name" })
  })

  test("un texte accentué et non latin n'est pas touché", () => {
    expect(inline("éàü 中文 🙂")[0]).toEqual({ kind: "text", text: "éàü 中文 🙂" })
  })
})

describe("markdown — la sûreté par construction", () => {
  test("le HTML n'est jamais interprété : il reste du texte", () => {
    // La prose vient d'un modèle : c'est une donnée. Si elle devient du balisage, une réponse suffit
    // à exécuter du script. Ici l'arbre ne peut produire que du texte.
    const nodes = inline("<img src=x onerror=alert(1)>")
    expect(nodes).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)>" }])
  })

  test("un bloc de script dans un paragraphe reste du texte", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>")
    expect(blocks[0]!.kind).toBe("paragraph")
    const children = (blocks[0] as Extract<MdBlock, { kind: "paragraph" }>).children
    expect(children.every((node) => node.kind === "text")).toBe(true)
  })

  test("aucun nœud de l'arbre ne porte de HTML brut", () => {
    const blocks = parseMarkdown(
      "# t\n\n- a\n\n```js\nx\n```\n\n| a |\n| --- |\n| b |\n\n> q\n\n---\n\n**g** *i* `c` [l](u) ![i](s)",
    )
    const seen = new Set<string>()
    const walk = (nodes: MdInline[]) => nodes.forEach((node) => seen.add(node.kind))
    for (const block of blocks) {
      if (block.kind === "paragraph" || block.kind === "heading" || block.kind === "quote") walk(block.children)
      if (block.kind === "list") for (const item of block.items) walk(item.children)
      if (block.kind === "table") {
        for (const cell of block.header) walk(cell)
        for (const row of block.rows) for (const cell of row) walk(cell)
      }
    }
    expect([...seen].sort()).toEqual(["code", "em", "image", "link", "strong", "text"])
  })
})

describe("markdown — la destination d'un lien", () => {
  test("http, https et mailto passent", () => {
    expect(safeHref("https://a.b")).toBe("https://a.b")
    expect(safeHref("http://a.b")).toBe("http://a.b")
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c")
    expect(safeHref("  https://a.b  ")).toBe("https://a.b")
  })

  test("une adresse relative est locale par nature", () => {
    expect(safeHref("/docs/x.md")).toBe("/docs/x.md")
    expect(safeHref("docs/x.md")).toBe("docs/x.md")
    expect(safeHref("#ancre")).toBe("#ancre")
  })

  test("un schéma exécutable est refusé", () => {
    // `[x](javascript:…)` produirait un href exécutable, et `data:text/html` une page injectée.
    expect(safeHref("javascript:alert(1)")).toBeUndefined()
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeUndefined()
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeUndefined()
    expect(safeHref("vbscript:msgbox")).toBeUndefined()
    expect(safeHref("file:///C:/Windows/win.ini")).toBeUndefined()
  })

  test("une image accepte sa data URL, un lien non", () => {
    const image = "data:image/png;base64,iVBORw0KGgo="
    expect(safeHref(image, true)).toBe(image)
    expect(safeHref(image)).toBeUndefined()
    // Même en image, une data URL qui n'est pas une image est refusée.
    expect(safeHref("data:text/html,<b>x</b>", true)).toBeUndefined()
  })

  test("une destination vide ne donne pas de lien", () => {
    expect(safeHref("")).toBeUndefined()
    expect(safeHref("   ")).toBeUndefined()
  })
})
