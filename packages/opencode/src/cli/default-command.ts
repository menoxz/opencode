/**
 * La commande par défaut du CLI.
 *
 * Sans commande — `opencodev2` seul, ou seulement les options du serveur et de la racine
 * (`--port`, `--hostname`, `--print-logs`…) — le CLI **sert** : c'est le serveur qui recharge à
 * chaud ce qui vit (skills, agents, plugins, instructions), et l'interface web qu'il rend à sa
 * racine. Toute autre invocation garde son sens inchangé : un nom de commande, un dossier de
 * projet pour le TUI, ou une option propre au TUI (`-s`, `--model`…) laissent yargs décider.
 *
 * Le discriminant est « **aucun positional** », jamais « aucun jeton sans tiret » : la **valeur**
 * d'une option n'a pas de tiret, donc `opencodev2 --port 4099` — un appel parfaitement normal du
 * serveur — était pris pour une commande et retombait sur le TUI (mesuré le 2026-10-17 sur le
 * binaire déployé : `--port 4099` rendait le TUI, `serve --port 4097` servait).
 */

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

/**
 * Vrai si la ligne de commande ne désigne **ni commande ni positional** : chaque jeton est alors
 * une option du serveur (ou la valeur de l'une d'elles), et le CLI doit servir.
 *
 * `-h`, `--help`, `-v` et `--version` ne figurent pas dans le tableau, et c'est délibéré : ils
 * rendent donc « non », l'aide et la version restent intactes.
 */
export function shouldDefaultToServe(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    const eq = token.indexOf("=")
    const name = eq === -1 ? token : token.slice(0, eq)
    const arity = OPTIONS[name]
    if (!arity) return false
    // `--port=4099` porte sa valeur dans le jeton ; `--port 4099` la porte dans le suivant.
    if (arity === "value" && eq === -1) i++
  }
  return true
}

export * as CliDefaultCommand from "./default-command"
