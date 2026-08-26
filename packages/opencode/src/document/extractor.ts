import path from "node:path"
import os from "node:os"
import { promises as fs } from "node:fs"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { promisify } from "node:util"
import { Parser } from "htmlparser2"
import { lookup } from "mime-types"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, type Entry } from "@zip.js/zip.js"
import { ArtifactStore, type ArtifactRef } from "@/artifact/store"

export type DocumentKind = "docx" | "pdf" | "pptx" | "xlsx" | "video"

export interface DocumentAsset {
  url: string
  mime: string
  filename: string
  sourceLocator: string
  size: number
}

export interface DocumentExtraction {
  kind: DocumentKind
  text: string
  assets: DocumentAsset[]
  source: ArtifactRef
  metadata: Record<string, unknown>
  warnings: string[]
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const MAX_ZIP_ENTRIES = 2_000
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024

function safeEntryName(name: string) {
  const normalized = name.replaceAll("\\", "/")
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe document archive entry: ${name}`)
  }
  return normalized
}

async function entryBytes(entry: Entry) {
  return new Uint8Array(await entry.getData!(new Uint8ArrayWriter()))
}

async function entryText(entry: Entry) {
  return new TextDecoder().decode(await entryBytes(entry))
}

function markdownTable(rows: string[][]) {
  if (rows.length === 0) return ""
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? "").replaceAll("|", "\\|")))
  const header = normalized[0]!
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

function xmlToMarkdown(xml: string) {
  const output: string[] = []
  let paragraph = ""
  let style = ""
  let inText = false
  let inCell = false
  let cellParagraphs: string[] = []
  let currentRow: string[] | undefined
  let tableRows: string[][] | undefined

  const parser = new Parser({
    onopentag(name, attrs) {
      const tag = name.toLowerCase()
      if (tag === "w:p") { paragraph = ""; style = "" }
      if (tag === "w:pstyle") style = attrs["w:val"] ?? attrs.val ?? ""
      if (tag === "w:t" || tag === "w:deltext" || tag === "w:instrtext") inText = true
      if (tag === "w:tab") paragraph += "\t"
      if (tag === "w:br" || tag === "w:cr") paragraph += "\n"
      if (tag === "w:tbl") tableRows = []
      if (tag === "w:tr") currentRow = []
      if (tag === "w:tc") { inCell = true; cellParagraphs = [] }
    },
    ontext(text) { if (inText) paragraph += text },
    onclosetag(name) {
      const tag = name.toLowerCase()
      if (tag === "w:t" || tag === "w:deltext" || tag === "w:instrtext") inText = false
      if (tag === "w:p") {
        const text = paragraph.trim()
        if (text) {
          if (inCell) cellParagraphs.push(text)
          else {
            const match = style.match(/heading\s*(\d+)|heading(\d+)/i)
            const level = Math.min(6, Number(match?.[1] ?? match?.[2] ?? 0))
            output.push(level ? `${"#".repeat(level)} ${text}` : text)
          }
        }
        paragraph = ""
      }
      if (tag === "w:tc") { currentRow?.push(cellParagraphs.join(" ")); inCell = false }
      if (tag === "w:tr" && currentRow) { tableRows?.push(currentRow); currentRow = undefined }
      if (tag === "w:tbl" && tableRows) {
        const table = markdownTable(tableRows)
        if (table) output.push(table)
        tableRows = undefined
      }
    },
  }, { xmlMode: true, decodeEntities: true })
  parser.write(xml)
  parser.end()
  return output.join("\n\n")
}

async function extractDocx(bytes: Uint8Array, options: { filename: string; mime: string }): Promise<DocumentExtraction> {
  const source = await ArtifactStore.put(bytes, { mime: options.mime, filename: options.filename })
  // Node file reads may return pooled Buffer views with a non-zero byteOffset; zip.js expects an owned range.
  const archiveBytes = Uint8Array.from(bytes)
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes))
  try {
    const entries = await reader.getEntries()
    if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`DOCX has too many archive entries (${entries.length})`)
    let expanded = 0
    const byName = new Map<string, Entry>()
    for (const entry of entries) {
      const name = safeEntryName(entry.filename)
      expanded += entry.uncompressedSize ?? 0
      if (expanded > MAX_UNCOMPRESSED_BYTES) throw new Error("DOCX expanded size exceeds safety limit")
      if (!entry.directory) byName.set(name, entry)
    }
    const sections: string[] = []
    const main = byName.get("word/document.xml")
    if (!main) throw new Error("Invalid DOCX: word/document.xml is missing")
    sections.push(xmlToMarkdown(await entryText(main)))
    const supplemental = [...byName.entries()]
      .filter(([name]) => /^word\/(header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(name))
      .sort(([left], [right]) => left.localeCompare(right))
    for (const [name, entry] of supplemental) {
      const text = xmlToMarkdown(await entryText(entry))
      if (text) sections.push(`## ${path.basename(name, ".xml")}\n\n${text}`)
    }
    const assets: DocumentAsset[] = []
    for (const [name, entry] of [...byName.entries()].filter(([name]) => name.startsWith("word/media/")).sort(([a], [b]) => a.localeCompare(b))) {
      const data = await entryBytes(entry)
      const mime = lookup(name) || "application/octet-stream"
      const artifact = await ArtifactStore.put(data, { mime, filename: path.basename(name) })
      assets.push({ url: artifact.url, mime, filename: path.basename(name), sourceLocator: name, size: data.byteLength })
    }
    return {
      kind: "docx",
      text: sections.filter(Boolean).join("\n\n"),
      assets,
      source,
      metadata: { entries: entries.length, expandedBytes: expanded },
      warnings: [],
    }
  } finally {
    await reader.close()
  }
}

const execFileAsync = promisify(execFile)

const PDF_SCRIPT = String.raw`
import fitz, json, os, sys
source, output = sys.argv[1], sys.argv[2]
doc = fitz.open(source)
if doc.page_count > 500: raise RuntimeError(f"PDF page limit exceeded: {doc.page_count}")
result = {"pages": [], "assets": [], "metadata": dict(doc.metadata or {})}
asset_count = 0
render_count = 0
for index in range(doc.page_count):
    page = doc.load_page(index)
    text = page.get_text("text") or ""
    result["pages"].append({"number": index + 1, "text": text})
    for image in page.get_images(full=True):
        if asset_count >= 50: break
        xref = image[0]
        data = doc.extract_image(xref)
        ext = data.get("ext", "bin")
        name = f"page-{index+1}-image-{asset_count+1}.{ext}"
        target = os.path.join(output, name)
        with open(target, "wb") as handle: handle.write(data["image"])
        result["assets"].append({"path": target, "name": name, "locator": f"page {index+1} embedded image"})
        asset_count += 1
    if len(text.strip()) < 20 and render_count < 20:
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        name = f"page-{index+1}-render.png"
        target = os.path.join(output, name)
        pix.save(target)
        result["assets"].append({"path": target, "name": name, "locator": f"page {index+1} rendered for visual reading"})
        render_count += 1
print(json.dumps(result, ensure_ascii=False))
doc.close()
`

const EXECUTABLES = new Map<string, string>()

async function resolveExecutable(command: string) {
  const cached = EXECUTABLES.get(command)
  if (cached) return cached
  const locator = process.platform === "win32" ? "where.exe" : "which"
  const located = await execFileAsync(locator, [command], { timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true })
  const resolved = located.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean)
  if (!resolved || !path.isAbsolute(resolved)) throw new Error(`Executable not found: ${command}`)
  EXECUTABLES.set(command, resolved)
  return resolved
}

async function runPython(script: string, args: string[]) {
  let last: unknown
  for (const command of process.platform === "win32" ? ["python", "python3"] : ["python3", "python"]) {
    try {
      const executable = await resolveExecutable(command)
      const result = await execFileAsync(executable, ["-c", script, ...args], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
      return result.stdout
    } catch (error) { last = error }
  }
  throw new Error(`PDF extraction requires Python with PyMuPDF: ${String(last)}`)
}

async function extractPdf(bytes: Uint8Array, options: { filename: string; mime: string }): Promise<DocumentExtraction> {
  if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("PDF source size exceeds safety limit")
  const source = await ArtifactStore.put(bytes, { mime: "application/pdf", filename: options.filename })
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-pdf-"))
  try {
    const input = path.join(temporary, "source.pdf")
    const output = path.join(temporary, "assets")
    await fs.mkdir(output)
    await fs.writeFile(input, Uint8Array.from(bytes))
    const raw = await runPython(PDF_SCRIPT, [input, output])
    const parsed = JSON.parse(raw) as {
      pages: Array<{ number: number; text: string }>
      assets: Array<{ path: string; name: string; locator: string }>
      metadata: Record<string, unknown>
    }
    const assets: DocumentAsset[] = []
    let totalAssetBytes = 0
    for (const item of parsed.assets) {
      const data = await fs.readFile(item.path)
      totalAssetBytes += data.byteLength
      if (totalAssetBytes > 50 * 1024 * 1024) throw new Error("PDF extracted assets exceed safety limit")
      const mime = lookup(item.name) || "application/octet-stream"
      const artifact = await ArtifactStore.put(data, { mime, filename: item.name })
      assets.push({ url: artifact.url, mime, filename: item.name, sourceLocator: item.locator, size: data.byteLength })
    }
    const text = parsed.pages.map((page) => `## Page ${page.number}\n\n${page.text.trim() || "[No text layer; inspect the rendered page attachment.]"}`).join("\n\n")
    return {
      kind: "pdf", text, assets, source, warnings: [],
      metadata: { ...parsed.metadata, pages: parsed.pages.length, extractedAssets: assets.length },
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
  }
}

interface ProbeStream {
  index: number
  codec_type: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  channels?: number
  sample_rate?: string
  tags?: Record<string, string>
}

interface ProbeResult {
  format?: { format_name?: string; duration?: string; size?: string; bit_rate?: string }
  streams?: ProbeStream[]
}

function frameRate(value?: string) {
  if (!value) return undefined
  const [left, right = "1"] = value.split("/")
  const rate = Number(left) / Number(right)
  return Number.isFinite(rate) ? rate : undefined
}

async function runMedia(command: string, args: string[], timeout: number, maxBuffer = 4 * 1024 * 1024) {
  try {
    const executable = await resolveExecutable(command)
    return await execFileAsync(executable, args, { timeout, maxBuffer, windowsHide: true, env: { ...process.env } })
  } catch (error) {
    throw new Error(`${command} failed: ${String(error)}`)
  }
}

async function extractVideo(bytes: Uint8Array, options: { filename: string; mime: string }): Promise<DocumentExtraction> {
  if (bytes.byteLength > 500 * 1024 * 1024) throw new Error("Video source size exceeds safety limit")
  const source = await ArtifactStore.put(bytes, { mime: options.mime, filename: options.filename })
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-video-"))
  try {
    const extension = path.extname(options.filename) || ".bin"
    const input = path.join(temporary, `source${extension}`)
    const framesDirectory = path.join(temporary, "frames")
    await fs.mkdir(framesDirectory)
    await fs.writeFile(input, Uint8Array.from(bytes))
    const probeRaw = await runMedia("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-print_format", "json", "-show_format", "-show_streams", input], 30_000)
    const probe = JSON.parse(probeRaw.stdout) as ProbeResult
    const streams = probe.streams ?? []
    if (streams.length > 16) throw new Error(`Video stream limit exceeded: ${streams.length}`)
    const durationSeconds = Number(probe.format?.duration ?? 0)
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 4 * 60 * 60) {
      throw new Error(`Invalid or excessive video duration: ${probe.format?.duration ?? "unknown"}`)
    }
    for (const stream of streams.filter((item) => item.codec_type === "video")) {
      if ((stream.width ?? 0) > 7680 || (stream.height ?? 0) > 4320) throw new Error("Video dimensions exceed safety limit")
    }
    const frameCount = Math.min(12, Math.max(1, Math.ceil(durationSeconds / 30) + 1))
    const interval = durationSeconds > 0 ? Math.max(durationSeconds / frameCount, 0.2) : 1
    const framePattern = path.join(framesDirectory, "frame-%03d.jpg")
    await runMedia("ffmpeg", [
      "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", input,
      "-vf", `fps=1/${interval},scale=min(1280\\,iw):-2`,
      "-frames:v", String(frameCount), "-q:v", "3", "-y", framePattern,
    ], 120_000, 2 * 1024 * 1024)
    const assets: DocumentAsset[] = []
    const frameFiles = (await fs.readdir(framesDirectory)).filter((name) => name.endsWith(".jpg")).sort()
    for (const [index, name] of frameFiles.entries()) {
      const data = await fs.readFile(path.join(framesDirectory, name))
      const artifact = await ArtifactStore.put(data, { mime: "image/jpeg", filename: name })
      const timestamp = Math.min(durationSeconds, index * interval)
      assets.push({ url: artifact.url, mime: "image/jpeg", filename: name, sourceLocator: `video frame at ~${timestamp.toFixed(2)}s`, size: data.byteLength })
    }
    const hasAudio = streams.some((item) => item.codec_type === "audio")
    let audioArtifact: ArtifactRef | undefined
    if (hasAudio) {
      const audioPath = path.join(temporary, "audio.wav")
      await runMedia("ffmpeg", ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", audioPath], 120_000, 2 * 1024 * 1024)
      const audio = await fs.readFile(audioPath)
      audioArtifact = await ArtifactStore.put(audio, { mime: "audio/wav", filename: `${path.parse(options.filename).name}.wav` })
      assets.push({ url: audioArtifact.url, mime: "audio/wav", filename: audioArtifact.filename ?? "audio.wav", sourceLocator: "normalized mono audio track", size: audio.byteLength })
    }
    const normalizedStreams = streams.map((stream) => ({
      index: stream.index, kind: stream.codec_type, codec: stream.codec_name, width: stream.width, height: stream.height,
      frameRate: frameRate(stream.avg_frame_rate), channels: stream.channels, sampleRate: stream.sample_rate ? Number(stream.sample_rate) : undefined,
      language: stream.tags?.language,
    }))
    const timeline = assets.filter((asset) => asset.mime.startsWith("image/")).map((asset) => `- ${asset.sourceLocator}: ${asset.url}`).join("\n")
    const text = [
      `# Video: ${options.filename}`,
      `Duration: ${durationSeconds.toFixed(3)} seconds`,
      `Container: ${probe.format?.format_name ?? "unknown"}`,
      `Streams: ${normalizedStreams.map((stream) => `${stream.kind}:${stream.codec ?? "unknown"}`).join(", ")}`,
      "", "## Visual timeline", timeline || "[No video frames extracted]",
      "", "## Audio", audioArtifact ? `Extracted audio: ${audioArtifact.url}` : "No audio stream detected.",
      audioArtifact ? "Transcription is pending a configured transcription provider; the WAV artifact is preserved." : "",
    ].filter(Boolean).join("\n")
    return {
      kind: "video", text, assets, source,
      metadata: { durationSeconds, format: probe.format?.format_name, streams: normalizedStreams, frames: frameFiles.length, audio: Boolean(audioArtifact) },
      warnings: audioArtifact ? ["Audio extracted; no transcription provider configured."] : [],
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
  }
}

const PIPELINE_VERSION = 1

function extractionCachePath(kind: DocumentKind, digest: string) {
  return path.join(path.dirname(ArtifactStore.root()), "extractions", `v${PIPELINE_VERSION}`, `${digest}-${kind}.json`)
}

async function cachedExtraction(kind: DocumentKind, digest: string): Promise<DocumentExtraction | undefined> {
  const filepath = extractionCachePath(kind, digest)
  try {
    const parsed = JSON.parse(await fs.readFile(filepath, "utf8")) as DocumentExtraction
    await ArtifactStore.read(parsed.source.url)
    await Promise.all(parsed.assets.map((asset) => ArtifactStore.read(asset.url)))
    return { ...parsed, metadata: { ...parsed.metadata, cacheHit: true } }
  } catch {
    return undefined
  }
}

async function saveExtraction(result: DocumentExtraction) {
  const filepath = extractionCachePath(result.kind, result.source.digest)
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  const temporary = `${filepath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporary, JSON.stringify(result))
  try { await fs.rename(temporary, filepath) }
  catch { await fs.rm(temporary, { force: true }).catch(() => {}) }
}

export namespace DocumentExtractor {
  export function maxInputBytes(kind: DocumentKind) {
    if (kind === "video") return 500 * 1024 * 1024
    if (kind === "pdf") return 250 * 1024 * 1024
    return 100 * 1024 * 1024
  }

  export function kind(filename: string, mime: string): DocumentKind | undefined {
    const extension = path.extname(filename).toLowerCase()
    if (mime === DOCX_MIME || extension === ".docx") return "docx"
    if (mime === "application/pdf" || extension === ".pdf") return "pdf"
    if (mime.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"].includes(extension)) return "video"
    if (extension === ".pptx") return "pptx"
    if (extension === ".xlsx") return "xlsx"
  }

  export async function extractBytes(bytes: Uint8Array, options: { filename: string; mime: string }) {
    const detected = kind(options.filename, options.mime)
    if (!detected) throw new Error(`Unsupported document type: ${options.mime}`)
    const digest = createHash("sha256").update(bytes).digest("hex")
    const cached = await cachedExtraction(detected, digest)
    if (cached) return cached
    const result = detected === "docx"
      ? await extractDocx(bytes, options)
      : detected === "pdf"
        ? await extractPdf(bytes, options)
        : detected === "video"
          ? await extractVideo(bytes, options)
          : undefined
    if (!result) throw new Error(`Document extraction is not implemented for ${detected}`)
    result.metadata = { ...result.metadata, cacheHit: false, pipelineVersion: PIPELINE_VERSION }
    await saveExtraction(result)
    return result
  }
}
