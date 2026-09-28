/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { isRenderable, type Renderable } from "@opentui/core"
import { TaskContractSection } from "@/cli/cmd/tui/feature-plugins/sidebar/goal"

const renderers: Awaited<ReturnType<typeof testRender>>["renderer"][] = []
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.destroy()
})

function focusDetailsControl(renderer: Awaited<ReturnType<typeof testRender>>["renderer"]) {
  const visit = (node: Renderable): Renderable | undefined => {
    if (node.id === "task-contract-details-toggle") return node
    for (const child of node.getChildren()) {
      if (!isRenderable(child)) continue
      const result = visit(child)
      if (result) return result
    }
  }
  const control = visit(renderer.root)
  if (!control) throw new Error("expected a focusable details control")
  control.focus()
}

test("task contract keeps objective visible and details collapsed by default", async () => {
  const app = await testRender(
    () => (
      <TaskContractSection
        goal="Keep the primary objective visible"
        dod={["First acceptance criterion", "Second acceptance criterion"]}
        outOfScope={["Unrelated redesign"]}
        color="#ffffff"
        muted="#888888"
        warning="#ffaa00"
      />
    ),
    { width: 40, height: 20 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  const collapsed = app.captureCharFrame()
  expect(collapsed).toContain("TASK CONTRACT")
  expect(collapsed).toContain("Obj:")
  expect(collapsed).toContain("Keep the primary objective visible")
  expect(collapsed).toContain("▶ Details (DoD 2 · OOS 1)")
  expect(collapsed).not.toContain("First acceptance criterion")
  expect(collapsed).not.toContain("Unrelated redesign")

  focusDetailsControl(app.renderer)
  app.mockInput.pressEnter()
  await app.renderOnce()
  const expanded = app.captureCharFrame()
  expect(expanded).toContain("▼ Details (DoD 2 · OOS 1)")
  expect(expanded).toContain("DoD(2)")
  expect(expanded).toContain("First acceptance criterion")
  expect(expanded).toContain("Second acceptance criterion")
  expect(expanded).toContain("OOS(1)")
  expect(expanded).toContain("Unrelated redesign")
})

test("task contract details toggle with a mouse click", async () => {
  const app = await testRender(
    () => (
      <TaskContractSection
        goal="Mouse accessible objective"
        dod={["Mouse-visible detail"]}
        outOfScope={[]}
        color="#ffffff"
        muted="#888888"
        warning="#ffaa00"
      />
    ),
    { width: 40, height: 14 },
  )
  renderers.push(app.renderer)
  await app.renderOnce()
  expect(app.captureCharFrame()).not.toContain("Mouse-visible detail")

  await app.mockMouse.click(1, 3)
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("Mouse-visible detail")
})

test("a wrapped criterion hangs under its own text and stays inside the column", async () => {
  const long =
    "Une contrainte assez longue pour dépasser la largeur de la colonne et devoir se replier sur une seconde ligne"
  const app = await testRender(
    () => (
      <TaskContractSection
        goal="Objectif court"
        dod={[long]}
        outOfScope={[long]}
        color="#ffffff"
        muted="#888888"
        warning="#ffaa00"
      />
    ),
    { width: 40, height: 24 },
  )
  renderers.push(app.renderer)
  focusDetailsControl(app.renderer)
  app.mockInput.pressEnter()
  await app.renderOnce()

  const lines = app.captureCharFrame().split("\n")
  const index = lines.findIndex((line) => line.includes("•"))
  expect(index).toBeGreaterThan(-1)
  // The bullet is indented and separated from the first word by a space.
  expect(lines[index]!.startsWith("  • ")).toBe(true)
  // The continuation line hangs under the text, indented past the bullet column, and carries no bullet.
  expect(lines[index + 1]!.startsWith("  ")).toBe(true)
  expect(lines[index + 1]!.startsWith("  • ")).toBe(false)
  // No line runs past the column the sidebar gave the section.
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(40)
})
