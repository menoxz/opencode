---
name: two-failures-change-form
description: Rappelle de changer de forme après deux échecs plutôt que de réessayer
when:
  error_streak: ">= 2"
limits:
  max_per_turn: 1
---
Deux échecs consécutifs : la forme de la commande est en cause, pas son contenu. Change de FORME (redirection au lieu de pipe, variables renommées, autre outil) au lieu de rejouer la même ligne en espérant un autre résultat.
