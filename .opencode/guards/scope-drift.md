---
name: scope-drift
description: Rappelle la demande initiale quand un tour s'étire en travail non demandé
when:
  steps_in_turn: ">= 12"
limits:
  max_per_turn: 1
---
Ce tour s'est étiré bien au-delà de la demande. Relis la **dernière** demande de l'utilisateur : elle prime sur tout ce que tu as entrepris depuis. Termine ce qu'il a demandé, nomme le reste en une ligne, et ne poursuis pas de ton propre chef.
