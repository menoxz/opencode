/**
 * Pièces jointes du composeur.
 *
 * Contrat relevé dans le SDK, pas inventé : une pièce est une partie de message
 * `{ type: "file", mime, filename, url }` (`packages/sdk/js/src/v2/gen/types.gen.ts:2126`),
 * et `url` porte une **data URL** — c'est ce que fait l'app existante
 * (`packages/app/src/components/prompt-input/build-request-parts.ts:188-192`, `url: attachment.dataUrl`,
 * construite par `FileReader.readAsDataURL`).
 *
 * Ce fichier ne garde que les décisions pures, donc testables : bornes de taille, validation,
 * libellés, construction de la partie. La lecture du fichier, elle, touche au DOM et reste
 * dans `app.tsx`.
 */

/** Bornes de taille, choisies ici : les images passent en base64 dans le message, donc plus cher. */
const LIMITS: Record<string, number> = {
  "image/": 5 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
  "text/": 1 * 1024 * 1024,
}
const DEFAULT_LIMIT = 2 * 1024 * 1024

/** Une pièce prête à être envoyée, telle que le composeur la manipule. */
export type Attachment = {
  /** Identifiant local, pour retirer la pièce avant envoi. */
  id: string
  mime: string
  filename: string
  /** Data URL (`data:<mime>;base64,…`). */
  dataUrl: string
  size: number
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/")
}

/** Borne applicable à un type MIME. Le préfixe le plus long gagne, pour que `image/` prime sur le défaut. */
export function attachmentMaxBytes(mime: string): number {
  const match = Object.keys(LIMITS)
    .filter((prefix) => mime.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]
  return match ? LIMITS[match]! : DEFAULT_LIMIT
}

/**
 * Refuse une pièce trop lourde ou de type vide. Renvoie un message prêt à afficher, ou `undefined`
 * si la pièce est acceptable — un booléen ne suffirait pas, l'UI doit dire *pourquoi*.
 */
export function validateAttachment(file: { size: number; mime: string; filename: string }): string | undefined {
  if (!file.mime) return `Type inconnu pour « ${file.filename} »`
  const max = attachmentMaxBytes(file.mime)
  if (file.size > max) {
    return `« ${file.filename} » dépasse ${fileSizeLabel(max)} (${fileSizeLabel(file.size)})`
  }
  return undefined
}

/** Taille lisible. Arrondi au dixième : « 1,2 Mo » suffit, « 1,234 Mo » n'informe pas mieux. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const units = ["ko", "Mo", "Go"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = Math.round(value * 10) / 10
  return `${String(rounded).replace(".", ",")} ${units[unit]}`
}

/**
 * Construit la partie envoyée au serveur. `id` est volontairement omis : il est optionnel dans
 * `FilePartInput` et c'est le serveur qui l'attribue — en inventer un côté client créerait deux
 * sources d'identité pour la même pièce.
 */
export function buildFilePart(attachment: Pick<Attachment, "mime" | "filename" | "dataUrl">) {
  return {
    type: "file" as const,
    mime: attachment.mime,
    filename: attachment.filename,
    url: attachment.dataUrl,
  }
}

/** Ce qu'on affiche dans le fil pour une partie de fichier, sans dépendre du DOM. */
export function filePartLabel(part: { filename?: string; mime?: string }): string {
  return part.filename || part.mime || "pièce jointe"
}
