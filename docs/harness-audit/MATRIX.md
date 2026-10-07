# Matrice de remédiation — problème → proposition → verdict → implémentation

Source de vérité du suivi. Regenerable ; toute ligne sans verdict est en vol.

## Légende

- `—` : pas encore reçu
- `PWC` : `PASS_WITH_CHANGES` — correctible sans reprise de conception
- `PASS` : livrable en l'état
- `FAIL` : à reprendre

## État au dernier point

- **propositions** : 20 / 20 ✅
- **verdicts** : 7 / 20 en cours
- **validateurs lancés** : 20 (P01→P20)
- **verdicts reçus** : tous `PASS_WITH_CHANGES` à ce stade — aucun `FAIL`, aucun `PASS` sans réserve

## Matrice

| id | proposition | verdict | statut | implémentation |
|---|---|---|---|---|
| P01 | `proposals/P01-read-instruction-reminder.md` | `verdicts/P01-verdict.md` | — | — |
| P02 | `proposals/P02-signature-noise.md` | `verdicts/P02-verdict.md` | — | — |
| P03 | `proposals/P03-mcp-catalog-health-gate.md` | `verdicts/P03-verdict.md` | **PWC** | — |
| P04 | `proposals/P04-retry-after-unbounded.md` | `verdicts/P04-verdict.md` | **PWC** | — |
| P05 | `proposals/P05-dod-duplicated.md` | `verdicts/P05-verdict.md` | **PWC** | — |
| P06 | `proposals/P06-compaction-dod-loss.md` | `verdicts/P06-verdict.md` | **PWC** | — |
| P07 | `proposals/P07-subagent-contract.md` | `verdicts/P07-verdict.md` | — | — |
| P08 | `proposals/P08-retention-default.md` | `verdicts/P08-verdict.md` | — | — |
| P09 | `proposals/P09-bash-artifact-first.md` | `verdicts/P09-verdict.md` | — | — |
| P10 | `proposals/P10-token-estimation.md` | `verdicts/P10-verdict.md` | **PWC** | — |
| P11 | `proposals/P11-objective-type-gate.md` | `verdicts/P11-verdict.md` | — | — |
| P12 | `proposals/P12-redirection-path.md` | `verdicts/P12-verdict.md` | — | — |
| P13 | `proposals/P13-mutation-detection.md` | `verdicts/P13-verdict.md` | — | — |
| P14 | `proposals/P14-preview-tail-loss.md` | `verdicts/P14-verdict.md` | — | — |
| P15 | `proposals/P15-plugin-bridge-null.md` | `verdicts/P15-verdict.md` | — | — |
| P16 | `proposals/P16-output-path-regex.md` | `verdicts/P16-verdict.md` | — | — |
| P17 | `proposals/P17-output-cap-invariant.md` | `verdicts/P17-verdict.md` | **PWC** | — |
| P18 | `proposals/P18-eperm-spawn.md` | `verdicts/P18-verdict.md` | — | — |
| P19 | `proposals/P19-turn-plan-cost.md` | `verdicts/P19-verdict.md` | **PWC** | — |
| P20 | `proposals/P20-batch-first-doctrine.md` | `verdicts/P20-verdict.md` | — | — |

## Corrections de l'audit déjà issues de cette phase

Voir `CORRECTIONS.md`. Sept entrées : chemin de `goal-contract.ts` faux, gain P05
mesuré négatif, flags advisory inexistants (défaut OFF), `registry.ts:256` no-op,
plafond 4 000.o attribué au mauvais fichier, `deliverable` absent par défaut, 8 tests
rouges préexistants.

## Questions ouvertes qui bloquent l'implémentation

Aucune n'est bloquante pour démarrer : chaque proposition porte un correctif de repli
identifié par son auteur. Les quatre qui demanderont un arbitrage humain :

1. **P08** — accepter qu'une installation standard supprime les sorties d'outils de
   plus de 90 jours, sans archive ni export ?
2. **P11** — un DoD d'implémentation rédigé en termes d'observation doit-il bloquer sur
   un `critical` résiduel ? Si oui, il faut typer les DoD (effort L + migration).
3. **P14** — la conservation de la tête d'un aperçu est-elle livrable sans filtre de
   secrets sur le chemin `handle.all` → `preview()` → `metadata.output` ? Le validateur
   doit trancher avant implémentation.
4. **P09 / P17** — qui possède l'invariant « la sortie complète existe sur disque » :
   `shell.ts` ou `terminal-output.ts` ?