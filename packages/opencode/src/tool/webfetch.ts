import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Parser } from "htmlparser2"
import * as Tool from "./tool"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"
import { isImageAttachment } from "@/util/media"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

/**
 * Known-good selectors for main content extraction.
 * Ordered by specificity — first match uses the match end as cut point,
 * then scans forward for the first matching close tag of the same type
 * that produces a balanced subtree (depth reaches 0).
 */
const CONTENT_SELECTORS: Array<{ open: RegExp; close: (tag: string) => RegExp }> = [
  // By role attribute
  { open: /<main[^>]*role="main"[^>]*>/i, close: (t) => new RegExp(`<\/${t}>`, "i") },
  { open: /<div[^>]*role="main"[^>]*>/i, close: (t) => new RegExp(`<\/${t}>`, "i") },
  // By semantic tag
  { open: /<article[\s>]/i, close: () => /<\/article>/i },
  { open: /<main[\s>]/i, close: () => /<\/main>/i },
  // By common IDs
  { open: /<(div|section|article)[^>]*id="(?:content|main-content|article-body|post-content|entry-content|mw-content-text)"[^>]*>/i, close: (t) => new RegExp(`<\/${t}>`, "i") },
  // By common classes
  { open: /<(div|section|article|main)[^>]*class="[^"]*\b(?:post-?content|article-?body|entry-?content|main-?content|page-?content|content-?body)\b[^"]*"[^>]*>/i, close: (t) => new RegExp(`<\/${t}>`, "i") },
  // Wikipedia-specific
  { open: /<div[^>]*class="mw-parser-output"[^>]*>/i, close: () => /<\/div>/i },
  // Generic content-area fallback
  { open: /<(div|section|article|main)[^>]*class="[^"]*\b(content|article|primary|main|post)\b[^"]*"[^>]*>/i, close: (t) => new RegExp(`<\/${t}>`, "i") },
]

/** Tags whose entire subtree should be stripped from output */
const NOISE_TAGS = new Set([
  "script", "style", "noscript", "iframe", "object", "embed",
  "nav", "footer", "header", "aside",
])

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The URL to fetch content from" }),
  format: Schema.Literals(["text", "markdown", "html"])
    .annotate({
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
      default: "markdown",
    })
    .pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed("markdown" as const))),
  timeout: Schema.optional(Schema.Number).annotate({ description: "Optional timeout in seconds (max 120)" }),
  content_only: Schema.optional(Schema.Boolean).annotate({
    description: "Strip navigation, sidebars, headers, footers and extract only the main content (default: true)",
  }).pipe(Schema.withDecodingDefault(Effect.succeed(true))),
})

export const WebFetchTool = Tool.define(
  "webfetch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            throw new Error("URL must start with http:// or https://")
          }

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
              format: params.format,
              timeout: params.timeout,
            },
          })

          const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)

          // Build Accept header based on requested format with q parameters for fallbacks
          let acceptHeader = "*/*"
          switch (params.format) {
            case "markdown":
              acceptHeader = "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
              break
            case "text":
              acceptHeader = "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
              break
            case "html":
              acceptHeader =
                "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
              break
            default:
              acceptHeader =
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
          }
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: acceptHeader,
            "Accept-Language": "en-US,en;q=0.9",
          }

          const request = HttpClientRequest.get(params.url).pipe(HttpClientRequest.setHeaders(headers))

          // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
          const response = yield* httpOk.execute(request).pipe(
            Effect.catchIf(
              (err) =>
                err.reason._tag === "StatusCodeError" &&
                err.reason.response.status === 403 &&
                err.reason.response.headers["cf-mitigated"] === "challenge",
              () =>
                httpOk.execute(
                  HttpClientRequest.get(params.url).pipe(
                    HttpClientRequest.setHeaders({ ...headers, "User-Agent": "opencode" }),
                  ),
                ),
            ),
            Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }),
          )

          // Check content length
          const contentLength = response.headers["content-length"]
          if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const arrayBuffer = yield* response.arrayBuffer
          if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const contentType = response.headers["content-type"] || ""
          const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""
          const title = `${params.url} (${contentType})`

          if (isImageAttachment(mime)) {
            const base64Content = Buffer.from(arrayBuffer).toString("base64")
            return {
              title,
              output: "Image fetched successfully",
              metadata: {},
              attachments: [
                {
                  type: "file" as const,
                  mime,
                  url: `data:${mime};base64,${base64Content}`,
                },
              ],
            }
          }

          const content = new TextDecoder().decode(arrayBuffer)

          // Decide whether to extract main content (strip navigation/sidebars)
          const htmlForProcessing = params.content_only !== false
            ? extractMainContent(content)
            : content

          // Handle content based on requested format and actual content type
          switch (params.format) {
            case "markdown":
              if (contentType.includes("text/html")) {
                const markdown = convertHTMLToMarkdown(htmlForProcessing, params.content_only !== false)
                const stripped = params.content_only !== false && htmlForProcessing !== content
                  ? " (main content only; navigation/sidebars stripped)"
                  : ""
                return {
                  output: markdown,
                  title: title + stripped,
                  metadata: {},
                }
              }
              return { output: htmlForProcessing, title, metadata: {} }

            case "text":
              if (contentType.includes("text/html")) {
                return { output: extractTextFromHTML(htmlForProcessing), title, metadata: {} }
              }
              return { output: htmlForProcessing, title, metadata: {} }

            case "html":
              return { output: htmlForProcessing, title, metadata: {} }

            default:
              return { output: htmlForProcessing, title, metadata: {} }
          }
        }).pipe(Effect.orDie),
    }
  }),
)

/**
 * Extract the main content from a full HTML page using heuristic pattern matching.
 * Returns the raw HTML of the likely content region, or the full HTML as fallback.
 *
 * Uses a character-level scan between the content container's open and close tag
 * to correctly handle arbitrary nesting depth.
 */
function extractMainContent(html: string): string {
  for (const selector of CONTENT_SELECTORS) {
    const openMatch = selector.open.exec(html)
    if (!openMatch) continue

    const tagName = openMatch[0].match(/<(\w+)/i)?.[1]?.toLowerCase()
    if (!tagName) continue

    const startIdx = openMatch.index
    let depth = 1
    const openStr = `<${tagName}`
    const closeStr = `</${tagName}>`

    // Walk forward from the opening tag, counting depth
    let pos = startIdx + openMatch[0].length
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf(openStr, pos)
      const nextClose = html.indexOf(closeStr, pos)

      if (nextClose === -1) break // no matching close found

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // An open tag appears before the close tag → deeper nesting
        depth++
        pos = nextOpen + openStr.length
      } else {
        // Close tag appears before any open tag → closing a level
        depth--
        pos = nextClose + closeStr.length
      }
    }

    if (depth === 0 && pos > startIdx + openMatch[0].length) {
      const extracted = html.slice(startIdx, pos)
      if (extracted.length > 200) return extracted
    }
  }

  // Fallback: return full HTML but strip noise tags
  return stripNoiseTags(html)
}

/**
 * Strip known noise elements (nav, footer, header, aside, script, style, etc.)
 * from HTML while keeping everything else.
 */
function stripNoiseTags(html: string): string {
  let result = html
  for (const tag of NOISE_TAGS) {
    // Remove self-closing tags
    result = result.replace(new RegExp(`<${tag}[^>]*\/>`, "gi"), "")
    // Remove tag with content (handle nesting with depth tracking)
    result = result.replace(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "gi"), "")
  }
  return result
}

function extractTextFromHTML(html: string) {
  let text = ""
  let skipDepth = 0

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || NOISE_TAGS.has(name)) {
        skipDepth++
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })

  parser.write(html)
  parser.end()

  return text.replace(/\n{3,}/g, "\n\n").trim()
}

function convertHTMLToMarkdown(html: string, contentOnly = true): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  const removeTags: (keyof HTMLElementTagNameMap)[] = contentOnly
    ? ["script", "style", "meta", "link", "nav", "footer", "header", "aside"]
    : ["script", "style", "meta", "link"]
  turndownService.remove(removeTags)
  turndownService.addRule("noFigure", {
    filter: "figure",
    replacement: (content) => content,
  })
  turndownService.addRule("noFigcaption", {
    filter: "figcaption",
    replacement: (content) => `*${content.trim()}*`,
  })
  // Convert tables with header support
  turndownService.keep(["table", "thead", "tbody", "tr", "td", "th", "pre", "code", "kbd", "samp"])
  return turndownService.turndown(html)
}
