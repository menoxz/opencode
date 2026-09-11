import { describe, expect, test } from "bun:test"
import { APICallError } from "ai"
import { MessageV2 } from "../../src/session/message-v2"
import { ProviderTransform } from "@/provider/transform"
import type { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionID, MessageID, PartID } from "../../src/session/schema"
import { Question } from "../../src/question"
import { ArtifactStore } from "../../src/artifact/store"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

const sessionID = SessionID.make("session")
const providerID = ProviderID.make("test")
const model: Provider.Model = {
  id: ModelID.make("test-model"),
  providerID,
  api: {
    id: "test-model",
    url: "https://example.com",
    npm: "@ai-sdk/openai",
  },
  name: "Test Model",
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: true,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: false,
  },
  cost: {
    input: 0,
    output: 0,
    cache: {
      read: 0,
      write: 0,
    },
  },
  limit: {
    context: 0,
    input: 0,
    output: 0,
  },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-01-01",
}

function userInfo(id: string): MessageV2.User {
  return {
    id,
    sessionID,
    role: "user",
    time: { created: 0 },
    agent: "user",
    model: { providerID, modelID: ModelID.make("test") },
    tools: {},
    mode: "",
  } as unknown as MessageV2.User
}

function assistantInfo(
  id: string,
  parentID: string,
  error?: MessageV2.Assistant["error"],
  meta?: { providerID: string; modelID: string },
): MessageV2.Assistant {
  const infoModel = meta ?? { providerID: model.providerID, modelID: model.api.id }
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created: 0 },
    error,
    parentID,
    modelID: infoModel.modelID,
    providerID: infoModel.providerID,
    mode: "",
    agent: "agent",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  } as unknown as MessageV2.Assistant
}

function basePart(messageID: string, id: string) {
  return {
    id: PartID.make(id.startsWith("prt") ? id : `prt_${id}`),
    sessionID,
    messageID: MessageID.make(messageID.startsWith("msg") ? messageID : `msg_${messageID}`),
  }
}

describe("session.message-v2.toModelMessage", () => {
  test("filters out messages with no parts", async () => {
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo("m-empty"),
        parts: [],
      },
      {
        info: userInfo("m-user"),
        parts: [
          {
            ...basePart("m-user", "p1"),
            type: "text",
            text: "hello",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ])
  })

  test("filters out messages with only ignored parts", async () => {
    const messageID = "m-user"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(messageID),
        parts: [
          {
            ...basePart(messageID, "p1"),
            type: "text",
            text: "ignored",
            ignored: true,
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([])
  })

  test("filters out user messages with only empty text parts", async () => {
    const messageID = "m-user"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(messageID),
        parts: [
          {
            ...basePart(messageID, "p1"),
            type: "text",
            text: "",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([])
  })

  test("filters empty user text parts while keeping non-empty parts", async () => {
    const messageID = "m-user"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(messageID),
        parts: [
          {
            ...basePart(messageID, "p1"),
            type: "text",
            text: "",
          },
          {
            ...basePart(messageID, "p2"),
            type: "text",
            text: "hello",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    ])
  })

  test("includes synthetic text parts", async () => {
    const messageID = "m-user"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(messageID),
        parts: [
          {
            ...basePart(messageID, "p1"),
            type: "text",
            text: "hello",
            synthetic: true,
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo("m-assistant", messageID),
        parts: [
          {
            ...basePart("m-assistant", "a1"),
            type: "text",
            text: "assistant",
            synthetic: true,
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "assistant" }],
      },
    ])
  })

  test("converts user text/file parts and injects compaction/subtask prompts", async () => {
    const messageID = "m-user"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(messageID),
        parts: [
          {
            ...basePart(messageID, "p1"),
            type: "text",
            text: "hello",
          },
          {
            ...basePart(messageID, "p2"),
            type: "text",
            text: "ignored",
            ignored: true,
          },
          {
            ...basePart(messageID, "p3"),
            type: "file",
            mime: "image/png",
            filename: "img.png",
            url: "https://example.com/img.png",
          },
          {
            ...basePart(messageID, "p4"),
            type: "file",
            mime: "text/plain",
            filename: "note.txt",
            url: "https://example.com/note.txt",
          },
          {
            ...basePart(messageID, "p5"),
            type: "file",
            mime: "application/x-directory",
            filename: "dir",
            url: "https://example.com/dir",
          },
          {
            ...basePart(messageID, "p6"),
            type: "compaction",
            auto: true,
          },
          {
            ...basePart(messageID, "p7"),
            type: "subtask",
            prompt: "prompt",
            description: "desc",
            agent: "agent",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "hello" },
          {
            type: "file",
            mediaType: "image/png",
            filename: "img.png",
            data: "https://example.com/img.png",
          },
          { type: "text", text: "What did we do so far?" },
          { type: "text", text: "The following tool was executed by the user" },
        ],
      },
    ])
  })

  test("downgrades historical PDF user parts when the current adapter cannot accept PDFs", async () => {
    const messageID = "m-user-pdf-unsupported"
    const input: MessageV2.WithParts[] = [{
      info: userInfo(messageID),
      parts: [{
        ...basePart(messageID, "pdf-unsupported"),
        type: "file",
        mime: "application/pdf",
        filename: "legacy.pdf",
        url: "data:application/pdf;base64,JVBERi0xLjQK",
      }] as MessageV2.Part[],
    }]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([{ role: "user", content: [{ type: "text", text: "[Attached application/pdf: legacy.pdf]" }] }])
  })

  test("converts assistant tool completion into tool-call + tool-result messages with attachments", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "text",
            text: "done",
            metadata: { openai: { assistant: "meta" } },
          },
          {
            ...basePart(assistantID, "a2"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: { cmd: "ls" },
              output: "ok",
              title: "Bash",
              metadata: {},
              time: { start: 0, end: 1 },
              attachments: [
                {
                  ...basePart(assistantID, "file-1"),
                  type: "file",
                  mime: "image/png",
                  filename: "attachment.png",
                  url: "data:image/png;base64,Zm9v",
                },
              ],
            },
            metadata: { openai: { tool: "meta" } },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "done", providerOptions: { openai: { assistant: "meta" } } },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
            providerOptions: { openai: { tool: "meta" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: {
              type: "content",
              value: [
                { type: "text", text: "ok" },
                { type: "media", mediaType: "image/png", data: "Zm9v" },
              ],
            },
            providerOptions: { openai: { tool: "meta" } },
          },
        ],
      },
    ])
  })

  test("preserves jpeg tool-result media for anthropic models", async () => {
    const anthropicModel: Provider.Model = {
      ...model,
      id: ModelID.make("anthropic/claude-opus-4-7"),
      providerID: ProviderID.make("anthropic"),
      api: {
        id: "claude-opus-4-7-20250805",
        url: "https://api.anthropic.com",
        npm: "@ai-sdk/anthropic",
      },
      capabilities: {
        ...model.capabilities,
        attachment: true,
        input: {
          ...model.capabilities.input,
          image: true,
          pdf: true,
        },
      },
    }
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString(
      "base64",
    )
    const userID = "m-user-anthropic"
    const assistantID = "m-assistant-anthropic"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1-anthropic"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1-anthropic"),
            type: "tool",
            callID: "call-anthropic-1",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/rails-demo.png" },
              output: "Image read successfully",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
              attachments: [
                {
                  ...basePart(assistantID, "file-anthropic-1"),
                  type: "file",
                  mime: "image/jpeg",
                  filename: "rails-demo.png",
                  url: `data:image/jpeg;base64,${jpeg}`,
                },
              ],
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    const result = ProviderTransform.message(await MessageV2.toModelMessages(input, anthropicModel), anthropicModel, {})
    expect(result).toHaveLength(3)
    expect(result[2].role).toBe("tool")
    expect(result[2].content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "call-anthropic-1",
      toolName: "read",
      output: {
        type: "content",
        value: [
          { type: "text", text: "Image read successfully" },
          { type: "media", mediaType: "image/jpeg", data: jpeg },
        ],
      },
    })
  })

  test("hydrates artifact references only at the provider boundary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "message-artifact-"))
    const previous = process.env.OPENCODE_ARTIFACT_ROOT
    process.env.OPENCODE_ARTIFACT_ROOT = root
    try {
      const bytes = Buffer.from("image-bytes")
      const artifact = await ArtifactStore.put(bytes, { mime: "image/png", filename: "inside.png" })
      const userID = "m-user-artifact"
      const input: MessageV2.WithParts[] = [{
        info: userInfo(userID),
        parts: [{
          ...basePart(userID, "file-artifact"), type: "file", mime: "image/png", filename: "inside.png", url: artifact.url,
        }] as MessageV2.Part[],
      }]
      const result = await MessageV2.toModelMessages(input, {
        ...model, capabilities: { ...model.capabilities, attachment: true, input: { ...model.capabilities.input, image: true } },
      })
      expect(result[0]).toMatchObject({
        role: "user",
        content: [{ type: "file", mediaType: "image/png", filename: "inside.png", data: `data:image/png;base64,${bytes.toString("base64")}` }],
      })
    } finally {
      if (previous === undefined) delete process.env.OPENCODE_ARTIFACT_ROOT
      else process.env.OPENCODE_ARTIFACT_ROOT = previous
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("moves bedrock pdf tool-result media into a separate user message", async () => {
    const bedrockModel: Provider.Model = {
      ...model,
      id: ModelID.make("amazon-bedrock/anthropic.claude-sonnet-4-6"),
      providerID: ProviderID.make("amazon-bedrock"),
      api: {
        id: "anthropic.claude-sonnet-4-6",
        url: "https://bedrock-runtime.us-east-1.amazonaws.com",
        npm: "@ai-sdk/amazon-bedrock",
      },
      capabilities: {
        ...model.capabilities,
        attachment: true,
        input: {
          ...model.capabilities.input,
          image: true,
          pdf: true,
        },
      },
    }
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64")
    const userID = "m-user-bedrock-pdf"
    const assistantID = "m-assistant-bedrock-pdf"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1-bedrock-pdf"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1-bedrock-pdf"),
            type: "tool",
            callID: "call-bedrock-pdf-1",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/example.pdf" },
              output: "PDF read successfully",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
              attachments: [
                {
                  ...basePart(assistantID, "file-bedrock-pdf-1"),
                  type: "file",
                  mime: "application/pdf",
                  filename: "example.pdf",
                  url: `data:application/pdf;base64,${pdf}`,
                },
              ],
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, bedrockModel)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-bedrock-pdf-1",
            toolName: "read",
            input: { filePath: "/tmp/example.pdf" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-bedrock-pdf-1",
            toolName: "read",
            output: { type: "text", value: "PDF read successfully" },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Attached media from tool result:" },
          {
            type: "file",
            mediaType: "application/pdf",
            filename: "example.pdf",
            data: `data:application/pdf;base64,${pdf}`,
          },
        ],
      },
    ])

    const copilotModel = {
      ...bedrockModel,
      providerID: ProviderID.make("github-copilot"),
      api: { ...bedrockModel.api, npm: "@ai-sdk/github-copilot" },
    }
    const copilotMessages = await MessageV2.toModelMessages(input, copilotModel)
    expect(JSON.stringify(copilotMessages)).not.toContain("application/pdf")
  })

  test("omits provider metadata when assistant model differs", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID, undefined, { providerID: "other", modelID: "other" }),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "text",
            text: "done",
            metadata: { openai: { assistant: "meta" } },
          },
          {
            ...basePart(assistantID, "a2"),
            type: "reasoning",
            text: "thinking",
            metadata: { openai: { reasoning: "meta" } },
            time: { start: 0 },
          },
          {
            ...basePart(assistantID, "a3"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: { cmd: "ls" },
              output: "ok",
              title: "Bash",
              metadata: {},
              time: { start: 0, end: 1 },
            },
            metadata: { openai: { tool: "meta" } },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "done" },
          { type: "text", text: "thinking" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: { type: "text", value: "ok" },
          },
        ],
      },
    ])
  })

  test("replaces compacted tool output with placeholder", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: { cmd: "ls" },
              output: "this should be cleared",
              title: "Bash",
              metadata: {},
              time: { start: 0, end: 1, compacted: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: { type: "text", value: "[Old tool result content cleared]" },
          },
        ],
      },
    ])
  })

  test("truncates tool output when requested", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: { cmd: "ls" },
              output: "abcdefghij",
              title: "Shell",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model, { toolOutputMaxChars: 4 })).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: {
              type: "text",
              value: "abcd\n[Tool output truncated for compaction: omitted 6 chars]",
            },
          },
        ],
      },
    ])
  })

  test("converts assistant tool error into error-text tool result", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "error",
              input: { cmd: "ls" },
              error: "nope",
              time: { start: 0, end: 1 },
              metadata: {},
            },
            metadata: { openai: { tool: "meta" } },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
            providerOptions: { openai: { tool: "meta" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: { type: "error-text", value: "nope" },
            providerOptions: { openai: { tool: "meta" } },
          },
        ],
      },
    ])
  })

  test("forwards partial bash output for aborted tool calls", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"
    const output = [
      "31403",
      "12179",
      "4575",
      "",
      "<shell_metadata>",
      "User aborted the command",
      "</shell_metadata>",
    ].join("\n")

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "error",
              input: { command: "for i in {1..20}; do print -- $RANDOM; sleep 1; done" },
              error: "Tool execution aborted",
              metadata: { interrupted: true, output },
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { command: "for i in {1..20}; do print -- $RANDOM; sleep 1; done" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: { type: "text", value: output },
          },
        ],
      },
    ])
  })

  test("filters assistant messages with non-abort errors", async () => {
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(
          assistantID,
          "m-parent",
          new MessageV2.APIError({ message: "boom", isRetryable: true }).toObject() as MessageV2.APIError,
        ),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "text",
            text: "should not render",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([])
  })

  test("includes aborted assistant messages only when they have non-step-start/reasoning content", async () => {
    const assistantID1 = "m-assistant-1"
    const assistantID2 = "m-assistant-2"

    const aborted = new MessageV2.AbortedError({ message: "aborted" }).toObject() as MessageV2.Assistant["error"]

    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID1, "m-parent", aborted),
        parts: [
          {
            ...basePart(assistantID1, "a1"),
            type: "reasoning",
            text: "thinking",
            time: { start: 0 },
          },
          {
            ...basePart(assistantID1, "a2"),
            type: "text",
            text: "partial answer",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID2, "m-parent", aborted),
        parts: [
          {
            ...basePart(assistantID2, "b1"),
            type: "step-start",
          },
          {
            ...basePart(assistantID2, "b2"),
            type: "reasoning",
            text: "thinking",
            time: { start: 0 },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "thinking", providerOptions: undefined },
          { type: "text", text: "partial answer" },
        ],
      },
    ])
  })

  test("preserves OpenRouter reasoning details through provider transform", async () => {
    const assistantID = "m-assistant"
    const openrouterModel: Provider.Model = {
      ...model,
      id: ModelID.make("deepseek/deepseek-v4-pro"),
      providerID: ProviderID.make("openrouter"),
      api: {
        id: "deepseek/deepseek-v4-pro",
        url: "https://openrouter.ai/api/v1",
        npm: "@openrouter/ai-sdk-provider",
      },
      capabilities: {
        ...model.capabilities,
        reasoning: true,
        interleaved: { field: "reasoning_details" },
      },
    }
    const reasoningDetails = [
      {
        type: "reasoning.text",
        text: "thinking",
        format: "unknown",
        index: 0,
      },
    ]
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent", undefined, {
          providerID: openrouterModel.providerID,
          modelID: openrouterModel.id,
        }),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "reasoning",
            text: "thinking",
            time: { start: 0 },
            metadata: {
              openrouter: {
                reasoning_details: reasoningDetails,
              },
            },
          },
          {
            ...basePart(assistantID, "a2"),
            type: "text",
            text: "answer",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(
      ProviderTransform.message(await MessageV2.toModelMessages(input, openrouterModel), openrouterModel, {}),
    ).toStrictEqual([
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "thinking",
            providerOptions: {
              openrouter: {
                reasoning_details: reasoningDetails,
              },
            },
          },
          { type: "text", text: "answer" },
        ],
      },
    ])
  })

  test("splits assistant messages on step-start boundaries", async () => {
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          {
            ...basePart(assistantID, "p1"),
            type: "text",
            text: "first",
          },
          {
            ...basePart(assistantID, "p2"),
            type: "step-start",
          },
          {
            ...basePart(assistantID, "p3"),
            type: "text",
            text: "second",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "first" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "second" }],
      },
    ])
  })

  test("drops messages that only contain step-start parts", async () => {
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          {
            ...basePart(assistantID, "p1"),
            type: "step-start",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([])
  })

  test("converts pending/running tool calls to error results to prevent dangling tool_use", async () => {
    const userID = "m-user"
    const assistantID = "m-assistant"

    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID),
        parts: [
          {
            ...basePart(userID, "u1"),
            type: "text",
            text: "run tool",
          },
        ] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, "a1"),
            type: "tool",
            callID: "call-pending",
            tool: "bash",
            state: {
              status: "pending",
              input: { cmd: "ls" },
              raw: "",
            },
          },
          {
            ...basePart(assistantID, "a2"),
            type: "tool",
            callID: "call-running",
            tool: "read",
            state: {
              status: "running",
              input: { path: "/tmp" },
              time: { start: 0 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, model)

    expect(result).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "run tool" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-pending",
            toolName: "bash",
            input: { cmd: "ls" },
            providerExecuted: undefined,
          },
          {
            type: "tool-call",
            toolCallId: "call-running",
            toolName: "read",
            input: { path: "/tmp" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-pending",
            toolName: "bash",
            output: { type: "error-text", value: "[Tool execution was interrupted]" },
          },
          {
            type: "tool-result",
            toolCallId: "call-running",
            toolName: "read",
            output: { type: "error-text", value: "[Tool execution was interrupted]" },
          },
        ],
      },
    ])
  })

  test("substitutes space for empty text between signed reasoning blocks", async () => {
    // Reproduces the bug pattern: [reasoning(sig), text(""), reasoning(sig), text(full)]
    const assistantID = "m-assistant"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          { ...basePart(assistantID, "p1"), type: "step-start" },
          {
            ...basePart(assistantID, "p2"),
            type: "reasoning",
            text: "thinking-one",
            metadata: { anthropic: { signature: "sig1" } },
          },
          { ...basePart(assistantID, "p3"), type: "text", text: "" },
          { ...basePart(assistantID, "p4"), type: "step-start" },
          {
            ...basePart(assistantID, "p5"),
            type: "reasoning",
            text: "thinking-two",
            metadata: { anthropic: { signature: "sig2" } },
          },
          { ...basePart(assistantID, "p6"), type: "text", text: "the answer" },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, model)

    // step-start splits into two assistant messages; SDK's groupIntoBlocks merges them later
    expect(result).toHaveLength(2)
    expect((result[0].content as any[]).find((p) => p.type === "text").text).toBe(" ")
    expect((result[1].content as any[]).find((p) => p.type === "text").text).toBe("the answer")
  })

  test("leaves empty text alone when reasoning signature is under 'bedrock' namespace", async () => {
    // Bedrock signed reasoning is preserved as reasoning metadata, but unlike the
    // direct Anthropic path we do not preserve empty text separators for Bedrock.
    const assistantID = "m-assistant-bedrock"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          {
            ...basePart(assistantID, "p1"),
            type: "reasoning",
            text: "thinking-bedrock",
            metadata: { bedrock: { signature: "bedrock-sig" } },
          },
          { ...basePart(assistantID, "p2"), type: "text", text: "" },
          { ...basePart(assistantID, "p3"), type: "text", text: "answer" },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, model)

    expect(result).toHaveLength(1)
    const texts = (result[0].content as any[]).filter((p) => p.type === "text")
    expect(texts.map((t) => t.text)).toStrictEqual(["", "answer"])
  })

  test("leaves empty text alone when reasoning has no Anthropic signature", async () => {
    // Non-Anthropic providers' reasoning doesn't position-validate, so empty text
    // should be filtered normally rather than substituted.
    const assistantID = "m-assistant-unsigned"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          { ...basePart(assistantID, "p1"), type: "reasoning", text: "thinking" },
          { ...basePart(assistantID, "p2"), type: "text", text: "" },
          { ...basePart(assistantID, "p3"), type: "text", text: "answer" },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, model)

    expect(result).toHaveLength(1)
    const texts = (result[0].content as any[]).filter((p) => p.type === "text")
    expect(texts.map((t) => t.text)).toStrictEqual(["", "answer"])
  })

  test("leaves empty text alone in assistant messages without reasoning", async () => {
    const assistantID = "m-assistant-no-reasoning"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          { ...basePart(assistantID, "p1"), type: "text", text: "" },
          { ...basePart(assistantID, "p2"), type: "text", text: "hello" },
        ] as MessageV2.Part[],
      },
    ]

    const result = await MessageV2.toModelMessages(input, model)

    expect(result).toHaveLength(1)
    const texts = (result[0].content as any[]).filter((p) => p.type === "text")
    expect(texts.map((t) => t.text)).toStrictEqual(["", "hello"])
  })

  // The summary boundary only advances in blocks of SUMMARY_BOUNDARY_STEP tool
  // turns, so a conversation has to carry enough turns before anything is
  // summarized at all. These builders keep that arithmetic in one place.
  const SUMMARIZED_TURNS = 20
  const TAIL_TURNS = 2

  const toolTurn = (
    key: string,
    tool: string,
    input: Record<string, any>,
    output: string,
    metadata: Record<string, any> = {},
  ): MessageV2.WithParts[] => {
    const userID = `m-user-${key}`
    const assistantID = `m-assistant-${key}`
    return [
      {
        info: userInfo(userID),
        parts: [{ ...basePart(userID, `u-${key}`), type: "text", text: `turn ${key}` }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID, userID),
        parts: [
          {
            ...basePart(assistantID, `a-${key}`),
            type: "tool",
            callID: `call-${key}`,
            tool,
            state: {
              status: "completed",
              input,
              output,
              title: tool,
              metadata,
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]
  }

  const padTurns = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) =>
      toolTurn(`${prefix}-pad-${index}`, "read", { filePath: `/tmp/${prefix}-pad-${index}.txt` }, `pad ${index}`),
    ).flat()

  const outputsByCall = (messages: Awaited<ReturnType<typeof MessageV2.toModelMessages>>) =>
    new Map(
      messages
        .filter((msg) => msg.role === "tool")
        .flatMap((msg) => (Array.isArray(msg.content) ? msg.content : []))
        .map((part: any) => [part.toolCallId as string, part.output.value as string]),
    )

  const inputsByCall = (messages: Awaited<ReturnType<typeof MessageV2.toModelMessages>>) =>
    new Map(
      messages
        .filter((msg) => msg.role === "assistant")
        .flatMap((msg) => (Array.isArray(msg.content) ? msg.content : []))
        .filter((part: any) => part.type === "tool-call")
        .map((part: any) => [part.toolCallId as string, part.input]),
    )

  test("replays the latest complete TODO state and supersedes only old validated updates", async () => {
    const old = [{ content: "old todo payload", status: "pending", priority: "high" }]
    const current = [{ content: "Preserve command bun test --timeout 30000", status: "in_progress", priority: "high" }]
    const input = [
      ...toolTurn("todo-old", "todowrite", { todos: old }, "old verbose output", { todos: old }),
      ...padTurns("todo-fill", SUMMARIZED_TURNS - 1),
      ...toolTurn("todo-new", "todowrite", { updates: [{ id: "task-1", status: "in_progress" }] }, "1 active", { todos: current }),
      ...padTurns("todo-tail", TAIL_TURNS),
    ]
    const messages = await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary", replayToolInputs: "summary", toolOutputMaxChars: 5 })
    expect(outputsByCall(messages).get("call-todo-old")).toContain("superseded")
    expect(JSON.stringify(inputsByCall(messages).get("call-todo-old"))).not.toContain("old todo payload")
    expect(outputsByCall(messages).get("call-todo-new")).toContain('"content":"Preserve command bun test --timeout 30000"')
    expect(outputsByCall(messages).get("call-todo-new")).toContain('"id":"t0"')
    expect(outputsByCall(messages).get("call-todo-new")).toContain('"revision":')
    expect(inputsByCall(messages).get("call-todo-new")).toEqual({ updates: [{ id: "task-1", status: "in_progress" }] })
    const full = await MessageV2.toModelMessages(input, model, { replayToolOutputs: "full", replayToolInputs: "full" })
    expect(outputsByCall(full).get("call-todo-old")).toBe("old verbose output")
    expect(inputsByCall(full).get("call-todo-old")).toEqual({ todos: old })
    const off = await MessageV2.toModelMessages(input, model, { replayToolOutputs: "off" })
    expect(outputsByCall(off).get("call-todo-new")).not.toContain("[TODO state]")
  })

  test("orders parallel TODO snapshots by locked sequence rather than part order", async () => {
    const make = (sequence: number, scope = "registry") => ({ todos: [{ content: `snapshot-${sequence}`, status: "pending", priority: "high" }], todoOrder: { scope, sequence } })
    const write = toolTurn("todo-write", "todowrite", {}, "newer write", make(2))
    const read = toolTurn("todo-read", "todowrite", { action: "read" }, "older read", make(1))
    write[1].parts.push(...read[1].parts)
    const input = [...write, ...padTurns("todo-order-padding", SUMMARIZED_TURNS + TAIL_TURNS)]
    const outputs = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))
    expect(outputs.get("call-todo-write")).toContain("snapshot-2")
    expect(outputs.get("call-todo-write")).toContain("sequence=2")
    expect(outputs.get("call-todo-read")).toContain("superseded")
    const crossScope = [...input, ...toolTurn("todo-other-registry", "todowrite", {}, "other registry", make(1, "other"))]
    const retained = outputsByCall(await MessageV2.toModelMessages(crossScope, model, { replayToolOutputs: "summary" }))
    expect(retained.get("call-todo-write")).toContain("snapshot-2")
  })

  test("keeps recent TODO replay byte-stable when another update arrives", async () => {
    const todos = [{ content: "first", status: "pending", priority: "medium" }]
    const input = toolTurn("todo-stable", "todowrite", { todos }, "saved", { todos })
    const before = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))
    const after = outputsByCall(await MessageV2.toModelMessages([
      ...input,
      ...toolTurn("todo-stable-next", "todowrite", { todos: [] }, "saved empty", { todos: [] }),
    ], model, { replayToolOutputs: "summary" }))
    expect(after.get("call-todo-stable")).toBe(before.get("call-todo-stable"))
    expect(after.get("call-todo-stable-next")).toContain('"todos":[]')
    const compacted = input.flatMap((msg) => msg.parts).find((part) => part.type === "tool")
    if (compacted?.type !== "tool" || compacted.state.status !== "completed") throw new Error("Missing test tool")
    compacted.state.time.compacted = 2
    const cleared = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))
    expect(cleared.get("call-todo-stable")).not.toContain("[TODO state]")
  })

  test("does not supersede legacy TODO inputs without a later valid snapshot", async () => {
    const todos = [{ content: "still necessary", status: "pending", priority: "medium" }]
    const input = [
      ...toolTurn("todo-only", "todowrite", { todos }, "saved", { todos }),
      ...padTurns("todo-invalid-fill", SUMMARIZED_TURNS - 1),
      ...toolTurn("todo-invalid", "todowrite", { updates: [] }, "invalid metadata", { todos: [{ content: 42 }] }),
      ...padTurns("todo-invalid-tail", TAIL_TURNS),
    ]
    const messages = await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary", replayToolInputs: "summary" })
    expect(inputsByCall(messages).get("call-todo-only")).toEqual({ todos })
    expect(outputsByCall(messages).get("call-todo-only")).toContain('"content":"still necessary"')
  })

  test("summarizes a superseded tool output while keeping the most recent turns full in summary mode", async () => {
    const input: MessageV2.WithParts[] = [
      // Superseded below: the same file is read again in the full tail.
      ...toolTurn("sup-old", "read", { filePath: "/tmp/x.txt", offset: 10, limit: 2 }, "alpha\nbeta\ngamma"),
      ...padTurns("sup", SUMMARIZED_TURNS - 1),
      ...toolTurn("sup-new", "read", { filePath: "/tmp/x.txt" }, "newest bytes"),
      ...toolTurn("sup-tail", "read", { filePath: "/tmp/tail.txt" }, "tail bytes"),
    ]

    const outputs = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))

    expect(outputs.get("call-sup-old")).toBe(
      "[Historical tool result summary]\ntool: read\nreference: /tmp/x.txt\nwindow: offset=10 limit=2\nmetrics: chars=16 lines=3 bytes=16 attachments=0",
    )
    // The two most recent tool turns always replay in full.
    expect(outputs.get("call-sup-new")).toBe("newest bytes")
    expect(outputs.get("call-sup-tail")).toBe("tail bytes")
    // A turn old enough to fall past the pin budget is summarized too.
    expect(outputs.get("call-sup-pad-0")).toContain("[Historical tool result summary]")
  })

  test("retains compact terminal evidence in historical summary but respects explicit off", async () => {
    const summary = "[Terminal result; exit=1]\nerror: early failure\nFull output saved to: /logs/raw"
    const input = [
      ...toolTurn("terminal-old", "bash", { command: "bun test" }, "stored excerpt", { terminalOutput: { version: 1, summary } }),
      ...padTurns("terminal", SUMMARIZED_TURNS - 1),
      ...padTurns("terminal-tail", TAIL_TURNS),
    ]
    expect(outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" })).get("call-terminal-old")).toBe(summary)
    expect(outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "off" })).get("call-terminal-old")).not.toContain("early failure")
    expect(outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "full" })).get("call-terminal-old")).toBe("stored excerpt")
  })

  test("renders every message identically until the boundary jumps, so a cached prefix survives", async () => {
    // A prompt cache matches a prefix byte for byte: re-rendering an already-sent
    // message invalidates it from that point on. Adding a turn must therefore not
    // change how any earlier turn renders, except on the block boundary itself.
    const conversation = (turns: number) => [
      ...toolTurn("stable-first", "read", { filePath: "/tmp/first.txt" }, "first bytes"),
      ...padTurns("stable", turns - 1),
    ]
    const render = async (turns: number) =>
      outputsByCall(await MessageV2.toModelMessages(conversation(turns), model, { replayToolOutputs: "summary" }))

    const before = await render(SUMMARIZED_TURNS + TAIL_TURNS)
    const after = await render(SUMMARIZED_TURNS + TAIL_TURNS + 1)

    expect(before.get("call-stable-first")).toContain("[Historical tool result summary]")
    for (const [callID, output] of before) {
      if (callID === "call-stable-pad-19" || callID === "call-stable-pad-18") continue
      expect(after.get(callID)).toBe(output)
    }
  })

  test("summarizes nothing at all before the first boundary jump", async () => {
    const input = [
      ...toolTurn("short-first", "read", { filePath: "/tmp/short.txt" }, "short bytes"),
      ...padTurns("short", SUMMARIZED_TURNS),
    ]

    const outputs = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))

    expect(outputs.get("call-short-first")).toBe("short bytes")
    for (const output of outputs.values()) expect(output).not.toContain("[Historical tool result summary]")
  })

  test("omits raw historical tool outputs while preserving tool-result pairing in off mode", async () => {
    const input = [
      ...toolTurn("off-first", "bash", { cmd: "ls" }, "file-a\nfile-b"),
      ...padTurns("off", SUMMARIZED_TURNS - 1),
      ...toolTurn("off-recent", "bash", { cmd: "pwd" }, "/tmp"),
      ...toolTurn("off-tail", "bash", { cmd: "whoami" }, "root"),
    ]

    const messages = await MessageV2.toModelMessages(input, model, { replayToolOutputs: "off" })
    const outputs = outputsByCall(messages)

    expect(outputs.get("call-off-first")).toBe(
      "[Historical tool result omitted]\ntool: bash\nreference: call-off-first",
    )
    // Off mode drops the bytes outright — no reference is kept in full.
    expect(outputs.get("call-off-pad-0")).toContain("[Historical tool result omitted]")
    expect(outputs.get("call-off-recent")).toBe("/tmp")
    expect(outputs.get("call-off-tail")).toBe("root")
    // Every call still has exactly one paired result.
    expect(outputs.size).toBe(inputsByCall(messages).size)
  })

  test("keeps the newest output of each referenced file in full past the summary boundary", async () => {
    const input = [
      ...padTurns("pin", SUMMARIZED_TURNS - 3),
      ...toolTurn("pin-a-old", "read", { filePath: "/tmp/a.ts" }, "A older bytes"),
      ...toolTurn("pin-a-new", "read", { filePath: "/tmp/a.ts" }, "A newest bytes"),
      ...toolTurn("pin-stub", "read", { filePath: "/tmp/stub.ts" }, "<unchanged>stub</unchanged>", { unchanged: true }),
      ...toolTurn("pin-recent", "read", { filePath: "/tmp/recent.ts" }, "recent bytes"),
      ...toolTurn("pin-tail", "read", { filePath: "/tmp/tail.ts" }, "tail bytes"),
    ]

    const outputs = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))

    // Newest copy of a file survives past the boundary: it is the working set.
    expect(outputs.get("call-pin-a-new")).toBe("A newest bytes")
    // Its superseded copy is exactly the waste this mode targets.
    expect(outputs.get("call-pin-a-old")).toContain("[Historical tool result summary]")
    // A read-ledger stub carries no bytes, so pinning it would strand the model.
    expect(outputs.get("call-pin-stub")).toContain("[Historical tool result summary]")
    // The recent turns replay in full on their own.
    expect(outputs.get("call-pin-recent")).toBe("recent bytes")
    expect(outputs.get("call-pin-tail")).toBe("tail bytes")
    // The pin budget is bounded: the oldest references still fall out.
    expect(outputs.get("call-pin-pad-0")).toContain("[Historical tool result summary]")
  })

  test("does not pin oversized read outputs past the summary boundary", async () => {
    const huge = "x".repeat(80_000)
    const input = [
      ...toolTurn("huge-pin-read", "read", { filePath: "/tmp/huge.ts" }, huge),
      ...padTurns("huge-pin", SUMMARIZED_TURNS - 1),
      ...toolTurn("huge-pin-recent", "read", { filePath: "/tmp/recent.ts" }, "recent bytes"),
      ...toolTurn("huge-pin-tail", "read", { filePath: "/tmp/tail.ts" }, "tail bytes"),
    ]

    const outputs = outputsByCall(await MessageV2.toModelMessages(input, model, { replayToolOutputs: "summary" }))

    expect(outputs.get("call-huge-pin-read")).toContain("[Historical tool result summary]")
    expect(outputs.get("call-huge-pin-read")).not.toContain(huge.slice(0, 1_000))
  })

  test("replays mutating tool inputs verbatim even when input replay is summarized", async () => {
    const patchText = `*** Begin Patch\n*** Update File: /tmp/example.ts\n@@\n-${"a".repeat(200)}\n+${"b".repeat(200)}\n*** End Patch\n`
    const todos = Array.from({ length: 8 }, (_, index) => ({ content: `todo ${index}`, status: "pending" }))
    const input = [
      ...toolTurn("verb-patch", "apply_patch", { patchText }, "patched"),
      ...toolTurn("verb-todo", "todowrite", { todos }, "written"),
      ...toolTurn("verb-read", "read", { filePath: "/tmp/example.ts", pattern: "z".repeat(200) }, "read"),
      ...padTurns("verb", SUMMARIZED_TURNS - 3),
      ...toolTurn("verb-recent", "read", { filePath: "/tmp/recent.ts" }, "recent"),
      ...toolTurn("verb-tail", "read", { filePath: "/tmp/tail.ts" }, "tail"),
    ]

    const messages = await MessageV2.toModelMessages(input, model, { replayToolInputs: "summary" })
    const inputs = inputsByCall(messages)

    // A payload the model would reproduce verbatim is never elided.
    expect(inputs.get("call-verb-patch")).toStrictEqual({ patchText })
    expect(inputs.get("call-verb-todo")).toStrictEqual({ todos })
    // A read-only tool past the boundary drops its input entirely: any content
    // left in context is reproducible, and the model has copied such markers
    // back as a real argument before (object as grep pattern → TUI crash).
    expect(inputs.get("call-verb-read")).toStrictEqual({ omitted: true, tool_input: "historical" })
    expect(JSON.stringify(messages)).not.toContain("__elided")
  })

  test("keeps tool inputs intact while the conversation is short of the summary boundary", async () => {
    const userID1 = "m-user-tool-input-summary-1"
    const assistantID1 = "m-assistant-tool-input-summary-1"
    const userID2 = "m-user-tool-input-summary-2"
    const assistantID2 = "m-assistant-tool-input-summary-2"
    const userID3 = "m-user-tool-input-summary-3"
    const assistantID3 = "m-assistant-tool-input-summary-3"
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID1),
        parts: [{ ...basePart(userID1, "u1-tool-input-summary-1"), type: "text", text: "older" }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID1, userID1),
        parts: [
          {
            ...basePart(assistantID1, "a1-tool-input-summary-1"),
            type: "tool",
            callID: "call-tool-input-summary-1",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/example-1.txt", offset: 10, limit: 2, extra: "hidden" },
              output: "older file content",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
      {
        info: userInfo(userID2),
        parts: [{ ...basePart(userID2, "u1-tool-input-summary-2"), type: "text", text: "recent" }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID2, userID2),
        parts: [
          {
            ...basePart(assistantID2, "a1-tool-input-summary-2"),
            type: "tool",
            callID: "call-tool-input-summary-2",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/example-2.txt", offset: 0, limit: 1, extra: "kept-recent" },
              output: "recent file content",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
      {
        info: userInfo(userID3),
        parts: [{ ...basePart(userID3, "u1-tool-input-summary-3"), type: "text", text: "latest" }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID3, userID3),
        parts: [
          {
            ...basePart(assistantID3, "a1-tool-input-summary-3"),
            type: "tool",
            callID: "call-tool-input-summary-3",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/example-3.txt", offset: 3, limit: 4, extra: "kept-latest" },
              output: "latest file content",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model, { replayToolInputs: "summary" })).toStrictEqual([
      {
        role: "user",
        content: [{ type: "text", text: "older" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-tool-input-summary-1",
            toolName: "read",
            input: { extra: "hidden", filePath: "/tmp/example-1.txt", limit: 2, offset: 10 },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-tool-input-summary-1",
            toolName: "read",
            output: { type: "text", value: "older file content" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "recent" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-tool-input-summary-2",
            toolName: "read",
            input: { filePath: "/tmp/example-2.txt", offset: 0, limit: 1, extra: "kept-recent" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-tool-input-summary-2",
            toolName: "read",
            output: { type: "text", value: "recent file content" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "latest" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-tool-input-summary-3",
            toolName: "read",
            input: { filePath: "/tmp/example-3.txt", offset: 3, limit: 4, extra: "kept-latest" },
            providerExecuted: undefined,
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-tool-input-summary-3",
            toolName: "read",
            output: { type: "text", value: "latest file content" },
          },
        ],
      },
    ])
  })

  test("does not mutate stored tool inputs while replaying summarized historical inputs", async () => {
    const userID1 = "m-user-tool-input-mutation-1"
    const assistantID1 = "m-assistant-tool-input-mutation-1"
    const userID2 = "m-user-tool-input-mutation-2"
    const assistantID2 = "m-assistant-tool-input-mutation-2"
    const originalInput = {
      filePath: "/tmp/example-1.txt",
      nested: {
        long: "x".repeat(120),
      },
      items: [1, 2, 3, 4, 5, 6],
    }
    const input: MessageV2.WithParts[] = [
      {
        info: userInfo(userID1),
        parts: [{ ...basePart(userID1, "u1-tool-input-mutation-1"), type: "text", text: "older" }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID1, userID1),
        parts: [
          {
            ...basePart(assistantID1, "a1-tool-input-mutation-1"),
            type: "tool",
            callID: "call-tool-input-mutation-1",
            tool: "read",
            state: {
              status: "completed",
              input: originalInput,
              output: "older file content",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
      {
        info: userInfo(userID2),
        parts: [{ ...basePart(userID2, "u1-tool-input-mutation-2"), type: "text", text: "recent" }] as MessageV2.Part[],
      },
      {
        info: assistantInfo(assistantID2, userID2),
        parts: [
          {
            ...basePart(assistantID2, "a1-tool-input-mutation-2"),
            type: "tool",
            callID: "call-tool-input-mutation-2",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: "/tmp/example-2.txt" },
              output: "recent file content",
              title: "Read",
              metadata: {},
              time: { start: 0, end: 1 },
            },
          },
        ] as MessageV2.Part[],
      },
    ]

    const before = structuredClone(originalInput)
    await MessageV2.toModelMessages(input, model, { replayToolInputs: "summary" })
    expect(originalInput).toStrictEqual(before)
  })

  test("drops historical reasoning blocks when rollout disables reasoning replay", async () => {
    const assistantID = "m-assistant-no-replay-reasoning"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          {
            ...basePart(assistantID, "p1-no-replay-reasoning"),
            type: "reasoning",
            text: "internal chain of thought",
            metadata: { openai: { reasoning: "meta" } },
            time: { start: 0 },
          },
          {
            ...basePart(assistantID, "p2-no-replay-reasoning"),
            type: "text",
            text: "final answer",
          },
        ] as MessageV2.Part[],
      },
    ]

    expect(await MessageV2.toModelMessages(input, model, { replayReasoning: "off" })).toStrictEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "final answer" }],
      },
    ])
  })

  test("forces reasoning replay when the provider round-trips reasoning_content", async () => {
    const assistantID = "m-assistant-forced-replay"
    const deepseekModel: Provider.Model = {
      ...model,
      id: ModelID.make("deepseek/deepseek-v4.1-flash"),
      providerID: ProviderID.make("command-code"),
      api: {
        id: "deepseek/deepseek-v4.1-flash",
        url: "https://api.commandcode.ai/provider/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      capabilities: {
        ...model.capabilities,
        reasoning: true,
        interleaved: { field: "reasoning_content" },
      },
    }
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent", undefined, {
          providerID: deepseekModel.providerID,
          modelID: deepseekModel.id,
        }),
        parts: [
          {
            ...basePart(assistantID, "p1-forced-replay"),
            type: "reasoning",
            text: "internal chain of thought",
            time: { start: 0 },
          },
          {
            ...basePart(assistantID, "p2-forced-replay"),
            type: "text",
            text: "final answer",
          },
        ] as MessageV2.Part[],
      },
    ]

    // "off" would drop the field and make DeepSeek reject the tool-bearing
    // request with a 400, so reasoning replay is forced on for this provider.
    expect(await MessageV2.toModelMessages(input, deepseekModel, { replayReasoning: "off" })).toStrictEqual([
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "internal chain of thought", providerOptions: undefined },
          { type: "text", text: "final answer" },
        ],
      },
    ])
  })

  test("drops empty unsigned reasoning parts for providers that round-trip reasoning_content", async () => {
    const assistantID = "m-assistant-empty-reasoning"
    const deepseekModel: Provider.Model = {
      ...model,
      id: ModelID.make("deepseek/deepseek-v4.1-flash"),
      providerID: ProviderID.make("command-code"),
      api: {
        id: "deepseek/deepseek-v4.1-flash",
        url: "https://api.commandcode.ai/provider/v1",
        npm: "@ai-sdk/openai-compatible",
      },
      capabilities: {
        ...model.capabilities,
        reasoning: true,
        interleaved: { field: "reasoning_content" },
      },
    }
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent", undefined, {
          providerID: deepseekModel.providerID,
          modelID: deepseekModel.id,
        }),
        parts: [
          {
            ...basePart(assistantID, "p1-empty-reasoning"),
            type: "step-start",
          },
          {
            ...basePart(assistantID, "p2-empty-reasoning"),
            type: "reasoning",
            text: "",
            time: { start: 0 },
          },
          {
            ...basePart(assistantID, "p3-empty-reasoning"),
            type: "step-start",
          },
          {
            ...basePart(assistantID, "p4-empty-reasoning"),
            type: "reasoning",
            text: "internal chain of thought",
            time: { start: 0 },
          },
        ] as MessageV2.Part[],
      },
    ]

    // A zero-length reasoning part without provider metadata replays as an empty
    // reasoning block; DeepSeek thinking mode with tools then answers 400 because
    // a prior assistant turn carries no `reasoning_content`.
    expect(await MessageV2.toModelMessages(input, deepseekModel, { replayReasoning: "off" })).toStrictEqual([
      {
        role: "assistant",
        content: [{ type: "reasoning", text: "internal chain of thought", providerOptions: undefined }],
      },
    ])
  })

  test("keeps empty reasoning parts that carry provider metadata", async () => {
    const assistantID = "m-assistant-empty-signed-reasoning"
    const input: MessageV2.WithParts[] = [
      {
        info: assistantInfo(assistantID, "m-parent"),
        parts: [
          {
            ...basePart(assistantID, "p1-empty-signed-reasoning"),
            type: "reasoning",
            text: "",
            metadata: { anthropic: { signature: "sig" } },
            time: { start: 0 },
          },
        ] as MessageV2.Part[],
      },
    ]

    // Signature/encrypted-id reasoning must survive replay even when empty.
    expect(await MessageV2.toModelMessages(input, model)).toStrictEqual([
      {
        role: "assistant",
        content: [{ type: "reasoning", text: "", providerOptions: { anthropic: { signature: "sig" } } }],
      },
    ])
  })
})

describe("session.message-v2.fromError", () => {
  test("serializes context_length_exceeded as ContextOverflowError", () => {
    const input = {
      type: "error",
      error: {
        code: "context_length_exceeded",
      },
    }
    const result = MessageV2.fromError(input, { providerID })

    expect(result).toStrictEqual({
      name: "ContextOverflowError",
      data: {
        message: "Input exceeds context window of this model",
        responseBody: JSON.stringify(input),
      },
    })
  })

  test("serializes response error codes", () => {
    const cases = [
      {
        code: "insufficient_quota",
        message: "Quota exceeded. Check your plan and billing details.",
      },
      {
        code: "usage_not_included",
        message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
      },
      {
        code: "invalid_prompt",
        message: "Invalid prompt from test",
      },
    ]

    cases.forEach((item) => {
      const input = {
        type: "error",
        error: {
          code: item.code,
          message: item.code === "invalid_prompt" ? item.message : undefined,
        },
      }
      const result = MessageV2.fromError(input, { providerID })

      expect(result).toStrictEqual({
        name: "APIError",
        data: {
          message: item.message,
          isRetryable: false,
          responseBody: JSON.stringify(input),
        },
      })
    })
  })

  test("serializes OpenAI response server_error stream chunks as retryable APIError", () => {
    const body = {
      type: "error",
      sequence_number: 2,
      error: {
        type: "server_error",
        code: "server_error",
        message:
          "An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists. Please include the request ID req_77eccd008d984bf6bf82d1b2c2b68715 in your message.",
        param: null,
      },
    }
    const result = MessageV2.fromError({ message: JSON.stringify(body) }, { providerID })

    expect(result).toStrictEqual({
      name: "APIError",
      data: {
        message: body.error.message,
        isRetryable: true,
        responseBody: JSON.stringify(body),
      },
    })
  })

  test("detects context overflow from APICallError provider messages", () => {
    const cases = [
      "prompt is too long: 213462 tokens > 200000 maximum",
      "Your input exceeds the context window of this model",
      "The input token count (1196265) exceeds the maximum number of tokens allowed (1048575)",
      "Please reduce the length of the messages or completion",
      "400 status code (no body)",
      "413 status code (no body)",
    ]

    cases.forEach((message) => {
      const error = new APICallError({
        message,
        url: "https://example.com",
        requestBodyValues: {},
        statusCode: 400,
        responseHeaders: { "content-type": "application/json" },
        isRetryable: false,
      })
      const result = MessageV2.fromError(error, { providerID })
      expect(MessageV2.ContextOverflowError.isInstance(result)).toBe(true)
    })
  })

  test("detects context overflow from context_length_exceeded code in response body", () => {
    const error = new APICallError({
      message: "Request failed",
      url: "https://example.com",
      requestBodyValues: {},
      statusCode: 422,
      responseHeaders: { "content-type": "application/json" },
      responseBody: JSON.stringify({
        error: {
          message: "Some message",
          type: "invalid_request_error",
          code: "context_length_exceeded",
        },
      }),
      isRetryable: false,
    })
    const result = MessageV2.fromError(error, { providerID })
    expect(MessageV2.ContextOverflowError.isInstance(result)).toBe(true)
  })

  test("does not classify 429 no body as context overflow", () => {
    const result = MessageV2.fromError(
      new APICallError({
        message: "429 status code (no body)",
        url: "https://example.com",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "content-type": "application/json" },
        isRetryable: false,
      }),
      { providerID },
    )
    expect(MessageV2.ContextOverflowError.isInstance(result)).toBe(false)
    expect(MessageV2.APIError.isInstance(result)).toBe(true)
  })

  test("serializes unknown inputs", () => {
    const result = MessageV2.fromError(123, { providerID })

    expect(result).toStrictEqual({
      name: "UnknownError",
      data: {
        message: "123",
      },
    })
  })

  test("serializes tagged errors with their message", () => {
    const result = MessageV2.fromError(new Question.RejectedError(), { providerID })

    expect(result).toStrictEqual({
      name: "UnknownError",
      data: {
        message: "The user dismissed this question",
      },
    })
  })

  test("classifies ZlibError from fetch as retryable APIError", () => {
    const zlibError = new Error(
      'ZlibError fetching "https://opencode.cloudflare.dev/anthropic/messages". For more information, pass `verbose: true` in the second argument to fetch()',
    )
    ;(zlibError as any).code = "ZlibError"
    ;(zlibError as any).errno = 0
    ;(zlibError as any).path = ""

    const result = MessageV2.fromError(zlibError, { providerID })

    expect(MessageV2.APIError.isInstance(result)).toBe(true)
    expect((result as MessageV2.APIError).data.isRetryable).toBe(true)
    expect((result as MessageV2.APIError).data.message).toInclude("decompression")
  })

  test("classifies ZlibError as AbortedError when abort context is provided", () => {
    const zlibError = new Error(
      'ZlibError fetching "https://opencode.cloudflare.dev/anthropic/messages". For more information, pass `verbose: true` in the second argument to fetch()',
    )
    ;(zlibError as any).code = "ZlibError"
    ;(zlibError as any).errno = 0

    const result = MessageV2.fromError(zlibError, { providerID, aborted: true })

    expect(result.name).toBe("MessageAbortedError")
  })
})

describe("session.message-v2.latest", () => {
  const TAIL_USER = MessageID.make("msg_001")
  const OVERFLOW_ASSISTANT = MessageID.make("msg_002")
  const COMPACTION_USER = MessageID.make("msg_003")
  const SUMMARY_ASSISTANT = MessageID.make("msg_004")
  const CONTINUE_USER = MessageID.make("msg_005")
  const NEW_COMPACTION_USER = MessageID.make("msg_006")

  const tailUser: MessageV2.WithParts = {
    info: userInfo(TAIL_USER),
    parts: [{ ...basePart(TAIL_USER, "p1"), type: "text", text: "original prompt" }] as MessageV2.Part[],
  }

  const overflowAssistant: MessageV2.WithParts = {
    info: {
      ...assistantInfo(OVERFLOW_ASSISTANT, TAIL_USER),
      finish: "tool-calls",
      tokens: { input: 280_000, output: 200, reasoning: 0, cache: { read: 0, write: 0 }, total: 280_200 },
    } as MessageV2.Assistant,
    parts: [],
  }

  const compactionUser: MessageV2.WithParts = {
    info: userInfo(COMPACTION_USER),
    parts: [
      {
        ...basePart(COMPACTION_USER, "p1"),
        type: "compaction",
        auto: true,
        tail_start_id: TAIL_USER,
      },
    ] as MessageV2.Part[],
  }

  const summaryAssistant: MessageV2.WithParts = {
    info: {
      ...assistantInfo(SUMMARY_ASSISTANT, COMPACTION_USER),
      summary: true,
      finish: "stop",
      tokens: { input: 150_000, output: 1_500, reasoning: 0, cache: { read: 0, write: 0 }, total: 151_500 },
    } as MessageV2.Assistant,
    parts: [],
  }

  const continueUser: MessageV2.WithParts = {
    info: userInfo(CONTINUE_USER),
    parts: [
      {
        ...basePart(CONTINUE_USER, "p1"),
        type: "text",
        text: "Continue if you have next steps...",
        synthetic: true,
        metadata: { compaction_continue: true },
      },
    ] as MessageV2.Part[],
  }

  // Regression for double auto-compaction. The reorder in filterCompacted
  // (#27145) returns [compaction-user, summary, ...tail..., continue-user],
  // so picking lastFinished by array position landed on the pre-compaction
  // overflow assistant and bypassed the `summary !== true` overflow guard
  // in SessionPrompt.runLoop, firing a second compaction.create immediately.
  test("finished is the chronologically-latest finished assistant, not the array-latest", () => {
    const filtered = MessageV2.filterCompacted([
      continueUser,
      summaryAssistant,
      compactionUser,
      overflowAssistant,
      tailUser,
    ])

    const state = MessageV2.latest(filtered)

    expect(state.finished?.id).toBe(SUMMARY_ASSISTANT)
    expect(state.finished?.summary).toBe(true)
    expect(state.user?.id).toBe(CONTINUE_USER)
    expect(state.tasks).toEqual([])
  })

  test("a fresh compaction-user newer than the latest summary surfaces in tasks", () => {
    const newCompactionUser: MessageV2.WithParts = {
      info: userInfo(NEW_COMPACTION_USER),
      parts: [
        {
          ...basePart(NEW_COMPACTION_USER, "p1"),
          type: "compaction",
          auto: true,
        },
      ] as MessageV2.Part[],
    }

    const state = MessageV2.latest([
      tailUser,
      overflowAssistant,
      compactionUser,
      summaryAssistant,
      continueUser,
      newCompactionUser,
    ])

    expect(state.finished?.id).toBe(SUMMARY_ASSISTANT)
    expect(state.user?.id).toBe(NEW_COMPACTION_USER)
    expect(state.tasks).toHaveLength(1)
    expect(state.tasks[0]).toMatchObject({ type: "compaction", auto: true })
  })
})
