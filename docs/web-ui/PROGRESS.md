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

**Conséquence honnête** : le parcours de suppression de bout en bout au navigateur n'a pas été
observé ; il est vérifié au niveau API. À rejouer au navigateur en P5, la cause du blocage ayant
disparu du code.

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