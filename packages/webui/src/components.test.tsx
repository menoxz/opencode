import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import { PermissionSheet, Reasoning, REPLY_LABEL, ToolLine } from "./components"
import type { PermissionRequest, ToolState } from "./view-model"

/** Monte un composant dans un conteneur neuf et renvoie le HTML produit. */
function mount(component: () => unknown): { html: string; container: HTMLElement; dispose: () => void } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(component as never, container)
  return { html: container.innerHTML, container, dispose }
}

const completed: ToolState = {
  status: "completed",
  input: { command: "ls -la" },
  output: "src\npackage.json",
  title: "Lecture du dossier",
  time: { start: 1, end: 2 },
}

const failed: ToolState = { status: "error", input: { command: "cat absent" }, error: "introuvable", time: { start: 1, end: 2 } }
const running: ToolState = { status: "running", input: { command: "ls" }, title: "En cours", time: { start: 1 } }

const request = (always: string[] = []): PermissionRequest => ({
  id: "per_1",
  sessionID: "ses_1",
  permission: "read",
  patterns: ["packages\\webui\\tmp-perm-test.env"],
  always,
  metadata: {},
})

describe("ToolLine", () => {
  test("affiche le nom de l'outil et son titre", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={completed} open={false} onToggle={() => {}} />)
    expect(html).toContain("read")
    expect(html).toContain("Lecture du dossier")
    dispose()
  })

  test("un outil terminé se tait : aucun libellé d'état", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={completed} open={false} onToggle={() => {}} />)
    expect(html).not.toContain("terminé")
    dispose()
  })

  test("un outil en cours écrit son état", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={running} open={false} onToggle={() => {}} />)
    expect(html).toContain("en cours")
    dispose()
  })

  test("un outil en erreur porte le libellé d'erreur", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={failed} open={false} onToggle={() => {}} />)
    expect(html).toContain("erreur")
    dispose()
  })

  test("replié, le détail n'est pas rendu", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={completed} open={false} onToggle={() => {}} />)
    expect(html).not.toContain("src\npackage.json")
    expect(html).toContain("▸")
    dispose()
  })

  test("déplié, il expose l'entrée et la sortie", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={completed} open={true} onToggle={() => {}} />)
    expect(html).toContain("ls -la")
    expect(html).toContain("package.json")
    expect(html).toContain("▾")
    dispose()
  })

  test("déplié, une erreur expose le message et non une sortie", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={failed} open={true} onToggle={() => {}} />)
    expect(html).toContain("introuvable")
    expect(html).toContain('class="err"')
    expect(html).not.toContain('class="out"')
    dispose()
  })

  test("le clic sur la ligne demande le basculement", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => <ToolLine tool="read" state={running} open={false} onToggle={onToggle} />)
    const button = container.querySelector("button")
    expect(button).not.toBeNull()
    button?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()
  })

  test("seule une erreur porte la classe d'échec, pour que le style suive", () => {
    const bad = mount(() => <ToolLine tool="read" state={failed} open={false} onToggle={() => {}} />)
    expect(bad.container.querySelector(".tool.failed")).not.toBeNull()
    bad.dispose()

    const ok = mount(() => <ToolLine tool="read" state={running} open={false} onToggle={() => {}} />)
    expect(ok.container.querySelector(".tool.failed")).toBeNull()
    ok.dispose()
  })
})

describe("PermissionSheet", () => {
  test("affiche la permission, le motif et les boutons", () => {
    const { html, dispose } = mount(() => <PermissionSheet request={request(["*"])} onReply={() => {}} />)
    expect(html).toContain("read")
    expect(html).toContain("tmp-perm-test.env")
    expect(html).toContain("Autoriser une fois")
    expect(html).toContain("Toujours autoriser")
    expect(html).toContain("Refuser")
    dispose()
  })

  test("sans motif proposé, le bouton « toujours » n'existe pas", () => {
    const { html, dispose } = mount(() => <PermissionSheet request={request()} onReply={() => {}} />)
    expect(html).not.toContain("Toujours autoriser")
    expect(html).toContain("Refuser")
    dispose()
  })

  test("chaque bouton renvoie la bonne réponse", () => {
    const onReply = vi.fn()
    const { container, dispose } = mount(() => <PermissionSheet request={request(["*"])} onReply={onReply} />)
    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((b) => b.textContent)).toEqual(["Autoriser une fois", "Toujours autoriser", "Refuser"])
    buttons[2]?.click()
    expect(onReply).toHaveBeenCalledWith("reject")
    buttons[1]?.click()
    expect(onReply).toHaveBeenCalledWith("always")
    buttons[0]?.click()
    expect(onReply).toHaveBeenCalledWith("once")
    dispose()
  })

  test("le refus n'est pas l'action mise en avant", () => {
    const { container, dispose } = mount(() => <PermissionSheet request={request()} onReply={() => {}} />)
    const buttons = Array.from(container.querySelectorAll("button"))
    const reject = buttons.find((b) => b.textContent === "Refuser")
    const allow = buttons.find((b) => b.textContent === "Autoriser une fois")
    expect(reject?.className).toBe("ghost bordered")
    expect(allow?.className).toBe("primary")
    dispose()
  })

  test("les libellés viennent d'une seule source", () => {
    expect(REPLY_LABEL.once).toBe("Autoriser une fois")
    expect(REPLY_LABEL.always).toBe("Toujours autoriser")
    expect(REPLY_LABEL.reject).toBe("Refuser")
  })
})

describe("Reasoning", () => {
  test("repliée, le texte n'est pas rendu et l'affordance est visible", () => {
    const { html, dispose } = mount(() => <Reasoning text="je pèse les options" open={false} onToggle={() => {}} />)
    expect(html).toContain("réflexion")
    expect(html).not.toContain("je pèse les options")
    expect(html).toContain("▸")
    dispose()
  })

  test("dépliée, elle expose son texte", () => {
    const { html, dispose } = mount(() => <Reasoning text="je pèse les options" open={true} onToggle={() => {}} />)
    expect(html).toContain("je pèse les options")
    expect(html).toContain("▾")
    dispose()
  })

  test("le nom de type n'apparaît jamais à l'écran", () => {
    // Assertion sur le texte visible, pas sur le HTML : la classe s'appelle légitimement
    // `reasoning`, c'est le mot à l'écran qui ne doit pas exister.
    const { container, dispose } = mount(() => <Reasoning text="x" open={false} onToggle={() => {}} />)
    expect(container.textContent).toContain("réflexion")
    expect(container.textContent).not.toContain("reasoning")
    dispose()
  })

  test("le clic demande le basculement", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => <Reasoning text="x" open={false} onToggle={onToggle} />)
    container.querySelector("button")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()
  })
})
