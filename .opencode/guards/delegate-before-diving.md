---
name: delegate-before-diving
description: Rappelle la délégation quand un tour accumule des appels d'outils
when:
  tool_calls_in_turn: ">= 8"
limits:
  max_per_turn: 1
---
Ce tour enchaîne les appels d'outils sans avoir arbitré. Si la suite est une exploration large, délègue à un sous-agent avec un périmètre de fichiers et un critère de sortie ; sinon, dis en une ligne pourquoi tu continues seul.
