import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { loadGuardRoots } from "../../src/guard/parse"

const body = (name: string) =>
  `---\nname: ${name}\ndescription: garde de test\nwhen:\n  since_last_tokens: ">= 1"\n---\n\ncorps\n`

function tree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "guard-origin-"))
  const globalRoot = path.join(base, "global", "guards")
  const projectRoot = path.join(base, "proj", ".opencode", "guards")
  fs.mkdirSync(globalRoot, { recursive: true })
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.writeFileSync(path.join(globalRoot, "partagee.md"), body("partagee"))
  fs.writeFileSync(path.join(globalRoot, "globale.md"), body("globale"))
  fs.writeFileSync(path.join(projectRoot, "locale.md"), body("locale"))
  // Même nom que la globale : c'est le fichier du dépôt qui doit gagner, et l'origine affichée
  // doit dire « project » — sinon l'utilisateur croit charger la version globale alors qu'il lit
  // celle du dépôt.
  fs.writeFileSync(path.join(projectRoot, "partagee.md"), body("partagee"))
  return { base, globalRoot, projectRoot }
}

describe("guard origin", () => {
  test("a guard is tagged by the directory it comes from", async () => {
    const { base, globalRoot, projectRoot } = tree()
    const result = await loadGuardRoots([globalRoot, projectRoot], { globalRoot })
    const byName = Object.fromEntries(result.guards.map((guard) => [guard.name, guard.origin]))
    expect(byName.globale).toBe("global")
    expect(byName.locale).toBe("project")
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("a project guard shadows the global one and is reported as project", async () => {
    const { base, globalRoot, projectRoot } = tree()
    const result = await loadGuardRoots([globalRoot, projectRoot], { globalRoot })
    const shared = result.guards.filter((guard) => guard.name === "partagee")
    expect(shared).toHaveLength(1)
    expect(shared[0]?.origin).toBe("project")
    fs.rmSync(base, { recursive: true, force: true })
  })

  test("without a known global root everything is project, never silently global", async () => {
    const { base, globalRoot, projectRoot } = tree()
    const result = await loadGuardRoots([globalRoot, projectRoot])
    expect(result.guards.every((guard) => guard.origin === "project")).toBe(true)
    fs.rmSync(base, { recursive: true, force: true })
  })
})
