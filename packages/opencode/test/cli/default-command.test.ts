import { describe, expect, test } from "bun:test"
import { CliDefaultCommand } from "../../src/cli/default-command"

describe("cli.default-command", () => {
  test("dans un terminal, l'invocation nue démarre le serveur et le TUI", () => {
    expect(CliDefaultCommand.resolveDefaultMode([], true)).toBe("local")
    expect(CliDefaultCommand.resolveDefaultMode(["--print-logs"], true)).toBe("local")
  })

  test("sans terminal, l'invocation nue sert en tête-à-tête", () => {
    expect(CliDefaultCommand.resolveDefaultMode([], false)).toBe("serve")
    expect(CliDefaultCommand.resolveDefaultMode(["--print-logs"], false)).toBe("serve")
  })

  test("les options du serveur gardent le défaut", () => {
    for (const argv of [
      ["--port", "4099"],
      ["--port=4099"],
      ["--hostname", "0.0.0.0"],
      ["--mdns"],
      ["--mdns-domain", "x.local"],
      ["--cors", "http://a", "--cors=http://b"],
      ["--print-logs", "--log-level", "INFO", "--pure"],
    ] as const) {
      expect(CliDefaultCommand.resolveDefaultMode(argv, true)).toBe("local")
      expect(CliDefaultCommand.resolveDefaultMode(argv, false)).toBe("serve")
    }
  })

  test("la valeur d'une option n'est pas prise pour une commande", () => {
    // Défaut mesuré le 2026-10-17 : `--port 4099` rendait le TUI.
    expect(CliDefaultCommand.hasOnlyServerOptions(["--port", "4099"])).toBe(true)
    expect(CliDefaultCommand.hasOnlyServerOptions(["--log-level", "ERROR", "--port", "4098"])).toBe(true)
  })

  test("une commande nommée garde la main", () => {
    expect(CliDefaultCommand.resolveDefaultMode(["serve", "--port", "4097"], true)).toBe("command")
    expect(CliDefaultCommand.resolveDefaultMode(["models"], true)).toBe("command")
    expect(CliDefaultCommand.resolveDefaultMode(["--print-logs", "serve"], true)).toBe("command")
  })

  test("un dossier de projet garde la main", () => {
    expect(CliDefaultCommand.resolveDefaultMode(["./packages/opencode"], true)).toBe("command")
    expect(CliDefaultCommand.resolveDefaultMode(["C:\\jeanluc"], true)).toBe("command")
    expect(CliDefaultCommand.resolveDefaultMode(["monprojet"], true)).toBe("command")
  })

  test("une option du TUI garde la main", () => {
    for (const argv of [["-s", "ses_abc"], ["--model", "opencode/deepseek"], ["--continue"], ["--log-level", "INFO", "--model", "x"]] as const) {
      expect(CliDefaultCommand.resolveDefaultMode(argv, true)).toBe("command")
    }
  })

  test("l'aide et la version restent intactes", () => {
    for (const argv of [["-h"], ["--help"], ["-v"], ["--version"], ["--port", "4099", "--help"]] as const) {
      expect(CliDefaultCommand.resolveDefaultMode(argv, true)).toBe("command")
    }
  })

  test("l'URL d'attache porte le port demandé", () => {
    expect(CliDefaultCommand.localServerUrl([])).toBe("http://127.0.0.1:4096")
    expect(CliDefaultCommand.localServerUrl(["--port", "4099"])).toBe("http://127.0.0.1:4099")
    expect(CliDefaultCommand.localServerUrl(["--port=4099"])).toBe("http://127.0.0.1:4099")
    // Un port illisible ne doit pas fabriquer une URL injoignable.
    expect(CliDefaultCommand.localServerUrl(["--port", "abc"])).toBe("http://127.0.0.1:4096")
  })

  test("le serveur engendré reçoit les options d'écoute, jamais --port", () => {
    expect(CliDefaultCommand.listenerArgs([])).toEqual([])
    expect(CliDefaultCommand.listenerArgs(["--port", "4099", "--mdns"])).toEqual(["--mdns"])
    expect(CliDefaultCommand.listenerArgs(["--hostname", "0.0.0.0", "--mdns-domain", "x.local"])).toEqual([
      "--hostname",
      "0.0.0.0",
      "--mdns-domain",
      "x.local",
    ])
    expect(CliDefaultCommand.listenerArgs(["--cors=http://a", "--cors", "http://b"])).toEqual([
      "--cors",
      "http://a",
      "--cors",
      "http://b",
    ])
  })

  test("l'attache ne reçoit pas les options d'écoute (le CLI est strict)", () => {
    expect(CliDefaultCommand.attachArgs(["--port", "4099", "--print-logs"])).toEqual(["--print-logs"])
    expect(CliDefaultCommand.attachArgs(["--mdns"])).toEqual([])
    expect(CliDefaultCommand.attachArgs(["--hostname=0.0.0.0", "--pure"])).toEqual(["--pure"])
  })
})
