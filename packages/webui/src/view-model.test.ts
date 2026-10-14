import { describe, expect, test } from "vitest"
import {
  answersComplete,
  errorText,
  filterTraceEntries,
  formatClock,
  TRACE_FILTERS,
  traceEntries,
  traceSummary,
  trajectory,
  answerDocuments,
  canAlways,
  boundLines,
  copyableOutput,
  copyableText,
  customValue,
  diffLabel,
  dropPermission,
  dropQuestion,
  emptyAnswers,
  fileBadge,
  fileDiff,
  formatCost,
  formatCount,
  formatDuration,
  groupSteps,
  groupTurns,
  isSelected,
  isVisiblePart,
  lastWorkingTurn,
  mediaKind,
  OUTPUT_PREVIEW_LINES,
  patchLabel,
  permissionActions,
  proseKind,
  reducePermissions,
  reduceQuestions,
  reduceThread,
  sessionStats,
  setCustomAnswer,
  stepSummary,
  toggleAnswer,
  toolDetail,
  toolOutputLines,
  toolStatusLabel,
  toolTitle,
  type Message,
  type PermissionRequest,
  type QuestionRequest,
  type ToolState,
  type TurnView,
} from "./view-model"

const pending: ToolState = { status: "pending", input: { command: "ls" }, raw: "ls" }
const running: ToolState = { status: "running", input: { command: "ls" }, title: "Lecture du dossier", time: { start: 1 } }
const completed: ToolState = {
  status: "completed",
  input: { command: "ls" },
  output: "src\npackage.json",
  title: "Lecture du dossier",
  time: { start: 1, end: 2 },
}
const failed: ToolState = { status: "error", input: { command: "ls" }, error: "introuvable", time: { start: 1, end: 2 } }

describe("états d'outil", () => {
  test("les quatre statuts ont un libellé", () => {
    expect(toolStatusLabel(pending)).toBe("pending")
    expect(toolStatusLabel(running)).toBe("running")
    expect(toolStatusLabel(completed)).toBe("completed")
    expect(toolStatusLabel(failed)).toBe("error")
  })

  test("seuls running et completed portent un titre", () => {
    expect(toolTitle(running)).toBe("Lecture du dossier")
    expect(toolTitle(completed)).toBe("Lecture du dossier")
    expect(toolTitle(pending)).toBeUndefined()
    expect(toolTitle(failed)).toBeUndefined()
  })

  test("le détail expose la sortie seulement quand l'outil a abouti", () => {
    expect(toolDetail(completed).output).toBe("src\npackage.json")
    expect(toolDetail(failed).output).toBeUndefined()
    expect(toolDetail(failed).error).toBe("introuvable")
    expect(toolDetail(pending).error).toBeUndefined()
  })

  test("un input vide ne produit pas de bloc vide", () => {
    const empty: ToolState = { status: "completed", input: {}, output: "", title: "", time: { start: 1, end: 1 } }
    expect(toolDetail(empty).input).toBeUndefined()
  })
})

describe("permissions", () => {
  const request = (id: string, always: string[] = []): PermissionRequest => ({
    id,
    sessionID: "ses_1",
    permission: "bash",
    patterns: ["ls *"],
    always,
    metadata: {},
  })

  test("permission.asked ajoute la demande", () => {
    const next = reducePermissions([], { type: "permission.asked", properties: request("p1") })
    expect(next.map((item) => item.id)).toEqual(["p1"])
  })

  test("une demande déjà connue n'est pas dupliquée", () => {
    const once = reducePermissions([], { type: "permission.asked", properties: request("p1") })
    const twice = reducePermissions(once, { type: "permission.asked", properties: request("p1") })
    expect(twice).toHaveLength(1)
  })

  test("permission.replied retire la demande par requestID", () => {
    const current = [request("p1"), request("p2")]
    const next = reducePermissions(current, { type: "permission.replied", properties: { requestID: "p1" } })
    expect(next.map((item) => item.id)).toEqual(["p2"])
  })

  test("un événement sans rapport ne change rien", () => {
    const current = [request("p1")]
    expect(reducePermissions(current, { type: "server.heartbeat", properties: {} })).toEqual(current)
    expect(reducePermissions(current, { type: "permission.asked", properties: {} })).toEqual(current)
    expect(reducePermissions(current, { type: "permission.replied", properties: {} })).toEqual(current)
  })

  test("le bouton « toujours » n'apparaît que si le serveur a proposé des motifs", () => {
    expect(canAlways(request("p1", ["ls *"]))).toBe(true)
    expect(canAlways(request("p1"))).toBe(false)
    expect(permissionActions(request("p1", ["ls *"]))).toEqual(["once", "always", "reject"])
    expect(permissionActions(request("p1"))).toEqual(["once", "reject"])
  })

  test("la suppression optimiste retire la demande", () => {
    expect(dropPermission([request("p1"), request("p2")], "p2").map((item) => item.id)).toEqual(["p1"])
  })
})

describe("visibilité des parties", () => {
  test("le texte et les actions s'affichent", () => {
    expect(isVisiblePart({ type: "text", text: "bonjour" })).toBe(true)
    expect(isVisiblePart({ type: "tool" })).toBe(true)
    expect(isVisiblePart({ type: "file" })).toBe(true)
  })

  test("les parties de protocole ne s'affichent pas", () => {
    // Relevé sur données réelles : 1 447 step-start et 1 440 step-finish, sans aucun contenu propre.
    expect(isVisiblePart({ type: "step-start" })).toBe(false)
    expect(isVisiblePart({ type: "step-finish" })).toBe(false)
    expect(isVisiblePart({ type: "snapshot" })).toBe(false)
  })

  test("la ligne d'un outil de protocole ne s'affiche pas", () => {
    // `turn_plan` déclare une intention puis rend la main : sa sortie ne se lit pas. Même choix que
    // le TUI du fork (`isHiddenTool`), qui l'exclut de son rendu **et** de ses décomptes.
    expect(isVisiblePart({ type: "tool", tool: "turn_plan" })).toBe(false)
    // Un autre outil garde sa ligne — la règle vise un outil, pas la famille « tool ».
    expect(isVisiblePart({ type: "tool", tool: "bash" })).toBe(true)
  })

  test("un patch s'affiche, lui : il porte les fichiers changés", () => {
    // 400 occurrences dans le relevé. Il était filtré — à tort : c'est un contenu, pas un état interne.
    expect(isVisiblePart({ type: "patch", files: ["a.ts"] })).toBe(true)
  })

  test("une compaction et une relance s'affichent : ce sont des bornes du récit", () => {
    // Les cacher ferait mentir le fil : après une compaction, ce qui suit ne s'appuie plus sur ce qui
    // précède ; une relance dit qu'une tentative a échoué.
    expect(isVisiblePart({ type: "compaction" })).toBe(true)
    expect(isVisiblePart({ type: "retry" })).toBe(true)
  })

  test("un type inconnu ne s'affiche pas : un nom interne n'est pas une information", () => {
    expect(isVisiblePart({ type: "agent" })).toBe(false)
    expect(isVisiblePart({ type: "subtask" })).toBe(false)
    expect(isVisiblePart({ type: "quelque-chose-de-nouveau" })).toBe(false)
  })

  test("un contenu vide ne produit pas de bloc vide", () => {
    expect(isVisiblePart({ type: "text", text: "" })).toBe(false)
    expect(isVisiblePart({ type: "reasoning", text: "   " })).toBe(false)
  })

  test("une réflexion non vide s'affiche, elle", () => {
    expect(isVisiblePart({ type: "reasoning", text: "je pèse les options" })).toBe(true)
  })
})

describe("regroupement en étapes", () => {
  const text = (id: string, value: string) => ({ type: "text", id, text: value })
  const tool = (id: string, name: string) => ({
    type: "tool",
    id,
    tool: name,
    state: { status: "completed" as const, input: {}, output: "", title: "", time: { start: 1, end: 2 } },
  })
  const finish = (cost: number, total: number) => ({
    type: "step-finish",
    cost,
    tokens: { total, input: total, output: 0, reasoning: 0 },
  })

  test("chaque step-start ouvre une étape", () => {
    const steps = groupSteps([
      { type: "step-start" },
      text("p1", "un"),
      tool("p2", "bash"),
      finish(0.01, 100),
      { type: "step-start" },
      text("p3", "deux"),
      finish(0.02, 200),
    ])
    expect(steps).toHaveLength(2)
    expect(steps[0]!.items.map((item) => item.id)).toEqual(["p1", "p2"])
    expect(steps[0]!.actions).toBe(1)
    expect(steps[1]!.items.map((item) => item.id)).toEqual(["p3"])
  })

  test("le prix appartient à l'étape qu'il referme", () => {
    // `cost` et `tokens` sont là 1 440 fois dans le relevé et ne s'affichaient jamais.
    const steps = groupSteps([{ type: "step-start" }, text("p1", "x"), finish(0.0123, 31_000)])
    expect(steps[0]!.cost).toBeCloseTo(0.0123)
    expect(steps[0]!.tokens).toBe(31_000)
    expect(stepSummary(steps[0]!)).toContain("$0.012")
    expect(stepSummary(steps[0]!)).toContain("31k tokens")
  })

  test("une étape sans contenu ni prix n'existe pas", () => {
    expect(groupSteps([{ type: "step-start" }])).toHaveLength(0)
  })

  test("une étape sans action ne dit pas « 0 action »", () => {
    const steps = groupSteps([{ type: "step-start" }, text("p1", "x"), finish(0.002, 500)])
    expect(stepSummary(steps[0]!)).toBe("step 1 · $0.002 · 500 tokens")
  })

  test("la durée se mesure sur les parties, et ne vaut pas zéro quand elle est inconnue", () => {
    const timed = {
      type: "tool",
      id: "p1",
      tool: "bash",
      state: { status: "completed" as const, input: {}, output: "", title: "", time: { start: 100, end: 2100 } },
    }
    const measured = groupSteps([{ type: "step-start" }, timed])
    expect(measured[0]!.durationMs).toBe(2000)
    expect(stepSummary(measured[0]!)).toContain("2.0s")
    // Un outil encore en cours n'a pas de borne de fin : on n'écrit pas « 0s » sur un travail qui dure.
    const running = { type: "tool", id: "p1", tool: "bash", state: { status: "running" as const, input: {}, time: { start: 100 } } }
    expect(groupSteps([{ type: "step-start" }, running])[0]!.durationMs).toBeUndefined()
  })

  test("le tour regroupe le prompt puis les étapes", () => {
    const turns = groupTurns([
      { info: { id: "m1", role: "user" }, parts: [text("u1", "salut")] },
      { info: { id: "m2", role: "assistant" }, parts: [{ type: "step-start" }, text("a1", "bonjour")] },
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0]!.prompt.map((part) => part.id)).toEqual(["u1"])
    expect(turns[0]!.steps).toHaveLength(1)
  })

  test("une réponse sans prompt devant elle ne se rattache pas au hasard", () => {
    const turns = groupTurns([
      { info: { id: "m1", role: "assistant" }, parts: [{ type: "step-start" }, text("a1", "x")] },
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0]!.prompt).toEqual([])
    expect(turns[0]!.steps).toHaveLength(1)
  })

  test("un second message d'agent ouvre un nouveau tour, il ne s'ajoute pas au premier", () => {
    const turns = groupTurns([
      { info: { id: "m1", role: "user" }, parts: [text("u1", "salut")] },
      { info: { id: "m2", role: "assistant" }, parts: [{ type: "step-start" }, text("a1", "un")] },
      { info: { id: "m3", role: "assistant" }, parts: [{ type: "step-start" }, text("a2", "deux")] },
    ])
    expect(turns).toHaveLength(2)
    expect(turns[0]!.steps).toHaveLength(1)
    expect(turns[1]!.steps).toHaveLength(1)
  })
})

describe("formatage", () => {
  test("le coût suit la langue de l'interface, et zéro ne s'affiche pas", () => {
    expect(formatCost(undefined)).toBeUndefined()
    expect(formatCost(0)).toBeUndefined()
    expect(formatCost(0.0004)).toBe("$0.0004")
    expect(formatCost(0.0123)).toBe("$0.012")
    expect(formatCost(1.5)).toBe("$1.50")
  })

  test("les jetons suivent la même échelle que les tailles de fichier", () => {
    expect(formatCount(0)).toBeUndefined()
    expect(formatCount(840)).toBe("840")
    expect(formatCount(1200)).toBe("1.2k")
    expect(formatCount(31_000)).toBe("31k")
    // Le million est nécessaire : un total de session le dépasse couramment.
    expect(formatCount(1_200_000)).toBe("1.2M")
    expect(formatCount(2_000_000)).toBe("2M")
    // 999 999 ne doit pas s'écrire « 1000k », qui ne se lit pas.
    expect(formatCount(999_999)).toBe("1M")
  })

  test("une durée absente ou nulle ne s'écrit pas", () => {
    expect(formatDuration(undefined)).toBeUndefined()
    expect(formatDuration(0)).toBeUndefined()
    expect(formatDuration(191)).toBe("191ms")
    expect(formatDuration(8400)).toBe("8.4s")
    expect(formatDuration(75_000)).toBe("1m15s")
  })
})

describe("diff, sortie bornée, prose particulière", () => {
  const state = (metadata: Record<string, unknown>, output: string): ToolState => ({
    status: "completed",
    input: {},
    output,
    title: "",
    time: { start: 1, end: 2 },
    metadata,
  })

  test("les ±lignes viennent de metadata.filediff, jamais du patch", () => {
    // Mesuré : `edit.metadata.filediff = { file, patch, additions, deletions }` (603 occurrences).
    // `PatchPart`, lui, ne porte que `hash` et `files[]` : il ne sait pas compter des lignes.
    expect(fileDiff(state({ filediff: { file: "a.ts", additions: 12, deletions: 3 } }, ""))).toEqual({
      additions: 12,
      deletions: 3,
    })
    expect(fileDiff(state({}, ""))).toBeUndefined()
    expect(fileDiff(undefined)).toBeUndefined()
  })

  test("un diff vide se lit « no change », pas « +0 −0 »", () => {
    expect(diffLabel(0, 0)).toBe("no change")
    expect(diffLabel(12, 3)).toBe("+12 −3")
  })

  test("un patch compte ses fichiers sans inventer de lignes", () => {
    expect(patchLabel({ files: ["a.ts"] })).toBe("1 file")
    expect(patchLabel({ files: ["a.ts", "b.ts", "c.ts"] })).toBe("3 files")
    expect(patchLabel({})).toBe("no change")
  })

  test("une sortie longue se borne et annonce ce qui reste", () => {
    // Mesuré sur 2 410 sorties : médiane 4 lignes, p90 46, p99 191, maximum 1 349.
    const text = Array.from({ length: 20 }, (_, index) => `ligne ${index + 1}`).join("\n")
    const { head, hidden } = boundLines(text)
    expect(hidden).toBe(20 - OUTPUT_PREVIEW_LINES)
    expect(head.split("\n")).toHaveLength(OUTPUT_PREVIEW_LINES)
    expect(head).not.toContain("ligne 13")
  })

  test("une sortie courte n'est pas bornée", () => {
    expect(boundLines("a\nb")).toEqual({ head: "a\nb", hidden: 0 })
  })

  test("le volume d'une sortie ne se compte que si elle est terminée", () => {
    expect(toolOutputLines(state({}, "a\nb\nc"))).toBe(3)
    expect(toolOutputLines({ status: "running", input: {}, time: { start: 1 } })).toBe(0)
  })

  test("synthetic et ignored ne sont pas de la prose", () => {
    expect(proseKind({ synthetic: true })).toBe("synthetic")
    expect(proseKind({ ignored: true })).toBe("ignored")
    expect(proseKind({})).toBeUndefined()
  })
})

describe("le fil append-only", () => {
  const base = (): Message[] => [
    { info: { id: "m1", role: "user" }, parts: [{ type: "text", id: "p1", text: "salut" }] },
    { info: { id: "m2", role: "assistant" }, parts: [{ type: "text", id: "p2", text: "" }] },
  ]

  test("message.part.updated porte la partie aplatie, pas un champ « part »", () => {
    // Forme relevée sur le fil réel — le schéma d'origine annonce `{sessionID, part, time}`, et lire
    // `properties.part` ne rendrait rien, silencieusement.
    const next = reduceThread(base(), {
      type: "message.part.updated",
      properties: { id: "p2", messageID: "m2", sessionID: "s1", type: "text", text: "bonjour" },
    })
    expect(next?.[1]?.parts[0]).toMatchObject({ text: "bonjour" })
  })

  test("message.part.delta ajoute au champ visé", () => {
    const once = reduceThread(base(), {
      type: "message.part.delta",
      properties: { sessionID: "s1", messageID: "m2", partID: "p2", field: "text", delta: "bon" },
    })
    const twice = reduceThread(once!, {
      type: "message.part.delta",
      properties: { sessionID: "s1", messageID: "m2", partID: "p2", field: "text", delta: "jour" },
    })
    expect(twice?.[1]?.parts[0]?.text).toBe("bonjour")
  })

  test("une partie inconnue d'un message connu est ajoutée, pas ignorée", () => {
    const next = reduceThread(base(), {
      type: "message.part.updated",
      properties: { id: "p9", messageID: "m2", sessionID: "s1", type: "reasoning", text: "je pèse" },
    })
    expect(next?.[1]?.parts.map((part) => part.id)).toEqual(["p2", "p9"])
  })

  test("un message inconnu rend undefined : l'appelant recharge une fois", () => {
    expect(
      reduceThread(base(), {
        type: "message.part.updated",
        properties: { id: "p1", messageID: "m9", sessionID: "s1", type: "text", text: "x" },
      }),
    ).toBeUndefined()
    expect(
      reduceThread(base(), {
        type: "message.part.delta",
        properties: { sessionID: "s1", messageID: "m9", partID: "p1", field: "text", delta: "x" },
      }),
    ).toBeUndefined()
  })

  test("message.part.removed retire la partie", () => {
    const next = reduceThread(base(), {
      type: "message.part.removed",
      properties: { sessionID: "s1", messageID: "m2", partID: "p2" },
    })
    expect(next?.[1]?.parts).toEqual([])
  })

  test("message.updated fusionne l'info d'un message connu sans toucher à ses parties", () => {
    const next = reduceThread(base(), {
      type: "message.updated",
      properties: { sessionID: "s1", info: { id: "m2", role: "assistant", cost: 1.5 } },
    })
    expect(next?.[1]?.info.cost).toBe(1.5)
    expect(next?.[1]?.parts).toHaveLength(1)
  })

  test("un message.updated inconnu ajoute le message", () => {
    const next = reduceThread(base(), {
      type: "message.updated",
      properties: { sessionID: "s1", info: { id: "m3", role: "user" } },
    })
    expect(next?.map((message) => message.info.id)).toEqual(["m1", "m2", "m3"])
  })

  test("un événement sans rapport ne change pas le fil", () => {
    const current = base()
    expect(reduceThread(current, { type: "session.status", properties: { sessionID: "s1" } })).toBe(current)
    expect(reduceThread(current, { type: "message.part.delta", properties: {} })).toBe(current)
  })
})

describe("la question de l'agent — la seule écriture du fil", () => {
  const request = (id: string, overrides: Partial<QuestionRequest> = {}): QuestionRequest => ({
    id,
    sessionID: "ses_1",
    questions: [
      {
        header: "Colour",
        question: "Which colour?",
        options: [
          { label: "Blue", description: "The calm one" },
          { label: "Red", description: "The loud one" },
        ],
      },
    ],
    ...overrides,
  })

  test("question.asked ajoute, sans dupliquer", () => {
    const once = reduceQuestions([], { type: "question.asked", properties: request("q1") })
    expect(once.map((item) => item.id)).toEqual(["q1"])
    const twice = reduceQuestions(once, { type: "question.asked", properties: request("q1") })
    expect(twice).toHaveLength(1)
  })

  test("question.replied et question.rejected retirent par requestID", () => {
    // Le rejet compte autant que la réponse : c'est ce qui débloque l'agent quand on ne veut pas répondre.
    const current = [request("q1"), request("q2")]
    expect(
      reduceQuestions(current, { type: "question.replied", properties: { requestID: "q1" } }).map((i) => i.id),
    ).toEqual(["q2"])
    expect(
      reduceQuestions(current, { type: "question.rejected", properties: { requestID: "q2" } }).map((i) => i.id),
    ).toEqual(["q1"])
  })

  test("un événement malformé ne casse rien", () => {
    const current = [request("q1")]
    expect(reduceQuestions(current, { type: "question.asked", properties: {} })).toEqual(current)
    expect(reduceQuestions(current, { type: "question.replied", properties: {} })).toEqual(current)
    expect(reduceQuestions(current, { type: "server.heartbeat", properties: {} })).toEqual(current)
  })

  test("la suppression optimiste retire la question", () => {
    expect(dropQuestion([request("q1"), request("q2")], "q2").map((i) => i.id)).toEqual(["q1"])
  })

  test("la réponse est positionnelle : une entrée vide par question", () => {
    // `answers` est un `string[][]` — un tableau de libellés **par question, dans l'ordre**. Une
    // réponse décalée d'un cran répondrait à la mauvaise question.
    const two = request("q1", {
      questions: [
        { header: "A", question: "a?", options: [] },
        { header: "B", question: "b?", options: [] },
      ],
    })
    expect(emptyAnswers(two)).toEqual([[], []])
  })

  test("en choix unique, cocher remplace", () => {
    const start = emptyAnswers(request("q1"))
    const first = toggleAnswer(start, 0, "Blue", false)
    expect(first[0]).toEqual(["Blue"])
    const second = toggleAnswer(first, 0, "Red", false)
    // Sans le remplacement, le serveur recevrait deux libellés pour une question qui n'en attend qu'un.
    expect(second[0]).toEqual(["Red"])
  })

  test("en choix multiple, cocher s'ajoute et se décoche", () => {
    const start = emptyAnswers(request("q1"))
    const both = toggleAnswer(toggleAnswer(start, 0, "Blue", true), 0, "Red", true)
    expect(both[0]).toEqual(["Blue", "Red"])
    expect(toggleAnswer(both, 0, "Blue", true)[0]).toEqual(["Red"])
  })

  test("une réponse ne touche pas les autres questions", () => {
    const two = request("q1", {
      questions: [
        { header: "A", question: "a?", options: [] },
        { header: "B", question: "b?", options: [] },
      ],
    })
    const answers = toggleAnswer(emptyAnswers(two), 1, "Second", false)
    expect(answers[0]).toEqual([])
    expect(answers[1]).toEqual(["Second"])
  })

  test("un texte libre remplace, et un texte vide efface", () => {
    const start = toggleAnswer(emptyAnswers(request("q1")), 0, "Blue", false)
    expect(setCustomAnswer(start, 0, "Green")[0]).toEqual(["Green"])
    expect(setCustomAnswer(start, 0, "   ")[0]).toEqual([])
  })

  test("une réponse partielle n'est pas complète", () => {
    const two = request("q1", {
      questions: [
        { header: "A", question: "a?", options: [] },
        { header: "B", question: "b?", options: [] },
      ],
    })
    expect(answersComplete(two, [[], []])).toBe(false)
    expect(answersComplete(two, [["one"], []])).toBe(false)
    expect(answersComplete(two, [["one"], ["two"]])).toBe(true)
    // Une forme qui ne correspond pas au nombre de questions est incomplète, pas « valide par défaut ».
    expect(answersComplete(two, [["one"]])).toBe(false)
  })

  test("la sélection se lit par libellé", () => {
    const answers = toggleAnswer(emptyAnswers(request("q1")), 0, "Blue", false)
    expect(isSelected(answers, 0, "Blue")).toBe(true)
    expect(isSelected(answers, 0, "Red")).toBe(false)
  })

  test("le champ libre n'affiche pas un libellé d'option", () => {
    // C'est ce qui garde le champ cohérent : choisir une option le vide au lieu de laisser un texte
    // qui ne serait plus envoyé.
    const item = request("q1").questions[0]!
    const picked = toggleAnswer(emptyAnswers(request("q1")), 0, "Blue", false)
    expect(customValue(item, picked, 0)).toBe("")
    expect(customValue(item, setCustomAnswer(picked, 0, "Green"), 0)).toBe("Green")
    // Plusieurs libellés cochés : le champ n'a rien à montrer.
    const many = toggleAnswer(picked, 0, "Red", true)
    expect(customValue(item, many, 0)).toBe("")
  })
})

describe("copier — la seule action de lecture du fil", () => {
  const done = (input: Record<string, unknown>, over: Record<string, unknown> = {}): ToolState =>
    ({ status: "completed", input, output: "", title: "", time: { start: 1, end: 2 }, ...over }) as ToolState

  test("on copie la commande, pas le libellé affiché", () => {
    // La ligne montre « Git status and diff stat » ; ce qu'on veut recoller est la commande.
    const state = done({ command: "git status --short" }, { title: "Git status and diff stat" })
    expect(copyableText("bash", state)).toBe("git status --short")
  })

  test("pour read, write et edit, on copie le chemin", () => {
    const path = "C:\\jeanluc\\opencode-fork\\packages\\webui\\src\\app.tsx"
    const state = done({ filePath: path }, { title: path })
    expect(copyableText("read", state)).toBe(path)
    expect(copyableText("write", state)).toBe(path)
    expect(copyableText("edit", state)).toBe(path)
  })

  test("un titre qui est une phrase n'est pas une valeur : rien à copier", () => {
    // « Echo hi » ou « Lecture du dossier » se recollent mal — on ne propose donc pas de copier.
    expect(copyableText("bash", done({}, { title: "Echo hi" }))).toBeUndefined()
    expect(copyableText("turn_plan", done({}, { title: "Engagement declared" }))).toBeUndefined()
    expect(copyableText("read", done({}, { title: "   " }))).toBeUndefined()
  })

  test("une commande vide ne compte pas", () => {
    expect(copyableText("bash", done({ command: "   " }))).toBeUndefined()
    expect(copyableText("bash", undefined)).toBeUndefined()
  })

  test("on copie la sortie complète, jamais l'aperçu borné", () => {
    // Copier les 12 lignes affichées quand l'outil en a produit 40 donnerait un résultat tronqué
    // qui a l'air complet — c'est le cas qu'on refuse.
    const long = Array.from({ length: 40 }, (_, index) => `ligne ${index}`).join("\n")
    expect(copyableOutput(done({}, { output: long }))).toBe(long)
  })

  test("rien à copier sans sortie, ou si l'outil n'a pas abouti", () => {
    expect(copyableOutput(done({}, { output: "" }))).toBeUndefined()
    expect(copyableOutput({ status: "running", input: {}, time: { start: 1 } })).toBeUndefined()
    expect(copyableOutput({ status: "error", input: {}, error: "x", time: { start: 1, end: 2 } })).toBeUndefined()
    expect(copyableOutput(undefined)).toBeUndefined()
  })
})

describe("les statistiques de session — ce que le fil n'affiche plus", () => {
  const text = (id: string, value: string) => ({ type: "text", id, text: value })
  const tool = (id: string, time: { start: number; end: number }) => ({
    type: "tool",
    id,
    tool: "bash",
    state: { status: "completed" as const, input: {}, output: "", title: "", time },
  })
  const finish = (cost: number, total: number) => ({
    type: "step-finish",
    cost,
    tokens: { total, input: total, output: 0, reasoning: 0 },
  })

  const turns: Message[] = [
    { info: { id: "m1", role: "user" }, parts: [text("u1", "salut")] },
    {
      info: { id: "m2", role: "assistant" },
      parts: [
        { type: "step-start" },
        text("a1", "un"),
        tool("t1", { start: 100, end: 1100 }),
        finish(0.01, 1000),
        { type: "step-start" },
        text("a2", "deux"),
        tool("t2", { start: 2000, end: 2500 }),
        finish(0.02, 2000),
      ],
    },
  ]

  test("les agrégats se calculent sur les tours et les étapes", () => {
    const stats = sessionStats(groupTurns(turns))
    expect(stats.turns).toBe(1)
    expect(stats.steps).toBe(2)
    expect(stats.actions).toBe(2)
    expect(stats.durationMs).toBe(1500) // 1000 + 500
    expect(stats.tokens).toBe(3000)
    expect(stats).toMatchObject({ cost: 0.03 })
  })

  test("le détail par étape porte la ligne que le fil n'affiche plus", () => {
    const stats = sessionStats(groupTurns(turns))
    expect(stats.perStep).toHaveLength(2)
    expect(stepSummary(stats.perStep[0]!.step)).toContain("step 1")
    expect(stepSummary(stats.perStep[0]!.step)).toContain("$0.01")
    expect(stats.perStep[0]!.turn).toBe(1)
  })

  test("une session sans étape ne prétend pas avoir une durée", () => {
    const stats = sessionStats(groupTurns([{ info: { id: "m1", role: "user" }, parts: [text("u1", "seul")] }]))
    expect(stats.steps).toBe(0)
    expect(stats.durationMs).toBeUndefined()
    expect(stats.cost).toBe(0)
  })
})

describe("le type d'un média", () => {
  test("le mime d'abord : c'est une déclaration", () => {
    expect(mediaKind({ mime: "image/png" })).toBe("image")
    expect(mediaKind({ mime: "video/mp4" })).toBe("video")
    // Un mime explicite l'emporte sur une extension trompeuse.
    expect(mediaKind({ mime: "image/webp", url: "https://a.b/x.mp4" })).toBe("image")
  })

  test("l'extension ensuite", () => {
    expect(mediaKind({ url: "https://a.b/x.png" })).toBe("image")
    expect(mediaKind({ url: "https://a.b/x.JPEG" })).toBe("image")
    expect(mediaKind({ url: "https://a.b/clip.webm" })).toBe("video")
    // Les paramètres d'URL ne doivent pas cacher l'extension.
    expect(mediaKind({ url: "https://a.b/x.mp4?token=1&a=2" })).toBe("video")
  })

  test("ce qui n'est ni l'un ni l'autre n'est pas deviné", () => {
    expect(mediaKind({ url: "https://a.b/page" })).toBeUndefined()
    expect(mediaKind({ url: "https://a.b/archive.zip" })).toBeUndefined()
    expect(mediaKind({})).toBeUndefined()
    expect(mediaKind(undefined)).toBeUndefined()
  })
})

describe("les documents d'une réponse", () => {
  const patch = (files: string[]) => ({ type: "patch", id: "p", files })
  const write = (id: string, file: string, additions: number, deletions: number) => ({
    type: "tool",
    id,
    tool: "edit",
    state: {
      status: "completed" as const,
      input: {},
      output: "",
      title: file,
      time: { start: 1, end: 2 },
      metadata: { filediff: { file, patch: "", additions, deletions } },
    },
  })

  const turn = (items: unknown[]): TurnView => ({
    id: "m",
    role: "assistant",
    info: { id: "m", role: "assistant" },
    replies: [],
    prompt: [],
    steps: [{ index: 1, items: items as never, actions: 0, cost: 0, tokens: 0, durationMs: undefined }],
  })

  test("un patch apporte ses fichiers, une écriture ses ±lignes", () => {
    const docs = answerDocuments(turn([patch(["a.ts", "b.ts"]), write("t", "c.ts", 12, 3)]))
    expect(docs.map((doc) => doc.path)).toEqual(["a.ts", "b.ts", "c.ts"])
    expect(docs[2]).toEqual({ path: "c.ts", additions: 12, deletions: 3 })
  })

  test("le même fichier touché deux fois est un seul document, au dernier passage", () => {
    // La somme des ±lignes ne décrirait rien de réel : c'est le dernier état qui compte.
    const docs = answerDocuments(turn([write("t1", "a.ts", 5, 1), write("t2", "a.ts", 9, 2)]))
    expect(docs).toHaveLength(1)
    expect(docs[0]).toEqual({ path: "a.ts", additions: 9, deletions: 2 })
  })

  test("sans patch ni écriture, il n'y a aucun document", () => {
    expect(answerDocuments(turn([{ type: "text", id: "x", text: "du texte" }]))).toEqual([])
    expect(answerDocuments(undefined)).toEqual([])
  })

  test("la dernière réponse de l'agent est celle dont on montre le bilan", () => {
    const turns = groupTurns([
      { info: { id: "u1", role: "user" }, parts: [{ type: "text", id: "x", text: "a" }] },
      { info: { id: "a1", role: "assistant" }, parts: [{ type: "step-start" }, { type: "text", id: "y", text: "un" }] },
      { info: { id: "u2", role: "user" }, parts: [{ type: "text", id: "z", text: "b" }] },
    ])
    expect(lastWorkingTurn(turns)?.id).toBe("u1")
    expect(lastWorkingTurn([])).toBeUndefined()
  })
})

describe("le flux — l'ordre des faits", () => {
  const text = (id: string, value: string) => ({ type: "text", id, text: value })
  const tool = (id: string) => ({
    type: "tool",
    id,
    tool: "bash",
    state: { status: "completed" as const, input: {}, output: "", title: "", time: { start: 1, end: 2 } },
  })
  const patch = (id: string) => ({ type: "patch", id, files: ["a.ts"] })

  test("les étapes portent leurs items dans l'ordre où ils se sont produits", () => {
    // C'est tout ce dont le rendu du flux a besoin : déplier ne cachant plus rien, il n'y a plus de
    // répartition à calculer — donc plus de helper à tester. On garde la garantie d'ordre.
    const turn = groupTurns([
      { info: { id: "m1", role: "user" }, parts: [text("u1", "fais-le")] },
      {
        info: { id: "m2", role: "assistant" },
        parts: [
          { type: "step-start" },
          text("a1", "je commence"),
          tool("t1"),
          { type: "step-start" },
          text("a2", "c'est fait"),
          patch("p1"),
        ],
      },
    ])[0]!

    expect(turn.steps).toHaveLength(2)
    expect(turn.steps[0]!.items.map((item) => item.id)).toEqual(["a1", "t1"])
    expect(turn.steps[1]!.items.map((item) => item.id)).toEqual(["a2", "p1"])
    // Le parcours du rendu, à plat : prose et travail mêlés, dans l'ordre des faits.
    const flat = turn.steps.flatMap((step) => step.items.map((item) => item.id))
    expect(flat).toEqual(["a1", "t1", "a2", "p1"])
  })

  test("une étape sans texte n'existe pas moins : elle porte son travail", () => {
    const workOnly = groupTurns([
      { info: { id: "m1", role: "user" }, parts: [text("u1", "d")] },
      { info: { id: "m2", role: "assistant" }, parts: [{ type: "step-start" }, tool("t1")] },
    ])[0]!
    expect(workOnly.steps[0]!.items.map((item) => item.id)).toEqual(["t1"])
  })
})

describe("le badge de type d'un fichier", () => {
  test("les lettres viennent de l'extension, en majuscules", () => {
    expect(fileBadge("src/app.ts")).toEqual({ label: "TS", family: "code" })
    expect(fileBadge("a/b/config.json")).toEqual({ label: "JSON", family: "data" })
    expect(fileBadge("styles.css")).toEqual({ label: "CSS", family: "style" })
    expect(fileBadge("README.md")).toEqual({ label: "MD", family: "docs" })
  })

  test("la casse et le chemin n'y changent rien", () => {
    expect(fileBadge("C:\\jeanluc\\opencode-fork\\packages\\webui\\src\\app.tsx").label).toBe("TSX")
    expect(fileBadge("A/B/C.PNG")).toEqual({ label: "PNG", family: "media" })
  })

  test("la teinte dit la NATURE, pas le langage", () => {
    // Une couleur par langage serait un vocabulaire que personne ne retient.
    expect(fileBadge("a.py").family).toBe(fileBadge("b.go").family)
    expect(fileBadge("a.py").family).toBe("code")
    expect(fileBadge("a.sh").family).toBe("shell")
    expect(fileBadge("a.html").family).toBe("markup")
  })

  test("sans extension, il n'y a pas de lettres à montrer", () => {
    expect(fileBadge("Makefile")).toEqual({ label: "•", family: "other" })
    expect(fileBadge("LICENSE")).toEqual({ label: "•", family: "other" })
  })

  test("un point en tête est un nom, pas une extension", () => {
    // `.env` et `.gitignore` sont des noms : leur « extension » serait le nom entier.
    expect(fileBadge(".env")).toEqual({ label: "•", family: "other" })
    expect(fileBadge("/a/b/.gitignore")).toEqual({ label: "•", family: "other" })
  })

  test("une extension inconnue garde ses lettres, sa nature reste autre", () => {
    // Mieux vaut un badge exact qu'un badge deviné.
    expect(fileBadge("data.xyz")).toEqual({ label: "XYZ", family: "other" })
  })

  test("une extension très longue ne devient pas un pavé", () => {
    expect(fileBadge("odd.verylongext").label).toBe("•")
  })
})

describe("trajectory — le diagnostic d'un tour", () => {
  const asked = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
    info: { id, role: "user", ...extra },
    parts: [{ type: "text", text }],
  })
  const reply = (id: string, parts: unknown[], extra: Record<string, unknown> = {}) => ({
    info: { id, role: "assistant", ...extra },
    parts,
  })
  const finish = (reason: string, cost: number, tokens: Record<string, unknown>) => ({
    type: "step-finish",
    id: "f",
    reason,
    cost,
    tokens,
  })
  const call = (tool: string) => ({ type: "tool", id: "t", tool, state: { status: "completed" } })
  const trace = (messages: unknown[]) => trajectory(groupTurns(messages as never))

  const small = { input: 1, output: 1, cache: { read: 0, write: 0 } }

  test("le tour dit ce qui a **réellement** servi, pas ce qui a été demandé", () => {
    // L'utilisateur demande « p/m » ; le serveur répond avec « p/autre » (bascule de modèle).
    const traces = trace([
      asked("u", "fais", { agent: "build", model: { providerID: "p", modelID: "m" } }),
      reply("a", [], { providerID: "p", modelID: "autre", agent: "plan", mode: "primary" }),
    ])
    expect(traces[0].model).toBe("p/autre")
    expect(traces[0].agent).toBe("plan")
    expect(traces[0].mode).toBe("primary")
  })

  test("sans réponse, il retombe sur ce qui a été demandé", () => {
    const traces = trace([asked("u", "fais", { agent: "build", model: { providerID: "p", modelID: "m" } })])
    expect(traces[0].model).toBe("p/m")
    expect(traces[0].agent).toBe("build")
    expect(traces[0].mode).toBeUndefined()
  })

  test("la durée va de la demande à la fin de la réponse", () => {
    const traces = trace([
      asked("u", "fais", { time: { created: 1000 } }),
      reply("a", [], { time: { created: 1100, completed: 2500 } }),
    ])
    expect(traces[0].durationMs).toBe(1500)
  })

  test("une réponse sans fin n'a pas de durée — on n'invente pas un zéro", () => {
    const traces = trace([
      asked("u", "fais", { time: { created: 1000 } }),
      reply("a", [], { time: { created: 1100 } }),
    ])
    expect(traces[0].durationMs).toBeUndefined()
  })

  test("les jetons sont séparés par origine et additionnés sur les étapes", () => {
    const traces = trace([
      asked("u", "fais"),
      reply("a", [
        finish("tool-calls", 0.01, { input: 100, output: 20, cache: { read: 900, write: 5 } }),
        finish("stop", 0.02, { input: 200, output: 40, cache: { read: 100, write: 0 } }),
      ]),
    ])
    expect(traces[0].input).toBe(300)
    expect(traces[0].output).toBe(60)
    expect(traces[0].cacheRead).toBe(1000)
    expect(Number(traces[0].cost.toFixed(3))).toBe(0.03)
  })

  test("l'étape porte ses outils et son motif d'arrêt", () => {
    const traces = trace([
      asked("u", "fais"),
      reply("a", [{ type: "step-start", id: "s1" }, call("read"), call("edit"), finish("tool-calls", 0, small)]),
    ])
    expect(traces[0].steps[0].tools).toEqual(["read", "edit"])
    expect(traces[0].steps[0].reason).toBe("tool-calls")
    expect(traces[0].actions).toBe(2)
  })

  test("une étape sans outil est un pas de raisonnement — liste vide, pas un mensonge", () => {
    // Le prix est indispensable : `groupSteps` écarte une étape **sans contenu et sans prix** (un
    // `step-start` resté seul). Un `step-finish` réel en porte toujours un.
    const traces = trace([
      asked("u", "fais"),
      reply("a", [{ type: "step-start", id: "s1" }, finish("stop", 0.001, small)]),
    ])
    expect(traces[0].steps[0].tools).toEqual([])
  })

  test("le motif d'arrêt se lit jusque dans la ligne d'étape", () => {
    // `length` est le cas qui se répare mal : une réponse coupée ne se relance pas comme un arrêt normal.
    const traces = trace([asked("u", "fais"), reply("a", [finish("length", 0.001, small)])])
    expect(traces[0].steps[0].reason).toBe("length")
  })

  test("une étape sans contenu et sans prix n'est pas une étape", () => {
    // C'est la règle du regroupement : un `step-start` resté seul ne compte pas. Elle compte ici
    // parce que la trajectoire en dépend — un tour sans étape doit s'afficher sans étape.
    const traces = trace([asked("u", "fais"), reply("a", [{ type: "step-start", id: "s1" }])])
    expect(traces[0].steps).toEqual([])
  })

  test("le prompt compte ses caractères — ce qui a été envoyé", () => {
    const traces = trace([asked("u", "douze lettres")])
    expect(traces[0].promptChars).toBe(13)
  })

  test("les injections jointes au prompt se relisent dans le tour", () => {
    const texte = "Context injections · 3 section(s)\n- core: system prompt (PROMPT_CORE) · 5592 chars"
    const traces = trace([asked("u", texte)])
    expect(traces[0].injections?.kind).toBe("sections")
    expect(traces[0].injections?.sections).toHaveLength(1)
  })

  test("sans injection, le tour n'en invente pas", () => {
    expect(trace([asked("u", "juste un prompt")])[0].injections).toBeUndefined()
  })

  test("l'erreur d'une réponse remonte dans le tour", () => {
    const traces = trace([
      asked("u", "fais"),
      reply("a", [], { error: { name: "ApiError", data: { message: "taux dépassé", statusCode: 429 } } }),
    ])
    expect(traces[0].error).toBe("taux dépassé")
  })

  test("les tours sont numérotés à partir de 1, dans l'ordre", () => {
    const traces = trace([asked("u1", "un"), asked("u2", "deux")])
    expect(traces.map((entry) => entry.turn)).toEqual([1, 2])
  })

  test("le raisonnement est compté à part du total", () => {
    // Le total ne dit pas combien le modèle a « pensé » : c'est le chiffre qu'on regarde quand un tour
    // coûte cher sans rien produire.
    const traces = trace([
      asked("u", "fais"),
      reply("a", [finish("stop", 0.001, { input: 10, output: 5, reasoning: 400, cache: { read: 0, write: 0 } })]),
    ])
    expect(traces[0].reasoning).toBe(400)
    expect(traces[0].steps[0].reasoning).toBe(400)
    // Le raisonnement ne se confond ni avec l'entrée ni avec la sortie.
    expect(traces[0].input).toBe(10)
    expect(traces[0].output).toBe(5)
  })

  test("la taille du contexte vient de la **dernière** étape qui en donne une", () => {
    const traces = trace([
      asked("u", "fais"),
      reply("a", [
        finish("tool-calls", 0.001, { total: 1000, input: 1, output: 1, cache: { read: 0, write: 0 } }),
        finish("stop", 0.001, { total: 2500, input: 1, output: 1, cache: { read: 0, write: 0 } }),
      ]),
    ])
    expect(traces[0].contextTokens).toBe(2500)
  })

  test("sans taille de contexte mesurée, il n'y en a pas — pas un zéro", () => {
    const traces = trace([asked("u", "fais"), reply("a", [finish("stop", 0.001, small)])])
    expect(traces[0].contextTokens).toBeUndefined()
  })

  test("un prompt système de remplacement se signale par sa taille", () => {
    // On montre qu'il a été écrasé, pas son texte : le contenu serait un pavé au milieu du diagnostic.
    const traces = trace([asked("u", "fais", { system: "tu es un assistant concis" })])
    expect(traces[0].systemChars).toBe(25)
  })

  test("sans prompt système, rien ne s'affiche", () => {
    expect(trace([asked("u", "fais")])[0].systemChars).toBeUndefined()
  })

  test("le dossier de travail vient de la réponse, pas de la demande", () => {
    const traces = trace([asked("u", "fais"), reply("a", [], { path: { cwd: "/tmp/projet" } })])
    expect(traces[0].cwd).toBe("/tmp/projet")
  })

  test("sans tour, la trajectoire est vide", () => {
    expect(trajectory([])).toEqual([])
  })
})

describe("errorText — lire une erreur sans deviner sa forme", () => {
  test("il prend le message de la variante", () => {
    expect(errorText({ name: "ProviderAuthError", data: { message: "clé absente" } })).toBe("clé absente")
  })

  test("à défaut de message, le nom de la variante est déjà une information", () => {
    expect(errorText({ name: "MessageAbortedError", data: {} })).toBe("MessageAbortedError")
  })

  test("une entrée qui n'est pas une erreur ne rend rien", () => {
    expect(errorText(undefined)).toBeUndefined()
    expect(errorText("oups")).toBeUndefined()
    expect(errorText({})).toBeUndefined()
  })
})

describe("traceEntries — la timeline reprise de DSH", () => {
  const asked = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
    info: { id, role: "user", ...extra },
    parts: [{ type: "text", text }],
  })
  const reply = (id: string, parts: unknown[], extra: Record<string, unknown> = {}) => ({
    info: { id, role: "assistant", ...extra },
    parts,
  })
  const tool = (name: string, status: string, start: number, end: number | undefined, title: string) => ({
    type: "tool",
    id: "t",
    tool: name,
    state: { status, input: {}, output: "", title, time: { start, end } },
  })
  const trace = (messages: unknown[]) => traceEntries(groupTurns(messages as never))

  test("l'heure est au format HH:MM:SS", () => {
    expect(formatClock(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe("03:04:05")
  })

  test("un résumé aplatit les blancs et se borne à 120 caractères", () => {
    expect(traceSummary("a\n\n  b\tc")).toBe("a b c")
    const long = "x".repeat(200)
    expect(traceSummary(long)).toHaveLength(121)
    expect(traceSummary(long).endsWith("…")).toBe(true)
  })

  test("les filtres découpent par genre, dans l'ordre de DSH", () => {
    const entries = [
      { seq: 1, time: 0, kind: "turn", summary: "turn 1" },
      { seq: 2, time: 0, kind: "user", summary: "salut" },
      { seq: 3, time: 0, kind: "step", summary: "turn 1 · step 1" },
      { seq: 4, time: 0, kind: "tool", summary: "read a.ts" },
      { seq: 5, time: 0, kind: "thinking", summary: "je réfléchis" },
      { seq: 6, time: 0, kind: "assistant", summary: "voilà" },
    ] as never
    expect(TRACE_FILTERS).toEqual(["all", "tool", "thinking", "message", "progress"])
    expect(filterTraceEntries(entries, "all")).toHaveLength(6)
    expect(filterTraceEntries(entries, "tool").map((entry) => entry.kind)).toEqual(["tool"])
    expect(filterTraceEntries(entries, "thinking").map((entry) => entry.kind)).toEqual(["thinking"])
    expect(filterTraceEntries(entries, "message").map((entry) => entry.kind)).toEqual(["user", "assistant"])
    expect(filterTraceEntries(entries, "progress").map((entry) => entry.kind)).toEqual(["turn", "step"])
  })

  test("un tour produit ses lignes dans l'ordre du temps", () => {
    const lines = trace([
      asked("u", "fais ceci", { time: { created: 1000 } }),
      reply(
        "a",
        [
          { type: "step-start", id: "s1" },
          { type: "reasoning", id: "r", text: "je réfléchis" },
          tool("read", "completed", 1100, 1600, "src/a.ts"),
          { type: "text", id: "x", text: "voilà" },
          { type: "step-finish", id: "f", reason: "stop", cost: 0.001, tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } },
        ],
        { time: { created: 1050, completed: 2000 } },
      ),
    ])
    expect(lines.map((line) => line.kind)).toEqual(["turn", "user", "step", "thinking", "tool", "assistant"])
    expect(lines[0].summary).toBe("turn 1")
    expect(lines[0].status).toBe("ok")
    expect(lines[0].durationMs).toBe(1000)
    expect(lines[1].summary).toBe("fais ceci")
    expect(lines[2].summary).toBe("turn 1 · step 1")
    // Le résumé d'un outil joint son argument utile, comme DSH joint les arguments de l'appel.
    expect(lines[4].summary).toBe("read src/a.ts")
    expect(lines[4].status).toBe("ok")
    expect(lines[4].durationMs).toBe(500)
  })

  test("un outil en échec est en erreur, un outil en cours n'a pas de durée", () => {
    const lines = trace([
      asked("u", "fais"),
      reply("a", [tool("bash", "error", 0, 10, "boom"), tool("read", "running", 0, undefined, "a.ts")]),
    ])
    const tools = lines.filter((line) => line.kind === "tool")
    expect(tools[0].status).toBe("error")
    expect(tools[1].status).toBe("running")
    expect(tools[1].durationMs).toBeUndefined()
  })

  test("le bruit de protocole ne produit aucune ligne", () => {
    const lines = trace([asked("u", "fais"), reply("a", [tool("turn_plan", "completed", 0, 5, "x")])])
    expect(lines.filter((line) => line.kind === "tool")).toHaveLength(0)
  })

  test("un todo prend son genre propre", () => {
    const lines = trace([asked("u", "fais"), reply("a", [tool("todowrite", "completed", 0, 5, "3/5 tasks")])])
    expect(lines.some((line) => line.kind === "todo" && line.summary === "3/5 tasks")).toBe(true)
  })

  test("un tour en erreur est marqué", () => {
    const lines = trace([
      asked("u", "fais", { time: { created: 0 } }),
      reply("a", [], { error: { name: "ApiError", data: { message: "boom" } } }),
    ])
    expect(lines[0].status).toBe("error")
  })

  test("sans tour, la timeline est vide", () => {
    expect(traceEntries([])).toEqual([])
  })
})
