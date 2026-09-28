import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Le SDK MCP ne masque la console Windows que dans Electron :
 *   windowsHide: process.platform === "win32" && isElectron()
 * Hors Electron, chaque serveur MCP local alloue donc sa propre console et fait
 * apparaître une fenêtre (une par connexion d'instance et par reconnexion).
 *
 * `patches/@modelcontextprotocol%2Fsdk@1.27.1.patch` retire la condition
 * Electron ; ce test garde l'état corrigé. Si le patch est retiré, si le SDK est
 * mis à jour sans lui, ou si bun cesse de l'appliquer, la fenêtre revient et ce
 * test doit échouer.
 */
function sdkRoot(): string {
  let dir = import.meta.dir
  for (;;) {
    const candidate = join(dir, "node_modules", "@modelcontextprotocol", "sdk")
    if (existsSync(join(candidate, "package.json"))) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`@modelcontextprotocol/sdk not found above ${import.meta.dir}`)
    dir = parent
  }
}

describe("patched mcp sdk hides the console on windows", () => {
  test("the effective stdio spawn option does not gate windowsHide on electron", () => {
    const root = sdkRoot()

    for (const rel of ["dist/esm/client/stdio.js", "dist/cjs/client/stdio.js"]) {
      const text = readFileSync(join(root, rel), "utf8")
      const line = text.split("\n").find((candidate) => candidate.includes("windowsHide:"))
      expect(line).toBeDefined()
      expect(line!).toContain("win32")
      expect(line!).not.toContain("isElectron")
    }
  })
})
