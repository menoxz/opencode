import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { guardWatchKey, guardWatchTargets } from "../../src/guard"

function tempRoot(withGuards: boolean) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "guard-watch-"))
  const guards = path.join(base, "guards")
  if (withGuards) fs.mkdirSync(guards, { recursive: true })
  return { base, guards, roots: [guards] }
}

describe("guard watch", () => {
  test("an existing guards folder is watched as a container, its parent as a filtered root", () => {
    const { base, guards, roots } = tempRoot(true)
    const targets = guardWatchTargets(roots)
    expect(targets.get(base)).toBe(false)
    expect(targets.get(guards)).toBe(true)
    fs.rmSync(base, { recursive: true, force: true })
  })

  // Le cas qui manquait : au démarrage `guards/` n'existe pas encore, et le service ne le voyait
  // qu'au redémarrage suivant. Le parent doit rester surveillé pour voir apparaître le dossier.
  test("a missing guards folder still leaves its parent under watch", () => {
    const { base, guards, roots } = tempRoot(false)
    const targets = guardWatchTargets(roots)
    expect(targets.get(base)).toBe(false)
    expect(targets.has(guards)).toBe(false)
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("the creation of the guards folder under a watched parent is a catalog change", () => {
    const { base, guards, roots } = tempRoot(false)
    expect(guardWatchKey(roots, { dir: base, container: false }, "guards")).not.toBeNull()
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("a write elsewhere under the same parent is ignored", () => {
    const { base, roots } = tempRoot(false)
    // Sans ce filtre, chaque écriture dans .opencode/skills rechargerait le catalogue des gardes.
    expect(guardWatchKey(roots, { dir: base, container: false }, "skills")).toBeNull()
    expect(guardWatchKey(roots, { dir: base, container: false }, "opencode.json")).toBeNull()
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("a nested path inside the guards folder is a catalog change", () => {
    const { base, guards, roots } = tempRoot(true)
    const nested = path.join("guards", "delegate.md")
    expect(guardWatchKey(roots, { dir: base, container: false }, nested)).not.toBeNull()
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("a container target reports every event, including an unnamed one", () => {
    const { base, guards, roots } = tempRoot(true)
    expect(guardWatchKey(roots, { dir: guards, container: true }, "delegate.md")).not.toBeNull()
    expect(guardWatchKey(roots, { dir: guards, container: true }, null)).not.toBeNull()
    fs.rmSync(base, { recursive: true, force: true })
  })
})
