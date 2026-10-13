import { describe, expect, test } from "vitest"
import {
  DEFAULT_NPM,
  blacklistPatch,
  discoverPatch,
  modelPatch,
  newProviderDraft,
  providerId,
  providerPatch,
  toggleModel,
} from "./settings"

/**
 * La couche d'écriture, éprouvée **hors navigateur**.
 *
 * Elle est pure, donc c'est ici que se paient les erreurs qui coûtent le plus cher : un patch
 * malformé ne jette pas, il écrit autre chose que ce qu'on croit dans le fichier de configuration
 * de l'utilisateur. Les deux règles tenues par ces constructeurs — un champ vide ne s'écrit pas, le
 * patch fusionne sans retirer — se testent exactement, et c'est la raison d'être de ce fichier.
 */
describe("les écritures d'un fournisseur", () => {
  test("un identifiant devient une clé de fichier citable", () => {
    // `Config.model` référence un modèle par `provider/modèle` : un identifiant à espace ou à
    // majuscule rendrait la référence intapable.
    expect(providerId("  My Gateway 2 ")).toBe("my-gateway-2")
    expect(providerId("gateway.local")).toBe("gateway.local")
    expect(providerId("a/b")).toBe("a-b")
    expect(providerId("...")).toBe("...")
    expect(providerId("   ")).toBe("")
  })

  test("un champ vide ne s'écrit pas — écrire la chaîne vide efface le réglage", () => {
    // `config.ts:513` retire la clé quand la valeur est une chaîne vide : un formulaire laissé vide
    // détruirait donc une `baseURL` existante. C'est le défaut que ces trois attentes interdisent.
    expect(providerPatch("gateway", {})).toBeUndefined()
    expect(providerPatch("gateway", { baseURL: "   ", npm: "" })).toBeUndefined()
    expect(providerPatch("   ", { baseURL: "https://x.test/v1" })).toBeUndefined()
  })

  test("le patch porte le npm et l'URL de base, normalisés", () => {
    const patch = providerPatch("My Gateway", { npm: ` ${DEFAULT_NPM} `, baseURL: " https://x.test/v1 " })
    expect(patch).toEqual({
      provider: { "my-gateway": { npm: DEFAULT_NPM, options: { baseURL: "https://x.test/v1" } } },
    })
  })

  test("le npm seul suffit — un fournisseur déjà adressé se règle sans réécrire son URL", () => {
    const patch = providerPatch("gateway", { npm: DEFAULT_NPM })
    expect(patch).toEqual({ provider: { gateway: { npm: DEFAULT_NPM } } })
    expect((patch as { provider: Record<string, Record<string, unknown>> }).provider.gateway).not.toHaveProperty(
      "options",
    )
  })

  test("ajouter un modèle écrit toujours un libellé", () => {
    // Une entrée réduite à `{}` ne garantit pas la matérialisation de la clé après fusion : le
    // libellé sert aussi de preuve d'existence.
    expect(modelPatch("gateway", "  kimi-k2  ")).toEqual({
      provider: { gateway: { models: { "kimi-k2": { name: "kimi-k2" } } } },
    })
    expect(modelPatch("gateway", "kimi-k2", " Kimi K2 ")).toEqual({
      provider: { gateway: { models: { "kimi-k2": { name: "Kimi K2" } } } },
    })
  })

  test("un modèle sans identifiant ne s'écrit pas", () => {
    expect(modelPatch("gateway", "   ")).toBeUndefined()
    expect(modelPatch("  ", "kimi-k2")).toBeUndefined()
  })

  test("`discover` s'écrit dans les deux sens — c'est un booléen, pas un champ vide", () => {
    expect(discoverPatch("gateway", true)).toEqual({ provider: { gateway: { discover: true } } })
    // Décocher doit **écrire** `false` : ne rien envoyer laisserait la découverte active.
    expect(discoverPatch("gateway", false)).toEqual({ provider: { gateway: { discover: false } } })
  })

  test("la liste d'exclusions se remplace, y compris par une liste vide", () => {
    expect(blacklistPatch("gateway", ["kimi-k2"])).toEqual({ provider: { gateway: { blacklist: ["kimi-k2"] } } })
    // Vider la liste ne peut pas passer par une omission : c'est bien un tableau vide qu'il faut écrire.
    expect(blacklistPatch("gateway", [])).toEqual({ provider: { gateway: { blacklist: [] } } })
  })

  test("le formulaire de déclaration part avec son adaptateur, pas seulement avec son affichage", () => {
    // Défaut mesuré sur l'instance isolée : le champ montrait `@ai-sdk/openai-compatible` mais le
    // draft ne le portait pas, donc le fichier recevait `baseURL` seule — un fournisseur déclaré et
    // sans adaptateur, c'est-à-dire inutilisable. Ce que l'écran montre doit partir.
    const draft = newProviderDraft()
    expect(draft.npm).toBe(DEFAULT_NPM)
    const patch = providerPatch("iso", { npm: draft.npm, baseURL: draft.baseURL })
    expect(patch).toEqual({ provider: { iso: { npm: DEFAULT_NPM } } })
  })

  test("cocher/décocher ne laisse jamais de doublon", () => {
    expect(toggleModel(undefined, "kimi-k2", true)).toEqual(["kimi-k2"])
    expect(toggleModel(["kimi-k2"], "kimi-k2", true)).toEqual(["kimi-k2"])
    expect(toggleModel(["kimi-k2"], "kimi-k2", false)).toEqual([])
    expect(toggleModel(["a", "kimi-k2", "b"], "kimi-k2", true)).toEqual(["a", "b", "kimi-k2"])
    expect(toggleModel(["a"], "b", false)).toEqual(["a"])
  })
})
