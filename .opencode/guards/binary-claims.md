---
name: binary-claims
description: Rappelle qu'on ne prouve pas le contenu d'un binaire par lecture ni par horodatage
when:
  path_match: ["**/dist/**", "**/bin/**", "**/*.exe"]
limits:
  max_per_turn: 1
---
Tu touches un artefact compilé : n'affirme pas ce qu'il contient. Un build réussi et un horodatage postérieur ne prouvent pas l'embarquement du dernier commit, et un scan de chaînes ne prouve rien non plus. Vérifie par `--version` et par empreinte SHA256, ou par un comportement observable.
