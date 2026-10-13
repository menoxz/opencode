import { describe, expect, test } from "vitest"
import {
  canAlways,
  boundLines,
  diffLabel,
  dropPermission,
  fileDiff,
  formatCost,
  formatCount,
  formatDuration,
  groupSteps,
  groupTurns,
  isVisiblePart,
  OUTPUT_PREVIEW_LINES,
  patchLabel,
  permissionActions,
  proseKind,
  reducePermissions,
  reduceThread,
  stepSummary,
  toolDetail,
  toolOutputLines,
  toolStatusLabel,
  toolTitle,
  type Message,
  type PermissionRequest,
  type ToolState,
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
