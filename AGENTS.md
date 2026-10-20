# AGENTS.md — opencode-fork (workspace)

Scope: ce dépôt. Le fichier global porte la conduite générale ; ici, ce qui est propre au fork.
**Consignes seulement.** Mesures, recettes, bases d'échecs : `docs/HARNESS.md` (non injecté) — lire quand une ligne porte `(H)`.
Ne pas recopier ce que le harnais injecte déjà : descriptions d'agents et d'outils, échecs récurrents, capacités dégradées. Ni l'inventaire — il dérive.

## 1. Travailler dans ce dépôt

- Tests paquet principal : `cd packages/opencode && bun test --timeout 30000 <chemins>` (`--timeout` obligatoire, sinon échecs fantômes à 5 s) ; typecheck `bun run typecheck` (`tsgo --noEmit`, jamais `tsc`) ; garde `perf-guard`.
- Tests webui : depuis `packages/webui`, `bun run test` (vitest + jsdom ; Bun n'exécute pas de JSX ici) ; le glob `src/*.test.ts` rate les `.tsx` ⇒ lister `src/**/*.test.{ts,tsx}`.
- Tests `.opencode` : depuis `.opencode` (`cd .opencode && bun test --timeout 30000 tests/<f>.test.ts`) ; depuis la racine `bunfig.toml` refuse.
- Après une vague : relancer tous les tests des items voisins, pas la suite ciblée.
- Échec de test : A/B au HEAD (`git checkout <commit> -- <fichier>`) avant de conclure à une régression ; bases connues `(H)`.
- Fichiers : `glob` ou chemin explicite, jamais `Get-ChildItem -Recurse` depuis la racine.
- Tâche : `cmd /d /c bun run dev` (chemin entre guillemets casse pwsh) ; `#force` passe par `Invoke-Expression` où le multi-lignes casse ⇒ découper.
- `.opencode/tasks.json` est gitignoré ⇒ jamais dans un commit.
- Version : `docs/releases/<version>/` ; `PROGRESS.md` = seule autorité de statut.

## 2. API et configuration du serveur

- `PATCH /config|/global/config` fusionne : agent ajouté persiste, omis non retiré, `model: null` refusé ⇒ aucune suppression par l'API ; seul le fichier, et un serveur en cours ne le relit pas. Corps à plat (`groups/global.ts:102`) : `{disabled_providers:[…]}` écrit, `{config:{…}}` rend 200 sans rien écrire.
- SDK : `client.global.config.update({ config: { … } })` — paramètre `config`, corps à plat ; sans ce nom, corps vide ⇒ 200 pour une écriture nulle. `/config` (projet) matérialise `config.json` ⇒ un panneau de réglages vise `/global/config`.
- Fournisseur mort (clé, fonds) ⇒ `disabled_providers` : sinon ses modèles `discover` restent proposables et le composeur webui adopte le modèle de la dernière réponse de session ⇒ erreur répétée.
- Chemin en paramètre contenant `/` ⇒ `encodeURIComponent` ; un 200 sans vérifier le corps = repli SPA.
- `GET /path` : `directory` = dossier d'instance, `worktree` = racine du projet ⇒ un chemin du dépôt se résout sous `worktree` ; `GET /file/content` résout sous la racine projet seulement (absolu ⇒ vide, hors projet ⇒ 500).
- SDK : `client.find.files()` (pas `find.file`), `client.file.read()` ; `GET /command` = 1,95 Mo ⇒ projeter aussitôt.
- Watcher : opt-in `OPENCODE_EXPERIMENTAL_FILEWATCHER=true` (défaut `false`) ⇒ redémarrage ; sans lui, aucune écriture externe n'émet d'événement.
- Hot-reload MCP : veilleur armé ⇔ `service=mcp … MCP config watchers active` dans le log ; sinon un changement de `mcp` n'agit qu'au redémarrage.
- `prompt_async` rend 204 même quand aucun tour ne démarre : session occupée ⇒ `PromptQueue` (`session/prompt.ts:1742-1789`), erreurs avalées (`handlers/session.ts:346-358`) ⇒ prompt invisible jusqu'au prochain tour. Ni panne, ni bug de l'UI.
- EOL : `src/cli/cmd/tui/routes/session/index.tsx` = CRLF, ne pas convertir ; `git ls-files --eol` (`i/lf w/crlf`) avant d'éditer, écrire ces fichiers en LF — l'outil d'édition suit le fichier, pas le blob.
- `ConfigMarkdown.parse` : options explicites `matter(t, {})` obligatoires — sinon le cache gray-matter fait rendre `{}` au parse suivant sur un YAML invalide, et une skill chargée disparaît du catalogue au rechargement.
- Base en avance sur le code ⇒ `500 NOT NULL constraint failed: session_message.seq` sur chaque invite : comparer `sqlite_master.sql` au DDL de `migration/*` ; réparation réversible `(H)`.

## 3. Webui

- Cible : `docs/web-ui/CIBLE.md` — un écran, cinq zones ; tiroir droit seulement sur permission en attente ; `step-start`/`step-finish` jamais affichés.
- Toute route consommée figure dans `API_PREFIXES` (`packages/webui/vite.config.ts`) : sinon Vite rend `index.html` en 200 et l'écran reste vide ⇒ sonder par le proxy et vérifier le `content-type`, jamais le seul status.
- Feature webui : skill `opencode-webui-feature` (native : `opencode-fork-feature` ; plugin : `opencode-plugin-feature`).
- Réglages : liste de choix dès que les valeurs sont connues du serveur, jamais un champ libre. Modèles = `GET /config/providers` (531 ko), jamais `GET /provider` (6,7 Mo) ni `/api/model` ; agents = `GET /agent` filtré `mode === "primary" && hidden !== true` ; interpréteurs = `GET /pty/shells` (fetch direct + `/pty` dans le proxy). Projeter aussitôt en `{value,label}`.
- Fournisseur = deux magasins : clé par `PUT /auth/{id}`, `baseURL` par la config ; créé ⇒ visible au rechargement ⇒ la grille fusionne la config déclarée ; aucun `DELETE` sur `/config` ⇒ l'écran le dit avant le clic.
- `GET /config/providers` : `providers` = tableau, `models` = carte par fournisseur ⇒ pas de second appel.
- Providers : grille cherchable puis détail (`providers.tsx`). Contrôle de choix = `picker.tsx`, jamais un `<select>` natif.
- Copie en anglais (`packages/webui/src/*`), nombres selon la langue ; commentaires et intitulés de test en français.
- Fil mis à jour en place par le flux, pas par relecture REST ; écouter `/global/event` — `/event` est borné à un dossier (`middleware/workspace-routing.ts:86-88`).
- Deltas appliqués au plus une fois par image (`createLatestGate`, `stream-sync.ts`) : brancher `setMessages` sur un événement fige la page (75 deltas/s ⇒ image bloquée 12 388 ms).
- `message.part.updated` porte `properties.part` ; `message.part.delta` = `{sessionID, messageID, partID, field, delta}` ; `message.updated` = `{sessionID, info}` ; lire `properties` comme la partie ⇒ `id` indéfini, événement ignoré, fil muet. Lecture par étape (`groupTurns`/`groupSteps`).
- Réponse d'agent en échec sans partie ⇒ afficher `turnError(turn)` (`view-model.ts`, première `info.error`).
- Jamais d'animation d'entrée sur un bloc du fil (fusion dans le tour utilisateur ⇒ rejoue à chaque image) ; seule la ligne d'injection `.injections.injecting` est stable ; une boucle peut aller partout.
- `question.asked` = seule écriture du fil ; réponse positionnelle `{answers: string[][]}`.
- SSE : `EventSource` ne rappelle jamais `onerror` sur une socket ouverte sans rien livrer ⇒ garder le watchdog (silence > 30 s).
- Affichage : ±lignes = `edit.state.metadata.filediff` uniquement ; `bash.state.output` complet ⇒ borner à 12 lignes + « show N more lines ».
- Barres de défilement : une règle globale (`*::-webkit-scrollbar`) et un mécanisme (`scrollbar-width` désactive `::-webkit-scrollbar` dans Chromium).
- Toute taille par jeton ; un jeton référencé mais non défini hérite en silence ⇒ inventorier utilisé contre défini.
- Le rare ne s'affiche pas au repos ; une action de premier plan reste au pied du rail, pas dans un panneau de réglages.
- Deux compositeurs (`home-composer`, `composer-inner`) ⇒ compter les sites d'appel avant de corriger.
- Un composant peut exister sans être monté ⇒ grep l'usage et le CSS avant de conclure « ça n'existe pas ».
- Chemins : comparer par leur texte est faux ⇒ normaliser (`pathKey`), garder l'original pour le serveur.
- Un bouton sans effet visible est pire qu'un bouton mort ⇒ mesurer l'effet (largeur rendue), pas l'état.
- Écriture à vérifier sans toucher la config réelle : instance isolée 4097/5181 (XDG isolés, `bun.exe` en chemin absolu, proxy par `OPENCODE_SERVER_PORT`) ; elle meurt avec son shell ⇒ sonder les deux ports avant d'accuser le code.

## 4. TUI et CLI

- Route standard = `routes/session/index.tsx` (CRLF) ; deux crans d'opacité dérivés du thème (`theme.textLow`), jamais un gris figé.
- bash : commande bornée à 1 ligne + `· +N lines`, sortie par la fin (5 lignes), un même clic déplie les deux ; jamais de troncature de caractères.
- Prompt en file : `QUEUED` se décide par le statut, jamais en retirant la visibilité ; `STEER` par `metadata.steer` seulement.
- Annuler une file/un steer : `session.revert` sur un message non servi est une suppression (`withdrawableUserID`, `session/prompt-queue.ts` → `SessionRevert.withdraw`), jamais un revert avec snapshot ; tout message non servi au-delà de la cible part avec elle.
- `inspect_batch` : une ligne repliée `inspect_batch · N actions ▸`, chevron seulement s'il y a à révéler.
- `run` : `TOOL_RULES.bash.view.final` reste `true` (sinon `exit 1` s'affiche comme un succès) ; code de sortie par `toolExitCode`, partagé texte et couleur.
- Retry : 408/425/429 et erreurs de transport réessayés, `AbortError` jamais, plafond 10 ; délai serveur non plafonné, pas de reprise après facturation `(H)`.
- Preuve visuelle : `bun packages/opencode/script/tui-shot.ts --session <id> --db <copie> --wait 45` ; ~15-20 s avant la première peinture ; base = copie `VACUUM INTO`, jamais la vraie.
- `packages/opencode/src/**` ⇒ rebuild + redéploiement (skill `fork-build`) ; les fragments de prompt sont embarqués dans le binaire ⇒ même contrainte.

## 5. Harnais, outils, publication

- Outil natif invisible ⇒ tableau `builtin` de `packages/opencode/src/tool/registry.ts` ; `always_tools`, carte `tools` et permissions ne filtrent qu'un catalogue déjà construit.
- Mode plan : `plan_enter`/`plan_exit` exigent `OPENCODE_EXPERIMENTAL_PLAN_MODE` et `flags.client === "cli"` ; distincts de `planning` (`experimental.planning.enabled`) et de `turn_plan`.
- Plugin livré = config seule, aucun rebuild ; `src/**` = rebuild.
- `.opencode/plugin/*` n'est pas auto-découvert ⇒ entrée `file:///…` dans la config globale + redémarrage ; composant `schedule` `(H)`.
- Workflow agentic : `.opencode/agent/coding-orchestrator.md`, entrée `/deliver`, spec `specs/agentic-coding-workflow.md` — config pure.
- Publication npm : voie canonique = CI `release-fork` (construit le ref poussé, 12 plateformes, publie 13 paquets) ; pousser `dev` d'abord. Publish local = une seule plateforme, or la méta doit lister les 12 (`postinstall.mjs`) ⇒ installation cassée ailleurs. Voie manuelle : `bun ./packages/opencode/script/publish-fork.ts` (jeton via `NPM_CONFIG_USERCONFIG`) ; vérifier 13 paquets. `(H)`
- Entrée npm = lanceur Node (`script/opencodev2.mjs` → `bin/opencodev2.mjs`), jamais un faux `.exe` : aucun gestionnaire ne lance le `postinstall` ; le lanceur répare au premier appel.
- `opencodev2` sans commande = `serve` (UI à la racine) ; en mode source, `bun --watch` ⇒ le veilleur ne surveille que le dossier courant.
- Sauvegarde de binaire : le nom ne dit pas ce qu'elle contient ⇒ `--version` sur une copie portant `.exe`, jamais sur `.bak.…`.
- Navigateur : `isolated` = `%LOCALAPPDATA%\McpBrowserProfiles\<navigateur>` ; `browser_ensure` ignore le profil dès qu'un CDP est actif ⇒ `chrome.exe --remote-debugging-port=9222 --user-data-dir=…` puis `browser_use` ; sinon piloter par CDP direct. Jamais le navigateur réel sans accord explicite.
- Actions GitHub sur fork : 422 malgré `enabled` ⇒ clic « I understand my workflows » (aucun endpoint).
- Registre npm après `release-fork` : propagation de plusieurs minutes ⇒ un paquet absent juste après n'est pas un échec ; sonder `registry.npmjs.org/@lux-tech%2Fopencode-ai-<plateforme>/<version>` et re-vérifier ~2 min.
- Modèles gratuits : tester `opencode-go/*-free` avant de conclure ; `opencode/*-free` est fermé côté serveur ; `jev-1.13*` n'est pas un modèle de conversation (`/systemone`). `(H)`

## 6. Dépannage — ordre de diagnostic

- Page pilotée muette : `/json/list` → santé des deux serveurs → CPU des processus, avant de suspecter le code.
- Sonde CDP : borner chaque appel (`Promise.race`), journaliser par étape ; `scrollIntoView({block:'center'})` puis mesurer ; sonde idempotente ou rechargement ; capture = une zone ; activation utilisateur par `Input.dispatchMouseEvent`, `.click()` pour ouvrir ou sélectionner.
- Vite : tuer le parent `bun` ne tue pas l'enfant `node …/vite.js`, qui garde le port ⇒ arrêter le processus `vite`.
- Jamais `window.confirm` dans du code piloté par navigateur.
- Console opencode.ai : libellé exact, liste noire `credit|pay|billing|delete|revoke`, sélecteurs bornés au `[role="dialog"]`.

## 7. Mise à jour de ce fichier

- Action à faire maintenant ⇒ ici, une ligne ; mesure, forme de réponse, recette ⇒ `docs/HARNESS.md`.
- Une règle déjà présente dans le fichier global ne se recopie pas ici.
