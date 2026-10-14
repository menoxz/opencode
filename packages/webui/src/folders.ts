/**
 * Les **dossiers de projet**, tels que le sélecteur les montre.
 *
 * La référence affiche `opencode-fork`, pas `C:\jeanluc\opencode-fork\packages\opencode`. C'est le
 * bon choix : dans une liste de sept lignes, le chemin entier répète six fois le même préfixe et
 * repousse le seul mot qui distingue les entrées. Le chemin complet reste dans l'infobulle.
 *
 * Ce module est **pur** : il ne connaît ni le JSX ni le réseau, donc il se vérifie par des tests.
 */

/** Le nom d'un dossier : son dernier segment, séparateurs `/` et `\` confondus. */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1]! : path
}

export type FolderChoice = {
  /** Le chemin entier — ce qu'on écrit dans le dossier de travail. */
  path: string
  /** Ce qu'on affiche : le nom, désambiguïsé s'il le faut. */
  name: string
  /** Est-ce le dossier courant ? C'est lui qui porte la coche. */
  current: boolean
}

/**
 * La **clé de comparaison** de deux chemins.
 *
 * Mesuré sur les données réelles du serveur : `GET /project` rend `C:/Users/jeanl` **et**
 * `C:\Users\jeanl` — le même dossier écrit avec deux séparateurs. Comparés tels quels, ils passaient
 * pour deux projets : la liste montrait deux fois `Users/jeanl`, et choisir l'un ou l'autre était un
 * tirage au sort. C'est précisément ce que ce module dit devoir empêcher.
 *
 * D'où : séparateur unifié, séparateur final retiré, casse abaissée — Windows ne distingue pas
 * `C:\Users` de `c:\users`. La clé ne sert qu'à **comparer** : le chemin rendu au serveur reste,
 * lui, celui du serveur, tel quel.
 */
export function pathKey(path: string): string {
  return path.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase()
}

/**
 * Les dossiers projetés pour le sélecteur.
 *
 * **Deux dossiers peuvent porter le même nom** (`…/jeanluc/opencodev2` et `…/autre/opencodev2`) :
 * afficher le nom seul rendrait alors deux lignes indiscernables, et choisir serait un tirage au
 * sort. On préfixe donc par le segment parent — mais **seulement** les noms en collision : allonger
 * les six autres pour un cas rare serait payer le cas général pour l'exception.
 *
 * Les doublons sont écartés par leur **clé**, pas par leur texte : deux écritures du même chemin
 * sont le même dossier, donc un seul choix.
 */
export function folderChoices(folders: string[], current: string): FolderChoice[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const path of folders) {
    if (typeof path !== "string" || path.trim().length === 0) continue
    const key = pathKey(path)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(path)
  }

  const names = unique.map((path) => folderName(path))
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  // Le courant se reconnaît par sa **clé** : sinon un chemin écrit autrement que le dossier du
  // serveur ne serait jamais marqué, et le sélecteur n'afficherait jamais de coche.
  const wanted = pathKey(current)
  return unique.map((path, index) => {
    const name = names[index]!
    const shown = (counts.get(name) ?? 0) > 1 ? parentTail(path) : name
    return { path, name: shown, current: pathKey(path) === wanted }
  })
}

/** `…/jeanluc/opencodev2` → `jeanluc/opencodev2` — le dernier segment le lève l'ambiguïté. */
function parentTail(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0)
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : (parts[0] ?? path)
}

/**
 * Le libellé du contrôle **refermé**.
 *
 * Une valeur absente n'est pas une absence : c'est l'état « dossier du serveur », qui se lit avec
 * le mot du `placeholder` — le même choix que pour le modèle et l'agent.
 */
export function folderLabel(value: string, placeholder: string): string {
  if (!value.trim()) return placeholder
  return folderName(value)
}
