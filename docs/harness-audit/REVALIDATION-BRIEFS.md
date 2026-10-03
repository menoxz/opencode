# Briefs de revalidation — vague 3b

## Contrat commun

Tu es le **revalidateur** de la proposition dont l'identifiant est donné dans ta requête.
Tu es indépendant : tu n'as ni rédigé la proposition initiale, ni son verdict, ni sa
révision.

1. **Lis** `docs/harness-audit/REVISIONS.md` pour situer la chaîne complète.
2. **Lis** `docs/harness-audit/proposals/<ID>-<slug>.md` — c'est la version **révisée**.
3. **Lis** `docs/harness-audit/verdicts/<ID>-verdict.md` — les objections de la vague 2.
4. **Vérifie** que **chaque** `Required changes` a été traité. Point par point, avec
   citation du code qui prouve le traitement.
5. **Tranche** le statut final : `PASS` | `PASS_WITH_CHANGES` | `FAIL`.

## Le test qui compte

Un revalidateur qui se contente de relire le verdict initial ne fait aucun travail utile.
Ta valeur est dans ce que le validateur précédent **n'a pas vu** :

- une objection qu'il a formulée mais que la révision a traitée de façon superficielle ;
- une **conséquence nouvelle** de la révision (un correctif qui casse autre chose) ;
- une affirmation de la révision qui n'est **pas vérifiable** dans le code ;
- un `Required changes` traité au lieu d'être contredit — dans ce cas, **tranche** : la
  contradiction était-elle juste ? Une objection fausse se refuse, avec sa preuve.

## Règle de sortie

Écris **un seul** fichier :
`docs/harness-audit/verdicts/<ID>-revalidation.md`

Sections obligatoires, dans cet ordre littéral :

```
## Proposal
## Revisions applied
## Status
## Remaining objections
## Regressions introduced
## Final verdict
```

`## Final verdict` doit contenir exactement une des trois chaînes :
`REVALIDATED-PASS` | `REVALIDATED-PASS_WITH_CHANGES` | `REVALIDATED-FAIL`.

Un `REVALIDATED-PASS` exige que **toutes** les objections de la vague 2 soient traitées
**et** qu'aucune nouvelle objection ne soit levée. En pratique, un `REVALIDATED-PASS`
sur une proposition qui avait des objections majeures est un signal d'alerte : vérifie
deux fois avant de l'écrire.

## Interdictions

- N'écris aucun fichier sous `packages/**`.
- N'exécute aucune commande `git`.
- N'écris aucun autre fichier que le tien.

## Grille de effort pour la vague 4

Ta dernière section doit dire, en une ligne par item :

| item | effort | fichier principal | test à écrire | casser un test existant ? |

La colonne « casser un test existant » est obligatoire : elle indique le fichier de test
à relire avant de patcher, ou `aucun` si le chemin est propre. C'est ce tableau qui
déterminera l'ordre d'implémentation de la vague 4.