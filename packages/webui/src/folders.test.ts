import { describe, expect, test } from "vitest"
import { folderChoices, folderLabel, folderName } from "./folders"

describe("folderName — le nom d'un dossier", () => {
  test("le dernier segment, quel que soit le séparateur", () => {
    expect(folderName("C:\\jeanluc\\opencode-fork")).toBe("opencode-fork")
    expect(folderName("/home/jean/mcp-servers")).toBe("mcp-servers")
  })

  test("un séparateur final ne donne pas un nom vide", () => {
    // Sinon une entrée qui se termine par `\` s'afficherait sans nom, et paraîtrait cassée.
    expect(folderName("C:\\jeanluc\\auxiflow\\")).toBe("auxiflow")
    expect(folderName("/home/jean/opencodev2/")).toBe("opencodev2")
  })

  test("un nom sans séparateur est son propre nom", () => {
    expect(folderName("deepseek_harness")).toBe("deepseek_harness")
  })
})

describe("folderChoices — la liste du sélecteur", () => {
  test("le nom seul, pas le chemin : la référence montre `opencode-fork`", () => {
    const choices = folderChoices(["C:\\jeanluc\\opencode-fork", "C:\\jeanluc\\auxiflow"], "C:\\jeanluc\\auxiflow")
    expect(choices).toEqual([
      { path: "C:\\jeanluc\\opencode-fork", name: "opencode-fork", current: false },
      { path: "C:\\jeanluc\\auxiflow", name: "auxiflow", current: true },
    ])
  })

  test("deux noms identiques se désambiguïsent par le segment parent", () => {
    // Sans cela, deux lignes porteraient le même mot et choisir serait un tirage au sort.
    const choices = folderChoices(["C:\\a\\opencodev2", "C:\\b\\opencodev2"], "C:\\a\\opencodev2")
    expect(choices.map((choice) => choice.name)).toEqual(["a/opencodev2", "b/opencodev2"])
  })

  test("le même dossier deux fois n'est pas deux choix", () => {
    const choices = folderChoices(["C:\\a\\x", "C:\\a\\x"], "C:\\a\\x")
    expect(choices).toHaveLength(1)
  })

  test("le même dossier écrit avec deux séparateurs n'est pas deux choix", () => {
    // Cas **mesuré** sur les données réelles : `GET /project` rend `C:/Users/jeanl` ET
    // `C:\Users\jeanl` — le même dossier. Comparés comme du texte, les deux passaient, et la liste
    // affichait deux fois `Users/jeanl` : choisir était un tirage au sort.
    const choices = folderChoices(["C:/Users/jeanl", "C:\\Users/jeanl"], "C:\\Users/jeanl")
    expect(choices).toHaveLength(1)
    expect(choices[0]!.name).toBe("jeanl")
  })

  test("le courant se reconnaît malgré les séparateurs et la casse", () => {
    // Sans cela, le dossier de travail du serveur ne serait jamais marqué d'une coche dès qu'il est
    // écrit autrement que dans la liste — et le sélecteur n'en afficherait jamais aucune.
    const choices = folderChoices(["C:\\jeanluc\\opencode-fork"], "c:/jeanluc/opencode-fork")
    expect(choices[0]!.current).toBe(true)
  })

  test("un séparateur final ne fait pas un second dossier", () => {
    expect(folderChoices(["C:\\a\\x", "C:\\a\\x\\"], "C:\\a\\x")).toHaveLength(1)
  })

  test("les entrées vides sont écartées — une ligne sans dossier ne dit rien", () => {
    expect(folderChoices(["C:\\a\\x", "", "   "], "C:\\a\\x")).toHaveLength(1)
  })

  test("le courant est marqué, et un seul", () => {
    const choices = folderChoices(["C:\\a", "C:\\b"], "C:\\b")
    expect(choices.filter((choice) => choice.current).map((choice) => choice.path)).toEqual(["C:\\b"])
  })

  test("aucun courant quand la valeur n'est pas dans la liste — c'est l'état du dossier du serveur", () => {
    // Le cas mesuré : le rail ouvre sur le dossier du serveur, qui n'est pas dans `/project`.
    // Inventer une coche serait faux ; n'en mettre aucune est exact.
    expect(folderChoices(["C:\\a", "C:\\b"], "").every((choice) => !choice.current)).toBe(true)
  })
})

describe("folderLabel — le contrôle refermé", () => {
  test("le nom du dossier courant", () => {
    expect(folderLabel("C:\\jeanluc\\opencode-fork", "server directory")).toBe("opencode-fork")
  })

  test("une valeur vide n'est pas une absence : c'est le dossier du serveur", () => {
    expect(folderLabel("", "server directory")).toBe("server directory")
  })
})
