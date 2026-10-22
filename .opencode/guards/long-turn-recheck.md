---
name: long-turn-recheck
description: Rappelle l'état réel quand un tour s'est éloigné de la consigne initiale
when:
  since_last_tokens: ">= 40000"
limits:
  min_steps_between: 5
---
Ce tour a consommé beaucoup de contexte depuis le dernier rappel. Reviens à la demande initiale et vérifie l'état réel (commande, test, fichier) avant d'affirmer qu'un point est traité.
