import { describe, expect, test } from "vitest"
import { join, normalizePath, tail } from "./folder-browser"

/**
 * Les règles pures du parcours de dossiers.
 *
 * Elles ont été écrites après une **mesure** : entrer dans un dossier affichait
 * `…\opencode-fork/.dsh-vision-toolkit`, les barres du chemin d'origine mêlées à la jonction. Le
 * serveur rend le chemin tel qu'il l'a reçu, donc c'est bien ici qu'on unifie — et pas à l'affichage,
 * sinon deux écritures du même dossier circuleraient.
 */
describe("jonction d'un chemin", () => {
  test("unifie les séparateurs avec le nom du sous-dossier", () => {
    expect(join("C:\\jeanluc\\opencode-fork", "src")).toBe("C:/jeanluc/opencode-fork/src")
  })

  test("ne double pas la barre quand le parent en porte déjà une", () => {
    expect(join("C:/jeanluc/", "src")).toBe("C:/jeanluc/src")
  })

  test("garde la barre d'une racine de lecteur — `C:` n'est pas un dossier", () => {
    expect(join("C:/", "jeanluc")).toBe("C:/jeanluc")
  })

  test("un parent vide rend le nom seul", () => {
    expect(join("", "src")).toBe("src")
  })
})

describe("normalisation d'un chemin envoyé", () => {
  test("unifie les barres", () => {
    expect(normalizePath("C:\\jeanluc\\opencode-fork")).toBe("C:/jeanluc/opencode-fork")
  })

  test("ne retire **pas** la barre finale d'une racine", () => {
    // `C:` seul n'est pas un dossier : le retirer ferait échouer le parcours depuis un disque.
    expect(normalizePath("C:\\")).toBe("C:/")
  })

  test("un chemin vide reste vide, pour que l'appelant le refuse", () => {
    expect(normalizePath("   ")).toBe("")
  })
})

describe("libellé court d'un chemin", () => {
  test("garde la fin, qui est ce qui distingue deux dossiers", () => {
    expect(tail("C:/jeanluc/opencode-fork", 10)).toBe("…ncode-fork")
  })

  test("laisse un chemin court tel quel, sans barre finale", () => {
    expect(tail("C:/jeanluc/")).toBe("C:/jeanluc")
  })
})
