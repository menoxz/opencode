# BASELINE — mesure de référence v2.4.0

À figer (gate G0) **avant** toute modification, puis à ne plus changer. Toute régression
se compare à cette page, jamais à zéro. Valeurs à compléter par la phase 0 : ici, seules
les mesures déjà obtenues pendant l'audit sont consignées, datées.

## Environnement

| grandeur | valeur |
|---|---|
| version harnais | `2.3.74` |
| modèle en service | `opencode-go/deepseek-v4.1-flash` |
| JEV guard | désactivé (`~/.config/opencodev2/opencode.jsonc:1301`) |
| JEV compaction / plan | activés |
| OS / shell | win32 / pwsh |
| date de gel | 2026-10-11 |

## Typecheck

```
cd packages/opencode && bun run typecheck
```
Attendu : **exit 0** (`tsgo --noEmit`). Jamais `tsc`.

## Tests ciblés (signal court, ~38 s)

```
cd packages/opencode
bun test --timeout 30000 ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts
```
Baseline connue (voir `docs/harness-audit/BASELINE.md`) : **86 pass / 8 fail**, 94 tests,
38,57 s. Les 8 échecs sont préexistants (assertions `goal-contract`, snapshots `parameters`,
hook `beforeEach` en timeout) — **ne pas les confondre avec une régression**.

> Les suites entières `./test/tool` et `./test/session` dépassent 240 s : inutilisables en
> synchrone, à réserver à un run de nuit.

## Tokens / contexte (par tour)

| mesure | valeur | source |
|---|---|---|
| plafond prompt au 1ᵉʳ tour (14/08) | 32 257 tokens | `session/prompt-budget.test.ts:4-8` |
| plafond constaté 2 jours après | 44 030 tokens (+37 %) | idem |
| part de sorties d'outils retirées par `replayToolOutputs:"summary"` | 70,9 % des octets | `context-rollout.ts:48` |
| coût d'une invalidation de bloc de cache | 202k tokens re-facturés/tour ($1,05) | commentaire `message-v2.ts:405-416` |
| coût d'une compaction (256k ctx) | ≈ 2,50 $, amorti après ~40 tours | commentaire `overflow.ts:15-20` |

## Latence locale (à instrumenter — phase 0)

Ces mesures ne sont **pas** encore prises : la phase 0 doit les produire avant G0.

| mesure | méthode | valeur |
|---|---|---|
| processus spawnés par tour à N étapes (`git`, shell) | compteur process / trace | à mesurer |
| temps mur de 5 commandes shell triviales (`pwsh`) | chrono | à mesurer |
| appels provider par round d'outils | journal session | à mesurer (attendu 1/round) |
| temps synchrone pré-provider d'un step | trace `SessionProcessor` | à mesurer |

## I/O base (hors périmètre initial, à surveiller)

| grandeur | valeur | source |
|---|---|---|
| transactions SQLite par événement | 1 (`behavior:"immediate"`) | `sync/index.ts:154-169` |
| accès SQLite par mise à jour de part | ~3-4 (SELECT + upsert + 2 UPDATE agrégats) | `projectors.ts:185-203` |
| PRAGMA | WAL · synchronous=NORMAL · busy_timeout=5000 | `storage/db.ts:255-259` |
| intervalle de checkpoint WAL | 5 min | `storage/maintenance.ts:28` |

## Pièges de mesure observés

- `bun test` via pipeline PowerShell déclenche `EPERM: uv_spawn 'cmd.exe'` : appeler par
  l'opérateur `&` avec redirection directe vers un fichier, sans `Out-File`.
- Un timeout de suite (5 s, si `--timeout` est omis) n'est pas un timeout d'outil : toujours
  passer `--timeout 30000`.
