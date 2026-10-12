# PROGRESS — version web opencodev2

Seule autorité de statut du programme. `WORKFLOW.md` décrit, ce fichier constate.
Convention héritée de `docs/releases/v2.4.0/`.

État au 2026-10-12.

---

## Statut par phase

| phase | statut | gate | preuve |
|---|---|---|---|
| **P0** cadrage & surface API | **FAIT** | G0 ✅ | surface gelée ci-dessous |
| **P1** runtime sans build | **EN COURS** | G1 ⏳ (partiel) | `RUNTIME-ARTIFACTS.md` §1 |
| **P2** squelette UI | à faire | G2 | — |
| **P3** sessions & projets | à faire | G3 | — |
| **P4** outils & permissions | à faire | G4 | — |
| **P5** poids & robustesse | à faire | G5 | — |
| **P6** livraison | à faire | G6 | — |

---

## P0 — surface API gelée (G0 ✅)

Mesurée sur le serveur réel le 2026-10-12, port 4702, aucun build préalable.

| endpoint | statut | taille | usage UI |
|---|---|---|---|
| `GET /global/health` | 200 | 34 o | pastille de statut |
| `GET /global/config` | 200 | 19 080 o | préférences globales |
| `GET /global/event` | 200 | `text/event-stream` | événements globaux |
| `GET /event` | 200 | `text/event-stream` | événements d'instance |
| `GET /agent` | 200 | 1 272 853 o | catalogue d'agents |
| `GET /config` | 200 | 156 041 o | config projet + agents |
| `GET /session` | 200 | 22 931 o | liste des sessions |
| `GET /path` | 200 | 211 o | racine / cwd |
| `GET /mode` | 200 | 2 884 o | modes de permission |

Ancrage : `groups/global.ts:63-65,74,83,92,112` · `groups/event.ts:5-19` ·
`sdk/js/src/v2/client.ts:47-89`.

Deux réserves qui pèsent sur la conception de l'UI :

1. **`version: "local"`** en mode source (le versionnement est fixé au build par
   `script/build.ts:19-20`). L'UI ne doit pas afficher la version serveur comme un identifiant
   de build.
2. **`/agent` pèse 1,27 Mo** non compressés. C'est le principal poste de poids du budget P5 :
   la compression HTTP et un chargement paresseux ne sont pas optionnels.

---

## P1 — runtime sans build (G1 partiellement franchie)

**Acquis** : `bun --conditions=browser packages/opencode/src/index.ts serve --port 4702` démarre
sans build et sert l'API. SSE `/event` et `/global/event` deliver `text/event-stream` avec
l'événement `server.connected`. Détail et réserves : `RUNTIME-ARTIFACTS.md`.

**Bloquant découvert** : `packages/sdk/js/package.json:20-22` déclare `"files": ["dist"]` alors
que ses `exports` pointent vers `./src/*.ts`. Un tarball du SDK publié aujourd'hui serait donc
inutilisable — et toute l'UI en dépend. À vérifier par `bun pm pack --dry-run` (A1).

**Réserve de sûreté** : les migrations SQL sont lues **depuis le disque** au runtime
(`storage/db.ts:223-241`), 24 fichiers pour 12 032 octets. Un paquet de sources sans
`migration/**` démarre « sain » mais crée une base vide. La gate G1 doit donc compter les
migrations appliquées, pas seulement lire `healthy:true` (A2).

### Actions ouvertes

| # | action | phase | statut |
|---|---|---|---|
| A1 | `bun pm pack --dry-run` sur le SDK, vérifier `src/` vs `dist/` | P1 | à faire |
| A2 | Exiger `migration/**` et compter les migrations appliquées dans la gate | P1 | à faire |
| A3 | Documenter que M2 exige un `bun install` complet (wasm depuis `node_modules`) | P1 | à faire |
| A4 | Trancher le sort de `@opencode-ai/ui` (imports audio TUI) pour le paquet M2 | P2 | à faire |
| A5 | Surveiller la mort du serveur après une sonde SSE longue (port 4701) | P3 | à faire |

---

## Réserves ouvertes

- **F1** (P1, medium) : hypothèse « sources publiées exécutables » non vérifiée pour M2.
  Inventaire fait, exécution dans un paquet hors checkout pas encore faite.
- **F2** (P5, low) : budget de poids non mesuré. `/agent` à 1,27 Mo impose une stratégie.
- **F3** (P3, low) : cause de la mort du serveur sur 4701 après sonde SSE non établie.