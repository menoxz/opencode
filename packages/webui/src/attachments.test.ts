import { describe, expect, test } from "vitest"
import {
  attachmentMaxBytes,
  buildFilePart,
  filePartLabel,
  fileSizeLabel,
  isImageMime,
  validateAttachment,
} from "./attachments"

describe("attachmentMaxBytes", () => {
  test("borne par type, la plus spécifique gagnant", () => {
    expect(attachmentMaxBytes("image/png")).toBe(5 * 1024 * 1024)
    expect(attachmentMaxBytes("application/pdf")).toBe(10 * 1024 * 1024)
    expect(attachmentMaxBytes("text/plain")).toBe(1024 * 1024)
  })

  test("type inconnu : borne par défaut", () => {
    expect(attachmentMaxBytes("application/octet-stream")).toBe(2 * 1024 * 1024)
    expect(attachmentMaxBytes("")).toBe(2 * 1024 * 1024)
  })

  test("un préfixe court ne capture pas un type plus long", () => {
    // `text/` ne doit pas s'appliquer à `text/html`… si, mais la borne doit rester celle de `text/`.
    expect(attachmentMaxBytes("text/html")).toBe(1024 * 1024)
    // Et un type sans rapport garde la borne par défaut.
    expect(attachmentMaxBytes("video/mp4")).toBe(2 * 1024 * 1024)
  })
})

describe("validateAttachment", () => {
  test("accepte une pièce sous la borne", () => {
    expect(validateAttachment({ size: 1024, mime: "image/png", filename: "a.png" })).toBeUndefined()
  })

  test("refuse une pièce au-dessus de la borne, en le disant", () => {
    const message = validateAttachment({ size: 6 * 1024 * 1024, mime: "image/png", filename: "lourd.png" })
    expect(message).toContain("lourd.png")
    expect(message).toContain("5 MB")
    expect(message).toContain("6 MB")
  })

  test("refuse un type vide, parce que la borne serait fausse", () => {
    expect(validateAttachment({ size: 10, mime: "", filename: "x" })).toContain("Unknown type")
  })

  test("la borne est inclusive", () => {
    expect(validateAttachment({ size: 5 * 1024 * 1024, mime: "image/png", filename: "pile.png" })).toBeUndefined()
    expect(validateAttachment({ size: 5 * 1024 * 1024 + 1, mime: "image/png", filename: "trop.png" })).toBeDefined()
  })
})

describe("fileSizeLabel", () => {
  test("octets sous 1 ko", () => {
    expect(fileSizeLabel(0)).toBe("0 B")
    expect(fileSizeLabel(500)).toBe("500 B")
  })

  test("passe aux unités supérieures", () => {
    expect(fileSizeLabel(1024)).toBe("1 kB")
    expect(fileSizeLabel(1536)).toBe("1.5 kB")
    expect(fileSizeLabel(1024 * 1024)).toBe("1 MB")
    expect(fileSizeLabel(5 * 1024 * 1024)).toBe("5 MB")
    expect(fileSizeLabel(1024 * 1024 * 1024)).toBe("1 GB")
  })

  test("point décimal, pas virgule", () => {
    expect(fileSizeLabel(1310720)).toBe("1.3 MB")
    expect(fileSizeLabel(1536)).toContain(".")
  })
})

describe("isImageMime", () => {
  test("distingue les images", () => {
    expect(isImageMime("image/png")).toBe(true)
    expect(isImageMime("image/jpeg")).toBe(true)
    expect(isImageMime("application/pdf")).toBe(false)
    expect(isImageMime("text/plain")).toBe(false)
  })
})

describe("buildFilePart", () => {
  test("produit exactement la forme attendue par le SDK", () => {
    const part = buildFilePart({ mime: "image/png", filename: "a.png", dataUrl: "data:image/png;base64,AAA" })
    expect(part).toEqual({
      type: "file",
      mime: "image/png",
      filename: "a.png",
      url: "data:image/png;base64,AAA",
    })
  })

  test("n'invente pas d'identifiant", () => {
    // `id` est optionnel dans FilePartInput : c'est le serveur qui l'attribue.
    expect(buildFilePart({ mime: "text/plain", filename: "a.txt", dataUrl: "data:text/plain;base64,AA" })).not.toHaveProperty(
      "id",
    )
  })

  test("l'url reste une data URL", () => {
    const part = buildFilePart({ mime: "image/png", filename: "a.png", dataUrl: "data:image/png;base64,AAA" })
    expect(part.url.startsWith("data:")).toBe(true)
  })
})

describe("filePartLabel", () => {
  test("préfère le nom de fichier", () => {
    expect(filePartLabel({ filename: "rapport.pdf", mime: "application/pdf" })).toBe("rapport.pdf")
  })

  test("retombe sur le type, puis sur un libellé générique", () => {
    expect(filePartLabel({ mime: "application/pdf" })).toBe("application/pdf")
    expect(filePartLabel({})).toBe("attachment")
  })
})
