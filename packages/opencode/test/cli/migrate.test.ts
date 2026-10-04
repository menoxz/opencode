import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import {
  computeMigrationState,
  markerPath,
  migrateOriginalData,
  originalDirs,
  writeMarker,
  type MigrationDirs,
} from "../../src/cli/migrate"

// Mirror the XDG layout: the fork lives in .../<base>/opencodev2 and the
// upstream product in .../<base>/opencode (same base directory).
const root = path.join(os.tmpdir(), `ocv2-migrate-${process.pid}-${Date.now()}`)
const base = path.join(root, "share")
const own: MigrationDirs = {
  data: path.join(base, "opencodev2"),
  config: path.join(base, "config", "opencodev2"),
}
const orig = originalDirs(own)

const originalData = () => path.join(base, "opencode")
const originalConfig = () => path.join(base, "config", "opencode")

function mkdirp(p: string) {
  fs.mkdirSync(p, { recursive: true })
}

function write(p: string, content: string) {
  mkdirp(path.dirname(p))
  fs.writeFileSync(p, content)
}

beforeAll(() => {
  // Simulate an upstream opencode installation with config, credentials and sessions.
  write(path.join(originalConfig(), "opencode.json"), '{"theme": "dark"}')
  write(path.join(originalData(), "opencode.db"), "sqlite-bytes")
  write(path.join(originalData(), "auth.json"), '{"anthropic":"sk-test"}')
  write(path.join(originalData(), "storage", "legacy.json"), "{}")
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe("computeMigrationState", () => {
  test("detects upstream data and an empty fork dir → migration candidate", async () => {
    const state = await computeMigrationState(own)
    expect(state.hasOriginalData).toBe(true)
    expect(state.hasForkData).toBe(false)
    expect(state.decided).toBe(false)
    expect(state.originalData).toBe(originalData())
  })

  test("returns no candidate when upstream data is absent", async () => {
    const clean = {
      data: path.join(root, "isolated", "opencodev2"),
      config: path.join(root, "isolated-cfg", "opencodev2"),
    }
    const state = await computeMigrationState(clean)
    expect(state.hasOriginalData).toBe(false)
  })

  test("stops prompting once the fork already has its own database", async () => {
    const ownData = path.join(root, "share", "opencodev2")
    mkdirp(ownData)
    write(path.join(ownData, "opencode.db"), "fork-bytes")
    const state = await computeMigrationState(own)
    expect(state.hasForkData).toBe(true)
    fs.rmSync(path.join(ownData, "opencode.db"))
  })
})

describe("migrateOriginalData", () => {
  test("copies config, credentials, DB (+WAL) and legacy storage; leaves the original intact", async () => {
    // Add a WAL file to ensure it is copied too.
    write(path.join(originalData(), "opencode.db-wal"), "wal-bytes")

    const copied = await migrateOriginalData(own)

    expect(copied).toContain(originalConfig())
    expect(copied).toContain(path.join(originalData(), "storage"))
    expect(fs.readFileSync(path.join(own.data, "opencode.db"), "utf8")).toBe("sqlite-bytes")
    expect(fs.readFileSync(path.join(own.data, "opencode.db-wal"), "utf8")).toBe("wal-bytes")
    expect(fs.readFileSync(path.join(own.data, "auth.json"), "utf8")).toBe('{"anthropic":"sk-test"}')
    expect(fs.readFileSync(path.join(own.config, "opencode.json"), "utf8")).toBe('{"theme": "dark"}')

    // The upstream installation is never touched.
    expect(fs.readFileSync(path.join(originalData(), "opencode.db"), "utf8")).toBe("sqlite-bytes")
    expect(fs.existsSync(path.join(originalData(), "auth.json"))).toBe(true)
  })

  test("writes a marker so the wizard never prompts twice", async () => {
    await writeMarker(own.data, "copy")
    expect(fs.existsSync(markerPath(own.data))).toBe(true)

    const state = await computeMigrationState(own)
    expect(state.decided).toBe(true)
  })
})
