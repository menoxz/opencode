import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"

export interface ArtifactMetadata {
  schema: 1
  digest: string
  mime: string
  size: number
  filename?: string
  createdAt: number
}

export interface ArtifactRef extends ArtifactMetadata {
  url: string
  blobPath: string
  metadataPath: string
}

const REF = /^artifact:\/\/sha256\/([a-f0-9]{64})$/

function rootPath(root?: string) {
  return root ?? process.env.OPENCODE_ARTIFACT_ROOT ?? path.join(Global.Path.data, "artifacts", "sha256")
}

function paths(digest: string, root?: string) {
  const directory = path.join(rootPath(root), digest.slice(0, 2))
  return {
    directory,
    blobPath: path.join(directory, `${digest}.blob`),
    metadataPath: path.join(directory, `${digest}.json`),
  }
}

function parseRef(url: string) {
  const match = url.match(REF)
  if (!match) throw new Error(`Invalid artifact reference: ${url}`)
  return match[1]
}

async function createOnce(filepath: string, data: Uint8Array | string) {
  try {
    await fs.writeFile(filepath, data, { flag: "wx" })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
}

export namespace ArtifactStore {
  export function root() { return rootPath() }
  export async function put(
    bytes: Uint8Array,
    options: { mime: string; filename?: string; root?: string },
  ): Promise<ArtifactRef> {
    const digest = createHash("sha256").update(bytes).digest("hex")
    const target = paths(digest, options.root)
    await fs.mkdir(target.directory, { recursive: true })
    await createOnce(target.blobPath, bytes)
    const stat = await fs.stat(target.blobPath)
    if (stat.size !== bytes.byteLength) throw new Error(`Artifact collision or corruption for ${digest}`)
    const metadata: ArtifactMetadata = {
      schema: 1, digest, mime: options.mime, size: bytes.byteLength, createdAt: Date.now(),
      ...(options.filename ? { filename: path.basename(options.filename) } : {}),
    }
    await createOnce(target.metadataPath, JSON.stringify(metadata))
    const stored = JSON.parse(await fs.readFile(target.metadataPath, "utf8")) as ArtifactMetadata
    return {
      ...stored,
      url: `artifact://sha256/${digest}`,
      blobPath: target.blobPath,
      metadataPath: target.metadataPath,
    }
  }

  export async function read(url: string, options?: { root?: string }) {
    const digest = parseRef(url)
    const target = paths(digest, options?.root)
    const [bytes, raw] = await Promise.all([fs.readFile(target.blobPath), fs.readFile(target.metadataPath, "utf8")])
    const metadata = JSON.parse(raw) as ArtifactMetadata
    if (metadata.digest !== digest || metadata.size !== bytes.byteLength) {
      throw new Error(`Artifact metadata mismatch for ${digest}`)
    }
    return { bytes: new Uint8Array(bytes), metadata, ...target }
  }

  export async function toDataUrl(url: string, options?: { root?: string }) {
    const artifact = await read(url, options)
    return `data:${artifact.metadata.mime};base64,${Buffer.from(artifact.bytes).toString("base64")}`
  }

  export function isReference(url: string) {
    return REF.test(url)
  }
}
