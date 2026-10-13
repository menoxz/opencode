import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import {
  Boundary,
  CopyButton,
  PatchLine,
  PermissionSheet,
  Prose,
  QuestionSheet,
  Reasoning,
  REPLY_LABEL,
  StepBlock,
  ToolLine,
} from "./components"
import type { PermissionRequest, QuestionAnswers, QuestionRequest, ToolState } from "./view-model"

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
    expect(html).not.toContain("completed")
    dispose()
  })

  test("un outil en cours écrit son état", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={running} open={false} onToggle={() => {}} />)
    expect(html).toContain("running")
    dispose()
  })

  test("un outil en erreur porte le libellé d'erreur", () => {
    const { html, dispose } = mount(() => <ToolLine tool="read" state={failed} open={false} onToggle={() => {}} />)
    expect(html).toContain("error")
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
    expect(html).toContain("Allow once")
    expect(html).toContain("Always allow")
    expect(html).toContain("Reject")
    dispose()
  })

  test("sans motif proposé, le bouton « toujours » n'existe pas", () => {
    const { html, dispose } = mount(() => <PermissionSheet request={request()} onReply={() => {}} />)
    expect(html).not.toContain("Always allow")
    expect(html).toContain("Reject")
    dispose()
  })

  test("chaque bouton renvoie la bonne réponse", () => {
    const onReply = vi.fn()
    const { container, dispose } = mount(() => <PermissionSheet request={request(["*"])} onReply={onReply} />)
    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((b) => b.textContent)).toEqual(["Allow once", "Always allow", "Reject"])
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
    const reject = buttons.find((b) => b.textContent === "Reject")
    const allow = buttons.find((b) => b.textContent === "Allow once")
    expect(reject?.className).toBe("ghost bordered")
    expect(allow?.className).toBe("primary")
    dispose()
  })

  test("les libellés viennent d'une seule source", () => {
    expect(REPLY_LABEL.once).toBe("Allow once")
    expect(REPLY_LABEL.always).toBe("Always allow")
    expect(REPLY_LABEL.reject).toBe("Reject")
  })
})

describe("Reasoning", () => {
  test("repliée, le texte n'est pas rendu et l'affordance est visible", () => {
    const { html, dispose } = mount(() => <Reasoning text="je pèse les options" open={false} onToggle={() => {}} />)
    expect(html).toContain("thinking")
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
    expect(container.textContent).toContain("thinking")
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

describe("ToolLine — ce que la ligne porte", () => {
  const diffed: ToolState = {
    status: "completed",
    input: {},
    output: "a\nb",
    title: "src/app.tsx",
    time: { start: 1, end: 2 },
    metadata: { filediff: { file: "src/app.tsx", additions: 12, deletions: 3 } },
  }

  test("une écriture annonce ses ±lignes, lues dans metadata.filediff", () => {
    const { container, dispose } = mount(() => <ToolLine tool="edit" state={diffed} open={false} onToggle={() => {}} />)
    expect(container.textContent).toContain("+12 −3")
    dispose()
  })

  test("une sortie longue est bornée, et le reste se révèle au clic", () => {
    const long: ToolState = {
      ...diffed,
      output: Array.from({ length: 30 }, (_, index) => `l${index}`).join("\n"),
      metadata: {},
    }
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={long} open onToggle={() => {}} />)
    expect(container.querySelector("pre.out")?.textContent?.split("\n")).toHaveLength(12)
    expect(container.querySelector(".tool-reveal")?.textContent).toBe("show 18 more lines")
    dispose()
  })

  test("une sortie courte n'annonce aucun volume et ne propose rien à révéler", () => {
    // §3.8 : le volume ne vit jamais seul sur la ligne — il n'existe que s'il y a à révéler.
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={diffed} open onToggle={() => {}} />)
    expect(container.querySelector(".tool-reveal")).toBeNull()
    expect(container.querySelector(".tool-size")).toBeNull()
    dispose()
  })
})

describe("Prose", () => {
  test("la prose de l'agent se lit sans étiquette", () => {
    const { html, container, dispose } = mount(() => <Prose text="La suite est en place." />)
    expect(html).toContain("La suite est en place.")
    expect(container.querySelector(".prose-tagged")).toBeNull()
    dispose()
  })

  test("un texte injecté ne se présente pas comme une réponse", () => {
    const { container, dispose } = mount(() => <Prose text="<instructions>" synthetic />)
    expect(container.textContent).toContain("injected")
    expect(container.querySelector(".prose.tagged")).not.toBeNull()
    dispose()
  })

  test("un texte ignoré le dit aussi", () => {
    const { container, dispose } = mount(() => <Prose text="x" ignored />)
    expect(container.textContent).toContain("not sent")
    dispose()
  })
})

describe("PatchLine", () => {
  test("replié, il compte les fichiers sans les montrer", () => {
    const { html, container, dispose } = mount(() => (
      <PatchLine files={["a.ts", "b.ts"]} open={false} onToggle={() => {}} />
    ))
    expect(container.textContent).toContain("2 files")
    expect(html).not.toContain("a.ts")
    dispose()
  })

  test("déplié, il nomme chaque fichier par sa fin", () => {
    const { container, dispose } = mount(() => (
      <PatchLine files={["C:\\jeanluc\\opencode-fork\\packages\\webui\\src\\styles.css"]} open onToggle={() => {}} />
    ))
    expect(container.textContent).toContain("webui/src/styles.css")
    dispose()
  })

  test("il borne la liste et annonce ce qui reste", () => {
    const many = Array.from({ length: 12 }, (_, index) => `p/f${index}.ts`)
    const { container, dispose } = mount(() => <PatchLine files={many} open onToggle={() => {}} />)
    // 8 chemins + la ligne du bouton.
    expect(container.querySelectorAll(".patch-files li")).toHaveLength(9)
    expect(container.textContent).toContain("show 4 more files")
    dispose()
  })
})

describe("Boundary", () => {
  test("une borne porte son libellé", () => {
    const { container, dispose } = mount(() => <Boundary label="context compacted" />)
    expect(container.textContent).toContain("context compacted")
    dispose()
  })
})

describe("StepBlock", () => {
  const step = { index: 3, items: [], actions: 12, cost: 0.1234, tokens: 31_000, durationMs: 8400 }

  test("la ligne d'étape porte son prix en entier", () => {
    const { container, dispose } = mount(() => <StepBlock step={step} open onToggle={() => {}} />)
    expect(container.textContent).toContain("step 3")
    expect(container.textContent).toContain("12 actions")
    expect(container.textContent).toContain("8.4s")
    expect(container.textContent).toContain("$0.123")
    expect(container.textContent).toContain("31k tokens")
    dispose()
  })

  test("la prose de l'étape n'est jamais repliée", () => {
    const { container, dispose } = mount(() => (
      <StepBlock step={step} open onToggle={() => {}}>
        <Prose text="La suite est en place." />
      </StepBlock>
    ))
    expect(container.textContent).toContain("La suite est en place.")
    dispose()
  })

  test("le clic demande le repli du travail", () => {
    const onToggle = vi.fn()
    const { container, dispose } = mount(() => <StepBlock step={step} open={false} onToggle={onToggle} />)
    container.querySelector("button")?.click()
    expect(onToggle).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe("QuestionSheet — la seule écriture du fil", () => {
  const request = (custom?: boolean, multiple?: boolean): QuestionRequest => ({
    id: "q1",
    sessionID: "ses_1",
    questions: [
      {
        header: "Colour",
        question: "Which colour should the header be?",
        options: [
          { label: "Blue", description: "The calm one" },
          { label: "Red", description: "The loud one" },
        ],
        ...(custom === undefined ? {} : { custom }),
        ...(multiple === undefined ? {} : { multiple }),
      },
    ],
  })

  const empty: QuestionAnswers = [[]]

  const render1 = (props: Partial<Parameters<typeof QuestionSheet>[0]> = {}) =>
    mount(() => (
      <QuestionSheet
        request={request()}
        answers={empty}
        onToggle={() => {}}
        onCustom={() => {}}
        onSubmit={() => {}}
        onReject={() => {}}
        {...props}
      />
    ))

  test("la question, son en-tête et ses options se lisent", () => {
    const { container, dispose } = render1()
    expect(container.textContent).toContain("Colour")
    expect(container.textContent).toContain("Which colour should the header be?")
    expect(container.textContent).toContain("Blue")
    expect(container.textContent).toContain("The loud one")
    dispose()
  })

  test("répondre reste impossible tant que rien n'est répondu", () => {
    // Une réponse partielle laisserait l'agent bloqué : le bouton ne doit pas le permettre.
    const { container, dispose } = render1()
    const submit = container.querySelector(".question-actions .primary") as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    dispose()
  })

  test("une fois répondu, le bouton s'ouvre", () => {
    const { container, dispose } = render1({ answers: [["Blue"]] })
    const submit = container.querySelector(".question-actions .primary") as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    dispose()
  })

  test("le clic sur une option porte son index, son libellé et le mode de choix", () => {
    const onToggle = vi.fn()
    const { container, dispose } = render1({ onToggle, request: request(undefined, true) })
    const options = Array.from(container.querySelectorAll<HTMLButtonElement>(".question-option"))
    expect(options).toHaveLength(2)
    options[1]?.click()
    expect(onToggle).toHaveBeenCalledWith(0, "Red", true)
    dispose()
  })

  test("l'option retenue est marquée", () => {
    const { container, dispose } = render1({ answers: [["Blue"]] })
    const picked = container.querySelectorAll(".question-option.picked")
    expect(picked).toHaveLength(1)
    expect(picked[0]?.textContent).toContain("Blue")
    dispose()
  })

  test("le champ libre existe par défaut, et disparaît si le serveur l'interdit", () => {
    // `custom` vaut `true` par défaut côté serveur : seul un `false` explicite le retire.
    expect(render1().container.querySelector(".question-custom")).not.toBeNull()
    expect(render1({ request: request(false) }).container.querySelector(".question-custom")).toBeNull()
  })

  test("taper une réponse libre la remonte", () => {
    const onCustom = vi.fn()
    const { container, dispose } = render1({ onCustom })
    const input = container.querySelector(".question-custom") as HTMLInputElement
    input.value = "Green"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(onCustom).toHaveBeenCalledWith(0, "Green")
    dispose()
  })

  test("le champ libre affiche la réponse libre déjà saisie", () => {
    const { container, dispose } = render1({ answers: [["Green"]] })
    const input = container.querySelector(".question-custom") as HTMLInputElement
    expect(input.value).toBe("Green")
    dispose()
  })

  test("Dismiss demande le rejet", () => {
    const onReject = vi.fn()
    const { container, dispose } = render1({ onReject })
    const dismiss = Array.from(container.querySelectorAll<HTMLButtonElement>(".question-actions button")).find(
      (button) => button.textContent === "Dismiss",
    )
    dismiss?.click()
    expect(onReject).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe("CopyButton — copier, et dire quand ça échoue", () => {
  /** jsdom n'implémente pas le presse-papiers : on installe celui qu'on veut tester. */
  const withClipboard = (writeText: () => Promise<void>) => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  }

  test("copie le texte et le confirme", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    withClipboard(writeText)
    const { container, dispose } = mount(() => <CopyButton text="git status --short" label="Copy command" />)
    expect(container.textContent).toBe("copy")
    container.querySelector<HTMLButtonElement>("button")?.click()
    await vi.waitFor(() => expect(container.textContent).toBe("copied"))
    expect(writeText).toHaveBeenCalledWith("git status --short")
    dispose()
  })

  test("un échec se dit, il ne fait pas croire que c'est copié", async () => {
    // Un bouton « copier » qui ne copie pas en silence est pire que pas de bouton.
    withClipboard(() => Promise.reject(new Error("denied")))
    const { container, dispose } = mount(() => <CopyButton text="x" />)
    container.querySelector<HTMLButtonElement>("button")?.click()
    await vi.waitFor(() => expect(container.textContent).toBe("failed"))
    expect(container.querySelector(".copy.failed")).not.toBeNull()
    dispose()
  })

  test("le libellé d'infobulle dit ce qu'on copie", () => {
    const { container, dispose } = mount(() => <CopyButton text="a.ts" label="Copy path" />)
    expect(container.querySelector("button")?.getAttribute("title")).toBe("Copy path")
    dispose()
  })
})

describe("ce que le fil donne à copier", () => {
  test("le détail d'un outil propose de copier sa commande et sa sortie", () => {
    const state: ToolState = {
      status: "completed",
      input: { command: "git status --short" },
      output: "ligne 1\nligne 2",
      title: "Git status",
      time: { start: 1, end: 2 },
    }
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={state} open onToggle={() => {}} />)
    const labels = Array.from(container.querySelectorAll(".copy")).map((b) => b.getAttribute("title"))
    expect(labels).toContain("Copy command")
    expect(labels).toContain("Copy output")
    dispose()
  })

  test("un outil sans valeur copiable n'en propose aucun", () => {
    // `turn_plan` n'a ni commande ni chemin : proposer « copier » n'aurait rien à copier.
    const state: ToolState = {
      status: "completed",
      input: {},
      output: "",
      title: "Engagement declared",
      time: { start: 1, end: 2 },
    }
    const { container, dispose } = mount(() => <ToolLine tool="turn_plan" state={state} open onToggle={() => {}} />)
    expect(container.querySelectorAll(".copy")).toHaveLength(0)
    dispose()
  })

  test("un patch propose de copier chaque chemin", () => {
    const { container, dispose } = mount(() => (
      <PatchLine files={["a/b/c.ts", "d/e/f.ts"]} open onToggle={() => {}} />
    ))
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".copy"))
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.getAttribute("title")).toBe("Copy path")
    expect(buttons[0]?.parentElement?.textContent).toContain("c.ts")
    dispose()
  })
})
