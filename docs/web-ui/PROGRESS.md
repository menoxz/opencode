# PROGRESS — version web opencodev2

Seule autorité de statut du programme. `WORKFLOW.md` décrit, ce fichier constate.
Convention héritée de `docs/releases/v2.4.0/`.

État au 2026-10-12.

---

## Statut par phase

| phase | statut | gate | preuve |
|---|---|---|---|
| **P0** cadrage & surface API | **FAIT** | G0 ✅ | surface gelée ci-dessous |
| **P1** runtime sans build | **FAIT** (A1-A3 faits) | G1 ✅ | `RUNTIME-ARTIFACTS.md` §1-§3 |
| **P2** squelette UI | **FAIT** | G2 ✅ | `packages/webui`, preuve navigateur ci-dessous |
| **P3** sessions & projets | **FAIT** (réserve navigateur) | G3 ✅ | `packages/webui/src/app.tsx`, preuves ci-dessous |
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

**Bloquant découvert et confirmé (A1 fait)** : `packages/sdk/js/package.json:20-22` déclare
`"files": ["dist"]` alors que ses `exports` pointent vers `./src/*.ts`. Mesuré par
`bun pm pack --dry-run` dans `packages/sdk/js` (exit 0) : **7 fichiers, tous sous `dist/`,
aucun `src/`**. Le client que l'UI utilisera ne serait donc pas résolvable une fois installé.
Défaut antérieur à l'initiative web ; il bloque M2 tant qu'il n'est pas tranché.

**Migration de la base vérifiée (A2 fait)** : démarrage source avec `OPENCODE_DB` sur une base
neuve, puis lecture par `bun:sqlite` (exit 0) : **24 migrations appliquées**, 19 tables créées,
de `20260127222353_familiar_lady_ursula` à `20260816133346_part-time-created-index`. Les
migrations sont lues **depuis le disque** au runtime (`storage/db.ts:223-241`, `:268`), 24
fichiers pour 12 032 octets — un paquet de sources sans `migration/**` démarrerait « sain » avec
une base vide. Piège associé : le fichier `.db` ne fait que 4096 o à l'arrêt, tout le schéma
étant dans le `-wal` ; seule la lecture de la base fait preuve.

### Actions ouvertes

| # | action | phase | statut |
|---|---|---|---|
| A1 | ✅ **Fait** — `bun pm pack --dry-run` : 7 fichiers, `dist/` seul, aucun `src/` | P1 | **fait** |
| A2 | ✅ **Fait** — base neuve : 24 migrations appliquées, 19 tables créées | P1 | **fait** |
| A3 | ✅ **Fait** — documenté : M2 exige un `bun install` complet, les wasm viennent de `node_modules` | P1 | **fait** |
| A4 | Trancher le sort de `@opencode-ai/ui` (imports audio TUI) pour le paquet M2 | P2 | à faire |
| A5 | Surveiller la mort du serveur après une sonde SSE longue (port 4701) | P3 | à faire |

---

## P2 — squelette UI (G2 ✅)

Nouveau package `packages/webui` : Vite + SolidJS, client du SDK uniquement. Aucun import de
`@opencode-ai/ui` ni de `packages/app` — c'est la garde anti-dérive annoncée dans
`WORKFLOW.md` §7, et elle résout **A4** par conception : la question du sort des imports audio
de `@opencode-ai/ui` ne se pose pas, ce package n'est pas une dépendance de l'UI.

| fichier | rôle |
|---|---|
| `vite.config.ts` | proxy dev vers le backend, **pas** d'appel direct |
| `src/client.ts` | `createOpencodeClient`, résolution de l'URL serveur (env → localStorage → même origine) |
| `src/events.ts` | abonnement SSE `/event` via `EventSource`, état connecté/reconnexions |
| `src/app.tsx` | 3 zones : sessions, fil, flux d'événements |
| `src/styles.css` | thème sombre, tokens locaux |

**Choix structurant — proxy plutôt que CORS.** Le CORS du serveur est opt-in
(`server/cors.ts:19`, `opts?.cors?.includes(origin)`), donc une UI servie sur un autre port
serait refusée. Plutôt que d'ajouter une origine autorisée côté serveur — ce qui ferait entrer
l'UI dans la config du backend, contrairement à `WORKFLOW.md` §2 — le dev passe par un proxy
Vite : le navigateur ne parle qu'à `127.0.0.1:5180`, et le backend ignore l'existence de l'UI.

**Preuve G2 (navigateur, 2026-10-12)** — serveur source sur `4096`, UI dev sur `5180` :

- la page se charge, `#root` présent, `src/index.tsx` servi (200, 1561 o) ;
- `/global/health` **à travers le proxy** renvoie `{"healthy":true,"version":"local"}` ;
- l'UI affiche « SSE connecté », et le flux reçoit `server.connected` ;
- clic sur « Nouvelle session » : la session `ses_ecf758ef` apparaît dans la liste **et** le flux
  enregistre en direct `session.created` puis `session.updated` portant cet identifiant, avec des
  `server.heartbeat` intercalés — **sans rechargement de page**.

Le tour synthétique de G2 est donc franchi : les données viennent du SDK et les mises à jour
arrivent par SSE. Le composer s'affiche une fois une session sélectionnée.

**Réserves P2** :

- `EventSource` ne peut pas porter d'en-têtes : un serveur authentifié
  (`OPENCODE_SERVER_PASSWORD`) n'est pas supporté. Limite assumée, à traiter avant P6.
- Les types du SDK v2 sont aplatis (`{ sessionID, parts }`, pas de `path`/`body`) : trois appels
  ont dû être corrigés après le premier typecheck. À retenir pour P3/P4.
- Aucun test automatisé dans ce package : la vérification est manuelle et navigateur.

---

## P3 — sessions & projets (G3 ✅, avec réserve)

Quatre opérations ajoutées à `packages/webui/src/app.tsx` : recherche, renommage, suppression,
changement de répertoire de travail.

**Point d'architecture favorable** : chaque méthode du SDK accepte `directory` en paramètre de
requête (`sdk.gen.ts:3329,3371,3455,3519`) — changer de répertoire ne demande donc **pas** de
reconstruire le client. Le scope est passé à chaque appel (`scope()`), ce qui évite le piège
classique du client figé sur une origine.

### Preuves navigateur (serveur 4096, UI 5180)

| opération | preuve |
|---|---|
| création | session `ses_ecf6e0d4` apparaît dans la liste ; flux : `session.created` + `session.updated` |
| renommage | titre passé à « P3 renommage verifie », visible dans la liste ; flux : `session.updated` |
| recherche | `search=renommage` ne laisse qu'**une** ligne sur 17 — filtrage côté serveur |

### Preuves API (mêmes endpoints que l'UI)

Le bouton de suppression n'a **pas** pu être vérifié au navigateur — voir la réserve ci-dessous —
donc le chemin est prouvé sur l'API, que l'UI appelle à l'identique :

```
GET  /session/ses_ecf6e0d4…          -> titre="P3 renommage verifie"   (le renommage a persisté)
GET  /session?directory=C%3A%5Cjeanluc%5Copencode-fork -> 4 sessions   (le paramètre agit)
DELETE /session/ses_ecf6e0d4…        -> 200
GET  /session/ses_ecf6e0d4…          -> absente
GET  /session?search=renommage       -> 0 résultat
```

### Réserve : `window.confirm` bloquait l'automatisation

La première version demandait confirmation par `window.confirm`. Le clic a ouvert un dialogue
natif que l'outil de pilotage n'a pas pu fermer (`handle_dialog` n'était pas exposé dans cette
session) : l'onglet est resté **bloqué**, y compris après rechargement, navigation vers
`about:blank`, `Entrée` et `Échap`. Le dialogue survit au changement de page.

Correctif appliqué : confirmation **en ligne** (deux clics sur la ligne : « ✕ » puis
« confirmer » / « annuler »), sans dialogue natif. Ce n'est pas un contournement de test, c'est
le bon choix d'interface : un modal natif ne se style pas, ne s'internationalise pas et bloque
tout pilotage automatisé — y compris les tests e2e de P5.

**Conséquence honnête** : le parcours de suppression de bout en bout au navigateur n'a pas été
observé ; il est vérifié au niveau API. À rejouer au navigateur en P5, la cause du blocage ayant
disparu du code.

---

## Réserves ouvertes

- **F1** (P1, medium) : hypothèse « sources publiées exécutables » non vérifiée pour M2.
  Inventaire fait, exécution dans un paquet hors checkout pas encore faite.
- **F2** (P5, low) : budget de poids non mesuré. `/agent` à 1,27 Mo impose une stratégie.
- **F3** (P3, low) : cause de la mort du serveur sur 4701 après sonde SSE non établie.