import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { custom, type CustomDep } from "@/provider/provider"

// Le chargeur `opencode` décide, sans réseau, de ce que le fournisseur Zen expose :
// tout le catalogue avec un credential, rien sans — le palier anonyme étant fermé
// côté serveur (mesuré le 2026-10-15, cf. commentaire dans `provider.ts`).

const models = () => ({
  "deepseek-v4.1-flash-free": { cost: { input: 0, output: 0 } },
  "deepseek-v4-flash": { cost: { input: 0.14, output: 0.28 } },
})

const dep = (auth: unknown): CustomDep => ({
  auth: () => Effect.succeed(auth) as never,
  config: () => Effect.succeed({}) as never,
  env: () => Effect.succeed({}),
  get: () => Effect.succeed(undefined),
})

async function load(auth: unknown) {
  const provider = { id: "opencode", env: [] as string[], models: models() }
  const loader = custom(dep(auth))["opencode"]!
  const result = (await Effect.runPromise(loader(provider as never))) as {
    autoload: boolean
    options?: Record<string, any>
  }
  return { result, provider }
}

describe("provider opencode", () => {
  test("sans credential, n'expose aucun modèle — le palier anonyme est fermé côté serveur", async () => {
    const { result, provider } = await load(undefined)
    expect(Object.keys(provider.models)).toEqual([])
    expect(result.autoload).toBe(false)
  })

  test("un credential vide (clé ou jeton) n'authentifie rien", async () => {
    const { result, provider } = await load({ type: "api", key: "" })
    expect(Object.keys(provider.models)).toEqual([])
    expect(result.autoload).toBe(false)
  })

  test("un credential réel garde tout le catalogue, gratuit compris", async () => {
    const { result, provider } = await load({ type: "api", key: "sk-cle-reelle" })
    expect(Object.keys(provider.models).sort()).toEqual(["deepseek-v4-flash", "deepseek-v4.1-flash-free"])
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({})
  })
})
