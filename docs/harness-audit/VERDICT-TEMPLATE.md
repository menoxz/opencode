# Gabarit imposé — verdict de validation

Un fichier de verdict par proposition, écrit par un agent validateur qui n'a PAS
participé à la rédaction. Section obligatoire, ordre littéral.

## Proposal

`<Pxx>` + titre court + chemin du fichier de proposition validé.

## Validator

Identifiant du validateur, et declaration : `independent` (n'a pas rédigé la proposition).

## Status

Exactement un : `PASS` | `PASS_WITH_CHANGES` | `FAIL`.

## Checks

Tableau, une ligne par verification, avec la preuve :

| check | resultat | preuve |
|---|---|---|
| citations fichier:ligne exactes et verbatim | ok / KO | `fichier:ligne` |
| le correctif supprime vraiment la cause | ok / KO | ... |
| le correctif ne casse pas un comportement existant | ok / KO / non-testé | test concerné |
| tests proposés sont exécutables dans ce dépôt | ok / KO | ... |
| effort et coût annoncés réalistes | ok / KO | ... |

## Objections

Pour chaque `KO`, l'objection doit citer le code qui la prouve et dire quoi changer.
Une objection sans citation de code est invalide.

## Required changes

Liste numérotée des corrections obligatoires. Vide si `PASS`.

## Implementation guidance

Précisions pour la phase d'implémentation : ordre des patches, piège connu, fichier de test
à créer ou modifier. Une ou deux phrases.