import { describe, expect, test } from "vitest"
import {
  CENTER_MIN,
  DETAILS_DEFAULT,
  DETAILS_MAX,
  DETAILS_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampWidth,
  computeColumns,
  effectiveSidebarPreference,
} from "./columns"

describe("constantes contractuelles (relevées dans columns.d.ts)", () => {
  test("elles valent celles de DSH", () => {
    expect(CENTER_MIN).toBe(640)
    expect(SIDEBAR_MIN).toBe(264)
    expect(SIDEBAR_MAX).toBe(420)
    expect(SIDEBAR_DEFAULT).toBe(280)
    expect(SIDEBAR_COLLAPSED).toBe(56)
    expect(SIDEBAR_AUTO_COLLAPSE).toBe(1024)
    expect(DETAILS_MIN).toBe(300)
    expect(DETAILS_MAX).toBe(520)
    expect(DETAILS_DEFAULT).toBe(360)
  })
})

describe("clampWidth", () => {
  test("borne dans la plage", () => {
    expect(clampWidth(100, 264, 420)).toBe(264)
    expect(clampWidth(900, 264, 420)).toBe(420)
    expect(clampWidth(300, 264, 420)).toBe(300)
  })

  test("une valeur non finie retombe sur la borne basse", () => {
    expect(clampWidth(Number.NaN, 264, 420)).toBe(264)
  })
})

describe("computeColumns — cas nominal", () => {
  test("fenêtre large : chaque colonne prend sa préférence", () => {
    // 1600 = 280 + centre + 360 → centre 960, au-dessus du plancher
    const result = computeColumns(1600, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(result).toEqual({ sidebar: 280, center: 960, details: 360 })
  })

  test("sidebar fermée : elle garde son rail, pas zéro", () => {
    const result = computeColumns(1600, 0, DETAILS_DEFAULT)
    expect(result.sidebar).toBe(SIDEBAR_COLLAPSED)
    expect(result.details).toBe(360)
    expect(result.center).toBe(1600 - 56 - 360)
  })

  test("détails fermés : largeur nulle, jamais démontés", () => {
    const result = computeColumns(1600, SIDEBAR_DEFAULT, 0)
    expect(result.details).toBe(0)
    expect(result.center).toBe(1600 - 280)
  })

  test("les préférences hors bornes sont ramenées dans leur plage", () => {
    expect(computeColumns(1600, 100, DETAILS_DEFAULT).sidebar).toBe(SIDEBAR_MIN)
    expect(computeColumns(1600, 900, DETAILS_DEFAULT).sidebar).toBe(SIDEBAR_MAX)
    expect(computeColumns(1600, SIDEBAR_DEFAULT, 100).details).toBe(DETAILS_MIN)
    expect(computeColumns(1600, SIDEBAR_DEFAULT, 900).details).toBe(DETAILS_MAX)
  })
})

describe("computeColumns — chaîne de concession", () => {
  test("la sidebar ne cède JAMAIS, même quand la fenêtre est trop étroite", () => {
    // Le contrat est explicite : « The sidebar never concedes ».
    const result = computeColumns(700, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(result.sidebar).toBe(SIDEBAR_DEFAULT)
  })

  test("les détails cèdent avant que le centre ne descende sous son plancher", () => {
    // 1000 = 280 + 640 + 80 → détails réduits à 80 pour tenir le plancher du centre
    const result = computeColumns(1000, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(result.center).toBe(CENTER_MIN)
    expect(result.details).toBe(1000 - 280 - CENTER_MIN)
  })

  test("les détails se ferment quand ils ne suffisent plus", () => {
    // 900 - 280 = 620 < 640 → détails à 0, le centre est servi autant que possible
    const result = computeColumns(900, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(result.details).toBe(0)
    expect(result.center).toBe(620)
  })

  test("dernier recours : le centre absorbe le déficit restant", () => {
    const result = computeColumns(700, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(result.details).toBe(0)
    expect(result.center).toBe(700 - 280)
  })

  test("propriété de restauration : aucune mémoire, donc ré-élargir restaure", () => {
    // « preferred width preferences are never rewritten » — la même entrée redonne la même sortie,
    // et repasser par une fenêtre étroite ne dégrade pas le résultat suivant.
    const large = computeColumns(1600, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    const etroit = computeColumns(900, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    const relarge = computeColumns(1600, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
    expect(etroit.details).toBe(0)
    expect(relarge).toEqual(large)
    expect(relarge.details).toBe(DETAILS_DEFAULT)
  })

  test("la somme des colonnes rendues ne dépasse pas la fenêtre, sauf déficit absorbé", () => {
    for (const viewport of [1400, 1100, 1000, 900, 700]) {
      const result = computeColumns(viewport, SIDEBAR_DEFAULT, DETAILS_DEFAULT)
      if (result.center >= CENTER_MIN) {
        expect(result.sidebar + result.center + result.details).toBe(viewport)
      }
    }
  })
})

describe("effectiveSidebarPreference — le seuil vit hors du solveur", () => {
  test("sous le seuil, la sidebar se replie d'elle-même", () => {
    expect(effectiveSidebarPreference(900, SIDEBAR_DEFAULT, false)).toBe(0)
  })

  test("au-dessus du seuil, la préférence est respectée", () => {
    expect(effectiveSidebarPreference(1400, SIDEBAR_DEFAULT, false)).toBe(SIDEBAR_DEFAULT)
  })

  test("un basculement manuel ré-étend la sidebar sous le seuil", () => {
    // Comportement documenté sous le nom `narrowExpanded`.
    expect(effectiveSidebarPreference(900, SIDEBAR_DEFAULT, true)).toBe(SIDEBAR_DEFAULT)
  })

  test("une sidebar déjà fermée le reste, quel que soit le basculement", () => {
    expect(effectiveSidebarPreference(1400, 0, false)).toBe(0)
    expect(effectiveSidebarPreference(1400, 0, true)).toBe(0)
  })
})
