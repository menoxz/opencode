import { For, Show, createSignal, onMount } from "solid-js"
import { serverUrl } from "./client"
import { ChevronIcon, FolderIcon } from "./icons"

/**
 * Choisir un dossier **en le regardant**, au lieu de taper son chemin.
 *
 * Pourquoi côté serveur, et non un dialogue natif : `showDirectoryPicker()` rend un *handle* sans
 * chemin, et `<input webkitdirectory>` ne rend que des chemins **relatifs** — donc aucun des deux ne
 * peut alimenter un dossier de travail, qui est un chemin absolu. Un dialogue ouvert par le serveur
 * s'afficherait sur la machine du serveur : invisible pour un client distant, et hors de portée de
 * tout test. On demande donc au serveur de **lister** les dossiers d'un chemin (`GET /folder`).
 *
 * Le refus est dit, jamais avalé : `GET /folder` rend `404` avec sa raison, et un chemin qu'on ne
 * peut pas ouvrir s'affiche comme tel — c'est le défaut qu'on vient de corriger sur `GET /file`, qui
 * rendait `200` avec une liste vide.
 */

export type FolderListing = {
  path: string
  parent: string | null
  entries: Array<{ name: string; path: string }>
}

export async function fetchFolders(path: string): Promise<FolderListing> {
  const response = await fetch(`${serverUrl}/folder?path=${encodeURIComponent(path)}`)
  if (!response.ok) {
    // Le corps porte la raison (`path not found`, `not a directory`, `directory not readable`) :
    // elle est plus utile qu'un code, et elle distingue trois causes qu'un « échec » confondrait.
    const body = (await response.json().catch(() => undefined)) as { reason?: string } | undefined
    throw new Error(body?.reason ?? `This folder cannot be opened (${response.status})`)
  }
  return (await response.json()) as FolderListing
}

/** Un nom de dossier lisible dans la largeur du rail : on garde la fin, qui est ce qui distingue. */
export function tail(path: string, keep = 34): string {
  const clean = path.replace(/[\\/]+$/, "")
  if (clean.length <= keep) return clean
  return `…${clean.slice(clean.length - keep)}`
}

/**
 * Le chemin d'un sous-dossier, **avec un seul séparateur**.
 *
 * Relevé à la mesure : entrer dans un dossier affichait `…\opencode-fork/.dsh-vision-toolkit` — les
 * barres du chemin d'origine mêlées à la jonction. On unifie donc ce qu'on **envoie** : le serveur
 * rend le chemin tel qu'il l'a reçu, donc une seule écriture circule, et jamais deux formes du même
 * dossier dans une liste de choix (défaut déjà payé sur `GET /project`).
 *
 * L'exception Windows est traitée : `C:/` garde sa barre (`C:/nom`, et non `C:/nom` sans racine).
 */
export function join(base: string, name: string): string {
  const clean = base.replace(/\\+/g, "/").replace(/\/+$/, "")
  return clean ? `${clean}/${name}` : name
}

/** Ce qu'on envoie au serveur : séparateurs unifiés, sans perdre la racine (`C:/` reste `C:/`). */
export function normalizePath(path: string): string {
  return path.replace(/\\+/g, "/").trim()
}

export function FolderBrowser(props: {
  /** Où l'on commence — le dossier courant s'il y en a un, sinon celui du serveur. */
  start?: string
  onChoose: (path: string) => void
}) {
  const [listing, setListing] = createSignal<FolderListing | undefined>()
  const [error, setError] = createSignal<string | undefined>()
  const [busy, setBusy] = createSignal(false)

  const go = async (path: string) => {
    const target = normalizePath(path)
    if (!target) {
      setListing(undefined)
      setError("No folder to open — type a path, or pick one below")
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      setListing(await fetchFolders(target))
    } catch (cause) {
      setListing(undefined)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  onMount(() => void go(props.start ?? ""))

  return (
    <div class="folder-browse">
      <div class="folder-browse-head">
        <button
          class="icon-btn"
          title="Up one folder"
          aria-label="Up one folder"
          disabled={!listing()?.parent}
          onClick={() => void go(listing()?.parent ?? "")}
        >
          <ChevronIcon size={16} open={true} />
        </button>
        <span class="folder-browse-path" title={listing()?.path ?? props.start ?? ""}>
          {tail(listing()?.path ?? props.start ?? "")}
        </span>
      </div>

      <Show when={error()}>
        <p class="folder-browse-error">{error()}</p>
      </Show>

      <div class="folder-browse-list">
        <Show when={!error() && (listing()?.entries.length ?? 0) === 0 && !busy()}>
          <p class="folder-browse-empty">No sub-folder here</p>
        </Show>
        <For each={listing()?.entries ?? []}>
          {(entry) => (
            <button
              class="folder-browse-row"
              title={entry.path}
              onClick={() => void go(join(listing()!.path, entry.name))}
            >
              <FolderIcon size={16} />
              <span class="folder-browse-name">{entry.name}</span>
            </button>
          )}
        </For>
      </div>

      <Show when={listing()}>
        <button class="rail-button folder-browse-choose" onClick={() => props.onChoose(listing()!.path)}>
          Use this folder
        </button>
      </Show>
    </div>
  )
}
