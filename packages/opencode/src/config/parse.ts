export * as ConfigParse from "./parse"

import { type ParseError as JsoncParseError, parse as parseJsoncImpl, printParseErrorCode } from "jsonc-parser"
import { Cause, Exit, Schema as EffectSchema, SchemaIssue } from "effect"
import type { DeepMutable } from "@opencode-ai/core/schema"
import { InvalidError, JsonError } from "./error"

export function jsonc(text: string, filepath: string): unknown {
  const errors: JsoncParseError[] = []
  const data = parseJsoncImpl(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const lines = text.split("\n")
    const issues = errors
      .map((e) => {
        const beforeOffset = text.substring(0, e.offset).split("\n")
        const line = beforeOffset.length
        const column = beforeOffset[beforeOffset.length - 1].length + 1
        const problemLine = lines[line - 1]

        const error = `${printParseErrorCode(e.error)} at line ${line}, column ${column}`
        if (!problemLine) return error

        return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`
      })
      .join("\n")
    throw new JsonError({
      path: filepath,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${issues}\n--- End ---`,
    })
  }

  return data
}

export function schema<S extends EffectSchema.Decoder<unknown, never>>(
  schema: S,
  data: unknown,
  source: string,
): DeepMutable<S["Type"]> {
  const input = withoutCommentKeys(data)
  const extra = topLevelExtraKeys(schema, input)
  if (extra.length) {
    throw new InvalidError({
      path: source,
      issues: [
        {
          code: "unrecognized_keys",
          keys: extra,
          path: [],
          message: `Unrecognized key${extra.length === 1 ? "" : "s"}: ${extra.join(", ")}`,
        },
      ],
    })
  }

  const decoded = EffectSchema.decodeUnknownExit(schema)(input, { errors: "all", propertyOrder: "original" })
  if (Exit.isSuccess(decoded)) return decoded.value as DeepMutable<S["Type"]>
  const error = Cause.squash(decoded.cause)

  throw new InvalidError(
    {
      path: source,
      issues: EffectSchema.isSchemaError(error)
        ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map((issue) => ({
            ...issue,
            message: issue.message,
            path: issue.path?.map(String) ?? [],
          }))
        : [{ message: String(error), path: [] }],
    },
    { cause: error },
  )
}

function topLevelExtraKeys(schema: EffectSchema.Top, data: unknown) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return []
  if (schema.ast._tag !== "Objects" || schema.ast.indexSignatures.length > 0) return []
  const known = new Set(schema.ast.propertySignatures.map((item) => String(item.name)))
  return Object.keys(data).filter((key) => !known.has(key))
}

/**
 * Drop `"//"` comment keys before validation.
 *
 * JSON has no comments, so `"//": "…"` is the conventional workaround (npm
 * popularised it in package.json) and people reach for it in opencode.json.
 * The config format already accepts real JSONC comments, so treating the key
 * as an unknown field only produced a confusing startup failure.
 */
function withoutCommentKeys(data: unknown): unknown {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return data
  const entries = Object.entries(data as Record<string, unknown>).filter(([key]) => !key.startsWith("//"))
  return Object.fromEntries(entries)
}
