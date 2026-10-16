/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { TaskContractSection } from "@/cli/cmd/tui/feature-plugins/sidebar/goal"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

function goalButton(renderer: Awaited<ReturnType<typeof testRender>>["renderer"]) {
  const visit = (node: Renderable): Renderable | undefined => {
    if (node.id === "task-contract-edit") return node
    for (const child of node.getChildren()) {
      if (!isRenderable(child)) continue
      const result = visit(child)
      if (result) return result
    }
  }
  const control = visit(renderer.root)
  if (!control) throw new Error("expected a focusable goal button")
  return control
}

/**
 * Le contrat n'est plus montré dans la barre latérale : elle ne porte qu'un bouton, et son
 * contenu vit dans le panneau d'édition. Ce test tient la promesse « seulement un bouton » :
 * rien de l'objectif, du DoD, du hors périmètre ni des compteurs ne doit apparaître ici.
 */
test("the task contract is one button, with none of its content in the sidebar", async () => {
  const app = await testRender(() => <TaskContractSection color="#ffffff" onEdit={() => {}} />, {
    width: 40,
    height: 20,
  })
  renderers.push(app.renderer)
  await app.renderOnce()

  const frame = app.captureCharFrame()
  const lines = frame.split("\n").filter((line) => line.trim())
  expect(lines).toHaveLength(1)
  expect(lines[0]).toContain("Goal definition")
  expect(lines[0]).not.toContain("✎")
  for (const absent of ["Obj", "DoD", "OOS", "Details"]) {
    expect(frame).not.toContain(absent)
  }
})

test("a click on the button asks for the editor", async () => {
  let opened = 0
  const app = await testRender(() => <TaskContractSection color="#ffffff" onEdit={() => (opened += 1)} />, {
    width: 40,
    height: 20,
  })
  renderers.push(app.renderer)
  await app.renderOnce()

  // Le bouton occupe la première ligne : un clic souris dessus doit atteindre le gestionnaire,
  // et une seconde fois encore (pas un simple « premier clic »).
  await app.mockMouse.click(1, 0)
  await app.renderOnce()
  expect(opened).toBe(1)
  await app.mockMouse.click(1, 0)
  await app.renderOnce()
  expect(opened).toBe(2)

  // Le bouton est focusable : c'est ce qui le rend atteignable au clavier.
  expect(goalButton(app.renderer).focusable).toBe(true)
})
