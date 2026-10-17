import { reduceThread } from "./view-model"

type Thread = Parameters<typeof reduceThread>[0]
type ThreadEvent = Parameters<typeof reduceThread>[1]

/**
 * Ce qu'un flux d'événements doit encore faire pour que le fil soit **entièrement** fonctionnel.
 *
 * Trois défauts mesurés dans le câblage d'origine, et ce que ce module apporte :
 *
 * 1. **Une resynchronisation par événement, sans coalescence.** `reduceThread` rend `undefined` dès
 *    qu'il ne peut pas appliquer en place (message ou partie encore inconnu de la page), et
 *    l'appelant relançait aussitôt un `GET /session/:id/message` complet : autant de lectures que
 *    d'événements non applicables, donc plusieurs requêtes concurrentes sur une session de plusieurs
 *    milliers de parties. `createReloadGate` n'en laisse qu'**une** en vol et **une seule** en
 *    attente — la dernière demande gagne.
 *
 * 2. **Aucune garde d'ordre.** Deux lectures concurrentes écrivaient dans le même signal : la plus
 *    lente écrasait l'état le plus récent, et le fil reculait sous les yeux de l'utilisateur sans
 *    qu'aucune erreur ne soit levée. `createTicketGuard` refuse tout jeton plus ancien que celui déjà
 *    accepté.
 *
 * 3. **Une coupure laissait un trou définitif.** Le flux (`/global/event`) ne rejoue pas ce qui a
 *    été manqué (aucun `Last-Event-ID` côté serveur), donc les deltas émis pendant la coupure
 *    étaient perdus pour de bon, et un `session.idle` manqué laissait l'écran sur « travail en
 *    cours » indéfiniment. `resyncPlan` dit ce qu'il faut relire, dont le fil actif et l'état
 *    d'activité (`GET /session/status`, que le CLI interroge déjà :
 *    `cli/cmd/run/stream.transport.ts:762`).
 *
 * Pur : ni DOM, ni timer, ni réseau — les pièces se testent hors navigateur.
 */

/** Le fil actif d'abord rejoint les autres au moindre décrochage — l'ordre est celui des relectures. */
export const SYNC_TARGETS = ["permissions", "questions", "sessions", "messages", "activity"] as const
export type SyncTarget = (typeof SYNC_TARGETS)[number]

const AT_FIRST_CONNECT: SyncTarget[] = ["permissions", "questions", "sessions"]
const AFTER_A_DROP: SyncTarget[] = [...SYNC_TARGETS]

export type StreamState = { connected: boolean; reconnects: number }

/**
 * Ce qu'un événement du fil demande : l'appliquer, resynchroniser, ou l'ignorer — **en le nommant**.
 *
 * Le troisième cas existe pour une raison précise : un événement qui arrive et n'est traité nulle
 * part doit rester visible dans le journal, sinon « il ne se passe rien à l'écran » n'a aucune cause
 * lisible. Les raisons sont affichées, donc en anglais.
 */
export type ThreadOutcome =
  | { kind: "applied"; messages: Thread }
  | { kind: "resync"; reason: string }
  | { kind: "ignore"; reason: string }

/** Les types que le réducteur sait appliquer : le reste du préfixe `message.` est du bruit nommé. */
const REDUCED = new Set([
  "message.updated",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
])

export function threadEventOutcome(
  thread: Thread,
  activeSessionID: string | undefined,
  event: ThreadEvent,
): ThreadOutcome {
  const type = typeof event?.type === "string" ? event.type : ""
  if (!type.startsWith("message.")) return { kind: "ignore", reason: "outside the thread" }
  if (!REDUCED.has(type)) return { kind: "ignore", reason: `not handled (${type})` }

  const properties = (event.properties ?? {}) as { sessionID?: unknown }
  if (typeof properties.sessionID !== "string") return { kind: "ignore", reason: "no session on the event" }
  if (!activeSessionID) return { kind: "ignore", reason: "no session open" }
  if (properties.sessionID !== activeSessionID) return { kind: "ignore", reason: "another session" }

  const next = reduceThread(thread, event)
  // Le réducteur rend `undefined` quand il lui manque de quoi appliquer l'événement : le relire est
  // la seule issue, et c'est un rechargement qu'on assume, pas un abandon.
  if (!next) return { kind: "resync", reason: `unknown message or part (${type})` }
  // Identité : le réducteur rend le **même tableau** quand il n'y avait rien à changer — une partie
  // retirée qui n'existait pas, par exemple. Ce n'est pas un type ignoré, c'est un non-changement.
  if (next === thread) return { kind: "ignore", reason: `nothing to change (${type})` }
  return { kind: "applied", messages: next }
}

/**
 * Ce qu'il faut relire après un (re)branchement. `previous` absent = premier branchement.
 *
 * Le premier branchement ne relit pas le fil : il vient d'être chargé par l'ouverture de la session,
 * et le relire doublerait la requête la plus lourde pour rien. Une reconnexion, elle, a manqué des
 * événements et ne peut pas le savoir autrement — le flux ne rejoue rien.
 *
 * « Jamais connecté encore » (`connected:false`, `reconnects:0`) est un premier branchement, pas une
 * coupure : le compteur de reconnexions n'augmente qu'après une connexion établie puis perdue.
 */
export function resyncPlan(previous: StreamState | undefined, next: StreamState): SyncTarget[] {
  if (!next.connected) return []
  if (previous === undefined || (!previous.connected && next.reconnects === 0)) return [...AT_FIRST_CONNECT]
  if (!previous.connected || next.reconnects > previous.reconnects) return [...AFTER_A_DROP]
  return []
}

/** Jetons monotones : une réponse dont le jeton n'est plus le plus récent n'écrit pas. */
export type TicketGuard = {
  issue: () => number
  accept: (token: number) => boolean
}

export function createTicketGuard(): TicketGuard {
  let issued = 0
  let accepted = 0
  return {
    issue: () => (issued += 1),
    accept: (token) => {
      if (token <= accepted) return false
      accepted = token
      return true
    },
  }
}

/**
 * Une seule lecture en vol, une seule en attente — la dernière demande gagne.
 *
 * Coalescer par la clé (l'identifiant de session) et non par événement : un message inconnu, une
 * partie inconnue et trois deltas qui suivent demandent la **même** relecture, et une seule suffit.
 */
export type ReloadGate = {
  request: (key: string, run: (key: string) => Promise<void>) => void
  inFlight: () => string | undefined
  queued: () => string | undefined
  idle: () => boolean
}

export function createReloadGate(): ReloadGate {
  let running: string | undefined
  let pending: string | undefined

  const start = (key: string, run: (key: string) => Promise<void>) => {
    running = key
    void run(key)
      // Une relecture qui échoue ne doit pas figer la porte : sans ce rattrapage, la première erreur
      // réseau fermerait la resynchronisation pour le reste de la session.
      .catch(() => undefined)
      .then(() => {
        running = undefined
        const next = pending
        pending = undefined
        if (next !== undefined) start(next, run)
      })
  }

  return {
    request: (key, run) => {
      if (running === key) return
      if (running !== undefined) {
        pending = key
        return
      }
      start(key, run)
    },
    inFlight: () => running,
    queued: () => pending,
    idle: () => running === undefined && pending === undefined,
  }
}

/**
 * L'activité d'une session, telle que la rend `GET /session/status` : une carte
 * `sessionID -> { type }` où `type` vaut `idle`, `busy` ou `retry`.
 *
 * `retry` compte comme du travail : l'agent réessaie, il n'est pas au repos. Ne tester que `busy`
 * ferait disparaître l'indicateur pendant une reprise sur erreur — exactement le moment où l'écran
 * doit dire quelque chose.
 */
export function activityFromStatus(statuses: unknown, sessionID: string | undefined): boolean {
  if (!sessionID || !statuses || typeof statuses !== "object") return false
  const info = (statuses as Record<string, { type?: unknown } | undefined>)[sessionID]
  if (!info || typeof info !== "object") return false
  return info.type !== "idle"
}

/**
 * Le battement du serveur, **mesuré** : `server.heartbeat` toutes les 10 s, dans les deux flux
 * (`server/routes/instance/httpapi/handlers/event.ts:30`, `handlers/global.ts:48`).
 *
 * C'est ce qui rend le silence mesurable : sans battement, « rien depuis longtemps » voudrait
 * seulement dire « il ne se passe rien », ce qui est le fonctionnement normal d'une session au repos.
 */
export const STREAM_HEARTBEAT_MS = 10_000

/** Trois battements manqués : en dessous, on risquerait de couper un flux sain et lent à démarrer. */
export const STREAM_SILENCE_LIMIT_MS = 3 * STREAM_HEARTBEAT_MS

/**
 * Un flux **ouvert mais muet** est mort, et `EventSource` ne le verra jamais : il ne rappelle
 * `onerror` que si la socket échoue vraiment. Une socket qui reste ouverte sans rien livrer — un
 * proxy qui tient la connexion après le redémarrage du serveur, une connexion TCP à demi fermée —
 * laisse la page figée en silence pendant que l'indicateur affiche « connecté ». Mesuré sur la pile
 * isolée le 2026-10-15 : serveur arrêté puis relancé, **zéro** erreur console, journal figé, aucun
 * `server.connected` de retour — la lecture seule ne suffit donc pas, il faut une garde.
 *
 * `undefined` = « rien reçu depuis l'ouverture » : ce n'est pas un silence, c'est un flux neuf dont
 * on n'a pas encore eu de nouvelles.
 */
export function streamSilent(
  lastEventAt: number | undefined,
  now: number,
  limit = STREAM_SILENCE_LIMIT_MS,
): boolean {
  if (lastEventAt === undefined) return false
  return now - lastEventAt > limit
}
