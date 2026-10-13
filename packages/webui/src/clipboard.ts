/**
 * Copier dans le presse-papiers — la seule action de **lecture** du fil (§3.9).
 *
 * `navigator.clipboard` n'existe qu'en contexte sûr (localhost en fait partie) et peut être absent :
 * jsdom ne l'implémente pas, et un navigateur ancien non plus. Le repli `textarea` + `execCommand`
 * évite d'échouer en silence.
 *
 * La fonction rend un **booléen** plutôt que de ne rien dire : un bouton « copier » qui ne copie pas
 * est pire que pas de bouton du tout, parce qu'il fait croire que c'est fait. L'appelant peut donc
 * afficher l'échec au lieu de mentir.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission refusée ou contexte non sûr : on tente le repli avant d'abandonner.
    }
  }

  if (typeof document === "undefined") return false
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    // Hors flux et invisible : le défilement ne doit pas bouger quand on copie une longue sortie.
    area.style.position = "fixed"
    area.style.top = "0"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand?.("copy") ?? false
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
