import { describe, expect, test } from "bun:test"
import { isMedia, sniffAttachmentMime } from "./media"

describe("media signatures", () => {
  test("recognizes audio and video as media", () => {
    expect(isMedia("video/mp4")).toBe(true)
    expect(isMedia("audio/wav")).toBe(true)
  })

  test("sniffs common video containers before extension fallback", () => {
    expect(sniffAttachmentMime(new Uint8Array([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d]), "application/octet-stream")).toBe("video/mp4")
    expect(sniffAttachmentMime(new Uint8Array([0x1a,0x45,0xdf,0xa3]), "application/octet-stream")).toBe("video/webm")
    expect(sniffAttachmentMime(new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x41,0x56,0x49,0x20]), "application/octet-stream")).toBe("video/x-msvideo")
  })
})
