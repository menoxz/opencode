---
name: edit-anchor-unique
description: Rappelle de vérifier l'unicité d'une ancre avant d'éditer un fichier
when:
  tool_calls:
    edit: ">= 2"
limits:
  max_per_turn: 1
---
Avant d'éditer, vérifie que l'ancre est unique et assez large pour ne pas tomber dans un bloc voisin. Une ancre courte (`})`, `}`) s'insère n'importe où : j'ai déjà cassé un fichier de test comme ça. Si l'ancre est ambiguë, réécris le fichier entier plutôt que de rapiécer.
