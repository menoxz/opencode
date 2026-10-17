import { describe, expect, test } from "bun:test"
import { JevClient } from "./client"

/**
 * The provider lock.
 *
 * Three hosts are selectable, each pinning its own model and its own key
 * variable. These tests exist to make that a property of the code rather than
 * of the environment: the moment someone adds a host that is not paired with a
 * model and a key variable, decouples a host from its model, or accepts a second
 * key variable, one of these fails with the exact escape that was opened.
 */

const TYPESAFE = "https://api.typesafe.ai"
const OPENJEV = "https://api.codiv.ai"
const ZEN = JevClient.OPENCODE_ZEN_BASE_URL
const CODE = JevClient.COMMAND_CODE_BASE_URL

describe("JevClient.provider lock", () => {
  test("the default provider is Command Code and owns its own key", () => {
    expect(JevClient.PROVIDER).toBe("command-code")
    expect(JevClient.PROVIDER_ENV_KEY).toBe("COMMAND_CODE_API_KEY")
    expect(JevClient.COMMAND_CODE_MODEL).toBe("typesafe/jev")
  })

  test("exactly three hosts are selectable, and each pairs a host with its model", () => {
    expect([...JevClient.SELECTABLE_PROVIDERS]).toEqual(["opencode-zen", "command-code", "openjev"])
    expect(JevClient.PROVIDERS["opencode-zen"]).toEqual({
      base_url: JevClient.OPENCODE_ZEN_BASE_URL,
      model: JevClient.OPENCODE_ZEN_MODEL,
    })
    expect(JevClient.PROVIDERS["command-code"]).toEqual({
      base_url: JevClient.COMMAND_CODE_BASE_URL,
      model: JevClient.COMMAND_CODE_MODEL,
    })
    expect(JevClient.PROVIDERS.openjev).toEqual({
      base_url: JevClient.OPENJEV_BASE_URL,
      model: JevClient.OPENJEV_MODEL,
    })
    // TypeSafe is documented but not selectable: its key measured HTTP 401.
    expect(JevClient.SELECTABLE_PROVIDERS).not.toContain("typesafe" as never)
  })
})

describe("JevClient.apiKey", () => {
  test("takes the default provider's key from the environment", () => {
    expect(JevClient.apiKey(undefined, { COMMAND_CODE_API_KEY: "code-key" })).toBe("code-key")
  })

  test("takes the Codiv key when the openjev preset is selected", () => {
    expect(JevClient.apiKey({ provider: "openjev" }, { CODIV_API_KEY: "codiv-key" })).toBe("codiv-key")
    // ...and never the other provider's variable.
    expect(JevClient.apiKey({ provider: "openjev" }, { COMMAND_CODE_API_KEY: "code-key" })).toBeUndefined()
    expect(JevClient.apiKey(undefined, { CODIV_API_KEY: "codiv-key" })).toBeUndefined()
  })

  test("takes the Zen key from the opencode-zen preset only", () => {
    expect(JevClient.apiKey({ provider: "opencode-zen" }, { OPENCODE_GO_API_KEY: "zen-key" })).toBe("zen-key")
    expect(JevClient.apiKey({ provider: "opencode-zen" }, { COMMAND_CODE_API_KEY: "code-key" })).toBeUndefined()
  })

  test("no other environment variable can authenticate a call", () => {
    // Measured, not hypothetical: TYPESAFE_API_KEY answers HTTP 401 on both hosts,
    // so letting it win turns a loud failure into a silent fallback.
    expect(
      JevClient.apiKey(undefined, {
        TYPESAFE_API_KEY: "sk-cod-dead",
        JEV_API_KEY: "jev-dead",
        COMMAND_CODE_API_KEY: "code-key",
      }),
    ).toBe("code-key")
    expect(JevClient.apiKey(undefined, { TYPESAFE_API_KEY: "sk-cod-dead", JEV_API_KEY: "jev-dead" })).toBeUndefined()
  })

  test("an explicit key in the config is the documented fallback", () => {
    expect(JevClient.apiKey({ api_key: "from-config" }, {})).toBe("from-config")
    expect(JevClient.apiKey({ api_key: "from-config" }, { COMMAND_CODE_API_KEY: "code-key" })).toBe("code-key")
  })

  test("no key anywhere means no key", () => {
    expect(JevClient.apiKey(undefined, {})).toBeUndefined()
    expect(JevClient.apiKey({}, {})).toBeUndefined()
  })
})

describe("JevClient.isProviderHost", () => {
  test("accepts a selectable host whatever the path, scheme or trailing slash", () => {
    for (const value of [
      CODE,
      `${CODE}/`,
      "https://api.commandcode.ai/provider/v1/systemone",
      "http://api.commandcode.ai/provider",
      ZEN,
      OPENJEV,
      `${OPENJEV}/v1/systemone`,
    ]) {
      expect(JevClient.isProviderHost(value)).toBe(true)
    }
  })

  test("refuses any other host, and refuses nothing at all", () => {
    for (const value of [
      TYPESAFE,
      "https://api.typesafe.ai.evil.test",
      "https://api.codiv.ai.evil.test",
      "https://evil.test/api.commandcode.ai",
      undefined,
    ]) {
      expect(JevClient.isProviderHost(value)).toBe(false)
    }
  })
})

describe("JevClient.baseUrl", () => {
  test("defaults to the Command Code Provider API", () => {
    expect(JevClient.baseUrl(undefined, {})).toBe(CODE)
    expect(JevClient.baseUrl({}, { TYPESAFE_BASE_URL: TYPESAFE })).toBe(CODE)
  })

  test("refuses a foreign base_url instead of dialling it", () => {
    expect(JevClient.baseUrl({ base_url: TYPESAFE }, {})).toBe(CODE)
    expect(JevClient.baseUrl({ base_url: "https://api.typesafe.ai.evil.test" }, {})).toBe(CODE)
  })

  test("follows the openjev preset, and an explicit Codiv base_url", () => {
    expect(JevClient.baseUrl({ provider: "openjev" }, {})).toBe(OPENJEV)
    expect(JevClient.baseUrl({ base_url: OPENJEV }, {})).toBe(OPENJEV)
  })

  test("an explicit Command Code base_url is kept verbatim", () => {
    expect(JevClient.baseUrl({ base_url: `${CODE}/` }, {})).toBe(`${CODE}/`)
  })
})

describe("JevClient.resolveModel", () => {
  test("defaults to the default preset's model whatever the environment claims", () => {
    expect(JevClient.resolveModel(undefined, {})).toBe(JevClient.COMMAND_CODE_MODEL)
    expect(JevClient.resolveModel(undefined, { TYPESAFE_MODEL: JevClient.DEFAULT_MODEL })).toBe(
      JevClient.COMMAND_CODE_MODEL,
    )
  })

  test("a foreign base_url cannot drag the model to another preset", () => {
    expect(JevClient.resolveModel({ base_url: TYPESAFE }, {})).toBe(JevClient.COMMAND_CODE_MODEL)
  })

  test("naming a host selects that host's model, so a host is never called with a foreign model id", () => {
    expect(JevClient.resolveModel({ provider: "openjev" }, {})).toBe(JevClient.OPENJEV_MODEL)
    // A bare base_url names the host the request will reach, so it decides the model too.
    expect(JevClient.resolveModel({ base_url: OPENJEV }, {})).toBe(JevClient.OPENJEV_MODEL)
    expect(JevClient.resolveModel({ base_url: `${CODE}/` }, {})).toBe(JevClient.COMMAND_CODE_MODEL)
  })

  test("an explicit model is kept as written", () => {
    expect(JevClient.resolveModel({ model: "jev-fast" }, {})).toBe("jev-fast")
  })
})

describe("JevClient.resolveEndpoint", () => {
  test("defaults to the System One route of the locked host", () => {
    expect(JevClient.resolveEndpoint(undefined, {})).toBe(`${CODE}/v1/systemone`)
  })

  test("a foreign endpoint is refused", () => {
    expect(JevClient.resolveEndpoint({ endpoint: `${TYPESAFE}/v1/systemone` }, {})).toBe(`${CODE}/v1/systemone`)
  })

  test("the openjev preset routes to Codiv's System One", () => {
    expect(JevClient.resolveEndpoint({ provider: "openjev" }, {})).toBe(`${OPENJEV}/v1/systemone`)
    expect(JevClient.resolveEndpoint({ endpoint: `${OPENJEV}/v1/systemone` }, {})).toBe(`${OPENJEV}/v1/systemone`)
  })

  test("an explicit Command Code endpoint is kept verbatim", () => {
    expect(JevClient.resolveEndpoint({ endpoint: `${CODE}/v1/systemone` }, {})).toBe(`${CODE}/v1/systemone`)
  })
})
