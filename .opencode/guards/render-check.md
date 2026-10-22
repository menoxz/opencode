---
name: render-check
description: Garde de contrôle, déclenchée à la demande pour valider l'affichage des tirs
when:
  since_last_tokens: ">= 0"
limits:
  min_steps_between: 3
---
Test de rendu : la garde `render-check` a tiré. Ce bloc ne sert qu'à vérifier que le fil affiche bien `🛡 guard: workspace/render-check`. Aucune action attendue de ta part.
