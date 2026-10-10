# Briefs de révision — vague 3

## Contrat commun (obligatoire)

Tu es l'agent de **révision** de la proposition dont l'identifiant est donné dans ta
requête. Tu n'as pas rédigé la proposition initiale, et tu n'as pas écrit le verdict.

1. **Lis** `docs/harness-audit/verdicts/<ID>-verdict.md` en entier.
2. **Lis** `docs/harness-audit/proposals/<ID>-<slug>.md` en entier.
3. **Lis** `docs/harness-audit/PROPOSAL-TEMPLATE.md` — les 9 sections sont normatives.
4. **Corrige** la proposition en appliquant **chaque** `Required changes` du verdict.
5. **Réécris le fichier de proposition** au même chemin. Ne crée aucun autre fichier.
6. Ne modifie **aucun** fichier source `packages/**`.
7. Ne committe pas : 20 agents écrivent en parallèle, l'index git est sous contention.
   Laisse le fichier `??` ou modifié sur disque.

Une objection du validateur est une **affirmation vérifiable**. Avant de l'appliquer,
vérifie-la dans le code. Si elle est fausse, ne l'applique pas : écris ton refus et sa
preuve dans la section 5 « Alternatives considered ». Un validateur qui a tort doit être
contredit, pas obéi.

## Exigences de qualité

- Toute affirmation doit citer `fichier:ligne`.
- Un chiffre non mesuré porte le marqueur `INFERE:` et sa méthode de vérification.
- Si la proposition **change de périmètre**, dis-le dans le titre et dans le résumé : ne
  laisse pas un titre qui promet ce que le corps ne fait pas.
- Le statut `Effort` doit être honnête. Un correctif qui touche une couche d'analyse
  AST n'est pas un `S`.

## Cas particuliers — ces 6 ne sont pas des corrections cosmétiques

| id | nature du travail |
|---|---|
| **P04** | 3 objections **majeures**. Le validateur démontre que le plafonnement casse un cas nominal du dépôt (quota journalier `GoUsageLimitError`, `retry.ts:96-127`) et que le compteur `attempt 10/10` est arithmétiquement faux — le test écrit échouerait. **Reprends la conception**, ne corrige pas les chiffres. Le budget doit être en nombre de tentatives, pas en millisecondes. |
| **P08** | Le validateur **renverse R1** : pas de purge par défaut. Refais la proposition en opt-in + census chiffré, isole R3 (compaction) dans une proposition distincte, et passe l'effort à `L`. |
| **P11** | Verdict `FAIL`. Reprise complète. Cause racine : `deliverable` est optionnel et **absent par défaut** (`inferDeliverable`, `goal-state.ts:116-129`). Corrige le titre, traite l'auto-déverrouillage `out_of_scope`, reclasse l'effort. |
| **P18** | La prémisse du mandat est **fausse** : le retry couvre déjà `pwsh.exe` (`shell.ts:354` → `registry.ts:153/583` → `cross-spawn-spawner.ts:284-298`). Le défaut réel est un budget doublé et une erreur non actionnable. Reformule, ou referme en argumentant. |
| **P19** | L'hypothèse « plans répétés » est **réfutée par la base** : 4 846 plans distincts sur 4 863 déclarations (0,16 % de doublons). Le critère de test est invalide (dénominateur réduit par le patch). Réécris ou_argumente que ne rien changer est le verdict défendable. |
| **P06** | Corrige le chemin `goal-contract.ts` en tête, borne la dégradation des findings `open` avec un marqueur chiffré, et qualifie l'effort selon que l'accès à `goalState` dans `processCompaction` existe ou non. |

## Résultat attendu

Chaque proposition révisée doit être **auto-suffisante** : un agent d'implémentation doit
pouvoir la lire et écrire le patch sans rouvrir le verdict. Toute information présente
uniquement dans le verdict doit être **repliée dans la proposition**.

Marque en tête du fichier, sous le titre :

```
> Révisé après verdict `<STATUT>`. Corrections appliquées : <n>/<m>.
```