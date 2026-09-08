import { describe, expect, test } from "bun:test"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { TextReader, Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js"
import { ArtifactStore } from "@/artifact/store"
import { DocumentExtractor } from "./extractor"

async function docx(entries: Record<string, string | Uint8Array>) {
  const writer = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, value] of Object.entries(entries)) {
    await writer.add(name, typeof value === "string" ? new TextReader(value) : new Uint8ArrayReader(value))
  }
  return new Uint8Array(await writer.close())
}

describe("document extractor", () => {
  test("extracts DOCX structure and embedded images into CAS", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "document-extractor-"))
    const previous = process.env.OPENCODE_ARTIFACT_ROOT
    process.env.OPENCODE_ARTIFACT_ROOT = root
    try {
      const bytes = await docx({
        "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>`
          + `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Inventory Report</w:t></w:r></w:p>`
          + `<w:p><w:r><w:t>Current stock overview.</w:t></w:r></w:p>`
          + `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Product</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Stock</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Coffee</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
          + `</w:body></w:document>`,
        "word/header1.xml": `<?xml version="1.0"?><w:hdr xmlns:w="w"><w:p><w:r><w:t>ACME Shop</w:t></w:r></w:p></w:hdr>`,
        "word/footnotes.xml": `<?xml version="1.0"?><w:footnotes xmlns:w="w"><w:footnote w:id="1"><w:p><w:r><w:t>Verified count</w:t></w:r></w:p></w:footnote></w:footnotes>`,
        "word/media/image1.png": new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]),
      })
      const extraction = await DocumentExtractor.extractBytes(bytes, { filename: "inventory.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      expect(extraction.kind).toBe("docx")
      expect(extraction.text).toContain("# Inventory Report")
      expect(extraction.text).toContain("Current stock overview.")
      expect(extraction.text).toContain("| Product | Stock |")
      expect(extraction.text).toContain("ACME Shop")
      expect(extraction.text).toContain("Verified count")
      expect(extraction.assets).toHaveLength(1)
      expect(extraction.assets[0]).toMatchObject({ mime: "image/png", sourceLocator: "word/media/image1.png" })
      expect(ArtifactStore.isReference(extraction.assets[0]!.url)).toBe(true)
      const cached = await DocumentExtractor.extractBytes(bytes, { filename: "inventory.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
      expect(cached.metadata.cacheHit).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_ARTIFACT_ROOT; else process.env.OPENCODE_ARTIFACT_ROOT = previous
      await fs.rm(root, { recursive: true, force: true })
    }
  })
  test.skipIf(spawnSync("python", ["-c", "import fitz"], { stdio: "ignore" }).status !== 0)("extracts PDF text with page provenance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-extractor-"))
    const previous = process.env.OPENCODE_ARTIFACT_ROOT
    process.env.OPENCODE_ARTIFACT_ROOT = root
    try {
      const bytes = await fs.readFile(path.resolve(import.meta.dir, "../../test/tool/fixtures/sample-document.pdf"))
      const extraction = await DocumentExtractor.extractBytes(bytes, { filename: "sample-document.pdf", mime: "application/pdf" })
      expect(extraction.kind).toBe("pdf")
      expect(extraction.text).toContain("## Page 1")
      expect(extraction.text).toContain("Quarterly Inventory Report")
      expect(extraction.text).toContain("Coffee stock: 12")
      expect(extraction.metadata).toMatchObject({ pages: 1 })
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_ARTIFACT_ROOT; else process.env.OPENCODE_ARTIFACT_ROOT = previous
      await fs.rm(root, { recursive: true, force: true })
    }
  })
  test.skipIf(spawnSync("python", ["-c", "import fitz"], { stdio: "ignore" }).status !== 0)("extracts Unicode PDF text on Windows code pages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-unicode-extractor-"))
    const previous = process.env.OPENCODE_ARTIFACT_ROOT
    process.env.OPENCODE_ARTIFACT_ROOT = root
    try {
      const pdf = path.join(root, "unicode.pdf")
      const generated = spawnSync("python", ["-c", "import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_font(fontname='china-s'); p.insert_text((72,72),'Criterion ● verified',fontname='china-s'); d.save(sys.argv[1])", pdf], { stdio: "ignore" })
      expect(generated.status).toBe(0)
      const bytes = await fs.readFile(pdf)
      const extraction = await DocumentExtractor.extractBytes(bytes, { filename: "unicode.pdf", mime: "application/pdf" })
      expect(extraction.text).toContain("Criterion ● verified")
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_ARTIFACT_ROOT; else process.env.OPENCODE_ARTIFACT_ROOT = previous
      await fs.rm(root, { recursive: true, force: true })
    }
  })
  test.skipIf(spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status !== 0)("extracts video metadata keyframes and audio", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "video-extractor-"))
    const previous = process.env.OPENCODE_ARTIFACT_ROOT
    process.env.OPENCODE_ARTIFACT_ROOT = root
    try {
      const bytes = await fs.readFile(path.resolve(import.meta.dir, "../../test/tool/fixtures/sample-video.mp4"))
      const extraction = await DocumentExtractor.extractBytes(bytes, { filename: "sample-video.mp4", mime: "video/mp4" })
      expect(extraction.kind).toBe("video")
      expect(extraction.text).toContain("# Video: sample-video.mp4")
      expect(extraction.text).toContain("Visual timeline")
      expect(Number(extraction.metadata.durationSeconds)).toBeGreaterThan(1.8)
      expect(extraction.assets.some((asset) => asset.mime === "image/jpeg")).toBe(true)
      expect(extraction.assets.some((asset) => asset.mime === "audio/wav")).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_ARTIFACT_ROOT; else process.env.OPENCODE_ARTIFACT_ROOT = previous
      await fs.rm(root, { recursive: true, force: true })
    }
  })
  test("rejects unsafe OOXML archive paths", async () => {
    const bytes = await docx({
      "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="w"><w:body/></w:document>`,
      "../evil.txt": "escape",
    })
    await expect(DocumentExtractor.extractBytes(bytes, { filename: "unsafe.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).rejects.toThrow("Unsafe document archive entry")
  })
  test("does not classify TypeScript video/mp2t MIME ambiguity as video", () => {
    expect(DocumentExtractor.kind("main.ts", "video/mp2t")).toBeUndefined()
    expect(DocumentExtractor.kind("clip.mp4", "video/mp2t")).toBe("video")
  })
})
