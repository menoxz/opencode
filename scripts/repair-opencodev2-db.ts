#!/usr/bin/env bun
// Répare la dérive de schéma de la base `opencodev2` (mesurée le 2026-10-23).
//
// Deux objets sont dans l'état d'une AUTRE lignée de migrations que celle du dépôt :
//   - `data_migration` est ABSENTE alors que sa migration est enregistrée comme appliquée
//     ⇒ `failed to run data migrations` (SQLITE_ERROR) à chaque démarrage ;
//   - `workspace` porte `provider/binding/created_at/last_used_at` au lieu de
//     `type/name/branch/directory/extra/project_id/time_used`
//     ⇒ `no such column: workspace.project_id` sur les routes serveur.
//
// Le registre `migration` de la base contient 51 entrées (dont des migrations qui n'existent
// plus dans le dépôt) : la base a été migrée par une lignée interrompue, donc les migrations
// du dépôt ne rejoueront jamais ces DDL. La réparation est donc explicite et vérifiée.
//
// Sûreté : la table `workspace` est VIDE (0 ligne) et aucune `session.workspace_id` ne la
// référence. Le script refuse de toucher une table non vide. Les DDL d'origine sont écrites
// à côté de la base, ce qui rend l'opération réversible.
//
// Usage : bun scripts/repair-opencodev2-db.ts [--db <chemin>] [--dry-run]

import { Database } from "bun:sqlite"
import { existsSync, writeFileSync } from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const dbIndex = args.indexOf("--db")
const dbPath =
  dbIndex >= 0
    ? args[dbIndex + 1]!
    : path.join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".local", "share", "opencodev2", "opencode.db")

if (!existsSync(dbPath)) {
  console.error(`REPAIR-DB-ABSENT: ${dbPath}`)
  process.exit(1)
}

const WORKSPACE_COLUMNS = ["id", "type", "name", "branch", "directory", "extra", "project_id", "time_used"]

const WORKSPACE_DDL = `CREATE TABLE \`workspace\` (
	\`id\` text PRIMARY KEY,
	\`type\` text NOT NULL,
	\`name\` text DEFAULT '' NOT NULL,
	\`branch\` text,
	\`directory\` text,
	\`extra\` text,
	\`project_id\` text NOT NULL,
	\`time_used\` integer NOT NULL DEFAULT 0,
	CONSTRAINT \`fk_workspace_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
)`

const DATA_MIGRATION_DDL = `CREATE TABLE \`data_migration\` (
	\`name\` text PRIMARY KEY,
	\`time_completed\` integer NOT NULL
)`

const db = new Database(dbPath, { readwrite: true })

const table = (name: string) =>
  db.query("select name, sql from sqlite_master where type='table' and name = ?").get(name) as
    | { name: string; sql: string }
    | null
const columns = (name: string) => (db.query(`pragma table_info(${name})`).all() as { name: string }[]).map((c) => c.name)

const drift: string[] = []
if (!table("data_migration")) drift.push("data_migration absente")
const workspace = table("workspace")
if (!workspace) drift.push("workspace absente")
else {
  const missing = WORKSPACE_COLUMNS.filter((c) => !columns("workspace").includes(c))
  if (missing.length > 0) drift.push(`workspace sans colonne(s) ${missing.join(", ")}`)
}

console.log(`base     : ${dbPath}`)
console.log(`dérive   : ${drift.length === 0 ? "aucune" : drift.join(" ; ")}`)
if (drift.length === 0) {
  console.log("REPAIR-DB-OK (rien à faire)")
  db.close()
  process.exit(0)
}

// Sauvegarde des DDL d'origine, à côté de la base : l'opération reste réversible.
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const backup = `${dbPath}.schema-backup-${stamp}.sql`
const originalWorkspace = workspace?.sql ?? "-- workspace absente"
writeFileSync(
  backup,
  [
    `-- DDL d'origine avant réparation (${new Date().toISOString()})`,
    `-- workspace: ${workspace ? `${(db.query("select count(*) c from workspace").get() as { c: number }).c} ligne(s)` : "absente"}`,
    originalWorkspace,
    table("data_migration")?.sql ?? "-- data_migration absente",
    "",
  ].join("\n\n"),
)
console.log(`sauvegarde: ${backup}`)

if (dryRun) {
  console.log("DRY-RUN: aucune écriture")
  db.close()
  process.exit(0)
}

// `workspace` non vide = données réelles d'une autre lignée : on refuse, jamais de perte silencieuse.
if (workspace) {
  const rows = (db.query("select count(*) c from workspace").get() as { c: number }).c
  if (rows > 0) {
    console.error(`REPAIR-DB-REFUS: workspace contient ${rows} ligne(s) — réparation manuelle requise`)
    db.close()
    process.exit(1)
  }
}

db.exec("PRAGMA foreign_keys=OFF")
const done: string[] = []
if (!table("data_migration")) {
  db.exec(DATA_MIGRATION_DDL)
  done.push("data_migration créée")
}
if (workspace) {
  db.exec("DROP TABLE `workspace`")
  db.exec(WORKSPACE_DDL)
  done.push("workspace recréée au schéma du dépôt")
}
db.exec("PRAGMA foreign_keys=ON")

// Vérification : colonnes attendues ET la requête qui échouait.
const missing = WORKSPACE_COLUMNS.filter((c) => !columns("workspace").includes(c))
db.query("select id, type, name, branch, directory, extra, project_id, time_used from workspace limit 1").all()
db.query("select name, time_completed from data_migration limit 1").all()
db.close()

console.log(`appliqué : ${done.join(" ; ")}`)
if (missing.length > 0) {
  console.error(`REPAIR-DB-ECHEC: colonnes toujours manquantes ${missing.join(", ")}`)
  process.exit(1)
}
console.log("REPAIR-DB-OK")
