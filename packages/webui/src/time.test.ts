import { describe, expect, test } from "vitest"
import { relativeTime, sessionTimestamp } from "./time"

const T = 1_800_000_000_000 // instant de référence arbitraire
const MIN = 60_000
const H = 60 * MIN
const D = 24 * H

describe("relativeTime", () => {
  test("moins d'une minute : « now », le format DSH", () => {
    expect(relativeTime(T, T)).toBe("now")
    expect(relativeTime(T - 30_000, T)).toBe("now")
  })

  test("minutes, heures, jours", () => {
    expect(relativeTime(T - 5 * MIN, T)).toBe("5m")
    expect(relativeTime(T - 23 * H, T)).toBe("23h")
    expect(relativeTime(T - 1 * D, T)).toBe("1d")
    expect(relativeTime(T - 3 * D, T)).toBe("3d")
  })

  test("les bornes sont exclusives du palier supérieur", () => {
    expect(relativeTime(T - (MIN - 1), T)).toBe("now")
    expect(relativeTime(T - MIN, T)).toBe("1m")
    expect(relativeTime(T - (H - 1), T)).toBe("59m")
    expect(relativeTime(T - H, T)).toBe("1h")
    expect(relativeTime(T - (D - 1), T)).toBe("23h")
    expect(relativeTime(T - D, T)).toBe("1d")
  })

  test("au-delà d'une semaine, date courte plutôt qu'une durée qui n'informe plus", () => {
    // 10 jours avant un instant fixe : format jj/mm, sans dépendre du fuseau pour le jour.
    const resultat = relativeTime(T - 10 * D, T)
    expect(resultat).toMatch(/^\d{2}\/\d{2}$/)
    expect(relativeTime(T - 7 * D, T)).toBe("7d")
  })

  test("un horodatage absent ne produit pas « Invalid Date »", () => {
    expect(relativeTime(undefined, T)).toBe("")
    expect(relativeTime(Number.NaN, T)).toBe("")
  })

  test("une horloge serveur en avance donne « now », pas une durée négative", () => {
    // Cas réel : le serveur et le navigateur ne sont pas forcément à la même seconde.
    expect(relativeTime(T + 5 * MIN, T)).toBe("now")
  })
})

describe("sessionTimestamp", () => {
  test("préfère la date de mise à jour", () => {
    expect(sessionTimestamp({ time: { updated: 200, created: 100 } })).toBe(200)
  })

  test("retombe sur la date de création", () => {
    expect(sessionTimestamp({ time: { created: 100 } })).toBe(100)
  })

  test("session sans date", () => {
    expect(sessionTimestamp({})).toBeUndefined()
    expect(sessionTimestamp(undefined)).toBeUndefined()
  })
})
