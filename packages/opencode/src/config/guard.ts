export * as ConfigGuard from "./guard"

import { Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"

/**
 * Réglages des garde-fous injectables — spec : `specs/injectable-guards.md`.
 *
 * Volontairement pauvre : cinq clés, aucune condition. Les seuils de déclenchement vivent dans le
 * fichier de la garde, pas ici — deux endroits qui disent la même chose finissent toujours par se
 * contredire, et c'est celui qu'on ne relit pas qui gagne.
 *
 * Toutes les clés sont optionnelles : sans bloc `guards`, le comportement est celui des valeurs par
 * défaut du service, donc un fork existant ne change pas de conduite en mettant à jour.
 */
export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean).annotate({
    description: "Disable every guard in one place without deleting the files.",
  }),
  max_per_step: Schema.optional(PositiveInt).annotate({
    description: "Hard cap on the number of guards injected in a single step (default 2).",
  }),
  max_chars: Schema.optional(PositiveInt).annotate({
    description: "Hard cap on the characters injected by guards in a single step (default 600).",
  }),
  disable: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Guard names to switch off, so a file can stay on disk while muted.",
  }),
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Extra guard folders, same form as skills.paths.",
  }),
}).annotate({
  identifier: "ConfigGuard",
})

export type Info = Schema.Schema.Type<typeof Info>
