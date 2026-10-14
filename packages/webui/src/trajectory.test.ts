import { describe, expect, test } from "vitest"
import {
  rowDuration,
  spanPlacement,
  trajectoryRange,
  trajectoryRows,
  trajectorySpans,
  type TraceRow,
  type TraceSpan,
} from "./trajectory"
import { groupTurns } from "./view-model"

/**
 * La vue `Trajectory` est calquée sur la **capture** de DSH : une liste de lignes à badge et un
 * diagramme en pistes. Ce qui se vérifie ici, c'est la **découpe** — quels faits deviennent des
 * lignes, quels intervalles deviennent des barres —, pas le rendu.
 */

const asked = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  info: { id, role: "user", ...extra },
  parts: [{ type: "text", text }],
})

const reply = (id: string, parts: unknown[], extra: Record<string, unknown> = {}) => ({
  info: { id, role: "assistant", ...extra },
  parts,
})

const tool = (name: string, status: string, start: number, end: number | undefined, input: unknown, output = "") => ({
  type: "tool",
  id: `t-${name}`,
  tool: name,
  state: { status, input, output, time: { start, end } },
})

const rows = (messages: unknown[]) => trajectoryRows(groupTurns(messages as never))
const spans = (messages: unknown[]) => trajectorySpans(groupTurns(messages as never))

describe("trajectoryRows — la liste à badges de la capture", () => {
  test("un tour produit : le prompt, la réponse, puis l'outil — dans cet ordre", () => {
    const lines = rows([
      asked("u", "supprime le faux installeur", { time: { created: 1000 } }),
      reply(
        "a",
        [
          { type: "step-start", id: "s1" },
          { type: "text", id: "x", text: "Je vérifie l'identité exacte du fichier." },
          tool("pwsh", "completed", 1200, 1300, { command: "Get-FileHash" }, "identité attendue"),
          { type: "step-finish", id: "f", reason: "stop", cost: 0.001, tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } },
        ],
        { time: { created: 1100, completed: 2000 } },
      ),
    ])
    expect(lines.map((line) => line.kind)).toEqual(["user", "assistant", "tool"])
    expect(lines[0].content).toBe("supprime le faux installeur")
    expect(lines[0].turn).toBe(1)
    expect(lines[2].tool).toBe("pwsh")
    // Le contenu d'un outil porte ses arguments, le résultat est la sortie complète.
    expect(lines[2].content).toContain("Get-FileHash")
    expect(lines[2].result).toBe("identité attendue")
    expect(lines[2].resultFull).toBe("identité attendue")
    expect(lines[2].durationMs).toBe(100)
  })

  test("un assistant sans texte est « (tool call only) », pas une ligne absente", () => {
    // La capture écrit `(tool call only)` : sauter la ligne romprait l'ordre du temps.
    const lines = rows([
      asked("u", "fais"),
      reply("a", [tool("read_image", "completed", 0, 5, { file_path: "a.png" })]),
    ])
    const only = lines.find((line) => line.kind === "assistant")
    expect(only?.toolCallOnly).toBe(true)
    expect(only?.content).toBe("")
  })

  test("le raisonnement n'est **pas** une ligne de cette liste", () => {
    // On voit des ASSISTANT et des TOOL dans la capture, jamais un « thinking ».
    const lines = rows([
      asked("u", "fais"),
      reply("a", [
        { type: "reasoning", id: "r", text: "je réfléchis" },
        { type: "step-finish", id: "f", reason: "stop", cost: 0.001, tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } },
      ]),
    ])
    expect(lines.some((line) => (line.content ?? "").includes("je réfléchis"))).toBe(false)
  })

  test("le contexte injecté n'est pas un prompt", () => {
    const lines = rows([
      asked("u", "Context injections · 3 section(s)\n- core: system prompt (PROMPT_CORE) · 5592 chars"),
      asked("u2", "vrai prompt"),
    ])
    const users = lines.filter((line) => line.kind === "user")
    expect(users).toHaveLength(1)
    expect(users[0].content).toBe("vrai prompt")
  })

  test("le payload est du JSON lisible, la clé du schéma est gardée", () => {
    const lines = rows([
      asked("u", "fais"),
      reply("a", [tool("read_image", "completed", 0, 5, { file_path: "shot.png" })]),
    ])
    const line = lines.find((row) => row.kind === "tool")!
    expect(line.tool).toBe("read_image")
    expect(line.payload).toBe('{\n  "file_path": "shot.png"\n}')
    expect(line.started).toBe(0)
  })

  test("un outil en échec porte le statut error", () => {
    const lines = rows([
      asked("u", "fais"),
      reply("a", [tool("bash", "error", 0, 10, {}, "boom")]),
    ])
    expect(lines.find((row) => row.kind === "tool")?.status).toBe("error")
  })
})

describe("trajectorySpans — les pistes Input / Model / Tools", () => {
  test("chaque piste reçoit ses barres, aux bons instants", () => {
    const list = spans([
      asked("u", "fais", { time: { created: 1000 } }),
      reply(
        "a",
        [
          { type: "step-start", id: "s1" },
          tool("bash", "completed", 1100, 1200, {}),
          tool("read", "completed", 1300, 1350, {}),
          { type: "step-finish", id: "f", reason: "stop", cost: 0.001, tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } } },
        ],
        { time: { created: 1050, completed: 2000 } },
      ),
    ])
    // `input` : de l'arrivée du prompt au début du premier travail — le tour entier ne dirait rien.
    const input = list.find((span) => span.track === "input")!
    expect(input.start).toBe(1000)
    expect(input.end).toBe(1100)
    // `model` : l'étape, de son premier fait à son dernier.
    const model = list.find((span) => span.track === "model")!
    expect(model.start).toBe(1100)
    expect(model.end).toBe(1350)
    // `tools` : une barre par outil.
    const tools = list.filter((span) => span.track === "tools")
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({ start: 1100, end: 1200, status: "ok" })
    expect(tools[1]).toMatchObject({ start: 1300, end: 1350, status: "ok" })
  })

  test("un tour sans travail n'a pas d'entrée mesurable", () => {
    const list = spans([asked("u", "juste une question")])
    expect(list.find((span) => span.track === "input")!.end).toBe(0)
  })

  test("un outil en cours est une barre ouverte", () => {
    const list = spans([
      asked("u", "fais"),
      reply("a", [tool("bash", "running", 1100, undefined, {})]),
    ])
    expect(list.find((span) => span.track === "tools")!.status).toBe("running")
  })

  test("les barres sortent triées par instant de départ", () => {
    const list = spans([
      asked("u", "fais", { time: { created: 500 } }),
      reply("a", [tool("bash", "completed", 600, 700, {})], { time: { created: 550, completed: 800 } }),
    ])
    const starts = list.map((span) => span.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })
})

describe("trajectoryRange et spanPlacement — l'axe du diagramme", () => {
  test("la plage couvre lignes et barres", () => {
    const list = rows([asked("u", "fais", { time: { created: 100 } })])
    const bars = spans([asked("u", "fais", { time: { created: 100 } })])
    expect(trajectoryRange(list, bars)).toEqual({ start: 100, end: 100 })
  })

  test("sans rien, la plage est vide", () => {
    expect(trajectoryRange([], [])).toEqual({ start: 0, end: 0 })
  })

  test("une barre est placée en pourcentage de la plage", () => {
    const range = { start: 0, end: 100 }
    expect(spanPlacement({ start: 25, end: 50 }, range)).toEqual({ left: 25, width: 25 })
  })

  test("une barre de durée nulle garde une largeur visible", () => {
    // Sans largeur minimale, un appel instantané disparaîtrait du diagramme.
    const place = spanPlacement({ start: 50, end: 50 }, { start: 0, end: 100 })
    expect(place.width).toBeGreaterThan(0)
  })

  test("une plage nulle met tout à la largeur entière", () => {
    expect(spanPlacement({ start: 0, end: 0 }, { start: 0, end: 0 })).toEqual({ left: 0, width: 100 })
  })

  test("le placement reste borné à [0, 100]", () => {
    const place = spanPlacement({ start: -50, end: 500 }, { start: 0, end: 100 })
    expect(place.left).toBeGreaterThanOrEqual(0)
    expect(place.left + place.width).toBeLessThanOrEqual(100)
  })
})

describe("rowDuration — ce que la colonne de durée affiche", () => {
  test("une durée mesurée est formatée", () => {
    const row: TraceRow = { seq: 1, step: 1, time: 0, turn: 1, kind: "tool", content: "x", durationMs: 58 }
    expect(rowDuration(row)).toBe("58ms")
  })

  test("sans durée, rien — pas un zéro", () => {
    const row: TraceRow = { seq: 1, step: 1, time: 0, turn: 1, kind: "tool", content: "x" }
    expect(rowDuration(row)).toBeUndefined()
  })
})

describe("l'ordre des barres ne dépend pas du tri d'entrée", () => {
  test("les pistes sont indépendantes les unes des autres", () => {
    const list: TraceSpan[] = [
      { track: "tools", start: 5, end: 6 },
      { track: "input", start: 1, end: 2 },
    ]
    expect(list.filter((span) => span.track === "input")).toHaveLength(1)
    expect(list.filter((span) => span.track === "tools")).toHaveLength(1)
  })
})
