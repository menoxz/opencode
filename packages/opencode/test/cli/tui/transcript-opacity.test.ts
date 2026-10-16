import { expect, test } from "bun:test"
import { RGBA, type TerminalColors } from "@opentui/core"
import { generateSystem, resolveTheme } from "@/cli/cmd/tui/context/theme"

const palette = ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"] as const

function terminalColors(): TerminalColors {
  return {
    palette: Array.from({ length: 256 }, (_, index) => palette[index % palette.length]!),
    defaultBackground: "#1a1b26",
    defaultForeground: "#c0caf5",
    cursorColor: "#ff9e64",
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: "#33467c",
    highlightForeground: "#c0caf5",
  }
}

/**
 * Le fil oppose deux crans : `text` pour ce que l'agent **dit** et pour la commande bash,
 * `textLow` — le même texte à demi opacité — pour tout ce qu'il **rapporte** (sortie
 * d'outil, lecture, diff, résumé de lot). Un gris figé ne suivrait pas les thèmes : c'est
 * la teinte du thème qui reste, et l'alpha qui fait le cran.
 */
test("the transcript ladder is the theme text at half opacity, hue unchanged", () => {
  const theme = resolveTheme(generateSystem(terminalColors(), "dark"), "dark")
  expect(theme.textLow).toBeInstanceOf(RGBA)
  expect(theme.textLow.r).toBe(theme.text.r)
  expect(theme.textLow.g).toBe(theme.text.g)
  expect(theme.textLow.b).toBe(theme.text.b)
  // `RGBA.fromValues` quantifie l'alpha sur 8 bits : 128/255, pas exactement 0.5.
  expect(theme.textLow.a).toBeCloseTo(0.5, 2)
  expect(theme.text.a).toBe(1)
})

test("a light theme gets the same relative step", () => {
  const theme = resolveTheme(generateSystem(terminalColors(), "light"), "light")
  expect(theme.textLow.a).toBeCloseTo(0.5, 2)
  expect(theme.textLow.r).toBe(theme.text.r)
  expect(theme.textLow.g).toBe(theme.text.g)
  expect(theme.textLow.b).toBe(theme.text.b)
})
