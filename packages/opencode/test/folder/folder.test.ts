import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Folder } from "@/folder"

/**
 * Le parcours de dossiers — les règles qui décident, et l'erreur qui doit se dire.
 *
 * Ce qui est testé ici n'est pas l'appel système : c'est ce qui a été **décidé** — dossiers
 * seulement, tri lisible, borne, et surtout un chemin absent qui **rend une erreur** au lieu d'une
 * liste vide. C'est le défaut de `File.list` qu'on vient de corriger (`200` avec `[]`), et c'est
 * celui qu'il faut empêcher de revenir.
 */
const withLayer = <A, E>(effect: Effect.Effect<A, E, Folder.Service>) =>
  Effect.runPromise(Effect.provide(effect, Folder.layer))

/**
 * Le refus d'un chemin, **comme valeur**. `Effect.runPromise` rejette avec l'erreur typée quand
 * l'effet échoue : c'est la voie la plus courte pour l'inspecter sans démonter un `Exit`.
 */
const refusal = (path: string) =>
  withLayer(Effect.flatMap(Folder.Service, (folders) => folders.list(path))).then(
    () => undefined,
    (error: Folder.NotAFolder) => error,
  )

describe("projection des entrées d'un dossier", () => {
  test("ne garde que les dossiers", () => {
    const entries = [
      { name: "src", directory: true },
      { name: "readme.md", directory: false },
      { name: "tests", directory: true },
    ]
    expect(Folder.project(entries).map((entry) => entry.name)).toEqual(["src", "tests"])
  })

  test("trie sans tenir compte de la casse — `Zebre` ne passe pas avant `autruche`", () => {
    const entries = [
      { name: "Zebre", directory: true },
      { name: "autruche", directory: true },
      { name: "École", directory: true },
    ]
    // Sensibilité à la casse **et** aux accents : un tri brut rangerait `Zebre` en tête, parce que
    // les majuscules précèdent les minuscules en unités de code.
    expect(Folder.project(entries).map((entry) => entry.name)).toEqual(["autruche", "École", "Zebre"])
  })

  test("borne le nombre d'entrées", () => {
    const many = Array.from({ length: Folder.MAX_ENTRIES + 25 }, (_, index) => ({
      name: `d${String(index).padStart(4, "0")}`,
      directory: true,
    }))
    expect(Folder.project(many)).toHaveLength(Folder.MAX_ENTRIES)
  })

  test("le chemin d'une entrée est son nom — le parent est déjà connu", () => {
    expect(Folder.project([{ name: "src", directory: true }])).toEqual([{ name: "src", path: "src" }])
  })
})

describe("parent d'un chemin", () => {
  test("un dossier Windows remonte d'un cran, avec une seule forme de séparateur", () => {
    expect(Folder.parentOf("C:\\jeanluc\\opencode-fork")).toBe("C:/jeanluc")
  })

  test("sous un lecteur, le parent est la racine du lecteur — pas `C:`", () => {
    // Sans la barre, `C:` n'est pas un dossier : le bouton « remonter » ne mènerait nulle part.
    expect(Folder.parentOf("C:\\jeanluc")).toBe("C:/")
  })

  test("la racine d'un lecteur n'a pas de parent", () => {
    expect(Folder.parentOf("C:\\")).toBe(null)
  })

  test("un chemin POSIX remonte, et sa racine n'a pas de parent", () => {
    expect(Folder.parentOf("/home/jean")).toBe("/home")
    expect(Folder.parentOf("/")).toBe(null)
  })

  test("la barre finale ne change pas le parent", () => {
    expect(Folder.parentOf("C:\\jeanluc\\opencode-fork\\")).toBe("C:/jeanluc")
  })
})

describe("parcours réel", () => {
  test("liste les sous-dossiers, triés, et écarte les fichiers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-folder-"))
    await mkdir(join(dir, "zeta"))
    await mkdir(join(dir, "Alpha"))
    await writeFile(join(dir, "note.txt"), "x")

    const listing = await withLayer(Effect.flatMap(Folder.Service, (folders) => folders.list(dir)))
    expect(listing.entries.map((entry) => entry.name)).toEqual(["Alpha", "zeta"])
    expect(listing.path).toBe(dir)
    expect(listing.parent).toBeTruthy()
  })

  test("un chemin absent rend une erreur typée, **jamais** une liste vide", async () => {
    const error = await refusal(join(tmpdir(), "opencode-absent-xyz"))
    expect(error?.reason).toBe("path not found")
  })

  test("un fichier n'est pas un dossier, et le dit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-folder-"))
    const file = join(dir, "note.txt")
    await writeFile(file, "x")
    expect((await refusal(file))?.reason).toBe("not a directory")
  })

  test("un chemin vide est refusé sans toucher au disque", async () => {
    expect((await refusal("   "))?.reason).toBe("no path given")
  })
})
