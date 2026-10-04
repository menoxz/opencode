import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { ArtifactStore } from "./store"

describe("artifact store", () => {
  test("deduplicates immutable bytes and hydrates them", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-store-"))
    try {
      const bytes = Buffer.from("embedded-image")
      const first = await ArtifactStore.put(bytes, { root, mime: "image/png", filename: "chart.png" })
      const second = await ArtifactStore.put(bytes, { root, mime: "image/png", filename: "chart.png" })
      expect(second.url).toBe(first.url)
      expect(first.url).toMatch(/^artifact:\/\/sha256\/[a-f0-9]{64}$/)
      const hydrated = await ArtifactStore.read(first.url, { root })
      expect(Buffer.from(hydrated.bytes).toString()).toBe("embedded-image")
      expect(hydrated.metadata).toMatchObject({ mime: "image/png", filename: "chart.png", size: bytes.length })
      expect(await ArtifactStore.toDataUrl(first.url, { root })).toBe(`data:image/png;base64,${bytes.toString("base64")}`)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("handles concurrent put and rejects invalid refs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-store-"))
    try {
      const values = await Promise.all(Array.from({ length: 8 }, () => ArtifactStore.put(Buffer.from("same"), { root, mime: "text/plain" })))
      expect(new Set(values.map((item) => item.url)).size).toBe(1)
      await expect(ArtifactStore.read("artifact://sha256/../../secret", { root })).rejects.toThrow("Invalid artifact reference")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
