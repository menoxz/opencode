import { describe, expect, test } from "bun:test"
import { Definitions } from "./keybind"

// A default binding is a comma-separated list of keys, where "none" means "unbound by default".
const keysOf = (value: unknown) =>
  String(value)
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0 && key !== "none")

const claimed = (only?: string) =>
  (Object.entries(Definitions) as [string, { default: unknown }][])
    .filter(([name]) => name !== only)
    .flatMap(([, definition]) => keysOf(definition.default))

describe("keybind defaults", () => {
  test("Steer no longer steals the newline key", () => {
    // Alt+Enter is the input's line break. A Steer shortcut bound to it made the newline
    // unreachable, because the two bindings then resolved to the same key.
    expect(keysOf(Definitions.prompt_steer.default)).not.toContain("alt+return")
    expect(keysOf(Definitions.input_newline.default)).toContain("alt+return")
    expect(keysOf(Definitions.input_newline.default)).toContain("shift+return")
  })

  test("the Steer key is a plain Alt+letter, which the terminal passes through", () => {
    // Alt+<letter> reaches the app as ESC followed by the letter (a meta-tagged "s"), which no
    // terminal repurposes. Nothing else in the default table claims the same key, so the shortcut
    // cannot be shadowed the way Alt+Enter was.
    const steer = keysOf(Definitions.prompt_steer.default)
    expect(steer).toEqual(["alt+s"])
    expect(claimed("prompt_steer")).not.toContain("alt+s")
  })
})
