import { describe, expect, test } from "bun:test"
import { attachmentMaxBytes, attachmentMime } from "./files"
import { pasteMode } from "./paste"

describe("attachmentMime", () => {
  test("keeps PDFs when the browser reports the mime", async () => {
    const file = new File(["%PDF-1.7"], "guide.pdf", { type: "application/pdf" })
    expect(await attachmentMime(file)).toBe("application/pdf")
  })

  test("accepts DOCX and supported video containers", async () => {
    expect(await attachmentMime(new File([Uint8Array.of(0x50, 0x4b, 3, 4)], "report.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(await attachmentMime(new File([Uint8Array.of(0,0,0,24,0x66,0x74,0x79,0x70)], "clip.mp4", { type: "video/mp4" }))).toBe("video/mp4")
    expect(await attachmentMime(new File([Uint8Array.of(0x1a,0x45,0xdf,0xa3)], "clip.webm", { type: "video/webm" }))).toBe("video/webm")
  })

  test("normalizes structured text types to text/plain", async () => {
    const file = new File(['{"ok":true}\n'], "data.json", { type: "application/json" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("accepts text files even with a misleading browser mime", async () => {
    const file = new File(["export const x = 1\n"], "main.ts", { type: "video/mp2t" })
    expect(await attachmentMime(file)).toBe("text/plain")
  })

  test("rejects binary files", async () => {
    const file = new File([Uint8Array.of(0, 255, 1, 2)], "blob.bin", { type: "application/octet-stream" })
    expect(await attachmentMime(file)).toBeUndefined()
  })
})

describe("attachment limits", () => {
  test("bounds videos and documents before base64 conversion", () => {
    expect(attachmentMaxBytes("video/mp4")).toBe(100 * 1024 * 1024)
    expect(attachmentMaxBytes("application/pdf")).toBe(50 * 1024 * 1024)
    expect(attachmentMaxBytes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(50 * 1024 * 1024)
  })
})

describe("pasteMode", () => {
  test("uses native paste for short single-line text", () => {
    expect(pasteMode("hello world")).toBe("native")
  })

  test("uses manual paste for multiline text", () => {
    expect(
      pasteMode(`{
  "ok": true
}`),
    ).toBe("manual")
    expect(pasteMode("a\r\nb")).toBe("manual")
  })

  test("uses manual paste for large text", () => {
    expect(pasteMode("x".repeat(8000))).toBe("manual")
  })
})
