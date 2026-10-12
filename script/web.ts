#!/usr/bin/env bun
/**
 * Lance la version web d'opencodev2 en une seule commande, sans build de binaire.
 *
 *   bun run web            # construit l'UI si besoin, puis demarre le serveur
 *   bun run web --rebuild  # force la reconstruction de l'UI
 *
 * Le serveur sert lui-meme l'UI compilee (OPENCODE_WEB_UI_DIR), donc une seule origine :
 * pas de proxy, pas de CORS a configurer, un seul port.
 */
import { existsSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const webui = path.join(root, "packages", "webui")
const dist = path.join(webui, "dist")
const entry = path.join(root, "packages", "opencode", "src", "index.ts")

const port = process.env.OPENCODE_SERVER_PORT ?? "4096"
const rebuild = process.argv.includes("--rebuild")
const bun = process.execPath

if (rebuild || !existsSync(path.join(dist, "index.html"))) {
  console.log("[web] construction de l'interface…")
  const build = Bun.spawnSync([bun, "run", "--cwd", webui, "build"], { stdout: "inherit", stderr: "inherit" })
  if (build.exitCode !== 0) {
    console.error("[web] la construction de l'interface a echoue — serveur non demarre.")
    process.exit(build.exitCode ?? 1)
  }
}

console.log(`[web] interface servie depuis ${dist}`)
console.log(`[web] ouvre http://127.0.0.1:${port}`)

const server = Bun.spawn([bun, "--conditions=browser", entry, "serve", "--port", port], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, OPENCODE_WEB_UI_DIR: dist },
})

// Transmet l'interruption pour ne pas laisser de serveur orphelin.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill())
}

process.exit(await server.exited)
