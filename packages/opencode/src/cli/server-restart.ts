import { execFile } from "node:child_process"

/**
 * Remise en cohérence serveur/client au lancement de la TUI.
 *
 * Après un déploiement, l'ancien serveur détaché répond toujours sur le port et `ensureServer` le
 * réutilisait : la mise à jour restait sans effet, en silence, et la seule issue était une recette
 * manuelle (arrêter le serveur, relancer). Ce module exécute cette recette à la place de
 * l'utilisateur dès que la version servie ne correspond plus au binaire lancé.
 *
 * Trois principes : le serveur est identifié **par le port qu'il tient** (arrêter « tous les
 * opencodev2 » tuerait le démon et d'autres serveurs de travail), l'arrêt est gracieux puis forcé,
 * et tout échec laisse l'état précédent en place — l'appelant rapporte alors l'écart au lieu de
 * rester bloqué sur une remise en cohérence impossible.
 */

export const SERVER_SIGNAL_GRACE_MS = 3000

/** Décision prise au lancement devant un serveur d'une autre version que le client. */
export type RestartDecision = { action: "restart"; pid: number } | { action: "keep"; reason: string }

/**
 * Choisit l'action devant un serveur qui ne correspond plus au binaire lancé. Sans titulaire de port
 * lisible il n'y a pas de cible unique, et l'on ne touche à rien : `serve --port` dira de lui-même
 * que le port est pris.
 */
export function decideServerRestart(input: {
  mismatch: boolean
  portOccupant?: number
  ownServer?: boolean
  children?: readonly number[]
}): RestartDecision {
  if (!input.mismatch) return { action: "keep", reason: "versions alignées ou serveur muet" }
  if (!input.portOccupant) {
    return { action: "keep", reason: "aucun titulaire de port lisible pour un arrêt ciblé" }
  }
  // Un port par défaut peut être tenu par autre chose que notre serveur : un arrêt ciblé ne tue
  // jamais un programme étranger, et une image illisible ne vaut pas une autorisation.
  if (input.ownServer !== true) {
    return { action: "keep", reason: "le port est tenu par un programme qui n'est pas un serveur opencodev2" }
  }
  if (input.children?.includes(input.portOccupant)) {
    return { action: "keep", reason: "le serveur a été engendré par cette session" }
  }
  return { action: "restart", pid: input.portOccupant }
}

/**
 * Titulaires d'un port d'écoute, d'après la sortie de l'outil système. Fonction pure : les échantillons
 * de sortie réelle vivent dans les tests.
 */
export function parsePortOccupants(output: string, port: number): number[] {
  const pids = new Set<number>()
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // POSIX (`lsof -t`) : un identifiant par ligne.
    if (/^\d+$/.test(trimmed)) {
      pids.add(Number(trimmed))
      continue
    }
    // Windows (`netstat -ano`) : le port local et le PID sont les deux derniers colonnes utiles.
    const columns = trimmed.split(/\s+/)
    const local = columns[1]
    const pid = columns[columns.length - 1]
    if (!local || !pid || !/^\d+$/.test(pid)) continue
    if (local !== `0.0.0.0:${port}` && local !== `127.0.0.1:${port}` && local !== `[::]:${port}`) continue
    pids.add(Number(pid))
  }
  return [...pids]
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      resolve(error && !stdout ? "" : stdout)
    })
  })
}

/** Interroge l'outil système de la plateforme : `netstat` sur Windows, `lsof` ailleurs. */
export async function portOccupants(port: number): Promise<number[]> {
  const output =
    process.platform === "win32"
      ? await run("netstat", ["-ano", "-p", "tcp"])
      : await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
  return parsePortOccupants(output, port)
}

/**
 * Le nom d'image lu dans une sortie système (`tasklist` en CSV, `ps` en `comm`). En mode source le
 * serveur tourne sous `bun` : un contrôle figé sur `opencodev2` désactiverait la bascule en dev.
 */
export function parseProcessImage(output: string): string | undefined {
  const first = output.split(/\r?\n/).find((line) => line.trim().length > 0)
  if (!first) return undefined
  const csv = first.match(/^"([^"]+)"/)
  if (csv) return csv[1]
  const plain = first.trim().split(/\s+/)[0]
  return plain && plain.length > 0 ? plain : undefined
}

export function isOwnServerImage(name: string | undefined): boolean {
  if (!name) return false
  const normalized = name.toLowerCase()
  return normalized.includes("opencode") || normalized === "bun" || normalized === "bun.exe"
}

export async function processImage(pid: number): Promise<string | undefined> {
  const output =
    process.platform === "win32"
      ? await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"])
      : await run("ps", ["-p", String(pid), "-o", "comm="])
  return parseProcessImage(output)
}

/** Vue minimale de l'envoi de signal, pour tester sans jamais toucher au vrai processus. */
export type ProcessApi = { send: (pid: number, signal: NodeJS.Signals | number) => boolean }

/**
 * Arrêt gracieux puis forcé — ce que fait `daemon stop`, appliqué à un serveur quelconque. Le délai
 * de grâce laisse au serveur le temps de fermer ses sessions ; passé ce délai, on ne l'attend plus.
 */
export function stopProcessByPid(
  pid: number,
  options: { api: ProcessApi; alive: (pid: number) => Promise<boolean>; gracefulMs?: number },
): Promise<void> {
  const stopped = !options.api.send(pid, "SIGTERM")
  if (stopped) return Promise.resolve()
  return new Promise((resolve) => {
    setTimeout(async () => {
      if (await options.alive(pid)) options.api.send(pid, "SIGKILL")
      resolve()
    }, options.gracefulMs ?? SERVER_SIGNAL_GRACE_MS)
  })
}

export type RestartServerInput = {
  pid: number
  /** Lance le serveur neuf : le seul geste que ce module ne peut pas décider à la place de l'appelant. */
  spawn: () => void
  waitPortFree: () => Promise<boolean>
  /** La version servie une fois le serveur neuf en place, `undefined` s'il n'a jamais répondu. */
  waitVersion: () => Promise<string | undefined>
  stop?: (pid: number) => Promise<void>
}

/**
 * Bascule le serveur local sur le binaire lancé : arrêt du serveur détaché, attente de la libération
 * du port, relance, puis attente d'une version servie. Rend `false` dès qu'une étape échoue.
 */
export async function restartLocalServer(input: RestartServerInput): Promise<boolean> {
  await (input.stop ?? defaultStop())(input.pid)
  if (!(await input.waitPortFree())) return false
  input.spawn()
  return (await input.waitVersion()) !== undefined
}

function defaultStop() {
  const api: ProcessApi = {
    send: (pid, signal) => {
      try {
        process.kill(pid, signal)
        return true
      } catch {
        return false
      }
    },
  }
  const alive = async (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  return (pid: number) => stopProcessByPid(pid, { api, alive })
}

/** Attend qu'un prédicat devienne vrai, sans jamais dépasser la limite : rend `false` au bout du délai. */
export async function waitFor(condition: () => Promise<boolean>, timeoutMs = 15_000, intervalMs = 400): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}
