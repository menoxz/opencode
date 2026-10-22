import { Effect, Layer } from "effect"
import { Guard } from "../../src/guard"

/**
 * Gardes vides pour les tests.
 *
 * `SessionPrompt.layer` capture `Guard.Service` à sa construction (`prompt.ts:367`) : tout
 * test qui compose `SessionPrompt` doit donc fournir le service, sinon chaque prompt échoue
 * avec « Service not found: @opencode/Guard ». Le défaut du harnais n'était pas le manque de
 * gardes mais l'absence du service — 142 occurrences sur 77 tests (mesuré 2026-10-22).
 *
 * Stub volontairement inerte : aucun garde chargé, aucune erreur, révision stable. Un test
 * qui veut observer un garde fournit sa propre couche au lieu d'utiliser celle-ci.
 *
 * Les types de retour sont laissés à l'inférence de `satisfies Guard.Interface` : les
 * alias `CompiledGuard` et `GuardError` ne sont pas exportés par `src/guard`.
 */
export const empty = Layer.succeed(
  Guard.Service,
  {
    all: () => Effect.succeed([]),
    get: (_name: string) => Effect.succeed(undefined),
    errors: () => Effect.succeed([]),
    summary: () => Effect.succeed({ global: [], project: [] }),
    reload: () => Effect.succeed(0),
    revision: () => Effect.succeed(0),
  } satisfies Guard.Interface,
)
