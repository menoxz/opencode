/**
 * La commande par défaut du CLI.
 *
 * Sans commande — `opencodev2` seul, ou seulement les options du serveur et de la racine
 * (`--port`, `--hostname`, `--print-logs`…) — le CLI démarre **le serveur**, puis ouvre **le TUI
 * attaché à lui**. Le serveur vit dans son propre processus, détaché : il garde ses veilleurs armés
 * (skills, agents, plugins, instructions) pendant que la TUI tourne, il survit à sa fermeture, et
 * une seconde invocation s'y rattache au lieu d'en démarrer un autre.
 *
 * **Sans terminal** — pipe, script, CI : un TUI ne peut pas s'afficher — le CLI **sert** en
 * tête-à-tête, comme avant. Toute autre invocation garde son sens inchangé : un nom de commande, un
 * dossier de projet pour le TUI, ou une option propre au TUI (`-s`, `--model`…) laissent yargs
 * décider.
 *
 * Le discriminant est « **aucun positional** », jamais « aucun jeton sans tiret » : la **valeur**
 * d'une option n'a pas de tiret, donc `opencodev2 --port 4099` — un appel parfaitement normal du
 * serveur — était pris pour une commande et retombait sur le TUI (mesuré le 2026-10-17 sur le
 * binaire déployé : `--port 4099` rendait le TUI, `serve --port 4097` servait).
 */
import { DevSource } from "@/dev/source"

/**
 * Les options qui ne désignent pas de commande — celles du serveur (`withNetworkOptions`) et de la
 * racine — avec leur **arité** : une option à valeur consomme le jeton suivant, une option
 * booléenne non.
 *
 * Volontairement restreint : reconnaître une option inconnue ferait insérer `serve` devant une
 * invocation du TUI (`-s ses_…`, `--model …`), donc la réponse est « non » par défaut.
 */
const OPTIONS: Record<string, "boolean" | "value"> = {
  "--port": "value",
  "--hostname": "value",
  "--mdns": "boolean",
  "--mdns-domain": "value",
  "--cors": "value",
  "--print-logs": "boolean",
  "--log-level": "value",
  "--pure": "boolean",
}

/** Les options d'écoute du serveur : elles décident où il écoute, pas ce qu'il sert. */
const NETWORK = new Set(["--port", "--hostname", "--mdns", "--mdns-domain", "--cors"])

type Option = { name: string; value?: string }

function parse(argv: readonly string[]): Option[] {
  const parsed: Option[] = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const eq = token.indexOf("=")
    const name = eq === -1 ? token : token.slice(0, eq)
    const arity = OPTIONS[name]
    if (!arity) {
      parsed.push({ name: token })
      continue
    }
    // `--port=4099` porte sa valeur dans le jeton ; `--port 4099` la porte dans le suivant.
    if (arity === "value" && eq === -1) {
      parsed.push({ name, value: argv[i + 1] })
      i++
      continue
    }
    parsed.push({ name, value: eq === -1 ? undefined : token.slice(eq + 1) })
  }
  return parsed
}

function tokens(option: Option): string[] {
  return option.value === undefined ? [option.name] : [option.name, option.value]
}

/**
 * Vrai si la ligne de commande ne désigne **ni commande ni positional** : chaque jeton est alors
 * une option du serveur (ou la valeur de l'une d'elles).
 *
 * `-h`, `--help`, `-v` et `--version` ne figurent pas dans le tableau, et c'est délibéré : ils
 * rendent donc « non », l'aide et la version restent intactes.
 */
export function hasOnlyServerOptions(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const eq = token.indexOf("=")
    const name = eq === -1 ? token : token.slice(0, eq)
    const arity = OPTIONS[name]
    if (!arity) return false
    if (arity === "value" && eq === -1) i++
  }
  return true
}

/**
 * Ce que fait une invocation **sans commande** : `local` (le serveur, puis la TUI attachée à lui)
 * devant un terminal, `serve` (le serveur seul) partout ailleurs. Le TTY est une **entrée** : la
 * règle reste pure, donc testable sans terminal.
 */
export type DefaultMode = "local" | "serve" | "command"

export function resolveDefaultMode(argv: readonly string[], tty: boolean): DefaultMode {
  if (!hasOnlyServerOptions(argv)) return "command"
  return tty ? "local" : "serve"
}

/** Le port du serveur local : celui demandé, sinon celui que tout le harnais connaît. */
export function localServerPort(argv: readonly string[]): number {
  const port = parse(argv).find((option) => option.name === "--port")?.value
  const parsed = Number(port)
  return port && Number.isFinite(parsed) ? parsed : DevSource.DEFAULT_PORT
}

/** L'adresse du serveur local : toujours la boucle locale, c'est un serveur engendré sur place. */
export function localServerUrl(argv: readonly string[]): string {
  return `http://127.0.0.1:${localServerPort(argv)}`
}

/**
 * Les options d'écoute à transmettre au serveur engendré (`--hostname`, `--mdns`,
 * `--mdns-domain`, `--cors`) : elles décident où il écoute et qui peut l'appeler, donc les perdre
 * ferait un serveur injoignable par le client qui vient de le lancer. `--port` n'y figure pas : la
 * commande d'attache le tient déjà de l'URL.
 */
export function listenerArgs(argv: readonly string[]): string[] {
  return parse(argv)
    .filter((option) => NETWORK.has(option.name) && option.name !== "--port")
    .flatMap(tokens)
}

/**
 * L'invocation de la TUI attachée : la ligne d'origine **moins** les options d'écoute, que le
 * serveur engendré a déjà reçues. Le CLI est en `strict()` : une option inconnue de la commande
 * d'attache ferait échouer l'invocation au lieu d'ouvrir la TUI.
 */
export function attachArgs(argv: readonly string[]): string[] {
  return parse(argv)
    .filter((option) => !NETWORK.has(option.name))
    .flatMap(tokens)
}

export * as CliDefaultCommand from "./default-command"
