# AGENTS.md — opencode-fork (workspace)

Scope: ce dépôt. Le fichier global (`~/.config/opencodev2/AGENTS.md`) porte la conduite générale ; ici, ce qui est propre au fork.
**Consignes seulement.** Mesures, formes de réponses, recettes et bases de tests : `docs/HARNESS.md` (non injecté) — à lire quand une ligne porte `(H)`.

## 1. Travailler dans ce dépôt

- Tests du paquet principal : `cd packages/opencode && bun test --timeout 30000 <chemins>` — `--timeout` **obligatoire** (sinon échecs fantômes à 5 s) ; typecheck `bun run typecheck` (`tsgo --noEmit`, jamais `tsc`) ; garde rapide `perf-guard`.
- Tests webui : depuis `packages/webui`, `bun run test` (vitest + jsdom ; Bun ne peut pas exécuter de JSX ici). Le glob `src/*.test.ts` **rate** les `.tsx` ⇒ lister `src/**/*.test.{ts,tsx}` avant toute refonte de composants.
- Tests `.opencode` : lancer **depuis `.opencode`** (`cd .opencode && bun test --timeout 30000 tests/<f>.test.ts`) — depuis la racine, `bunfig.toml` refuse.
- Après chaque vague : relancer **tous** les tests des items voisins, pas seulement la suite ciblée (un correctif peut en annuler un autre sans qu'aucune suite ciblée ne le voie).
- Échec de test : **A/B au HEAD** (`git checkout <commit> -- <fichier>` puis relance) avant de conclure à une régression ; bases d'échecs connues `(H)`.
- Fichiers : `glob` (indexé) ou chemin explicite, **jamais `Get-ChildItem -Recurse`** depuis la racine.
- Commande de tâche : `cmd /d /c bun run dev` (un chemin entre guillemets casse pwsh) ; `#force` enveloppe dans `Invoke-Expression`, où le multi-lignes casse ⇒ découper.
- `.opencode/tasks.json` est **gitignoré** ⇒ jamais dans un commit.
- Programme de version : `docs/releases/<version>/` ; `PROGRESS.md` est la **seule** autorité de statut.

## 2. API et configuration du serveur

- `PATCH /config|/global/config` **fusionne** les cartes : un agent ajouté persiste, un agent **omis n'est pas retiré**, `model: null` est refusé ⇒ **aucune suppression par l'API** ; seul le fichier le permet, et un serveur en cours ne le relit pas.
- SDK : `client.global.config.update({ config: { … } })` — corps **imbriqué** ; un patch à plat envoie un corps vide ⇒ `200` pour une écriture nulle. `/config` (projet) **matérialise** un `config.json` dans l'arbre ⇒ un panneau de réglages vise `/global/config`.
- Paramètre de chemin contenant des `/` ⇒ `encodeURIComponent` ; un `200` ne prouve rien sans vérifier le **corps** (repli SPA).
- `GET /path` rend **deux** bases : `directory` = dossier d'instance, `worktree` = racine du projet ⇒ un chemin du dépôt se résout sous `worktree`. `GET /file/content` résout **sous la racine du projet** seulement (absolu ⇒ vide, hors projet ⇒ 500).
- SDK : `client.find.files()` (et **non** `find.file`), `client.file.read()` ; `GET /command` = **1,95 Mo** ⇒ projeter aussitôt, lire à la demande.
- Watcher de fichiers : opt-in `OPENCODE_EXPERIMENTAL_FILEWATCHER=true` (défaut `false`) ⇒ redémarrage ; sans lui, aucune écriture externe n'émet d'événement.
- Hot-reload MCP : preuve que le veilleur est armé = `service=mcp … MCP config watchers active` dans le log ; sans cette ligne, un changement de `mcp` n'agit qu'au redémarrage.
- `prompt_async` rend **204 même quand aucun tour ne démarre** : sur une session occupée, le prompt part dans `PromptQueue` (`session/prompt.ts:1742-1789`), et `handlers/session.ts:346-358` **avale** toute erreur (log + `session.error` sur le bus) sans la rendre au client. Un prompt en file « reste **invisible** jusqu'au prochain tour ». Donc « j'ai envoyé un message, rien ne se passe » n'est ni une panne ni un bug de l'UI : c'est une file d'attente silencieuse.
- Fins de ligne : `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` est commité en **CRLF** ⇒ ne pas le convertir ; vérifier `git diff --stat`.

## 3. Webui

- Cible : `docs/web-ui/CIBLE.md` — un écran, cinq zones ; le tiroir droit n'existe que sur une permission en attente ; `step-start`/`step-finish` ne s'affichent jamais.
- **Toute route consommée doit figurer dans `API_PREFIXES`** (`packages/webui/vite.config.ts`) : sinon Vite rend `index.html` en **200**, l'erreur est avalée et l'écran reste **vide sans aucun message** ⇒ sonder **par le proxy** et vérifier le `content-type`, jamais le seul status.
- Feature webui : suivre la skill `opencode-webui-feature` (native : `opencode-fork-feature` ; plugin : `opencode-plugin-feature`).
- Réglages : **liste de choix** dès que l'ensemble des valeurs est connu du serveur, jamais un champ libre. Modèles = `GET /config/providers` (**531 ko**) — jamais `GET /provider` (**6,7 Mo**) ni `/api/model` ; agents = `GET /agent` filtré `mode === "primary" && hidden !== true` ; interpréteurs = `GET /pty/shells` (absent du SDK ⇒ `fetch` direct + `/pty` dans le proxy). Projeter aussitôt en `{value,label}` : ces routes rendent des clés en clair.
- Fournisseur = **deux magasins** : clé par `PUT /auth/{id}`, `baseURL` par la config ⇒ l'écran fait les deux ; un fournisseur créé n'apparaît qu'au rechargement ⇒ la grille fusionne la config déclarée ; aucun `DELETE` sur `/config` ⇒ l'écran le dit **avant** le clic.
- `GET /config/providers` : `providers` = **tableau**, `models` = **carte** indexée par fournisseur ⇒ le détail n'exige pas de second appel.
- Section `Providers` : **grille cherchable puis détail** (`providers.tsx`).
- Contrôle de choix = `picker.tsx` (cherchable), **jamais un `<select>` natif**.
- Copie **en anglais** (tout `packages/webui/src/*`), nombres selon la langue ; commentaires et intitulés de test en français.
- Fil mis à jour **en place** par le flux, pas par relecture REST ; **écouter `/global/event`** — `/event` est borné à un dossier (`middleware/workspace-routing.ts:86-88`) donc muet pour toute session ouverte ailleurs ⇒ fil figé jusqu'au rechargement (le REST, lui, résout le dossier de la session, donc il « répare » tout seul : c'est ce qui masque le défaut).
- Le flot de deltas s'applique **au plus une fois par image** (`createLatestGate`, `stream-sync.ts`) : écrire le signal des messages par événement rend le fil entier — mesuré le 2026-10-17, 75 `message.part.delta`/s ont bloqué une image **12 388 ms** et rendu la page sourde 24 s, pendant que le sondage de santé affichait « server unreachable » à tort. Ne jamais rebrancher `setMessages` directement sur un événement.
- `message.part.updated` porte la partie **imbriquée** sous `properties.part` (`{sessionID, part, time}`) ; `message.part.delta` = `{sessionID, messageID, partID, field, delta}` ; `message.updated` = `{sessionID, info}`. Lire `properties` comme la partie rend `id` indéfini et l'événement est classé « nothing to change » — le fil ne bouge plus, sans erreur. Lecture par **étape** (`groupTurns`/`groupSteps`).
- Une réponse d'agent qui **échoue n'a aucune partie** ⇒ le tour n'a rien à rendre et le fil est **muet** : afficher `turnError(turn)` (`view-model.ts`, première `info.error`), sinon un échec DNS ou de quota ressemble à une panne de l'interface (mesuré 2026-10-17 : `getaddrinfo ENOTFOUND opencode.ai` invisible).
- **Ne jamais poser une animation d'entrée sur un bloc du fil** : la première réponse d'un tour est fusionnée dans le tour de l'utilisateur (`groupTurns`), donc chaque delta la recrée, et Solid `For` recrée le nœud ⇒ l'animation **rejoue à chaque image** (mesuré : 482 démarrages sur 482 nœuds distincts en un tour). Une animation d'entrée ne va que sur un bloc **stable** — la ligne d'injection « en cours » (`.injections.injecting`) l'est ; une boucle (`spinner`, `caret`, balayage) peut aller partout.
- `question.asked` = seule écriture du fil (l'agent est bloqué dessus) ; réponse **positionnelle** `{answers: string[][]}`.
- SSE : `EventSource` ne rappelle **jamais** `onerror` quand la socket reste ouverte sans rien livrer ⇒ garder le watchdog (silence > 30 s = flux remplacé + reconnexion).
- Affichage : ±lignes d'une écriture = `edit.state.metadata.filediff` **uniquement** ; `bash.state.output` = sortie **complète** ⇒ borner à 12 lignes + « show N more lines ».
- Barres de défilement : **une** règle globale (`*::-webkit-scrollbar`) et **un** mécanisme (`scrollbar-width` désactive `::-webkit-scrollbar` dans Chromium).
- Toute taille passe par un **jeton** ; un jeton référencé mais non défini **hérite en silence** ⇒ inventorier le **utilisé contre le défini**.
- Le rare ne s'affiche pas au repos ; une action de premier plan (changer de dossier de travail) reste au pied du rail, pas dans un panneau de réglages.
- Deux compositeurs (`home-composer`, `composer-inner`) ⇒ **compter les sites d'appel** avant de corriger un composant du fil.
- Un composant peut exister **sans être monté** ⇒ grep l'usage **et** le CSS avant de conclure « ça n'existe pas ».
- Comparer deux chemins **par leur texte** est faux (séparateurs, casse) ⇒ normaliser (`pathKey`), garder l'original pour le serveur.
- Un bouton qui agit sans effet visible est **pire** qu'un bouton mort ⇒ mesurer l'**effet** (largeur rendue), pas l'état.
- Vérifier une écriture sans toucher la config réelle : instance isolée 4097/5181 (XDG isolés, `bun.exe` en chemin **absolu**, proxy par `OPENCODE_SERVER_PORT`) ; elle meurt avec le shell qui l'a lancée ⇒ sonder les **deux** ports avant d'accuser le code.

## 4. TUI et CLI

- Route standard = `routes/session/index.tsx` (CRLF) ; deux crans d'opacité **dérivés du thème** (`theme.textLow`), jamais un gris figé.
- bash : commande bornée à 1 ligne + `· +N lines`, sortie par la **fin** (5 lignes), un même clic déplie les deux ; jamais de troncature de caractères.
- Prompt en file : le badge `QUEUED` se décide par le **statut**, jamais en retirant la visibilité ; `STEER` par `metadata.steer` seulement.
- `inspect_batch` : une ligne repliée `inspect_batch · N actions ▸`, dépliée au clic ; chevron seulement s'il y a à révéler.
- `run` : `TOOL_RULES.bash.view.final` reste `true` (sinon `exit 1` s'affiche comme un succès) ; code de sortie par `toolExitCode`, partagé par le texte **et** la couleur.
- Retry de session : 408/425/429 et erreurs de transport réessayés, `AbortError` jamais, plafond 10 ; délai **serveur** non plafonné et pas de reprise après facturation `(H)`.
- Preuve visuelle : `bun packages/opencode/script/tui-shot.ts --session <id> --db <copie> --wait 45` — ~15-20 s avant la première peinture, une trame plus tôt est vide ; base = **copie** `VACUUM INTO`, jamais la vraie.
- `packages/opencode/src/**` ⇒ rebuild + redéploiement (skill `fork-build`) ; les fragments de prompt sont **embarqués** dans le binaire ⇒ même contrainte.

## 5. Harnais, outils, publication

- Outil natif invisible ⇒ chercher dans le tableau `builtin` de `packages/opencode/src/tool/registry.ts` ; `always_tools`, la carte `tools` et les permissions ne filtrent qu'un catalogue **déjà construit**.
- Mode plan : `plan_enter`/`plan_exit` exigent `OPENCODE_EXPERIMENTAL_PLAN_MODE` **et** `flags.client === "cli"` ; distincts de l'outil `planning` (`experimental.planning.enabled`) et de `turn_plan`.
- Plugin livré = config seule, **aucun rebuild** ; changement dans `src/**` = rebuild.
- `.opencode/plugin/*` n'est **pas** auto-découvert (ignoré par design) ⇒ entrée explicite `file:///…` dans la config globale + redémarrage. Composant `schedule` : chemins et options `(H)`.
- Workflow agentic : agent `.opencode/agent/coding-orchestrator.md`, entrée `/deliver`, spec `specs/agentic-coding-workflow.md` — config pure, aucun rebuild.
- Publication npm : `bun ./packages/opencode/script/publish-fork.ts` depuis la racine (token via `NPM_CONFIG_USERCONFIG`) ; idempotent depuis 2.4.3 ; vérifier **13 paquets** sur le registre. `(H)`
- Sauvegarde de binaire : le **nom ne dit pas** ce qu'elle contient ⇒ `--version` sur une **copie** portant l'extension `.exe`, jamais sur le nom en `.bak.…`.
- Navigateur : `isolated` = `%LOCALAPPDATA%\McpBrowserProfiles\<navigateur>` (sans les sessions de l'utilisateur) ; `browser_ensure` **ignore** le profil dès qu'un CDP est actif ⇒ lancer `chrome.exe --remote-debugging-port=9222 --user-data-dir=…` puis `browser_use` ; si `browser_use` n'est pas exposé, piloter **par CDP direct** (`/json/list` → WebSocket → `Runtime.evaluate`). Jamais le navigateur réel sans accord explicite.
- Actions GitHub sur un fork : `422` malgré `enabled` ⇒ clic « I understand my workflows » dans l'onglet Actions (aucun endpoint ne le débloque).
- Modèles gratuits : tester `opencode-go/*-free` **avant** de conclure « pas de gratuit » ; `opencode/*-free` est fermé côté serveur. `jev-1.13*` n'est **pas** un modèle de conversation (endpoint `/systemone`). `(H)`

## 6. Dépannage — ordre de diagnostic

- Page pilotée muette : `/json/list` → santé des **deux** serveurs → CPU des processus, **avant** de suspecter le code (`Runtime.evaluate` peut expirer sur toutes ses requêtes alors que la page est saine).
- Sonde CDP : borner chaque appel (`Promise.race`), journaliser par étape ; `scrollIntoView({block:'center'})` **puis** mesurer ; sonde **idempotente** ou repartir d'un rechargement. Capture = une **zone**, jamais la page entière (plein écran : 15 à 40 s). Activation utilisateur = `Input.dispatchMouseEvent`, pas `.click()` ; pour ouvrir ou sélectionner, `.click()` d'abord.
- Vite : tuer le parent `bun` **ne tue pas** l'enfant `node …/vite.js`, qui garde le port ⇒ arrêter le processus `vite` lui-même.
- Jamais `window.confirm` dans du code piloté par navigateur : le dialogue survit à tout et rien ne le ferme côté agent.
- Console opencode.ai : viser le **libellé exact**, liste noire `credit|pay|billing|delete|revoke`, sélecteurs bornés au `[role="dialog"]`.

## 7. Mise à jour de ce fichier

- Même test de tri que le fichier global : action à faire **maintenant** ⇒ ici, une ligne ; mesure, forme de réponse, recette, récit ⇒ `docs/HARNESS.md`.
- Une règle déjà présente dans le fichier global ne se recopie pas ici.
