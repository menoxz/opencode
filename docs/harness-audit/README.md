# Audit du harnais — remédiation

Contrat d'orchestration pour la transformation des 20 failles du harnais opencodev2
en correctifs implémentés.

## Contrat

1. **Un problème = un fichier de proposition.** Un agent rédacteur par problème.
   Il écrit exactement un fichier, au chemin de la matrice, et n'écrit rien d'autre.
2. **Un validateur indépendant par proposition.** Il n'a pas rédigé la proposition.
   Il statue et écrit exactement un fichier de verdict, au chemin de la matrice.
3. **Gabarit imposé.** `PROPOSAL-TEMPLATE.md` et `VERDICT-TEMPLATE.md` sont normatifs :
   un fichier qui ne suit pas les 9 sections (respectivement 6) est rejeté.
4. **Tout fichier doit citer `fichier:ligne`.** Une affirmation sans citation est invalide.
   Une inférence doit être marquée `INFERE:` avec sa méthode de vérification.
5. **Livraison par artefact.** Le fichier est la preuve. Un résumé en message final qui
   n'est pas écrit sur disque est considéré comme non livré.

## Matrice problème → proposition → verdict

| id | problème | fichier principal | proposition | verdict |
|---|---|---|---|---|
| P01 | `AGENTS.md` fichier-scoped réinjecté dans chaque résultat de lecture | `src/tool/read.ts:357` | `proposals/P01-read-instruction-reminder.md` | `verdicts/P01-verdict.md` |
| P02 | `description` dans la clé de signature rend `FAILURE_LIMIT` inatteignable | `src/tool/repetition.ts:82` | `proposals/P02-signature-noise.md` | `verdicts/P02-verdict.md` |
| P03 | outils MCP dont la readiness a échoué restent au catalogue | `src/session/tools.ts:64` | `proposals/P03-mcp-catalog-health-gate.md` | `verdicts/P03-verdict.md` |
| P04 | `Retry-After` non borné à 24,8 j ; erreur sans compteur d'essai | `src/session/retry.ts:25` | `proposals/P04-retry-after-unbounded.md` | `verdicts/P04-verdict.md` |
| P05 | DoD réémis deux fois par tour (`task-contract` + `risk_advisory`) | `src/session/prompt.ts:2458` | `proposals/P05-dod-duplicated.md` | `verdicts/P05-verdict.md` |
| P06 | résumé de compaction sans section DoD/findings, troncature silencieuse à 10 | `src/session/compaction.ts:55` | `proposals/P06-compaction-dod-loss.md` | `verdicts/P06-verdict.md` |
| P07 | sous-agents : schéma laxiste, aucun contexte, aucun budget, pas de cwd | `src/tool/task.ts:52` | `proposals/P07-subagent-contract.md` | `verdicts/P07-verdict.md` |
| P08 | purge des parts désactivée par défaut sur une base de 5,2 Go | `src/storage/maintenance.ts:50` | `proposals/P08-retention-default.md` | `verdicts/P08-verdict.md` |
| P09 | `bash` : 71 % des appels, 36 troncaturesDont 35 irrécupérables | `src/tool/bash` | `proposals/P09-bash-artifact-first.md` | `verdicts/P09-verdict.md` |
| P10 | `CHARS_PER_TOKEN` global + cliff `readHeavy` à 20k | `src/session/overflow.ts:7` | `proposals/P10-token-estimation.md` | `verdicts/P10-verdict.md` |
| P11 | barrière anti-clôture conditionnée au type d'objectif choisi par le modèle | `src/tool/goal-contract.ts:519` | `proposals/P11-objective-type-gate.md` | `verdicts/P11-verdict.md` |
| P12 | cible de redirection jamais résolue en fichier | `src/tool/shell.ts:114` | `proposals/P12-redirection-path.md` | `verdicts/P12-verdict.md` |
| P13 | mutation de fichier détectée par liste fixe de commandes | `src/tool/shell.ts:42` | `proposals/P13-mutation-detection.md` | `verdicts/P13-verdict.md` |
| P14 | `preview()` ne conserve que la queue au-delà de 30k | `src/tool/shell.ts:237` | `proposals/P14-preview-tail-loss.md` | `verdicts/P14-verdict.md` |
| P15 | pont plugin nullable déréférencé | `src/plugin/index.ts:359` | `proposals/P15-plugin-bridge-null.md` | `verdicts/P15-verdict.md` |
| P16 | chemin de fichier reconstruit par regex depuis du contenu non fiable | `src/tool/truncate.ts:30` | `proposals/P16-output-path-regex.md` | `verdicts/P16-verdict.md` |
| P17 | deux plafonds de sortie coexistent sans invariant | `src/tool/truncate.ts:15` | `proposals/P17-output-cap-invariant.md` | `verdicts/P17-verdict.md` |
| P18 | le correctif EPERM ne couvre que le lanceur git, pas le spawn shell | `packages/core/src/process.ts:13` | `proposals/P18-eperm-spawn.md` | `verdicts/P18-verdict.md` |
| P19 | `turn_plan` : 0,70 appel par étape, coût de planification non borné | `src/session/prompt.ts` | `proposals/P19-turn-plan-cost.md` | `verdicts/P19-verdict.md` |
| P20 | `inspect_batch` sous-exploité ; `AGENTS.md` contredit la doctrine globale | `src/session/prompt.ts` | `proposals/P20-batch-first-doctrine.md` | `verdicts/P20-verdict.md` |

## État d'avancement

| vague | étape | statut |
|---|---|---|
| 1 | rédaction des 20 propositions | en cours |
| 2 | validation indépendante des 20 propositions | à venir |
| 3 | correction des propositions non PASS | à venir |
| 4 | implémentation des propositions validées | à venir |

## Suite de ce programme

La remédiation des 20 failles ci-dessus traite la **justesse et le coût de contexte**.
Elle est distincte du chantier de **performance d'exécution** (goulots indépendants de la
vitesse du modèle : conflits de requêtes, travail synchrone, cache de prompt, I/O), qui vit
dans [`../releases/v2.4.0/`](../releases/v2.4.0/README.md) — 8 items `H1..H8`, mêmes règles
de livraison par artefact et de validation indépendante.