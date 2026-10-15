# PROGRESS — version web opencodev2

Seule autorité de statut du programme. `WORKFLOW.md` décrit, ce fichier constate.
Convention héritée de `docs/releases/v2.4.0/`.

État au 2026-10-13. L'écran a été reconstruit après un constat d'échec de conception : voir la
dernière section.

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

## Reproduction des composants DSH (livré)

Correction d'une erreur de ma part, signalée par l'utilisateur : « la consigne n'était pas juste de
recopier les valeurs mais aussi de reproduire les composantes de l'interface ». Le lot précédent
avait repris le **vocabulaire** (les jetons) sans la **grammaire** (les composants). C'est réparé.

### Ce qui a été reproduit, et d'où

Chaque composant correspond à une classe du balisage de référence — `dsh-identite-visuelle.html`
et `dsh-sidebar-proposition.html` — pour que la structure suive la même grammaire, pas seulement
la même palette.

| composant | source | structure reproduite |
|---|---|---|
| `TitleBar` | `.titlebar` | 3 feux, logo SVG à dégradé, produit, badge de version, séparateur, contexte |
| pastille d'environnement | `.env` + `.pulse` | LED colorée selon l'état (connecté / interrompu / injoignable) |
| `Brand` | `.brand` + `.brand-name small` | logo, nom, signature courte en capitales espacées |
| `SectionLabel` | `.sectionHeader` | libellé capitalisé + filet qui court jusqu'au bord |
| `FolderRow` | `.folderRow` | chevron rotatif, écusson dossier SVG, nom, compteur |
| `SessionRow` | `.sessionRow` | pastille d'état, titre, **temps relatif**, actions au survol |
| guide d'arborescence | `.tree-a .sessions::before` | filet vertical 1px en dégradé + tirets par ligne |
| `ModelCard` | `.model-card` | LED, nom du modèle, sous-ligne d'informations |
| `ChatMessage` | `.chat-msg` + `.avatar` + `.bubble` | avatar, bulle, rôle porté par la classe |
| `StatusBar` | `.statusbar` + `.s-item` + `.s-right` | éléments à gauche, poussés à droite |
| charpente | `.app` | 3 rangées : barre de titre / contenu / barre d'état |
| motif signature | `motif: 'node-grid'` | grille de nœuds en fond de conversation |

### Un composant a dû être construit, pas copié

Les **temps relatifs** (« now », « 23h », « 1d ») n'existaient pas dans le code. `src/time.ts`,
pur et testé (9 cas). Un défaut y a été trouvé **par le test** : à exactement 7 jours, ma condition
`<` renvoyait une date alors que le commentaire disait « au-delà d'une semaine ». Corrigé dans le
code, pas dans le test — le test avait raison.

### Vérification — rendu dans le DOM, pas présence dans le CSS

Un sélecteur peut exister dans la feuille de style sans qu'aucun élément ne le porte. Le contrôle
porte donc sur le DOM, lu par CDP :

```
barre de titre : titlebar=true, feux=3, logo=true, produit="opencodev2",
                 version="local", separateur="—", contexte="opencode-fork",
                 pastille="session locale · connecté", LED=true
sidebar        : brand=true, signature="agent généraliste",
                 newSession="+ Nouvelle session", sectionLabel="Sessions 19",
                 folderRow=true (chevron, écusson SVG, "opencode-fork", count=19),
                 sessionRow=19, première : pastille + « 6h »
guide          : ::before → width 1px, linear-gradient(…)      ← l'arborescence est dessinée
carte modèle   : "opencode-go/deepseek-v4.1-flash" / "mcp 6/7 · agents 29", LED=true
fil            : 8 bulles, avatars ["MOI","OC",…], 2 outils, badges ["erreur","terminé"]
barre de saisie: ci-model="opencode-go/deepseek-v4.1-flash", textarea, joindre, "Envoyer"
barre d'état   : présente, éléments gauche et droite
charpente      : rows "46px 519px 26px", areas "top top top" / "side thread panels" / "status status status"
```

### Fausse alerte, signalée

Le premier relevé donnait `bulles: 0`. J'ai failli conclure que les bulles ne se rendaient pas —
en réalité j'avais cliqué **la session que j'avais vidée** lors du nettoyage du test de pièces
jointes. Vérifié sur une session avec du contenu : 8 bulles. C'est la seconde fois dans la session
qu'une cible mal choisie produit un faux négatif ; c'est exactement le genre d'erreur qui fait
« corriger » ce qui marche.

### Non reproduit, et pourquoi

Les composants de DSH sans équivalent ici : barre d'onglets de fichiers, bloc de code colorisé,
et les cartes de sa « boîte à outils » (palette, typographie, principes) — ces dernières sont des
planches de présentation, pas des composants d'application.

---

## Réserves ouvertes

Une seule, ouverte par la refonte de l'écran. Les trois réserves précédentes sont closes, chacune
par une mesure :

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
- **F4** (refonte, medium) — « la cible de l'écran n'est pas validée par l'utilisateur » : **close**.
  La cible a été revue **section par section** avec l'utilisateur, qui en a validé la structure (7
  sections, normatives) et tranché deux points : la cible se purge des comptes rendus de lot, et
  `packages/webui` remplace `packages/app` comme interface embarquée. Ce qui subsiste n'est plus une
  réserve de conception mais une appréciation : **le rendu n'a pas encore été jugé à l'œil** par
  l'utilisateur — les captures ont servi à ma vérification, pas à la sienne.

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

---

## Refonte de l'écran — cinq zones pour un agent généraliste (livré)

**Le constat, et sa cause.** L'interface livrée jusque-là a été jugée non livrable : composants
inutiles, indicateurs partout, aucune pensée d'usage. La cause n'était pas un manque de finition mais
un manque de **cible** : « inspiré de DSH » désigne une référence — d'où venir — pas une destination.
Faute de destination, l'espace a été rempli.

**La cible est écrite, pas devinée.** `CIBLE.md` : un écran, la conversation ; cinq zones ; une liste
de soustraction ; une règle de doute (« on enlève »). C'est un document de cible, pas de statut.

### Ce qui a été retiré, et pourquoi

| élément retiré | raison |
|---|---|
| barre de titre | décor de fenêtre : feux `traffic`, version, contexte, badge `env` avec texte |
| barre de statut | sept indicateurs permanents, aucun ne change une décision |
| panneau « Statut » et ses onglets (événements, permissions, statut) | le journal d'événements est un outil de mise au point |
| carte modèle | information sans usage dans l'écran |
| `.badge` (6 tonalités), `.pill`, `.dot`, compteurs | l'état s'écrit là où il sert, ou ne s'écrit pas |
| `status.ts` + `status.test.ts` | devenus morts par la soustraction — supprimés, pas laissés « au cas où » |

### Ce qui reste

Quatre zones permanentes, plus un bandeau conditionnel :

1. **rail des sessions** — recherche, nouvelle session, renommer/supprimer, dossier de travail, identifiants ;
2. **fil** — le tour de l'utilisateur est une surface, celui de l'agent du texte nu ;
3. **saisie** — Entrée envoie, `Maj+Entrée` passe à la ligne, pièces jointes ;
4. **tiroir droit** — **n'existe que si une permission est en attente** (piste à `0px` sinon) ;
5. bandeau de notice — **conditionnel** : n'apparaît que si le serveur est injoignable ou le flux rompu.

Renommages : `ToolCall` → `ToolLine` (une ligne, pas une carte), `PermissionPanel` →
`PermissionSheet`. Le nom décrit la forme, pas la fonction.

Règles tenues dans le CSS : monochrome, une seule couleur d'attention (`#f7ad31`) réservée à une
demande d'accord, une seule couleur d'échec (`#f25a5a`) ; **ce qui est sain ne s'affiche pas** ;
bord à bord.

### Preuve

```
vitest run      -> 6 fichiers, 80 tests, exit 0
tsgo --noEmit   -> exit 0
vite build      -> 76,49 ko brut / 19,22 ko compressés
```

Mesures par CDP, profil isolé, 1440×900, serveur 4096 :

| mesure | valeur |
|---|---|
| `grid-template-columns` | `280px 1145px 0px` — tiroir fermé quand rien n'est attendu |
| éléments interdits présents | `[]` — `statusbar`, `badge`, `pill`, `modelCard`, `tabs`, `sessionRow`, `chatMsg`, `folderRow`, `titlebar`, `brand`, `sectionLabel` |
| fond | `rgb(21, 21, 23)` = `--bluish-950` |
| session « Test 4 étapes avec erreurs injectées » | **7 tours** (1 utilisateur, 6 agent), **5 appels d'outil**, 19 parties, aucune erreur |

### Deux défauts trouvés par la mesure, corrigés

1. **Filet de 1px au bord droit alors que le tiroir est fermé.** La piste vaut `0px`, mais
   `border-left` dessinait quand même — mesuré : `.side` large de **1px** pour une piste à `0px`.
   Corrigé : le filet passe par `.side.open`.
2. **Onze tests de composants cassés par les renommages.** Cause de la casse : un glob
   `src/*.test.ts` avait manqué `components.test.tsx`. Les tests ont été adaptés au nouveau
   vocabulaire, pas supprimés.

### Une fausse alerte, signalée comme telle

La première sonde a conclu « le fil ne se rend pas : 0 tour ». C'était faux : la sonde cliquait la
**première** session de la liste, qui n'a aucun message (vérifié : `legacy=0`). Sur 19 sessions,
**14 ont un transcript**. Le défaut n'existait pas. Les deux chemins ont été relevés au passage :
`/session/:id/message` (legacy, celui qu'appelle le SDK) et `/api/session/:id/message` (v2, qui rend
`{cursor, items}` d'événements de session).

### Ce que cette refonte ne fait pas

- `CIBLE.md` est une **proposition** : le code la suit, donc si elle est fausse, le code l'est aussi
  (réserve **F4**).
- Le rendu n'a pas été jugé par l'utilisateur.
- L'arbitrage « ce que le binaire embarque » (`build.ts` servait `packages/app/dist`, pas `webui`)
  a été tranché depuis : **la webui remplace `packages/app`** comme interface embarquée.

---

## Lot suivant — le rail en trois parties (livré)

Demande de l'utilisateur : « une barre de sessions séparée en plusieurs parties avec différentes
responsabilités » — les menus principaux d'un côté, les workspaces et leurs sessions de l'autre,
avec des icônes plus intuitives, des sessions indentées, un interlignage plus petit et **un survol
qui ne déplace pas la liste**.

Le rail n'avait qu'une responsabilité de fait : lister des sessions. Il en porte trois.

### Contrat relevé, pas supposé

| endpoint | forme mesurée | usage |
|---|---|---|
| `GET /command` | **tableau de 210** entrées `{ name, description, source, template, hints }` | menus, groupés par provenance |
| `GET /plugin` | **objet** `{ version, runtime, origins, hooks }`, 4 origines `{ spec, scope }` | liste des plugins |
| `POST /session/{id}/command` | `{ sessionID, command, arguments?, agent?, model?, parts? }` | exécuter une entrée |

Provenances réelles dans les 210 entrées : `command` **12**, `skill` **198**. Plus **4** plugins.

### Les trois parties

| # | partie | question | contenu | défilement |
|---|---|---|---|---|
| A | Menus | « que peut faire le harnais, hors session ? » | menus par provenance, plugins | non |
| B | Workspaces | « où ai-je travaillé, et sur quoi ? » | dossiers repliables + sessions | **oui, seule** |
| C | Pied | « où est-ce que je travaille ? » | dossier de travail | non |

**A — les menus.** Groupés par provenance (`commandes`, `compétences`, `plugins`), repliés par
défaut. Une entrée s'exécute sur la session active ; sans session active elle est **inerte et le
dit**, plutôt que de créer une session dans le dos de l'utilisateur.

**B — les workspaces.** Icônes en **primitives SVG** (dossier, session, chevron) au lieu de glyphes
`▾`/`▸` dont le rendu dépend de la police du système. Sessions **indentées de 16px** sous leur
dossier ; interlignage `16,25px` pour `12,5px` de corps.

**C — le pied.** Il **définit** ce que B affiche ; c'est le seul endroit où l'on écrit un chemin.

### Le défaut de survol, nommé et corrigé

C'est la demande explicite de l'utilisateur, et le défaut était réel : `.row-actions` passait de
`display: none` à `display: flex` au survol. Cela **change la grille**, donc la colonne du titre se
rétrécit — toute la ligne bouge au moment précis où l'on vise un bouton. Même chose pour le chevron
du détail.

Corrigé : les deux occupent leur place **en permanence** et se révèlent par l'`opacity`.

### Quatre écarts trouvés par la mesure, corrigés

1. **La section menus restait vide, sans erreur.** `/command` et `/plugin` étaient absents de
   `API_PREFIXES` (`vite.config.ts`) : Vite servait `index.html` avec un **status 200**, le SDK
   croyait recevoir du JSON, échouait à le parser, et le `.catch()` avalait tout. Corrigé : les deux
   routes sont proxifiées.
2. **`/command` pèse 736 669 octets gzip** (1,99 Mo décodé). Chargé au montage, c'était 719 ko pour
   une section repliée. Chargé désormais au **premier dépliage** — même règle que `/provider`
   (6,7 Mo), à une autre échelle. Conséquence assumée : avant le premier clic, la section n'affiche
   pas de compte — un nombre qu'on ne connaît pas ne s'invente pas.
3. **La partie menus n'était pas plafonnée.** Mesuré : repliée elle fait 139 px et laisse 617 px aux
   sessions ; un groupe ouvert la porte à 379 px (sessions à 377 px) ; **deux groupes ouverts la
   porteraient à ~619 px et ne laisseraient que ~190 px aux workspaces** — la liste qu'on vient
   consulter, écrasée par le menu. Corrigé : `.rail-nav` est plafonnée à **45 %** du rail et défile
   en interne (`overflow-y`), son en-tête restant `sticky`. Mesure après correction, deux groupes
   ouverts : nav **405 px** pour un contenu de 618 px (donc elle défile), workspaces **405 px**,
   liste **351 px**, 210 entrées et 19 sessions toujours rendues.
4. **Une entrée grisée était muette, alors que la cible promettait qu'elle « le dit ».** Écart entre
   le document et le code, trouvé en mesurant l'infobulle : elle ne portait que la description de la
   commande. Or une entrée grisée sans explication fait croire à une panne ou à un droit manquant,
   alors qu'il manque seulement une session. Corrigé : `inertReason()` (pure, testée) porte la
   phrase, `NavItem` l'ajoute à l'infobulle quand l'entrée est désactivée. Mesure : sans session,
   12 commandes sur 12 désactivées et l'infobulle dit « … — ouvrez une session pour exécuter » ;
   avec une session, `désactivées: 0` et l'infobulle redevient la description seule.

### Preuve

```
vitest run      -> 11 fichiers, 159 tests, exit 0   (+15 pour ce lot : nav.test.ts)
tsgo --noEmit   -> exit 0
vite build      -> 96,07 ko brut / 25,25 ko compressés
```

Mesures par CDP, profil isolé, 1440×1000, serveur 4096 :

| mesure | valeur |
|---|---|
| parties présentes | `rail-nav=1`, `rail-workspaces=1`, `rail-foot=1` |
| avant chargement des menus | `["menus charger"]` |
| après un clic | `["commandes 12", "compétences 198", "plugins 4"]` — 12 + 198 = **210**, le total mesuré |
| entrées du premier groupe | 12 ; libellés `init`, `review`, `qa proof`, `translate`, `swarm` |
| entrée sans session active | `disabled = true` |
| workspaces | `["opencode-fork", "packages/opencode"]` |
| sessions | 19 lignes, **19 icônes de session**, indent `16px` |
| survol | titre **83px avant / 83px après** — rien ne bouge |

### Réserve

La **capture d'écran a expiré** (deux tentatives, 15 s puis 40 s) : `Page.captureScreenshot` n'est
pas revenue sur cette instance. Les preuves ci-dessus sont des **mesures du DOM**, pas une image.
Le rendu n'a donc toujours pas été jugé à l'œil — c'est la réserve **F4** qui persiste, et elle ne se
lève que par l'utilisateur.

---

## Lot suivant — rail réordonné et réglages qui gèrent (livré)

Une critique de l'utilisateur, qui corrige **la façon de décider quoi afficher** — pas seulement le
dessin. Trois règles en sont sorties, consignées dans `AGENTS.md` §4 :

- **L'API n'est pas la cible.** Une donnée qui existe côté serveur n'est pas une raison de
  l'afficher ; la seule question est « l'utilisateur fait-il ça au quotidien ? ».
- **Relevé partiel ≠ absence.** « Aucun point d'écriture de configuration » était **faux** : je
  n'avais regardé que les routes GET que je consommais.
- **La lisibilité prime sur l'affordance.** Le libellé est l'information ; les actions sont
  secondaires.

### Le rail, réordonné par fréquence d'usage

| ordre | partie | contenu |
|---|---|---|
| 1 | Nouvelle session | un bouton, toujours visible |
| 2 | Plugins | un bouton par plugin — **rien** s'il n'y en a aucun |
| 3 | Workspaces | dossiers + sessions, **4 visibles** puis « voir plus » |
| 4 | Pied | dossier de travail + accès configuration |

**Retiré** : la section « menus » et sa lecture de `GET /command` (736 669 octets gzip). Elle
n'existait que parce que la route existait. Un skill ne se consulte pas, il s'injecte.

**Lisibilité du libellé.** Les actions se posent en `position: absolute` **par-dessus** le nom au
survol — elles ne consomment plus de colonne de la grille, donc le titre garde toute sa largeur.
L'infobulle porte le nom complet **et** l'activité (agent, modèle, jetons, coût, fichiers).
Indentation portée de 16 à **22 px** : dossiers et sessions se confondaient.

### Les réglages : un composant qui gère

| route | corps | usage |
|---|---|---|
| `PATCH /config` | `Config` (37 clés) | configuration du projet |
| `PUT /auth/{providerID}` | `Auth` = `OAuth \| ApiAuth \| WellKnownAuth` | identifiants |
| `POST` / `DELETE /plugin/{spec}` | `{ spec }` | plugins |

`GET /provider/auth` rend, pour **8 fournisseurs**, leurs méthodes **réelles** avec leurs champs.
Les formulaires se déduisent de cette réponse : on n'invente pas les champs. Une méthode `oauth` ne
se remplit pas — elle se connecte, et le composant le dit au lieu de montrer un champ inerte.

**Une section ne charge ses données qu'à sa sélection.** `GET /provider` (6,7 Mo) n'est **jamais**
appelé ; `GET /agent` (1,27 Mo) n'est lu que si l'on ouvre « agents ».

### Le défaut refait, et cette fois nommé

La section « fournisseurs » s'affichait **vide et sans erreur** : `/provider` était absent de
`API_PREFIXES` (`vite.config.ts`), donc Vite servait `index.html` avec un **status 200**. C'est
**exactement** le défaut déjà corrigé pour `/command` et `/plugin` — refait. Corrigé : `/provider`
et `/auth` sont proxifiés, avec le motif écrit dans le fichier pour qu'il ne soit pas refait une
troisième fois.

### Preuve

```
vitest run      -> 12 fichiers, 172 tests, exit 0   (+14 sur settings.test.ts)
tsgo --noEmit   -> exit 0
vite build      -> 102,54 ko brut / 27,16 ko compressés
```

Mesures par CDP, profil isolé, serveur 4096 :

| mesure | valeur |
|---|---|
| ordre du rail | `rail-head · rail-new · rail-plugins · rail-workspaces · rail-foot` |
| plugins | `failure-journal`, `preflight-guard`, `mcp-readiness`, `schedule` |
| plafond de sessions | `opencode-fork` 3 · `packages/opencode` **4** + « voir plus · 12 » |
| indentation | `margin-left: 22px` |
| actions | `position: absolute`, largeur 74 px — aucune colonne consommée |
| infobulle | `[nom, agent : build, modèle : deepseek-v4.1-flash, …]` |
| onglets des réglages | `général · fournisseurs · agents · serveurs MCP · plugins` |
| fournisseurs | **8** — `azure, cloudflare-ai-gateway, cloudflare-workers-ai, digitalocean, gitlab, openai, poe, xai` |
| champs réels | `e.g. my-models`, `e.g. 1234567890abcdef…`, `clé d'API` — déclarés par le serveur |

### Note de méthode

Le pilote CDP isolé (port 9222) s'est **fermé** en cours de lot — le piège déjà consigné (fermer tous
les onglets ferme l'instance). Relancé par
`chrome.exe --remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\McpBrowserProfiles\chrome`.

**Nom du produit** : `opencodev2` évoque un agent de codage, pas un généraliste. « open agent » a été
proposé. Décision utilisateur ; rien n'est changé tant qu'elle n'est pas prise.

---

## Lot suivant — configurer les agents (livré)

Dernier point de la critique non traité : « configurer les provider, les modèles, **les type
d'agents** ». La section « agents » **listait** ; elle configure désormais.

### Le point qui décide de tout

`Config.agent` est une carte `Record<nom, AgentConfig>`. La question est : un `PATCH` **fusionne**-t-il
ou **remplace**-t-il cette carte ? Je ne le suppose pas — la parade est la même dans les deux cas :
**envoyer la carte entière**, modifiée. Un patch partiel serait destructeur si le serveur remplace.

Mesuré : la carte porte **4 entrées** (`build`, `explore`, `orchestrator`, `plan`), pas 34 — les
autres agents sont des valeurs par défaut du serveur. Forme réelle d'une entrée :
`plan: { model, variant, description, options, color, permission }`.

### Ce qui est livré

- `agentModel(entry)`, `agentDisabled(entry)`, `agentPatch(current, name, changes)` — purs, 8 cas.
- `agentPatch` **ne mute pas** son entrée : un patch mutant ne déclencherait aucun rendu SolidJS.
- Un modèle vidé **retire la clé** au lieu d'écrire un modèle nommé `""`.
- Dans le composant : un champ modèle par agent, et un bouton désactiver/activer. Le bouton
  « enregistrer » **n'existe que si un brouillon est saisi** — 34 lignes couvertes de boutons
  inutiles seraient du bruit.

### Preuve — et sa limite, assumée

```
vitest run      -> 12 fichiers, 180 tests, exit 0   (+8 sur la configuration des agents)
tsgo --noEmit   -> exit 0
vite build      -> 104,79 ko brut / 27,87 ko compressés
```

Par le SDK, sur la carte **réelle** envoyée telle quelle (no-op strict) :

| mesure | valeur |
|---|---|
| corps `{ config: { agent: … } }` | **accepté** (`ok = true`) |
| agents avant / après | `[build, explore, orchestrator, plan]` — identiques |
| contenu | **inchangé** (`contenu_inchange = true`) |
| fichier déposé dans le dépôt | **aucun** |

**Limite** : le clic « désactiver » dans le navigateur n'a **pas** été observé — deux sondes CDP ont
expiré (200 s). Ce qui est prouvé : la fonction pure (8 tests), l'acceptation du corps par le
serveur, et le chemin `{ config: { … } }` de bout en bout par l'aller-retour du `username` décrit
plus haut. Ce qui ne l'est pas : le clic lui-même. À rejouer quand l'instance isolée sera stable.

### Bug trouvé en vérifiant par l'interface

`saveConfig` posait la notice de succès **puis** rechargeait la section — or le rechargement commence
par effacer les messages. **La notice ne pouvait jamais être vue.** Corrigé en rechargeant d'abord.

---

## Lot suivant — le panneau de réglages comme composant (livré)

Deux reproches, dont un de méthode : « **tu as exposé ce qui pouvait être exposé sans pouvoir
expliquer pourquoi c'est exposé et comment c'est stylisé** », et « **as-tu mis une navigation
horizontale, pourquoi ?** ».

### L'échec de méthode, nommé

J'avais appris quatre principes — l'API n'est pas la cible, on enlève, la lisibilité prime, le
fréquent passe devant — et je les avais appliqués **au rail**, le composant dont l'utilisateur
parlait. Puis j'ai recommencé l'erreur exacte dans les réglages, **parce qu'il n'en avait pas parlé**.

⇒ **Un principe appris vaut pour tout l'écran, pas pour le composant où il a été appris** (`AGENTS.md`
§13). Le non-dit ne porte pas sur le contenu, il porte sur le composant entier.

### Ce qui était faux

| défaut | pourquoi |
|---|---|
| navigation **horizontale** (`flex-wrap`) | prise par défaut, pas décidée. Tient à 5 sections, **casse à 12** |
| contenu = ce que l'API rend, dans son ordre | 2 réglages exposés sur les **37** clés du schéma |
| **six** tailles de police ad-hoc | aucune échelle, donc aucune hiérarchie |
| 8 fournisseurs ouverts d'un coup, 34 agents listés | aucun repli, aucune recherche |

### Ce qui est fait

- **Navigation verticale** en colonne (184 px), feuille portée à **760 px** : deux colonnes ne
  tenaient pas dans 560. Convention des panneaux de réglages (Réglages Système, VS Code, GitHub,
  Linear, Notion), et seule forme qui ne change pas quand une section s'ajoute.
- **Les réglages sont déclarés comme données** (`SETTING_SPECS`) : clé, libellé d'écran, raison d'être,
  contrôle. Le composant ne fait que rendre — ajouter un réglage, c'est ajouter une entrée.
- **Le contrôle suit la nature** : booléen → interrupteur, énumération → liste de choix (libellés
  d'écran : « demander avant », jamais `manual`), chaîne → champ.
- **Trois jetons typographiques** (`--fs-label`, `--fs-note`, `--fs-meta`) au lieu de six tailles
  écrites à la main.
- Fournisseurs **repliables** (un seul ouvert), agents **cherchables**.
- `generalLines()` et son `<dl>` **supprimés** : une ligne qui redit un champ affiché juste au-dessus
  ne dit rien.

### Preuve

```
vitest run      -> 12 fichiers, 189 tests, exit 0
tsgo --noEmit   -> exit 0
vite build      -> 107,94 ko brut / 28,80 ko compressés
```

Géométrie mesurée par CDP sur l'écran réel, 1440×1000 :

| mesure | valeur |
|---|---|
| largeur de la feuille | **760 px** |
| `.sheet-nav` | `flex-direction: column`, **184 px** |
| `.sheet-main` | grille **184px 574px** — deux colonnes |
| onglets | **8** : modèles · général · comportement · outils · fournisseurs · agents · serveurs MCP · plugins |
| tailles de police | label **12,5** · description **11,5** · titre **12** — trois, pas six |
| une ligne | grille **348px 178px** (libellé / contrôle) |
| contrôles par nature | **2 interrupteurs** (`autoshare`, `snapshot`), **2 listes de choix** (`share`, `autoupdate`) |
| libellés de comportement | partage des sessions · partage automatique · mise à jour · instantanés |

**Limite** : ces preuves sont des **mesures du DOM**, jamais une image — `Page.captureScreenshot`
reste inatteignable. Le rendu est vérifié en géométrie, pas à l'œil.

### Faute de méthode corrigée

Le commit `6e98b8f34` est passé avec un **typecheck en échec** : le garde testait `$LASTEXITCODE`
après le build, donc le code du build, pas celui du typecheck. Corrigé (`82f090956`), et le garde
vérifie désormais **les trois codes**. Même classe de défaut que ceux qu'on traque : un contrôle qui
ne contrôle pas ce qu'il prétend.

---

## Lot suivant — l'échelle typographique (livré)

Reproche : « les tailles de police sont trop petites, as-tu pensé au choix de taille **par rapport à
la taille de la page** ? »

### Le défaut, mesuré

`body` était en `14px`, mais presque tout le contenu était **en dessous** : base de fait **12,5 px**
(17 occurrences), plus petit texte **10,5 px**, **8** valeurs `px` distinctes sur **56** déclarations,
**zéro** `rem`. Ce n'était pas une échelle trop petite, c'était **l'absence d'échelle** — et tout
était en `px` fixes, donc le réglage de taille de police du navigateur était ignoré partout.

### La question, retournée

Faire grossir le texte avec la largeur (`vw`) est un **contre-modèle** pour une interface dense : le
même outil doit se lire pareil en 1440 et en 2560. Le mécanisme correct est **`rem`**, qui suit le
réglage de l'utilisateur.

### L'échelle posée

`--fs-title 1rem` · `--fs-base 0.875rem` · `--fs-note 0.8125rem` · `--fs-meta 0.75rem`.
**Le contenu primaire vaut exactement la taille du `body`.** Les 43 déclarations converties ont été
attribuées par **rôle**, pas par valeur — une substitution mécanique aurait rendu un nom d'agent en
secondaire et un compteur en primaire. La redéfinition locale des jetons dans le panneau (en `px`)
est supprimée : une échelle locale est une échelle qui diverge.

### Preuve

```
vitest run      -> 12 fichiers, 189 tests, exit 0
tsgo --noEmit   -> exit 0
vite build      -> 107,94 ko brut / 28,80 ko compressés
```

| mesure | valeur | jeton |
|---|---|---|
| racine par défaut | 16 px | — |
| **fenêtre 1440 px** | corps 14 · onglet 14 · libellé 14 · description 13 · titre 16 | — |
| **fenêtre 2560 px** | **identique** | la taille ne dépend pas de la largeur |
| **racine portée à 20 px** | libellé **17,5 px** (×1,25 exact) | elle suit le réglage du navigateur |
| corps, nom de session, dossier, ligne plugin, nouveau | **14 px** | `--fs-base` |
| heure de session | **13 px** | `--fs-note` |
| étiquette en capitales | **12 px** | `--fs-meta` |
| nom du produit, titre de feuille | **16 px** | `--fs-title` |

### Incident extérieur, diagnostiqué puis levé

En rejouant la mesure, le rail est venu **vide** : quatre sélecteurs en `ABSENT`. Ce n'était pas la
typographie.

| route | avant | après redémarrage |
|---|---|---|
| `/session`, `/session?directory`, `/session/{id}` | **499**, 0 octet | **200**, 23 319 octets, 19 sessions |
| `/agent` | **499**, 0 octet | **200**, 34 agents |
| `/mcp`, `/find` | **499**, 0 octet | — |
| `/global/config`, `/global/health` | 200 | 200 |

⇒ Toutes les routes **scopées à l'instance** échouaient ; les routes **globales** marchaient. Le
journal du serveur ne contenait **aucune erreur** pour ces requêtes, et `499` signifie « le client a
coupé » : la requête n'atteignait aucun gestionnaire. Redémarrage du serveur ⇒ tout est revenu.

**Méthode** : devant un état vide, ne pas suspecter son interface — vérifier `route par route`, puis
la santé des deux serveurs. Une mesure à zéro qui ressemble à un défaut de rendu peut être une panne
de service, et « corriger » une interface qui marche coûte un commit de plus.

## Lot suivant — le texte tertiaire passe le seuil AA (livré)

Défaut trouvé en mesurant la couleur **calculée** du texte tertiaire, pas sa déclaration : `--text-3`
pointait sur `bluish-600 #81858c`, la valeur relevée chez DSH.

### Le défaut, mesuré

| texte | bg-0 | bg-1 | bg-2 | AA (4,5:1) |
|---|---|---|---|---|
| `text-1` `#f9fafb` | 17,45 | 15,03 | 13,34 | passe |
| `text-2` `#adb2b8` | 8,54 | 7,36 | 6,53 | passe |
| `text-3` `#81858c` (avant) | 4,92 | **4,24** | **3,76** | **échec** |
| `text-3` `#8c9697` (après) | 6,01 | 5,18 | **4,60** | passe |

Le seuil de 3:1 (grand texte) ne s'applique nulle part : **aucun texte de l'interface n'atteint 24 px**.

### Le même piège, une seconde fois

`PROGRESS.md` consigne déjà, en « décision 3 » du lot de refonte, que **la leçon de contraste, PAS la
valeur** : DSH avait lui-même mesuré son texte tertiaire à 3,55:1 et l'avait relevé à 4,73:1 ; sa
valeur d'origine donnait 3,41:1 sur son `--bg-1`. La webui a recopié la valeur **après** correction de
DSH, donc sur un fond différent du sien — et l'a raté à son tour. **Copier un jeton corrigé chez un
autre ne dispense pas de le remesurer sur ses propres fonds.**

`bluish-650 #8c9697` est un pas interpolé dans la **même famille** bleu-gris (entre `bluish-600`
`#81858c` et `bluish-700` `#61666b`) : la correction ne change pas de famille, elle change de valeur.
`--bluish-600` reste déclaré, avec sa valeur relevée, pour rester comparable.

### Preuve

```
vitest run -> 12 fichiers, 189 tests, exit 0
tsgo --noEmit -> exit 0
vite build  -> 107,94 ko brut / 28,80 ko compressés, exit 0

CDP, styles calculés :  --text-3 #8c9697 | --bg-1 #232324 | --bg-2 #2c2c2e
éléments dont color == rgb(140,150,151) : 6 (rail-label, sheet-tab, empty, new-session-plus…)
capture webui-21-contraste.png, clip 1060x700, 68 ko
```

**Méthode** : un jeton qui passe le contraste sur le fond d'origine ne le passe pas sur un autre fond.
La mesure se fait sur les **trois** fonds de l'interface, pas sur celui de la source.
## Lot suivant — la webui devient l'interface embarquée (livré)

Décision de l'utilisateur : « **elle remplace `packages/app`** ». L'arbitrage était ouvert depuis le
lot de refonte de l'écran ; il n'était pas une incertitude technique, c'est une décision de produit.

### Ce que le code disait

`build.ts` s'appelle `createEmbeddedWebUIBundle` mais pointait sur `../../app` :

```
build.ts:77   const appDir = path.join(import.meta.dirname, "../../app")
```

⇒ le binaire embarquait et servait **`packages/app`**. La webui, seize commits plus tard, n'était
atteignable que par le serveur Vite de dev. Une seule ligne était en cause : `build.ts:77` est le seul
endroit du dépôt qui référence `packages/app` comme source du bundle (le reste n'en parle que dans un
commentaire, `app-server.ts:4`).

### La chaîne, lue avant de changer

Le chemin d'exécution n'est pas qu'un dossier à pointer ; il faut savoir ce que le serveur fait du
fichier une fois embarqué (`src/server/shared/ui.ts`) :

| étape | ligne | comportement |
|---|---|---|
| import dynamique du module généré | `ui.ts:49` | `import("opencode-web-ui.gen.ts")`, `.catch(() => null)` ⇒ **silencieux si absent** |
| réponse d'un asset embarqué | `ui.ts:70` | `embeddedUI[chemin]`, sinon repli sur `index.html` (route cliente) |
| CSP appliquée au HTML | `ui.ts:60` | `cspForHtml` : `script-src 'self'` |
| dossier explicite qui gagne | `ui.ts:143` | `OPENCODE_WEB_UI_DIR` (`runtime-flags.ts:29`) bat le bundle embarqué |

Le build émet `dist/opencode-<plateforme>/` contenant un binaire : un build partiel produit une
release partielle — c'est pourquoi `--skip-embed-web-ui` et `--reuse-web-ui` existent et doivent rester
des options, pas des valeurs par défaut.

### Preuve

Le chemin d'exécution a été proved **avant** le changement, parce que `webUiDir` sert le même code que
le bundle embarqué (`serveDirectoryUIEffect`) : le prouver par le dossier prouve le lecteur, pas
seulement le dossier.

```
serve --port 4099 avec OPENCODE_WEB_UI_DIR=packages/webui/dist

GET /                     -> 200  text/html        1 107 octets   title "opencodev2"
GET /assets/index-*.js    -> 200  text/javascript  107 940 octets
GET /assets/index-*.css   -> 200                    19 001 octets
```

Layout du build webui compatible avec le mapping embarqué : `index.html` + `assets/**`, sans `.map`,
ce que `createEmbeddedWebUIBundle` exige.

### Ce qui reste

La substitution de `appDir` est écrite et prouvée sur le **lecteur**. L'embarquage lui-même (bun
`--compile` multi-cible) n'a pas été rejoué : il demande un build complet, et le premier build après ce
changement est celui qui publiera la release.

**Méthode** : quand un chemin d'exécution est partagé par deux sources (bundle embarqué et dossier
explicite), prouver le lecteur une fois prouve les deux — au lieu de payer un build complet pour une
ligne de chemin.

## Lot suivant — le cadre des réglages appartient à la fenêtre (livré)

Demande de l'utilisateur : « une taille nettement plus grande pour le panneau *settings* ». Le
non-dit, lui, était dans la capture : la feuille **changeait de taille à chaque changement de
section**.

### Les deux défauts, mesurés

| mesure | avant | après |
|---|---|---|
| feuille | `760 × 380` | `1120 × 813` |
| colonne de contenu | `574 large` | `934 large` |
| hauteur | celle du contenu, plafonnée à `min(78vh, 720px)` | fixe, `min(86vh, 880px)` |

`max-height` ne fixe rien : la feuille prenait la hauteur de la section affichée. « modèles » tient en
trois lignes, « fournisseurs » en porte 228 — la fenêtre se redimensionnait donc sous le curseur au
moment même où l'on changeait de section. C'est le **même défaut que la navigation horizontale**
(CIBLE §4 : « une disposition qui tient à cinq sections et casse à douze n'est pas finie »), appliqué à
l'autre axe : le cadre d'un panneau de réglages appartient à la fenêtre, pas à la section.

La `height` est écrite en `vh` et non en `rem` : la règle du `rem` porte sur les **tailles de texte**
(CIBLE §5, décision 3) ; une dimension de mise en page suit la fenêtre, comme le `78vh` qu'elle
remplace.

### Preuve

```
vitest run -> 12 fichiers, 189 tests, exit 0

CDP, getBoundingClientRect : viewport 1920×945
  .sheet.settings 1120 × 813 | .sheet-nav 184 | .sheet-body 934 × 753
capture settings-big.png, clip 1180×860, 141 ko
```

### Ce qui reste

La feuille est centrée à taille fixe ; elle ne se réordonne pas à 1024 px de large (le contenu passe
sous la navigation avant que le média-query ne s'applique) — non observé, non mesuré.

## Lot suivant — la page General, les icônes de section, et l'interface en anglais (livré)

Quatre demandes : une icône par entrée du menu, une page `General`, **tout ce qui est dans Models mis
dans General**, et l'interface en anglais. Plus la consigne qui décide du reste — « penser à tout ce
que je n'ai pas dit ».

### Ce que le non-dit a ajouté, et pourquoi

| ajout | ce qu'il évite |
|---|---|
| blocs nommés `Defaults` / `Workspace` / `Identity` / `Environment` | cinq réglages de trois natures empilés se lisent comme une liste, pas comme une page |
| le dossier de travail **étiqueté**, dans `General` | il n'existait qu'en champ **sans libellé** au pied du rail ; un dossier inconnu rend un rail vide **sans erreur** (200, zéro session) et rien ne le disait |
| complétion par `GET /project` (962 octets) | une liste déroulante occuperait la place en permanence pour une information qu'on ne lit qu'en écrivant |
| pied de page : `written to …opencode.jsonc · server local` | « enregistré » sans dire **où** ; le `.jsonc` gagne sur le `.json` quel que soit le mtime |
| une icône par section | sept libellés se retrouvent en relisant la colonne ; sept formes se reconnaissent sans être lues |

### La décision qui n'était pas dans la demande

`Models` n'est plus une section. Ce n'était pas une catégorie mais un **objet** : `model`,
`small_model` et `default_agent` ne règlent pas « les modèles », ils règlent **ce qu'une nouvelle
session prend par défaut**. Une section nommée d'après la chose range le réglage à côté de la question
qu'il répond. La clé `models` a donc disparu du type, de la liste, de la branche de chargement et des
tests — pas seulement de l'écran.

### Mesures

```
sections : 8 -> 7 ; clés de `SETTINGS_SPECS` : behavior, general, models, tools -> behavior, general, tools
GENERAL_SETTINGS : 2 réglages -> 5, en 3 blocs (Defaults 3 · Identity 1 · Environment 1)
feuille : 760 x 380 -> 1120 x 813 (viewport 1920x945) ; nav 184 ; corps 934 x 753
icônes : 7, toutes distinctes ; `GET /project` 962 octets, 6 projets -> 5 après retrait de `/`
```

### Preuve

```
vitest run -> 13 fichiers, 203 tests, exit 0
tsgo --noEmit -> exit 0
git show --stat 3fcea21a1 -> 17 fichiers, copie d'interface en anglais

CDP, onglet 5180 : .sheet.settings 1120x813 ; 7 .sheet-tab dont 7 .glyph
  h2 des blocs : Defaults | Workspace | Identity | Environment
  pied : "written to C:\Users\jeanl\.config\opencodev2\opencode.jsonc · server local"
  capture general2.png, clip 1180x880, 130 ko
```

### Limite, écrite

`formatCost(0.0123)` rend `$0.01` et non `$0.0123` : le seuil de quatre décimales est à **0,01**, et
le déplacer aurait changé le comportement. La traduction n'a touché que la langue du format, pas son
seuil.

**Méthode** : une section porte le nom du **moment**, pas celui de l'objet qu'elle règle. Le reste du
non-dit s'est déduit d'un seul geste — chercher, pour chaque réglage, ce qui n'était dit nulle part
ailleurs dans l'interface.

## Correction du lot précédent — des listes de choix, et le dossier rendu au rail (livré)

Retour de l'utilisateur, deux phrases : « la plus part des configuration ont des données existantes
bien definis à selectionner, pourquoi ne pas avoir mis des dropdowns ? » et « la section workspace
pour changer de chemin de dir, où la pertinence si l'utilisateur doit aller dans les settings pour
ça alors que c'est une action évidente et prioritaire […] il peut déjà ajouter des dossiers dans la
bar de navigation ». Les deux sont justes.

### Défaut 1 — des champs de texte pour des ensembles finis

`model`, `small_model`, `default_agent` et `shell` étaient des `input` : l'interface connaissait la
réponse et la faisait porter au clavier. Ce sont maintenant quatre `select` alimentés par le serveur.

**La source, choisie sur mesure, pas sur intuition.** `GET /provider` rend déjà tout — et pèse
**6,7 Mo en 1 198 ms** : c'est lui qui gelait la feuille. La surface entière (`GET /doc`, 119 routes)
en donne d'autres :

| route | poids | ms | contenu |
|---|---|---|---|
| `/provider` | 6,7 Mo | 1 198 | 228 fournisseurs, 8 775 modèles — **écarté** |
| `/config/providers` | 531 ko | **49** | 7 fournisseurs, 696 modèles — **retenu** |
| `/api/model` | 491 ko | 1 733 | 697 modèles — non retenu (plus lent) |
| `/agent` | 1,27 Mo | 37 | 34 agents → 6 primaires retenus |
| `/pty/shells` | **353 o** | 110 | 4 interpréteurs |

`/pty/shells` n'est **pas dans le SDK** (« Request is not supported by this version of OpenCode
Server », mesuré) : appel en `fetch` direct, et `/pty` ajouté au proxy Vite — sans quoi Vite rend
`index.html` avec un `200` et la liste reste **vide sans erreur**.

La valeur d'un interpréteur est le **nom** (`pwsh`), pas le chemin : `Shell.preferred` → `resolve`
essaie un chemin enraciné, et `which(nom)` sinon ; le nom survit à une réinstallation.

### Défaut 2 — une action de premier plan rangée dans un panneau

Le bloc `Workspace` a été **retiré** de `General` : on change de dépôt plusieurs fois par jour et le
pied du rail porte déjà le geste. Ce qui manquait n'était pas un second endroit mais ce qui
**accompagne** le geste — le champ du rail ne disait ni ce qu'on y écrit, ni qu'un dossier inconnu
rend un rail vide **sans erreur**. Il a gagné une infobulle qui dit sa conséquence, et la complétion
(`GET /project`, 962 octets) y est revenue. Une leçon, écrite dans `CIBLE.md` : *un panneau de
réglages est l'endroit de ce qui n'a pas besoin d'être au premier plan ; y ranger une action
quotidienne ne la range pas, il l'enterre.*

### Défaut 3 — trouvé en vérifiant, pas en écrivant

La capture de vérification a montré les quatre listes sur « server default », alors que `Config`
porte un modèle. Mesuré au CDP : `domValue: ""` et `selectedIndex: 0` sur les quatre, alors que le
modèle configuré figurait bien parmi les 697 options.

Un `<select>` à qui l'on donne une valeur qu'aucune `<option>` ne porte **encore** retombe sur la
première, et n'y revient plus — c'est exactement la séquence réelle : `Config` arrive, les listes
49 ms plus tard. L'écran affichait donc « server default » sur une configuration renseignée, c'est-à-
dire un mensonge, et précisément sur ce qu'on venait d'ajouter. Corrigé en posant la valeur dans un
effet qui **lit aussi les choix** : quand les options changent, la valeur est réappliquée.

**Le test n'a rien vu.** Écrit d'abord comme un simple « monte et vérifie », il **passait sur le code
fautif** : jsdom insère les options avant que la valeur soit posée, il ne rejoue pas la course. Il a
fallu le réécrire pour viser le **mécanisme** — simuler la sélection perdue, puis laisser les options
changer — pour qu'il échoue (`expected '' to be 'opencode-go/kimi-k2'`), et c'est le navigateur qui a
tranché. Leçon : quand un défaut vient d'un **ordre d'arrivée**, jsdom ne peut pas l'attraper, et un
test vert sur du code fautif est pire qu'aucun test.

### Défaut 4 — deux modèles, un seul libellé

Trouvé sur la capture de vérification du défaut 3. `Default model` et `Small model` étaient deux
valeurs différentes — `command-code/deepseek/deepseek-v4.1-flash` et
`opencode-go/deepseek-v4.1-flash` — et les deux s'affichaient « DeepSeek V4.1 Flash ».

Mesure : **696 modèles pour 509 libellés distincts** ; 141 libellés sont portés par plusieurs modèles
(187 options en trop), et les deux modèles configurés partageaient tous deux leur libellé avec trois
autres. Fermé, un `<select>` n'affiche que le libellé : cinq valeurs s'écrivaient pareil.

Le libellé est désormais `Nom · Fournisseur`, toujours, et la liste est plate. Mesure après :
« DeepSeek V4.1 Flash · Command Code GOAT » et « DeepSeek V4.1 Flash · OpenCode Go », 697 options,
**0** `optgroup`, `select` à 440 px — la partie qui lève l'ambiguïté n'est pas la première coupée.

### Ce que la projection évite, et ce qu'elle ne peut pas éviter

`GET /config/providers` **rend les clés des fournisseurs en clair** : 7 champs `key`/`apiKey`,
6 chaînes `sk-…`. `/api/model` en rend **580**. La route « sans secrets » n'existe pas — c'est une
limite du serveur. La projection ne lit que `name`, `id` et le libellé d'un modèle ; le reste est
abandonné avant d'entrer dans un signal, et un test l'assure (`modelCatalog` sur une charge piégée).
**Le correctif de fond reste côté serveur** : une route qui ne renvoie pas les clés.

### Mesures

```
General : 2 réglages -> 5 ; 4 `select` alimentés + 1 champ (`Username`)
  select rendus : 4/4 (CDP) | fournisseurs groupés : 7 | modèles : 696 | interpréteurs : 4
  option vide « server default » présente ; valeur hors liste affichée quand même
blocs : Defaults · Identity · Environment (Workspace retiré)
```

### Preuve

```
vitest run -> 13 fichiers, 220 tests, exit 0
tsgo --noEmit -> exit 0

CDP, onglet 5180 : .set-control SELECT|SELECT|SELECT|INPUT|SELECT
  optgroups : Command Code GOAT, DeepSeek, Nvidia, OpenCode, OpenCode Go, OpenRouter, OrcaRouter
  modèles (3 premiers) : command-code/claude-fable-5 …
  interpréteurs : bash, cmd, powershell, pwsh
  capture general3.png, clip 1180x880, 102 ko
```

### Ce qui reste

Les clés en clair restent dans la réponse du serveur, sur le réseau local — hors du périmètre de l'UI.
Autrement dit : **la liste des modèles ne se paie plus qu'une fois par session** (voir le lot suivant),
mais elle se paie toujours 531 ko, et le correctif de fond des clés reste côté serveur.

## Lot suivant — les identifiants descendent, les listes se cachent (livré)

Deux décisions, posées ensemble parce qu'elles se décidaient pareil — et **prises par l'utilisateur**,
pas par moi : elles portent sur son écran, et le raisonnement seul ne tranche pas où mettre quelque
chose qu'il voit tous les jours.

### L'audit du premier plan, dans les deux sens

La règle apprise au lot précédent — *une action de premier plan ne se range pas dans un panneau* — a
été retournée sur le pied du rail. Il portait trois choses : le dossier de travail (action
quotidienne : sa place), `settings` (l'entrée du panneau : sa place), et un bouton `credentials` avec
un badge permanent « identifiants ✓ », pour un réglage qu'on touche **une fois par serveur**. Un badge
qui ne change jamais ne dit rien ; il occupe.

Le bloc `Server` de `General` porte désormais l'adresse, le nom, le mot de passe, et `Forget` — qui
n'apparaît que s'il y a quelque chose à oublier. Ce que la popover ne montrait pas, la page le montre :
elle **lit** l'adresse du serveur et le nom déjà enregistré, sans les réécrire pour les voir.
L'adresse est en lecture seule : elle vient de `location.origin` ou d'une variable de build, donc un
champ de saisie donnerait l'illusion d'un effet.

### Le cache, et son point d'invalidation

`General` relisait **1,8 Mo** à chaque ouverture : 531 ko de modèles (`/config/providers`) et 1,27 Mo
d'agents (`/agent`) — pour deux listes qui ne changent que si l'on écrit quelque chose. Elles ne sont
plus relues que si elles sont absentes, et l'invalidation est **nommée chez le seul writer qui peut
les changer** : `saveProvider` (authentifier un fournisseur change les modèles qu'il propose) et
`saveAgent`. Les interpréteurs ne sont pas cachés : 353 octets, il n'y a rien à économiser.

### Incident de méthode — une édition qui a supprimé un fichier

En voulant retirer le CSS devenu mort (`.auth-form`, `.auth-row`), j'ai appelé l'outil d'édition avec
un `oldString` **vide**. Le remplacement s'est appliqué à tout le fichier : **1 725 lignes de
`styles.css` supprimées**, dont les changements non commités du lot (`.set-value`). Réparé par
`git checkout` depuis le dernier commit, puis les deux changements réappliqués par des éditions
ciblées. Vérifié par le nombre de lignes et par grep de six jetons attendus (`--bluish-950`,
`--fs-title`, `.sheet-tab`, `.set-row`, `.switch-track`, `.provider-head`).

**La leçon** : un `oldString` vide n'est pas « tout remplacer » anodin — c'est une suppression de
fichier déguisée en édition. Et la réparation n'a coûté que les changements **non commités** : le
commit du lot précédent les portait déjà.

### Preuve

```
vitest run -> 13 fichiers, 226 tests, exit 0
tsgo --noEmit -> exit 0
styles.css : 1 467 lignes restaurées, 6 jetons de contrôle présents

CDP, onglet 5180, page General :
  railFoot      "⌂ settings"                        (plus de bouton credentials)
  blocks        Defaults | Identity | Environment | Server
  addressShown  "same origin"  |  passwordField true
```

### Ce qui reste

Trois résidus, inchangés : les clés des fournisseurs en clair dans la réponse du serveur (correctif
côté serveur) ; une liste d'interpréteurs fermée aux quatre que le serveur cherche lui-même (`nu`,
`fish`, WSL) ; et le cache, qui vit **le temps de la page** — un rechargement le vide, ce qui est le
comportement voulu mais n'est pas écrit à l'écran comme tel.

## Lot suivant — la page Providers : la collection se cherche, le détail se règle (livré)

La règle était écrite dans `CIBLE.md` **avant** le premier appel d'API, et c'est ce qui a tenu : un
écran de réglages décompose sa donnée en **1 → n**. La collection est une grille qu'on cherche, un
élément est une page qu'on règle. Jamais sept formulaires empilés — c'est-à-dire jamais un catalogue
qui prend la place du réglage.

### L'API n'a pas décidé l'écran

Le sondage a suivi la cible, pas l'inverse. Quatre verdicts, dont un qui tombe :

- **R1 tenu** — `models` est une **carte** dans `/config/providers` (122 entrées pour `orcarouter`),
  pas une liste par fournisseur : le détail s'affiche sans second appel.
- **R2 tenu, mais deux magasins** — une clé s'écrit par l'authentification (`PUT /auth/{providerID}`,
  `POST /auth/{id}/keys`), une `baseURL` par la configuration (`provider.<id>.options.baseURL` dans
  `/global/config`). **Correction, mesurée après livraison** : l'écran n'écrit pas les deux. Seul `PUT /auth/{id}` est
appelé — ni création de fournisseur, ni `baseURL`, ni `models`, ni `discover`. La page livrée affiche
et pose une clé, et seulement pour les **8** fournisseurs que `/provider/auth` déclare (`openai`,
`gitlab`, `poe`, `cloudflare-workers-ai`, `cloudflare-ai-gateway`, `azure`, `digitalocean`, `xai`).
Les 7 fournisseurs configurés n'y sont presque pas — `orcarouter` non — donc pour eux le panneau
d'identifiants ne rendait **rien du tout**, pas même la note de repli : elle vit à l'intérieur du `For`,
qui ne parcourt qu'une liste vide.
- **R3 tombe** — il n'existe pas de modèle par défaut **par fournisseur** : `Config.model` est global.
  Le contrôle s'appelle donc « Default for new sessions » et nomme sa portée, au lieu de promettre un
  défaut par fournisseur que le serveur n'a pas.
- **R4 tenu** — `whitelist`/`blacklist` et les surcharges `models.<id>` passent par `/global/config`,
  et `PATCH /config` matérialise un `config.json` à la racine du dépôt (mesuré) : un panneau de
  réglages vise `/global/config`, qui ne dépose rien dans l'arbre de travail.

`ProviderBlock` disparaît de `settings-sheet.tsx` : la section `Providers` porte désormais
`providers.tsx` (`ProviderGrid`, `ProviderDetail`, `ProvidersSection`), et le schéma de l'écran vit
dans `settings.ts` (`providerSummary`, `catalogSummaries`, `providerModelChoices`, `scopeKey`,
`scopedValues`) — les valeurs saisies sont préfixées `id:clé` et relues par `providerValuesFor(id)`.

### Le contrôle de choix, une fois pour toutes

Les quatre listes de `General` avaient chacune leur `<select>` natif — et un défaut mesuré : quand les
`<option>` arrivent **après** la valeur posée par le code, le select retombe sur sa première option et
n'y revient plus (`domValue: ""`, `selectedIndex: 0`). Un mensonge à l'écran, que jsdom ne rejoue pas —
un test « monte puis vérifie » passe sur le code fautif.

Le `<select>` est donc remplacé partout par `picker.tsx` : un contrôle cherchable, une popup en
`position: fixed`, avec sa propre barre de défilement (un `<select>` natif ne peut pas obéir : sa liste
est dessinée par le système). Mesuré au CDP : 697 entrées, filtre focalisé à l'ouverture — la `ref`
Solid étant appelée **avant** l'insertion du nœud, le focus est posé dans un `queueMicrotask`.

### Preuve

```
vitest run    -> 14 fichiers, 242 tests, exit 0
tsgo --noEmit -> exit 0

CDP, onglet 5180, section Providers :
  grille   7 tuiles  |  count "7 of yours"  |  première tuile "OrcaRouter"
  détail   titres ["OrcaRouter ready", "122 models"]  |  122 lignes de modèles
           filtre présent  |  libellé "Default for new sessions"  |  état "ready"
  retour   "← Providers / OrcaRouter"  ->  grille de nouveau, détail disparu
```

### Ce qui reste

Deux résidus du lot : la page relit `/config/providers` (531 ko) à chaque sélection, et l'écriture
d'une clé n'est pas vérifiée de bout en bout — la vérification CDP s'est arrêtée avant d'écrire quoi
que ce soit côté serveur, volontairement (le fournisseur ouvert était déjà `ready`, donc aucun
formulaire de méthode à l'écran). Restent aussi les trois résidus du lot précédent, inchangés.

## Lot suivant — la page Providers écrit (livré ; vérification navigateur bloquée)

La critique était juste, et elle a coûté une livraison pour rien : livrer un écran qui **affiche** un
fournisseur et ses modèles ne sert à rien si l'on ne peut ni en déclarer un, ni le régler, ni lui
donner des modèles. La page écrit désormais ce qui manquait.

### Ce que l'écriture a exigé de savoir

- **Le schéma accepte n'importe quel identifiant** : `provider` est une carte libre (`config.ts:241`,
  `Schema.Record(String, ConfigProvider.Info)`) ⇒ une passerelle maison est déclarable. Il lui faut un
  `npm` — l'adaptateur qui parle — et une `options.baseURL` — à qui.
- **L'ajout est sans retour** : sur `/config` comme sur `/global/config` il n'existe qu'un `GET` et un
  `PATCH` qui **fusionne** — aucun `PUT`, aucun `DELETE`. Un fournisseur ajouté par l'écran ne se
  retire que dans le fichier. C'est écrit à côté du bouton, avant le clic.
- **Il n'existe pas de statut « désactivé »** : `ModelStatus` vaut `alpha|beta|deprecated|active`. Le
  seul levier d'exclusion est `blacklist`, et un tableau est **remplacé**, jamais concaténé ⇒ on écrit
  la liste entière, recalculée depuis celle qu'on vient de lire.
- **`discover` agit au chargement, pas à la requête** (`provider.ts:1570`) : cocher la case ne fait pas
  apparaître les modèles dans la seconde. La note le dit — sinon on cherche le défaut ailleurs.
- **Un fournisseur créé n'apparaît pas tout de suite** dans `/config/providers` : la grille fusionne la
  configuration (`mergeDeclared`), sans quoi l'écran dirait « créé » puis ne montrerait rien.

### Ce qui a été ajouté

`settings.ts` : six constructeurs purs (`providerId`, `providerPatch`, `modelPatch`, `discoverPatch`,
`blacklistPatch`, `toggleModel`) plus `mergeDeclared`. Deux règles qu'un `...spread` ne tenait pas :
**un champ vide ne s'écrit pas** (`config.ts:513` retire la clé quand la valeur est une chaîne vide :
écrire `""` **efface**), et le patch partiel **fusionne sans retirer**.

`providers.tsx` : un bouton `+ add provider` sur la grille, replié au repos ; un panneau `Connection`
(baseURL, paquet npm, case de découverte) ; un panneau `Models` qui ajoute un modèle à la main et
exclut/restaure chaque ligne ; et une note là où les 220 autres fournisseurs déclarent une méthode —
le panneau restait **muet**, la note de repli vivant à l'intérieur de la boucle.

`app.tsx` : cinq handlers (`createProvider`, `saveConnection`, `setDiscover`, `addModel`,
`excludeModel`) écrits par `saveConfig` vers `/global/config`, plus `providerEntry`/`connectionFor`/
`excludedFor`/`modelsFor` et la grille fusionnée.

### Preuve

```
vitest run -> 16 fichiers, 263 tests, exit 0   (9 tests d'écriture + 12 tests d'écran ajoutés ici)
tsgo --noEmit -> exit 0
```

L'espion de `fetch` posé dans le navigateur **prouve** que l'interception fonctionne : les appels
réels de la page ont été relevés (`GET /pty/shells`, `GET /global/config`, `GET /config/providers`,
`GET /agent?directory=tester`, `GET /provider/auth?directory=tester`) et `/global/config` est bien
refusée quand l'espion la coupe.

### Ce qui n'est **pas** prouvé

Le parcours de clic complet n'a pas été observé : l'attachement CDP a expiré quatre fois, dont sur un
onglet neuf, après que les trois ports et la liste des onglets eurent répondu. Les sondes précédentes
regardaient par ailleurs **le détail** d'un fournisseur — ce qui explique un `tiles: 0` et l'absence
du bouton de recherche, et rien d'autre.

Surtout : je n'ai **pas** écrit dans la configuration de l'utilisateur pour prouver l'aller-retour. Un
fournisseur d'essai serait resté dans son fichier, et l'API ne sait pas le retirer. La preuve d'une
écriture réelle demande son accord.

### L'aller-retour réel, prouvé sur une instance isolée

L'utilisateur a tranché : **serveur isolé**. Un second couple a été monté — serveur sur **4097** avec
ses propres dossiers XDG (`…\Temp\opencodev2\iso`), webui Vite sur **5181** pointée dessus par
`OPENCODE_SERVER_PORT` (le proxy lit cette variable, `vite.config.ts:8`). L'écran de `General` a
confirmé l'isolation de lui-même : « written to …\iso\config\opencodev2\opencode.jsonc ».

Les quatre gestes ont été faits au clic, et le fichier les porte tous :

```json
"iso2": {
  "npm": "@ai-sdk/openai-compatible",
  "options": { "baseURL": "https://iso2.test/v1" },
  "discover": true,
  "models": { "kimi-k2": { "name": "kimi-k2" } },
  "blacklist": ["kimi-k2"]
}
```

…et la grille est passée de « 2 of yours » à « 3 of yours » avec la tuile `iso 0 models no key` : la
fusion `mergeDeclared` fait donc son travail — sans elle, l'écran aurait dit « créé » puis n'aurait
rien montré.

**Un défaut réel, trouvé par cette preuve et invisible aux tests** : le premier fournisseur créé
(`iso`) n'a reçu **aucun `npm`**. Le champ affichait `@ai-sdk/openai-compatible` — une valeur montrée
et jamais envoyée, parce que le brouillon ne portait que `id` et `baseURL`. Un fournisseur déclaré et
sans adaptateur, donc inutilisable. Corrigé par `newProviderDraft()` : ce que l'écran montre part.
Le test qui manquait est écrit, et `iso2` — créé après le correctif — porte bien son `npm`.

---

## Lot suivant — le fil de conversation, refondu autour de l'étape (livré)

Constat de départ, mesuré et non supposé : **le texte ne pèse que 10,6 % de ce qui défile**. Relevé
sur 4 conversations réelles de la copie de la base (273 messages, **7 782 parts**) :

| part | nombre | avant ce lot |
|---|---|---|
| `tool` | 2 262 | rendu — une ligne, mais sans son titre |
| `step-start` | 1 447 | **filtré** |
| `step-finish` | 1 440 | **filtré** — porte `cost`, `tokens`, `reason` |
| `reasoning` | 1 404 | rendu, replié, sans durée |
| `text` | 823 (10,6 %) | rendu |
| `patch` | 400 | **filtré** |

Champs présents et jamais lus avant ce lot : `tool.state.title` (2 242), `tool.state.time` (2 262),
`stepFinish.cost`/`tokens` (1 440), `msg.cost`/`tokens` (230). Concevoir le fil comme une
conversation de prose cachait donc **90 % du contenu** — puis on s'étonnait de ne pas suivre ce que
fait l'agent.

### Décisions

- **L'unité de lecture est l'étape**, pas le message (`groupTurns` puis `groupSteps`,
  `view-model.ts`) : ~6 appels au modèle par réponse. La ligne d'étape s'écrit
  « `step 3 · 12 actions · 8.4s · $0.123 · 31k tokens` » — le prix est une donnée de **lecture**,
  pas de comptabilité.
- **La prose se lit, le travail se vérifie.** Prose de l'agent au corps de lecture, en texte nu ;
  outils, raisonnement et patches en **une ligne** chacun, dépliables sur place. Une étape replie son
  travail, jamais sa prose.
- **Le fil est append-only à l'affichage.** Il était rechargé **en entier** par REST à chaque
  événement citant l'identifiant de session — cause directe du saut de défilement et du clignotement.
  `reduceThread` applique l'événement ; le rechargement ne subsiste que pour un message encore
  inconnu de la page.
- **Le suivi du bas est conditionnel** : rien ne se déplace si l'on a remonté le fil. Le suivi
  inconditionnel rendait la lecture impossible.
- **Bornes** : une sortie longue s'affiche sur 12 lignes puis « show N more lines » ; un patch
  nomme 8 fichiers puis « show N more files ». Le volume d'une sortie n'apparaît **que** s'il y a
  quelque chose à révéler (§3.8).
- `patch`, `compaction` et `retry` deviennent **visibles** : les filtrer faisait mentir le fil sur ce
  qui s'est passé. `step-start`, `snapshot` et `agent` restent invisibles — aucun contenu propre.
- `text.synthetic` (73) et `text.ignored` (70) sont **étiquetés** : un texte injecté, ou écarté,
  n'est pas ce que l'agent a dit.

### Contrats relevés — la partie qui aurait pu être fausse

| fait | preuve |
|---|---|
| `/event` porte `message.part.updated` **et** `message.part.delta` | sonde live sur un tour réel : 17 et 12 occurrences |
| `/global/event` n'en porte **aucun** | même sonde : 88 trames, aucune de ces deux types, autre enveloppe sans `type` au premier niveau |
| `properties` porte la partie **aplatie** + `messageID`/`sessionID` | relevé sur le fil — le schéma (`message-v2.ts:692`) annonce `{sessionID, part, time}` |
| ±lignes d'une écriture = `state.metadata.filediff` | 603 occurrences de `{file, patch, additions, deletions}` |
| `PatchPart` ne compte pas les lignes | il ne porte que `hash` et `files[]` |
| `bash.state.output` = sortie complète | 804 o, contre 589 o pour `metadata.output` |
| tailles de sortie | médiane 4 lignes, p90 46, p99 191, max 1 349 (2 410 mesures) |

### Preuve

```
vitest run     -> 16 fichiers, 306 tests, exit 0   (+42 pour ce lot)
tsgo --noEmit  -> exit 0
vite build     -> exit 0
```

Poids après ce lot, mesuré (`bun run build`, vite 7.1.4) :

| fichier | brut | gzip |
|---|---|---|
| `index.html` | 1,11 ko | 0,61 ko |
| `assets/index-*.css` | 24,33 ko | 4,66 ko |
| `assets/index-*.js` | 139,36 ko | 38,02 ko |
| **total utile** | **164,8 ko** | **43,3 ko** |

Budget de `WORKFLOW.md` §4 : premier rendu utile < 150 ko compressés, bundle total < 400 ko.
**Respecté** — 43,3 ko compressés, soit un facteur 3,5 de marge. À noter pour la suite : le JS est
passé de 78 à 139 ko brut depuis le lot « surface Statut », l'essentiel venant des lots `Providers`
et de celui-ci ; la marge reste confortable mais elle se réduit, et c'est le seul chiffre du
chantier qui va dans ce sens.

Vérifié au navigateur sur l'**instance isolée** (Chrome 9222 → webui 5181 → serveur de dev 4097
lisant la copie de la base), DOM lu par CDP :

```
.step = 33   .turn = 6   .patch = 7   .prose = 2
stepHeads = ["step 1 · 2 actions · 2.9s · $0.007 · 45.1k tokens",
             "step 3 · 6 actions · 2.8s · $0.0008 · 48.6k tokens", …]
tool-diff = ["+1 −1", "+9 −9", "+4 −4", …]
noms de type de protocole affichés = 0
```

**Le seul écart entre l'intention et le rendu** portait sur la source des ±lignes : la conception les
supposait dans le patch, ils sont dans `metadata.filediff`. C'est la sonde qui l'a montré, pas la
lecture du schéma — et le supposer aurait produit une ligne d'écriture muette.

### Réserve

Ce lot n'ajoute pas de champ de saisie dans le fil : la seule écriture qui y reste est la réponse à
`question.asked`, conformément à §3.1. La vérification porte sur les conversations existantes de la
copie, pas sur un tour en cours d'écriture — le comportement append-only est prouvé par la sonde live
et par les tests du réducteur, pas observé « à l'œil » pendant une génération.

---

## Lot suivant — la question de l'agent, la seule écriture du fil (livré)

**Ce lot vient d'un audit, pas d'une demande.** §3.1 et §3.9 du document de conception faisaient de
`question.asked` **le seul contrôle du fil**, en le motivant : « quand l'agent pose une question, il
est **bloqué** dessus — ne pas répondre arrête la conversation ». Le lot précédent avait implémenté
deux des quatre interactions listées en §3.9, dont celle-là. Vérification faite dans le code : les
événements `question.asked`/`replied`/`rejected` existaient bien (`question/index.ts:90-92`), les
routes aussi (`groups/question.ts:27,40,52`), et la webui n'en traitait **rien** — les seules
occurrences du mot « question » dans `packages/webui/src` étaient des commentaires en français et une
entrée d'icône d'outil.

Autrement dit : **une session dont l'agent posait une question n'avait aucune sortie à l'écran.** Le
fil ne l'affichait pas, et rien d'autre ne le faisait.

### Contrat relevé

| élément | forme |
|---|---|
| `question.asked` | `{ id, sessionID, questions[{ question, header, options[{label, description}], multiple?, custom? }], tool? }` |
| `question.replied` | `{ sessionID, requestID, answers[] }` |
| `question.rejected` | `{ sessionID, requestID }` |
| réponse | `POST /question/:requestID/reply` — `{ answers: string[][] }` |
| rejet | `POST /question/:requestID/reject` |
| retrait | sur **`requestID`**, pas sur `id` — même piège que les permissions |

**La réponse est positionnelle.** `answers` est un tableau de libellés **par question, dans l'ordre
des questions posées** : l'index est le contrat, et une réponse décalée d'un cran répondrait à la
mauvaise question. C'est ce qui a dicté la forme du brouillon (`emptyAnswers`) et le fait qu'aucun
affichage ne réordonne les questions reçues.

Deux règles de saisie qui découlent du contrat, pas du goût : en choix **unique**, cocher
**remplace** (sinon le serveur reçoit deux libellés pour une question qui n'en attend qu'un) ; un
texte libre **est** la réponse de sa question, il ne s'ajoute pas aux libellés cochés.

### Le défaut que ce lot a révélé — quatrième fois le même piège

La feuille ne s'affichait **pas**, alors que tout était correct côté serveur. Cause, mesurée :

```
GET http://127.0.0.1:5181/question  -> 200  content-type: text/html     (index.html)
GET http://127.0.0.1:5181/permission -> 200  content-type: application/json
```

`/question` **manquait dans `API_PREFIXES`** de `vite.config.ts`. Le proxy Vite rendait donc
`index.html` avec un `200`, le SDK croyait recevoir du JSON, échouait à le parser, et le `catch`
avalait l'erreur : `questions()` restait vide, la feuille ne s'affichait jamais, **sans le moindre
message**. C'est le piège que le fichier de config documente déjà trois fois (`/command`, `/plugin`,
`/pty`, `/provider/auth`) — et il s'est refermé une quatrième fois sur une route que j'avais
branchée moi-même dans le même lot.

Deux leçons, toutes deux consignées dans `AGENTS.md` :

1. **Toute route consommée par la webui doit être dans `API_PREFIXES`**, et le contrôle se fait
   **par le proxy**, sur le `content-type`, jamais sur le status seul.
2. **Invisible aux tests** : jsdom n'a pas de proxy, donc les 23 tests de ce lot passaient tous
   pendant que l'écran était vide. C'est la vérification navigateur qui l'a trouvé — et seulement
   parce qu'elle a été faite sur le **vrai** serveur, avec une vraie question en attente.

### Preuve

```
vitest run     -> 16 fichiers, 327 tests, exit 0   (+21 pour ce lot)
tsgo --noEmit  -> exit 0
```

**Bout en bout, par l'API** (la charge exacte que l'UI envoie) :

```
GET  /question                -> 1 en attente : que_136d4d859001LySbaHxT1T2Fqo
POST /question/{id}/reply  { answers: [["Blue (the calm one)"]] }   -> 200 true
/event                        -> question.replied = 1
                                 { requestID, answers: [["Blue (the calm one)"]] }
GET  /question                -> 0
après la réponse              -> 2 parties émises, dernier message finish="tool-calls"
```

**L'agent se débloque** : c'est le point qui compte, et il est mesuré, pas supposé.

**Vérifié au navigateur** (Chrome isolé 9222 → webui 5181 → serveur 4097 sur la copie), sur une
vraie question en attente, DOM lu par CDP :

```
5181/question -> 200  content-type: application/json      ← le correctif, prouvé par le proxy
foundAt: 0  questionPresent: true
header: "Couleur"   text: "Quelle couleur veux-tu utiliser ?"
options: ["Blue (the calm one)…", "Red (the loud one)…"]
answerDisabled: true      (rien de coché : répondre reste impossible)
customField: true
```

### Ce que ce lot a coûté en méthode

Le premier essai de déclenchement a **expiré sans rien afficher**, et c'était une information :
j'avais utilisé la route **bloquante** `POST /session/{id}/message`, qui ne rend la main qu'à la fin
du tour — or le tour ne finit pas, il attend la réponse. La requête ne revenait donc jamais. C'est
une confirmation indépendante de la prémisse de §3.1 : la question bloque vraiment. Corrigé en ne
l'attendant pas (`void fetch(...)`).

Second coût, à consigner : l'expiration d'un shell **emporte son arbre de processus**. Le serveur de
dev (4097) et le serveur Vite (5181) lancés depuis un shell de cette session sont morts avec lui.
Les deux tournent désormais comme **tâches gérées** (`devdb-serve`, `webui-dev-5181`), qui survivent
aux shells. Piège déjà connu (F3), mais il s'est repayé ici.

### Réserve — close par la mesure

Le rejet (`Dismiss`) n'était pas vérifié de bout en bout ; il l'est désormais, sur une vraie question
en attente, avec la charge exacte du bouton (`POST /question/{id}/reject`, sans corps) :

```
GET  /question                       -> 1 en attente : que_136d7b062001UA70LSLJR4HYIs
POST /question/{id}/reject           -> 200 true
/event                               -> question.rejected = 1
                                        { sessionID, requestID: "que_136d7b062001UA70LSLJR4HYIs" }
GET  /question                       -> 0
trace de l'outil question            -> status "error", « The user dismissed this question »
session                              -> session.idle (l'agent est débloqué)
```

Le message d'erreur de l'outil est celui de `RejectedError` (`question/index.ts:96-98`) : le refus
remonte donc jusqu'à l'agent, qui sait **pourquoi** il a été débloqué et non seulement qu'il l'est.
Aucune réserve ne subsiste sur ce lot.

**Note de méthode** : cette vérification a aussi servi de nettoyage — la question utilisée était
celle laissée en attente par la vérification navigateur, donc le bac à sable est revenu à **0
question en attente**. Une vérification qui laisse l'environnement plus propre qu'elle ne l'a trouvé
vaut mieux qu'un nettoyage séparé.

---

## Lot suivant — copier, la seule action de lecture du fil (livré)

Dernier point de §3.9 : « copier une commande, un chemin, un bloc ». Vérifié dans le code avant de le
croire fait : **aucune** fonction de copie n'existait (`clipboard`, `writeText`, `onCopy` — zéro
occurrence dans `packages/webui/src`). Les quatre interactions de §3.9 sont donc désormais couvertes.

### Ce qu'on copie — la valeur, jamais le libellé

C'est la décision qui compte, et l'écart n'est pas cosmétique. La ligne d'un `bash` affiche son
**titre** — « Git status and diff stat » — qui ne sert à rien une fois recollé ; ce qu'on veut
recoller est la commande. Mesuré : `tool.state.title` est présent 2 242 fois sur 2 262 outils, et il
est une **description** pour un `bash`, un **chemin** pour `read`/`write`/`edit`. D'où deux règles
distinctes (`copyableText`) plutôt qu'une seule devinette — et rien à copier pour un outil dont le
titre est une phrase (`turn_plan`, `question`).

**Et l'on copie la sortie complète, jamais l'aperçu borné.** Copier les 12 lignes affichées quand
l'outil en a produit 412 donnerait un résultat tronqué **qui a l'air complet** : c'est le pire des
cas, et c'est pour ça que `copyableOutput` lit `state.output` et non l'aperçu.

### Où, et pourquoi là

§3.8 interdit un bouton au repos, et `AGENTS.md` impose que l'action se révèle **au survol de
l'élément qui porte l'information** — jamais dans une colonne à côté, où elle prendrait la place du
texte qu'on vient lire. D'où :

| emplacement | révélation |
|---|---|
| les chemins d'un patch | au survol de **la ligne qui porte le chemin** |
| la commande et la sortie, dans le détail d'un outil | visibles d'emblée — le panneau **est** déjà le dépli |

### Preuve

```
vitest run     -> 16 fichiers, 339 tests, exit 0   (+12 pour ce lot)
tsgo --noEmit  -> exit 0
```

Vérifié au navigateur sur l'instance isolée : le bouton apparaît dans le détail déplié avec son
libellé (« Copy output »), et un **clic fiable** (CDP `Input.dispatchMouseEvent`, pas un `.click()`
JS) rend `{"text":"copied","classes":"copy done","secure":true,"hasClipboard":true}`.

**Un faux négatif, et ce qui l'a rendu diagnosticable.** Le premier essai, par `.click()` en JS,
affichait **« failed »**. Ce n'était pas un défaut : `.click()` ne donne pas d'activation utilisateur,
donc `navigator.clipboard.writeText` refuse — et le repli `execCommand` échoue pour la même raison.
Ce qui a permis de le voir, c'est que le bouton **dit** son échec. S'il avait affiché « copié »
d'optimisme, j'aurais conclu que le presse-papiers marchait. La leçon est consignée dans `AGENTS.md`,
avec la méthode du clic fiable.

### Un dégât, et sa réparation

En insérant les règles CSS de ce lot, l'édition a **supprimé 51 lignes** de `styles.css` : mon
`oldString` avait ses deux extrémités éloignées dans le fichier, et le remplacement a couvert tout
l'intervalle — emportant `.boundary` et l'intégralité du bloc `.question` du lot précédent. Réparé par
`git checkout -- packages/webui/src/styles.css` (la révision commitée les contenait), puis réappliqué
avec des ancres **courtes et contiguës**, et vérifié par nombre de lignes **et** grep.

Second piège rencontré dans la foulée : `-SimpleMatch` **avec** `[regex]::Escape` cherche le backslash
littéral, donc **tous les compteurs rendaient 0** — j'ai failli croire la restauration ratée alors que
le fichier était sain. Les deux leçons sont dans `AGENTS.md`.

### Réserve — close par la mesure

Le clic fiable n'avait été observé que sur un bouton (« Copy output »), la révélation au survol des
chemins de patch restant non vérifiée. Elle l'est : sur une session réelle (101 patchs), ligne
ramenée au centre puis survol **fiable** par CDP :

```
au repos          -> opacité calculée "0"      (le bouton n'existe pas au repos, §3.8)
après survol      -> opacité calculée "1", li:hover = true
```

Les deux moitiés de la règle sont donc vérifiées : **rien au repos**, **révélé au survol de la ligne
qui porte le chemin**.

**Deux faux négatifs traversés pour y arriver, tous deux consignés dans `AGENTS.md`** — et tous deux
de mon fait, pas du code :

1. **Survol hors viewport.** Le fil est long : la ligne visée était à `y = -70553`, donc le survol
   ne touchait rien. Corrigé par `scrollIntoView({block:'center'})` **avant** de mesurer le rectangle.
2. **Sonde qui bascule.** Déplier un patch est un **basculement** : le run précédent l'avait laissé
   ouvert, donc le clic suivant l'a **refermé** (`liCount` 0). Corrigé en rechargeant pour partir d'un
   état propre et en rendant le dépliage **idempotent**.

Aucune réserve ne subsiste sur ce lot.

---

## Lot — densité, couleur, markdown, médias et statistiques (livré)

Quatre demandes, et un principe qui les tient ensemble : **par défaut rien de technique, et la
richesse n'apparaît que quand elle porte du contenu**.

### 1. La densité — révisée deux fois, la seconde par l'usage

Le fil ne pèse que **10,6 % de texte** (823 parts sur 7 782) : le lire tel quel, c'est lire 90 % de
matériel de vérification.

**Première tentative, rejetée.** Replier tout le travail derrière un contrôle unique « work ».
Verdict de l'intéressé : *« tu as fait en sorte d'afficher peu mais au final tu n'affiches rien du
tout »*. Le repli n'allégeait pas le fil, il le **vidait**. Et la **bordure gauche** ajoutée aux
lignes d'action a été rejetée dans le même mouvement : une bordure par ligne transforme la liste en
colonne de bandes.

**Version retenue — le flux.** Le travail défile **en continu, une ligne par fait**, toujours visible,
dans l'ordre des faits ; le détail se déplie sur **l'entrée elle-même**. Ce qui allège n'est pas de
cacher, c'est de **tenir en une ligne** — et le travail *était déjà* une ligne : le repli n'ajoutait
rien qu'une disparition. C'est la leçon la plus utile de ce lot, et elle est écrite dans §9.2.

### 2. Les statistiques déménagent — §9.3

`stepSummary` (« step 3 · 6 actions · 2.8s · $0.0008 · 48.6k tokens ») **quitte le fil**. Tout le
registre — nombre de tours, temps, jetons, coût — vit dans **le tiroir droit, onglet « Session »**,
ouvert par un bouton `stats` **toujours présent** dans le pied du rail. La ligne d'étape rejetée du
fil **est** le contenu de cette section.

Distinction qui gouverne le tri : `+12 −3` décrit le fichier (**reste**), `$0.0008` décrit la facture
(**part**).

### 3. La couleur — une grammaire, pas une décoration — §11

Les **douze familles** de `tool-icons.ts` reçoivent chacune une teinte, appliquée à l'**icône**
seulement : `fam-read` bleu, `fam-write` ambre, `fam-shell` vert, `fam-search` cyan, `fam-web` violet,
`fam-subagent` turquoise, `fam-ask` indigo, `fam-plan` ardoise, `fam-skill` rose, `fam-goal` orange,
`fam-todo` gris-bleu, `fam-generic` gris. La couleur ne peut pas diverger de l'icône : même source.
Une erreur reste rouge — la famille dit ce que fait l'outil, pas s'il a échoué.

### 4. Markdown, médias, documents — §12

- **Markdown** rendu par un analyseur **maison** (`markdown.ts`) qui produit un **arbre**, jamais du
  HTML : titres, listes, code clôturé avec sa langue, citations, tableaux, filets, et en ligne code /
  gras / italique / liens / images. **Sûr par construction** : tout le texte passe par Solid, donc il
  est échappé ; un `<img onerror=…>` dans une réponse reste du texte. Les destinations sont filtrées
  (`safeHref`) : `javascript:`, `data:text/html`, `vbscript:`, `file:` sont refusés ; les adresses
  relatives passent, et une `data:image/…` n'est acceptée **que** pour une image.
- **Médias** : « on rend quand on a les octets, on nomme quand on ne les a pas ». Les parties qui
  portent une **data URL** s'affichent (images, vidéos) — `state.attachments` en porte 25, mesuré.
  Un **chemin** seul ne peut pas s'afficher, et c'est une **limite mesurée** : `GET /file/content`
  rend `{"type":"text","content":""}` sur une image — il lit du texte, il ne sert pas d'octets.
- **Documents** : à la fin du dernier step de la dernière réponse, les fichiers des patches et des
  écritures (`metadata.filediff`), avec leurs ±lignes et la copie du chemin. Vide ⇒ il n'existe pas.

### Preuve

```
vitest run     -> 17 fichiers, 389 tests, exit 0
tsgo --noEmit  -> exit 0
vite build     -> exit 0
```

Navigateur (Chrome isolé → webui 5181 → serveur 4097 sur la copie), DOM lu par CDP :

```
sessions portant un media rendable : 29, dans 6 sessions (mesure sur 60 sessions, 20 309 parties)
markdown rendu                     : 1 108 paragraphes sur une session
familles appliquées                : fam-plan, fam-goal, fam-shell, fam-read (24 lignes d'action)
documents rendus                   : .docs = 1
densité et bordure (après révision):
  toolLinesAtRest    = 2          workToggles = 0
  toolLineBorderLeft = "0px none" toolHostBorderLeft = "0px"
  statsInThread      = false
```

### Réserves, exactement

1. **Les médias ne sont pas observés au navigateur.** 29 parties rendables existent (mesuré), mais
   aucune session scannée — 26 sessions, tous replis ouverts, 100 lignes de rail — ne les a rendues,
   et **créer une session d'essai échoue** : une partie `file` dans un message utilisateur **ne
   persiste pas** (`messages: 0`, deux routes essayées, `prompt_async` compris). Le chemin est donc
   couvert par les tests et par la forme mesurée, pas par une observation d'écran.
2. **Le rendu n'a pas été jugé par l'utilisateur** après la révision : les mesures ci-dessus disent
   que le travail est visible et que la bordure est partie, pas que le résultat plaît.

---

## Lot — l'interligne du flux (livré)

Demande : *« réduit les interlignes entre les appels d'outil, cela occupe de la place inutilement »*.

L'espace venait de **trois** endroits, et un seul n'était pas évident :

| source | avant | après |
|---|---|---|
| `padding` vertical d'une ligne d'action (`padding: 3px`) | 3 + 3 px | `padding: 1px` → 1 + 1 px |
| `padding` vertical d'une ligne de réflexion | 3 + 3 px | 1 + 1 px |
| `gap` de l'étape (entre items d'un même travail) | 2 px | 0 |
| **`gap` du tour** (entre deux étapes voisines) | 8 px | **6 px, puis 0** |

Le quatrième était le vrai coupable : après avoir resserré les trois autres, la mesure donnait encore
**30,4 px** entre deux lignes pour une hauteur de ligne de **24,4 px** — donc 6 px d'air venus du
`gap` du tour, qui sépare les étapes. Or ce `gap` servait **aussi** à séparer la prose du travail.

**La solution n'est pas de supprimer l'air, mais de le déplacer.** La prose (`.prose`) et les
documents (`.docs`) portent déjà leurs propres marges ⇒ le tour peut passer à `gap: 0` : les appels
d'outil se touchent, la prose respire, et rien n'a été perdu.

**Mesure avant/après, sur une même session** (795 appels d'outil ; l'ancienne feuille servie depuis
`183c26855`, puis `HEAD`, même session, même sonde — le CSS étant versionné, la comparaison se fait
sans rien reconstruire) :

```
                        AVANT (183c26855)   APRÈS (HEAD)
hauteur d'une ligne     28,4 px             24,4 px
écart entre 2 appels    36,4 px             24,4 px
padding vertical        3 px                1 px
hauteur de la pile      70 475 px           55 719 px
deltasPremiers          [36.4, 36.4, 71.2]  [24.4, 24.4, 47.2]
```

**14 756 px libérés sur cette session.** L'écart entre deux appels consécutifs vaut maintenant
**exactement** la hauteur d'une ligne : l'air ajouté est nul.

**Une estimation fausse, corrigée par la mesure.** J'avais d'abord annoncé « ~4 800 px » à partir
d'une **reconstruction** des anciennes valeurs — trois fois trop peu. L'erreur : j'avais supposé que
la hauteur de ligne ne changeait pas, alors qu'elle baisse aussi de 28,4 à 24,4 px (4 px × 795 = 3 180 px,
en plus des écarts). Leçon : quand les deux états existent dans l'historique, **mesurer les deux** au
lieu de reconstruire l'un depuis l'autre — c'est moins cher que l'erreur qu'on publie.

`vite build` exit 0, `tsgo --noEmit` exit 0, 389 tests. Au passage, `.work-body` — CSS mort du repli
retiré au lot précédent — est supprimé.

**Leçon de méthode** : un `gap` sur un conteneur de flux ne sépare pas « les blocs » comme on le croit,
il sépare **chaque enfant**. Quand un conteneur mêle des blocs et des lignes, la séparation doit être
portée par les blocs, pas par le conteneur.

---

## Lot — le markdown du prompt, aux deux bouts (livré)

Deux demandes : mettre le prompt en markdown **dans le fil** et **à la saisie**, et prendre modèle sur
une capture d'inspiration pour les liens, la mise en forme, les documents et le compositeur.

### 1. Le markdown au prompt — et ce qu'il ne fallait pas perdre

Le prompt passe par le **même** moteur que la prose de l'agent (§12.1) : un prompt s'écrit en markdown,
le montrer en texte brut obligeait à lire des `**` et des `#`.

**Un point de correction, repéré avant d'écrire** : le fil affichait le prompt avec ses retours à la
ligne (`white-space: pre-wrap`). Or le markdown **écrase** les retours simples ⇒ le rendre sans rien
aurait **retiré** une chose que le lecteur avait. D'où les **sauts durs** (`  ` ou `\` en fin de ligne,
du markdown standard) : la coupure marquée par l'auteur survit, les autres se rejoignent.

Corollaire : `pre-wrap` sur `.prompt` est devenu **faux** — il doublerait les coupures déjà rendues.
Retiré.

### 2. La coloration à la saisie — un calque, pas un rendu

**Un `textarea` ne peut pas rendre du markdown bloc** : un titre, une liste ou un bloc de code changent
la mise en page, donc le curseur décroche. La parade n'est pas de renoncer mais de **séparer** :

- le champ reste un `textarea` — le seul contrôle qui garde un curseur, une sélection et le
  copier-coller du système ;
- un **calque** posé **dessous** , à métriques identiques, colore la syntaxe, et le texte du champ est
  rendu **transparent**.

**Trois règles, et la deuxième a failli être manquée** :

1. Le calque **ne change que la couleur** — rien qui touche à la largeur ou à la hauteur.
2. **Les deux couches déclarent la même police, explicitement.** Un `textarea` n'hérite pas la police
   de l'application : sans déclaration il prend celle du **navigateur**, alors que le calque, lui, en
   hérite. Ce piège a été vu **en lisant le CSS** — `.composer textarea` ne déclarait aucune police —
   pas en le constatant à l'écran.
3. **La concaténation des segments rend la source, caractère pour caractère** : c'est la propriété qui
   protège le curseur, et elle est testée sur **21 entrées** couvrant chaque forme reconnue, plus des
   cas tordus (marqueur non fermé, lien cassé, `snake_case_name`).

Les marqueurs restent **visibles**, simplement atténués : on **écrit** dans ce champ, on ne le lit pas.

### 3. Les documents — des cartes à badge de type

Un badge porte les lettres de l'extension, teinté par **nature** de fichier (code, données, style,
documentation, script, média) — la teinte dit la nature, **pas le langage**. Deux cas que la devinette
raterait : un fichier **sans** extension n'a pas de lettres à montrer, et un **point en tête**
(`.env`) est un nom, pas une extension — d'où le test `dot > 0` et non `>= 0`.

### Preuve

```
vitest run     -> 17 fichiers, 413 tests, exit 0
tsgo --noEmit  -> exit 0
vite build     -> exit 0   (CSS 32,21 ko / 6,15 ko gzip, JS 159,09 ko / 44,30 ko gzip)
```

### Deux erreurs d'outillage, à consigner

1. **Validation lancée depuis la racine du dépôt** : `bun test` y est **volontairement bloqué**
   (`do not run tests from root`) et le script `build` n'y existe pas. Le « test exit=1 » que j'ai lu
   n'était donc **pas** un échec de test — j'ai failli corriger un défaut inexistant. Les commandes du
   paquet se lancent depuis `packages/webui`.
2. **Deux tours consécutifs ont produit une action mal formée** (appel d'outil tronqué), donc deux
   corrections écrites mais **non appliquées** — dont celle d'un test. Détecté en vérifiant l'état
   réel du fichier avant de conclure, pas en me fiant à ce que je croyais avoir envoyé.

---

## Lot 8 — l'espacement, la copie, la saisie, les statistiques et les injections

Huit demandes d'un seul tenant, du plus petit (un cran d'air) au plus structurant (le clavier de la
saisie). CIBLE.md §10.1 et §13.3–13.5 sont écrits **pour** ce lot.

### 1. L'air — au-dessus de ce qui ouvre un bloc

`6516a67d2` (le pas entre deux tours : `.transcript { gap }` 22 → **26 px**) et `0c471ecdc` (un
thinking **ouvre** un bloc ⇒ `.reasoning { margin-top: 8px }`). La règle est écrite en §3.7 : l'air se
met **au-dessus de ce qui ouvre un bloc**, jamais entre deux lignes du même bloc — deux appels d'outil
qui se suivent restent au ras. Vérifié au navigateur : **209 blocs**, tous à `marginTop: 8px`.

### 2. La copie — une action vit **sous** la carte, pas dessus

`eb1ff694f`. Le bouton posé dans le coin de la carte mordait le texte : il est passé **sous** elle
(`.prompt-block > .prompt-foot`), réduit à une **icône** à trois états (copier / fait / échoué)
remplaçant le dessin dans la même boîte, sans jamais un mot. Vérifié : `.prompt-foot .copy-icon svg`
= 1, `gap: 4`, aligné à droite.

### 3. La barre de défilement — mesurer **le bon** composant

`23dfe6458`. Le premier correctif visait `.tool-detail pre` — **faux** : le bloc de la capture était un
bloc de code **markdown** (`.md-block > .md-lang` + `.md-pre`). Le piège mérite d'être consigné : un
« bloc commande » à l'écran n'est pas forcément `.tool-detail pre`, et `.tool-detail pre` replie donc
son `scrollW == clientW`. Corrigé sur `.md-pre`, plus `scrollbar-width: thin` pour Firefox et
`.md-block { overflow: hidden }` pour rogner la barre sous les coins arrondis.

### 4. La saisie — les deux choix, l'envoi en icône

`dc4af6115`. Modèle et agent se choisissent dans la barre du champ et partent avec le message
(`promptAsync` accepte `model` et `agent`) — donc rien n'est écrit dans la configuration. Amorcés par
**ce que la session a utilisé** (`providerID`/`modelID`/`agent` de la dernière réponse ; la
configuration ne donne qu'un défaut global). Le bouton *Send* devient une **flèche**. Vérifié :
2 déclencheurs (« DeepSeek V4.1 Flash · OpenCode Go », « build »), `.send` = 28 px, **1 svg**.

### 5. Les statistiques — sous le champ

`dc4af6115`. Quatre groupes (`turns · steps`, `tok/s`, `tok`, `cached`, `context`), chacun avec sa
mesure en infobulle ; un groupe dont la donnée manque **disparaît** — sans limite de fenêtre connue,
pas de « 0% context ». Le détail par étape reste dans la section. CIBLE.md §10.1.

### 6. Le clavier et les suggestions

`6f2203543` + module pur `composer-keys.ts` (25 tests). `/` en tête, `@` qui commence un mot, `Tab`
change l'agent **au même appui**, deux `Échap` (700 ms) arrêtent, `↑`/`↓` remontent l'historique
**dérivé des messages**. La liste vit **au-dessus du champ, dans sa boîte**, et consomme les flèches.
Vérifié au navigateur : `/` → **207** lignes, `/comm` → 41, `@pack` → 11 fichiers.

Deux pièges corrigés en cours de route : `client.find.files` (et non `find.file`), et le premier `Tab`
qui ne faisait que **charger** la liste — il change désormais au même appui, sinon cela se lit comme
une panne.

### 7. Les injections — dépliables, et honnêtes sur ce qui est lisible

`5d83b3488`. Les sources d'instructions se déplient : chemin **entier**, puis contenu. La règle de
lecture a été **mesurée** et non devinée — `/file/content` résout `path` **sous la racine du projet**
et rien d'autre :

```
path=AGENTS.md&directory=<projet>/packages/opencode   -> 7 291 octets
path=<chemin absolu>                                  -> ""          (vide)
path=<fichier hors du projet>                         -> 500
```

Or les injections portent des chemins **absolus**, dont `~/.config/opencodev2/AGENTS.md`, hors projet
par nature ⇒ `relativeTo(path, worktree)` décide, et l'écran dit **« not readable from here »** au lieu
d'afficher une boîte vide. Vérifié au navigateur, **les deux branches** : un fichier hors projet dit
« not readable from here » ; `packages\opencode\AGENTS.md` rend son aperçu de **40 lignes**
(« # opencode database guide… »).

### Preuve

```
vitest run     -> 18 fichiers, 461 tests, exit 0
tsgo --noEmit  -> exit 0
```

### Quatre erreurs d'outillage, à consigner

1. **`EscapeDataString` encode `/` en `%2F`** ⇒ un chemin envoyé ainsi ne se résout pas : trois sondes
   ont rendu « contenu vide » avant que je comprenne que la **sonde**, pas la route, était fautive.
   Corollaire : un résultat vide n'accuse pas le serveur tant que la requête n'est pas vérifiée.
2. **Toute la pile de dev était morte** (4097 *et* 5181) et l'onglet affichait « Ce site est
   inaccessible » : le rail vide ressemblait à un plantage de **mon** code. Diagnostic dans l'ordre
   (`/json/list` → santé des deux serveurs) ⇒ c'était l'outillage. Ne jamais conclure au défaut de code
   avant d'avoir sondé les serveurs.
3. **`navigate`/`reload` par CDP tue de nouveau l'attachement** (mesure confirmée) ⇒ redémarrer Chrome
   du profil isolé ; et le bundle servi avant l'édition peut être l'ancien, ce qui fait croire que le
   code ne marche pas.
4. **Le shell emporte ses enfants** : les serveurs lancés par `Start-Process` meurent avec lui, d'où la
   pile retrouvée morte. Les relancer via `cmd /d /c` (`Start-Process` refuse le shim `.ps1` de `bun`).

---

## Lot 9 — cinq retours d'usage, et une navigation corrigée

Cinq défauts signalés après le lot 8, dont **un vrai bug fonctionnel** que la vérification du lot 8
avait manqué : le menu de choix du modèle était inutilisable.

### 1. Le menu du modèle se refermait (bug)

`fa58ae436`. Le popup porte 696 modèles : on le fait défiler, et l'événement `scroll` remonte en phase
de **capture** jusqu'au `document`, où le gestionnaire « le défilement ferme le popup » le refermait
avant qu'on ait pu cliquer. Corrigé en ignorant tout ce qui part de l'intérieur du popup
(`pop?.contains(event.target)`).

**Pourquoi le lot 8 ne l'avait pas vu** : sa sonde mesurait l'ouverture du popup, jamais un clic
dedans. Une vérification qui n'exerce pas le geste ne prouve pas que le geste marche — et
« le popup s'ouvre » n'est pas « on peut choisir ».

Vérifié par un test A/B : clic souris CDP sur la ligne réelle (`y=697`) ⇒ la valeur passe à
`DeepSeek V4 Pro 0813 · OrcaRouter` et le popup se ferme. Les échecs précédents venaient de la **sonde**
(elle cliquait `y=594`, dans la bande du filtre — `filter: 576→612`), pas du code.

### 2. Les statistiques sont centrées

`justify-content: center` sur `.composer-stats` : les groupes se lisent comme **une** ligne de
contexte, dans l'axe du champ. Mesuré : `justifyContent: "center"`.

### 3. La barre du bloc de contenu d'injection

`.inj-source-text` n'était pas dans les règles de barre (le défilement venait de la barre **native** de
Chromium). Ajoutée aux quatre groupes (piste, pouce, coins, plus `scrollbar-width: thin` pour Firefox).
Mesuré : `scrollbar-width: thin`, `scrollbar-color: rgba(255,255,255,0.19) transparent`.

### 4. Le champ ne s'arrêtait plus à cinq lignes

`field-sizing: content` + plafond à 340 px, et suppression d'un `max-height: 200px` **rival** : la règle
`.composer textarea` (plus spécifique que `.composer-input`) recopiait le plafond et l'emportait. Une
règle qui recopie la mise en page d'une autre finit par la contredire — elle ne garde plus que ce qui
n'est pas dit ailleurs. Mesuré : 10 lignes ⇒ **227 px**, `defile: false` (`scrollH == clientH`).

### 5. La navigation — corrigée une première fois de travers

`fa58ae436`. Première tentative : `Session | Config | Logs` dans le pied du rail. **Faux** — l'utilisateur
a corrigé : les **réglages** restent au pied du rail (une préférence n'est pas une vue), et les vues
`Session` / `Logs` vont dans une **barre au-dessus du chat** qui commute le contenu du panneau
principal. CIBLE.md §4 le dit maintenant.

Vérifié au navigateur : pied = `["stats","settings"]` ; barre de vues = `["Session","Logs"]` ; clic
`Logs` ⇒ `.transcript` **disparaît**, le compositeur disparaît, 4 lignes de journal s'affichent ; clic
`Session` ⇒ la conversation et le compositeur reviennent.

### Preuve

```
vitest run     -> 18 fichiers, 461 tests, exit 0
tsgo --noEmit  -> exit 0
```

### Leçon

Trois des cinq échecs de sonde venaient de la **sonde**, pas du code (clic dans la bande du filtre,
mesure avant le rendu du compositeur, `y` hors viewport). La règle qui les couvre toutes : **vérifier
que la cible mesurée est bien celle qu'on croit** — `elementFromPoint` au point cliqué, et attendre
l'élément avant de le mesurer.

---

## Lot 10 — la trajectoire par tour dans la vue Logs

`59cf3281e`. La vue `Logs` montrait des événements bruts ; elle montre maintenant la **trajectoire**
de la session, un bloc par tour, avec de quoi diagnostiquer chacun (CIBLE.md §10.2).

### Ce que porte un tour

`view-model.ts` : `TurnView` gagne `info` (l'information du message) et `replies` (les réponses
d'agent, **avec leur information**), et `StepView` gagne `reason` (le motif d'arrêt). `trajectory()`
projette le tout en `TurnTrace[]` : agent/mode/modèle, durée, taille du prompt, injections, jetons
séparés par origine, étapes (outils, motif, jetons, durée), erreur.

### La correction qui compte : le modèle qui a **servi**

Première écriture fautive : je lisais le modèle dans `turn.info` — c'est-à-dire le message de
l'**utilisateur**, qui ne porte que ce qu'il a *demandé*, et sous une forme différente (imbriquée :
`model.providerID`). Le modèle réel, le mode, la borne de fin et l'erreur vivent sur les messages
d'**agent**. `TurnView.replies` a été ajouté pour les porter, et la trajectoire lit la **dernière**
réponse, en retombant sur la demande quand il n'y en a pas (question en attente). Sans cela, l'écran
aurait annoncé un modèle que rien n'a utilisé.

### Deux tests qui ont échoué — et le code avait raison

`vitest` a refusé deux tests sur trois, tous deux avec une étape réduite à `step-finish`. La cause était
la **règle de regroupement** : `groupSteps` écarte une étape **sans contenu et sans prix** (un
`step-start` resté seul). Mes fixtures passaient `cost: 0` sans contenu : l'étape était donc écartée, à
raison. Un `step-finish` réel porte toujours un prix — les fixtures ont été corrigées, et un troisième
test a été **ajouté pour épingler la règle**, puisqu'elle se voit désormais à l'écran.

### Vérification

```
vitest run     -> 18 fichiers, 479 tests, exit 0
tsgo --noEmit  -> exit 0
```

Au navigateur (instance isolée 5181), sur une session réelle : `#1 user build build
opencode-go/deepseek-v4.1-flash 7m23s $0.004` · `prompt 618 chars` · `injected 3 files` ·
`tokens 26 463 in · 213 out · 23 040 cached` · `step 1 question tool-calls 26 463↓ 213↑ 1.2s` ·
erreur `getaddrinfo ENOTFOUND opencode.ai` · `Raw events (3)` repliés. Aucune erreur de console.

Le diagnostic a **immédiatement** montré sa valeur : cette erreur réseau était invisible dans le fil.

---

## Lot 11 — la vue Logs refaite sur le design de DSH

Retour d'usage : « je n'aime pas ce que tu as fait des logs en terme de design, reproduis exactement
celui de dsh, même composant design et informations ». Le lot 10 avait inventé une forme ; celui-ci
**reprend celle de DSH**.

### La source, localisée

DSH = DeepSeek Harness, présent dans `C:\jeanluc\`. Le composant de trajectoire est
`dsh-plugins\dsh-TUI\src\components\TraceView.tsx` (135 lignes) et son modèle de données
`dsh-adapter\trace.ts` (324 lignes) — lus, pas devinés.

### Ce qui a changé

`TraceTimeline` remplace la liste de cartes dans la vue `Logs` : une ligne par événement,
`HH:MM:SS  glyphe  résumé  (durée)`, en chasse fixe. Glyphes, couleurs d'issue, atténuation du
raisonnement, filtres de type (`all`/`tool`/`thinking`/`message`/`progress`) et troncature des
résumés : **identiques** à DSH.

Le détail par tour (jetons par origine, injections, contexte, cwd, erreur) et les événements bruts
sont **descendus dans le tiroir `Session`** : la timeline dit ce qui s'est passé, le tiroir dit à quel
prix. CIBLE.md §10.2 et §10.3.

### Le défaut que la vérification a trouvé

Première mesure : **7 lignes**, dont deux `❯` intitulées « Instruction injections · 3 source(s) » et
« Context injections · 3 section(s) ». DSH les exclut explicitement (`user/message` : « Only direct
human prompts are trajectory items; injected context … mirrors the transcript's filtering »). Chez
nous le contexte injecté arrive comme du **texte du prompt** : sans filtre, la timeline annonçait comme
« prompt » ce que l'humain n'avait pas écrit. Corrigé (`parseInjections` écarte ces parties), et
épinglé par un test.

Seconde mesure : **5 lignes**, et le filtre `tool` réduit bien à **1 ligne** (`⏺`). La première sonde
avait conclu à tort que le filtre ne marchait pas : `:nth-child(2)` visait `.trace-count`, pas un
bouton — **erreur de sonde**, corrigée en `:nth-of-type`.

### Preuve

```
vitest run     -> 18 fichiers, 495 tests, exit 0
tsgo --noEmit  -> exit 0
```

Au navigateur (instance isolée 5181) : titre `Trace`, sous-titre `Session event timeline · filter: all ·
1562 entries`, filtres `[all*, tools, thinking, messages, progress]`, lignes `▶ turn 1 (1m50s)` ·
`❯ Nous allons poursuivre…` · `∙ turn 1 · step 1 (3.0s)` · `✻ The user wants me to…` ·
`⏺ bash Shows working tree status… (13ms)` en vert, `font-family: "JetBrains Mono", ui-monospace,
monospace`. Clic sur `tools` -> `filter: tools · 607 entries`. Aucune erreur de console.

### Les libellés, mot pour mot

`7dedc683a`. Ma première version **inventait** ses libellés (« Trajectory », « 7 lines »,
« tool », « message », « No trajectory lines. »). J'ai ensuite lu l'`i18n.ts` de DSH : ce sont
`Trace`, `Session event timeline · filter: {{filter}} · {{count}} entries`, `tools`, `messages`,
`No trace events yet`. Le pluriel est **dans DSH** — une clé interne (`tool`) n'est pas un libellé, et
confondre les deux suffisait à diverger. Alignés.

**Une divergence assumée** : DSH cache ses filtres derrière `f` et affiche
`↑/↓ PgUp/PgDn g/G to scroll · f to filter · Esc/q to close`. Ces touches n'existent pas dans un
navigateur : reprendre la ligne d'aide aurait été un **faux affordance**. Les filtres sont donc des
boutons visibles — ce que DSH cache faute de place, ici montré faute de raison de le cacher.

---

## Lot 12 — la vue `Trajectory`, reprise de **l'écran** de DSH

Retour d'usage, capture à l'appui : « je n'aime pas ce que tu as fait des logs en terme de design,
reproduis exactement celui de dsh » — puis, la capture montrée : **« tu n'as pas pensé à faire une
vérification visuelle »**.

### L'erreur, nommée

Le lot 11 avait rendu hommage à DSH en lisant `dsh-TUI/src/components/TraceView.tsx` — un composant de
**terminal** — et en reproduisant sa timeline `HH:MM:SS glyphe résumé (durée)`. C'était du DSH, mais
pas **celui de l'écran**. La référence était l'onglet `Trajectory` de l'application, et je ne l'avais
jamais mis côte à côte avec mon résultat : c'est exactement pour cela que l'écart n'a pas été vu.

Ce qui aurait dû être fait au lot 11 : **regarder l'écran d'abord**. Le composant de DSH n'est pas
lisible localement (client packagé ; `dsh-identite` n'est qu'une *skin*), donc la capture **est** la
spécification — et une capture se compare.

### Ce qui est livré

`trajectory-view.tsx` (vue) et `trajectory.ts` (modèle pur) :

- **Barre d'outils** — `Duration`, `Turns`, `Calls`, et une recherche.
- **Diagramme en pistes** — `Input`, `Model`, `Tools`, barres **proportionnelles au temps**. Mesuré sur
  une session réelle : 61 barres `Input`, 399 `Model`, 611 `Tools`, pour 995 lignes.
- **Liste** — badge `USER`/`ASSISTANT`/`TOOL`, contenu à gauche, résultat à droite après `→`, marge
  teintée par genre, repères `Turn N` au changement de tour.
- **Panneau de détail** (ce que la seconde capture demandait) — `Summary` (Hierarchy, Status, Payload,
  Result), `Payload`, `Result`, `Schema`, `Timing`. Le `Schema` vient de `GET /experimental/tool`
  (**61 ko**, payés à l'ouverture de la vue), et la route a dû être ajoutée à `API_PREFIXES` — sans
  quoi le proxy aurait rendu `index.html` en 200 et l'onglet serait resté vide **sans erreur**.

### Deux bugs trouvés par les tests

La suite de `trajectory.ts` (19 tests) a révélé deux défauts réels :

1. **`spanPlacement` débordait** : la largeur était bornée d'après la position *non* bornée, donc une
   barre commençant avant l'intervalle donnait `left 0` + `width 150`.
2. **Un tour sans horodatage disparaissait** — et avec lui ses outils et ses étapes. Le serveur ne donne
   pas toujours `time.created` : on le place à 0 plutôt que de l'écarter.

### Preuve

```
vitest run     -> 19 fichiers, 514 tests, exit 0
tsgo --noEmit  -> exit 0
```

Au navigateur (instance isolée 5181), sur une session réelle : barre d'outils `Duration/Turns/Calls` +
recherche, pistes `Input/Model/Tools`, badges `USER/ASSISTANT/TOOL`, ligne `TOOL bash {…} → Found 9
matches…`. Panneau ouvert sur une ligne `TOOL` : `Hierarchy Assistant message`, `Status Completed`,
onglet `Schema` rendant la description réelle de `bash` et ses paramètres JSON, onglet `Timing`
rendant `Started 2026-10-13 15:27:45.804` et `Duration 64ms`. Aucune erreur de console.

### La règle

**Quand la référence est un écran, la vérification est une comparaison d'écrans.** Reproduire un
composant sans le regarder revient à deviner — et deviner juste est un hasard, pas une méthode.

---

## Lot 13 — la barre latérale : des workspaces, pas des sous-chemins (livré)

Demande : « implémente la barre latérale complète du harnais agentique généraliste », référence à
l'appui — la liste des workspaces de DSH (`DS Bot`, `mcp-servers`, `opencodev2`, `opencode-fork` ✓,
`auxiflow`, `jeanluc`, `deepseek_harness`, `+ Add workspace…`).

### Ce que la mesure a dit, avant de toucher au code

Le rail n'était **pas vide** : `.rail-head` (le nom), `.rail-new` (« New session », 40 px), une entrée
`plugins` **ouverte par défaut** (171 px, ses 4 plugins listés), « WORKSPACES » avec une recherche, et
un pied portant le sélecteur de dossier. Ce qui manquait n'était pas une partie : c'était la **nature
de la troisième**.

Deux faits mesurés sur la pile isolée (5181), sonde CDP bornée :

| fait | mesure |
|---|---|
| le groupe affiché | `packages/opencode` — un **sous-chemin** du dossier courant, pas un workspace |
| la ligne du courant | **aucune coche**, alors que la référence en montre une |

Première cause : `loadSessions` passait `scope()` (`{ directory }`), donc le serveur ne rendait que
les sessions du dossier courant, et `groupByDirectory` regroupait sur `session.path` — le chemin
**relatif**. Un seul groupe, par construction.

Seconde cause : `folderChoices` comparait `pathKey(projet)` à `pathKey(dossier courant)`. Le dossier
courant est `…\opencode-fork\packages\opencode`, les projets connus sont des **racines** : aucun
n'était égal, donc la coche ne pouvait pas s'afficher.

### Ce qui était déjà là — et qu'il ne fallait pas refaire

`FolderPicker` (`picker.tsx`) **est** la forme de la référence : déclencheur dossier + nom + chevron ;
liste avec icône dossier, nom, coche sur le courant ; séparateur ; `+ Add workspace…`. Mesuré ouvert :
**26 dossiers** rendus sur 436 px de haut. La forme n'était pas à écrire, elle était à **corriger**.

### Ce qui est livré

| fichier | ce qui change |
|---|---|
| `sessions.ts` | `groupByWorkspace(sessions, projects, current)` — rattachement d'une session à son **projet** par préfixe de chemin normalisé, projet le plus long gagnant, repli sur son propre dossier sinon, courant marqué par **préfixe** |
| `components.tsx` | `WorkspaceGroup` porte la **coche** du courant |
| `app.tsx` | le rail groupe par workspace ; `loadSessions` lit **toutes** les sessions (sans `scope()`) ; la dernière ligne de la liste est `Add workspace…`, champ à l'ouverture |
| `styles.css` | la coche, la ligne d'ajout |

### Preuve

```
vitest run     -> 21 fichiers, 565 tests, exit 0   (8 tests neufs sur le regroupement)
tsgo --noEmit  -> exit 0
```

Au navigateur, après **rechargement** (une page gardée ne reprend pas les derniers changements — leçon
du lot précédent) :

```
WORKSPACES: 1 | sessions visibles: 4 | colonnes 280
   [x] opencode-fork | 100 sessions | C:\jeanluc\opencode-fork
LIGNE D'AJOUT: 1 | POPUPS OUVERTS: 0
```

**Un seul workspace — et c'est juste.** Les 100 sessions de ce serveur appartiennent toutes à
`C:\jeanluc\opencode-fork`. La référence en montre sept parce que DSH en avait sept : la référence
donne la **forme**, jamais les **données** — leçon déjà écrite, vérifiée ici dans l'autre sens.

### La règle

**Le rail liste les workspaces où l'on a travaillé, pas les sous-chemins d'un seul.** Un workspace se
reconnaît à son **projet**, se marque par **préfixe** (on travaille dans un sous-dossier de son
workspace), et n'apparaît que s'il porte **au moins une session** : un workspace vide serait une ligne
qui ne dit rien (§8).

---

## Lot 14 — la barre latérale : un retrait, un patron, un pied qui tient (livré)

Retour d'usage sur capture, en douze points. **Chacun a été confronté à une mesure avant d'être
corrigé** — c'est la consigne, et elle a changé le diagnostic sur un point au moins.

### Les douze points, et ce que la mesure a dit

| point | verdict | mesure |
|---|---|---|
| logo non centré | **vrai** | `.wordmark` à x=24 sur 280 (centré = 83) |
| … sans padding défini | **inexact tel quel** — mais quatre retraits | 8 (libellé), 10 (boutons), 24 (logo, pied), 32 (sessions) |
| « New session » : libellé non centré | **vrai** | `text-align: left` |
| … `background` non défini | **vrai** | `rgba(0,0,0,0)` |
| … patron de bordure non défini ni utilisé | **vrai** | `.ghost.bordered` existait et n'était appliqué **nulle part** |
| plugins inutile en l'état | **vrai, et pire** | chaque ligne portait la **même** icône générique, et `onRun` n'était **jamais** fourni : elle n'ouvrait rien |
| recherche + ajout en deux boutons sur la ligne | **vrai que ce n'était pas le cas** | libellé x=8, recherche pleine largeur sur sa propre ligne, ajout en bas de liste |
| pas besoin de l'icône ouvert/fermé | **vrai** | 3 SVG par ligne de dossier (chevron, dossier, coche) |
| ajouter une session depuis le dossier | **vrai qu'il manquait** | enfants = chevron, icône, libellé, coche, compteur |
| sélecteur du pied inutile | **vrai** | deux voies pour un geste, et le contrôle le plus lourd de la colonne |
| « stats » est un bouton mort | **vrai à l'écran — faux dans le code** | voir ci-dessous |
| « settings » ne se lit pas comme un bouton | **vrai** | fond transparent, **bordure 0 px**, aucune icône |

### Le défaut que la mesure a déplacé

« Stats est mort » était vrai **à l'écran**, mais le bouton n'était pas mort : il basculait bien son
état, et `drawerOpen` passait à vrai. La faute était **en amont**, dans la largeur :

```js
const detailsWidth = () => (permissions().length > 0 ? columns().details : 0)
```

La colonne du tiroir ne recevait une largeur **qu'en présence d'une permission**. Mesuré : `.side`
faisait **0 px** avant le clic, **1 px** après — le 1 venant de sa propre bordure gauche — alors que son
contenu (4 348 caractères) était bien rendu. Le panneau se dessinait dans une colonne invisible.

**Un bouton qui agit et dont l'effet ne se voit pas est pire qu'un bouton mort** : il fait douter de
l'écran entier. La cause est corrigée, et elle explique aussi pourquoi le tiroir n'avait jamais montré
les statistiques depuis §10.

### Ce qui est livré

| fichier | ce qui change |
|---|---|
| `styles.css` | jeton **`--rail-pad`** (un seul retrait) et patron **`.rail-button`** ; ligne de dossier restructurée ; CSS mort retiré (`plugin-row`, `plugin-icon`, `plugin-label`, `rail-entry-chevron`, `workspace-add*`, `.search`) |
| `components.tsx` | `WorkspaceGroup` : plus de chevron, un vrai bouton de session sur la ligne ; `PluginButton` retiré (sans usage) |
| `app.tsx` | en-tête « Workspaces » à deux gestes ; chaque dossier ouvre une session **chez lui** (`createSession(directory)`) ; entrée plugins vers les réglages ; pied réécrit ; `detailsWidth` corrigé |
| `icons.tsx` | `PlusIcon`, `FolderPlusIcon`, `GearIcon` (la roue en deux éléments, pas huit) — `SearchIcon` existait déjà |

### Preuve

```
vitest run     -> 21 fichiers, 563 tests, exit 0
tsgo --noEmit  -> exit 0
```

Au navigateur (5181), **après relance de l'instance isolée** — l'attachement CDP était mort alors que
la pile répondait 200, remède documenté :

```
retraits à gauche : logo 12 · New session 12 · plugins 12 · libellé 12 · dossier 12 · pied 12
                    sessions 34 (indentées) · gestes d'en-tête 217 (alignés à droite)
New session       : rail-button, justify-content center, fond rgb(44,44,46), filet 1 px, rayon 8 px
pied              : stats x=12 et settings x=143, **même ligne** (y=889), une icône chacun
ligne de dossier  : [workspace-main, icon-btn] — chevron 0, lignes plugin 0
tiroir            : 0 px au démarrage -> 360 px au clic -> 0 px (fermé, pas de régression)
```

### La règle

**Un défaut d'alignement ne se voit pas en vérifiant que chaque pièce existe.** J'avais mesuré chaque
élément du rail — largeur, hauteur, rôle — et rien de tout cela ne m'a montré que quatre bords gauches
et un pied cassé en deux se voient d'un coup d'œil quand on cherche la **composition**. Regarder un
élément n'est pas regarder un écran.

### Vérification finale — et deux défauts de la sonde, pas du code

Une passe unique sur l'état **commité**, pour que la preuve postdate la dernière édition :

```
bords gauches     : logo 12 · New session 12 · plugins 12 · libellé 12 · dossier 12 · pied 12
                    sessions 34 (indentées) · gestes d'en-tête 243 (à droite)
New session       : justify-content center, fond rgb(44,44,46), filet 1 px, rayon 8 px
dossier           : [workspace-main, icon-btn] — chevron 0, lignes plugin 0
pied              : stats x=12, settings x=143, même ligne (y=889), une icône chacun
tiroir            : 0 px au repos -> 360 px ouvert -> 0 px refermé
recherche         : `GET /session?search=zzz` émis, liste à 0 ligne, retour à 4 par Échap
```

Deux « défauts » que cette passe a signalés étaient ceux de **ma sonde** :

1. **« chevron présent »** — mon compte soustrayait les icônes de dossier du total des `svg`, sans
   compter la **coche** du workspace courant. La ligne n'a pas de chevron.
2. **« la recherche ne filtre pas »** — j'avais posé la valeur avec le *setter* natif puis dispatché un
   `new Event('input')` : Solid délègue ses événements, et ce texte n'atteignait pas son gestionnaire.
   Avec une **vraie frappe** (`Input.insertText`), la requête part et la liste se réduit.

⇒ **Vérifier un comportement de saisie exige une saisie réelle**, jamais un événement fabriqué — et la
mesure qui passe par le **réseau** (la requête est-elle émise ?) sépare ce que l'interface fait de ce
que la sonde lui fait faire.

### Un défaut réel trouvé par cette passe

La ligne de dossier et son bouton étaient décalés de **3 px** : l'air du groupe était porté par un
`padding` **asymétrique** (`9px 4px 4px`) sur le bouton du dossier, ce qui descendait son texte sous
l'icône voisine. Corrigé en `margin-top: 8px` sur `.workspace` — ce qui est aussi la règle du §3.7
(l'air se met **au-dessus** de ce qui ouvre un bloc, jamais dans une boîte). Mesuré après : **1 px**.

### Et une icône qui disait autre chose

La capture du pied, lue après correction, a montré ce que les mesures ne pouvaient pas dire : le bouton
`stats` portait une icône de **liste** (trois traits horizontaux) — la forme que tout le monde lit comme
« menu », c'est-à-dire « afficher la navigation ». Mesuré : la même icône sert dans `trajectory-view`
pour l'onglet `Turns`, où elle est juste ; au pied du rail, elle promettait un menu.

Remplacée par `ChartIcon` — une ligne de base et trois barres de hauteurs différentes, soit **une
mesure**, qui est exactement ce que la section contient. Deux tracés, trait 1,6, comme les autres.

⇒ **La remarque sur l'icône s'appliquait aux deux boutons, pas seulement à celui qu'elle nommait.** Le
défaut se voit sur une capture et jamais dans une mesure de position : c'est la **lisibilité** de la
forme, et elle ne se vérifie qu'en regardant.

---

## Lot 15 — la section Workspaces : enlever, et une échelle d'icônes (livré)

Deuxième retour d'usage sur la même zone. **Deux des demandes n'étaient pas des corrections mais des
capacités manquantes**, et je l'ai établi avant de toucher au code.

### Deux demandes qui demandent un travail natif, pas un ajustement

| demande | ce que la vérification a établi |
|---|---|
| ouvrir l'explorateur de fichiers pour choisir un dossier | **aucune route ne le fait.** Surface entière relevée : **119 routes**, les seules « sélections » sont `POST /tui/open-help\|open-sessions\|open-themes\|open-models` et `/tui/select-session` — des ordres donnés au **TUI**, pas un sélecteur serveur. `/file` n'a que `content` et `status`. Et le navigateur ne peut pas rendre un chemin absolu : `showDirectoryPicker()` rend un *handle* sans chemin, `<input webkitdirectory>` ne rend que du relatif |
| un **menu par plugin**, ouvrant sa configuration (Schedule et ses tâches) | **l'API plugin n'a aucune surface d'interface** : `PluginInput` et `Hooks`, rien qui déclare un panneau, une route ou un composant. La vision demande une **capacité** : que le plugin déclare son panneau, que la webui le rende |

Ce qui a été **appliqué** en attendant, sans promettre le reste : le champ d'ajout de dossier dit
maintenant ce qu'il attend et offre les dossiers connus (il le faisait déjà), et l'entrée `plugins`
mène à la section où ils s'ajoutent et se retirent.

### L'échelle d'icônes — la cause du « pour une raison inconnue »

Mesuré : la colonne portait **huit icônes en cinq tailles** — 14, 13, 13, 14, 13, 13, 11, 13, 14.
Il n'y avait **aucune échelle** : chaque appel choisissait son nombre à la main, donc aucune valeur
n'était reproductible ni discutable. **Une seule valeur désormais : 16 px** dans le rail, pour du texte
à 14 — la convention des barres latérales. Vérifié : dossier 16, session 16, en-tête 16, pied 16.

### Ce qui a été retiré, et pourquoi

| retiré | raison |
|---|---|
| **coche** du dossier courant | doublait un contraste qui suffit, sur une ligne qu'on parcourt pour trouver un nom |
| **compteur** de sessions | personne ne cherche « combien j'en ai créées » ; il occupait la place du nom |
| **icône de session** | identique sur toutes les lignes, donc elle ne distinguait rien |
| **flèche de survol** + **détail repliable** | la flèche tenait une colonne de la grille — d'où l'heure à **39 px** du bord ; le détail est déjà dans l'infobulle et dans la page Logs |
| **indentation** 22 → **12 px** | le nom ne disposait que de **156 px** sur 280 |
| **onglet `Session`** du tiroir et **bouton `stats`** | la page `Trajectory` porte le détail par tour, la barre sous la saisie porte les agrégats : un troisième endroit pour la même donnée est un endroit de plus où elle diverge |
| **onglets** du tiroir | un onglet unique n'est pas un choix à offrir ; le titre nomme, le compteur compte |

Le **journal brut** (`Raw events`), qui vivait dans le panneau retiré, **n'a pas été supprimé** : la
cible §4 le place dans la vue Logs — « le journal montre ce que la page a réellement reçu ». Il y est
désormais, sous la trajectoire.

### Ce qui a été ajouté ou renforcé

- **Le bouton de session de la ligne du dossier reste visible** (il était à l'opacité **0** — invisible
  au moment précis où on le cherche) et passe à 16 px.
- **La recherche se referme par le bouton qui l'a ouverte.** Défaut relevé : le champ ouvert, les
  boutons disparaissaient derrière lui, donc plus aucun moyen de le fermer à la souris. Le bouton actif
  devient une croix. ⇒ **Un geste qui ouvre doit être le même qui ferme.**
- **Interlignage conventionnel** : la ligne mesurait 26 px pour un `line-height` de 1.3 (18,2 px) — ni
  l'une ni l'autre n'est une valeur qu'on reproduit. Désormais **24 px** et **1.5**.

### Preuve

```
vitest run     -> 21 fichiers, 563 tests, exit 0
tsgo --noEmit  -> exit 0
```

Au navigateur (5181), après rechargement :

```
retirés : coche 0 · compteur 0 · icône de session 0 · flèche 0 · détail 0 · onglets 0
pied     : ["settings"]  (plus de « stats »)
ligne    : margin-left 12px · hauteur 24px · line-height 1.5 · nom 203px (avant 156)
heure    : 21px du bord (avant 39)
icônes   : dossier 16 · session 16 · en-tête 16 · pied 16
bouton   : opacité 1 (avant 0)
recherche: ouverte par le bouton (« Close search ») -> refermée par le même -> « workspaces »
```

### La règle

**Une taille choisie à la main n'est pas une échelle.** Huit icônes en cinq tailles ne se voient pas
une par une : elles se voient quand on les compte — et le symptôme, lui, arrive formulé comme « pour
une raison inconnue », ce qui est exactement le signe qu'il n'y a pas de règle.

---

## Lot 16 — choisir un dossier au lieu de le taper (livré)

Demande d'usage : « l'ajout de dossier demande de rentrer le chemin, avec possibilité d'erreur, alors
qu'on pourrait ouvrir l'explorateur pour choisir directement ». **Ce n'était pas un ajustement mais
une capacité manquante**, et deux vérifications l'ont établi avant d'écrire une ligne.

### Deux faits, mesurés avant le code

| question | ce que la vérification a établi |
|---|---|
| une route choisit-elle un dossier ? | **non.** Sur les **119 routes**, les seules « sélections » sont des ordres donnés au **TUI**. Et le navigateur ne peut pas rendre un chemin absolu : `showDirectoryPicker()` rend un *handle* sans chemin, `<input webkitdirectory>` ne rend que du **relatif** — donc aucun des deux n'alimente un dossier de travail. Un dialogue ouvert par le serveur s'afficherait sur la machine du **serveur** : invisible pour un client distant, hors de portée de tout test |
| `GET /file` ne le fait-il pas déjà ? | **il le fait, mais borné au projet.** Il résout `path.join(ctx.directory, dir)` : un chemin **absolu** y est traité comme relatif, donne un chemin inexistant, et l'erreur est **avalée**. Mesuré : `GET /file?path=C:\Users\jeanl` rend **200 avec `[]`** — indiscernable d'un dossier vide. Or c'est précisément **hors du projet** qu'on choisit un workspace |

### Ce qui est livré

- **`src/folder/index.ts`** — service de parcours : dossiers seulement, tri insensible à la casse et
  aux accents, borné à 500, et une **erreur typée qui nomme la cause** (`path not found`,
  `not a directory`, `directory not readable`, `no path given`) au lieu d'une liste vide.
- **`GET /folder?path=…`** dans `RootHttpApi` — elle sert **avant** qu'une instance existe, et le
  parcours sort par nature du projet. L'erreur est déclarée en `404` sur la classe elle-même.
- **`FolderBrowser`** (webui), affiché par le mode « ajouter » du rail : on regarde les dossiers, on
  entre, on remonte, on choisit. Pas de troisième bouton — le mode « ajouter » **est** la demande.

### Deux erreurs de conception corrigées en route

1. **Le canal d'erreur élargi.** La première version listait les noms puis faisait un `stat` par
   entrée, en écrasant l'échec dans le canal d'erreur — ce qui élargissait le type de l'effet entier à
   `NotAFolder | undefined` (relevé au typecheck). `readdir(withFileTypes)` donne le type sans second
   appel : **un appel système au lieu de N**, et aucune erreur à rattraper.
2. **Les séparateurs mêlés**, vus à la mesure : entrer dans un dossier affichait
   `…\opencode-fork/.dsh-vision-toolkit`. Le serveur rend le chemin tel qu'il l'a reçu, donc
   l'unification se fait **avant l'envoi** — sinon deux écritures du même dossier circuleraient
   (défaut déjà payé sur `GET /project`).

### Preuve

```
packages/opencode : tsgo --noEmit -> exit 0 ; bun test test/folder -> 13 pass / 0 fail
packages/webui    : tsgo --noEmit -> exit 0 ; vitest -> 22 fichiers, 572 tests
route, de bout en bout : dossier réel -> 200 application/json (parent "C:/")
                         chemin absent -> 404 · un fichier -> 404
navigateur (pile jetable 4099 + 5182) : /folder -> 200 application/json **par le proxy** ;
   le mode « ajouter » liste **24 dossiers réels** ; cliquer un dossier y entre (1 ligne) ;
   « Use this folder » présent. Pile démontée après (4099 et 5182 fermés, onglet revenu sur 5181).
```

### La règle

**Une liste qui ne distingue pas « vide » de « refusé » est un défaut, pas un détail.** `GET /file`
rendait `200` avec `[]` pour un chemin hors projet : l'écran ne pouvait pas dire la différence, et
l'utilisateur non plus. ⇒ Tout parcours **dit** ses refus, et les nomme par leur cause.

### Ce qui reste

Le serveur de dev en place (**4097**) a démarré **avant** cette route : il rend encore le SPA en `200`
pour `/folder`, donc le parcours n'y apparaîtra qu'après redémarrage — je ne l'ai pas redémarré, il
n'appartient pas à cette session. Le **binaire publié** demande également un rebuild (`skill
fork-build`) : la route existe dans les sources, pas encore dans `opencodev2.exe`.

---

## Lot 17 — la typographie : une échelle écrite n'est pas une échelle appliquée (livré)

Dernière remarque du retour d'usage : « de façon globale la typo et les tailles surtout d'icône ne
sont pas conventionnelles ». Les icônes avaient reçu leur échelle au lot 15 ; la **typographie**,
non — et la mesure a montré pourquoi, ce qui n'était pas la raison attendue.

### Ce que la mesure a dit

**L'échelle existait déjà, et elle était documentée.** Le bloc `:root` portait quatre jetons et un
commentaire citant lui-même une mesure antérieure (« 8 valeurs en px distinctes, 56 déclarations,
base de fait a 12,5 px »). Donc quelqu'un avait déjà fait le travail de conception — et le résultat
n'y ressemblait pas :

| ce qui était déclaré | ce qui était appliqué |
|---|---|
| 4 jetons : `--fs-title` 16, `--fs-base` 14, `--fs-note` 13, `--fs-meta` 12 | **9 valeurs distinctes** : les 4 jetons, plus `9px` ×3, `10px`, `0.92em`, `1.5rem` |
| rien pour l'interlignage | **8 valeurs distinctes** : 1, 1.25, 1.3, 1.35, 1.5, 1.55, 1.6, 1.75 |
| — | `var(--fs-label)` utilisé **2 fois**… et **défini nulle part** |
| `--mono` défini | `var(--font-mono, …)` utilisé **3 fois** — un jeton qui **n'existe pas** |

**Le symptôme arrive formulé « ce n'est pas conventionnel », et c'est exactement ce qu'il est** :
il n'y a pas de règle visible dans le *résultat*, même quand la règle est écrite dans le *fichier*.

### Deux modes de défaillance silencieux

1. **Un jeton référencé mais non défini ne produit aucune erreur.** `var(--fs-label)` fait simplement
   **hériter** la règle : la taille est celle du parent, qui n'a jamais été choisie pour elle. Rien
   ne le signale — ni le typecheck, ni le lint, ni l'œil, puisque la valeur obtenue est plausible.
2. **Un jeton avec liste de repli fonctionne tout en étant faux.** `var(--font-mono, ui-monospace,
   "JetBrains Mono", …)` s'affiche correctement, mais duplique la famille **à la main**, et en deux
   ordres différents selon la règle. Deux écritures d'une même décision.

### Ce qui est livré

| | avant | après |
|---|---|---|
| tailles | 9 valeurs | **4 jetons** + `--fs-display` (le titre de page, seul niveau au-dessus) + `0.9em` (relatif **exprès**, pour un extrait de code dans un titre) |
| interlignages | 8 valeurs | **3 jetons** (`--lh-tight` 1.25 · `--lh-normal` 1.5 · `--lh-prose` 1.6) + `1` pour les **glyphes** |
| jetons fantômes | `--fs-label`, `--font-mono` | **0** |

Les six valeurs orphelines sont rentrées sur l'échelle par leur **rôle**, pas par ressemblance :
`--fs-label` (deux listes de contenu) → `--fs-base` ; les trois `9px` et le `10px` (badges, chevron,
case à cocher) → `--fs-meta` ; le titre de page `1.5rem` → `--fs-display` ; `0.92em` → `0.9em`.

### Preuve

```
packages/webui : tsgo --noEmit -> exit 0 ; vitest -> 22 fichiers, 572 tests
relevé après   : --fs-label 0 · --font-mono 0
                 tailles : meta 64 · note 47 · base 45 · title 4 · display 1 · 0.9em 1
                 interlignages : lh-normal 7 · lh-prose 6 · lh-tight 4 · 1 (glyphes) 4
```

### La règle

**Une échelle écrite mais non appliquée n'est pas une échelle** — c'est un commentaire. Ce qui se
vérifie n'est pas l'intention du fichier mais le **nombre de valeurs distinctes** qu'il contient :
compter suffit à trancher, et personne ne le fait.

Et surtout : **un jeton référencé mais non défini ne dit rien.** Il hérite, silencieusement, une
taille que personne n'a choisie. ⇒ Un inventaire des jetons **utilisés** contre les jetons **définis**
est la seule façon de le voir.






