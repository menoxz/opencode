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

## Règle d'implémentabilité (vague 4) — replacement de la clause ci-dessus

La clause « aucune nouvelle objection ne subsiste » est **abrogée** : elle rend l'état final
inatteignable par construction, puisqu'une objection résiduelle même tracée et acceptée
rétrograde automatiquement. Mesure : sur 5 revalidations, 0 atteint `REVALIDATED-PASS`
(P02, P06, P10, P18 = `REVALIDATED-PASS_WITH_CHANGES` ; **P11 = `REVALIDATED-FAIL`**).

L'implémentabilité ne dépend plus de l'**existence** d'un résidu mais de son **statut**.
Classe **chaque** objection restante dans `## Remaining objections` avec l'un de :

| statut | sens | implémentable ? |
| --- | --- | --- |
| `open` | non traitée, ou traitée de façon seulement superficielle | ❌ **bloquant** |
| `out_of_scope` | hors périmètre décidé, justification écrite | ✅ |
| `accepted` | traitée quant au fond, avec une réserve assumée et tracée | ✅ |
| `refused` | objection du validateur **demontrée fausse**, avec la preuve | ✅ |

Règles :
1. `REVALIDATED-PASS_WITH_CHANGES` **est implémentable** si et seulement si **aucun** résidu
   n'est `open`, et si la section `## Regressions introduced` déclare explicitement
   qu'aucun test **vert** n'est cassé. Un test déjà rouge qui casse davantage reste un `open`.
2. `REVALIDATED-FAIL` reste non implémentable, quelle que soit la classification : il signale
   des Required changes **intacts**, pas des résidus.
3. Un résidu `open` unique suffit à interdire l'implémentation. Ne le requalifie pas en
   `accepted` pour débloquer : un validateur l'a écrit, il faut le lever explicitement.
4. La section `## Remaining objections` doit porter **le statut en tête de chaque ligne**.
   Une objection sans statut est traitée comme `open`.

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