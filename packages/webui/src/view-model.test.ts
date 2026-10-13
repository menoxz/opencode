import { describe, expect, test } from "vitest"
import {
  canAlways,
  dropPermission,
  isVisiblePart,
  permissionActions,
  reducePermissions,
  toolDetail,
  toolStatusLabel,
  toolTitle,
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
    // Relevé sur une session réelle : 6 step-start et 6 step-finish, sans aucun contenu.
    expect(isVisiblePart({ type: "step-start" })).toBe(false)
    expect(isVisiblePart({ type: "step-finish" })).toBe(false)
    expect(isVisiblePart({ type: "snapshot" })).toBe(false)
    expect(isVisiblePart({ type: "patch" })).toBe(false)
  })

  test("un contenu vide ne produit pas de bloc vide", () => {
    expect(isVisiblePart({ type: "text", text: "" })).toBe(false)
    expect(isVisiblePart({ type: "reasoning", text: "   " })).toBe(false)
  })

  test("une réflexion non vide s'affiche, elle", () => {
    expect(isVisiblePart({ type: "reasoning", text: "je pèse les options" })).toBe(true)
  })
})
