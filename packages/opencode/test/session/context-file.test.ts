import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import { ContextFile } from "@/session/context-file"

describe("ContextFile.formatContextMarkdown", () => {
  test("assemble le system prompt et les messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Bonjour" },
      { role: "assistant", content: "Salut" },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-123", toolName: "bash", output: { type: "text", value: "ok" } }],
      },
    ]
    const md = ContextFile.formatContextMarkdown({
      sessionID: "ses_test",
      agent: "build",
      model: "opencode-go/deepseek-v4-flash",
      system: ["SYSTEM A", "SYSTEM B"],
      messages,
    })
    expect(md).toContain("# CONTEXTE RÉEL — ses_test")
    expect(md).toContain("Agent : build")
    expect(md).toContain("Modèle : opencode-go/deepseek-v4-flash")
    expect(md).toContain("## SYSTEM PROMPT")
    expect(md).toContain("SYSTEM A")
    expect(md).toContain("SYSTEM B")
    expect(md).toContain("### 0 user")
    expect(md).toContain("[user]\nBonjour")
    expect(md).toContain("[assistant]\nSalut")
    expect(md).toContain("[tool:call-123]")
  })

  test("tronque les contenus au-dessus de MAX_CONTENT_CHARS", () => {
    const long = "a".repeat(ContextFile.MAX_CONTENT_CHARS + 100)
    const md = ContextFile.formatContextMarkdown({
      sessionID: "ses_test",
      agent: "build",
      model: "m",
      system: [long],
      messages: [],
    })
    expect(md).toContain("tronqué")
    expect(md).not.toContain("a".repeat(ContextFile.MAX_CONTENT_CHARS + 50))
  })

  test("formate les contenus multi-parts (tool-call + reasoning)", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "je réfléchis" },
          { type: "tool-call", toolCallId: "c2", toolName: "read", input: { filePath: "x.ts" } },
        ],
      },
    ]
    const md = ContextFile.formatContextMarkdown({
      sessionID: "ses_test",
      agent: "build",
      model: "m",
      system: [],
      messages,
    })
    expect(md).toContain("[reasoning] je réfléchis")
    expect(md).toContain('[tool-call] read(c2): {"filePath":"x.ts"}')
  })
})
