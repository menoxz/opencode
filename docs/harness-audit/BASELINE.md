# Ligne de base de validation

État du dépôt **avant** toute implémentation issue de cet audit. Toute régression
doit être comparée à cette page, pas à zéro.

## Typecheck

```
cd packages/opencode && bun typecheck
```

**exit 0** — aucun diagnostic TypeScript. Signal fiable et rapide (< 5 s).

## Tests unitaires ciblés

Signal le plus court disponible pour l'implémentation : les suites de répertoires
entiers (`bun test ./test/tool`, `./test/session`) **dépassent 240 s** et sont
inutilisables en synchrone. Périmètre ciblé qui termine en ~38 s :

```
cd packages/opencode
bun test ./test/tool/goal-contract.test.ts ./test/tool/registry.test.ts ./test/tool/parameters.test.ts
```

### Résultat de référence : **86 pass / 8 fail**, 94 tests, 38,57 s, 4 snapshots en échec

Ces 8 échecs sont **préexistants** et ne doivent pas être confondus avec des
régressions :

| # | test | nature |
|---|---|---|
| 1 | `tool.goal-contract > create_objectif creates goalState with structured response` | échec d'assertion |
| 2 | `tool.goal-contract > edit_objectif updates only provided fields` | échec d'assertion |
| 3 | `tool parameters > JSON Schema (wire shape) > apply_patch` | snapshot |
| 4 | `tool parameters > JSON Schema (wire shape) > edit` | snapshot |
| 5 | `tool parameters > JSON Schema (wire shape) > task` | snapshot |
| 6 | `tool parameters > JSON Schema (wire shape) > write` | snapshot |
| 7 | `tool parameters > task > rejects missing prompt` | échec d'assertion |
| 8 | `(unnamed)` | `beforeEach/afterEach hook timed out` (5 056 ms) |

### Conséquences directes sur le swarm d'implémentation

- **P07** touche `task.ts` → le test 7 (`task > rejects missing prompt`) et le
  snapshot 5 (`JSON Schema (wire shape) > task`) portent sur le schéma qu'il propose
  de changer avec `Schema.Union`. Toute modification du schéma `task` doit mettre à
  jour ces deux snapshots **ou** justifier leur changement.
- **P11** touche `goal-contract.ts` → les tests 1 et 2 sont déjà rouges. La baseline
  de `goal-contract.test.ts` doit être mesurée séparément avant/après, sinon une
  régression y sera invisible.
- Les 4 snapshots en échec indiquent un décalage entre la forme JSON Schema émise et
  la forme attendue : c'est un signal préexistant, pas une cible.

## Piège observé pendant l'audit

`bun test` via un pipeline PowerShell déclenchait `EPERM: operation not permitted,
uv_spawn 'cmd.exe'`. Contournement utilisé : appel par l'opérateur `&` avec
redirection directe vers un fichier, sans `Out-File`. Cet échec est **le défaut P18
qui se reproduit en direct** ; il n'est pas un artefact de la ligne de base.

## Journal

| mesure | valeur |
|---|---|
| typecheck | exit 0, < 5 s |
| tests ciblés (3 fichiers) | 94 tests, 86 pass / 8 fail, 38,57 s |
| suite `./test/tool` entière | > 240 s, inutilisable en synchrone |
| suite `./test/session` entière | > 240 s, inutilisable en synchrone |