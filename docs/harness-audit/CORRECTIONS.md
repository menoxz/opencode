# Corrections de l'audit initial

L'audit initial (`C:\Users\jeanl\AppData\Local\Temp\opencodev2\audit-harnais-rapport.md`)
et la matrice `README.md` contiennent des erreurs. Elles ont été détectées pendant la phase
de remédiation, par les agents eux-mêmes et leurs validateurs. Chacune est corrigée ici
avec sa preuve, parce qu'une citation fausse dans un rapport d'audit est plus coûteuse
qu'une absence de citation : elle oriente l'implémentation vers le mauvais fichier.

| id | affirmation initiale | statut | réel | source |
|---|---|---|---|---|
| C-01 | la barrière de clôture est dans `src/session/goal-contract.ts` | **FAUX — chemin inexistant** | `packages/opencode/src/tool/goal-contract.ts:609-628` | glob + F06-F1 |
| C-02 | P05 coûte « ~240 tokens de duplication pure par tour » | **INFIRMÉ par mesure** | gain réel **−35 caractères** : le bloc **grossit**, 348 → 383 | P05 + verdict P05 |
| C-03 | les flags `experimental.qa_proof_advisory` / `risk_planner_advisory` pilotent l'advisory | **FAUX** | ces clés n'existent pas ; `runtime-flags.ts:4` utilise `bool()`, pas `enabledByExperimental()` → `OPENCODE_EXPERIMENTAL=1` ne les active pas, défaut OFF | P05 |
| C-04 | `registry.ts:256` renvoie la sortie non tronquée, c'est un défaut | **FAUX — no-op** | `registry.ts:256` est un no-op ; `:253` ne couvre que les outils plugin. Le point de passage unique est `truncate.output` | P17 |
| C-05 | le plafond de 4 000 caractères vient de `truncate.ts` | **FAUX** | il vient de `terminal-output.ts:5/224` ; `truncate.ts` est inatteignable pour bash via `tool.ts:188-190` (défaut 50 102 o) | P09 |
| C-06 | « le type d'objectif est choisi par le modèle » | **directionnel juste, mécaniquement imprécis** | le champ s'appelle `deliverable`, il est **optionnel**, déduit par regex du texte libre de la mission (`inferDeliverable`, `goal-state.ts:116-129`), écrit en un seul point (`prompt.ts:2739`) et **laissé `undefined` par le chemin outils** — donc absent par défaut, pas seulement reformulable | P11 |
| C-07 | — | ajout | 8 tests échouent **avant** toute implémentation (`BASELINE.md`) | ligne de base |

## Conséquences sur la priorisation

**C-03 fait chuter P05.** Le défaut de duplication du DoD est réel dans le code, mais le
chemin d'activation (`risk_advisory`) est **éteint par défaut**. Ce n'est plus une correction
de premier rang : c'est une correction conditionnelle. Elle ne devient prioritaire que si
les flags sont activés, ce qui n'est le cas ni par défaut ni via `OPENCODE_EXPERIMENTAL`.

**C-06 aggrave P11.** Le problème est pire que décrit : non seulement le modèle peut
choisir un libellé favorable, mais le champ est **absent par défaut**. La règle qui ne
s'applique qu'aux « implementation objectives » ne protège donc presque jamais rien.

**C-02 invalide le chiffrage de P05.** Le correctif est plus rentable qu'annoncé pour une
mission longue (5 DoD longs : 836 → 383, soit −453 caractères), et **négatif** pour une
mission courte (1 DoD : 371 → 383). Le gain dépend donc de la longueur du DoD, pas du
nombre de tours : à chiffrer avant d'engager le correctif.

## Ce qui reste vrai de l'audit initial

Les mesures quantitatives sont inchangées et confirmées : `read.ts:357`, `read.ts:362`,
`repetition.ts:82-84`, le ratio sous-agent 84×, `cache_read` = 82 % du volume, 36 troncatures
sur 445 appels bash, 5 compactions, base de 5,2 Go. Les corrections ci-dessus portent sur
des **chemins** et des **chiffrages**, pas sur la **mécanique** des défauts.

## Méthode

Un validateur qui trouve une citation fausse dans une proposition doit la remonter comme
objection bloquante, et non comme une remarque. C'est ce qui a produit C-02 et C-03 : les
propositions P05 et P17 ont été mesurées avant d'être validées, pas après.