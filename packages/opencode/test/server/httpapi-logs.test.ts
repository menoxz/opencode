import { describe, expect, test } from "bun:test"
import { Context } from "effect"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { logsPageHtml } from "../../src/server/shared/logs-page"

const context = Context.empty() as Context.Context<unknown>

function getLogs() {
  return HttpApiApp.webHandler().handler(new Request("http://localhost/logs"), context)
}

describe("standalone Logs page", () => {
  // The page must be served as its own document, not swallowed by the embedded
  // GUI web UI: a regression here would silently downgrade /logs back to the
  // single-page app, which is exactly what the standalone page must avoid.
  test("serves /logs as a standalone HTML document", async () => {
    const response = await getLogs()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")

    const html = await response.text()
    expect(html).toContain("<title>opencodev2 Logs</title>")
    expect(html).not.toContain("assets/index-")
  })

  test("renders the injected context sections and their provenance", async () => {
    const html = logsPageHtml()

    // Reads the same public API as any other client instead of embedding state.
    expect(html).toContain('get("/session")')
    expect(html).toContain("/message")

    // Injected context is surfaced from the persisted carrier parts.
    expect(html).toContain("CONTEXT")
    expect(html).toContain("instructions")
    expect(html).toContain("source(s)")
    expect(html).toContain("section(s)")
    expect(html).toContain("truncated")

    // Section labels come from the carrier metadata, so any injected section
    // (system prompt, env, instructions, skills, agent) renders without the page
    // knowing its name in advance.
    expect(html).toContain("meta.sections")
    expect(html).toContain("s.section")
    expect(html).toContain("s.label")
    expect(html).toContain("s.truncated")
  })

  test("escapes untrusted part content instead of injecting raw HTML", () => {
    const html = logsPageHtml()
    // The renderer must ship an escaping helper: part text, labels and
    // provenance paths are attacker-influenced data reaching innerHTML.
    expect(html).toContain("&amp;")
    expect(html).toContain("&lt;")
    expect(html).toContain("&quot;")
    expect(html).toContain("esc(")
  })
})