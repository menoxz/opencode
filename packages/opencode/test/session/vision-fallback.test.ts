import { describe, expect, test } from "bun:test"
import { unreadableImages } from "../../src/session/prompt"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionID, MessageID, PartID } from "../../src/session/schema"

const sessionID = SessionID.make("session")
const messageID = MessageID.make("msg_1")

const basePart = (id: string) => ({
  id: PartID.make(`prt_${id}`),
  sessionID,
  messageID,
})

const attachment = (id: string, mime: string): MessageV2.FilePart => ({
  ...basePart(id),
  type: "file",
  mime,
  filename: mime.startsWith("image/") ? "screenshot.png" : "document.pdf",
  url: `data:${mime};base64,AAAA`,
})

const readTool = (attachments: MessageV2.FilePart[]): MessageV2.ToolPart => ({
  ...basePart("tool-1"),
  type: "tool",
  callID: "call-1",
  tool: "read",
  state: {
    status: "completed",
    input: { filePath: "/tmp/screenshot.png" },
    output: "Image read successfully",
    title: "Read",
    metadata: {},
    time: { start: 0, end: 1 },
    attachments,
  },
})

describe("unreadableImages", () => {
  test("returns an image the user attached to the prompt", () => {
    const part = attachment("file-1", "image/png")
    expect(unreadableImages(part)).toEqual([part])
  })

  // Regression: the read tool returns images as tool-result attachments, never as
  // message file parts. Only file parts used to be collected, so reading an image
  // with a model without image input produced "Image read successfully" and no
  // usable content at all.
  test("returns images a tool returned as tool-result attachments", () => {
    const image = attachment("file-1", "image/png")
    expect(unreadableImages(readTool([image]))).toEqual([image])
  })

  test("returns every image when a tool returns several", () => {
    const first = attachment("file-1", "image/png")
    const second = attachment("file-2", "image/jpeg")
    expect(unreadableImages(readTool([first, second]))).toEqual([first, second])
  })

  test("ignores non-image tool attachments", () => {
    expect(unreadableImages(readTool([attachment("file-1", "application/pdf")]))).toEqual([])
  })

  test("ignores a tool that has not completed", () => {
    const running: MessageV2.ToolPart = {
      ...basePart("tool-2"),
      type: "tool",
      callID: "call-2",
      tool: "read",
      state: { status: "running", input: { filePath: "/tmp/screenshot.png" }, time: { start: 0 } },
    }
    expect(unreadableImages(running)).toEqual([])
  })

  test("ignores parts that carry no media", () => {
    expect(unreadableImages({ ...basePart("text-1"), type: "text", text: "hello" })).toEqual([])
    expect(unreadableImages(attachment("file-3", "text/plain"))).toEqual([])
  })
})
