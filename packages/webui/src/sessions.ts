/**
 * Ce qu'une session porte réellement, relevé sur le serveur (`GET /session`) :
 *
 *   { id, slug, projectID, directory, path, agent, model, cost, tokens, summary, time, title,
 *     goalState, version }
 *
 * Deux faits ont décidé de ce module :
 *
 *   - `path` est **relatif** (`packages/opencode`) là où `directory` est absolu
 *     (`C:\jeanluc\opencode-fork\packages\opencode`). Sur les 19 sessions du serveur, 16 partagent
 *     `…\packages\opencode` et 3 `…\opencode-fork` : le regroupement par dossier n'est pas
 *     décoratif, il sépare réellement deux lieux de travail.
 *   - `tokens`, `cost` et `summary` sont renseignés. Une ligne de session peut donc dire ce qu'elle
 *     a consommé et ce qu'elle a changé — information qu'aucun autre écran ne donne.
 */

import { pathKey } from "./folders"

export type SessionTokens = {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

export type SessionSummary = {
  id: string
  title?: string
  directory?: string
  /** Chemin **relatif** au projet ; vide pour la racine. */
  path?: string
  agent?: string
  model?: { id?: string; providerID?: string; variant?: string }
  cost?: number
  tokens?: SessionTokens
  summary?: { additions?: number; deletions?: number; files?: number }
  time?: { created?: number; updated?: number }
}

export type SessionGroup = {
  key: string
  /** Ce qui s'affiche : le chemin relatif, ou le nom du dossier. */
  label: string
  /** Le chemin complet, pour l'infobulle. */
  hint: string
  sessions: SessionSummary[]
}

/** Dernier segment d'un chemin Windows ou POSIX. */
function leaf(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? value
}

/**
 * Le dossier d'une session. `path` d'abord : c'est le chemin relatif au projet, celui qui distingue
 * deux sessions du même dépôt ; `directory` ensuite, réduit à son dernier segment.
 */
export function groupOf(session: SessionSummary): { key: string; label: string; hint: string } {
  const relative = session.path?.trim()
  const absolute = session.directory?.trim()
  if (relative) return { key: absolute || relative, label: relative, hint: absolute || relative }
  if (absolute) return { key: absolute, label: leaf(absolute), hint: absolute }
  return { key: "", label: "no folder", hint: "The session declares no folder" }
}

/*
 * `groupByDirectory` vivait ici : il regroupait sur `session.path`, le chemin **relatif**, donc un
 * sous-dossier du lieu courant. `groupByWorkspace` l'a remplacé — la question posée par le rail est
 * « où ai-je travaillé ? », et elle se répond en projets, pas en sous-chemins. Retiré plutôt que
 * laissé : une fonction de regroupement en double est exactement ce que le prochain lecteur
 * rebranchera par erreur.
 */

/**
 * Combien de sessions un dossier montre d'abord.
 *
 * Mesuré : le serveur a 16 sessions sous `packages/opencode` et 3 à la racine. Les afficher toutes
 * charge la liste pour rien — l'utilisateur navigue, il ne lit pas tout. Quatre se voient d'un coup
 * d'œil ; au-delà, c'est du défilement qu'il n'a pas demandé.
 */
export const SESSION_LIMIT = 4

/**
 * Ce qu'un dossier montre : les premières sessions, et combien restent cachées.
 *
 * `expanded` vient de l'utilisateur (« voir plus »). Le compte des cachées est rendu séparément
 * parce qu'il décide **l'existence** du bouton : à zéro, aucun bouton — un « voir plus » qui ne
 * déplie rien est un mensonge d'affordance.
 */
export function splitSessions(
  sessions: SessionSummary[],
  expanded: boolean,
  limit = SESSION_LIMIT,
): { shown: SessionSummary[]; hidden: number } {
  if (expanded || sessions.length <= limit) return { shown: sessions, hidden: 0 }
  return { shown: sessions.slice(0, limit), hidden: sessions.length - limit }
}

/** `deepseek/deepseek-v4.1-flash` → `deepseek-v4.1-flash` : le fournisseur est déjà dans la ligne. */
export function modelLabel(model: SessionSummary["model"]): string {
  const id = model?.id
  if (!id) return "server default"
  const parts = id.split("/")
  return parts[parts.length - 1] || id
}

/** Volume de jetons : au-delà de mille on abrège, en dessous on compte. */
export function formatTokens(value: number | undefined): string {
  if (!value || value <= 0) return "0"
  if (value < 1000) return String(value)
  return `${(value / 1000).toFixed(1)}k`
}

/**
 * Un coût nul s'écrit « 0 $ » et non « 0,00 $ » : c'est une absence, pas une mesure. Sous un cent,
 * quatre décimales avec les zéros de queue retirés — sans quoi un coût réel s'afficherait « 0 $ ».
 */
export function formatCost(value: number | undefined): string {
  if (!value || value <= 0) return "$0"
  if (value < 0.01) {
    const trimmed = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")
    return `$${trimmed}`
  }
  return `$${value.toFixed(2)}`
}

/**
 * Les lignes du détail, dans l'ordre où on les lit : qui a travaillé, avec quoi, ce que ça a coûté,
 * ce que ça a changé. Une valeur absente n'est pas inventée : on écrit « aucun changement » plutôt
 * que « +0 −0 · 0 fichier », qui se lit comme un résultat.
 */
export function sessionDetails(session: SessionSummary): Array<{ label: string; value: string }> {
  const tokens = session.tokens ?? {}
  const cache = tokens.cache?.read ?? 0
  const files = session.summary?.files ?? 0
  const additions = session.summary?.additions ?? 0
  const deletions = session.summary?.deletions ?? 0
  const changes = files > 0 ? `+${additions} −${deletions} · ${files} file${files > 1 ? "s" : ""}` : "no changes"

  return [
    { label: "agent", value: session.agent ?? "server default" },
    { label: "model", value: modelLabel(session.model) },
    {
      label: "tokens",
      value: `${formatTokens(tokens.input)} input · ${formatTokens(tokens.output)} output · ${formatTokens(cache)} cache`,
    },
    { label: "cost", value: formatCost(session.cost) },
    { label: "files", value: changes },
  ]
}

export type WorkspaceGroup = SessionGroup & {
  /** Est-ce le workspace où l'on travaille ? C'est lui qui porte la coche. */
  current: boolean
}

/**
 * `directory` appartient-il au projet ? Égalité, ou **sous-dossier** — jamais un préfixe de texte :
 * `…/opencode-fork-2` ne doit pas compter comme `…/opencode-fork`.
 */
function within(directory: string, project: string): boolean {
  if (!project) return false
  return directory === project || directory.startsWith(`${project}/`)
}

/**
 * Regroupe les sessions par **workspace** — le dossier de projet auquel elles appartiennent.
 *
 * Mesuré le 2026-10-14 : le rail affichait `packages/opencode` comme unique groupe, c'est-à-dire un
 * **sous-chemin** du dossier courant, alors que la référence liste des **workspaces**. La donnée
 * n'était pas absente : `GET /session` porte `directory` et `GET /project` porte les workspaces — le
 * rattachement se calcule donc, sans appel de plus.
 *
 * Le projet **le plus long** gagne : `…\opencode-fork` et `…\opencode-fork\packages` peuvent être
 * deux workspaces connus, et une session du second appartient au second.
 *
 * Une session hors de tout projet connu retombe sur son propre dossier (`groupOf`) : le regroupement
 * ne perd jamais une session, il la range seulement moins bien. L'ordre d'apparition est conservé —
 * le serveur trie par récence, et un tri de plus ferait remonter un vieux workspace au-dessus d'un
 * récent.
 */
export function groupByWorkspace(
  sessions: SessionSummary[],
  projects: string[],
  current: string,
): WorkspaceGroup[] {
  const known = projects
    .filter((path) => typeof path === "string" && path.trim().length > 0)
    .map((path) => ({ path, key: pathKey(path) }))
    // Du plus long au plus court : le premier qui contient le dossier est le bon.
    .sort((a, b) => b.key.length - a.key.length)

  const groups: WorkspaceGroup[] = []
  const index = new Map<string, WorkspaceGroup>()
  for (const session of sessions) {
    const home = known.find((entry) => within(pathKey(session.directory ?? ""), entry.key))
    const own = home ? undefined : groupOf(session)
    // La clé est **normalisée** dans les deux branches : deux écritures du même dossier (`C:/…` et
    // `C:\…`, relevé sur `GET /project`) doivent donner **un** groupe, pas deux.
    const key = home?.key ?? pathKey(own!.key)
    let group = index.get(key)
    if (!group) {
      group = {
        key,
        label: home ? leaf(home.path) : own!.label,
        hint: home ? home.path : own!.hint,
        current: false,
        sessions: [],
      }
      index.set(key, group)
      groups.push(group)
    }
    group.sessions.push(session)
  }

  /*
   * Le courant se reconnaît par **préfixe**, pas par égalité : on travaille dans
   * `…\opencode-fork\packages\opencode` alors que le workspace est `…\opencode-fork`. Comparés
   * entiers, aucun ne correspondait — mesuré : le sélecteur de dossier du rail n'affichait **aucune**
   * coche, alors que la référence en montre une.
   */
  const here = pathKey(current)
  if (here) {
    for (const group of groups) if (within(here, group.key)) group.current = true
  }

  return groups
}
