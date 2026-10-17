import { describe, expect, test } from "bun:test"
import { CliDefaultCommand } from "../../src/cli/default-command"

describe("cli.default-command", () => {
  test("sans argument, le CLI sert", () => {
    expect(CliDefaultCommand.shouldDefaultToServe([])).toBe(true)
  })

  test("les options du serveur gardent le défaut", () => {
    expect(CliDefaultCommand.shouldDefaultToServe(["--port", "4099"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--port=4099"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--hostname", "0.0.0.0"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--mdns"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--mdns-domain", "x.local"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--cors", "http://a", "--cors=http://b"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--print-logs", "--log-level", "INFO", "--pure"])).toBe(true)
  })

  test("la valeur d'une option n'est pas prise pour une commande", () => {
    // Défaut mesuré le 2026-10-17 : « 4099 » ne commence pas par un tiret, donc il passait pour un
    // nom de commande et `opencodev2 --port 4099` démarrait le TUI au lieu du serveur.
    expect(CliDefaultCommand.shouldDefaultToServe(["--port", "4099"])).toBe(true)
    expect(CliDefaultCommand.shouldDefaultToServe(["--log-level", "ERROR", "--port", "4098"])).toBe(true)
  })

  test("un nom de commande garde son sens", () => {
    expect(CliDefaultCommand.shouldDefaultToServe(["serve", "--port", "4097"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["models"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--print-logs", "serve"])).toBe(false)
  })

  test("un dossier de projet garde son sens", () => {
    expect(CliDefaultCommand.shouldDefaultToServe(["./packages/opencode"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["C:\\jeanluc"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["monprojet"])).toBe(false)
  })

  test("une option propre au TUI garde son sens", () => {
    expect(CliDefaultCommand.shouldDefaultToServe(["-s", "ses_abc"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--model", "opencode/deepseek"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--continue"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--log-level", "INFO", "--model", "x"])).toBe(false)
  })

  test("l'aide et la version restent intactes", () => {
    expect(CliDefaultCommand.shouldDefaultToServe(["-h"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--help"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["-v"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--version"])).toBe(false)
    expect(CliDefaultCommand.shouldDefaultToServe(["--port", "4099", "--help"])).toBe(false)
  })
})
