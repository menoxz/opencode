import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { custom, type CustomDep } from "@/provider/provider"

// Le chargeur `opencode` décide, sans réseau, du catalogue que le fournisseur Zen
// expose. Deux règles, chacune adossée à une mesure du 2026-10-15 :
//  - sans credential, le fournisseur reste listé avec ses seuls modèles gratuits
//    (c'est par lui qu'on atteint la saisie de clé) ;
//  - les modèles du palier gratuit ne sont **jamais** servis au fork (403
//    FreeTierError avec ou sans clé, et pour le client officiel aussi), donc ils
//    ne sont pas offerts quand un credential est présent : on garde les payants,
//    qui répondent dès que le compte est approvisionné.

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
  test("sans credential, ne garde que les modèles gratuits et reste enregistré", async () => {
    const { result, provider } = await load(undefined)
    expect(Object.keys(provider.models)).toEqual(["deepseek-v4.1-flash-free"])
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({ apiKey: "public" })
  })

  test("un credential vide ne vaut pas authentification : il n'élargit pas le catalogue", async () => {
    const { result, provider } = await load({ type: "api", key: "" })
    expect(Object.keys(provider.models)).toEqual(["deepseek-v4.1-flash-free"])
    expect(result.options).toEqual({ apiKey: "public" })
  })

  test("un credential réel garde les modèles payants et écarte les gratuits, inservables", async () => {
    const { result, provider } = await load({ type: "api", key: "sk-cle-reelle" })
    expect(Object.keys(provider.models)).toEqual(["deepseek-v4-flash"])
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({})
  })
})
