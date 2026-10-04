import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import {
  NO_AUTOSTART_ENV,
  acquireSpawnLock,
  daemonBinary,
  isDaemonRunning,
  releaseSpawnLock,
  shouldAutoStart,
} from "@/daemon/autostart"
import { logFilePath, pidFilePath, readPidFile, spawnLockPath } from "@/daemon/paths"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "daemon-autostart-"))

describe("shouldAutoStart", () => {
  test("starts when enabled and no daemon is running", () => {
    expect(shouldAutoStart({ env: {}, running: false })).toBe(true)
  })

  test("never starts twice", () => {
    expect(shouldAutoStart({ env: {}, running: true })).toBe(false)
  })

  test("honours the documented opt-out values", () => {
    expect(shouldAutoStart({ env: { [NO_AUTOSTART_ENV]: "1" }, running: false })).toBe(false)
    expect(shouldAutoStart({ env: { [NO_AUTOSTART_ENV]: "true" }, running: false })).toBe(false)
    expect(shouldAutoStart({ env: { [NO_AUTOSTART_ENV]: "TRUE" }, running: false })).toBe(false)
    expect(shouldAutoStart({ env: { [NO_AUTOSTART_ENV]: "0" }, running: false })).toBe(true)
    expect(shouldAutoStart({ env: { [NO_AUTOSTART_ENV]: "" }, running: false })).toBe(true)
  })
})

describe("daemonBinary", () => {
  test("reuses the running opencode binary and falls back to PATH otherwise", () => {
    expect(daemonBinary("C:\\Users\\x\\AppData\\Roaming\\npm\\opencodev2.exe")).toBe(
      "C:\\Users\\x\\AppData\\Roaming\\npm\\opencodev2.exe",
    )
    expect(daemonBinary("/usr/local/bin/opencode")).toBe("/usr/local/bin/opencode")
    expect(daemonBinary("/usr/local/bin/bun")).toBe("opencodev2")
  })
})

describe("pid helpers", () => {
  test("write/read round-trip, missing file yields null", () => {
    const dir = tmp()
    expect(readPidFile(dir)).toBeNull()
    fs.writeFileSync(pidFilePath(dir), `${process.pid}\n`)
    expect(readPidFile(dir)).toBe(process.pid)
    expect(logFilePath(dir)).toBe(path.join(dir, "daemon.log"))
  })

  test("isDaemonRunning tracks a live PID and ignores a dead one", () => {
    const dir = tmp()
    expect(isDaemonRunning(dir)).toBe(false)
    fs.writeFileSync(pidFilePath(dir), String(process.pid))
    expect(isDaemonRunning(dir)).toBe(true)
    // A certainly-dead PID: the daemon directory of an arbitrary high number.
    fs.writeFileSync(pidFilePath(dir), "999999999")
    expect(isDaemonRunning(dir)).toBe(false)
  })
})

describe("spawn lock", () => {
  test("serialises launchers and can be released", () => {
    const dir = tmp()
    expect(acquireSpawnLock(dir)).toBe(true)
    expect(acquireSpawnLock(dir)).toBe(false)
    releaseSpawnLock(dir)
    expect(acquireSpawnLock(dir)).toBe(true)
    releaseSpawnLock(dir)
  })

  test("steals a lock abandoned by a crashed launcher", () => {
    const dir = tmp()
    acquireSpawnLock(dir)
    fs.writeFileSync(spawnLockPath(dir), String(Date.now() - 60_000))
    expect(acquireSpawnLock(dir)).toBe(true)
  })
})
