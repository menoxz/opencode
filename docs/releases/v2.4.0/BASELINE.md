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

## Latence locale (mesurée — phase 0, 2026-10-11)

Mesures prises sur cette machine, workdir `C:\jeanluc\opencode-fork`, 5 échantillons,
`Measure-Command`. La locale système sépare les décimales par une virgule ; les valeurs
sont normalisées en pointe ci-dessous.

| mesure | méthode | valeur |
|---|---|---|
| démarrage interpréteur `pwsh` | `pwsh -NoLogo -NoProfile -NonInteractive -Command "exit 0"` ×5 | **272,6 ms** (287,3 · 251,7 · 246,3 · 280,4 · 297,2) |
| démarrage interpréteur `cmd` | `cmd /d /c "exit 0"` ×5 | **20,7 ms** (32,4 · 16,6 · 17,1 · 19,4 · 18,1) |
| `git status --porcelain=v1` | ×5 dans le worktree | **75,7 ms** (90,3 · 77,1 · 68,3 · 69,1 · 73,9) |
| `git rev-parse HEAD` | ×5 | **42,1 ms** (50,4 · 40,7 · 40,9 · 38,5 · 39,8) |
| appels provider par round d'outils | par construction (`stopWhen = stepCountIs(1)`) | 1 par round (cible H1 : 1 pour N rounds) |
| base de session | `~/.local/share/opencodev2/opencode.db` | **1,65 Go** (11/10/2026 10:04), WAL 32 o au repos |

### Lecture

- Une commande shell paie **~272 ms** de démarrage pwsh contre ~21 ms pour cmd (13×).
  Référence de **H6** (shell persistant) : la rafale de 5 commandes vaut ~1,4 s de pur
  démarrage.
- Un `step` paie **deux** spawns git (75,7 + 42,1 ≈ **118 ms**) avant l'appel modèle.
  Référence de **H4** (un seul spawn git par étape).
- `opencode.db` pèse 1,65 Go : signal de rétention (cf. `docs/harness-audit` P08), hors
  périmètre v2.4.0 mais à surveiller.

### Non mesuré (assumé)

- **Temps synchrone pré-provider d'un step** : non instrumenté ; dérivable seulement d'une
  trace `SessionProcessor`. À instrumenter si un item le réclame (H5/H7 s'en passent).
- **Processus spawnés par tour à N étapes** : déduit de la lecture du code (2 spawns git +
  1 par commande shell), non compté dynamiquement.

## Mesures après implémentation (2026-10-11, items H1..H8 livrés)

Comparaison directe avec les mesures ci-dessus. Chaque ligne a un test nommé comme source.

| item | grandeur | avant | après | source |
|---|---|---|---|---|
| H1 | invocations `streamText` par tour à N rounds d'outils | N | **1** | `single-provider-call.test.ts` : `llm.calls == 3` pour N=3 steps chaînés, `assistantCount == 1` |
| H1 | requêtes HTTP proxy par tour | 3 (boucle) · 4 (hard-stop) | **2** · **2** | `processor-effect.test.ts` |
| H2 | point de cache explicite émis (provider openai-compatible) | aucun | **émis** | `prompt-cache-openai-compatible.test.ts` (232 pass) — **mock**, rejeu live non exécuté |
| H3 | identité du préfixe système entre deux tours | instable (horodatage + état MCP) | **octet-identique** | `system-prefix-stability.test.ts` (2 pass) |
| H4 | captures `write-tree` par tour à N étapes | ~2N | **≤ N+1** | `step-git-spawn.test.ts` (3 pass) · revert vérifié `revert-after-single-capture.test.ts` |
| H5 | appels disque de découverte des instructions | **160** | **76** | `instruction-discovery-cache.test.ts` (5 pass) |
| H6 | rafale de 5 commandes shell triviales | **1966 / 1933 / 2360 ms** | **75,6 ms** (test) · 325 ms (boucle) | `shell-session.test.ts` (6 pass) |
| H7 | injections de l'objectif / de la DoD par tour | 2 × / 2 × | **1 × / 1 ×** | `context-dedup.test.ts` (7 pass) |
| H8 | ouverture du stream sur erreur transitoire après émission | relancé depuis zéro (refacturé) | **1 seule ouverture**, texte `partial` conservé | `retry-non-destructive.test.ts` (4 pass) |

### Mesures en session réelle (artefact déployé 2.4.0, 2026-10-11)

Session headless `opencodev2 run` sur le binaire déployé (SHA `50FF265E…`, modèle
`opencode-go/deepseek-v4.1-flash`, 23,4 s, exit 0).

| item | grandeur | mesure réelle | verdict |
|---|---|---|---|
| H1 | invocations provider par tour à 3 rounds d'outils | **1 seul `stream.drained`** portant `step-start:3`, `tool-call:3`, `tool-result:3`, `step-finish:3`, `finish:1` | **CONFIRMÉ** — la boucle externe produisait trois invocations |
| H2 | cache de préfixe serveur | **3 072 / 3 109 tokens cachés**, identique avec et sans clé de cache | **clé NEUTRE** — le cache est automatique |
| H4 | processus `git write-tree` par tour | 3 étapes → **6 captures** (2N) | 2 étapes → **3 captures** (N+1) ; unitaire : 4 étapes → 5 | **CONFIRMÉ après correctif** — le défaut (2N) est reproduit puis corrigé, `processor.ts:706` consulte désormais le porteur |

Chaque ligne `tracking` du journal suit immédiatement un `git write-tree` réel
(`snapshot/index.ts:321-323`) : le comptage correspond donc bien à des spawns.

Artefacts : premier déploiement SHA `50FF265E…` (contenait le défaut H4) ; après correctif
`eb1fdbea8`, rebuild SHA `3746C8A2AFA324B7417860FB73394D80111B321FE89A5DE1267B94184CDC0FE`,
redéployé et revérifié en session réelle.

**Agrégat** — suite ciblée `goal-contract + registry + parameters` :
baseline **86 pass / 8 fail en 38,57 s** ⇒ après **92 pass / 4 fail en 28,3 s**.

Les 4 échecs résorbés étaient des échecs *par timeout* ; les accélérations les font passer.
Origine du delta **vérifiée** : les trois fichiers de cette suite ont un **diff vide** depuis
`89917b853` ⇒ aucun test n'a été affaibli ni supprimé. Les 4 échecs restants sont des
assertions préexistantes (`goal-contract` : `create_objectif` réponse structurée,
`edit_objectif` champs partiels ; `parameters` : `task` forme wire, `task` rejet de prompt
manquant) — hors périmètre v2.4.0.

**Non mesuré, assumé** :
- H2 : **rejeu live EXÉCUTÉ le 2026-10-11** contre `https://opencode.ai/zen/go/v1` avec
  `opencode-go/deepseek-v4.1-flash`. Le cache de préfixe du serveur est **automatique** : le
  contrôle négatif sans clé atteint le même résultat que le patch (A2 = B2 = **3 072 cachés /
  37 non cachés** sur 3 109). La clé explicite est donc **neutre** — H2 se réduit à H3, non
  faute de cache mais faute de gain mesurable. Prérequis découvert : l'endpoint exige
  l'en-tête `x-opencode-session`, sinon HTTP 400 `MissingSessionID` (ce qui rendait le rejeu
  muet et faisait conclure à tort que la voie était fermée).
- H3 / H7 : pas de comptage de tokens (le budget de tokens n'est pas instrumenté ici) ;
  l'effet est prouvé par identité d'octets et par compte d'injections.
- H1 : la preuve *individuelle* des quatre sites (`turn_plan`, `continuation`, `stall-watch`,
  compaction) reste un finding ouvert (`H1-four-site-proof`).
- H8 : axe 3 (doublon des couches retry) non traité.

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
