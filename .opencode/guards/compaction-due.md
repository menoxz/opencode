---
name: compaction-due
description: Rappelle de compacter quand le contexte est bien rempli
when:
  context_ratio: ">= 0.6"
limits:
  max_per_turn: 1
---
Le contexte est bien rempli : compacte maintenant plutôt que de continuer et perdre des décisions. Consigne l'objectif, les décisions prises et les fils ouverts ; ce qui n'est pas écrit sera perdu.
