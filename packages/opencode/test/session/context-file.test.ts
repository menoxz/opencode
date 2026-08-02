import { describe, expect, test } from "bun:test"
import { jsonSchema, type ModelMessage } from "ai"
import { ContextFile } from "@/session/context-file"

describe("ContextFile.formatContextMarkdown", () => {
  test("assemble system, messages et tools tels que préparés", () => {
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
      tools: {
        bash: {
          description: "Run a command",
          inputSchema: jsonSchema({ type: "object", properties: {} }),
          execute: async () => ({ output: "" }),
        },
      },
    })
    expect(md).toContain("# session=ses_test agent=build model=opencode-go/deepseek-v4-flash")
    expect(md).toContain("## SYSTEM")
    expect(md).toContain("SYSTEM A\n\nSYSTEM B")
    expect(md).toContain("## MESSAGES")
    expect(md).toContain("### 0 user\n\nBonjour")
    expect(md).toContain("### 1 assistant\n\nSalut")
    expect(md).toContain("### 2 tool")
    expect(md).toContain('"tool-result"')
    expect(md).toContain('"call-123"')
    // Les définitions d'outils sont incluses, sans la fonction execute (non sérialisable).
    expect(md).toContain("## TOOLS")
    expect(md).toContain("### bash")
    expect(md).toContain('"description": "Run a command"')
    expect(md).not.toContain('"execute"')
  })

  test("ne tronque pas les contenus", () => {
    const long = "a".repeat(50_000)
    const md = ContextFile.formatContextMarkdown({
      sessionID: "ses_test",
      agent: "build",
      model: "m",
      system: [long],
      messages: [],
    })
    expect(md).toContain(long)
    expect(md).not.toContain("tronqué")
  })

  test("serialise les contenus multi-parts sans perte (tool-call + reasoning)", () => {
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
    expect(md).toContain("je réfléchis")
    expect(md).toContain('"toolName": "read"')
    expect(md).toContain('"toolCallId": "c2"')
    expect(md).toContain('"filePath": "x.ts"')
  })

  test("omet la section TOOLS quand aucune définition n'est fournie", () => {
    const md = ContextFile.formatContextMarkdown({
      sessionID: "ses_test",
      agent: "build",
      model: "m",
      system: [],
      messages: [{ role: "user", content: "hi" }],
    })
    expect(md).not.toContain("## TOOLS")
  })
})
