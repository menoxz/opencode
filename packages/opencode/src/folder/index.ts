/**
 * Parcourir le système de fichiers pour **choisir un dossier**.
 *
 * Pourquoi ce module existe, alors que `File.list` sait déjà lister un dossier : **`File.list` est
 * borné au projet**. Il résout `path.join(ctx.directory, dir)` — donc un chemin **absolu** y est
 * traité comme relatif, donne un chemin qui n'existe pas, et l'erreur est avalée. Mesuré le
 * 2026-10-15 sur l'instance : `GET /file?path=C:\Users\jeanl` rend **200 avec `[]`**, indiscernable
 * d'un dossier vide. Or c'est précisément **hors du projet** qu'on choisit un workspace : les sept
 * dossiers de la référence sont tous des voisins du dépôt courant.
 *
 * Trois décisions qui gouvernent ce fichier :
 *
 * 1. **Les dossiers seulement.** On choisit un dossier de travail : lister quatre mille fichiers
 *    pour en désigner un serait du bruit, et la question posée est « où est le dossier », pas
 *    « qu'y a-t-il dedans ».
 * 2. **L'échec se dit.** Chemin absent, fichier au lieu d'un dossier, dossier illisible : trois
 *    causes distinctes, une erreur typée qui les nomme. Rendre une liste vide serait exactement le
 *    défaut qu'on vient de corriger.
 * 3. **`node:fs/promises` plutôt que `FileSystem.FileSystem`.** Le dépôt préfère le service Effect,
 *    mais je n'ai pas pu établir son API (`@opencode-ai/core/filesystem` n'est pas dans l'arbre), et
 *    se tromper d'API dans un service non vérifiable coûte plus cher que l'écart. Précédent dans ce
 *    même `src` : `tool/tasks-store.ts` importe `node:fs/promises`. À reprendre quand l'API du
 *    service sera établie.
 *
 * La partie qui a des règles (**projeter**, **parentDe**) est pure : elle se vérifie sans disque.
 */

import { Context, Effect, Layer, Schema } from "effect"
import { readdir, stat } from "node:fs/promises"

/** Un dossier proposé au choix. Le nom s'affiche, le chemin est ce qu'on renvoie au serveur. */
export const Entry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
}).annotate({ identifier: "FolderEntry" })
export type Entry = Schema.Schema.Type<typeof Entry>

/** Ce que le parcours rend : où l'on est, d'où l'on vient, ce qu'on peut ouvrir. */
export const Listing = Schema.Struct({
  path: Schema.String,
  /** Le dossier parent, `null` à la racine — il n'y a pas de « remonter » depuis un disque. */
  parent: Schema.NullOr(Schema.String),
  entries: Schema.Array(Entry),
}).annotate({ identifier: "FolderListing" })
export type Listing = { path: string; parent: string | null; entries: Entry[] }

/**
 * Un chemin qu'on ne peut pas parcourir. Trois causes, une seule forme : la route les traduit en
 * `404`, parce que du point de vue de qui demande « montre-moi ce dossier », les trois disent la
 * même chose — il n'y a rien à montrer ici.
 */
export class NotAFolder extends Schema.TaggedErrorClass<NotAFolder>()(
  "@opencode/FolderNotAFolder",
  {
    path: Schema.String,
    reason: Schema.String,
  },
  // Le statut est déclaré **ici** et non traduit au handler : la classe est le contrat, et un
  // chemin qu'on ne peut pas parcourir est un `404` — la ressource demandée n'existe pas.
  { httpApiStatus: 404 },
) {}

/**
 * Combien de dossiers on rend. Un dossier qui en contient dix mille ne se parcourt pas à l'œil :
 * borner dit la limite au lieu de figer la page. Même règle que les sorties d'outil du fil.
 */
export const MAX_ENTRIES = 500

/**
 * Les entrées d'un dossier, **projetées** : dossiers seulement, triés, bornés.
 *
 * Le tri est insensible à la casse et aux accents — `École` se range avec `ecole`, pas après `z`.
 * Comparer les noms bruts placerait les majuscules avant les minuscules (`C` < `a` en unités de
 * code), ce qui range `Zebre` avant `autruche` : un ordre qui ne se lit pas comme un ordre.
 */
export function project(entries: ReadonlyArray<{ name: string; directory: boolean }>): Entry[] {
  const folders = entries.filter((entry) => entry.directory).map((entry) => entry.name)
  folders.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
  return folders.slice(0, MAX_ENTRIES).map((name) => ({ name, path: name }))
}

/**
 * Le parent d'un chemin, ou `null` quand il n'y en a pas.
 *
 * `dirname` sur une racine rend la racine elle-même (`C:\` → `C:\`) : sans ce test, le bouton
 * « remonter » tournerait en rond sur place au lieu de disparaître. Les séparateurs sont rendus en
 * `/` — la route accepte les deux, et un seul séparateur dans les chemins rendus évite deux
 * écritures du même dossier dans une liste de choix (défaut déjà payé sur `GET /project`).
 */
export function parentOf(path: string): string | null {
  const clean = path.replace(/[\\/]+$/, "")
  if (!clean) return null
  if (/^[A-Za-z]:$/.test(clean)) return null
  const parts = clean.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 1) return clean.startsWith("/") ? null : null
  const tail = parts.slice(0, -1).join("/")
  if (/^[A-Za-z]:$/.test(tail)) return `${tail}/`
  return clean.startsWith("/") ? `/${tail}` : tail
}

export interface Interface {
  /** Liste les dossiers d'un chemin **absolu**. */
  readonly list: (path: string) => Effect.Effect<Listing, NotAFolder>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Folder") {}

export const layer = Layer.succeed(Service, {
  list: Effect.fn("Folder.list")(function* (path: string) {
    const target = path.trim()
    if (!target) return yield* new NotAFolder({ path, reason: "no path given" })

    const info = yield* Effect.tryPromise({
      try: () => stat(target),
      catch: () => new NotAFolder({ path: target, reason: "path not found" }),
    })
    if (!info.isDirectory()) return yield* new NotAFolder({ path: target, reason: "not a directory" })

    /**
     * Les entrées du dossier, **avec leur type** (`withFileTypes`).
     *
     * La première version listait les noms puis faisait un `stat` par entrée, et écrasait l'échec
     * d'une entrée illisible dans le canal d'erreur — ce qui élargissait le type de l'effet entier
     * à `NotAFolder | undefined` (relevé au typecheck). `Dirent` donne le type sans second appel
     * système : un appel au lieu de N, et aucune erreur à rattraper.
     *
     * Limite assumée : un **lien symbolique** vers un dossier n'est pas suivi (`isDirectory()` est
     * faux pour lui). Un dossier lié n'apparaît donc pas dans la liste — mieux vaut cela qu'un lien
     * mort présenté comme un dossier ouvrable.
     */
    const dirents = yield* Effect.tryPromise({
      try: () => readdir(target, { withFileTypes: true }),
      catch: () => new NotAFolder({ path: target, reason: "directory not readable" }),
    })

    const raw = dirents.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))

    return { path: target, parent: parentOf(target), entries: project(raw) } satisfies Listing
  }),
})

export * as Folder from "."

/**
 * La couche que l'application fournit. Cette couche n'a aucune dépendance : le parcours lit le
 * disque directement (`node:fs/promises`), il n'a besoin d'aucun autre service.
 */
export const defaultLayer = layer
