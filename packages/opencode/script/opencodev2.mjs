#!/usr/bin/env node
// Lanceur du CLI `opencodev2` — le point d'entrée du paquet méta.
//
// Pourquoi un lanceur Node, et non le binaire lui-même : le paquet méta est **multi-plateforme**,
// donc il ne peut pas embarquer les binaires (338 Mo par plateforme). Le binaire réel arrive par la
// dépendance optionnelle `@lux-tech/opencode-ai-<os>-<arch>`, que `postinstall.mjs` recopie dans
// `bin/`.
//
// Or **tous les gestionnaires ne lancent pas les scripts d'installation** : Bun ne les exécute pas
// tant que la dépendance n'est pas approuvée (`bun pm untrusted`), pnpm non plus par défaut, et
// `--ignore-scripts` les supprime. Jusqu'ici, `bin/opencode.exe` était alors un **script shell** :
// sous Windows, l'exécuter donnait « The specified executable is not a valid application for this OS
// platform » — une erreur qui ne dit ni la cause ni le remède.
//
// Ce lanceur remplace ce faux binaire : il **répare** (en rejouant la résolution du postinstall,
// une fois) puis **exécute**, et si ça échoue il **dit quoi faire**. Il fonctionne à l'identique sur
// Windows, macOS et Linux, parce que npm construit ses shims à partir du shebang ci-dessus.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const binary = path.join(here, "opencode.exe")

/** Un vrai exécutable commence par sa signature : PE (`MZ`), ELF (`\x7fELF`), Mach-O (`\xcf\xfa`…). */
function usable() {
  try {
    const head = Buffer.alloc(4)
    const fd = fs.openSync(binary, "r")
    fs.readSync(fd, head, 0, 4, 0)
    fs.closeSync(fd)
    const magic = head.toString("latin1")
    if (magic.startsWith("MZ")) return true
    if (magic.startsWith("\x7fELF")) return true
    if (["\xcf\xfa", "\xce\xfa", "\xfe\xed", "\xca\xfe"].includes(magic.slice(0, 2))) return true
    // Repli : un binaire de cette taille ne peut pas être le script de remplacement (346 octets).
    return fs.statSync(binary).size > 1_000_000
  } catch {
    return false
  }
}

if (!usable()) {
  const postinstall = path.join(here, "..", "postinstall.mjs")
  if (fs.existsSync(postinstall)) {
    process.stderr.write("opencodev2: binaire de plateforme absent, résolution…\n")
    spawnSync(process.execPath, [postinstall], { stdio: "inherit" })
  }
}

if (!usable()) {
  process.stderr.write(
    [
      "opencodev2: le binaire de plateforme n'est pas installé.",
      "",
      "Le script d'installation du paquet n'a pas été exécuté : Bun ne lance pas les scripts d'une",
      "dépendance non approuvée (`bun pm untrusted`), pnpm non plus par défaut, et `--ignore-scripts`",
      "les supprime. Ce n'est donc pas un défaut de l'exécutable.",
      "",
      "À faire une fois, puis relancer :",
      "  bun   bun pm trust @lux-tech/opencode-ai",
      "  npm   node node_modules/@lux-tech/opencode-ai/postinstall.mjs",
      "",
      `Binaire attendu : ${binary}`,
      "",
    ].join("\n"),
  )
  process.exit(1)
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" })
if (result.error) {
  process.stderr.write(`opencodev2: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
