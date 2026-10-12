# opencodev2 web — workflow de mise en place

Programme d'installation d'une **version web** d'`opencodev2` : serveur démarrable sans build
de binaire, interface web légère refaite pour un agent généraliste, hotreload complet du
harnais. Héritier de `specs/dev-source-runtime.md` (mode source) et de `docs/releases/v2.4.0/`
(discipline de gates).

Règle de statut : ce document décrit **le quoi et le comment**. Une donnée de statut vit dans
`PROGRESS.md` (à créer à l'ouverture de P0), jamais ici.

---

## 1. Ce qui existe déjà (faits vérifiés le 2026-10-12)

| Fait | Preuve |
|---|---|
| Le serveur démarre depuis les sources, sans build | `package.json:10-11` (`dev:serve`, `dev:serve:watch` = `bun --watch --conditions=browser ./packages/opencode/src/index.ts serve`) |
| Le smoke de hotreload backend existe et passe | `packages/opencode/script/dev-live-reload-smoke.ts` (lance le serveur `--watch` **depuis la racine**, sonde `/global/health`, touche `packages/core/src/installation/version.ts`) |
| La commande web sait déjà orchestrer backend + GUI depuis les sources | `packages/opencode/src/cli/cmd/web.ts:42-63` (`Server.listen` puis `startAppDevServer`) |
| Le lanceur GUI de dev est un simple `bun run dev` dans `packages/app` | `packages/opencode/src/dev/app-server.ts:47-76` (port 3000, `BROWSER=none`, kill à la mort du parent) |
| Le backend est adressé par variables d'env, pas par config partagée | `dev/app-server.ts:13-14` (`VITE_OPENCODE_SERVER_HOST`, `VITE_OPENCODE_SERVER_PORT`) |
| La racine source se résout sans binaire | `packages/opencode/src/dev/source.ts:12-47` (`OPENCODE_DEV_SOURCE`, sinon correspondance exacte sur `process.argv[1]`) |
| Le contrat HTTP du serveur est stable et typé | `groups/global.ts:63-65` (`/global/health`, `/global/event`, `/global/config`), `groups/event.ts:5-19` (`GET /event`, `text/event-stream`) |
| Le client est déjà une dépendance publique, sans UI | `packages/sdk/js/src/v2/client.ts:47-89` (`createOpencodeClient`, en-têtes `x-opencode-directory` / `x-opencode-workspace`) |
| Le SDK a des conditions de runtime non-bun | `packages/opencode/package.json:28-46` (`exports "./*": "./src/*.ts"`, imports `#db` / `#pty` / `#sqlite-raw` avec conditions `node`) |
| L'UI actuelle est embarquée au build, donc figée | `script/build.ts:75-104` (bundle `packages/app/dist` → `opencode-web-ui.gen.ts`), `server/shared/ui.ts:44-48` |
| L'auth serveur existe et doit rester respectée | `flag.ts:32-33` (`OPENCODE_SERVER_USERNAME`, `OPENCODE_SERVER_PASSWORD`), `cli/network.ts` |
| Le watcher de fichiers est opt-in | `flag.ts:36` (`OPENCODE_EXPERIMENTAL_FILEWATCHER`) |

**Conséquence** : le backend est réutilisable tel quel. Ce qui manque est (a) un chemin de
démarrage hors checkout, (b) un client web qui ne dépend que du SDK.

---

## 2. Architecture cible

Deux processus, jamais un seul :

```
navigateur  ──HTTP+SSE──▶  UI (nouveau package, Solid/Vite, SDK seulement)
                             │  VITE_OPENCODE_SERVER_{HOST,PORT} en dev
                             ▼
                          serveur opencodev2
                          (bun --conditions=browser src/index.ts serve)
                          ├─ /global/health   /global/config   /event (SSE)
                          ├─ /session ...    (API existante, inchangée)
                          └─ sert l'UI statique compilée (prod)
```

Règles de câblage :

1. **L'UI ne parle qu'au SDK.** Aucun import de `packages/ui`, aucun composant de
   `packages/app`. C'est la condition pour que l'UI reste légère et le backend indépendant.
2. **Le serveur ne connaît pas l'UI.** Il sert un dossier de fichiers statiques résolu par
   drapeaux, avec repli sur l'UI embarquée actuelle. Une nouvelle UI ne doit pas demander de
   modification serveur.
3. **Un port par processus**, le backend épinglé (`DevSource.DEFAULT_PORT = 4096`) pour que
   toute surface produit retrouve le même backend.
4. **L'état reste côté serveur** (sessions en base). Un rechargement de l'UI ne perd rien ;
   un redémarrage du serveur en mode `--watch` non plus.

---

## 3. Trois modes de démarrage (le cœur de la demande)

| Mode | Départ | Build requis | Hotreload | Cible |
|---|---|---|---|---|
| **M1 — checkout** | `bun run dev:serve:watch` + `bun dev` dans le nouveau package | non | total (backend + UI) | développement quotidien |
| **M2 — hors checkout** | paquet npm de sources + lanceur | **aucun** | au redémarrage du processus | usage « opencodev2 web » sur une machine sans dépôt |
| **M3 — embarqué** | binaire compilé | oui (bundle UI au build) | non | distribution existante, inchangée |

### M2 en détail (le point délicat)

`packages/opencode/package.json` publie déjà ses sources (`exports "./*": "./src/*.ts"`) et
declare des conditions `node` pour la base et le PTY. **INFERE :** un paquet de sources
exécutable par `bun` (et possiblement `node`) est techniquement cohérent avec la structure
actuelle ; le point à valider est la liste complète des artefacts non-TS requis à l'exécution
(`.node`, wasm, SQL de migration embarqués).

Travail M2 :

1. vérifier l'inventaire des artefacts runtime non-TS (voir §7,gate P1) ;
2. produire un paquet de sources et un lanceur minimal (`opencode-web`) qui appelle le serveur
   via l'entrée TS, sans build de binaire ;
3. faire servir l'UI par le serveur lui-même (fichiers statiques), donc un seul port et une
   seule commande pour l'utilisateur ;
4. le lanceur doit refuser de démarrer si l'UI n'est pas compilée, avec le message exact de la
   commande de build.

Priorité : **M1 d'abord** (il rend M2 possible et le valide au quotidien), M2 ensuite.

---

## 4. Charte de l'interface (agent généraliste)

Objectif produit : un agent généraliste, pas un IDE. Cinq surfaces, pas plus.

| # | Surface | Contenu | Critère |
|---|---|---|---|
| 1 | **Conversation** | fil de messages, raisonnement, appels d'outils, sorties tronquées avec expansion | un tour complet lisible sans défilement horizontal |
| 2 | **Composer** | prompt, modèle, agent, pièces jointes, envoi/arrêt | accessible clavier, jamais de modale bloquante |
| 3 | **Sessions** | liste, recherche, reprise, renommage, suppression | recherche < 100 ms perçue sur 1 000 sessions |
| 4 | **Projets** | répertoire de travail, changement de workspace | changement appliqué sans rechargement de page |
| 5 | **Statut** | modèles/providers, MCP, watchers, santé serveur | visible en un clic, jamais dans le fil |

Règles transverses :

- **Budget de poids** : premier rendu utile < 150 kB compressés, bundle total < 400 kB. Le
  rapport est mesuré dans `PROGRESS.md`, pas estimé.
- **Pas de coloration syntaxique lourde au chargement** : mise en forme à la demande, uniquement
  pour le code affiché.
- **Terminal/PTTY** : hors périmètre de v1. Le serveur l'expose, l'UI ne l'affiche pas encore.
- **Le fil doit rester lisible sur un écran étroit** ; les panneaux latéraux se replient.
- Accessibilité : navigation clavier de bout en bout, contrastes conformes, `aria-live` sur les
  réponses en cours.

---

## 5. Phases et gates

Chaque phase a une sortie sur disque et une gate vérifiable par une commande. Une gate non
franchie arrête la phase.

| # | phase | sortie observable | gate |
|---|---|---|---|
| **P0** | Cadrage | `PROGRESS.md` créé, surface API gelée (liste des endpoints consommés) | G0 : la liste des endpoints figure dans le document et pointe `fichier:ligne` |
| **P1** | Runtime sans binaire hors checkout | paquet de sources exécutable + lanceur ; inventaire des artefacts runtime | G1 : `bun <entry> serve --port <p>` répond `200` sur `/global/health`, sans build préalable |
| **P2** | Squelette UI | nouveau package : health check, client SDK, flux `/event` affiché | G2 : un tour synthétique s'affiche en direct dans le navigateur sans rechargement |
| **P3** | Sessions & projets | liste, création, reprise, changement de répertoire | G3 : scénario complet piloté au navigateur, capture ou transcript |
| **P4** | Outils & permissions | rendu des appels d'outils, accord/refus de permission | G4 : une permission refusée puis accordée s'affiche dans le fil |
| **P5** | Poids & robustesse | rapport de poids, gestion reconnexion SSE, erreurs réseau | G5 : rapport chiffré dans `PROGRESS.md` + budget respecté |
| **P6** | Livraison | UI compilée servie par le serveur, commande unique | G6 : `opencode-web` démarre backend + UI et affiche une session, sans checkout |

### Détail des gates critiques

**G1** — preuve attendue :

```
bun --conditions=browser packages/opencode/src/index.ts serve --port <p>
# puis, dans un autre shell :
curl -s http://127.0.0.1:<p>/global/health
```

Critère : `healthy: true` et une `version` lue, sans `bun run script/build.ts` jamais exécuté.

**G2** — le flux SSE est la preuve que le câblage est complet : une session créée, un message
envoyé, les parties de réponse apparaissant **en direct**. Sans SSE, il n'y a pas d'interface
agent, seulement un client REST.

**G5** — mesurer, pas déclarer : poids du bundle par chunk, temps au premier contenu texte,
comportement à la coupure SSE (retour du flux après reconnexion).

---

## 6. Arborescence à créer

```
docs/web-ui/
  WORKFLOW.md          ce document
  PROGRESS.md          statut par phase (seule autorité du « où en est »)
packages/webui/        nouvelle UI (nom définitif à fixer en P0)
  package.json  vite.config.ts  tsconfig.json  index.html
  src/
    client.ts          createOpencodeClient + résolution backend (env → localStorage → défaut)
    events.ts          abonnement /event, reconnexion
    routes/            conversation, sessions, projets, statut
    components/        primitives locales, sans dépend de packages/ui
    styles/            tokens, thème
docs/web-ui/RUNTIME-ARTIFACTS.md   inventaire P1 (voir §7)
```

Le paquet racine gagne une entrée `dev:webui` (UI) ; le lanceur M2 gagne `opencode-web`.
Rien d'autre dans `package.json` racine ne change.

---

## 7. Risques et parades

| Risque | Parade |
|---|---|
| Le SDK est régénéré et casse le client | le nouveau client ne consomme que les endpoints gelés en P0 ; la régénération est un point de contrôle explicite |
| Le hotreload « promise plus qu'il ne tient » | G1/G2 sont des proofs d'exécution, pas des promesses ; `dev:serve:smoke` reste le témoin du backend |
| Dérive vers une copie de `packages/app` | gate de poids G5 + interdiction d'importer `@opencode-ai/ui` (revue de diff) |
| M2 scopé trop large (Node vs Bun) | on publie pour Bun d'abord ; Node est une extension, pas un gate |
| L'auth serveur casse l'UI en M2 | `OPENCODE_SERVER_USERNAME`/`PASSWORD` traités dès P1, jamais en fin de programme |
| Le watcher de fichiers absent en M2 | `OPENCODE_EXPERIMENTAL_FILEWATCHER=false` est un comportement correct en M2 : pas de source à watcher |
| Le serveur écrit dans le dépôt surveillé (boucle de redémarrage) | aucune écriture d'état dans l'arbre surveillé (règle déjà établie dans `specs/dev-source-runtime.md`) |

---

## 8. Hors périmètre

- Terminal/PTTY dans l'UI.
- Comptes multi-utilisateurs, authentification par identité.
- Remplacement de `packages/app` : la GUI actuelle reste la référence et le produit `web`.
- Publication npm de la nouvelle UI (décidée en P6, pas avant).