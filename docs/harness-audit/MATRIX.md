# Matrice de remédiation — problème → proposition → verdict

Ce fichier ne porte **qu'une correspondance stable** : `id` → proposition → verdict.
Il n'est **pas** la source de vérité des statuts.

## Pourquoi cette réécriture

Les statuts, les comptes, les résidus `open`, les implémentations et les arbitrages ont été
**dupliqués** ici et dans `CLOSURE-MATRIX.md`, et les deux copies ont divergé :

- ce fichier affichait `—` en colonne « implémentation » pour les 20 lignes, alors que
  `CLOSURE-MATRIX.md` enregistre **6 implémentations mergées et mesurées** ;
- il se déclarait lui-même « source de vérité du suivi », ce qui rendait la copie périmée
  **prioritaire** sur la copie à jour.

Un registre qui annonce à faire ce qui est fait coûte plus cher qu'une absence de registre :
il envoie un agent implémenter du travail déjà mergé. C'est le motif sanctionné ailleurs dans
cet audit par **C-02**, **C-25** et **C-31** (« une citation fausse oriente vers le mauvais
fichier »), et c'est la raison d'être de cette réécriture.

## Règle

**Une donnée de statut n'est écrite qu'à un seul endroit.** Ici, on ne met qu'une flèche.

| question | où la lire |
|---|---|
| statut de revalidation, résidus `open`, implémentable ou non | [`CLOSURE-MATRIX.md`](./CLOSURE-MATRIX.md) |
| verdict de base d'une proposition | `verdicts/Pnn-verdict.md` |
| revalidation d'une proposition | `verdicts/Pnn-revalidation.md` |
| corrections de l'audit et découvertes | [`CORRECTIONS.md`](./CORRECTIONS.md) |
| règles d'orchestration du swarm | [`ORCHESTRATION-RULES.md`](./ORCHESTRATION-RULES.md) |
| contrat de rédaction et de verdict | [`PROPOSAL-TEMPLATE.md`](./PROPOSAL-TEMPLATE.md), [`VERDICT-TEMPLATE.md`](./VERDICT-TEMPLATE.md) |

## Correspondance `id` → proposition → verdict

| id | proposition | verdict |
|---|---|---|
| P01 | `proposals/P01-read-instruction-reminder.md` | `verdicts/P01-verdict.md` |
| P02 | `proposals/P02-signature-noise.md` | `verdicts/P02-verdict.md` |
| P03 | `proposals/P03-mcp-catalog-health-gate.md` | `verdicts/P03-verdict.md` |
| P04 | `proposals/P04-retry-after-unbounded.md` | `verdicts/P04-verdict.md` |
| P05 | `proposals/P05-dod-duplicated.md` | `verdicts/P05-verdict.md` |
| P06 | `proposals/P06-compaction-dod-loss.md` | `verdicts/P06-verdict.md` |
| P07 | `proposals/P07-subagent-contract.md` | `verdicts/P07-verdict.md` |
| P08 | `proposals/P08-retention-default.md` | `verdicts/P08-verdict.md` |
| P09 | `proposals/P09-bash-artifact-first.md` | `verdicts/P09-verdict.md` |
| P10 | `proposals/P10-token-estimation.md` | `verdicts/P10-verdict.md` |
| P11 | `proposals/P11-objective-type-gate.md` | `verdicts/P11-verdict.md` |
| P12 | `proposals/P12-redirection-path.md` | `verdicts/P12-verdict.md` |
| P13 | `proposals/P13-mutation-detection.md` | `verdicts/P13-verdict.md` |
| P14 | `proposals/P14-preview-tail-loss.md` | `verdicts/P14-verdict.md` |
| P15 | `proposals/P15-plugin-bridge-null.md` | `verdicts/P15-verdict.md` |
| P16 | `proposals/P16-output-path-regex.md` | `verdicts/P16-verdict.md` |
| P17 | `proposals/P17-output-cap-invariant.md` | `verdicts/P17-verdict.md` |
| P18 | `proposals/P18-eperm-spawn.md` | `verdicts/P18-verdict.md` |
| P19 | `proposals/P19-turn-plan-cost.md` | `verdicts/P19-verdict.md` |
| P20 | `proposals/P20-batch-first-doctrine.md` | `verdicts/P20-verdict.md` |

L'inventaire des questions ouvertes et des arbitrages opérateur a été retiré d'ici pour la
même raison : il était dupliqué et périmé. Il se lit dans `CLOSURE-MATRIX.md`.

> Légende historique, conservée parce qu'elle est citée par les verdicts :
> `PASS` · `PASS_WITH_CHANGES` (`PWC`) · `FAIL` · `REVALIDATED-*`.
> Une ligne de ce fichier n'est jamais un statut.
