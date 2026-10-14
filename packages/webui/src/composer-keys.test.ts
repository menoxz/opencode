import { describe, expect, test } from "vitest"
import {
  ESC_ABORT_WINDOW_MS,
  commandChoices,
  commandInsert,
  fileInsert,
  filterCommands,
  historyStep,
  isDoubleEscape,
  mentionQuery,
  nextChoice,
  promptHistory,
  replaceRange,
  slashQuery,
} from "./composer-keys"

describe("slashQuery — la commande s'écrit en tête, sans espace", () => {
  test("un `/` seul demande la liste entière", () => {
    expect(slashQuery("/")).toBe("")
  })

  test("ce qui suit le `/` est la requête", () => {
    expect(slashQuery("/init")).toBe("init")
  })

  test("dès qu'un espace apparaît, on écrit l'argument — plus de requête", () => {
    expect(slashQuery("/init now")).toBeUndefined()
  })

  test("un texte ordinaire n'ouvre aucune liste", () => {
    expect(slashQuery("hello")).toBeUndefined()
  })

  test("un retour à la ligne ferme la requête", () => {
    expect(slashQuery("/init\nsuite")).toBeUndefined()
  })

  test("un `/` en milieu de texte n'ouvre rien", () => {
    expect(slashQuery("voir /init")).toBeUndefined()
  })
})

describe("mentionQuery — le `@` doit commencer un mot", () => {
  test("un `@` en tête prend le mot qui suit", () => {
    expect(mentionQuery("@src", 4)).toEqual({ query: "src", start: 0, end: 4 })
  })

  test("un `@` après un espace ouvre une mention", () => {
    expect(mentionQuery("lis @src", 8)).toEqual({ query: "src", start: 4, end: 8 })
  })

  test("un `@` au milieu d'un mot n'ouvre rien", () => {
    expect(mentionQuery("moi@exemple.com", 15)).toBeUndefined()
  })

  test("la mention court jusqu'au blanc suivant, pas jusqu'au curseur", () => {
    // Curseur au milieu du mot : c'est le mot entier qui sera remplacé.
    expect(mentionQuery("@src/app.ts suite", 4)).toEqual({ query: "src", start: 0, end: 11 })
  })

  test("un espace après le `@` ferme la mention", () => {
    expect(mentionQuery("@ src", 5)).toBeUndefined()
  })

  test("sans `@`, rien", () => {
    expect(mentionQuery("aucune mention", 13)).toBeUndefined()
  })
})

describe("replaceRange — remplacer, et poser le curseur après", () => {
  test("il remplace l'intervalle et laisse le reste intact", () => {
    expect(replaceRange("@src suite", 0, 4, "src/app.ts ")).toEqual({
      text: "src/app.ts  suite",
      caret: 11,
    })
  })

  test("il pose le curseur juste après l'insertion", () => {
    const edit = replaceRange("lis @src", 4, 8, "src/a.ts ")
    expect(edit.text).toBe("lis src/a.ts ")
    expect(edit.caret).toBe(13)
  })
})

describe("les insertions — un espace, pour écrire l'argument juste après", () => {
  test("une commande s'insère avec son `/`", () => {
    expect(commandInsert("init")).toBe("/init ")
  })

  test("un fichier s'insère avec son chemin", () => {
    expect(fileInsert("src/a.ts")).toBe("src/a.ts ")
  })
})

describe("nextChoice — ce que fait Tab sur l'agent", () => {
  const choices = [{ value: "build" }, { value: "plan" }, { value: "general" }]

  test("il avance d'un cran", () => {
    expect(nextChoice(choices, "build")).toBe("plan")
  })

  test("il boucle depuis la fin", () => {
    expect(nextChoice(choices, "general")).toBe("build")
  })

  test("une valeur inconnue entre au premier rang au lieu d'être un cul-de-sac", () => {
    expect(nextChoice(choices, "agent-maison")).toBe("build")
  })

  test("sans choix, il ne change rien", () => {
    expect(nextChoice([], "build")).toBe("build")
  })
})

describe("isDoubleEscape — deux Échap valent un arrêt", () => {
  test("rapprochés, oui", () => {
    expect(isDoubleEscape(1000, 1000 + ESC_ABORT_WINDOW_MS)).toBe(true)
  })

  test("trop espacés, non", () => {
    expect(isDoubleEscape(1000, 1000 + ESC_ABORT_WINDOW_MS + 1)).toBe(false)
  })

  test("le premier Échap n'arrête rien", () => {
    expect(isDoubleEscape(undefined, 1000)).toBe(false)
  })
})

describe("historyStep — les flèches dans l'historique", () => {
  const history = ["le plus récent", "au milieu", "le plus ancien"]

  test("monter depuis un brouillon neuf va au plus récent", () => {
    expect(historyStep(history, -1, "up")).toEqual({ text: "le plus récent", index: 0 })
  })

  test("monter encore remonte le temps", () => {
    expect(historyStep(history, 0, "up")).toEqual({ text: "au milieu", index: 1 })
  })

  test("monter au-delà du plus ancien reste sur place", () => {
    expect(historyStep(history, 2, "up")).toEqual({ text: "le plus ancien", index: 2 })
  })

  test("descendre depuis le plus récent revient au brouillon vide", () => {
    expect(historyStep(history, 0, "down")).toEqual({ text: "", index: -1 })
  })

  test("descendre redescend vers le présent", () => {
    expect(historyStep(history, 2, "down")).toEqual({ text: "au milieu", index: 1 })
  })

  test("sans historique, rien ne bouge", () => {
    expect(historyStep([], -1, "up")).toEqual({ text: "", index: -1 })
  })
})

describe("promptHistory — dérivé des messages, du plus récent au plus ancien", () => {
  const message = (role: string, text: string) => ({ info: { id: "x", role }, parts: [{ type: "text", text }] })

  test("il ne garde que les prompts de l'utilisateur, dans le bon sens", () => {
    const messages = [
      message("user", "premier"),
      message("assistant", "réponse"),
      message("user", "second"),
    ] as never
    expect(promptHistory(messages)).toEqual(["second", "premier"])
  })

  test("un message sans texte ne laisse pas une entrée vide", () => {
    const messages = [message("user", "   "), message("user", "vrai")] as never
    expect(promptHistory(messages)).toEqual(["vrai"])
  })

  test("les parties non-texte sont ignorées", () => {
    const messages = [
      { info: { id: "x", role: "user" }, parts: [{ type: "file", filename: "a.png" }, { type: "text", text: "regarde" }] },
    ] as never
    expect(promptHistory(messages)).toEqual(["regarde"])
  })
})

describe("filterCommands — le nom d'abord, la description ensuite", () => {
  const commands = [
    { name: "init", description: "Créer le fichier de contexte" },
    { name: "commit", description: "Faire un commit" },
  ]

  test("sans requête, la liste entière", () => {
    expect(filterCommands(commands, "")).toHaveLength(2)
  })

  test("le nom se cherche", () => {
    expect(filterCommands(commands, "ini").map((c) => c.name)).toEqual(["init"])
  })

  test("la description se cherche aussi — on ne connaît pas toujours le nom", () => {
    expect(filterCommands(commands, "contexte").map((c) => c.name)).toEqual(["init"])
  })

  test("la casse n'importe pas", () => {
    expect(filterCommands(commands, "COMMIT").map((c) => c.name)).toEqual(["commit"])
  })
})

describe("commandChoices — la projection des commandes du serveur", () => {
  test("il ne garde que le nom, la description et la provenance", () => {
    const payload = [{ name: "init", description: "d", template: "très long gabarit", hints: ["x"], source: "command" }]
    expect(commandChoices(payload)).toEqual([{ name: "init", description: "d", source: "command" }])
  })

  test("il trie par nom", () => {
    expect(commandChoices([{ name: "z" }, { name: "a" }]).map((c) => c.name)).toEqual(["a", "z"])
  })

  test("une entrée sans nom est écartée", () => {
    expect(commandChoices([{ description: "sans nom" }, { name: "ok" }])).toHaveLength(1)
  })

  test("une charge qui n'est pas une liste ne casse rien", () => {
    expect(commandChoices(undefined)).toEqual([])
    expect(commandChoices({ nope: true })).toEqual([])
  })
})
