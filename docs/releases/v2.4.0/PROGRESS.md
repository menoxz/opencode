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
| H1 | un seul appel provider par round d'outils | 1 | D | SPEC_DONE | à désigner | 8cf6c41a1 | — |
| H2 | cache de prompt explicite (openai-compatible) | 2 | B | SPEC_DONE | à désigner | aad479096 | — |
| H3 | préfixe système stable (hors volatils) | 3 | A | SPEC_DONE | à désigner | aad479096 | — |
| H4 | un seul spawn git par étape | 4 | C | SPEC_DONE | à désigner | 63f81d824 | — |
| H5 | mémoïser la découverte d'instructions | 5 | C | SPEC_DONE | à désigner | 63f81d824 | — |
| H6 | shell persistant | 6 | C | SPEC_DONE | à désigner | 37a84ac8e | — |
| H7 | dédupliquer les injections de contexte | 7 | A | SPEC_DONE | à désigner | 37a84ac8e | — |
| H8 | retry non destructif + garde-fous | 8 | D | SPEC_DONE | à désigner | 8cf6c41a1 | — |

## Gates

| gate | critère | état |
|---|---|---|
| G0 | `BASELINE.md` rempli, mesures datées et figées | **franchi 2026-10-11** |
| G1 | 8 fiches `items/H*.md` complètes | **franchi 2026-10-11** |
| G2 | ≥ 1 item `PASS` (validation indépendante) | à venir |
| G3 | typecheck exit 0 + tests verts pour chaque item implémenté | à venir |
| G4 | gain ≥ seuil d'acceptation de l'item, chiffré | à venir |
| G5 | binaire 2.4.0 déployé, `--version` vérifié — **accord opérateur requis** | à venir |

## Journal des décisions

| date | décision | par |
|---|---|---|
| 2026-10-11 | Création du programme. Ordre des vagues fixé : H3/H7 → H2 → H4/H5/H6 → H1/H8. H1 en dernier (plus fort gain, plus fort risque). | agent |
| 2026-10-11 | Gel des écritures SQLite par événement hors périmètre tant que la phase 4 ne les désigne pas comme coût dominant. | agent |
| 2026-10-11 | **G0 franchi.** Mesures de phase 0 prises : pwsh 272,6 ms vs cmd 20,7 ms ; git status 75,7 ms ; git rev-parse 42,1 ms ; `opencode.db` 1,65 Go. | agent |
| 2026-10-11 | Phase 1 ouverte : rédaction des 8 fiches `items/H*.md` (4 rédacteurs, 2 items chacun). | agent |
| 2026-10-11 | **G1 franchi.** 8 fiches écrites (H1 251 l., H2 289, H3 294, H4 261, H5 281, H6 204, H7 255, H8 217). Self-assessments : H3 `READY`, les 7 autres `NEEDS_REVIEW` avec incertitudes explicites. | agent |
| 2026-10-11 | Phase 2 ouverte : validation indépendante des 8 fiches. Les validateurs écrivent un fichier `verdicts/H*.md` ; l'orchestrateur consolide `PROGRESS.md` (évite l'écriture concurrente sur ce registre). | agent |
