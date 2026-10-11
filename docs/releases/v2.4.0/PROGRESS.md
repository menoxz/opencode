# PROGRESS — registre de statut (autorité unique)

Ce fichier est la **seule** source de vérité du statut des items de la v2.4.0.
`BACKLOG.md` décrit, `BASELINE.md` mesure : aucun des deux ne porte de statut.

## Vocabulaire de statut

| statut | sens |
|---|---|
| `TODO` | pas commencé |
| `SPEC` | fiche `items/H*.md` en cours de rédaction |
| `SPEC_DONE` | fiche complète, en attente de validation |
| `PASS` / `PWC` / `FAIL` | verdict du validateur indépendant |
| `IN_PROGRESS` | implémentation en cours |
| `IMPL_DONE` | correctif + test livrés, en attente de mesure |
| `MEASURED` | gain chiffré vs baseline consigné ci-dessous |
| `MERGED` | commit sur `dev` |
| `BLOCKED` | arrêté, raison en colonne |

## Tableau de bord

| id | item | priorité | vague | statut | validateur | commit | gain mesuré |
|---|---|---|---|---|---|---|---|
| H1 | un seul appel provider par round d'outils | 1 | D | TODO | — | — | — |
| H2 | cache de prompt explicite (openai-compatible) | 2 | B | TODO | — | — | — |
| H3 | préfixe système stable (hors volatils) | 3 | A | TODO | — | — | — |
| H4 | un seul spawn git par étape | 4 | C | TODO | — | — | — |
| H5 | mémoïser la découverte d'instructions | 5 | C | TODO | — | — | — |
| H6 | shell persistant | 6 | C | TODO | — | — | — |
| H7 | dédupliquer les injections de contexte | 7 | A | TODO | — | — | — |
| H8 | retry non destructif + garde-fous | 8 | D | TODO | — | — | — |

## Gates

| gate | critère | état |
|---|---|---|
| G0 | `BASELINE.md` rempli, mesures datées et figées | ouvert |
| G1 | 8 fiches `items/H*.md` complètes | à venir |
| G2 | ≥ 1 item `PASS` (validation indépendante) | à venir |
| G3 | typecheck exit 0 + tests verts pour chaque item implémenté | à venir |
| G4 | gain ≥ seuil d'acceptation de l'item, chiffré | à venir |
| G5 | binaire 2.4.0 déployé, `--version` vérifié — **accord opérateur requis** | à venir |

## Journal des décisions

| date | décision | par |
|---|---|---|
| 2026-10-11 | Création du programme. Ordre des vagues fixé : H3/H7 → H2 → H4/H5/H6 → H1/H8. H1 en dernier (plus fort gain, plus fort risque). | agent |
| 2026-10-11 | Gel des écritures SQLite par événement hors périmètre tant que la phase 4 ne les désigne pas comme coût dominant. | agent |
