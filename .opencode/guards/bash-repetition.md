---
name: bash-repetition
description: Rappelle de changer de forme quand la même commande est rejouée
when:
  repeat_action: ">= 2"
limits:
  max_per_turn: 1
---
La même commande vient d'être rejouée à l'identique : elle ne donnera pas un autre résultat. Change de FORME (redirection au lieu de pipe, autre syntaxe, autre outil) ou explique pourquoi ce second essai diffère du premier.
