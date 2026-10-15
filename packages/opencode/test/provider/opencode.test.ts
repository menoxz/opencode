import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { custom, type CustomDep } from "@/provider/provider"

// Le chargeur `opencode` décide, sans réseau, du catalogue que le fournisseur Zen
// expose selon le credential présent. Le contrat vis-à-vis du reste du système est
// que le fournisseur reste listé sans credential (c'est par lui qu'on atteint la
// saisie de clé), avec ses seuls modèles gratuits — dont l'accès anonyme est fermé
// côté serveur, mesuré le 2026-10-15 (cf. commentaire dans `provider.ts`).

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

  test("un credential réel garde tout le catalogue sans clé publique", async () => {
    const { result, provider } = await load({ type: "api", key: "sk-cle-reelle" })
    expect(Object.keys(provider.models).sort()).toEqual(["deepseek-v4-flash", "deepseek-v4.1-flash-free"])
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({})
  })
})
