/**
 * Temps relatif des lignes de session.
 *
 * Format relevé dans `dsh-sidebar-proposition.html` : `now`, `23h`, `1d`, `2d`, `3d`. DSH
 * n'affiche pas de date absolue dans la sidebar — l'information utile est « à quand remonte
 * cette session », pas l'horodatage exact.
 *
 * Fonction pure : `maintenant` est injecté plutôt que lu de l'horloge, sinon le test serait
 * instable et la fonction intestable.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Au-delà de ce délai, une durée relative n'informe plus : on passe à la date courte. */
const RELATIVE_LIMIT = 7 * DAY

/**
 * Libellé court d'un horodatage. `undefined` (session sans date) donne une chaîne vide : une
 * ligne de session ne doit pas afficher « Invalid Date ».
 */
export function relativeTime(timestamp: number | undefined, maintenant: number): string {
  if (!Number.isFinite(timestamp)) return ""

  const ecart = maintenant - (timestamp as number)

  // Une horloge serveur en avance produirait un écart négatif : on le traite comme « à l'instant »
  // plutôt que d'afficher « dans -3 min ».
  if (ecart < MINUTE) return "now"

  if (ecart < HOUR) return `${Math.floor(ecart / MINUTE)}m`
  if (ecart < DAY) return `${Math.floor(ecart / HOUR)}h`
  // Borne inclusive : « au-delà d'une semaine » veut dire que la semaine elle-même reste
  // relative — exactement 7 jours doit afficher « 7d », pas une date.
  if (ecart <= RELATIVE_LIMIT) return `${Math.floor(ecart / DAY)}d`

  const date = new Date(timestamp as number)
  const jour = String(date.getDate()).padStart(2, "0")
  const mois = String(date.getMonth() + 1).padStart(2, "0")
  return `${jour}/${mois}`
}

/** Horodatage d'une session, quelle que soit la forme reçue du serveur. */
export function sessionTimestamp(session: { time?: { updated?: number; created?: number } } | undefined): number | undefined {
  return session?.time?.updated ?? session?.time?.created
}
