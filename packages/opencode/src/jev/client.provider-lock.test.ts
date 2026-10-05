import { describe, expect, test } from "bun:test"
import { JevClient } from "./client"

/**
 * The provider lock.
 *
 * Command Code is the only host this build calls, so these tests exist to make
 * that a property of the code rather than of the environment: the moment someone
 * reintroduces a second host, or a second key variable, one of these fails with
 * the exact escape that was opened.
 */

const TYPESAFE = "https://api.typesafe.ai"
const OPENJEV = "https://api.codiv.ai"
const CODE = JevClient.COMMAND_CODE_BASE_URL

describe("JevClient.provider lock", () => {
  test("the lock names Command Code and its own key", () => {
    expect(JevClient.PROVIDER).toBe("command-code")
    expect(JevClient.PROVIDER_ENV_KEY).toBe("COMMAND_CODE_API_KEY")
    expect(JevClient.COMMAND_CODE_MODEL).toBe("typesafe/jev")
  })
})

describe("JevClient.apiKey", () => {
  test("takes the Command Code key from the environment", () => {
    expect(JevClient.apiKey(undefined, { COMMAND_CODE_API_KEY: "code-key" })).toBe("code-key")
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
  test("accepts the Command Code host whatever the path, scheme or trailing slash", () => {
    for (const value of [CODE, `${CODE}/`, "https://api.commandcode.ai/provider/v1/systemone", "http://api.commandcode.ai/provider"]) {
      expect(JevClient.isProviderHost(value)).toBe(true)
    }
  })

  test("refuses any other host, and refuses nothing at all", () => {
    for (const value of [TYPESAFE, OPENJEV, "https://api.typesafe.ai.evil.test", "https://evil.test/api.commandcode.ai", undefined]) {
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
    expect(JevClient.baseUrl({ base_url: OPENJEV }, {})).toBe(CODE)
  })

  test("an explicit Command Code base_url is kept verbatim", () => {
    expect(JevClient.baseUrl({ base_url: `${CODE}/` }, {})).toBe(`${CODE}/`)
  })
})

describe("JevClient.resolveModel", () => {
  test("defaults to typesafe/jev whatever the environment claims", () => {
    expect(JevClient.resolveModel(undefined, {})).toBe(JevClient.COMMAND_CODE_MODEL)
    expect(JevClient.resolveModel(undefined, { TYPESAFE_MODEL: JevClient.DEFAULT_MODEL })).toBe(JevClient.COMMAND_CODE_MODEL)
  })

  test("a foreign base_url cannot drag the model back to another preset", () => {
    expect(JevClient.resolveModel({ base_url: TYPESAFE }, {})).toBe(JevClient.COMMAND_CODE_MODEL)
    expect(JevClient.resolveModel({ base_url: OPENJEV }, {})).toBe(JevClient.COMMAND_CODE_MODEL)
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

  test("an explicit Command Code endpoint is kept verbatim", () => {
    expect(JevClient.resolveEndpoint({ endpoint: `${CODE}/v1/systemone` }, {})).toBe(`${CODE}/v1/systemone`)
  })
})
