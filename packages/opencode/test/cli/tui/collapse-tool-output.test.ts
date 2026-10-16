import { expect, test } from "bun:test"
import { collapseToolOutputTail } from "@/cli/cmd/tui/util/collapse-tool-output"

/**
 * Le début d'une sortie de commande est du bruit d'installation : ce qui décide — le
 * verdict, l'erreur, le total — est dans les dernières lignes. Le repère `…` passe donc
 * devant, et il ne vit jamais seul.
 */
test("a short output is returned untouched", () => {
  const output = "ligne 1\nligne 2"
  expect(collapseToolOutputTail(output, 5, 500)).toEqual({ output, overflow: false })
})

test("an overflowing output keeps its last lines, marked with a leading ellipsis", () => {
  const output = Array.from({ length: 12 }, (_, index) => `ligne ${index + 1}`).join("\n")
  const collapsed = collapseToolOutputTail(output, 5, 500)
  expect(collapsed.overflow).toBe(true)
  expect(collapsed.output.startsWith("…\n")).toBe(true)
  expect(collapsed.output).toContain("ligne 12")
  expect(collapsed.output).toContain("ligne 8")
  expect(collapsed.output).not.toContain("ligne 7")
  expect(collapsed.output).not.toContain("ligne 1\n")
})

test("a too wide tail is clipped from the left, keeping the ellipsis in front", () => {
  const collapsed = collapseToolOutputTail("x".repeat(40), 5, 10)
  expect(collapsed.overflow).toBe(true)
  expect(collapsed.output.startsWith("…")).toBe(true)
  expect(Array.from(collapsed.output).length).toBe(10)
})
