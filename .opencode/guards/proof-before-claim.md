---
name: proof-before-claim
description: Rappelle qu'une affirmation de succès exige une commande et son code de sortie
when:
  tool_calls_in_turn: ">= 6"
limits:
  max_per_turn: 1
---
Avant d'écrire « corrigé », « vert » ou « déployé », cite la commande exécutée et son code de sortie. Un chiffre lu après un pipe est le code du filtre, pas celui de la commande : rediriger vers un fichier et lire `$LASTEXITCODE` sur la ligne de la commande.
