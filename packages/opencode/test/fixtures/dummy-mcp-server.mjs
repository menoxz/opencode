// Minimal JSON-RPC MCP stdio server used by integration tests.
// Speaks the MCP protocol over stdio: initialize, tools/list, tools/call, ping.
import readline from "node:readline"
import { appendFileSync } from "node:fs"

const LOG = process.env.MCP_DUMMY_LOG
const trace = (line) => {
  if (LOG) appendFileSync(LOG, line + "\n")
}

trace("STARTED pid=" + process.pid + " cwd=" + process.cwd())

const rl = readline.createInterface({ input: process.stdin })

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n")
}

rl.on("line", (line) => {
  trace("REQ: " + line)
  let req
  try {
    req = JSON.parse(line)
  } catch {
    return
  }
  const id = req.id
  if (req.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "dummy-mcp-server", version: "1.0.0" },
      },
    })
    return
  }
  if (req.method === "notifications/initialized") return
  if (req.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Echoes back the input text",
            inputSchema: { type: "object", properties: { text: { type: "string" } } },
          },
        ],
      },
    })
    return
  }
  if (req.method === "tools/call") {
    const args = req.params?.arguments ?? {}
    send({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: args.text ?? "ok" }] },
    })
    return
  }
  if (req.method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} })
    return
  }
  send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } })
})
