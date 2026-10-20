/**
 * Parsing d'un fichier de garde, partagé par le service (`./index`) et la commande de dry-run
 * (`script/guards.ts`).
 *
 * Partagé volontairement : un dry-run qui n'emprunte pas le même chemin que le service annonce ce
 * qui *aurait* dû se passer, pas ce qui se passera. C'est la différence entre un instrument et une
 * illustration.
 */
import path from "path"
import fs from "fs"
import { ConfigMarkdown } from "@/config/markdown"
import { compileGuard, GuardDefinitionError, type CompiledGuard } from "./triggers"

export type GuardError = { location: string; message: string }

export type GuardLoadResult = {
  guards: CompiledGuard[]
  errors: GuardError[]
  files: string[]
}

/** Les `.md` d'un dossier de gardes, triés pour un affichage stable. */
export function guardFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(root, entry.name))
    .sort()
}

/**
 * Charge une garde depuis son fichier. Lève `GuardDefinitionError` : un fichier illisible ou sans nom
 * ne doit pas devenir une garde inerte, il doit être signalé.
 */
export async function loadGuardFile(file: string): Promise<CompiledGuard> {
  const fallbackName = path.basename(file, path.extname(file))
  const parsed = await ConfigMarkdown.parse(file)
  const data = (parsed.data ?? {}) as {
    name?: unknown
    description?: unknown
    when?: unknown
    limits?: unknown
  }
  const name = typeof data.name === "string" ? data.name.trim() : ""
  if (!name) throw new GuardDefinitionError(fallbackName, "missing name in frontmatter")
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  return compileGuard({
    name,
    description: typeof data.description === "string" ? data.description : undefined,
    body: parsed.content ?? "",
    when: record(data.when) ?? {},
    limits: record(data.limits) ?? {},
  })
}

/** Charge tous les `.md` d'un dossier : les gardes valides d'un côté, les refus de l'autre. */
export async function loadGuardRoot(root: string): Promise<GuardLoadResult> {
  const files = guardFiles(root)
  const guards: CompiledGuard[] = []
  const errors: GuardError[] = []
  for (const file of files) {
    try {
      guards.push(await loadGuardFile(file))
    } catch (error) {
      const message = error instanceof GuardDefinitionError ? error.message : String(error)
      errors.push({ location: file, message })
    }
  }
  return { guards, errors, files }
}

/** Fusionne plusieurs dossiers ; le dernier gagne sur un nom identique (projet > global). */
export async function loadGuardRoots(roots: string[]): Promise<GuardLoadResult> {
  const byName = new Map<string, CompiledGuard>()
  const errors: GuardError[] = []
  const files: string[] = []
  for (const root of roots) {
    const result = await loadGuardRoot(root)
    files.push(...result.files)
    errors.push(...result.errors)
    for (const guard of result.guards) byName.set(guard.name, guard)
  }
  const ordered: CompiledGuard[] = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  return { guards: ordered, errors, files }
}
