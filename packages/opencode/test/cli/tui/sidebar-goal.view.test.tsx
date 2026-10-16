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

function section(props: { dod?: number; outOfScope?: number; onEdit?: () => void } = {}) {
  return (
    <TaskContractSection
      color="#ffffff"
      muted="#888888"
      hoverBackground="#222222"
      dod={props.dod ?? 2}
      outOfScope={props.outOfScope ?? 1}
      onEdit={props.onEdit ?? (() => {})}
    />
  )
}

/**
 * La barre latérale ne porte qu'un bouton **et son statut** : des comptes, jamais le contenu.
 * Le contrat lui-même (objectif, critères, hors périmètre) n'existe que dans le panneau
 * d'édition.
 */
test("the task contract is one button with its status, and none of its content", async () => {
  const app = await testRender(() => section(), { width: 40, height: 20 })
  renderers.push(app.renderer)
  await app.renderOnce()

  const frame = app.captureCharFrame()
  const lines = frame.split("\n").filter((line) => line.trim())
  expect(lines).toHaveLength(1)
  expect(lines[0]).toContain("Goal definition")
  expect(lines[0]).toContain("DOD(2) OOS(1)")
  expect(lines[0]).not.toContain("✎")
  for (const absent of ["Obj:", "Details", "First acceptance criterion"]) {
    expect(frame).not.toContain(absent)
  }
})

test("an empty contract still shows its counts, at zero", async () => {
  const app = await testRender(() => section({ dod: 0, outOfScope: 0 }), { width: 40, height: 20 })
  renderers.push(app.renderer)
  await app.renderOnce()

  expect(app.captureCharFrame()).toContain("DOD(0) OOS(0)")
})

/**
 * Un clic = une ouverture. Le gestionnaire est branché sur le relâchement, donc un clic ne
 * peut pas déclencher deux fois : le test clique et compte.
 */
test("a click on the button asks for the editor, once per click", async () => {
  let opened = 0
  const app = await testRender(() => section({ onEdit: () => (opened += 1) }), { width: 40, height: 20 })
  renderers.push(app.renderer)
  await app.renderOnce()

  await app.mockMouse.click(1, 0)
  await app.renderOnce()
  expect(opened).toBe(1)
  await app.mockMouse.click(1, 0)
  await app.renderOnce()
  expect(opened).toBe(2)

  // Le bouton est focusable : c'est ce qui le rend atteignable au clavier.
  expect(goalButton(app.renderer).focusable).toBe(true)
})
