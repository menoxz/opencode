import { describe, expect, test, vi } from "vitest"
import { render } from "solid-js/web"
import {
  Boundary,
  ComposerMarkup,
  CopyButton,
  Documents,
  Markdown,
  Media,
  PatchLine,
  PermissionSheet,
  Prose,
  QuestionSheet,
  Reasoning,
  REPLY_LABEL,
  SessionPanel,
  StepBlock,
  ToolLine,
  UserPrompt,
} from "./components"
import type { DocumentRef, PermissionRequest, QuestionAnswers, QuestionRequest, ToolState } from "./view-model"

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

describe("StepBlock — plus aucune statistique", () => {
  const step = { index: 3, items: [], actions: 12, cost: 0.1234, tokens: 31_000, durationMs: 8400 }

  test("une étape rend son contenu et rien du registre de la performance", () => {
    // §9.3 : la ligne « step 3 · 6 actions · 2.8s · $0.0008 · 31k tokens » n'est plus dans le fil.
    const { container, dispose } = mount(() => (
      <StepBlock step={step}>
        <Prose text="La suite est en place." />
      </StepBlock>
    ))
    const text = container.textContent ?? ""
    expect(text).toContain("La suite est en place.")
    for (const gone of ["$0.123", "31k", "12 actions", "8.4s", "step 3"]) {
      expect(text).not.toContain(gone)
    }
    dispose()
  })
})

describe("le flux — rien n'est caché, et rien n'est encadré", () => {
  const done: ToolState = {
    status: "completed",
    input: { command: "ls" },
    output: "a\nb",
    title: "List files",
    time: { start: 1, end: 2 },
  }

  test("une ligne d'action porte sa famille en classe, pas en bordure", () => {
    // Verdict d'usage : une bordure par ligne transforme la liste en colonne de bandes. La famille
    // reste dite — par l'icône — donc la classe est là, la bordure non.
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={done} open={false} onToggle={() => {}} />)
    const tool = container.querySelector(".tool")
    expect(tool?.className).toContain("fam-shell")
    expect(container.querySelector(".tool-line")).not.toBeNull()
    dispose()
  })

  test("l'action est visible sans rien déplier : c'est un flux, pas un repli", () => {
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={done} open={false} onToggle={() => {}} />)
    // Le libellé et le titre sont là au repos — l'inverse de la version repliée.
    expect(container.textContent).toContain("bash")
    expect(container.textContent).toContain("List files")
    dispose()
  })

  test("le détail reste accessible en dépliant l'entrée elle-même", () => {
    const { container, dispose } = mount(() => <ToolLine tool="bash" state={done} open onToggle={() => {}} />)
    expect(container.querySelector(".tool-detail")).not.toBeNull()
    expect(container.querySelector(".copy")).not.toBeNull()
    dispose()
  })
})

describe("Markdown — rendu, jamais interprété", () => {
  test("les blocs sortent en balises", () => {
    const { container, dispose } = mount(() => <Markdown text={"# Titre\n\nun paragraphe\n\n- a\n- b"} />)
    expect(container.querySelector("h3")?.textContent).toBe("Titre")
    expect(container.querySelector(".md-p")?.textContent).toBe("un paragraphe")
    expect(container.querySelectorAll(".md-list li")).toHaveLength(2)
    dispose()
  })

  test("le code clôturé garde sa langue et son texte", () => {
    const { container, dispose } = mount(() => <Markdown text={"```ts\nconst a = **x**\n```"} />)
    expect(container.querySelector(".md-lang")?.textContent).toBe("ts")
    expect(container.querySelector(".md-pre")?.textContent).toBe("const a = **x**")
    dispose()
  })

  test("le HTML de la prose n'est jamais interprété", () => {
    // Le cas qui compte : la prose vient d'un modèle, c'est une donnée.
    const { container, dispose } = mount(() => <Markdown text={"<img src=x onerror=alert(1)>\n\n<script>alert(2)</script>"} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>")
    dispose()
  })

  test("un lien exécutable est neutralisé : le libellé reste, le lien non", () => {
    const { container, dispose } = mount(() => <Markdown text={"[clique](javascript:alert(1))"} />)
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("clique")
    dispose()
  })

  test("un lien légitime est rendu, ouvert sans donner la main à la page", () => {
    const { container, dispose } = mount(() => <Markdown text={"[docs](https://a.b/c)"} />)
    const link = container.querySelector("a")
    expect(link?.getAttribute("href")).toBe("https://a.b/c")
    expect(link?.getAttribute("rel")).toContain("noopener")
    dispose()
  })
})

describe("Media", () => {
  test("une image se rend, avec son texte de remplacement", () => {
    const { container, dispose } = mount(() => <Media kind="image" url="https://a.b/x.png" name="x.png" />)
    const img = container.querySelector("img")
    expect(img?.getAttribute("src")).toBe("https://a.b/x.png")
    expect(img?.getAttribute("alt")).toBe("x.png")
    dispose()
  })

  test("une vidéo se rend avec ses contrôles", () => {
    const { container, dispose } = mount(() => <Media kind="video" url="https://a.b/c.mp4" name="c.mp4" />)
    expect(container.querySelector("video")?.hasAttribute("controls")).toBe(true)
    dispose()
  })

  test("une source refusée ne produit rien", () => {
    const { container, dispose } = mount(() => <Media kind="image" url="javascript:alert(1)" name="x" />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("video")).toBeNull()
    dispose()
  })
})

describe("Documents — le bilan de la réponse", () => {
  const docs: DocumentRef[] = [
    { path: "C:\\jeanluc\\opencode-fork\\packages\\webui\\src\\app.tsx", additions: 12, deletions: 3 },
    { path: "docs/web-ui/CIBLE.md" },
  ]

  test("il nomme chaque document, avec ses ±lignes quand il en a", () => {
    const { container, dispose } = mount(() => <Documents docs={docs} />)
    expect(container.textContent).toContain("documents")
    expect(container.textContent).toContain("webui/src/app.tsx")
    expect(container.textContent).toContain("+12 −3")
    // Un document sans ±lignes (un patch) ne montre pas de faux chiffres.
    expect(container.querySelectorAll(".docs-list li")).toHaveLength(2)
    dispose()
  })

  test("sans document, il n'existe pas", () => {
    // §8 : pas d'état vide garni pour ne pas laisser de place.
    const { container, dispose } = mount(() => <Documents docs={[]} />)
    expect(container.querySelector(".docs")).toBeNull()
    expect(container.textContent).toBe("")
    dispose()
  })
})

describe("SessionPanel — ce que le fil n'affiche plus", () => {
  const stats = {
    turns: 4,
    steps: 31,
    actions: 57,
    durationMs: 372_000,
    tokens: 1_200_000,
    cost: 0.42,
    perStep: [],
  }

  test("il porte les agrégats demandés", () => {
    const { container, dispose } = mount(() => <SessionPanel stats={stats} />)
    const text = container.textContent ?? ""
    for (const expected of ["turns", "4", "steps", "31", "time", "6m12s", "tokens", "1.2M", "cost", "$0.42"]) {
      expect(text).toContain(expected)
    }
    dispose()
  })

  test("il ne prétend pas avoir une durée quand il n'y en a pas", () => {
    const { container, dispose } = mount(() => (
      <SessionPanel stats={{ ...stats, durationMs: undefined, tokens: 0, cost: 0 }} />
    ))
    expect(container.textContent).toContain("none")
    dispose()
  })

  test("il détaille chaque étape avec la ligne rejetée du fil", () => {
    const { container, dispose } = mount(() => (
      <SessionPanel
        stats={{
          ...stats,
          perStep: [{ turn: 1, step: { index: 1, items: [], actions: 6, cost: 0.0008, tokens: 48_600, durationMs: 2800 } }],
        }}
      />
    ))
    expect(container.querySelectorAll(".stats-steps li")).toHaveLength(1)
    expect(container.textContent).toContain("step 1")
    expect(container.textContent).toContain("$0.0008")
    dispose()
  })
})

describe("UserPrompt — le prompt aussi est du markdown", () => {
  test("les formes markdown sortent en balises, pas en caractères", () => {
    const { container, dispose } = mount(() => <UserPrompt text={"## Titre\n\n- un\n- deux\n\nun `code` et **gras**"} />)
    expect(container.querySelector(".prompt")).not.toBeNull()
    expect(container.querySelector(".md-h2")?.textContent).toBe("Titre")
    expect(container.querySelectorAll(".md-list li")).toHaveLength(2)
    expect(container.querySelector(".md-code")?.textContent).toBe("code")
    // Les marqueurs ne doivent plus se lire dans le texte rendu.
    expect(container.textContent).not.toContain("**")
    expect(container.textContent).not.toContain("##")
    dispose()
  })

  test("les retours à la ligne marqués survivent — c'est ce que ce lot ne devait pas retirer", () => {
    // Le fil affichait le prompt avec ses retours (`white-space: pre-wrap`) : le rendre en markdown
    // sans les sauts durs aurait fait régresser une promesse existante.
    const { container, dispose } = mount(() => <UserPrompt text={"ligne une  \nligne deux"} />)
    expect(container.querySelector(".md-p br")).not.toBeNull()
    dispose()
  })

  test("le HTML d'un prompt n'est pas interprété", () => {
    const { container, dispose } = mount(() => <UserPrompt text={"<img src=x onerror=alert(1)>"} />)
    expect(container.querySelector(".prompt img")).toBeNull()
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>")
    dispose()
  })

  test("la carte porte un bouton pour copier le prompt, et il copie la SOURCE", async () => {
    // On copie ce que l'utilisateur a écrit — marqueurs markdown compris — et non le texte rendu :
    // recopier l'affichage ferait perdre la mise en forme qu'il a saisie.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const { container, dispose } = mount(() => <UserPrompt text={"**gras** et `code`"} />)
    const button = container.querySelector<HTMLButtonElement>(".prompt-copy button")
    expect(button?.getAttribute("title")).toBe("Copy prompt")
    button?.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith("**gras** et `code`")
    dispose()
  })
})

describe("ComposerMarkup — le calque du champ", () => {
  test("il rend le texte saisi, caractère pour caractère", () => {
    // Le calque est posé sous le champ : tout caractère manquant ou ajouté décalerait le curseur.
    const source = "**gras** et `code`\n# Titre\n- puce"
    const { container, dispose } = mount(() => <ComposerMarkup text={source} />)
    const markup = container.querySelector(".composer-markup")
    expect(markup).not.toBeNull()
    // Le texte du calque commence par la source (un caractère de largeur nulle le termine).
    expect(markup?.textContent?.startsWith(source)).toBe(true)
    expect(markup?.textContent?.replace(/\u200b$/, "")).toBe(source)
    dispose()
  })

  test("chaque nature reçoit sa classe de couleur", () => {
    // Un titre markdown commence une **ligne** : `# t` au milieu d'une phrase reste du texte.
    const { container, dispose } = mount(() => <ComposerMarkup text={"# t\n`c` **g** [l](u)"} />)
    const kinds = Array.from(container.querySelectorAll(".mk")).map((span) => span.className)
    expect(kinds.some((name) => name.includes("mk-code"))).toBe(true)
    expect(kinds.some((name) => name.includes("mk-strong"))).toBe(true)
    expect(kinds.some((name) => name.includes("mk-link"))).toBe(true)
    expect(kinds.some((name) => name.includes("mk-heading"))).toBe(true)
    dispose()
  })

  test("un brouillon vide ne produit aucun caractère visible", () => {
    const { container, dispose } = mount(() => <ComposerMarkup text="" />)
    expect((container.textContent ?? "").replace(/\u200b/g, "")).toBe("")
    dispose()
  })
})

describe("Documents — le badge de type", () => {
  test("chaque document porte les lettres de son extension et sa nature", () => {
    const { container, dispose } = mount(() => (
      <Documents
        docs={[
          { path: "src/app.ts", additions: 3, deletions: 1 },
          { path: "a/config.json" },
          { path: "Makefile" },
        ]}
      />
    ))
    const badges = Array.from(container.querySelectorAll(".doc-badge")).map((span) => span.textContent)
    expect(badges).toEqual(["TS", "JSON", "•"])
    expect(container.querySelector(".doc-code")).not.toBeNull()
    expect(container.querySelector(".doc-data")).not.toBeNull()
    expect(container.querySelector(".doc-other")).not.toBeNull()
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
