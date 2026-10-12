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
| **P3** sessions & projets | **FAIT** | G3 ✅ | `packages/webui/src/app.tsx` ; suppression vérifiée par CDP |
| **P4** outils & permissions | **FAIT** | G4 ✅ | rendu testé ; aller-retour live observé en P5 |
| **P5** poids & robustesse | **FAIT** | G5 ✅ | mesures et verdict de reconnexion ci-dessous |
| **P6** livraison | **FAIT** | G6 ✅ | commande unique + mode hors checkout vérifié |

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
| A1 | ✅ **Fait et corrigé** — `files` inclut `src` ; import vérifié hors dépôt | P1 | **fait** |
| A2 | ✅ **Fait** — base neuve : 24 migrations appliquées, 19 tables créées | P1 | **fait** |
| A3 | ✅ **Fait** — documenté : M2 exige un `bun install` complet, les wasm viennent de `node_modules` | P1 | **fait** |
| A4 | ✅ **Résolu par conception** — l'UI n'importe pas `@opencode-ai/ui` ; M2 livre tout le workspace, donc les imports audio TUI restent intacts | P2 | **fait** |
| A5 | ✅ **Résolu** — la « mort » du serveur était le shell expiré qui emportait son arbre de processus, pas un défaut serveur (confirmé en P5) | P3 | **fait** |

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

**Conséquence à l'époque** : le parcours de suppression de bout en bout au navigateur n'avait pas
été observé ; il était vérifié au niveau API seulement.

**Vérifié depuis, par CDP** (voir la section « Vérifications par CDP » plus bas) : le parcours
complet est observé, et il confirme que le dialogue natif n'existe plus.

### Vérifications par CDP — méthode

Le pilote navigateur du harnais se connecte au CDP **déjà actif**, c'est-à-dire au navigateur réel
de l'utilisateur, et `browser_use` — l'outil qui permettrait de le basculer sur une instance
isolée — n'est pas exposé dans toutes les sessions. Plutôt que de renoncer ou de polluer le
navigateur de l'utilisateur, l'instance isolée est pilotée **directement par le protocole CDP** :
`fetch http://127.0.0.1:9222/json/list` → `webSocketDebuggerUrl` de l'onglet → WebSocket →
`Runtime.evaluate`. Consigné dans `AGENTS.md`.

Deux pièges rencontrés : `DOM.getDocument` est refusé par cette instance (⇒ construire un `File`
dans la page et déclencher `change`), et le composeur n'existe qu'une fois une session sélectionnée
(⇒ sélectionner d'abord, sinon `composerPresent: false`).

### Parcours de suppression de session — observé (dernier point de P3 fermé)

Session de test créée avec un titre identifiable, puis parcours rejoué dans le navigateur :

| étape | observation |
|---|---|
| liste chargée | la session de test y figure (20 lignes) |
| clic sur la ligne | sélection effectuée |
| **clic sur ✕** | **aucun dialogue natif** ; les boutons `confirmer` et `annuler` apparaissent en ligne |
| clic sur « confirmer » | session retirée : 20 → 19 lignes, `stillThere: false`, aucune erreur |
| contrôle serveur | `GET /session/{id}` → absente |

**Le blocage de P3 est définitivement levé** : ce qui bloquait n'était pas la suppression mais le
dialogue natif, et la confirmation en ligne le remplace sans perte d'ergonomie. Aucune réserve ne
subsiste sur ce parcours.

---

## P4 — outils & permissions (G4 ✅)

Deux ajouts : le rendu des appels d'outils dans le fil, et le panneau d'accord/refus de
permission.

### Contrat réel, relevé et non supposé

| élément | source | forme |
|---|---|---|
| `ToolState` | `types.gen.ts:574-629` | 4 statuts : `pending`, `running`, `completed`, `error` |
| `PermissionRequest` | `types.gen.ts:178-191` | `id`, `sessionID`, `permission`, `patterns[]`, `always[]`, `metadata` |
| événements | `types.gen.ts:2885-2897` | `permission.asked` (properties = `PermissionRequest`), `permission.replied` (properties = `{sessionID, requestID, reply}`) |
| réponse | `sdk.gen.ts:3080` | `permission.reply({ requestID, reply: "once" \| "always" \| "reject" })` |

Détail qui compte : `permission.asked` porte `id`, mais `permission.replied` porte `requestID`.
Le retrait se fait donc sur `requestID`, pas sur `id` — une erreur facile à ne pas voir.

### Décision structurante : extraire la logique en TypeScript pur

`src/view-model.ts` contient les décisions (libellé et titre d'état, contenu du panneau de
détail, réducteur de permissions, actions proposées) ; `app.tsx` ne fait que les afficher.

Raison, et c'est un obstacle réel rencontré : **Bun exige `jsx: "react-jsx"` pour exécuter un
fichier contenant du JSX, Vite exige `jsx: "preserve"`** (c'est `vite-plugin-solid` qui compile).
Les deux ne peuvent pas cohabiter dans un même `tsconfig.json`. Plutôt que de tordre la config de
build pour faire passer un test, tout ce qui mérite d'être vérifié vit en TypeScript sans JSX.

Bénéfice secondaire : les composants deviennent minces, et P5 hérite d'une base testable.

### Preuves

```
bun test   -> 10 pass, 0 fail, 24 expect() calls
bun run typecheck -> exit 0
```

Les tests couvrent : les 4 libellés d'état, le titre présent seulement pour `running`/`completed`,
le panneau de détail qui n'affiche jamais de bloc vide, l'ajout/non-duplication/retrait des
permissions, l'ignorance d'un événement malformé, et l'absence du bouton « toujours » quand le
serveur n'a proposé aucun motif.

Contre-épreuve sur données réelles : la session `ses_f1df9427cffez2wIJPDPTdwZVH` contient
7 parties outil dont un `question` en `error` et un `turn_plan` en `completed` — le cas mixte
visé par le rendu.

### État au moment de P4 — et sa résolution

**Au moment de P4, l'aller-retour live d'une permission (demande affichée → refus → accord) n'avait
pas été observé.** La base ne contenait aucune permission en attente (`GET /permission` → 0), et le
navigateur de pilotage était **bloqué par le dialogue natif** laissé par le code P3 :
`navigate`, `press_key` et `take_snapshot` échouaient tous avec « A dialog is open ».

Ce qui était établi alors : le contrat des événements, la logique de décision (par test), et le
rendu des outils sur des données réelles (par l'API).

**Résolu en P5** — l'aller-retour complet a été observé sur navigateur isolé, refus puis accord,
avec propagation dans le fil. Voir la section « G4 — l'aller-retour de permission, enfin observé ».
Ce paragraphe est conservé comme trace de l'état initial, pas comme réserve ouverte.

**G4 est désormais franchie** : l'aller-retour live a été observé en P5, sur un navigateur
isolé (voir la section P5). Ce qui suit décrit l'état au moment de P4 et la cause du blocage.

**Cause du blocage, levée en P5** : `browser_ensure` réutilisait un CDP déjà actif — celui du
navigateur **natif** de l'utilisateur, pollué par le dialogue de P3 — et ignorait le profil
`isolated` demandé. La parade a été de lancer une instance Chrome dédiée sur un port CDP libre
(9222) puis de basculer le pilote avec `browser_use target=9222`.

---

## P5 — poids & robustesse (G5 ✅)

### Poids, mesuré et non estimé

`bun run --cwd packages/webui build` (vite 7.1.4), exit 0 :

| fichier | brut | gzip |
|---|---|---|
| `index.html` | 0,4 ko | 0,26 ko |
| `assets/index-*.css` | 5,2 ko | 1,50 ko |
| `assets/index-*.js` | 67,4 ko | 16,45 ko |
| **total utile** | **73,0 ko** | **18,2 ko** |

Budget de `WORKFLOW.md` §4 : premier rendu utile < 150 ko compressés, bundle total < 400 ko.
**Respecté avec une marge d'un facteur 8** (18,2 ko contre 150 ko).

**Défaut trouvé et corrigé** : le build produisait une sourcemap de **392 ko** — six fois le
poids du bundle — destinée à être expédiée en production. `vite.config.ts` passe désormais
`sourcemap: mode !== "production"`. Vérifié après correction : `maps: 0`.

### Robustesse — le test a révélé un vrai défaut

Protocole : UI saine, puis arrêt **du seul backend** (Vite laissé vivant), puis redémarrage.

| étape | observation |
|---|---|
| backend tué, +12 s | pastille santé → « serveur injoignable » (sonde 10 s) ; **pastille SSE restait « SSE connecté »** |
| backend redémarré | la pastille SSE restait « connecté » mais **aucun événement neuf n'arrivait plus** |
| permission demandée pendant cette fenêtre | **panneau invisible**, alors que `GET /permission` renvoyait 1 |
| rechargement manuel | panneau affiché aussitôt (le montage relit `/permission`) |

**Défaut** : après une coupure, l'UI se déclarait connectée tout en étant sourde, et une
permission demandée pendant l'interruption ne remontait jamais — un échec silencieux sur un
mécanisme bloquant. Cause : l'UI ne s'abonnait qu'aux événements, sans resynchroniser à la
reconnexion ; le proxy Vite masquait en outre la rupture côté `EventSource`.

**Correctif** : sur transition déconnecté → connecté, l'UI relit `/permission` et la liste des
sessions (`app.tsx`, handler `onState`). Un événement manqué pendant la coupure est ainsi rattrapé.

**Vérifié en P6** : le scénario coupure → reconnexion automatique a été rejoué après le correctif,
sur le serveur unique (l'UI est servie par le serveur, plus de proxy). Serveur tué → « SSE
déconnecté » et « serveur injoignable » ; serveur redémarré → « SSE connecté » avec un **nouvel**
événement `server.connected`, sans rechargement. La réserve est levée ; détail en section P6.

### G4 — l'aller-retour de permission, enfin observé

Sur navigateur isolé, avec un fichier sonde inerte `tmp-perm-test.env` (aucun secret réel) et la
règle serveur `read: {"*.env": "ask"}` :

| étape | preuve |
|---|---|
| demande live | panneau affiché **sans rechargement** ; flux : `permission.asked` `per_130b3d05a001…`, motif `packages\webui\tmp-perm-test.env`, `always: ["*"]` |
| **refus** | `GET /permission` → 0 ; l'outil `read` passe en `error` avec « The user rejected permission to use this specific tool call. » |
| **accord** | panneau affiché par SSE ; clic « Autoriser une fois » → l'outil `read` passe en `completed` et sa sortie contient le contenu du fichier |

**G4 est franchie** : « une permission refusée puis accordée s'affiche dans le fil ».

### Réserve navigateur, désormais documentée

`browser_ensure` **ignore le profil demandé** dès qu'un CDP est déjà actif : il s'est connecté au
navigateur natif de l'utilisateur (port 9223) et a répondu `isolated` sans effet. Parade qui
fonctionne : lancer une instance dédiée
(`chrome.exe --remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\McpBrowserProfiles\chrome`)
puis `browser_use target=9222`.

**Piège à retenir** : ne jamais laisser un `window.confirm` dans du code destiné à être piloté ;
le dialogue a survécu au rechargement, à `about:blank`, à `Entrée` et à `Échap`, et n'était
fermable par aucun outil disponible.

### Couverture de test — réserve levée

La réserve initiale était : les tests couvraient `view-model.ts` mais **pas les composants**.
Elle est levée. État final : **22 tests, 2 fichiers, exit 0** — 10 sur la logique de décision,
12 sur le rendu réel des composants (montage dans un DOM jsdom).

Deux obstacles ont dû être franchis, et les deux sont mesurés :

**1. Bun ne peut pas exécuter de JSX ici.** Bun exige `jsx: "react-jsx"`, Vite exige
`jsx: "preserve"` ; les deux ne partagent pas un `tsconfig`. J'ai tenté
`bun test --tsconfig-override tsconfig.test.json`, deux fois, avec un fichier en `extends` puis
autonome : Bun signale un « directory mismatch » sur l'override et continue de résoudre
`react/jsx-dev-runtime`. **Bun ignore donc l'override pour le source JSX.** D'où le passage à
**Vitest**, qui réutilise le transform JSX de Vite et fait disparaître le conflit par
construction — c'est aussi l'outil standard pour un projet Vite.

**2. `vite-plugin-solid` seul casse la suite.** Bissection : config minimale → 10 tests passent ;
même config **plus `plugins: [solid()]`** → échec sur
`Cannot find module '@testing-library/jest-dom/vitest'`, **même pour un fichier sans JSX ni DOM**.
Le plugin attend ce paquet : l'installer satisfait l'import (`@testing-library/jest-dom@7.0.1`),
et fournit au passage les matchers DOM.

**3. Le HMR de Solid casse le rendu.** Une fois le point 2 réglé :
`TypeError: … Received 'file:///@solid-refresh'` — solid-refresh injecte un module que le runner
ne peut pas résoudre comme nom de fichier. Corrigé par `solid({ hot: mode !== "test" })` :
le rafraîchissement à chaud reste actif en développement, désactivé sous Vitest.

Les composants ont été extraits dans `src/components.tsx` (`ToolCall`, `PermissionPanel`) —
présentationnels, sans accès au client ni aux signaux — précisément pour être testables.
`app.tsx` ne fait plus que les câbler.

---

## P6 — livraison (G6 ✅)

### Ce qui a été construit

Le serveur ne savait servir que les assets embarqués au build ou **un proxy vers `UI_UPSTREAM`**
(`ui.ts:78-108`) : aucun moyen de servir une UI locale. Trois ajouts :

| fichier | ajout |
|---|---|
| `src/effect/runtime-flags.ts` | drapeau `webUiDir` ← `OPENCODE_WEB_UI_DIR` |
| `src/server/shared/ui.ts` | `serveDirectoryUIEffect` + `resolveWithinRoot` |
| `src/server/routes/instance/httpapi/server.ts:188` | passe `webUiDir` à `serveUIEffect` |
| `script/web.ts` | lanceur : construit l'UI si absente, puis démarre le serveur |
| `package.json` | `bun run web` (et `--rebuild`) |

Précédence : dossier explicite > assets embarqués > proxy. Un dossier demandé est une intention
explicite de l'opérateur ; il ne doit pas être silencieusement ignoré.

### Preuves

```
GET /                        -> 200  text/html      393 o   (#root présent)
GET /assets/index-*.js       -> 200  text/javascript 68 996 o
GET /une/route/inconnue      -> 200  index.html     (repli SPA)
GET /assets                  -> 200  index.html     (un dossier n'est pas un fichier)
```

Traversée de chemin, trois formes encodées, testées avec `curl --path-as-is` :

```
/%2e%2e%2f%2e%2e%2fWindows/win.ini -> 200 393 o | fuite=False
/..%2f..%2fWindows%2fwin.ini       -> 200 393 o | fuite=False
/%2e%2e/%2e%2e/Windows/win.ini     -> 200 393 o | fuite=False
```

Les trois retombent sur `index.html` : la traversée est refusée, et le contenu de `win.ini`
n'apparaît jamais. Le 200 est le repli SPA, pas une fuite — c'est vérifié sur le corps, pas sur
le code de statut.

### Bug trouvé et corrigé pendant la livraison

Première version : `GET /` renvoyait **500 sans corps ni trace**. Cause : pour `/`, le chemin
résolu est le dossier `dist` lui-même ; `existsSafe` renvoie vrai (un dossier existe), puis
`readFile` sur un dossier produit un défaut non typé. Corrigé en traitant les dossiers comme
« pas un fichier » et en garantissant qu'aucune lecture ne peut plus remonter en 500 : toute
lecture impossible retombe sur `index.html`, et un `index.html` illisible donne un 404.

### Réserve de P5 levée : reconnexion SSE observée

Scénario rejoué, serveur unique (l'UI est servie par le serveur, plus de proxy) :

| étape | observation |
|---|---|
| serveur tué, +15 s | « SSE déconnecté », « serveur injoignable », « connexion perdue, nouvelle tentative… » |
| serveur redémarré, +20 s | **« SSE connecté »** et un **nouvel** `server.connected` dans le flux, sans rechargement |

L'UI se réabonne seule et resynchronise. La réserve de P5 est levée.

### A1 — corrigé, et la correction est prouvée

`packages/sdk/js/package.json` déclarait `"files": ["dist"]` alors que ses `exports` pointent vers
`./src/*.ts` : le tarball publié ne contenait pas ce que ses propres `exports` annonçaient.

Correction : `files` inclut désormais `src`. Vérifié que `src` est autonome — aucun import vers
`@opencode-ai/*` ni remontée hors de `src` (seule dépendance externe : `cross-spawn`, déclarée).

Preuve, par `bun pm pack` puis installation **hors du dépôt** :

```
Total files: 46  (src/** inclus)      Packed size: 112,33 KB
$ bun add opencode-ai-sdk-1.15.10.tgz --cwd <temp>
installed @opencode-ai/sdk@…tgz — 7 packages installed
$ bun run probe.ts
IMPORT OK, createOpencodeClient = function
```

Avant la correction, cet import échouait. Le défaut était antérieur à l'initiative web.

### A1 — correction d'une affirmation trop rapide sur la publication

J'ai d'abord écrit que « tant que le paquet SDK n'est pas republié sur npm, un consommateur externe
installera l'ancienne version cassée », en laissant entendre que le fork disposait d'un chemin de
publication pour ce paquet. **C'est faux, et la lecture le montre.**

`packages/opencode/script/publish-fork.ts` publie exclusivement le scope `@lux-tech/opencode-ai` :

| ce qu'il publie | source |
|---|---|
| `@lux-tech/opencode-ai-<plateforme>` | `dist/opencode-*/` contenant un binaire (lignes 27-70) |
| `@lux-tech/opencode-ai` (méta) | `dist/opencode/` (lignes 72-126) |

Les seuls `npm publish` du dépôt sont à ses lignes 59 et 115, tous deux dans ce scope. Le SDK
s'appelle `@opencode-ai/sdk` — **un autre scope**, jamais mentionné par le script, consommé
uniquement en `workspace:*` par `packages/opencode`, `packages/webui` et la racine.

**Conséquence, en trois points :**

1. **A1 n'a jamais affecté la publication de ce fork** : le défaut était réel dans le dépôt
   (le paquet était incohérent avec ses propres `exports`), mais aucun flux de ce dépôt ne
   publiait ce paquet.
2. **La correction n'exige donc aucune action de publication de notre part.** Il n'y a pas de
   « republier le SDK » à attendre : ce dépôt ne l'a jamais publié.
3. **Ce qui reste hors de notre contrôle** : si `@opencode-ai/sdk` est publié, c'est en amont,
   par le projet d'origine. Notre correction est locale à ce dépôt.

**Ce que cela change pour l'initiative web** : rien sur le fond — M2 passe par une copie de
sources, pas par le SDK publié. Le tableau de bord est simplement plus exact : il n'y a pas de
dette de publication à traiter ici.

### M2 — le mode hors checkout, vérifié

`WORKFLOW.md` §3 supposait qu'un paquet de sources suffirait. **C'est faux, et c'est mesuré** :
`packages/opencode` est `"private": true` et dépend de six paquets internes en `workspace:*`
(`core`, `llm`, `plugin`, `sdk`, `ui`, `script`). Le publier seul est impossible — aucun de ces
paquets n'est publié. M2 passe donc par une **copie complète des sources**, pas par un paquet.

Procédure vérifiée de bout en bout, hors du dépôt git :

```
robocopy <dépôt> <cible> /E /XD node_modules .git dist .artifacts
bun install --cwd <cible>      -> 2305 packages installed, exit 0, 153 s
bun run script/web.ts          -> construit l'UI sur place, puis sert
```

Résultat observé sur la copie (port 4097) :

```
HEALTH M2 OK {"healthy":true,"version":"local"}
[web] interface servie depuis …\opencode-web-m2\packages\webui\dist
GET / => 200  text/html  393 o   (#root présent)
```

Le serveur démarre et sert l'UI **sans dépôt git** : c'est le critère de G6. Coût mesuré : 153 s
d'installation, ~3,1 Go pour la copie complète — à savoir avant de promettre M2 comme léger.

**G6 est franchie.** Ce qui suit décrit l'état antérieur, conservé pour la trace.

### Historique — pourquoi M2 était bloqué

A1 rendait le SDK inutilisable une fois publié, donc tout paquet qui en dépendait. Traiter A1
était le préalable ; c'est fait, et M2 est livré par copie de sources.

---

## Non-régression large — vérifiée, échecs antérieurs prouvés

`AGENTS.md` impose de relancer **toutes** les suites voisines après une vague d'implémentation, pas
seulement la suite ciblée (précédent v2.4.0 : H1 avait rendu actif un défaut dormant de H4, visible
seulement dans `step-git-spawn.test.ts`). Ce chantier avait modifié `server/shared/ui.ts`,
`effect/runtime-flags.ts` et le routeur httpapi ; je n'avais lancé que `httpapi-ui.test.ts`.

### Mesure

```
bun test --timeout 30000 test/server test/flag
-> 288 tests, 256 pass, 17 skip, 15 fail   (165 s)
```

### Les échecs ne sont pas de ce chantier — prouvé, pas supposé

Les 15 échecs touchaient le middleware d'autorisation, le middleware d'erreur, mcp, provider et
`project.initGit` — aucun fichier que j'ai modifié. Une impression ne suffit pas, donc :

1. **Relance isolée** des 4 fichiers concernés : les échecs persistent hors parallélisme
   (7 échecs ; les 8 autres du lot étaient donc des effets d'ordonnancement).
2. **Retour temporaire** de mes trois fichiers serveur au commit parent `3929a26eb`
   (`git checkout 3929a26eb -- <fichiers>`), puis relance des mêmes 4 fichiers :

| fichier | avec mes modifications | sans mes modifications |
|---|---|---|
| `httpapi-authorization.test.ts` | 8 pass / 1 fail | **8 pass / 1 fail** |
| `httpapi-error-middleware.test.ts` | 0 pass / 4 fail | **0 pass / 4 fail** |
| `httpapi-instance-context.test.ts` | 7 pass / 1 fail | **7 pass / 1 fail** |
| `project-init-git.test.ts` | 1 pass / 1 fail | **1 pass / 1 fail** |

**Comptes identiques.** Les modifications ont ensuite été restaurées (`git checkout HEAD --`),
arbre de travail propre. Conclusion : **aucune régression introduite par ce chantier.**

### Ce que sont ces échecs antérieurs

Ils sont **dépendants de l'environnement**, pas du code. Indice net relevé dans
`project-init-git.test.ts` : l'endpoint renvoie `worktree: "C:\Users\jeanl"` et `id: "global"`
là où le test attend un bac à sable temporaire et un identifiant dérivé — l'isolation du test ne
tient pas dans cet environnement. `httpapi-error-middleware.test.ts` échoue 4 fois sur 4, ce qui
suggère une dépendance structurelle du même ordre.

**Ils ne sont pas traités ici** : ce sont des défauts préexistants du dépôt, hors du périmètre de
l'initiative web, et les corriger demanderait de comprendre leur dépendance d'environnement. Ils
sont signalés pour qu'ils ne soient pas attribués à ce chantier plus tard.

---

## Lot suivant — pièces jointes (livré)

Le manque identifié pour qu'un agent généraliste soit utilisable au quotidien. Contrat **relevé**,
pas inventé : une pièce est une partie de message `{ type: "file", mime, filename, url }`
(`packages/sdk/js/src/v2/gen/types.gen.ts:2126`), et `url` porte une **data URL** — c'est ce que
fait l'app existante (`packages/app/src/components/prompt-input/build-request-parts.ts:188-192`,
`url: attachment.dataUrl`, construite par `FileReader.readAsDataURL`).

### Ce qui a été livré

| fichier | rôle |
|---|---|
| `src/attachments.ts` | décisions **pures** : bornes par type, validation, libellés de taille, construction de la partie |
| `src/attachments.test.ts` | 16 cas sur ces décisions |
| `src/app.tsx` | lecture des fichiers (`FileReader`), liste des pièces en attente, retrait, envoi, rendu dans le fil |
| `src/styles.css` | vignettes, tailles, input fichier masqué |

**Choix de conception** : la partie pure est isolée du DOM, comme `view-model.ts` en P4. `FileReader`
reste dans le composant ; tout ce qui décide (borne applicable, refus, libellé) est testable sans
navigateur.

**Détail qui aurait cassé un test** : l'input fichier est masqué par une **classe** (`.hidden-input`)
et non par un attribut `style="display:none"`. Un input absent du rendu n'est pas remplissable par
un outil de pilotage — c'est exactement le piège qui avait bloqué P4 avec `window.confirm`.

**Autre détail** : `input.value` est remis à zéro après chaque sélection, sinon attacher deux fois
le même fichier ne déclenche aucun `change` et la seconde pièce n'apparaît jamais.

### Preuve

```
vitest run     -> 4 fichiers, 52 tests, exit 0   (+16 pour ce lot)
tsgo --noEmit  -> exit 0
vite build     -> exit 0
```

Poids après ce lot : **74,15 ko brut / 18,32 ko compressés** pour le JS, 1,74 ko pour le CSS —
soit **20,1 ko compressés** au total, contre un budget de 150 ko. Le lot coûte ~1,9 ko compressés.

### Vérification du contrat contre le serveur réel (faite)

Le contrat est la partie que j'avais **déduite en lisant le code** — donc la plus susceptible
d'être fausse. Vérifiée contre le serveur réel, session de test créée puis supprimée :

```
POST /session                                    -> 204 session créée
POST /session/{id}/prompt_async
  parts = [ {type:"text",…}, {type:"file", mime:"image/png",
             filename:"pj-test.png", url:"data:image/png;base64,…"} ]
                                                 -> 204
GET  /session/{id}/message
  partie stockée : type=file mime=image/png filename=pj-test.png
                   url commence par « data:image/png;base64, » : True
                   url longueur 118 (préservée à l'octet près)
                   id attribué par le SERVEUR : prt_1311fb3b9001UuGi66PWN0m10T
```

**Le serveur accepte la partie et l'attribue lui-même son `id`** — ce qui confirme que le choix de
ne pas en envoyer côté client était le bon, et pas seulement plausible.

### Vérification du parcours d'envoi — observée par CDP (réserve levée)

**Le parcours complet a été observé dans un vrai navigateur**, sur le Chrome isolé, en pilotant
l'instance **directement par le protocole CDP** (`Runtime.evaluate` sur le WebSocket de l'onglet) —
le pilote MCP du harnais restant verrouillé sur le navigateur réel de l'utilisateur, et
`browser_use` n'étant pas exposé dans cette session. Le détour par CDP est consigné dans
`AGENTS.md`.

| étape | observation |
|---|---|
| sélection d'une session | le composeur apparaît : `composerPresent: true`, `attachInputPresent: true`, `attachLabelPresent: true`, bouton Envoyer désactivé (rien à envoyer) |
| pose du fichier | `File` construit dans la page puis `change` déclenché |
| liste en attente | `pendingCount: 1`, texte « pj-probe.png 70 o », **vignette présente**, aucune erreur, **bouton Envoyer désormais actif** |
| envoi | clic effectué |
| fil | `pendingCount: 0` (liste vidée), **`filePartsInThread: ["pj-probe.png"]`**, aucune erreur |

**Un détail qui confirme le code** : l'étape de pose rapporte `0 élément(s)` dans `input.files`.
Ce n'est pas un échec — c'est **mon handler qui remet `input.value` à zéro** pour permettre de
rattacher deux fois le même fichier, ce qui vide `.files`. La liste en attente prouve que le
fichier avait bien été capturé avant.

**Ce qui n'est pas exercé** : le sélecteur de fichiers natif du navigateur. Le `File` est construit
dans la page ; tout le code applicatif (`onChange` → validation → `FileReader` → liste → envoi) est
exercé, mais le dialogue natif ne l'est pas — et il n'est pas notre code.

**Effet de bord, nettoyé** : l'envoi a injecté un message de test dans une session réelle. Le tour
qu'il a déclenché a été interrompu (`abort`), le message utilisateur et la réponse partielle
supprimés (`DELETE` 200), la session rendue à **0 message**. Le refus initial (409
`SessionBusyError`) est ce qui a imposé l'interruption préalable.

---

## Lot suivant — surface « Statut » et panneaux à onglets (livré)

Deux manques comblés d'un coup, et ils venaient du même endroit.

**1. La charte prévoyait cinq surfaces, quatre existaient.** La cinquième —
« Statut : modèles/providers, MCP, watchers, santé serveur — visible en un clic » — n'avait jamais
été construite. Elle est livrée.

**2. La disposition demandée par l'utilisateur prévoit *plusieurs* panneaux à droite** ; il n'y
avait qu'un flux d'événements occupant toute la colonne. Le panneau de droite est désormais à
**onglets** : Événements · Permissions · Statut.

### Contrat relevé pour la surface Statut

| élément | source | forme |
|---|---|---|
| statut MCP | `types.gen.ts:1976-2002` | 5 états : `connected`, `disabled`, `failed`, `needs_auth`, `needs_client_registration` |
| appel | `sdk.gen.ts:2255` | `client.mcp.status({ directory? })` |
| config | `sdk.gen.ts:751` | `client.config.get({ directory? })` — porte `model`, `agent`, `mcp` |

### Ce qui a été livré

| fichier | rôle |
|---|---|
| `src/status.ts` | décisions **pures** : libellés, tonalités, comptages, composition des lignes |
| `src/status.test.ts` | 22 cas |
| `src/components.tsx` | `StatusPanel` (présentationnel) |
| `src/app.tsx` | onglets, chargement du statut, bascule automatique |
| `src/styles.css` | onglets, lignes de statut, liste MCP |

**Décision de conception qui compte** : un serveur MCP `disabled` a la tonalité `off` et **non**
`error`. Un serveur volontairement désactivé n'est pas une panne ; les confondre ferait crier
l'interface pour rien, et une interface qui crie pour rien n'est plus lue.

**Une permission en attente devient une ligne du statut, et elle vient en second** — juste après le
serveur. C'est bloquant, donc ça se voit même depuis un autre onglet.

**La demande de permission ouvre son onglet automatiquement.** Le panneau complet a été **retiré du
fil** (le chat reste au milieu, comme demandé) ; sans cette bascule, une demande bloquante aurait pu
attendre dans un onglet fermé. Le compteur reste visible sur l'onglet et dans la barre supérieure.

### Preuve

```
vitest run     -> 5 fichiers, 74 tests, exit 0   (+22 pour ce lot)
tsgo --noEmit  -> exit 0
vite build     -> exit 0
```

Poids : **78,20 ko brut / 19,51 ko compressés** (JS) + 1,99 ko (CSS) = **21,5 ko compressés**,
contre un budget de 150 ko. Ce lot coûte ~1,4 ko compressés.

### Vérification du rendu — observée par CDP (réserve levée)

Le DOM a été lu dans le Chrome isolé, par le protocole CDP (voir la section du lot précédent pour
la méthode). Résultat brut :

```
onglet cible : http://127.0.0.1:4096/ | opencodev2
--- état initial ---
{"title":"opencodev2","tabs":["Événements","Permissions","Statut"],"activeTab":"Événements",
 "sse":"SSE connecté","composerPresent":false,"attachInputPresent":false,
 "sessionRows":19,"errorText":null}
--- clic sur l'onglet Statut ---
{"activeTab":"Statut",
 "statusLines":["Serveurjoignable (local)","Modèleopencode-go/deepseek-v4.1-flash",
                "Agents29","MCP6/7 connectés"],
 "mcpRows":["agent-toolsconnecté","computer-useconnecté","llm-memory-toolconnecté",
            "mcp-terminalconnecté","sandboxdésactivé","secret-vaultconnecté",
            "web-browserconnecté"]}
--- onglet Permissions ---
{"activeTab":"Permissions","body":"Aucune permission en attente."}
```

**Ce que cela établit** : les trois onglets existent et le clic bascule bien (`activeTab` suit) ;
le panneau Statut affiche les **vraies** valeurs — serveur joignable, modèle résolu depuis la
config, **29 agents déclarés**, **6 serveurs MCP sur 7 connectés** — et la liste MCP nomme chaque
serveur avec son état. `sandbox` apparaît **désactivé** en tonalité neutre, ce qui est précisément
la distinction voulue : un serveur désactivé n'est pas une panne.

**Ce que cela confirme aussi** : le composeur est absent tant qu'aucune session n'est sélectionnée
(`composerPresent: false`), ce qui est le comportement attendu — et c'est ce qui a imposé de
sélectionner une session pour vérifier les pièces jointes.

**Non exercé** : l'onglet Permissions avec une demande réellement en attente (il n'y en avait
aucune) ; seul son état vide est observé.

---

## Surface « Conversation » vérifiée sur données réelles (par CDP)

C'était la surface la plus importante et la moins vérifiée : la liste des sessions, les onglets, le
panneau Statut, l'attachement et la suppression l'étaient, mais **qu'un fil réel s'affiche** ne
l'était pas — alors que c'est précisément ce sur quoi porte l'arbitrage.

Session réelle sélectionnée dans l'interface (`ses_f1df9427…`, celle qui contient un appel d'outil
en erreur et un abouti), puis lecture du DOM :

```
messageCount : 8
roles        : user, assistant, user, user, assistant, user, assistant, user
textParts    : 6
toolParts    : 2
toolNames    : question, turn_plan
toolBadges   : erreur, terminé
toolClasses  : "tool error", "tool completed"
composerPresent : true
emptyMessage : null
```

Puis dépliage du premier appel d'outil :

```
details   : 1
preBlocks : 2      (entrée + erreur)
chevron   : ▾      (l'état replié était ▸)
```

**Ce que cela établit** : les messages se rendent avec leurs rôles, le texte s'affiche, les appels
d'outils apparaissent **avec le bon badge d'état** — `erreur` sur un `question` en échec, `terminé`
sur un `turn_plan` abouti, la classe CSS suivant le statut — et le panneau de détail s'ouvre au
clic avec ses blocs. C'est le contrat de P4 vérifié non plus par test unitaire mais **sur des
données réelles, dans le navigateur**.

**Note de méthode** : le relevé contient `error: "questionerreur▸"`. Ce n'est **pas** une erreur du
fil — mon sélecteur `.thread .error` a matché l'élément `.badge.error` de l'outil en échec. Le
sélecteur est trop large, pas l'affichage fautif.

---

## Refonte visuelle — système de design repris de DSH (livré)

Demande de l'utilisateur : « recopie ou inspire-toi de celui de dsh, actuellement en local ».
DSH = **DeepSeek Harness**, présent localement dans `C:\jeanluc\` : `dsh-anchored-standard` (dépôt),
`dsh-plugins` (`dsh-identite`, `dsh-ux`, `DSH-better-sidebar`, `dsh-TUI`…), et trois artefacts de
design directement exploitables.

### Sources relevées

| artefact | ce qu'il contient |
|---|---|
| `dsh-identite-visuelle.html` | le système complet : jetons, typographies, composants (barre de titre, sidebar, onglets, carte modèle) |
| `dsh-sidebar-proposition.html` | la structure de sidebar : arborescence workspace → sessions, pastille d'état, compteurs |
| `dsh-plugins/dsh-identite/design-2026-08/RECOMMANDATIONS.md` | la refonte **validée** : « bord à bord », et une correction de contraste WCAG chiffrée |

### Trois décisions reprises

**1. Les jetons DSH, à l'identique** — palette bleu-nuit (`#06070b` → `#141926`), marque indigo
`#4d7cfe` → violet `#7c5cff`, accent cyan `#22d3ee`, dégradés `--grad-brand` / `--grad-active`.
Typographies Space Grotesk / Inter / JetBrains Mono, chargées comme DSH le fait.

**2. « Bord à bord »** — `RECOMMANDATIONS.md` rejette explicitement les « cartes flottantes »
(gouttière 8 px, rayon 10 px, bordure en verre) au profit de panneaux occupant toute leur piste,
séparés par un filet d'1 px. Appliqué : `--radius-panel: 0px` sur sidebar, conversation et
panneaux ; les commandes gardent leur arrondi.

**3. La leçon de contraste, PAS la valeur.** C'est le point qui compte, et je ne l'ai pas recopié
à l'aveugle : DSH a mesuré que **son propre** texte tertiaire échouait au WCAG AA (3,55:1) et l'a
relevé à 4,73:1. Sa valeur d'origine, `--text-3: #5d6679`, donne **3,41:1 sur `--bg-1`** — donc
insuffisante. Reprendre la valeur aurait reproduit le défaut que DSH documente comme corrigé.
La valeur retenue est `#6f7a92`, calculée à **4,54:1** sur `--bg-1`.

### Vérification — styles calculés, pas présence dans le fichier

Un jeton peut être déclaré et écrasé ; une règle peut ne matcher aucun élément. Le contrôle porte
donc sur le style **calculé**, lu par CDP :

```
--bg-0: #06070b   --brand-1: #4d7cfe   --brand-3: #22d3ee
--text-1: #e9edf6  --text-3: #6f7a92   --radius-panel: 0px
--grad-active: linear-gradient(90deg, rgba(77,124,254,.16), rgba(124,92,255,.07))

rayon calculé : sidebar 0px | panels 0px | thread 0px
charpente     : 264px 615px 320px          (264px = largeur de sidebar DSH)
polices       : Inter / Space Grotesk / JetBrains Mono, toutes trois chargées (font.check)
halo d'ambiance : radial-gradient présent sur body
session active : dégradé horizontal + filet 2px #4d7cfe + titre blanc
```

### Ce que la refonte ne fait pas

Elle ne change **aucune structure** : les classes, le composant et la logique sont intacts —
`styles.css` et `index.html` seulement. Les 74 tests passent sans modification, ce qui est le
signe que rien de fonctionnel n'a bougé.

### Réserve

Les **typographies viennent de Google Fonts**, donc d'un accès réseau. C'est ce que fait DSH, mais
pour un outil local c'est une dépendance à assumer : hors ligne, les piles de repli déclarées
(system-ui, Segoe UI, Consolas) prennent le relais sans casser la mise en page. À arbitrer si
l'interface doit fonctionner en réseau coupé.

**Le rendu n'a pas été jugé à l'œil** — il a été mesuré. Les valeurs sont conformes aux jetons
DSH, mais l'appréciation esthétique appartient à l'utilisateur, qui a la fenêtre ouverte.

---

## Réserves ouvertes

Aucune. Les trois réserves précédentes sont closes, chacune par une mesure :

- **F1** (P1, medium) — « hypothèse sources publiées exécutables non vérifiée pour M2 » :
  **close**. M2 a été exécuté de bout en bout hors du dépôt git (copie des sources, `bun install`
  2 305 paquets en 153 s, serveur démarré, UI servie). L'hypothèse du workflow était d'ailleurs
  fausse : ce n'est pas un paquet mais une copie qui fonctionne. Voir la section P6.
- **F2** (P5, low) — « budget de poids non mesuré » : **close**. Mesuré : 73 ko brut,
  **18,2 ko compressés** (JS + CSS + HTML), contre un budget de 150 ko. `/agent` (1,27 Mo) est un
  souci serveur, pas client : l'UI ne l'appelle pas.
- **F3** (P3, low) — « cause de la mort du serveur après sonde SSE » : **close**. L'expiration du
  shell emporte son arbre de processus ; un serveur lancé par `Start-Process` depuis ce shell meurt
  avec lui. Ce n'était pas un défaut du serveur. Consigné dans `AGENTS.md`.

---

## Lot suivant — authentification du serveur (livré)

**La limite déclarée en P2 est levée.** Elle disait : « `EventSource` ne peut pas porter
d'en-têtes, donc un serveur authentifié n'est pas supporté ». C'était vrai du canal, pas de la
capacité — le serveur prévoit un repli.

### Contrat relevé

| élément | source | fait |
|---|---|---|
| exigence | `server/auth.ts:24-25` | authentification requise ssi `OPENCODE_SERVER_PASSWORD` est défini et non vide |
| vérification | `server/auth.ts:28-32` | `username` (défaut `opencode`) **et** mot de passe doivent correspondre |
| format | `server/auth.ts:41` | `Basic ${base64(username:password)}` |
| canal principal | `authorization.ts:78-79` | en-tête `Authorization: Basic …` |
| **repli** | `authorization.ts:74-83` | `?auth_token=<base64>` — commentaire du code : « the query fallback exists for clients that cannot set headers (app bootstrap, PTY WebSocket) » |

Le repli par requête est exactement prévu pour `EventSource`. Il est employé **pour le SSE
uniquement** : un identifiant en paramètre d'URL finit dans les journaux d'accès, ce n'est pas un
canal à généraliser.

### Ce qui a été livré

`src/auth.ts` — helpers purs : `toBase64`, `basicToken`, `hasCredentials`, `authHeaders`,
`withAuthToken`. `client.ts` passe les en-têtes au SDK et à la sonde de santé ; `events.ts` ajoute
`auth_token` à l'URL du flux ; l'UI expose un formulaire d'identifiants dans la barre supérieure.

**Piège traité** : `btoa` seul lève une `InvalidCharacterError` dès qu'un caractère sort de
Latin-1 — un mot de passe accentué aurait cassé l'authentification sans message clair. `toBase64`
encode donc en UTF-8 avant `btoa`, et un test vérifie que `é` produit bien les octets `0xC3 0xA9`.

**Choix assumé** : enregistrer des identifiants recharge la page. Le client SDK et la connexion
SSE sont tous deux construits au démarrage avec ces valeurs ; un rechargement est plus honnête et
plus simple que reconstruire deux connexions vivantes en place.

### Preuve

```
vitest run  -> 3 fichiers, 36 tests, exit 0   (14 sur l'authentification)
tsgo --noEmit -> exit 0
```

### Vérification contre un serveur réel (réserve levée)

Serveur lancé avec `OPENCODE_SERVER_PASSWORD=secret` et `OPENCODE_SERVER_USERNAME=tester`,
sur le port 4098. Mesures :

| requête | statut |
|---|---|
| `GET /global/health` sans identifiants | **401** |
| `GET /global/health` en-tête Basic correct | **200** |
| `GET /global/health` mauvais mot de passe | **401** |
| `GET /global/health?auth_token=…` | **200** |
| `GET /event` sans jeton | **401** |
| `GET /event` avec en-tête Basic | **200 `text/event-stream`** |
| `GET /event?auth_token=…` | **200 `text/event-stream`** |
| `GET /` (UI) sans identifiants | **401** |
| `GET /` (UI) avec identifiants | **200** |
| `GET /assets/index-*.js` sans identifiants | **401** |

Le 401 porte `www-authenticate: Basic realm="Secure Area"` : c'est bien le serveur qui le pose.

### Ce que cette mesure apprend — et qui n'était pas anticipé

**1. Le flux SSE accepte aussi l'en-tête Basic.** Le repli `auth_token` n'est donc pas le seul
canal pour le flux. Il reste nécessaire dans un cas précis, voir ci-dessous.

**2. La page de l'UI elle-même exige l'authentification** — `GET /` et les assets renvoient 401.
Conséquence directe : le formulaire d'identifiants **de l'UI n'est pas atteignable** quand le
serveur est authentifié, puisqu'il faut déjà être authentifié pour charger la page qui le contient.
Le navigateur, lui, affiche sa propre invite Basic en voyant le 401 (le `realm` est posé), et met
ensuite les identifiants en cache pour l'origine : c'est le chemin réel en même origine.

**3. Le formulaire sert donc le cas inter-origines**, qui est le seul où il est atteignable et le
seul où il est indispensable : UI servie depuis une origine A, backend visé sur une origine B via
`VITE_OPENCODE_SERVER_URL` ou le champ « même origine ». Là, l'invite Basic du navigateur ne se
déclenche jamais pour B, et les deux canaux du code deviennent nécessaires — l'en-tête pour le SDK,
le jeton pour le SSE, puisque `EventSource` ne peut pas porter d'en-tête.

**Le code était donc juste, mais pour une raison que la documentation ne disait pas.** C'est
maintenant écrit.

### Vérification inter-origines dans un navigateur (dernier point ouvert, fermé)

Montage : backend **4098** avec `OPENCODE_SERVER_PASSWORD=secret`, `OPENCODE_SERVER_USERNAME=tester`
et `--cors http://127.0.0.1:5180` ; UI servie par Vite sur **5180** avec
`VITE_OPENCODE_SERVER_URL=http://127.0.0.1:4098`. Le navigateur parle donc au backend en
inter-origines, sans passer par le proxy de développement.

| étape | observation |
|---|---|
| UI chargée, aucun identifiant | « SSE déconnecté », « serveur injoignable », « connexion perdue » |
| préflight CORS depuis 5180 | `204`, `access-control-allow-origin: http://127.0.0.1:5180`, `access-control-allow-headers: authorization` |
| formulaire `auth` rempli (`tester` / `secret`) puis « appliquer » | rechargement |
| après rechargement | **« SSE connecté »**, **« serveur joignable »**, **« auth ✓ »**, **19 sessions** listées, `server.connected` dans le flux |

**Conclusion** : les deux canaux fonctionnent en inter-origines — l'en-tête `Basic` pour le client
SDK (les 19 sessions), le jeton `auth_token` pour le flux SSE. C'est le cas qui rend le formulaire
nécessaire, et il est vérifié.

Point de configuration à retenir : le CORS du serveur est une **correspondance exacte d'origine**
(`cors.ts:19`, `opts?.cors?.includes(input)`) — pas de joker. L'origine de l'UI doit être listée
telle quelle, sinon le préflight échoue et l'UI reste sur « serveur injoignable ».