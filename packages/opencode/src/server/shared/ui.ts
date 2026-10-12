import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Effect, Stream } from "effect"
import { HttpBody, HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { createHash } from "node:crypto"
import path from "node:path"
import { ProxyUtil } from "../proxy-util"

let embeddedUIPromise: Promise<Record<string, string> | null> | undefined

export const UI_UPSTREAM = new URL("https://app.opencode.ai")

export const csp = (hash = "") =>
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src * data:`
export const DEFAULT_CSP = csp()

export function themePreloadHash(body: string) {
  return body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
}

export function cspForHtml(body: string) {
  const match = themePreloadHash(body)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

function requestBody(request: HttpServerRequest.HttpServerRequest) {
  if (request.method === "GET" || request.method === "HEAD") return HttpBody.empty
  const len = request.headers["content-length"]
  return HttpBody.stream(request.stream, request.headers["content-type"], len === undefined ? undefined : Number(len))
}

function proxyResponseHeaders(headers: Record<string, string>) {
  const result = new Headers(headers)
  // FetchHttpClient exposes decoded response bodies, so forwarding upstream
  // transfer metadata makes browsers decode already-decoded assets again.
  result.delete("content-encoding")
  result.delete("content-length")
  result.delete("transfer-encoding")
  return result
}

export function upstreamURL(path: string) {
  return new URL(path, UI_UPSTREAM).toString()
}

export function embeddedUI(disableEmbeddedWebUi: boolean) {
  if (disableEmbeddedWebUi) return Promise.resolve(null)
  return (embeddedUIPromise ??=
    // @ts-expect-error - generated file at build time
    import("opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null))
}

function notFound() {
  return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
}

function embeddedUIResponse(file: string, body: Uint8Array) {
  const mime = AppFileSystem.mimeType(file)
  const headers = new Headers({ "content-type": mime })
  if (mime.startsWith("text/html")) {
    headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
  }
  return HttpServerResponse.raw(body, { headers })
}

export function serveEmbeddedUIEffect(
  requestPath: string,
  fs: AppFileSystem.Interface,
  embeddedWebUI: Record<string, string>,
) {
  const file = embeddedWebUI[requestPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
  if (!file) return Effect.succeed(notFound())

  return fs.readFile(file).pipe(
    Effect.map((body) => embeddedUIResponse(file, body)),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(notFound())),
  )
}

/**
 * Resolves a request path inside `dir`, refusing anything that escapes it.
 * Returns null when the path traverses outside the root (e.g. `/../../etc/passwd`).
 */
function resolveWithinRoot(dir: string, requestPath: string): string | null {
  const root = path.resolve(dir)
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return null
  }
  const resolved = path.resolve(root, decoded.replace(/^\/+/, ""))
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

/**
 * Serves a locally built web UI (e.g. `packages/webui/dist`) from disk.
 *
 * Two behaviours worth stating: an unknown path falls back to `index.html`, because a client-side
 * route is not a missing file; and a request that escapes the root is answered with the same 404 as
 * a missing file, so the root cannot be probed.
 */
export function serveDirectoryUIEffect(requestPath: string, fs: AppFileSystem.Interface, dir: string) {
  return Effect.gen(function* () {
    const root = path.resolve(dir)
    const index = path.join(root, "index.html")

    // Never let a read failure escape as a defect: any unreadable path falls back to index.html,
    // and an unreadable index.html is a 404. A directory is not a file — `/` resolves to `root`,
    // and reading it would otherwise throw.
    const readOrUndefined = (file: string) =>
      fs.readFile(file).pipe(Effect.catch(() => Effect.succeed(undefined as Uint8Array | undefined)))

    const candidate = resolveWithinRoot(dir, requestPath)
    if (candidate && candidate !== root) {
      const isDir = yield* fs.isDir(candidate).pipe(Effect.catch(() => Effect.succeed(false)))
      if (!isDir) {
        const body = yield* readOrUndefined(candidate)
        if (body) return embeddedUIResponse(candidate, body)
      }
    }

    const body = yield* readOrUndefined(index)
    if (!body) return notFound()
    return embeddedUIResponse(index, body)
  })
}

export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: {
    fs: AppFileSystem.Interface
    client: HttpClient.HttpClient
    disableEmbeddedWebUi: boolean
    webUiDir?: string
  },
) {
  return Effect.gen(function* () {
    const pathname = new URL(request.url, "http://localhost").pathname

    // An explicitly configured directory wins over both the embedded bundle and the proxy: it is
    // the operator's stated intent, and it is what makes a single command enough to run the web UI.
    if (services.webUiDir) return yield* serveDirectoryUIEffect(pathname, services.fs, services.webUiDir)

    const embeddedWebUI = yield* Effect.promise(() => embeddedUI(services.disableEmbeddedWebUi))

    if (embeddedWebUI) return yield* serveEmbeddedUIEffect(pathname, services.fs, embeddedWebUI)

    const response = yield* services.client.execute(
      HttpClientRequest.make(request.method)(upstreamURL(pathname), {
        headers: ProxyUtil.headers(request.headers, { host: UI_UPSTREAM.host }),
        body: requestBody(request),
      }),
    )
    const headers = proxyResponseHeaders(response.headers)

    if (response.headers["content-type"]?.includes("text/html")) {
      const body = yield* response.text
      headers.set("Content-Security-Policy", cspForHtml(body))
      return HttpServerResponse.text(body, { status: response.status, headers })
    }

    headers.set("Content-Security-Policy", csp())
    return HttpServerResponse.stream(response.stream.pipe(Stream.catchCause(() => Stream.empty)), {
      status: response.status,
      headers,
    })
  })
}
