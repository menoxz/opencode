# HARNESS.md — opencode-fork : mesures, diagnostics, recettes

**Non injecté.** Compagnon de `AGENTS.md` (racine), qui ne porte plus que des consignes. Ici :
le document d'origine du workspace, **conservé intégralement et dans son ordre**, plus les
mesures, formes exactes de réponses, recettes d'installation et échecs de base connus.

À lire quand : une ligne d'`AGENTS.md` porte `(H)`, ou avant de reproduire un diagnostic déjà
fait (webui, CDP, Vite, modèles, publication npm). La recherche par mot-clé suffit —
`rg 'Vite' docs/HARNESS.md`.

## Document d'origine (ordre conservé)

- Plugins de projet : `.opencode/plugin/*` n'est **pas auto-découvert** (ignoré par design : « ignoring auto-discovered project plugins », `packages/opencode/src/config/config.ts`) ⇒ activer uniquement par entrée explicite dans la config globale `~/.config/opencodev2/opencode.jsonc` : `["file:///C:/jeanluc/opencode-fork/.opencode/plugin/<nom>.ts", { "enabled": true }]`. Désactiver : `"enabled": false` ou retrait de l'entrée. Redémarrer le serveur après modification (pas de hot-reload de la config).
- Composant `schedule` (réveil planifié de l'agent : once / interval / cron / event) : plugin `.opencode/plugin/schedule.ts` + `schedule-lib.ts`, outil agent `schedule`, spec `specs/schedule-plugin.md`, tests `.opencode/tests/schedule*.test.ts`, store `~/.local/share/opencodev2/schedule`. Options : `enabled`, `storeDir`, `tickSeconds`, `maxSchedules`, `defaultAgent`, `allowEvents`.
- Tests sous `.opencode` : lancer **depuis `.opencode`** (`cd .opencode && bun test --timeout 30000 tests/<f>.test.ts`) — depuis la racine, `bunfig.toml` renvoie `do-not-run-tests-from-root`.
- Vérification visuelle par CDP sur l'instance isolée 9222 : **`Page.captureScreenshot` MARCHE, en captant une zone et non la page entière.** Mesuré 2026-10-13 : clip `{x:0, y:0, width:1060, height:1000, scale:1}` + `fromSurface:false` ⇒ 91 ko écrits et **lisibles**, `fromSurface:true` ⇒ 90 ko également. Les `TIMEOUT` venaient des captures **pleine page** (viewport 1440+ , 15 à 40 s). ⇒ **Toujours rogner sur la zone qui intéresse** (un panneau, une colonne) au lieu de capturer tout l'écran ; et le fichier écrit se lit ensuite avec `read`, qui joint l'image. Corollaire : ne pas conclure d'un libellé tronqué lu dans une extraction PDF — mesuré, `.wordmark` fait 102 px pour 102 px et `.nav-group-label` 208 pour 208 (**non coupés**) ; seul `.row-title` l'est (250 pour 86) par `text-overflow: ellipsis`, et c'est voulu.
- `Runtime.evaluate` peut expirer **sur toutes** ses requêtes alors que la page est saine : mesuré 2026-10-13, `document.querySelectorAll('.sheet').length` en `TIMEOUT` (trois sondes, jusqu'à 200 s) pendant que `/json/list` rendait la page (`title="opencodev2"`), que 5180 répondait 200, que 4096 était `healthy` et qu'aucun processus Chrome ne consommait de CPU ⇒ **le défaut est dans l'attachement CDP, pas dans l'UI**. Diagnostiquer dans cet ordre (`/json/list` → santé des deux serveurs → CPU des processus) **avant** de suspecter le code : sans cela on « corrige » une interface qui marche. Repli : prouver par le SDK et les tests unitaires, et **écrire la limite** au lieu de l'ignorer.
- Paramètre de chemin contenant des `/` ⇒ **encodage obligatoire** (`encodeURIComponent`). Mesuré sur `DELETE /plugin/{spec}` : un spécificateur `file:///…` envoyé brut rend **`status=200` avec du HTML** (repli SPA) — un succès apparent pour un échec total ; encodé, il rend du JSON. Le client SDK encode lui-même (vérifié par appel réel : `client.plugin.remove({ spec })` rend un objet) ⇒ le piège ne concerne que les URLs écrites à la main. Corollaire de méthode : un `200` ne prouve rien sans vérifier le **corps** (`json=true`), et un test malformé produit un faux défaut — vérifier l'URL avant d'accuser la route.
- `PATCH /config|/global/config` **fusionne** les cartes (`agent`, `provider`, `mcp`…) : un agent ajouté persiste, un agent **omis n'est pas retiré**, et `model: null` est refusé (`400`) ⇒ **aucun moyen de retirer une entrée par l'API** — seul le fichier de configuration (`~/.config/opencodev2/opencode.jsonc`) le permet, et un serveur en cours ne le relit pas (cache `Duration.infinity`, cf. §1) : vérifier le fichier **et** l'état serveur. Corollaire : « vider un champ » n'est jamais un retour au défaut, c'est un non-changement — ne pas le promettre dans l'interface.
- Écriture de configuration par le SDK : le corps est **imbriqué** — `client.global.config.update({ config: { … } })` (`{ key: "config", map: "body" }`), jamais un patch à plat. Un patch à plat fait chercher `parameters.config`, ne trouve rien et envoie un **corps vide** ⇒ `200` pour une écriture nulle : le défaut est silencieux. **Cible** : `PATCH /config` (projet) **matérialise un `config.json` à la racine du dépôt** là où il n'y en avait aucun — mesuré ; un panneau de réglages vise `/global/config`, qui ne dépose rien dans l'arbre de travail. Vérifié : `client.global.config.get()` rend `{ data, request, response }`, la config sous `.data`.
- Watcher de fichiers : **opt-in** via `OPENCODE_EXPERIMENTAL_FILEWATCHER=true` (défaut `false`, `packages/core/src/flag/flag.ts:36` ; `OPENCODE_EXPERIMENTAL` seul ne suffit pas) ; sans lui aucune écriture externe n'émet d'événement (les outils d'écriture de l'agent émettent toujours). Activé au niveau **utilisateur** sur cette machine (2026-10-10) — une session déjà lancée doit redémarrer pour le voir. Une écriture externe publie `file.watcher.updated` (jamais `file.edited` → alias géré par le composant `schedule`).
- Rechargement à chaud de la config MCP : **inopérant avant 2.4.4** — `mcp/index.ts` armait son veilleur depuis le constructeur de la couche alors que `Config.directories()` exige un `InstanceRef` actif ; l'échec partait dans un `catchCause` muet, donc aucun veilleur n'existait (mesuré : pas une seule ligne d'armement dans 12 journaux de daemon). Preuve qu'il est armé = `service=mcp ... MCP config watchers active` dans `~/.local/share/opencodev2/log/<ts>.log` ; sans elle, un changement de `mcp` n'est appliqué qu'au redémarrage. Les modules agent et skill, eux, surveillent déjà le `.opencode` d'un dépôt local (`Config.directories()` inclut les racines du projet).
- Outil natif invisible à l'agent ⇒ le chercher d'abord dans le tableau `builtin` de `packages/opencode/src/tool/registry.ts` : un outil non listé n'existe pour aucun profil. `always_tools` (`experimental.hot_path`), la carte `tools` et les permissions ne peuvent pas l'élire — ils ne filtrent qu'un catalogue déjà construit (mesuré 2026-10-10 sur `compact`, instancié mais absent de `builtin`).
- Mode plan (`plan_enter`/`plan_exit`) ≠ outil `planning` : le premier exige l'env `OPENCODE_EXPERIMENTAL_PLAN_MODE` **et** `flags.client === "cli"` (`registry.ts:427`) ⇒ jamais exposé au client `interactive-tui` ; le second (validation DAG) est gardé par `experimental.planning.enabled` (jsonc, actif). `turn_plan` est un troisième levier, gardé par `experimental.turn_plan`.
- Déploiement : un composant livré en plugin se déploie par la seule config ; **aucun rebuild** du binaire n'est requis (le binaire `opencodev2.exe` charge les plugins au démarrage) ; un changement dans `packages/opencode/src/**` exige le rebuild + redéploiement (`skill fork-build`).
- Fragments de prompt par type de tâche (`packages/opencode/src/session/prompt/task-specific/*.txt`, ex. `general.txt`, `research.txt`) : **embarqués dans le binaire** (importés par `src/prompt-composer/index.ts`) ⇒ toute édition exige rebuild + redéploiement, et un simple `git push` ne les active pas. Preuve d'embarquement = sonde textuelle A/B sur les binaires déployés (chaîne présente dans le neuf, absente du `.bak`) ; les littéraux de prompt restent lisibles dans le binaire (contrairement aux identifiants applicatifs, cf. `fork-build` v21).
- Programme de version : `docs/releases/<version>/` — `README.md` = workflow + gates, `BACKLOG.md` = spec des items, `PROGRESS.md` = **seule** autorité de statut, `BASELINE.md` = mesures de non-régression, `items/<id>.md` = fiche par item. Chantier de performance : `v2.4.0` (items `H1..H8`, tous implémentés).
- Publication npm du fork : `bun ./packages/opencode/script/publish-fork.ts` depuis la racine (token via `NPM_CONFIG_USERCONFIG`) — idempotent depuis 2.4.3 (403 `EPUBLISHCONFLICT` = « déjà publié », la relance reprend) ; ne publie que les `dist/opencode-*/` contenant un binaire ⇒ un build partiel produit une release partielle : vérifier 13 paquets (méta + 12 plateformes) sur le registre après coup. Le retag `latest` du registre met quelques minutes à propager.
- Navigateur pilote (`browser_ensure`) : profil `isolated` = `%LOCALAPPDATA%\McpBrowserProfiles\<navigateur>` (persistant, **sans** les sessions de l'utilisateur) ; profil `native` = son navigateur réel mais exige `confirmKill` (il le ferme). Sessions réellement authentifiées au 2026-10-11 : `BraveMain` (Google + WhatsApp Web), `edge` (Google) — relevé par lecture seule des bases `Cookies` (domaines/noms, valeurs jamais déchiffrées). **`browser_ensure` ignore le profil demandé dès qu'un CDP est déjà actif** : il se reconnecte au navigateur natif de l'utilisateur et répond `isolated` sans effet (mesuré 2026-10-12 : port 9223, onglets odoo/x.com de l'utilisateur). Pour un vrai bac à sable : `chrome.exe --remote-debugging-port=9222 --user-data-dir=%LOCALAPPDATA%\McpBrowserProfiles\chrome` puis `browser_use target=9222`. **⚠️ `browser_use` n'est pas exposé dans toutes les sessions** (mesuré 2026-10-12 : appel refusé, « unavailable tool »). Ne pas se rabattre pour autant sur le navigateur réel de l'utilisateur (préférence exprimée : profil isolé, et l'app y écrit son magasin de sessions). **Parade qui marche** : piloter l'instance isolée **directement par CDP**, sans le pilote MCP — `fetch http://127.0.0.1:9222/json/list` → prendre `webSocketDebuggerUrl` de l'onglet visé → WebSocket → `Runtime.evaluate` (Bun fournit `WebSocket` et `Bun.file`). Mesuré 2026-10-12 : DOM lu, onglets cliqués, fichier posé sur un `input[type=file]` et parcours d'envoi observé de bout en bout. Deux pièges : `DOM.getDocument` a été refusé ⇒ construire un `File` dans la page puis `dispatchEvent(new Event('change',{bubbles:true}))` ; et `DOM.setFileInputFiles` est inutile si l'on passe par cette voie.
- **Jamais de `window.confirm` dans du code piloté par navigateur** : le dialogue natif survit au rechargement, à `about:blank`, à `Entrée` et à `Échap`, et aucun outil disponible ne le ferme (`handle_dialog` n'est pas exposé) ⇒ onglet définitivement bloqué. Confirmation en ligne (deux clics) à la place. Vaut pour tout test e2e.
- Fork opencode : dispatch Actions en 422 « Actions has been disabled for this repository » **malgré** `actions/permissions` à `enabled: true` et un workflow `active` ⇒ restriction anti-abus GitHub sur les forks (« scale of GitHub Actions usage »), levée uniquement par le bouton « I understand my workflows, go ahead and re-enable them » de l'onglet Actions, aucun endpoint API ne la débloque, et il faut être connecté en maintainer ⇒ `browser_use target=Brave confirmKill=true` puis clic (fait le 2026-10-11 ; le run 38161487892 est alors passé vert de bout en bout, publication npm incluse).
- Tests du paquet principal : `cd packages/opencode && bun test --timeout 30000 <chemins>` — le `--timeout` est **obligatoire**, sinon échecs fantômes à 5 s ; typecheck `bun run typecheck` (`tsgo --noEmit`, jamais `tsc`). Garde rapide : tâche `perf-guard`.
- Recherche de fichiers : **jamais `Get-ChildItem -Recurse` depuis la racine** — mesuré 2026-10-12, expiration à 60 s puis 180 s (`node_modules` et artefacts de build dominent) ⇒ `glob` (indexé, millisecondes) ou chemin explicite. Face cachée du même incident : **l'expiration d'un shell tue ses enfants**, donc un serveur lancé par `Start-Process` depuis ce shell meurt avec lui ⇒ un « défaut » observé juste après peut n'être que l'outillage (cas vécu : fausse alerte de reconnexion SSE en P5, deux processus de test emportés).
- `.opencode/tasks.json` (définitions de tâches locales) est **gitignoré** ⇒ ne jamais le mettre dans un commit ; l'éditer directement ou via l'outil `tasks`.
- Après chaque vague d'implémentation : relancer **tous** les tests que les items voisins ont écrits, pas seulement la suite ciblée. Un correctif peut être annulé par un autre sans qu'aucune suite ciblée ne le voie (cas v2.4.0 : H1 a rendu actif un défaut dormant de H4, visible seulement dans `step-git-spawn.test.ts`).
- Tests du paquet `webui` : depuis `packages/webui`, `bun run test` (vitest + jsdom — Bun ne peut pas exécuter de JSX ici : `jsx: preserve` de Vite contre `react-jsx` de Bun) ⇒ le glob `src/*.test.ts` **rate** `src/*.test.tsx` : lister `src/**/*.test.{ts,tsx}` avant toute refonte de composants (mesuré 2026-10-13 : 11 tests cassés, non vus). Tâche `webui-dev` = serveur Vite port 5180, proxy vers le serveur 4096.
- Commande de tâche (`tasks`) : un chemin entre guillemets y casse pwsh (« Jeton inattendu ») ⇒ forme `cmd /d /c bun run dev`. `#force` enveloppe la commande dans `Invoke-Expression`, où le multi-lignes casse (« Accolade fermante manquante ») ⇒ découper en commandes simples.
- Interface webui : la cible est `docs/web-ui/CIBLE.md` — un écran, cinq zones ; le tiroir droit n'existe que sur une permission en attente ; le bruit de protocole (`step-start`/`step-finish`, sans aucun contenu) ne s'affiche pas (`isVisiblePart`, `view-model.ts`).
- Un composant peut **exister sans être monté** : mesuré 2026-10-14, `FolderPicker` (252 lignes, helpers purs dans `folders.ts`, doc de conception complète) n'avait **aucun** site d'appel et **aucune** règle CSS `.folder-*` — écrit, documenté, jamais relié, donc invisible ⇒ avant de conclure « ça n'existe pas », grep l'usage **et** le CSS : le composant existe peut-être déjà, il n'est simplement branché nulle part (`picker.tsx`).
- Un chiffre pris dans une **référence d'écran n'est pas une mesure** : « sept dossiers se lisent d'un coup d'œil » justifiait de se passer d'un champ de recherche — le chiffre venait de la capture, et ce serveur en connaît **26** ⇒ la référence donne la FORME, jamais les DONNÉES : mesurer le jeu réel avant de dimensionner un contrôle sur ce qu'on croit y voir.
- Comparer deux chemins de fichier **par leur texte est faux** : `GET /project` rend le même dossier tantôt `C:/Users/jeanl`, tantôt `C:\Users\jeanl` — mesuré 2026-10-14, la liste affichait **deux fois** la même entrée et « choisir » était un tirage au sort ; la même cause laissait le dossier courant **jamais** marqué ⇒ normaliser avant de comparer (séparateurs unifiés, casse abaissée, séparateur final retiré — `pathKey`, `folders.ts`), et garder le chemin **original** pour ce qu'on rend au serveur.
- Réglages webui — **liste de choix dès que l'ensemble des valeurs est connu du serveur**, jamais un champ de texte. Routes mesurées 2026-10-13 : modèles = `GET /config/providers` (**531 ko, 49 ms**, 7 fournisseurs, 696 modèles) et **pas** `GET /provider` (**6,7 Mo, 1 198 ms** — c'est lui qui gelait la feuille) ni `/api/model` (491 ko, 1 733 ms) ; agents = `GET /agent` filtré sur `mode === "primary" && hidden !== true` (le schéma exige un primaire) ; interpréteurs = `GET /pty/shells` (**353 o**, 4 shells, **absent du SDK** ⇒ `fetch` direct + `/pty` dans le proxy Vite, sinon Vite rend `index.html` en `200` et la liste reste vide sans erreur). ⚠ `/config/providers` rend **7 champs `key`/`apiKey` en clair** et `/api/model` en rend **580** : projeter aussitôt en `{value,label}`, ne jamais garder la charge brute dans un signal. Valeur d'un shell = son **nom** (`pwsh`), pas son chemin (`Shell.preferred` → `resolve` fait `which(nom)`).
- Section `Providers` de la webui : **grille cherchable puis détail** (relation 1 → n) — `providers.tsx` (`ProviderGrid`/`ProviderDetail`/`ProvidersSection`), schéma dans `settings.ts` (`providerSummary`, `catalogSummaries`, `providerModelChoices`, `scopeKey`/`scopedValues`, valeurs préfixées `id:clé` relues par `providerValuesFor(id)`). `ProviderBlock` a quitté `settings-sheet.tsx`.
- `GET /config/providers` forme exacte : `providers` = **tableau** (7), `models` = **carte** indexée par identifiant de fournisseur (122 pour `orcarouter`) ⇒ le détail s'affiche sans second appel. Écrire un fournisseur = **deux magasins** : clé par `PUT /auth/{id}` (ou `POST /auth/{id}/keys`), `baseURL` par la config (`provider.<id>.options.baseURL` dans `/global/config`) ⇒ écrire depuis l'écran exige **les deux** : la page le fait par `saveConfig` (`client.global.config.update({ config: patch })` — corps **imbriqué**) avec `providerPatch`/`modelPatch`/`discoverPatch`/`blacklistPatch` (`settings.ts`), plus `PUT /auth/{id}` pour la clé. **Aucun `DELETE` sur `/config` ni `/global/config`** (seulement `GET`/`PATCH`) ⇒ un fournisseur ajouté **n'est pas retirable par l'API** : l'écran le dit avant le clic. Un fournisseur créé n'apparaît pas dans `/config/providers` avant rechargement du serveur ⇒ la grille fusionne la config (`mergeDeclared`), sinon l'écran dirait « créé » puis ne montrerait rien. `discover` s'exécute au **chargement** des fournisseurs (`provider.ts:1570`), pas à la requête. **Ce que l'écran montre doit partir** : le brouillon de déclaration initialise le paquet npm (`newProviderDraft`) — mesuré sur l'instance isolée, un fournisseur créé sans lui est déclaré et sans adaptateur, donc inutilisable.
- Instance isolée, pour vérifier une **écriture** sans toucher à la configuration réelle : serveur `bun --conditions=browser src/index.ts serve --port 4097` lancé avec `XDG_{CONFIG,DATA,STATE,CACHE}_HOME` et `OPENCODE_TEST_HOME` sur un dossier temporaire (`core/src/global.ts:12-16` — le nom d'appli `opencodev2` s'ajoute à `xdgConfig`), puis `bun x vite --port 5181` dans `packages/webui` avec `OPENCODE_SERVER_PORT=4097` (le proxy lit cette variable, `vite.config.ts:8`). `Start-Process` exige le **chemin absolu** de `bun.exe` (`…\npm\node_modules\bun\bin\bun.exe`) : `Get-Command bun` rend un `.ps1`, refusé (« n'est pas une application Win32 valide »). **Pas** de modèle par défaut **par fournisseur** (`Config.model` est global) ⇒ le contrôle dit « Default for new sessions » et nomme sa portée.
- webui — le contrôle de choix est `picker.tsx` (`Picker`), cherchable, **jamais un `<select>` natif** : ses `<option>` arrivant après la valeur posée retombent sur la première (`domValue: ""`), et jsdom ne rejoue pas cette course ⇒ un test « monte puis vérifie » passe sur le code fautif : viser le mécanisme (simuler la sélection perdue, puis changer les options) et faire trancher le navigateur.
- Échelle typographique webui (lot 17) : quatre jetons de **taille** — `--fs-title` 16, `--fs-base` 14, `--fs-note` 13, `--fs-meta` 12 — plus `--fs-display` (1.5rem, le seul niveau au-dessus du contenu) ; trois d'**interlignage** : `--lh-tight` 1.25, `--lh-normal` 1.5, `--lh-prose` 1.6, le `1` restant **nu** pour les glyphes. Icônes du rail : **16 px, une seule valeur**. ⇒ Toute taille nouvelle passe par un jeton : l'échelle existait et était documentée, le résultat portait quand même 9 tailles et 8 interlignages — **le nombre de valeurs distinctes est ce qui se vérifie, pas l'intention du fichier** (compter : `rg -o 'font-size:\s*[^;]+' | Group-Object`).
- Un jeton CSS **référencé mais non défini** n'émet **ni erreur ni avertissement** : `var(--x)` fait **hériter** la règle, donc la taille est celle du parent, que personne n'a choisie pour elle — et elle paraît plausible à l'œil. Mesuré 2026-10-15 : `--fs-label` utilisé 2×, jamais défini ; `--font-mono` utilisé 3× alors que le jeton est `--mono` (avec liste de repli, donc « ça marchait »). ⇒ Inventorier les jetons **utilisés** contre ceux **définis**, jamais l'un des deux seuls.
- Un panneau de réglages ne range pas une **action de premier plan** : changer le dossier de travail reste au pied du rail, la complétion l'y accompagne (`GET /project`, 962 o).
- Copie d'interface webui : **en anglais** depuis 2026-10-13 (**tout** `packages/webui/src/*`, `app.tsx` et `settings*.ts(x)` inclus) ⇒ toute chaîne affichée nouvelle s'écrit en anglais et les nombres suivent la langue (`$1.20`, `$0.005`, `1.2k`, `13.9k`, `1.5 MB`, `0 B`) ; commentaires, intitulés de test et `test(...)`/`describe(...)` restent en français (prose de dev) : seule la copie affichée a changé.
- Vite lancé par `Start-Process` depuis `bun run dev` : tuer le parent `bun` **ne tue pas** l'enfant `node …/vite.js`, qui garde le port ⇒ arrêter le processus `vite` lui-même (relevé par `Get-CimInstance Win32_Process`, filtré sur le chemin du paquet), pas seulement le `bun` lancé (mesuré 2026-10-13 : port 5180 encore ouvert après l'arrêt du parent).
- Sonde CDP : **borner chaque appel** (`Promise.race` avec un délai) et journaliser étape par étape ⇒ un appel qui ne revient pas devient un `TIMEOUT` lisible au lieu d'un script muet. Mesuré 2026-10-13 : trois sondes ont expiré sans rien afficher (seul le `console.log` final existait) ; la même mesure avec délais bornés est passée du premier coup. **Fermer TOUS les onglets d'une instance Chrome isolée la ferme** (`/json/close`) ⇒ relancer `chrome.exe --remote-debugging-port=9222 --user-data-dir=…`, ou réutiliser un onglet via `/json/list` au lieu d'en créer un par mesure.
- `GET /provider` du serveur rend **6,7 Mo** (228 fournisseurs, 8 775 modèles) et `GET /agent` 1,27 Mo : ne jamais les charger pour afficher un compteur — mesuré 2026-10-13, c'est ce qui gelait la feuille de configuration de la webui.
- Le fil webui se met à jour **en place** : `/event` porte `message.part.updated` (SyncEvent publié sur ProjectBus, `sync/index.ts:350`) **et** `message.part.delta` ; `/global/event` n'en porte **aucun** (autre enveloppe, sans `type` au premier niveau) ⇒ `reduceThread` applique l'événement, le rechargement REST ne subsiste que pour un message encore inconnu de la page.
- Forme de `message.part.updated` **relevée sur le fil** : `properties` porte la partie **aplatie** + `messageID`/`sessionID`, et non `{sessionID, part, time}` comme l'annonce le schéma (`message-v2.ts:692`) ⇒ lire `properties.part` ne rend rien, et cela ne se voit pas.
- `edit.state.metadata.filediff = {file, patch, additions, deletions}` (603 mesures) est la **seule** source des ±lignes d'une écriture — `PatchPart` ne porte que `hash` et `files[]` ⇒ ne pas chercher le comptage de lignes dans le patch.
- `bash.state.output` est la sortie **complète** (`metadata.output` n'en est qu'un aperçu : 589 o contre 804 mesurés) ; tailles mesurées sur 2 410 sorties : médiane 4 lignes, p90 46, p99 191, max 1 349 ⇒ borner l'affichage à 12 lignes puis « show N more lines ».
- Le fil se lit par **étape**, pas par message (`groupTurns`/`groupSteps`, `view-model.ts`) : ~6 étapes par réponse mesuré. `step-start`/`step-finish` ne s'affichent jamais eux-mêmes, mais `step-finish.cost`/`tokens` alimentent la ligne d'étape ; `patch`, `compaction` et `retry` sont visibles (ils étaient filtrés) — `snapshot` et `step-start` restent invisibles.
- **Toute route consommée par la webui doit figurer dans `API_PREFIXES` de `packages/webui/vite.config.ts`** : sinon le proxy Vite rend `index.html` avec un **200**, le SDK croit recevoir du JSON, échoue à le parser, et le `catch` avale l'erreur — l'écran reste **vide sans aucun message**. Piège refermé 5 fois (`/command`, `/plugin`, `/pty`, `/provider/auth`, `/question`) ⇒ après avoir branché une route, la sonder **par le proxy** (`Invoke-WebRequest http://127.0.0.1:5181/<route>`) et vérifier le `content-type`, jamais seulement le status. Invisible aux tests : jsdom n'a pas de proxy.
- `question.asked` est la **seule** écriture du fil (l'agent est bloqué dessus) ; la réponse est **positionnelle** — `{ answers: string[][] }`, un tableau de libellés par question, dans l'ordre. `question.replied`/`question.rejected` retirent sur `requestID` (pas `id`).
- `edit` : un `oldString` **non vide** dont les deux extrémités sont **éloignées** dans le fichier peut matcher **tout l'intervalle** et supprimer ce qui est entre ⇒ ancrer sur un bloc **court et contigu** (une seule règle, un seul bloc), et vérifier **après** par nombre de lignes **et** grep. Mesuré 2026-10-13 : 51 lignes de `styles.css` perdues (`.boundary` + tout le bloc `.question`) en voulant insérer les règles de copie ; réparé par `git checkout -- <fichier>` puisque la révision commitée les contenait.
- Grep de vérification : `-SimpleMatch` **et** `[regex]::Escape` ensemble cherchent le backslash littéral ⇒ **tout rend 0** et on croit le fichier cassé alors qu'il est sain (mesuré : `.boundary`, `.question-option`, `.patch-files` tous à 0 après une restauration réussie) ⇒ utiliser l'un **ou** l'autre, jamais les deux.
- Vérifier un comportement qui exige une **activation utilisateur** (presse-papiers, plein écran) : `.click()` en JS **n'en donne pas** ⇒ `navigator.clipboard.writeText` refuse et l'UI affiche son échec alors que le code est bon (faux négatif mesuré 2026-10-13). Clic **fiable** = CDP `Input.dispatchMouseEvent` (`mousePressed` puis `mouseReleased`, aux coordonnées du `getBoundingClientRect`) ⇒ « copied », `secure:true`. Corollaire de conception : un bouton dont l'échec est **silencieux** rend ce faux négatif indétectable — afficher l'échec est ce qui a permis de le diagnostiquer.
- Sonde CDP d'un état **interactif** — deux faux négatifs mesurés 2026-10-13, tous deux de la sonde et non du code ⇒ (1) survoler un élément **hors viewport** ne touche rien : `getBoundingClientRect().y` valait **-70553** sur un fil long ⇒ `scrollIntoView({block:'center'})` **puis** mesurer, jamais l'inverse ; (2) une sonde qui **bascule** (déplier/replier) doit être **idempotente** ou repartir d'un rechargement, sinon un run précédent laisse l'état ouvert et le clic suivant **referme** (`liCount` 0) ; (3) une page **gardée ouverte** ne reprend pas les derniers changements — HMR incomplet — et la mesure accuse alors le code à tort : mesuré 2026-10-14, un libellé et la rotation d'un chevron restaient à l'ancien état après deux éditions pourtant bien écrites sur disque ⇒ **vérifier la source avant d'accuser la page**, et relancer le Chrome isolé (le rechargement CDP tue l'attachement, cf. ci-dessus) ; (4) **relire l'état applicatif APRÈS la DERNIÈRE sonde, pas après celle qui l'a modifié** : mesuré 2026-10-14, un dossier de travail restauré puis « confirmé » a été rechangé par une sonde ultérieure, et la restauration affirmée ne valait plus — l'hygiène d'état se constate en fin de lot.
- Le clic par **coordonnées** CDP (`Input.dispatchMouseEvent`) rate sa cible quand l'élément a bougé : `.click()` en JS sur le même élément a fonctionné là où deux clics aux coordonnées n'ont rien fait (mesuré 2026-10-14 sur une ligne de rail). Réservé à ce qui exige une **vraie** activation utilisateur (presse-papiers, plein écran) ⇒ pour sélectionner ou ouvrir, `.click()` d'abord.
- `GET /file/content` résout `path` **sous la racine du projet** et rien d'autre — mesuré 2026-10-14 : `path=AGENTS.md&directory=<projet>/packages/opencode` rend 7 291 o, `path=<chemin absolu>` rend une chaîne **vide**, un fichier **hors** projet rend un **500**. Or les injections d'instructions portent des chemins **absolus** (dont `~/.config/opencodev2/AGENTS.md`, hors projet par nature) ⇒ `relativeTo(path, worktree)` décide, et l'écran dit « not readable from here » au lieu d'une boîte vide. Piège de sonde : `EscapeDataString` encode `/` en `%2F` et le chemin ne se résout plus ⇒ un « contenu vide » accuse la sonde avant la route.
- `GET /path` rend **deux** bases distinctes : `directory` = dossier d'instance (`packages/opencode`) et `worktree` = racine du projet ⇒ pour résoudre un chemin du dépôt, la base est `worktree` (tous les fichiers du projet ne sont pas sous l'instance).
- SDK : `client.find.files(...)` (et **non** `find.file`) et `client.file.read(...)`. `GET /command` = **1,95 Mo** (tableau `{name, description, source, template, hints}`), `GET /find/file` = tableau de **chaînes** (chemins relatifs) ⇒ projeter aussitôt, lire à la demande.
- Pile de dev webui isolée (4097 `devdb-serve` + 5181 `webui-dev-5181`) : elle **meurt avec le shell** qui l'a lancée (`Start-Process`), et l'onglet affiche alors « Ce site est inaccessible » avec un rail **vide** — ce qui ressemble à un plantage du code ⇒ sonder `/json/list` puis la santé des **deux** ports **avant** de suspecter le code. Relance : `Start-Process -FilePath cmd -ArgumentList '/d','/c','bun x vite --port 5181'` (`Start-Process` refuse le shim `.ps1` de `bun`).
- Barres de défilement webui : **une seule règle globale** (`*::-webkit-scrollbar`), jamais une liste de sélecteurs — énuméré, le style laisse chaque nouveau conteneur défilant en barre native (gouttière **15 px**, claire, à flèches ; mesuré sur `.tj-main`). Et **un seul mécanisme** : `scrollbar-width`/`scrollbar-color` **désactivent** `::-webkit-scrollbar` dans Chromium dès qu'ils valent autre chose que `auto` ⇒ repli standard sous `@supports not selector(::-webkit-scrollbar)`, jamais en parallèle (mesure d'un style de barre = `getBoundingClientRect().width - clientWidth`, la gouttière).
- Implémenter une fonctionnalité sur le harnais ⇒ suivre la skill dédiée : webui `opencode-webui-feature` (cible écrite → TS pur testé → preuve CDP pile isolée → lot `PROGRESS.md` → commit `feat(webui)`) · native `opencode-fork-feature` · plugin `opencode-plugin-feature`.
- Vérifier une interface : **mesurer la composition, pas seulement les éléments**. Mesuré 2026-10-14 — un audit qui relevait largeur, hauteur et rôle de **chaque** élément du rail n'a pas vu ses deux défauts les plus visibles (quatre retraits gauches différents : 8, 10, 24, 32 ; et un pied cassé en deux lignes, dont un bouton orphelin lu comme une légende). L'œil lit l'**alignement** et le **groupement**, qu'aucune mesure par élément ne rend ⇒ relever les **valeurs distinctes** des bords gauches d'une colonne, la ligne occupée par chaque groupe, et mettre la capture côte à côte avec la référence — « est-ce que ça existe ? » ne répond pas à « est-ce que ça tient ? ».
- Un bouton qui agit et dont l'effet ne se voit pas est **pire** qu'un bouton mort : mesuré 2026-10-14, le bouton `stats` basculait bien son état mais `detailsWidth` ne donnait une largeur au tiroir que sur une permission en attente ⇒ le panneau se rendait dans une colonne à 0 px. ⇒ Devant « ce bouton ne fait rien », mesurer **l'effet** (ici la largeur rendue), pas seulement l'état : la cause est souvent en amont du contrôle.
- Une **instance Vite de longue durée peut servir un module périmé** — et c'est le **serveur**, pas le navigateur. Mesuré 2026-10-15 : la feuille servie portait `.send { width: 30px; border-radius: 50% }`, la feuille **chargée** dans l'onglet gardait `28px/8px`, et le fichier portait **déjà** la nouvelle valeur (vérifié après coup : le bloc est identique au commit et sur disque — donc la révision périmée ne venait pas du disque). Écartés avec preuve : le fichier, un proxy (aucun ; un port mort échoue bien), le cache HTTP (`setCacheDisabled`), la spécificité (une seule règle), un service worker (aucun), `reload({ignoreCache})`, la navigation versionnée, `about:blank` puis retour, et un **processus de navigateur neuf**. Ce qui **guérit** : relancer le serveur Vite (une instance neuve sert la bonne règle du premier coup). Le mécanisme exact côté Vite (veilleur mort ou cache de transformation) n'est **pas** établi — ne pas l'affirmer. ⇒ Mesurer sur **pile relancée + onglet créé par `Target.createTarget`** (`/json/new` crée un onglet invisible à `/json/list`), et lire `document.styleSheets[].cssRules[].cssText` plutôt que la seule valeur calculée — recette `verifier-une-modification-webui-sur-une-pile-neu`.
- Le harnais a **deux compositeurs** (`home-composer` pour l'accueil, `composer-inner` pour une session) au balisage dupliqué : une mesure sur l'accueil ne voit jamais celui de session et réciproquement. Mesuré 2026-10-15, une correction appliquée au mauvais a été déclarée faite alors que l'écran ne changeait pas ⇒ avant de corriger un composant du fil, **compter ses sites d'appel** (`rg -n 'class="<classe>"'`), et viser celui que la mesure montre réellement.
- Workflow de codage agentic (besoin → solution vérifiée) : agent `.opencode/agent/coding-orchestrator.md` (pipeline P0 → P9), entrée `/deliver <besoin>` (`.opencode/command/deliver.md`), spec `specs/agentic-coding-workflow.md`. Les règles de fond restent `~/.config/opencodev2/AGENTS.md` : le workflow n'en fixe que l'ordre d'exécution et ce qui se délègue. Il n'exige aucun rebuild (config pure) ; `swarm` reste le chemin lourd réservé aux missions ≥ 3 lots réellement indépendants.
- Flux SSE de la webui : `EventSource` ne rappelle **jamais** `onerror` quand la socket reste ouverte sans rien livrer (proxy Vite qui tient la connexion après un redémarrage du serveur, TCP à demi fermé) ⇒ mesuré 2026-10-15 sur la pile isolée 4097/5181 : serveur tué, journal figé sur ses 6 lignes, **zéro** erreur console, aucun `server.connected` de retour — la lecture seule ne suffit pas, il faut une garde. Remède : `events.ts` rend `{ stop, watchdog }` et `app.tsx` appelle `watchdog(Date.now())` au battement de 10 s du sondage de santé ; le verdict est pur (`streamSilent`, `stream-sync.ts`) et se mesure contre le battement serveur de 10 s (`server/routes/instance/httpapi/handlers/event.ts:30`) ⇒ silence > 30 s avec état « connecté » = flux remplacé + reconnexion comptée, ce qui déclenche la relecture du fil et de `GET /session/status`.
- Free tier Zen : la porte est **côté serveur** et fermée au fork. Mesuré 2026-10-15 : fournisseur `opencode` → `https://opencode.ai/inference/v1`, modèles gratuits `deepseek-v4.1-flash-free` / `deepseek-v4-flash-free` (coût 0) ; `Authorization: Bearer public` — la voie que le fork emprunte **sans credential**, `provider.ts:175-190` posant `apiKey: "public"` quand `auth.json` n'a aucune entrée `opencode` — rend **403 `FreeTierError`** (« OpenCode's free tier can only be used from within OpenCode ») pour **toutes** les variantes d'en-tête testées (`opencode/2.4.5`, `opencode/local`, `opencode/latest`, sans UA, `x-opencode-session` au format `ses_` conforme, session UUID, session vide) ⇒ ne pas chercher à débloquer le gratuit par les en-têtes : la recette des issues #49433 (User-Agent semver + session `ses_`) est morte, et ce 403 est le chemin **normal** du fork, pas une panne locale. Contre-épreuve A/B mesurée le 2026-10-15 : le client **officiel** (`%APPDATA%\npm\opencode.exe`, 1.18.58) lancé sur des XDG isolés — config vierge, `auth.json` absent — rend **exactement le même message** sur `opencode/deepseek-v4.1-flash-free` ⇒ la porte est **côté compte**, pas côté client : aucun réglage du fork (version, en-têtes, config) ne la franchit, et le seul levier restant est un credential Zen (`opencodev2 auth login`). Piège de cette contre-épreuve : le client officiel **refuse** la config globale du fork — `~/.config/opencode/opencode.json` y porte la clé `jev`, inconnue de l'amont, et il sort sur « Configuration is invalid … Unrecognized key: jev » (EXIT=1) avant tout appel réseau ⇒ isoler par `XDG_{CONFIG,DATA,STATE,CACHE}_HOME` + `OPENCODE_TEST_HOME` sur un dossier temporaire, sinon le run ne teste rien. Le canal qui répond est `opencode-go` (`https://opencode.ai/inference/go/v1`, clé `opencode-go` du coffre → 200 réel sur `deepseek-v4-flash`) ; les identifiants `*-free` y rendent 400 « Model is unavailable » (ils n'appartiennent qu'à `opencode`). La condition d'accès par modèle (`allowAnonymous`, qui décide si une clé est exigée — `packages/console/app/src/routes/zen/util/handler.ts:567-570`, `:693`) **n'est pas dans le dépôt** : le catalogue zen est assemblé à l'exécution depuis des ressources déployées (`Resource.ZEN_MODELS22..30`, `packages/console/core/src/model.ts:98-108`) et la chaîne `FreeTierError` elle-même en est absente ⇒ ne pas chercher le gate dans le code local, et ne pas conclure du seul 403 anonyme que le modèle est inaccessible à un compte Zen (voie non mesurée faute de credential `opencode` dans le coffre).
- Client officiel **v2** (mesuré 2026-10-15) : paquet npm `@opencode/cli` (2.0.29), binaire `node_modules\@opencode\cli\bin\opencode.exe` (203 Mo) posé via des **shims** `opencode`/`opencode.cmd`/`opencode.ps1` (il n'y a plus d'`opencode.exe` à la racine du préfixe npm) ; installer par `npm install -g --allow-scripts=@opencode/cli @opencode/cli` — le `postinstall` sélectionne le binaire natif et npm le **bloque par défaut**, et npm refuse d'écraser des shims résiduels (`EEXIST` sur `opencode`, `opencode.cmd`, `opencode.ps1`) qu'il faut **écarter par renommage** d'abord. Ce client lit le dossier **`opencode`**, pas `opencodev2` — `opencode debug paths` le confirme (`config=~/.config/opencode`, `data=~/.local/share/opencode`), et `opencode debug agents|config` sert à vérifier ce qu'il découvre. Il **refuse la clé `jev`** de la config du fork (`Unrecognized key: jev`, sortie immédiate) : la retirer, sauvegarde à l'appui.
- **Blocage mesuré de la v2 officielle** : avec la configuration complète, `opencode models --standalone` rend `ServiceUnavailableError: Location plugins did not finish activating` (0 modèle), alors qu'une config minimale (`$schema` + `provider`) rend **203-204 modèles en exit 0**. Isolé par variantes : ni la base v1, ni le dossier de données, ni le dossier `plugin/`, ni la clé `plugin`, ni les greffons de projet, ni la clé `provider` ne sont la cause ; chaque groupe de clés — (model/small_model/mcp/attachment), (agent/tasks/lsp), (instructions/permission/compaction/experimental) — **passe seul**, chaque **paire passe**, l'**union des trois échoue**, et retirer une clé isolée (`agent`, `lsp`, `mcp`) ne suffit pas ⇒ effet de **combinaison** (délai d'activation dépassé), pas une clé fautive. Ne pas chercher « la clé coupable » : il n'y en a pas.
- Sauvegardes de binaire : `%APPDATA%\npm\opencodev2.exe.bak.*` en compte **15** (~3,4 Go, mesuré le 2026-10-15) et **leur nom ne dit pas ce qu'elles contiennent** — `…bak.2.4.4-20261011-183327` rend **2.4.2**, `…bak.2.3.70-20261010-175019` rend **2.3.69** : deux conventions de nommage coexistent (une sauvegarde nommée d'après l'ancienne version, les plus anciennes d'après la nouvelle) ⇒ avant tout retour arrière, lancer `--version` sur **une copie portant l'extension `.exe`** (exécuter directement un nom en `.bak.…` fait bloquer la commande — mesuré : lot tué au délai de 180 s, sans erreur), jamais se fier au nom.
- Ligne de base des tests du paquet `opencode` au 2026-10-15 — échecs **antérieurs** à toute modification, établis par A/B (`git checkout <commit> -- <fichier>` puis relance) : `test/provider/provider.test.ts` → 2 échecs (`plugin config providers persist after instance dispose`, `plugin config enabled and disabled providers are honored`) ; `test/plugin/auth-override.test.ts` → 1 échec (`user plugin overrides built-in github-copilot auth`) ⇒ ne pas les imputer à une modification en cours, et rejouer l'A/B avant de conclure à une régression. Paquet `core`, même méthode (suite complète : **403 pass / 2 fail**) : `test/project.test.ts` → 1 échec (`ProjectV2.resolve > returns global for non-git directory`) et `test/effect/cross-spawn-spawner.test.ts` → 1 échec (`captures stdout via .all when no stderr`) — reproduits à l'identique avec le greffon `core/src/plugin/provider/opencode.ts` remis à sa version parente.
- Le fournisseur `opencode` (Zen) **n'avait aucune méthode d'authentification** : `ProviderAuth.methods()` ne remplit sa carte que depuis les hooks `auth` des greffons (`provider/auth.ts:117-131`) et aucun n'en déclarait pour lui ⇒ la CLI ne pouvait enregistrer aucun credential Zen. Corrigé par `packages/opencode/src/plugin/opencode.ts` (`auth.provider: "opencode"`, méthode `api`), enregistré dans `INTERNAL_PLUGINS` (`plugin/index.ts`) ; pour une méthode `api`, le CLI collecte la clé lui-même et écrit `{ type: "api", key }` sous l'identifiant du fournisseur (`cli/cmd/providers.ts:172-189`). Reste à déployer (rebuild) pour agir sur le binaire.
- Un credential d'auth **vide** ne vaut pas authentification : `provider.ts:180` exige une clé ou un jeton **non vide** (`auth.key !== ""` / `auth.access !== ""`), sinon le chargeur `opencode` retombait sur la clé anonyme `public` et n'envoyait aucun en-tête `Authorization`. Le catalogue, lui, garde son contrat : sans credential le fournisseur reste listé avec ses seuls modèles gratuits, et un catalogue **vide ferait disparaître le fournisseur** (`provider.ts:1644`, `delete providers[providerID]`) — donc ne jamais vider `input.models`. Preuve sur les artefacts (A/B mesuré le 2026-10-15, même `auth.json` isolé portant `{"opencode":{"type":"api","key":""}}`, route `/config/providers`) : le binaire **2.4.5** expose **84** modèles pour `opencode` (le credential vide passait pour une authentification) contre **10** — les seuls gratuits — pour **2.4.6** ⇒ ce compteur est la preuve de non-régression du correctif.
- Clé Zen : format `oc_sk_…` (**51** caractères) ; le console ne montre qu'une forme **masquée** (`oc_sk_0a2dfb7414c3…`) et la création ne l'affiche **qu'une fois** (« Copy this key now. It won't be shown again. ») ⇒ une clé n'est jamais relisible, il faut en créer une — page `https://opencode.ai/console/account` (section « Personal API keys », boutons `Revoke`/`Add API key`), dialogue de création = nom + expiration + permissions (boutons `Cancel`/`Create`). Rangée au coffre sous `zen-opencode-key` et dans `auth.json` (`opencode`, `type: api`).
- Une clé Zen **valide ne franchit pas la porte du gratuit**, mesuré le 2026-10-15 avec une clé créée dans le console et vérifiée **200 sur `/inference/go/v1`** : `opencode/deepseek-v4.1-flash-free` → **403 `FreeTierError`** (identique à l'anonyme), `deepseek-v4-flash` et `gpt-5.4` → **403 « Model access is disabled »**, `claude-haiku-4-5`/`grok-4.7`/`muse-spark-1.3`/`gpt-5.4-nano` → **402 « Insufficient account funds »** ⇒ le refus n'est **pas** un problème de credential : porte d'identité de client pour les gratuits, absence de fonds/droits pour les payants. Aucun modèle `opencode` n'est donc utilisable sur cet espace ; le canal qui répond reste `opencode-go`. A/B sur le binaire déployé : credential absent ou vide → **10** modèles exposés pour `opencode`, clé valide → **84** (le chargeur lit bien le credential).
- Console opencode.ai — deux pièges de pilotage mesurés le 2026-10-15 : un filtre de bouton approximatif (`/add/i`, `/create|add/i`) attrape **« Add credits »** et ouvre le dialogue de paiement (aucun débit car le libellé de confirmation ne correspondait pas), et un `document.querySelectorAll('input')` sur toute la page remplit le champ **« Your name » du compte** au lieu du champ du dialogue ⇒ viser le **libellé exact** (`"add api key"`), poser une **liste noire** (`credit|pay|billing|delete|revoke`), et **borner les sélecteurs au dialogue** (`[role="dialog"]`).
- Preuve de bout en bout d'un modèle réellement servi (2026-10-15) : `opencodev2 run -m opencode-go/deepseek-v4.1-flash "Reponds uniquement OK"` → **exit 0**, réponse `OK` ; à lancer en **HOME isolé** (`XDG_{CONFIG,DATA,STATE,CACHE}_HOME` + `OPENCODE_TEST_HOME` sur un dossier temporaire, avec `auth.json` recopié dans `<data>\opencodev2\`) — c'est ce qui le fait rendre au lieu de rester suspendu. Piège d'identifiant : `opencode-go` **expose** `deepseek-v4.1-flash` et non `deepseek-v4-flash` (`Model not found` + suggestion), alors que l'endpoint nu `/inference/go/v1/chat/completions` accepte `deepseek-v4-flash` ⇒ un identifiant validé par un appel HTTP direct **n'est pas** un identifiant de modèle du fork : prendre le nom au catalogue du fournisseur. Les deux voies divergent **sans credential**, et chacune est optimale pour son mécanisme : la v2 peut exprimer « fournisseur listé, aucun modèle offert » (`enabled: false` — `catalog.ts:281-317`, et `provider.available()` ne filtre que `provider.enabled`, `:253-256`) ; la v1 ne le peut pas — son type `Model` n'a pas d'`enabled` et un catalogue vide **supprime** le fournisseur (`provider.ts:1644`) ⇒ elle garde les modèles gratuits **tant qu'aucun credential n'est présent** (sans eux, un catalogue vide supprimerait le fournisseur, donc la saisie de clé) et les **écarte dès qu'un credential existe** — depuis 2.4.7, parce qu'un modèle qui ne peut jamais répondre ne doit pas être proposé.
- 🔴 **DEUX canaux gratuits distincts, à ne jamais confondre** (mesuré le 2026-10-15) : `opencode/*-free` (Console, endpoint `/inference/v1`) est **fermé** — 403 `FreeTierError` pour tout client non attesté, clé valide comprise ; `opencode-go/*-free` (endpoint `/inference/go/v1`) est **ouvert** et répond — `opencodev2 run -m opencode-go/longcat-2.5-preview-free` et `…/cat-jam-free` rendent **exit 0** et une réponse, avec la clé `opencode-go` ordinaire, et le catalogue du binaire les expose (`opencode-go` : 31 modèles dont 3 `free` — `longcat-2.5-preview-free`, `cat-jam-free`, `step-5-preview-free`, ce dernier rendant 429 « Endpoint is unavailable » par intermittence). La doc de `console/go` nomme ces trois-là sur `go/v1`, tandis que celle de `console/models` annonce le Console utilisable « with OpenCode **or another coding agent** » ⇒ **répondre « non » au nom de `opencode/*-free` sans avoir interrogé `opencode-go` est l'erreur à ne pas refaire** : à la question « puis-je utiliser un modèle gratuit ? », tester `go/v1` d'abord. La voie de l'**identité de compte** est fermée elle aussi, mesuré le 2026-10-15 : `POST https://opencode.ai/auth/device/code` avec le `client_id: "opencode-cli"` du fork rend **200 mais du HTML** (la page du Console — le repli SPA, donc vérifier le **corps**, pas le statut) et `/v2/auth/device/code` rend **404** ; par ailleurs `account.json` n'est qu'un magasin de credentials par fournisseur (8 entrées, `{type, key}` ou `{type, refresh, access}`), qu'aucun chemin d'inférence ne consomme — seuls `share`, `config` et `experimental` le lisent, et le greffon v2 ne s'en sert que comme signal `enabled.via === "account"`. ⇒ tout a été tenté : clé valide, anonyme, client officiel 1.18.58 non authentifié, sept variantes d'en-têtes, compte lié. La porte se franchit sur le serveur, pas ici ; le seul repli gratuit réellement servi est `opencode-go/*-free`. Et ce que le client officiel a de plus **n'est pas copiable** : ce binaire (`%APPDATA%\npm\opencode.exe`, 170 Mo) **est reconnu** par le serveur — il reçoit `429 free_tier_limit`, « Free usage exceeded, subscribe to Go », avec un rendez-vous de réessai remis à 00:00 UTC — tandis que la **même clé**, les **mêmes en-têtes relevés à la capture** (`user-agent: opencode/1.18.58 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`, `x-opencode-client`, `x-opencode-project`, `x-opencode-request`, `x-opencode-session`), le **même corps en flux** et les routes `/inference/v1` comme `/zen/v1` rendent tous **403 FreeTierError** — mesuré à clé constante sur 5 routes, 5 variantes d'en-têtes et 4 formes de corps, sous Node **et** sous Bun ⇒ le discriminant n'est dans **aucun contenu HTTP copiable** : il est sous la couche application (empreinte de transport, ou liaison à la distribution officielle), donc hors de portée d'un réglage du fork. Le fork, lui, n'envoie **aucun** de ces quatre en-têtes (0 occurrence dans ses sources). Contre-épreuve sur une **troisième** pile TLS : `curl.exe` (Schannel), mêmes en-têtes, même corps, même clé → **403 FreeTierError** également (Node/undici et Bun déjà mesurés) ⇒ trois moteurs indépendants échouent là où le binaire officiel passe, ce qui exclut l'empreinte fortuite d'un moteur et confirme que le discriminant est **sous** la couche application. Piège écarté au passage : les 80 occurrences de `attest` dans ce binaire sont la vérification de signatures **npm/TUF** (`createVerifier`, `TUFError`, « has attestations with keyid »), **pas** un mécanisme d'identité — ne pas y chercher la porte. Deux faits opérationnels mesurés le 2026-10-15 : ce client **accepte la configuration du fork** dès qu'on en retire la seule clé `jev` (les 14 autres conservées, démarrage effectif — `Unrecognized key: jev` n'est donc pas un obstacle de fond, et isoler par `XDG_*` + `auth.json` recopié suffit à le prouver) ; et il ne **rend pas** d'erreur sur un quota gratuit épuisé, il **programme une nouvelle tentative** à l'échéance donnée par le serveur (`delay=30165000` ms ≈ 8,4 h, remise à 00:00 UTC) ⇒ un `run` sur un modèle gratuit apparaît **suspendu** au lieu d'échouer : le tuer ou attendre l'échéance, et ne pas conclure à un blocage.
- Coexistence fork / client officiel v2 (mesuré 2026-10-16) : la v2 **ne démarre pas** si `~/.config/opencode/plugin/` contient les greffons v1 `.mjs` (`ServiceUnavailableError: Location plugins did not finish activating`, 0 modèle) — or ces fichiers sont **référencés par le fork** (`~/.config/opencodev2/opencode.jsonc:1117/1124/1131`) ⇒ ne pas les supprimer ni les déplacer, et **une jonction ne suffit pas** (le scanner la suit et retrouve les fichiers). Solution retenue : un dossier dédié `~/.config/opencode-v2/` (config du fork **moins `plugin`**, jonctions vers `skills` et `agents`, aucun `plugin/`) et le lanceur `%APPDATA%\npm\opencode-v2.cmd` qui pose `XDG_CONFIG_HOME` dessus. Vérifié : `opencode-v2 models --standalone` → **719 modèles dont 29 `opencode-go`**. **Non résolu** : `opencode-v2 run --standalone` reste **suspendu** — le client lance `serve --stdio --port 0` et n'en revient pas — y compris sans `mcp` ni `lsp` ; la cause n'est pas établie, ne pas la chercher dans une clé de configuration isolée. Précision mesurée le 2026-10-16 : le serveur enfant que `run` lance **fonctionne** — `serve --stdio --port 0` lancé seul affiche aussitôt `{"url":"http://127.0.0.1:<port>"}` sur sa sortie standard et reste vivant (comportement normal), tandis que `serve --port 4201` annonce `server listening on http://127.0.0.1:4201` en moins de 8 s ⇒ le blocage est **côté client `run`**, pas côté serveur ni dans la configuration ; le TUI (`opencode-v2` sans argument) et le mode serveur ne sont donc pas concernés. Piège de sonde au passage : en mode stdio la mise en écoute s'annonce par `{"url":…}`, **pas** par le mot « listening » — chercher « listening » rend un faux négatif. Ce que la v2 **ignore silencieusement** de la configuration du fork (relevé de son journal le 2026-10-16, 2 196 avertissements `kind=unsupported`, action « omitted unsupported legacy setting ») : **2 100** sur les modèles de `provider.command-code` (réglages `.reasoning` hérités), plus `experimental.openTelemetry`, `experimental.batch_tool` et `compaction.prune` (32 occurrences chacun) ⇒ les overrides de modèles d'un client ne suivent pas vers l'autre ; et `failed to sync GitHub Copilot models: 401` (14 occurrences) — credential Copilot expiré, fournisseur de toute façon désactivé. Ne pas « uniformiser » ces deux comportements : les aligner sur la voie v1 masquerait le fournisseur, les aligner sur la v2 changerait un contrat que deux tests de `provider.test.ts` tiennent.
- Client officiel v2 — état au 2026-10-17 : version installée **2.0.32** (mise à jour depuis 2.0.29 via `npm install -g --allow-scripts=@opencode/cli @opencode/cli@latest`, après avoir **écarté par renommage** les shims `opencode`/`opencode.cmd`/`opencode.ps1` que npm refuse d'écraser — `EEXIST`), `opencode-v2 models --standalone` rend **exit 0 / 720 modèles** et `opencode-v2 auth list` laisse voir « **OpenCode Go — API key — stored** », mais `opencode-v2 run --standalone` reste **muet** (0 octet, aucun message) : le journal montre qu'il s'arrête après la réconciliation des greffons (12) et le contrôle de version, sans jamais atteindre l'appel au modèle. Un 0 modèle avec `ServiceUnavailableError: Location plugins did not finish activating` juste après une mise à jour est un **accident de course** (deux processus v2 concurrents), pas une régression — réexécuter avant de conclure.
- Catalogue du client officiel v2 (mesuré 2026-10-17) : `models.opencode.ai` et `models.dev` servent **le même catalogue** (5 619 Ko identiques, `200` en ~1,7 s chacun — le premier est un miroir du second) et l'`ENOTFOUND models.opencode.ai` du journal v2 est **transitoire** ⇒ ne pas partir en chasse au DNS là-dessus. Piège de sonde : `Resolve-DnsName -QuickTimeout` déclare « Défaillance du serveur DNS » sur les **deux** noms alors que les téléchargements HTTP aboutissent — un faux négatif qui m'a fait croire à une panne DNS.
- `jev-1.13` / `jev-1.13-free` **ne sont pas des modèles de conversation** et n'ont rien à faire dans le catalogue : endpoint `/inference/v1/systemone` (jamais `chat/completions`), payload `{ state, questions }`, réponse typée `{answers:{…:{noul|choice|score}}}` — c'est le service de décision Jev, que le fork appelle déjà par son outil. Mesuré le 2026-10-15 avec la clé `opencode` : `jev-1.13-free` → **200** et une réponse typée (gratuit, utilisable), `jev-1.13` → **402** sur `/systemone` comme sur `/chat/completions` (reconnu, compte sans fonds) ⇒ **trois** canaux gratuits distincts : `opencode/*-free` fermé, `opencode-go/*-free` ouvert, `jev-1.13-free` ouvert sur `/systemone` mais dans son format typé.
- Le catalogue distant (`https://models.dev/api.json`) et le cache local `~/.cache/opencodev2/models.json` sont **identiques** — mesuré le 2026-10-15, 0 écart sur `opencode` (123) comme sur `opencode-go` (38) ⇒ « ajouter des modèles au catalogue » n'a pas de sens en soi ; ce qui manque à l'interface, ce sont les entrées que le catalogue marque **`deprecated`** (7 sur `opencode-go`, 39 sur `opencode`, et ce sont exactement celles qui portent un champ `status`), retirées volontairement (`provider.ts:1636` `delete provider.models[modelID]`, `:1261`, et les trois sélecteurs `dialog-model`/`dialog-vision-model`/`dialog-decision-model` filtrant `status !== "deprecated"`) ⇒ avant de conclure qu'un modèle est perdu, confronter la page officielle **et** le statut du catalogue, jamais l'une des deux seules.
- TUI — un prompt en file doit **rester rendu avec son badge `QUEUED`** : `renderInTranscript` le masquait du fil (l'invite annonce pourtant « enter queue ») et rendait le libellé QUEUED inatteignable (code mort) ⇒ le badge se décide par le statut, jamais en retirant la visibilité. Le badge `STEER` se décide par le seul `/metadata.steer`, jamais par le scan de l'ancre : celui-ci doit ignorer les messages internes au run (compaction, notification de fond) et les steers déjà servis, comme `PromptQueue.pendingUserID` — sinon un steer perd son badge dès que le tour de l'ancre s'est fermé pendant que le run continue (`pending-turn.ts`).
- TUI — `inspect_batch` se lit **sur une seule ligne repliée** (`inspect_batch · N actions ▸`), dépliée au **clic** sur l'en-tête, repliée au second clic ; l'état est **local au composant** (deux blocs du même fil se replient indépendamment) et rien ne se déplie tout seul pendant un batch ⇒ le lecteur décide. Chevron et clic n'existent que s'il y a quelque chose à révéler (au moins une ligne, ou une note) : pas de contrôle mort (`inspect-batch-tree.tsx`, `docs/inspect-batch-ui.md`).
- Vérifier **visuellement la TUI** : aucun outil ne capture son écran (le lecteur du terminal MCP est **delta** — un second `terminal_read` rend 0 ligne sans nouveau flux — et ne garde pas la trame) ⇒ `bun packages/opencode/script/tui-shot.ts --session <id> [--db <chemin>] [--cwd <dir>] [--click "<texte>" …]` lance la TUI dans un **PTY** (bun-pty), rejoue son flux ANSI dans un émulateur minimal et imprime des **trames texte** ; `--click` envoie un vrai clic souris SGR (la TUI active 1000/1002/1006), donc `--click x --click x` montre replié → déplié → replié. Compter **~15-20 s** avant la première peinture — une trame plus tôt est vide et ce n'est pas un échec. Piège de données : `bun dev` ouvre la base du **channel dev** (`opencode-dev.db`), donc `--session` sur une session réelle rend « Session not found » si la base n'est pas la sienne ⇒ `OPENCODE_DB=<chemin>` sur une **copie** (`VACUUM INTO`, jamais la vraie). Pour une session courte qui **finit** sur le bloc à voir : `opencodev2 export <id>` (binaire déployé, sa base, lecture seule), tronquer le JSON juste après le part voulu, puis `bun run --conditions=browser ./src/index.ts import <fichier>` avec `OPENCODE_DB` sur la base de test.
- `run` — l'affichage d'une exécution batch vit dans `packages/opencode/src/cli/cmd/run/` : la **commande est bornée** à sa première ligne + `· +N lines` (jamais de troncature de caractères — couper un chemin masque la cible au lieu du volume), et le **statut n'est écrit qu'en échec** (`✗ exit N · durée`, ton d'erreur) puisque le code de sortie n'existe pas quand l'en-tête est écrit. `TOOL_RULES.bash.view.final` doit donc rester `true` : à `false`, la ligne de statut existe dans le code et n'atteint jamais l'écran, et `exit 1` s'affiche exactement comme un succès (mesuré 2026-10-16, `state.status` restant `completed`). Le code de sortie se lit dans `metadata.exit` par un seul accesseur (`toolExitCode`), partagé par le texte (`scrollBashFinal`) et la couleur (`entryFailed`) pour qu'ils ne puissent pas se contredire (`docs/run-scrollback-ui.md`). La même borne s'applique au printer **non-TTY** (`runBash`, mode par défaut de `run` sans `--interactive`) ; le verdict `✗ exit N`, lui, n'existe que dans le scrollback de `--interactive` — ne pas le chercher ailleurs.
- Base de tests `run` (mesuré 2026-10-16, A/B au HEAD) : `test/cli/run/run-process.test.ts` échoue **3 fois sur 4** sur cette machine — le sous-processus `bun run src/index.ts run` ne rend jamais la main et le harnais synthétise `exit -1` après ~31 s ⇒ ne pas l'imputer à une modification, et ne pas chercher la preuve de bout en bout du `run` par cette voie : s'appuyer sur le rendu réel (`RunScrollbackStream` + `createTestRenderer`).
- TUI — opacité du fil : **deux crans dérivés du thème**, `theme.textLow` = le `text` du thème à demi opacité (alpha quantifié 128/255), calculé dans `resolveTheme` (`context/theme.tsx`) ⇒ **loud** = la prose de l'agent **et la commande bash** ; **low** = tout ce que l'agent rapporte (sortie bash et d'outil, contenu écrit ou patché, contexte de diff, en-tête de lot). Un gris figé ne suivrait pas les thèmes : garder la teinte, faire varier l'alpha. `generateSyntax`/`generateSubtleSyntax`/`selectedForeground` prennent `ResolvedThemeBase` (forme **sans** le cran) — y repasser un `Theme` fait échouer le typecheck de `run/theme.ts` (`docs/tui-transcript-opacity.md`).
- TUI — bash : la commande est bornée à sa première ligne + `· +N lines` et la sortie à **5** lignes (`Shell`, `routes/session/index.tsx`), **un même clic** déplie les deux (jamais de troncature de caractères : couper un chemin masque la cible au lieu du volume). L'en-tête de lot se lit `Explore · N read · M grep · K glob` (`util/inspect-batch-tree.ts` — `inspect_batch` n'accepte que read/grep/glob, les types inconnus sont comptés `invalid`). Les instructions injectées **reviennent dans le fil** sous le message utilisateur : `core · instructions · N sources`, spinner tant que la session est occupée, sources derrière le clic (`util/instructions-injection.ts` — la part est synthétique et ignorée, seules les sources déclarées sont montrées). Un tour de **compaction** n'en reçoit jamais : son prompt est rejoué dans un message **neuf** après le résumé, donc ce message-là reste sans sources tout en étant le dernier ⇒ l'exclure de l'état `injecting`, sinon la ligne tourne pendant la compaction **et** le tour suivant (mesuré 2026-10-20 : message utilisateur dont l'unique part est `compaction`). La ligne d'attente de compaction s'arrête au **résumé terminé** (`time.completed`), pas à sa création : sur la même session, le message du résumé apparaît 5 s après la part et se termine **59 s** plus tard (`util/compaction-row.ts`).
- Base de tests TUI (mesuré 2026-10-16, A/B au HEAD) : `test/cli/tui/plugin-loader.test.ts` échoue sur cette machine au HEAD aussi (chargement de plugin, sans rapport avec un changement d'affichage) ⇒ ne pas l'imputer à une modification.
- Retry de session (mesuré 2026-10-16) : `retryable()` réessaie aussi les statuts **408/425/429** (sans exiger le drapeau du SDK) et les motifs de **transport** (`fetch failed`, `socket hang up`, `ECONNRESET`, `stream closed`, `timed out`…) — ces erreurs coupaient la session ; un `AbortError` demandé par l'utilisateur n'est **jamais** réessayé. Plafond explicite `RETRY_MAX_ATTEMPTS = 10` (`RETRYABLE_STATUS`, `TRANSIENT_MESSAGE_PATTERNS`, `src/session/retry.ts`) : sans lui, un `retry-after` serveur de plusieurs heures retenait la session indéfiniment. Deux limites à connaître : le délai **serveur** n'est pas plafonné (un quota annoncé à 8 h attend 8 h, puis l'erreur est rendue après le plafond), et la reprise reste interdite dès qu'un contenu a été facturé (`Effect.retry({ while: () => !ctx.streamed })`, `processor.ts:1058` — rouvrir le flux re-facturerait le préfixe).

## Publication npm — le faux `.exe` et le veilleur (mesuré 2026-10-17)

### L'erreur « not a valid application for this OS platform »

Symptôme : `opencodev2` lancé dans un terminal PowerShell rendait

```
ResourceUnavailable: C:\Users\jeanl\AppData\Roaming\npm\opencodev2.ps1:14
  & "$basedir/node_modules/@lux-tech/opencode-ai/bin/opencode.exe" …
Le programme « opencode.exe » n'a pas pu s'exécuter … The specified executable is not a
valid application for this OS platform.
```

Mesures, dans cet ordre :

| mesure | valeur |
|---|---|
| `node_modules/@lux-tech/opencode-ai/bin/opencode.exe` | **346 octets**, magie `ec` (« echo … ») = le placeholder, pas un binaire |
| `@lux-tech/opencode-ai-windows-x64` installé | **non** |
| `npm config get ignore-scripts` | `false` |
| paquet de plateforme sur le registre | **publié** (`2.4.3`, `os: win32`, `cpu: x64`, 338 Mo décompressés) |

Conclusion : le paquet méta publie un **script shell nommé `.exe`** que `postinstall.mjs` doit
remplacer. Or **Bun n'exécute pas les scripts d'une dépendance non approuvée**
(`bun pm untrusted` / `bun pm trust`), pnpm non plus par défaut, et `--ignore-scripts` les supprime.
Quand ça arrive, Windows refuse le fichier avant même que son message ne s'affiche : l'utilisateur
reçoit une erreur d'OS au lieu du remède.

Correction : le point d'entrée est un **lanceur Node** (`script/opencodev2.mjs`, copié en
`bin/opencodev2.mjs`, `bin: { opencodev2: "./bin/opencodev2.mjs" }`). Il rejoue la résolution si le
binaire manque, exécute le vrai binaire sinon, et dit quoi faire (`bun pm trust …`, ou
`node node_modules/@lux-tech/opencode-ai/postinstall.mjs`) s'il ne peut pas.

Vérifié : npm génère bien `probe`, `probe.cmd`, `probe.ps1` pour un `bin` en `.mjs`, et
`probe.cmd a b` rend « probe ok a,b ».

### Ce qui a manqué pour publier, et ce qui rend le correctif suffisant (2.4.10, mesuré 2026-10-18)

Trois obstacles, tous indépendants du code du fork :

| constat | mesure |
|---|---|
| jeton npm de `~/.npmrc` | **401** à `whoami`. Corrigé en y recopiant `npm-lux-tech-publish-token` (coffre) : `whoami` → `lux-tech` |
| jetons GitHub du coffre | `github-menoxz-release-token` et `github-menoxz-workflow-token` = **401** ; `gh` est authentifié (compte `menoxz`, keyring, scope `workflow`) ⇒ dispatcher par `gh` |
| `origin/dev` | **255 commits** de retard sur `dev` ; la CI construit le ref **poussé** ⇒ un dispatch sans push republie l'ancien code |

Ce dernier point explique le registre : `gh run list -w release-fork` rend un dernier run vert sur
`headSha = 328dc107f` (= 2.4.3), alors que `package.json` était déjà à 2.4.7 → **le registre était
figé sur 2.4.3** parce que rien n'avait été poussé, pas parce que la publication échouait.

**Un publish local ne remplace pas la CI.** Le build local (`--single`) n'écrit qu'**une**
plateforme, or la méta doit lister les **12** (`optionalDependencies`), et `postinstall.mjs` rejoue
la résolution par `npm install <plateforme>@<version>` : une méta à 1 plateforme fait **échouer**
l'installation sur les autres OS, en remplaçant un `latest` qui marche.

**Le lanceur est ce qui rend le correctif suffisant : npm lui-même ne lance plus les scripts
d'installation.** Mesuré sur l'installation propre du 2.4.10 :

```
npm warn install-scripts 1 package had install scripts blocked because they are not covered
by allowScripts: @lux-tech/opencode-ai@2.4.10 (postinstall: node ./postinstall.mjs)
```

`bin/` ne contient alors que `opencodev2.mjs` — exactement le mode de défaillance d'origine. Le
premier appel répare (`opencodev2: binaire de plateforme absent, résolution…` puis `2.4.10`,
exit 0) et les appels suivants sont directs. Contrôle positif en préfixe propre : `added 2
packages`, trois shims (`opencodev2`, `.cmd`, `.ps1`), `bin/opencode.exe` = vrai PE (magie `MZ`).

Une même version peut désigner **deux binaires différents** : le build local 2.4.10 faisait 217,3 Mo,
celui de la CI 162 Mo (`--minify=false --splitting=false`, sans `--single`) — raison de plus pour ne
pas réutiliser un numéro déjà construit (2.4.8 et 2.4.9 sont restés des builds locaux).

### Le veilleur : `bun --watch` ne voit que son dossier courant

`bun --watch` avertit pour chaque module hors de son dossier de travail :

```
warn: File …\packages\llm\src\providers\openai.ts is not in the project directory and will not be watched
```

Lancé depuis `packages/opencode`, il ignore donc `packages/llm`, `packages/core`, `packages/sdk`.
Lancé depuis la racine du dépôt, il les couvre tous — et la CLI s'y résout (mesuré :
`bun packages/opencode/src/index.ts --version` → `local`).

**Piège mesuré** : rejouer les options de runtime de l'enfant avec un **autre dossier** casse la
résolution — avec `--conditions=browser` depuis la racine, `react` (importé statiquement par le TUI)
ne se résolvait plus et le serveur ne démarrait pas (`Cannot find package 'react' imported from
…/cli/cmd/tui/app.tsx`). L'enfant reprend donc l'invocation du parent telle quelle.

### Rechargement, mesuré

```
sans commande -> serve : /global/health 200, UI 200 a la racine (port 4099)
serve.ts touche         : le pid qui ecoute passe de 24628 a 38328, health repond toujours
--help                  : affiche les commandes (aucun serve force)
```

### Le défaut de commande : « aucun positional », pas « aucun jeton sans tiret » (mesuré 2026-10-17)

Le premier correctif (2.4.8) cherchait « un jeton qui ne commence pas par un tiret » pour décider
s'il fallait insérer `serve`. Le critère est faux : la **valeur** d'une option n'a pas de tiret non
plus ⇒ `opencodev2 --port 4099`, appel normal du serveur, retombait sur le TUI.

| invocation sur 2.4.8 | attendu | mesuré |
|---|---|---|
| (aucun argument) | serve | serve ✓ |
| `serve --port 4097` | serve | serve ✓ |
| `--port 4099` | serve | **TUI** ✗ |
| `--log-level ERROR --port 4098` | serve | **TUI** ✗ |

Correctif (2.4.9) : le discriminant est « **aucun positional** », avec l'**arité** des options du
serveur — `--port`/`--hostname`/`--mdns-domain`/`--cors`/`--log-level` consomment le jeton suivant,
`--mdns`/`--print-logs`/`--pure` non, `--clé=valeur` porte sa valeur dans le jeton. Décision extraite
en fonction **pure** (`packages/opencode/src/cli/default-command.ts`, `shouldDefaultToServe`) couverte
par 7 tests (`test/cli/default-command.test.ts`). Reconnaître une option **inconnue** ferait au
contraire insérer `serve` devant le TUI (`-s ses_…`, `--model …`) ⇒ la réponse est « non » par défaut.

Relevé de la décision (2.4.9) :

| invocation | décision | pourquoi |
|---|---|---|
| aucun argument, `serve --port 4097` | serve | défaut |
| `--port 4099`, `--port=4099`, `--print-logs --port 4098` | serve | aucune option ne désigne de commande |
| `--mdns`, `--log-level INFO --pure` | serve | options booléennes ou à valeur du serveur |
| `./packages`, `monprojet`, `C:\jeanluc` | non | positional = dossier de projet (TUI) |
| `serve`, `models` | non | un nom de commande garde son sens |
| `-s ses_…`, `--model x`, `--continue` | non | options propres au TUI |
| `-h`, `--help`, `-v`, `--version` | non | l'aide et la version restent intactes |

Preuve de la décision sur le binaire déployé (sonde bornée : `Start-Process -WindowStyle Hidden`
+ redirection des deux flux + `taskkill /T /F`) — le serveur écrit `listening on http://…` sur
**stdout**, le TUI `Ask anything`, l'aide `Commands:` sur **stderr**.

## Base en avance sur le code : `session_message.seq` (mesuré 2026-10-18)

Symptôme : **toute** invite échoue en `500` — `UnknownError` côté client, `SQLiteError: NOT NULL
constraint failed: session_message.seq` côté serveur — **avant tout appel de modèle**, aussi bien par
l'API (`/session/{id}/prompt_async`, `/session/{id}/message`) que par `opencodev2 cli "…"`. Le message
utilisateur n'est même pas persisté (`messages = 0`), et le premier tour de soupçon (« le prompt ne
part pas ») est faux : c'est le stockage qui refuse.

Diagnostic — comparer le DDL réellement présent à celui du dépôt :

```
sqlite3 -readonly <données>/opencodev2/opencode.db "select sql from sqlite_master where name='session_message';"
git grep -n "session_v2" -- packages/opencode/src packages/opencode/migration   # vide dans ce dépôt
```

Cas mesuré : la base portait `session_message(seq integer NOT NULL, FK → session_v2)` — créée par le
DDL **d'exécution** d'une lignée plus récente (`CREATE TABLE IF NOT EXISTS`) — alors que le dépôt crée
`session_message` **sans** `seq`, FK → `session`. Le code insère une ligne sans `seq` ⇒ contrainte
violée. Indices de chronologie utiles : les dernières écritures « forme dépôt » (table `message`) et
« forme récente » (`session_message.seq`) datent de la veille ⇒ la base a été écrite après la dernière
mise à jour du code, et `v2.4.10` a exactement le même schéma (ce n'est donc jamais la version
déployée qui a cassé, mais la base qui a avancé).

Réparation — réversible, aucune ligne perdue :

1. **Prouver sur une copie** (jamais la vraie base) :
   `sqlite3 -readonly <base> "VACUUM INTO '<temp>/opencodev2/opencode.db';"` (≈ 44 s pour 2,9 Go), puis
   copier `auth.json`, `account.json`, `.migrate-state` et lancer avec `XDG_DATA_HOME` pointant sur ce
   dossier isolé.
2. Recréer la table dans la forme du dépôt, l'ancienne gardée en `session_message_newer_backup` :

```sql
PRAGMA busy_timeout=15000;
PRAGMA foreign_keys=OFF;
BEGIN;
DROP INDEX IF EXISTS `session_message_session_seq_idx`;
DROP INDEX IF EXISTS `session_message_session_type_seq_idx`;
DROP INDEX IF EXISTS `session_message_session_time_created_id_idx`;
DROP INDEX IF EXISTS `session_message_time_created_idx`;
ALTER TABLE `session_message` RENAME TO `session_message_newer_backup`;
CREATE TABLE `session_message` (          -- DDL de migration/20260427172553_slow_nightmare
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_session_message_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE
);
INSERT INTO `session_message` (`id`,`session_id`,`type`,`time_created`,`time_updated`,`data`)
  SELECT `id`,`session_id`,`type`,`time_created`,`time_updated`,`data` FROM `session_message_newer_backup`;
CREATE INDEX `session_message_session_idx` ON `session_message` (`session_id`);
CREATE INDEX `session_message_session_type_idx` ON `session_message` (`session_id`,`type`);
CREATE INDEX `session_message_time_created_idx` ON `session_message` (`time_created`);
COMMIT;
```

Les index de la forme récente portent les noms de colonnes `seq` : `ALTER TABLE … DROP COLUMN seq`
échouerait sur eux, d'où la recréation complète plutôt que la suppression de colonne.

3. Contrôles : même `count(*)` avant/après (53 962 dans le cas mesuré), `PRAGMA integrity_check` = `ok`,
   `pragma_table_info('session_message')` **sans** `seq`. Preuve de bon fonctionnement : après
   réparation, l'invite **atteint le fournisseur** et la base **gagne** des lignes (`model-switched`,
   `agent-switched`) au lieu de refuser.
4. Les 552 lignes orphelines préexistantes (session absente de `session`) restent : SQLite ne valide pas
   les lignes déjà présentes, seules les insertions sont contrôlées.
5. Ce qui reste hors de la base : les échecs fournisseurs du moment — `opencode-go/*-free` (clé
   expirée), `orcarouter/*-free` (le prompt système du fork dépasse le plafond du palier gratuit),
   `opencode.ai` (DNS `ENOTFOUND`), `nvidia/*` (`Unsupported parameter(s): promptCacheKey`). Un échec de
   tour n'est donc plus un indice de stockage dès qu'un de ces messages apparaît.

---

## `session_message` : index et lookups « current » — mesuré 2026-10-18

- Base réelle (4,04 Go, 53 976 `session_message`, session la plus chargée : 1 309 assistants,
  charge utile moyenne 16,7 Ko/ligne) : `projectors-next.ts` lisait **toutes** les lignes du type
  puis choisissait en JS → 109 ms par événement projeté.
- Deux index ajoutés (migration `20261018122748_session-message-read-indexes`, ~4,1 Mo chacun) :
  `session_message(session_id,type,id)` et `session_message(session_id,time_created,id)`. Sans `id`
  dans la clé, SQLite triait toute la session par B-tree temporaire (`USE TEMP B-TREE FOR ORDER BY`).
- Mesure sur copie de la base (fichiers `.db`/`-wal`/`-shm` copiés) : `getCurrentAssistant`
  109 → 47,7 ms (le cas où **aucun** assistant n'est ouvert parcourt la session, le cas vivant
  s'arrête à la première ligne), `getCurrentCompaction` 3,16 → 0,24 ms, page `messages`
  (`time_created DESC, id DESC`) 44,2 → 3,2 ms ; plans `SEARCH … USING INDEX` sans B-tree.
- Index d'expression `json_extract(data,'$.time.completed')` : 44,7 → 0,10 ms sur le pire cas, mais
  +1,313 ms par écriture contre 0,048 ms sans (×28, `updateAssistant` sur chaque fin de texte/tool)
  → **refusé** ; l'index partiel équivalent n'est pas retenu par SQLite (prédicat `IS NULL` non reconnu).
- Équivalence ancien/nouveau vérifiée sur les trois lookups ; `type='shell'` : 0 ligne en base,
  vérifiée sur ligne synthétique.

---

## Fragments de prompt du core — langue imposée, fins de ligne mixtes — mesuré 2026-10-18

- `packages/opencode/src/session/prompt/**/*.txt` = les instructions du core, **embarquées dans le
  binaire** ⇒ toute édition exige un rebuild et un redéploiement (skill `fork-build`).
- Consigne utilisateur : **aucune instruction en français dans ces fichiers**. Anglais, notation
  dense — clés `GOAL`/`WORKFLOW`/`PRINCIPLES`, règles `X ⇒ Y`, négation `¬`, énumération `·`, aucune
  prose, aucune politesse, aucune justification. Mesure : 28 099 → 17 201 o sur les 14 fragments
  (-39 %) ; `core.txt` 6 142 → 4 312 o (plafond de `src/session/prompt-budget.test.ts` : 6 400 o).
- Contrôle d'absence de français, qui vaut preuve :
  `rg "[àâäéèêëîïôöùûüçÀÂÉÈÊËÎÏÔÖÙÛÜÇ]" packages/opencode/src/session/prompt` ⇒ **0**. Les glyphes
  `⇒ ¬ · ≤ ≥ ∧ ∨ →` sont de la notation, ¬du français.
- ⚠️ **Fins de ligne mixtes dans ce dossier** : blob **CRLF** pour `core.txt` et
  `task-specific/{architecture,bug-fix,code-review,debug,general,refactor,research}.txt` ; blob **LF**
  pour `build-switch`, `max-steps`, `plan`, `plan-mode`, `task-specific/{feature,test}.txt`. L'outil
  d'édition écrit en LF ⇒ un fichier à blob CRLF produit un diff de fichier entier (mesuré : 418
  lignes au lieu de 62). Lire `git ls-files --eol packages/opencode/src/session/prompt` **avant**
  d'éditer, puis reconvertir les fichiers à blob CRLF (Latin-1, `\n` → `\r\n`).
- Deux tests épinglent ce contenu : `src/prompt-composer/composer.test.ts` (chaque
  `task-specific/*.txt` > 50 o et contenant `<task-instruction`) et `test/session/system.test.ts`
  (« core policy » : ancres de formulation à re-baseliner dans le même commit que toute réécriture —
  c'est le signal de revue prévu par le fichier).
- Échecs **préexistants** prouvés par A/B (famille `Jev skill selection`, `test/session/system.test.ts`) :
  « a trivial prompt selects no skill once Jev is reachable » et « a relevant prompt keeps only the
  skills Jev affirms » échouent identiquement à `HEAD~1` ⇒ ne pas les imputer à une livraison.
- Piège d'outillage : les commandes contenant `Select-Object -First` sur une commande native sont
  refusées par un garde pré-vol (troncature d'un flux d'écriture) ⇒ capturer puis découper
  (`$out = <cmd>; $out | Select-Object -Last N`).

---

## En-têtes de bloc de la TUI : séparateur `:`, et les tests qui les épinglent — mesuré 2026-10-18

- Convention du fil : un en-tête de bloc sépare le **libellé** de son détail par `: ` — `✱ Explore: 2
  read 1 grep`, `core/instructions: 2 sources` (variante `: injecting`), `libellé: 12 lines · 340
  chars` pour une sortie repliée. Trois sites seulement : `util/inspect-batch-tree.ts:109` (titre du
  lot, rendu par `component/inspect-batch-tree.tsx`), `util/instructions-injection.ts:27` et `:30`,
  `component/output-disclosure.tsx:81`.
- Ce qui **n'est pas** ce séparateur et ne se change pas avec lui : le `·` interne du résumé
  (`summarizeOutput`, `N lines · M chars`) et l'en-tête `Thought: titre`
  (`routes/session/index.tsx:2250`), qui portait déjà `:`.
- **Trois fichiers de test épinglent ces chaînes** ⇒ toute retouche du libellé les casse :
  `test/cli/tui/inspect-batch-tree.test.tsx:127` et `:143`, `test/cli/tui/instructions-injection.test.ts:51`,
  `:52`, `:61`, `test/cli/tui/output-disclosure.test.tsx:77` et `:85`. Les deux dernières sont des
  **assertions de trame** (`▶ output: 12 lines`) : c'est elles qui ont attrapé la régression, parce
  qu'elles lisent la sortie peinte et non la fonction.
- Lancer `bun test` depuis la **racine** du dépôt ne teste rien : la racine refuse le balayage
  (`Failed to scan non-existent root directory for tests: …\do-not-run-tests-from-root`), sans code de
  sortie distinctif et avec une sortie vide sous filtre. Toujours lancer depuis `packages/opencode`,
  et vérifier que la sortie contient bien une ligne `Ran N tests` avant de conclure.

---

## Publication 2.4.13 : ce que la voie canonique exige vraiment — mesuré 2026-10-18

- `release-fork.yml` n'a **qu'un** déclencheur : `workflow_dispatch`. Un push de branche ne publie
  rien. `release.yml` a `push: tags: ['v*']` ⇒ c'est **le tag** qui déclenche la release GitHub
  (matrice 3 plateformes).
- Le hook git `pre-push` fait échouer tout push tant que `packages/opencode/package.json` ne
  correspond pas à un tag : `script/sync-version.ts --check` compare au tag de HEAD, sinon au tag
  atteignable le plus proche (`git describe --tags --abbrev=0 --match "v*"`). Bumper la version sans
  poser le tag `v<version>` **bloque donc le push** — la manœuvre correcte est de poser le tag, pas de
  passer `--no-verify`.
- `gh` **ne résout pas** ces deux workflows : `gh run list --workflow=release-fork.yml` et
  `gh workflow run release-fork.yml` rendent `HTTP 404 … not found on the default branch`, et l'appel
  par identifiant numérique échoue pareil — alors que les six workflows de publication sont `active`.
  Le POST direct, lui, fonctionne :
  `gh api -X POST repos/menoxz/opencode/actions/workflows/<id>/dispatches -f ref=dev`.
- `gh run list` ne retrouve pas `release-fork` par son nom : le run s'appelle **« release-fork dev »**
  (`run-name: "release-fork ${{ github.ref_name }}"`) ⇒ filtrer par préfixe, sinon le run paraît absent.
- Mesure de bout en bout : `release` = `completed|success` et `release-fork` = `completed|success` ;
  méta `@lux-tech/opencode-ai@2.4.13` servie avec ses **12** dépendances de plateforme ; 12/12 endpoints
  de version présents ; release GitHub `v2.4.13` à **15 assets**. Le registre a mis ~4 min, et un
  passage intermédiaire a rendu **0/12** : la propagation n'est pas monotone ⇒ ne jamais conclure à
  l'échec sur un seul relevé.

## Réessai : un incident réseau se lit dans le texte, pas seulement dans le statut (mesuré 2026-10-19)

- `getaddrinfo ENOTFOUND opencode.ai` n'a **ni statut HTTP ni marque de retry** du SDK ; `retryable()`
  (`session/retry.ts`) sortait par `if (!isRetryable && !transient) return undefined` ⇒ la session
  s'arrêtait au premier échec DNS, sans aucune tentative.
- Le texte est la seule trace de ces incidents ⇒ `TRANSIENT_MESSAGE_PATTERNS` porte `enotfound`,
  `getaddrinfo`, `ehostunreach`, `enetunreach`, `econnaborted`, `esockettimedout`, et
  `isTransientMessage()` sert **aussi** dans la branche `APIError` (un SDK peut envelopper une sortie
  réseau avec `isRetryable: false`).
- Le plafond reste `RETRY_MAX_ATTEMPTS = 10` avec backoff 2 s ×2 plafonné à 30 s sans en-tête ⇒ un
  incident durable rend l'erreur au client, il ne retient pas la session pour toujours.
- Test : `packages/opencode/test/session/retry-transient.test.ts` (39 pass, 0 fail sur les deux
  fichiers retry).

## TUI : un `bootstrap` ne remplace plus le magasin des sessions (mesuré 2026-10-19)

- Ajouter une clé API appelle `instance.dispose()` puis `sync.bootstrap()` (`dialog-provider.tsx`) ;
  `bootstrap` écrivait `setStore("session", reconcile(sessions))` avec la **seule** page du dossier de
  lancement ⇒ les sessions des dossiers ajoutés disparaissaient, et leurs compteurs restaient à **0**
  jusqu'au redémarrage, car `loadedDirectories` les marquait encore comme lus.
- Deux corrections indissociables : `bootstrap` **fusionne** sa page avec le magasin existant
  (`mergeSessions` de `session-scope.ts`, dédoublonnage et tri par `id`) et **efface les marques**
  (`forgetReadFolders()`) avant de réhydrater. Le retrait d'un dossier reste le travail de
  `session.refresh()` seul.
- Les bootstraps concurrents (événement `server.instance.disposed`, appel explicite du dialogue,
  reconnexion du flux) passent par `createSingleFlight` (`session-scope.ts`) : une passe en vol n'est
  jamais **réutilisée** — un appelant qui arrive après un changement d'état reçoit une passe
  **suivante**, une seule et partagée par ceux qui ont fait la queue ⇒ ni écriture dans le désordre,
  ni résultat plus ancien que l'appelant.
- Test : `src/cli/cmd/tui/context/session-scope.test.ts` ; suite TUI entière 123 pass / 0 fail.

## `opencodev2` sans commande : TUI sur un serveur détaché, et ce que « hot reload » couvre (mesuré 2026-10-19)

- Chaîne du lancement : `src/index.ts:90` `resolveDefaultMode(args, isTTY)` → `local` devant un
  terminal, `serve` sinon ; `:92-100` `ensureServer(url)` puis `args.unshift("attach", url)`, les
  options d'écoute retirées de la ligne (`:96-98`, le CLI est en `strict()`).
- Décision **pure et testée** : `cli/default-command.ts:98-101` (aucun positional + TTY) ; le port
  vient de `localServerPort` (`:104-108`, repli `DevSource.DEFAULT_PORT`) ⇒ « aucun positional », et
  non « aucun jeton sans tiret », sinon `opencodev2 --port 4099` retombait sur la TUI (mesuré
  2026-10-17).
- **Indépendance** : `cli/cmd/tui/attach.ts:40-47` — si un serveur répond déjà (`/config`), rien n'est
  démarré et la TUI s'y rattache ; sinon `:55-60` engendre `serve --port <port>` en
  `detached: true, stdio: "ignore"`, `.unref()`, puis attend la réponse jusqu'à 15 s (`:62-71`) ⇒ le
  serveur ne meurt pas avec la TUI et une seconde invocation s'y rattache.
- **Hot reload** : `src/index.ts:119-129` re-exécute la même invocation sous `bun --watch` (garde
  `OPENCODE_WATCH`) en mode source (`Installation.isLocal()`) ⇒ le serveur se relance à chaque
  modification de ses sources ; côté client, la boucle SSE (`tui/context/sdk.tsx:74-108`) se
  reconnecte indéfiniment (backoff 1 s → 30 s). Un binaire installé, lui, ne surveille rien.
  `bun --watch` ne voit que son dossier courant ⇒ lancer depuis la racine du dépôt (`:112-114`).
- Sonde bornée : `bun run packages/opencode/src/index.ts --port 4199 --print-logs` (stdin non-TTY,
  dossier temporaire) → joignable en ~1,6 s, journal `opencodev2 server listening on
  http://127.0.0.1:4199`, `version=local`, `process_role=worker`, `MCP config watchers active` ;
  port libéré après arrêt.
- **Réserve (non prouvée mesurable)** : le chemin TTY (TUI peinte, rattachement à un serveur déjà
  lancé) n'est vérifiable que par lecture (`index.ts:92-100`, `attach.ts:40-47`), pas dans un shell
  sans terminal.
- **Redémarrage dur : corrigé** (2026-10-19). Un `bun --watch` qui relance le serveur n'émet pas
  `server.instance.disposed` ; le flux rouvert le signale désormais — `tui/context/sdk.tsx` incrémente
  un compteur `reconnects` **quand le flux avait déjà servi** (la première connexion ne compte pas) —
  et `sync.tsx` relit son état via `shouldRebootstrapOnReconnect` (`session-scope.ts`). Sans cela, la
  liste des sessions restait figée jusqu'à une action de rafraîchissement.

## Après un déploiement : faire tourner le TUI sur le nouveau binaire (mesuré 2026-10-19)

- Le TUI ne démarre un serveur que si **personne** ne répond sur le port : `attach.ts:40-47` rend la
  main dès qu'un serveur répond à `/config` ⇒ un ancien serveur encore vivant est **réutilisé** et le
  TUI tourne sur l'ancien code, sans aucun message. Le port par défaut est **4096**
  (`dev/source.ts:15`, résolu par `cli/default-command.ts:107`).
- Aucune surface de commande n'arrête ce serveur (rien dans `cli/cmd/serve.ts` ni `server/server.ts`)
  ⇒ on l'arrête par son **PID de port**, et le démon à part par `opencodev2 daemon stop` (SIGTERM,
  5 s de grâce, puis SIGKILL).
- Preuve du binaire qui sert réellement : le journal de démarrage
  `%USERPROFILE%\.local\share\opencodev2\log\<YYYY-MM-DDTHHMMSS>.log` porte
  `service=default version=<version>` — **un fichier par démarrage**, nommé par l'instant du
  démarrage ⇒ le plus récent dit la version en cours (mesuré : `version=2.4.13` alors que le binaire
  installé était déjà 2.4.14).
- **La bascule est automatique au lancement** (depuis `cli/server-restart.ts`). `ensureServer` lit la
  version servie : si elle diffère du binaire lancé, il arrête le processus qui **tient le port** et
  relance un serveur neuf. Périmètre de l'arrêt : le titulaire du port uniquement (jamais « tous les
  opencodev2 » — le démon et les autres serveurs de travail survivent), son image doit être la nôtre
  (un port tenu par un autre programme n'est jamais tué, et une image illisible ne vaut pas
  autorisation), jamais un serveur engendré par la session, et l'arrêt est gracieux (SIGTERM) avant
  d'être forcé. **Conséquence assumée** : les sessions hébergées par l'ancien serveur se terminent à
  ce moment-là — un redémarrage ne les transfère pas. Si la bascule échoue, l'écart est imprimé et le
  lancement continue sur l'ancien serveur.
- Recette manuelle, quand la bascule automatique n'est pas applicable : quitter le TUI (`Ctrl+C`) →
  `opencodev2 daemon stop` → arrêter le détenteur du port 4096 → relancer `opencodev2`. La tâche
  `stop-old-server` fait les deux arrêts et vérifie que le port est libre. **Arrêter le serveur qui
  héberge la session en cours la termine** : ne jamais le faire depuis cette session sans l'accord de
  l'utilisateur.
- **Le client atteste la version du serveur** (depuis `server-version.ts`) : `ensureServer` lit
  `GET /global/health` (`handlers/global.ts:83` rend `{ healthy, version }`) et imprime l'écart avant
  de lancer l'interface ; le pied de la barre latérale affiche la version du serveur à côté de celle
  du binaire et signale `restart required`. Une lecture ratée vaut `unknown`, **jamais** « aligné ».
  Aucun processus n'est arrêté ni redémarré : le défaut est **rapporté**, l'ancien serveur reste
  maître de sa session — c'est le choix retenu (détection + ligne d'état).



- `AUTO_CONTINUE_INSTRUCTION` (`session/continuation.ts`) portait « If the objective is already fully
  satisfied, verify it and call complete_objective now » et était injecté **tel quel** à
  `session/prompt.ts:1932`, sans regarder l'état de l'objectif. Après une complétion, le rappel
  poussait donc à rappeler `complete_objective`, qui ne rendait qu'un « Objective already completed. »
  (`tool/goal-contract.ts:686`) : un tour brûlé, et un contresens avec la carte
  « This objective is achieved. Do not redo it. » produite à la compaction.
- Correctif : `autoContinueInstructionFor({ objectiveClosed })` remplace la **dernière** consigne du
  rappel (le reste est inchangé) ; `prompt.ts` lit `sessions.get(sessionID).goalState?.status ===
  "completed"` avant de l'armer. Test : `session/continuation.test.ts`.
- Reste un tour évitable mais structurel : un `complete_objective` appelé avec un finding encore
  `open` est refusé (`goal-contract.ts:624`) et doit être rappelé une fois — le contrat l'annonce
  déjà dans la description de l'outil.

## Ordre d'injection du prompt : instructions en tête, guidance volatile en queue (vérifié 2026-10-20)

- `session/prompt.ts:2349` pousse `[...instructions, env.stable, preloadedSkills, toolList]` dans le
  **segment système**, donc avant tout l'historique ; chaque fichier entre sous
  `Instructions from: <chemin>` (`session/instruction.ts:54`) et le bloc est recalculé à chaque step
  du tour.
- Le volatil (date, plan de travail, capsule de sécurité, MCP indisponible) est injecté **après**
  l'historique (`provider/transform.ts:346-351`) : un octet variable dans le segment système
  re-facturerait tout le préfixe mis en cache.
- Ces blocs de queue sont des messages de rôle `user` ouvrant sur `<system-reminder>`
  (`session/prompt-methodology.ts:5`), et sont exclus du calcul de l'ancre de cache
  (`transform.ts:352-357`, `367-370`).
- Conséquence de lecture : la position la plus récente du contexte est occupée par la guidance du
  harnais, pas par la question de l'utilisateur — une capsule qui contredit le message pèse donc
  autant que lui.

## Instructions : le mode par défaut tronque, discrets sont les fichiers trop longs (vérifié 2026-10-20)

- Défaut du code : `injectionInstructions: "summary"` (`session/context-rollout.ts:54`) avec
  `SUMMARY_CHAR_BUDGET = 4_000` caractères **par fichier** (`session/instruction.ts:50`) ; au-delà,
  les lignes restantes sont remplacées par « … truncated: N more lines omitted — read <chemin> ».
- Config locale : `instruction_injection.agents = "full"` (`~/.config/opencodev2/opencode.jsonc:1168`)
  ⇒ contenu intégral injecté (mesuré : 6 520 octets global + 18 138 octets projet). Si la clé
  disparaît, retour **silencieux** au mode `summary` et perte de ~78 % du fichier projet.
- Contrôle immédiat, sans instrument : la présence de `<summary>` et de « truncated: » dans le bloc
  injecté signale le mode `summary` ; leur absence, le mode `full`.
- Corollaire de diagnostic : avant d'accuser le modèle de ne pas suivre une règle, vérifier qu'elle
  est dans le bloc injecté — une règle tronquée n'est pas désobéie, elle est absente.

## Skill créée en cours de session : le reload ne l'indexe pas (mesuré 2026-10-20)

- Six `SKILL.md` écrits sous `.opencode/skills/fork-*/`, puis `service=skill count=196 revision=274
  reload` dans le log **après** les écritures : le compteur ne bouge pas et `skill_search` répond
  « 5 of 199 installed skills ».
- Test fonctionnel : `skill({ name: "fork-tests" })` → `Skill "fork-tests" not found`, alors que la
  liste des skills disponibles ne contient aucune des six.
- ⇒ Une skill créée en cours de session n'est **pas** chargeable par l'outil ; elle existe sur
  disque, elle sera indexée au démarrage suivant. Repli immédiat : lire le fichier
  `.opencode/skills/<nom>/SKILL.md` (le contenu est injecté comme texte, sans passer par le
  catalogue).

## Permission : l'ordre des clés décide (vérifié 2026-10-20)

- `evaluate()` résout par `findLast` sur la concaténation des rulesets (`packages/core/src/permission.ts:25`)
  ⇒ dans une carte `bash`, un motif spécifique ne gagne que s'il est écrit **après** `"*"`.
- Preuve sans redémarrage : script qui reconstruit le ruleset depuis `permission.bash` (ordre
  d'insertion conservé) et appelle le vrai `evaluate()` en important le `.ts` via `bun` — 9/9 cas
  conformes : `git push*`, `--force*`, `--amend*`, `rm -rf*`, `Remove-Item*-Recurse*` → `ask` ;
  `bun test`, `git status`, `git commit -m` → `allow`.
- Un serveur en cours ne relit pas la config : la garde est écrite et prouvée, elle s'arme au
  démarrage suivant. Prouver la **résolution** ne demande donc pas de redémarrage ; prouver
  l'**armement** si.

## Le contenu d'un binaire compilé ne se vérifie pas par scan de chaînes (mesuré 2026-10-20)

- Sur `dist\bin\opencode.exe` (218 Mo, build vert, smoke test passé), `rg -a -F` ne trouve **aucun**
  de ces témoins dont la présence est certaine dans les sources : `system-reminder`,
  `instruction_injection`, `OPENCODE_EXPERIMENTAL`. `skill_search` est trouvé 3 fois.
- ⇒ Le source embarqué n'est pas en clair (compressé/bytecode) : un scan de chaînes n'est ni
  nécessaire ni suffisant. Un marqueur absent **ne prouve pas** que le code manque, et un marqueur
  trouvé ne prouve pas que tout est là.
- Preuve valable du contenu : comportementale — lancer le binaire et observer la ligne de journal
  attendue (`service=guard …`, `service=skill reload`), pas une recherche dans le fichier.
- Corollaire : « build exit 0 + horodatage » prouve que le build a réussi, pas que le binaire
  contient le dernier commit. Ne pas l'écrire comme une équivalence.

## Déploiement du binaire : cible réelle et vérification (mesuré 2026-10-20)

- La commande `opencodev2` est un **shim npm** (`%APPDATA%\npm\opencodev2.ps1`) : le binaire exécuté
  est `%APPDATA%\npm\node_modules\@lux-tech\opencode-ai\bin\opencode.exe`.
- **Trois** copies à remplacer, pas une : celle du parent, puis
  `node_modules\@lux-tech\opencode-ai-windows-x64\bin\opencode.exe` et
  `…-windows-x64-baseline\bin\opencode.exe`. Les copies imbriquées sont celles que le lanceur peut
  résoudre selon la plateforme.
- Le fichier est **verrouillé** par le daemon en cours : `Copy-Item` par-dessus échoue. Séquence qui
  marche : `Copy-Item` vers `.bak-<horodatage>`, `Move-Item` de l'original vers `.old-<horodatage>`
  (un renommage est permis sur un exécutable en cours), puis `Copy-Item` du nouveau.
- Le remplacement **ne tue pas** le daemon : les processus continuent d'exécuter le fichier renommé
  `.old` ; le nouveau binaire n'agit qu'au redémarrage suivant.
- Deux vérifications, et elles ne se remplacent pas :
  1. **résolution** — `opencodev2 --version` doit annoncer la nouvelle version (le shim pouvait
     pointer ailleurs) ;
  2. **intégrité** — `Get-FileHash -Algorithm SHA256` identique entre `dist\bin\opencode.exe` et
     chaque copie déployée. C'est la seule preuve que l'artefact déployé est celui qui a été testé.
- Un scan de chaînes dans le binaire ne prouve rien (voir la section précédente) : ne pas s'en servir
  comme contrôle de déploiement.

### Pièges de version et d'écrasement (mesuré 2026-10-22)

- `build.ts` force `OPENCODE_VERSION` depuis `packages/opencode/package.json` : un correctif posé
  après une release **hérite de son estampille**. Mesuré : deux binaires différents annonçaient tous
  deux 2.4.20 (`bak-…091616` → 2.4.20, `bak-…061343` → 2.4.17).
- ⇒ Le numéro de version ne prouve pas la présence d'un correctif ; seule l'empreinte SHA-256 du
  fichier déployé comparée au build le prouve.
- `sync-version --fix` aligne la version sur le **dernier tag git** (`git describe`), pas sur « +1 » :
  mesuré, il aurait fait 2.4.20 → v2.4.18, donc **descendu** la version. ⇒ pour un bump local,
  éditer `package.json` à la main ; ne pas lancer `--fix`.
- `postinstall.mjs` recopie le binaire du paquet de plateforme **épinglé** dans les
  `optionalDependencies` de la méta, après un `unlinkSync` de la cible, et `verifyBinary()` ne
  contrôle que le **code de sortie** de `--version` (jamais la version). ⇒ `npm install`/`npm update`
  de la méta remplace un build local corrigé par la version publiée, sans erreur ni message.
- Les copies de plateforme (`-windows-x64`, `-windows-x64-baseline`) sont la **source** de ce
  postinstall, pas seulement des doublons de la cible : les laisser en arrière les rend capables de
  réinjecter l'ancien binaire à la première réinstallation.
- `opencode` ≠ `opencodev2` : `opencode` résout `node_modules\@opencode\cli\bin\opencode.exe`, l'amont
  officiel (mesuré `opencode v2.0.32`) ; le fork se lance par `opencodev2`. ⇒ mesurer avec la
  mauvaise commande ne mesure jamais le fork.

## Garde-fous : premier tir réel et rechargement à chaud (mesuré 2026-10-21)

Session `ses_ea62ef80…`, binaire 2.4.18 déployé, six gardes sur disque.

- **Rechargement à chaud d'un dossier de gardes** — trois `.md` écrits dans `.opencode/guards/` en
  cours de session : `service=guard count=3 → 5 → 6`, `revision=1 → 2 → 3`, chaque reload suivi de
  `dirs=3 hot-reload watchers active`. Deux événements regroupés par le debounce de 300 ms, un seul
  reload par paire de fichiers. Aucun redémarrage.
- **Injection réelle** — deux lignes dans le même step :
  `service=session.prompt name=delegate-before-diving reasons=tool_calls_in_turn>=8 (11) step=7 chars=228 guard injected`
  et `name=proof-before-claim reasons=tool_calls_in_turn>=6 (11) chars=259 guard injected`.
  Les blocs `[garde-fou: <nom>]` correspondants sont arrivés dans le contexte du modèle.
- **Budget vérifié sur un cas réel** : 228 + 259 = 487 caractères ≤ 600, et 2 gardes = `max_per_step`
  par défaut. Les deux gardes ont été évaluées sur le même état (11 appels), la plus prioritaire
  consommant son budget d'abord.
- **Conséquence de méthode** : la ligne de journal porte la **raison et la valeur observée**, pas
  seulement le nom — c'est ce qui permet de distinguer un tir à bon escient d'un tir au hasard.
- Non mesuré à ce jour : tirs sur `repeat_action`, `error_streak`, `after_compaction` et
  `context_ratio` (le dry-run les déclare non simulables ; seul le journal du service les verra).

### Mesurer le budget des gardes dans le journal — deux pièges (2026-10-21)

- **Ne pas grouper par `step` seul** : chaque run (un prompt utilisateur) renumérote ses steps à
  partir de 1, donc deux runs fusionnés donnent `4 tirs / 974 caractères` là où il y a en réalité
  deux steps de `2 tirs / 487`. Grouper par `(horodatage, step)`. Mesure correcte :
  `VIOLATIONS_TIRS=0`, `VIOLATIONS_CHARS=0` sur 8 steps réels.
- **Filtrer les lignes de `permission`** : une commande de recherche contenant `guard injected`
  produit sa propre ligne de journal, comptée comme un tir (`step=-1`, `chars=0`). Exiger un motif
  qui ancre la ligne sur `service=session.prompt`.

## Rechargement à chaud : une seule famille suit la config (mesuré 2026-10-20)

- `tasks` : entrée ajoutée dans `opencode.jsonc` en cours de session ⇒ `tasks get <nom>` la lit
  aussitôt (`source: config`), **sans** redémarrage.
- `permission` : config lue au démarrage ⇒ une garde écrite et prouvée par `evaluate()` n'est **pas**
  armée dans le processus en cours.
- Skills : un `SKILL.md` créé en cours de session n'entre pas dans le catalogue (`skill` →
  `not found`), même après un `reload` journalisé.
- ⇒ De méthode : une tâche nommée est le seul levier de config modifiable en cours de session ; pour
  valider un changement de permission ou une skill nouvelle, il faut redémarrer.

## `$LASTEXITCODE` après un pipe mesure le pipe, pas la commande (mesuré 2026-10-20)

- `bun run typecheck 2>&1 | Select-Object -Last 5` puis `$LASTEXITCODE` rend le code de
  `Select-Object` : un typecheck **rouge** s'affiche alors comme vert (6 erreurs TS annoncées
  « exit 0 » dans cette session).
- Méthode juste : rediriger vers un fichier, lire le code **immédiatement**, puis filtrer le log.
  `bun run typecheck *> "$env:TEMP\tc.log"; $code=$LASTEXITCODE; Get-Content … | Where-Object …`.
- Même piège pour toute commande native : le code doit être capturé sur la ligne de la commande, pas
  après un pipeline PowerShell.

## Skills : les deux trous de rechargement, corrigés (mesuré 2026-10-20)

- **Racines figées** : `discoverSkills` lisait `config.directories()`, mis en cache dans l'état
  d'instance au boot (`config.ts:768`) ⇒ un `.opencode` apparu ensuite n'était jamais scanné. Fix :
  la découverte ajoute les racines `.opencode` de l'instance et du worktree (`5f8ee05d2`).
- **Veilleurs armés pour une seule instance** : `_started/_watchers/_timers` étaient au scope du
  layer alors que `setupWatchers` lit `InstanceState.context` ⇒ seule la première instance armait un
  veilleur, les autres ne rechargeaient jamais. Fix : registre et compteur de révision dans
  `InstanceState` (`c7dedab05`).
- Tests de non-régression : `test/skill/skill.test.ts` — « created after boot » (échoue sur le code
  d'avant) et « arms watchers for a second instance » (échoue aussi sur le code d'avant).
- Vérification de zone : `test/skill` en entier = 34 pass, suites voisines (`jev/skills`,
  `tool/registry`, `skill/select`) = 33 pass, typecheck exit 0.

## Gardes : baseline des tirs réels avant redémarrage (mesuré 2026-10-21)

- Agrégat sur **12 fichiers de log** : 141 tirs, mais **deux gardes seulement** —
  `proof-before-claim` = 71 (`tool_calls_in_turn>=6 (11)`), `delegate-before-diving` = 70
  (`tool_calls_in_turn>=8 (11)`). Les neuf autres n'ont jamais tiré.
- Cause, et ce n'est pas un défaut du dispositif mais du binaire qui tournait : le daemon avait
  démarré avant `bb6dd7e52` (compteur de jetons par garde) et `ba0d2655b` (fenêtre de contexte
  réelle). Donc `interpret-request` (12 000 jetons) était affamée par le compteur partagé, remis à
  zéro à chaque tir de `proof-before-claim`, et `compaction-due` avait `context_ratio = 0` par
  construction.
- **Piège de mesure** : le fichier de log le plus récent avait tourné (11:54) et ne contenait aucun
  tir — mesurer sur le seul log courant donnait `TIRS=0`. Il faut agréger **tous** les `*.log` du
  répertoire, et filtrer sur `service=session.prompt` pour ne pas compter les lignes `permission`
  qui reprennent le motif recherché.
- À comparer après redémarrage : on attend **au moins trois gardes distinctes** tirent, dont
  `interpret-request` sur les tours longs, et `compaction-due` dès que le ratio passe 0,65. Si le
  compte reste à deux, le correctif de starvation n'est pas actif.

## Glyphes du TUI : les Dingbats basculent en police emoji sous Windows (mesuré 2026-10-22)

- Symptôme rapporté : un carré **vert** apparaît derrière l'icône de la ligne d'instructions, alors
  qu'aucun style de fond n'est posé par le code.
- Cause : `✳` est U+2733, dans le bloc **Dingbats** (U+2700–U+27BF). Windows Terminal le résout via
  Segoe UI Emoji, qui le dessine en étoile blanche **sur carré vert**. Ce n'est pas un `bg` de style,
  c'est la police qui prend le relais — donc invisible dans le code et dans le typecheck.
- Preuve ANSI sur le rendu réel (client attaché à un serveur de dev, séquence dumpée) :
  `[38;2;228;228;228m [48;2;24;24;24m ※ …` — premier plan blanc cassé, fond `24;24;24`, aucun
  `48;2;…` vert. Le glyphe affiché par l'utilisateur n'était donc pas celui du code courant.
- Deuxième cause cumulée, à vérifier **avant** de corriger : le client TUI était plus ancien que le
  dernier commit. `git log --date=format:'%H:%M:%S'` sur les fichiers d'icônes contre
  `Get-Process bun,node | Select StartTime` : client démarré 10:21:45, commit qui introduisait `✳`
  à 10:21:44, retour à `※` à 10:27:36 ⇒ le client affichait une version intermédiaire.
- Règle : un glyphe de statut doit rester **hors** des plages emoji et double largeur —
  `0x1F300–0x1F9FF` (double cellule, cf. `script/tui-shot.ts:62`) et `0x2700–0x27BF` (fallback emoji).
  `※` (U+203B) et `↯` (U+21AF) sont stables ; `😀`-like et `✳` ne le sont pas.
- Corollaire de méthode : devant un rendu inattendu, comparer l'heure de démarrage du client à celle
  des commits touchant les fichiers de rendu avant de suspecter le code.

## Regroupement des appels outils : le levier est le périmètre, pas la relance (mesuré 2026-10-22)

Question posée : les boucles à un seul appel gaspillent des tours, faut-il relancer l'agent pendant
le run ou poser le périmètre dès la demande ?

- Base mesurée (devdb, 51 640 steps) : 50,8 % des steps émettent **exactement 1** appel outil, 56,1 %
  en émettent ≤1, moyenne 1,74, médiane 1. Le gaspillage est donc réel et majoritaire.
- Relance runtime (`<system-reminder>` injecté par `prepareStep`, `src/session/loop-counter.ts`) :
  **ne marche pas**. Deux A/B sur serveurs jumeaux, même code, même base, seule différence
  `OPENCODE_LOOP_COUNTER` :
  - tâche « lire 6 fichiers », 7 runs/bras : 2,07 appels/step avec relance contre 1,79 sans, 4,14
    steps contre 4,57 — écart dans le bruit ;
  - tâche « un fichier par tour », 3 sessions de 3 tours/bras : 8,33 steps et 6,00 appels avec
    relance contre 6,67 et 5,00 sans, 92 % de steps ≤1 appel contre 80 % — la relance fait faire
    **plus** de steps. Le compteur est donc livré **éteint** (`98b64c78a`), activable par
    `OPENCODE_LOOP_COUNTER=1`.
- Périmètre énuméré dans la demande : **marche**. Même tâche, deux formulations, compteur éteint,
  t1 = « comment builder et tester ce package » (4 runs/bras), t2 = « inventaire des tests »
  (vague n=3, scoped n=4) :

  | | steps | appels | fichiers du périmètre réellement ouverts |
  |---|---|---|---|
  | t1 vague | 6,75 | 12,25 | 2,00 / 6 |
  | t1 scoped | **5,00** | **11,00** | **5,50 / 6** |
  | t2 vague | 15,67 | 19,67 | 0,00 / 3 |
  | t2 scoped | **11,50** | **12,75** | **1,00 / 3** |

  t1 scoped est stable (5,5,5,5 steps) là où vague varie (5,8,8,6) : le périmètre supprime la
  variance, pas seulement la moyenne. t2 reste bruité des deux côtés (vague 23/12/12, scoped
  5/16/18/7) — un échantillon de 3-4 ne conclut pas sur t2 seul.
- Mécanisme du gaspillage, visible dans les traces : le bras vague dépense son budget en `bash`
  (16, 27, 14, 10 appels) au lieu de `read`/`glob`, et ne touche que 2,0 à 4,5 chemins distincts.
  Le périmètre ne fait pas « travailler plus vite », il fait choisir le bon outil.
- Piège de mesure à ne pas refaire : la couverture calculée sur le **texte de la réponse** est
  truquée — le bras scoped reçoit la liste des fichiers dans son prompt et n'a qu'à la recopier
  (6/6 « couvert » pour 3 réponses sur 4). Il faut compter les fichiers **réellement ouverts**, lus
  dans `state.input` des parts `tool` (`filePath`, `pattern`).
- Deux incidents de banc à connaître : un lot de runs dépasse le plafond shell de 900 s (lancer en
  détaché, par petits paquets) ; si le serveur tombe en cours de lot, le run reste `OPEN` (dernière
  step sans `step-finish`) et doit être **exclu** de l'agrégat, sinon ses steps partiels comptent
  comme un run fini.

## Couche 1 — actions nommées dans le turn_plan (mesuré 2026-10-23)

Hypothèse : le modèle oublie en cours de run la consigne « regroupe tes appels ». La relance runtime
étant mesurée inopérante, on teste une consigne **déclarative** : nommer les cibles du lot dans le
plan de tour, et les restituer au tour suivant comme contenu.

- Implémentation : champ `actions` optionnel sur `turn_plan` (8 max, 120 cara max), restitué par
  `renderCommitment`, prescrit par `instruction()`. Porte `OPENCODE_TURN_PLAN_ACTIONS=0`.
- Critère décidé **avant** de voir les résultats : retenue si moins de steps **et** couverture
  effective non dégradée ; rejetée sinon.
- A/B séquentiel, même base, même commit, même tâche (t1 vague : « comment builder et tester ce
  package »). Deux passes, parce que la première n'avait aucune marge de bruit :

  | passe | modèle | n/bras | steps ON / OFF | couverture ON / OFF | verdict |
  |---|---|---|---|---|---|
  | 1 | payant | 4 | 5,50 / 6,50 | 3,00 / 1,50 | « retenue » — **trompeur** |
  | 2 | gratuit `commandcode/inclusionai/ling-3.1-flash` | 10 | **3,40 / 3,60** | **1,90 / 1,90** | écarté |

- Passe 2, chiffres décisifs : delta steps = −0,20, erreur-type 0,31, **t = −0,64**, intervalle 95 %
  [−0,81 ; +0,41] ; delta couverture = 0,00, **t = 0,00**. Les deux métriques sont dans le bruit, la
  couverture est strictement identique.
- **Conclusion : le champ `actions` ne produit aucun effet mesurable.** Il est livré **éteint**
  (`OPENCODE_TURN_PLAN_ACTIONS=1` pour l'activer), commit `3b54cea3a`.
- Faute de conception à ne pas refaire : le critère de la passe 1 comparait des moyennes sans marge,
  donc il déclarait « retenue » dès que le signe était favorable. Le −1,00 step de n=4 était de la
  variance (écart-type 1,73 dans le bras ON). **Tout critère d'acceptation doit inclure l'erreur-type
  et un intervalle**, sinon il ne mesure que le hasard.
- Ce que la passe 2 a appris au passage : le modèle gratuit est plus rapide et **moins variable**
  (écart-type 0,52 contre 1,73), à steps moyens plus bas (3,4 contre 5,5). Un modèle plus faible
  bâcle davantage mais dérive moins — utile à savoir pour choisir un banc de mesure.
- Autre résultat, inchangé : `appels/step` était identique dans les deux bras (1,77 puis 2,21 vs
  2,25). Le champ n'a jamais fait regrouper davantage par boucle. L'hypothèse « l'agent oublie de
  regrouper » n'est donc pas soutenue par les données.
- Pistes fermées par cette mesure : la relance runtime (inopérante, A/B), le champ `actions` du plan
  (sans effet, A/B n=10). Reste ouvert et **mesuré comme efficace** : énumérer le périmètre dans la
  demande elle-même (6,75 → 5,00 boucles sur t1, couverture réelle 2,00/6 → 5,50/6).
- Piège de banc corrigé en route : la première porte ne coupait que le protocole et la restitution,
  pas l'écho du tool ni le stockage — 2 des 4 runs du bras témoin remplissaient le champ et
  bénéficiaient de l'écho. Un témoin qui utilise la fonctionnalité ne mesure rien : la porte agit
  maintenant sur les trois points (`normalize`, `renderCommitment`, `instruction`, écho).
- Piège de typage rencontré : dériver le schéma du paramètre de la porte
  (`...(enabled ? { actions } : {})`) casse Effect (`DecodingServices` devient `unknown`). Le schéma
  reste donc statique ; la porte agit en aval.



