# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

## [v2.3.16] - 2026-09-28

### Fixed
- **La portée par défaut était ignorée sur toute installation existante** : une version antérieure avait mémorisé `"project"` dans le kv sous `session_directory_scope`, et `kv.get` rend la valeur stockée avant tout défaut — la barre continuait donc de lister les sessions de tout le poste. La portée est désormais lue sous une **clé neuve** (`session_directory_scope_v2`), ce qui rend la valeur héritée inerte : le dossier du workspace courant redevient la portée par défaut, sans rien effacer dans le kv de l'utilisateur.
- **La liste débordait de la barre de navigation** : les deux hôtes passaient la hauteur du **terminal** comme hauteur de liste, alors que la barre n'occupe qu'une partie de l'écran ; le contenu dépassait la boîte et poussait le pied (« new … del … ren … ») hors de la vue. La liste prend maintenant la place réellement laissée par l'en-tête, la recherche et le pied, et le défilement suit la hauteur mesurée du conteneur.

### Changed
- **Fenêtre d'affichage ramenée de 30 jours à une semaine** : seules les sessions mises à jour dans les 7 derniers jours sont listées, borne toujours déclarée à un seul endroit.

### Tests
- Un test de bord épingle la fenêtre d'une semaine (session à la limite conservée, une milliseconde au-delà exclue) et vérifie que la clé de portée n'est pas celle qu'écrivait la version précédente ; le test d'intégration amorce un kv hérité valant `"project"` et prouve que la barre l'ignore (dossier courant demandé, endpoint machine-wide jamais appelé) ; un test de rendu prouve que la liste ne pousse plus le pied hors de la barre, en comptant les lignes dessinées contre la hauteur du conteneur.

## [v2.3.15] - 2026-09-28

### Changed
- **La barre de sessions s'ouvre sur le dossier courant, plus sur tout le poste** : le listing machine-wide introduit en v2.3.13 est **abandonné** — divergence assumée. Il listait les sessions de tous les projets du poste, si bien que la barre ne montrait plus le travail en cours. Par défaut, elle couvre donc le dossier de travail, et la bascule « all dirs » reste disponible pour élargir explicitement au poste entier.

### Added
- **Ajout d'un dossier à la liste affichée** : un dossier choisi rejoint la barre et y reste d'une session à l'autre (persisté dans le kv), et peut en être retiré ; le nombre de dossiers ajoutés s'affiche dans l'en-tête de la barre, et les deux commandes sont accessibles depuis la palette.
- **Limite d'ancienneté des sessions listées** : seules les sessions mises à jour dans les 30 derniers jours sont listées. La borne est déclarée à un seul endroit, transmise au serveur (`start`) et appliquée aussi au listing machine-wide, qui n'en avait aucune.

### Tests
- Le test de portée est réécrit pour le nouveau contrat : le défaut est prouvé par le comportement (la barre demande le dossier courant et n'appelle jamais l'endpoint machine-wide), l'ajout puis le retrait d'un dossier sont vérifiés de bout en bout, et une session de 400 jours est exclue. Un test de bord fixe la borne d'ancienneté (session à la borne conservée, une milliseconde au-delà exclue). 94 pass / 0 fail sur les cinq suites concernées, `tsgo --noEmit` = 0.

## [v2.3.14] - 2026-09-28

### Fixed
- **La ligne « Read more » d'un dossier se lit comme les sessions qu'elle masque** : elle était collée au bord du cadre, sans le retrait des sessions, et se confondait avec un titre de section. Elle porte désormais la même indentation et un glyphe aligné sur leur colonne, et reste cliquable pour révéler les lignes cachées.
- **La barre de sessions défile au lieu d'être tronquée** : les lignes masquées n'étaient atteignables que par un indicateur « N more » figé, sans molette ni déplacement de vue. La liste vit maintenant dans un conteneur défilable (molette, et défilement automatique qui garde la ligne sélectionnée visible), ce qui rend **toutes** les lignes accessibles : sur un terminal de 24 lignes, 19 lignes étaient atteignables, la totalité l'est désormais.

### Changed
- **Le raccourci Steer quitte Alt+Entrée** : cette combinaison insère un retour à la ligne (`input.newline`), donc y placer Steer la rendait inopérante. Steer passe sur **Alt+S**, une combinaison Alt+lettre que le terminal transmet telle quelle, sans la consommer ; l'insertion de retour à la ligne reste sur Entrée, Maj+Entrée, Ctrl+Entrée et Ctrl+J.

### Tests
- Deux tests de rendu ajoutés sur la barre (indentation et clic de la ligne « Read more »), la règle de défilement extraite en fonction pure et testée (maintien de la sélection dans la vue), plus un test de garde qui échoue si un raccourci par défaut entre en collision — c'est exactement la collision Alt+Entrée qui était passée inaperçue. 118 pass / 0 fail sur les suites concernées, `tsgo --noEmit` = 0.

## [v2.3.13] - 2026-09-28

### Fixed
- **Ouvrir une session ne referme plus un dossier de la barre de sessions** : le repli d'un dossier était modélisé comme un basculement relatif au dossier de la session active, si bien qu'un dossier ouvert à la main se refermait dès qu'une session y entrait. L'état est désormais explicite (un dossier est replié ou non, et le choix de l'utilisateur prime), donc stable quelle que soit la session ouverte.
- **La portée « all dirs » liste réellement toutes les sessions de tous les dossiers** : elle était servie par la liste filtrée sur le projet courant, puis réduite par une fenêtre de 30 jours, la limite serveur de 100 et le filtre « racines ». Elle passe par la liste machine-wide (`/experimental/session`), sans borne temporelle et paginée jusqu'au bout.

### Added
- **Choix explicite entre Queue et Steer à la soumission** : `enter` met le prompt en file (il part à la fin du tour en cours) et `alt+enter` l'injecte dans le tour en cours ; l'indicateur du composeur affiche les deux options pendant un tour actif.

### Tests
- Trois tests de portée ajoutés côté sync (machine-wide paginé vs dossier courant), deux tests de non-régression du repli pinné et trois tests du sélecteur Queue/Steer : 128 pass / 0 fail sur les 9 fichiers concernés, `tsgo --noEmit` = 0.

## [v2.3.12] - 2026-09-28

### Fixed
- **La limite de trois entrées avec « Read more » s'applique désormais aux sessions de chaque dossier**, et non aux dossiers eux-mêmes : chaque dossier ouvert plafonne ses propres sessions à trois et porte sa propre ligne « Read more » ; les dossiers ne sont plus plafonnés, chacun contribue toujours son en-tête.
- L'état de révélation suit la même forme que les replis (`revealed`, liste de dossiers concernés) au lieu d'un booléen global, donc les deux survivent à une frappe.

### Tests
- Tests unitaires et de rendu mis à jour (sessions plafonnées à trois dans chaque dossier via `navRows`, dossiers non plafonnés, « Read more » par dossier) : 80 pass / 0 fail, `tsgo --noEmit` = 0. Le calcul de hauteur de v2.3.11 est conservé, donc une longue liste défile toujours au lieu de déborder.

## [v2.3.11] - 2026-09-27

### Fixed
- **La barre de sessions ne déborde plus** quand la liste dépasse la hauteur disponible : la fenêtre de lignes réserve désormais tout le chrome réellement dessiné (padding du cadre, en-tête « Sessions », champ de recherche, indicateurs de défilement, ligne de raccourcis), donc le calcul ne peut plus excéder d'une ligne. Le `gap` inter-lignes du cadre — qui poussait les dernières lignes hors du cadre sans être compté — a été retiré.
- **La limite de trois dossiers par défaut et le bouton « Read more » sont de nouveau effectifs** : `navRows` honore à nouveau son drapeau `expanded` (il recevait `true` en dur, ce qui levait toujours le plafond) ; une recherche continue de tout déplier.

### Tests
- Deux tests de rendu ajoutés (liste bornée par la hauteur réellement disponible ; plafond à trois dossiers + « Read more ») et un test d'invariant liant `NAV_CHROME_ROWS` aux lignes réellement dessinées par la barre : `session-nav.test.ts` + `session-nav.view.test.tsx` verts (78 tests), `tsgo --noEmit` à 0.

## [v2.3.10] - 2026-09-27

### Changed
- **Seul le dossier de la session active s'ouvre** dans la barre de sessions : les autres dossiers sont pliés par défaut et ne montrent plus que leur en-tête. La bascule manuelle d'un dossier (action sur son en-tête) reste prioritaire sur ce défaut.
- Une **recherche déplie tous les dossiers** le temps de la requête, pour qu'aucune session correspondante ne reste cachée derrière un pli.

### Removed
- Le **séparateur de compaction** (ligne horizontale intitulée « Compaction ») affiché avant chaque compaction dans la vue de session.

### Tests
- `session-nav.test.ts` et `session-nav.view.test.tsx` migrés au nouveau contrat (repli par défaut, révélation à la recherche) : 54 tests unitaires et 22 tests de rendu verts, `tsgo --noEmit` à 0.

## [v2.3.9] - 2026-09-27

### Added
- **Barre de sessions de la TUI** : sessions regroupées par dossier (en-tête `/dossier` avec compteur), sélection au clavier, création (`alt+n`), suppression en deux temps (`ctrl+d`), renommage (`ctrl+r`), repli/dépli par dossier et défilement. La barre est également montée sur l'écran d'accueil.
- **Recherche dans la barre** : le champ filtre les sessions sur le titre, le dossier et le chemin ; `/` ouvre le champ, `↑`/`↓` parcourent les résultats, `Entrée` ouvre la session, `Échap` annule.
- **Choix du dossier de travail** à la création d'une session, via un modal de sélection de dossier.
- **Rendu `inspect_batch` en checklist** : une ligne par appel d'outil, précédée d'une puce et d'un glyphe d'état (spinner braille pendant l'exécution, `✓` vert, `✗` rouge, `−` ignoré, `?` indisponible), au lieu d'un arbre indenté.

### Changed
- **La liste des sessions est de portée projet par défaut** : toutes les sessions du dépôt sont visibles, tous dossiers confondus. La portée est portée par la clé `session_directory_scope` (`project` | `directory`) ; la bascule « filtrer sur ce dossier » reste disponible (raccourci et palette), et le nom de commande existant est conservé.
- Largeur de la barre réduite (52 → 36 colonnes) et pied de barre compacté ; les horodatages de session restent lisibles sous des titres longs.

### Fixed
- **Le retour arrière était sans effet dans le champ de recherche** : la barre écoutait le flux brut `keypress`, alors que le composeur focalisé détient la liaison `input.backspace` et qu'une liaison liée arrête la propagation — la frappe (non liée) passait, la suppression non. La recherche prend désormais le clavier (composeur mis en retrait pendant la recherche, restauré à la sortie) et un retour arrière sur requête vide n'est plus une touche morte.
- **Le pied de la barre affichait le mauvais dossier** : il suit désormais le dossier de la session affichée.
- La barre n'était pas visible sur l'écran d'accueil.

### Tests
- `session-nav.test.ts`, `session-nav.view.test.tsx`, `session-nav-keybind.test.tsx`, `inspect-batch-tree.test.tsx`, `sync.test.tsx` : 87 tests verts, dont capture terminal réelle et injection clavier (`pressKey`, `pressBackspace`) prouvant la frappe **et** la suppression. `tsgo --noEmit` : exit 0.

## [v2.3.4] - 2026-09-27

### Added
- **Gestion des plugins à chaud en production (HTTP + SDK + CLI)** : un serveur qui tourne peut désormais dire quels plugins il sert, être relu depuis le disque, et recevoir un ajout ou un retrait d'origine — **sans redémarrage**. Surface : `GET /plugin`, `POST /plugin/reload`, `POST /plugin` (`{spec}`), `DELETE /plugin/:spec`, plus la commande `opencodev2 plugins list|reload|add|remove --url`, adossée au SDK régénéré depuis la spec OpenAPI vivante. Le compteur de génération (`version`) est renvoyé par chaque appel, ce qui rend un swap observable côté client.

### Fixed
- **Le « hot reload » des plugins ne rechargeait pas le code des plugins** : `PluginLoader` ré-importait la **même** URL de fichier, et le cache ESM de Bun (qui n'est pas non plus contourné par un `?v=<ts>`, mesuré : `queryBusted=v1`) servait l'ancien module. Les entrées de plugin sont maintenant matérialisées en **artefact content-hashé** (`Global.Path.cache/plugin-artifacts/<hash>`) et importées depuis ce chemin, donc une édition du plugin prend effet au rechargement sans redémarrer le process (`HOTRELOAD first=["v1"] second=["v2"]`, `LOADER_OBSERVATION {"first":"v1","second":"v2"}`).
- **Le catalogue d'outils ne voyait pas un outil ajouté ou retiré par un plugin** : le catalogue (`ToolRegistry`) est construit à partir des plugins mais n'enregistrait pas la génération qui l'a produit, si bien qu'un `all()` servait encore les outils de la génération précédente. La génération plugin fait désormais partie de la validité du catalogue, qui est reconstruit dès qu'elle change.
- **Un plugin défaillant pouvait casser une session en cours** : `Plugin.reload` remplaçait la liste des hooks par celle d'une génération incomplète. Le rechargement est désormais **atomique** : chaque échec de chargement est enregistré par son spec, et si la génération est incomplète l'ancienne génération **reste servie** et les specs fautifs sont mis en quarantaine (`RELOAD_ROLLBACK_OBSERVATION first=["v1"] afterBreak=["v1"] afterRepair=["v3"]`).
- **Commentaire trompeur** dans `src/plugin/index.ts` sur `ensureWatching` : il promettait un effet que la mesure démentait.

### Tests
- `test/plugin/hot-reload.test.ts` : contrat de rechargement du code (assertions inversées en rouge→vert par le correctif), `test/plugin/reload-rollback.test.ts` : atomicité (génération conservée sur plugin cassé, swap après réparation), `test/tool/registry.test.ts` : reconstruction du catalogue sur changement d'outils d'un plugin. `tsgo --noEmit` : exit 0.

## [v2.3.3] - 2026-09-26

### Fixed
- **Crash de composition du prompt causé par la forme des diffs d'un learning (`Sending the prompt failed`)** : la tâche d'éval du daemon écrivait une entrée de learning dont les diffs portaient la forme du payload `session.diff` (`status`/`patch`, `Snapshot.FileDiff`) au lieu de celle attendue par `LearningEntry` (`type`/`diff`). `formatLearningsSection` passait alors `type: undefined` à `xmlEscape()`, dont le `TypeError` faisait échouer **chaque** prompt de la session (incident 2026-09-26, refs `err_67cb811f` / `err_a93a94f2`). Correction en trois points : `parseHeadlessResult` mappe désormais le payload sur la forme `DiffInfo` (`toDiffInfo`), `sanitizeLearning` normalise **à la lecture** toute entrée écrite par un autre processus ou une autre version (`status` → `type`, `patch` → `diff`, coercition des champs manquants) et répare donc aussi les fichiers déjà sur disque, et `readUnacknowledgedLearnings` / `readLatestLearning` / `findLearningsByTaskId` passent tous par ce nettoyage. Test de non-régression `test/daemon/learnings-shape.test.ts` (5 cas, dont un learning legacy rendu sans lever).

## [v2.3.2] - 2026-09-26

### Added
- **Boucle eval du daemon rendue opt-out (`OPENCODE_NO_DAEMON_EVAL`)** : le daemon enregistrait la suite `sanity` horaire sans condition (`sanity-eval`, `every_1h`, `src/cli/cmd/watch.ts` L84) et chaque run en échec contre la baseline **agrégée** ré-enfilait la tâche `eval-regression-sanity`. Mesuré sur ce poste : run courant 0,667 contre baseline 1,0 → sévérité `major` et nouvelle tâche **toutes les heures**, chacune lançant un `opencodev2 run --headless` (~0,5 Go de mémoire privée) **et** un second serveur `chrome-devtools-mcp`. `OPENCODE_NO_DAEMON_EVAL=1` saute désormais l'enregistrement de `sanity-eval` et la variable forcée `OPENCODE_DAEMON_EVAL_REAL` ; le défaut est inchangé.
- **Tâches terminales : un démarrage en arrière-plan honore désormais `dependsOn`** : ⚠️ changement de comportement. La branche `background` ressortait **avant** la résolution des dépendances, si bien qu'un serveur lancé en arrière-plan démarrait sans ses prérequis — un serveur contre une base non migrée démarre, *paraît* fonctionner, et échoue plus tard : la pire classe de bug. La résolution `order` (DFS, garde de cycle) est remontée au-dessus des deux chemins, et un démarrage en arrière-plan exécute désormais ses prérequis en premier plan, attendus : **si l'un échoue, le processus n'est pas détaché du tout** et l'étape fautive est rapportée (`Dependency 'seed' failed (exit 1), so 'app' was NOT started`), avec les prérequis réussis listés en cas de succès. Sémantique alignée sur l'exécution en premier plan, qui s'arrête déjà à la première étape en échec. Décision explicite et documentée : **`restart` continue de NE PAS rejouer `dependsOn`** (rejouer une migration ou un seed à chaque redémarrage serait faux — les prérequis d'un processus déjà lancé sont acquis) ; c'est désormais écrit dans la description de l'outil et commenté dans le code pour ne pas être « corrigé » par erreur. Défaut découvert en vérifiant la correction : un `dependsOn` déclaré dans un **`tasks.json`** était **silencieusement ignoré** — `ConfigTasks.fromVscode` mappait `command`, `description`, `cwd`, `env`, `shell` et `group`, mais ni le schéma `VscodeTask` ni le mappage ne portaient `dependsOn`, alors que le fichier est présenté comme l'équivalent de la clé de config qui, elle, le supporte. Les deux formes VSCode sont désormais honorées (liste de libellés ou objets `{ label }`).
- **Intake : les sorties d'outils ne sont plus élaguées, le filtre est restreint à la réflexion** : ⚠️ changement de comportement. Le filtre extractif décidait par bloc entier (jusqu'à `MAX_BLOCK_CHARS = 600`) et le retirait en totalité (`apply`, `src/jev/intake.ts` L150-166) : il ne pouvait donc pas conserver « les trois lignes utiles » d'un fichier de 400 sans emporter aussi le contexte qui les rend lisibles — c'est la cause des `[intake: pruned 10L]` qui ont fait perdre du contenu pendant le développement. Une compaction par plages de lignes guidée par l'intention de l'agent a été construite puis évaluée (`src/jev/compact.ts` : fenêtres, prompt portant `input.intent`, parse validé, restauration déterministe des lignes ancrées, `data=true` pour les sorties de données précises). **Évaluation sur 15 sorties d'outils réelles (467 821 chars) et 3 essais de LLM réels** : la construction tient ses garanties (ancres 604/604 conservées, données 15/15 octet pour octet, 72,5 % de réduction sur un plan réaliste), mais la **sélection du modèle n'est pas fiable** — les trois essais ont rendu des plans vides ou quasi vides (0, puis 1, puis 4 lignes sur une sortie de 504 lignes), y compris avec le modèle et le prompt de production (`{"keep":[],"data":false}`), pour un coût de 131 k tokens de prompt par compaction (rentable seulement après 2 tours rejoués). Décision : la compaction LLM n'est **pas activée**. `JevIntake.intakeApplies()` renvoie toujours `false` (garde testée, pour qu'aucune configuration ne puisse réactiver l'élagage) et les sorties d'outils traversent l'intake intactes ; le module est conservé avec ses tests, prêt à être réévalué sur un modèle à meilleure sélection.
- **Tâches terminales nommées : registre persistant + catalogue d'outils complet** : l'outil `tasks` ne connaissait que `list` et `run`, donc l'agent devait réécrire la même commande à chaque appel. Il accepte désormais `get` (une ou plusieurs, avec source et état d'exécution), `upsert` (créer/modifier une tâche du store agent, `command` requis à la création), `delete` (une ou plusieurs), `stop`/`restart`, et `run background=true` pour un processus long. Les définitions viennent de trois sources hiérarchisées — config `tasks` > `tasks.json` / `.vscode/tasks.json` > store agent `.opencode/tasks.json` (autorité la plus basse) — et l'outil refuse d'écrire dans une tâche qu'il ne possède pas. Le store est fusionné dans la carte utilisée par `list`/`run`, sans quoi une tâche créée resterait inerte. 🔒 Sécurité : aucun élévation ni terminal nommé ; le nom de tâche ne peut pas s'échapper du dossier de logs (assaini) et `stop` ne signale **jamais** que le PID enregistré par ce serveur (`taskkill /T` sur Windows, groupe de processus sur POSIX), donc aucun processus préexistant n'est tué. 🔎 **Économie mesurée sur la base réelle (1 037 043 parts, 78 804 appels porteurs d'une commande)** : 3 796 commandes distinctes ont été réexécutées, soit **1 720 687 chars réécrits** ; net du coût d'une référence par nom (50 chars/appel), l'économie est de **1 055 487 chars ≈ 264 k tokens**. Le cas d'usage est concret : la commande de garde de pré-vol apparaît 84, 81, 70 et 68 fois. Tests 8/8, typecheck OK.
- **Pas de frontière de résumé configurable + summarizer non tronqué** : `experimental.context_rollout.summary_boundary_step` (défaut 20, constante `SUMMARY_BOUNDARY_STEP`) — les entrées d'outils historiques ne sont élidées que sur les blocs qui se ferment à un multiple de ce pas, donc un pas plus petit élide davantage d'historique. Câblage : `config → session/context-rollout (Info/DEFAULTS/resolve) → options de message-v2 → envoi (prompt ×2) et estimateur (compaction ×2)`. En complément, le **summarizer lit désormais le raisonnement non tronqué** (`reasoningMaxChars: 0`) : une chaîne de pensée pré-tronquée ne peut pas être réécrite fidèlement, or c'est justement le « pourquoi » que la compaction doit préserver. ⚠️ **Mesuré sur la session « Upload fichier difficile pour agent navigateur » : le levier est réel mais marginal — step=3 élide 1 355 chars de plus, soit ≈346 tokens (~0,6 % des arguments d'outils)** — parce que l'essentiel du poids (~190 k des 217 k chars) est porté par `write`/`bash`/`edit`, non éligibles à l'élision (payloads reproduits verbatim). Le vrai levier restant est la réécriture LLM de ces payloads. Tests 68/68, typecheck OK.
- **Élision des entrées d'outils d'état du harnais** : `turn_plan` et `edit_objective` rejoignent `SUMMARIZABLE_TOOL_INPUTS` (`src/session/message-v2.ts`), donc leurs entrées anciennes — celles qui sont au-delà de la frontière de résumé — sont remplacées par `{ omitted: true, tool_input: "historical" }` au lieu d'être rejouées verbatim. Ces deux outils ne portent aucun payload que le modèle reproduit : le harnais réinjecte le plan vivant et le contrat de tâche à chaque tour. `todowrite` est volontairement **exclu** — le test existant exige son verbatim, et le chemin `supersededTodo` réduit déjà les listes périmées. Mesuré sur la session « Upload fichier difficile pour agent navigateur » : **25 852 chars élidés sur 60 appels** au-delà de la frontière (sur 27 776 au total pour ces deux outils, soit 93 % de cette famille), ≈6,6 k tokens par requête ; le poste « arguments d'outils » passe de 227 539 à 217 191 chars. Tests 59/59. Les scripts de mesure (`measure-r*.ts`) sont des artefacts de session, gardés hors du dépôt.
- **Compaction du raisonnement rejoué** : `experimental.context_rollout.reasoning_max_chars` et `reasoning_keep_recent` bornent le chain-of-thought renvoyé au modèle pour les tours anciens (tête+queue conservées, marqueur), sans jamais supprimer le champ `reasoning_content` que DeepSeek exige sous peine de 400. Les tours récents restent verbatim, le raisonnement complet reste en base (transformation à la volée, fail-open). Activé par le profil `measured`, désactivé par défaut. Mesuré sur la session « Instabilité serveur MCP web browser » : 19 tours rejoués, 166 844 chars, ~147 738 chars (≈88 %) supprimés par requête au budget 1000, soit ≈42 k tokens.
- **Intake JEV guidé par l'intention** : en mode `jev.intake.intent`, la question posée à JEV est cadrée par l'intention courante de l'agent (objectif actif + dernière demande), de sorte qu'une lecture de fichier ne conserve que les lignes qui servent la tâche au lieu de toutes les lignes « plausibles ». Mesuré sur une lecture réelle (849 lignes, 42 229 caractères) avec la même intention : mode générique **−16,6 %**, mode intention **−83,1 %** (after 7 130). En mode intention les blocs à ancres sont interrogés aussi et peuvent être supprimés, mais seulement sous `anchor_threshold` (plus strict, défaut = moitié de `threshold`) ; le brut reste récupérable dans le ledger, fail-open, net-positif. Config : `jev.intake.{intent,anchor_threshold}`, désactivé par défaut.
- **Filtre d'admission extractif du contexte (JEV intake)** : avant qu'un résultat d'outil n'entre dans le contexte du modèle, JEV le découpe en blocs et marque ceux qui ne sont **pas** porteurs ; le harness supprime **exactement** ces blocs et garde le reste **octet pour octet** — jamais de réécriture, donc un chemin, un nombre ou un message d'erreur ne peut pas être altéré. Un bloc contenant une **ancre** (chemin, commande, identifiant, erreur, exit code) n'est **jamais** interrogé ni supprimé (garde-fou déterministe via `candidatesFromText`), et un bloc sans réponse est **conservé** (fail-open) : une mauvaise réponse JEV ne peut pas retirer d'information porteuse. Les questions fusionnent dans l'aller-retour `post` déjà payé (aucun appel supplémentaire), ou partent dans leur propre requête si `jev.intake.model` (ou `base_url`/`endpoint`) pointe le filtre vers un autre modèle System One. La coupe n'est appliquée que si elle **réduit** réellement le résultat (jamais d'inflation par marqueur). Le ledger conserve en outre l'output brut borné par slot (`ContextLedger.MAX_RAW_CHARS`, activation par `setRawRetention`), donc un span supprimé reste récupérable via `slotFor(...).raw` sans ré-exécuter l'outil. Config : `jev.intake.{enabled,threshold,max_blocks,min_chars,model,base_url,endpoint}`, **désactivé par défaut**, shadow-aware, fail-open. Preuve live (binaire déployé 2.2.41) : `tool=bash before=51286 after=4585`, `tool=complete_objective before=621 after=535`.
- **Découverte dynamique des modèles d'un provider OpenAI-compatible** : un provider peut déclarer `discover: true` dans `opencode.json` ; au démarrage, opencode interroge `GET {baseURL}/models` et fusionne les modèles absents de `models` (métadonnées dérivées de l'API : `name`, `context_length`, `limit.output` par défaut), les modèles déclarés gardant la priorité et `whitelist`/`blacklist` s'appliquant aussi aux modèles découverts. Résout le cas `command-code` : les nouveaux modèles du provider (ex. `claude-opus-5-5`) apparaissent sans éditer la config. La boucle d'application des *discovery loaders* (auparavant codée en dur pour gitlab) est désormais générique ; toute erreur réseau est *fail-open* (aucun modèle, démarrage préservé).

## [v2.3.1] - 2026-09-26

### Added
- **Preset d'activation JEV `profile: "safe"`** : une clé unique active d'un coup les hooks JEV à risque nul ou faible — `route`, `plan`, `relevance`, `review`, `next_action` et `intake` — sans changer le défaut, qui reste opt-in. Un `enabled` explicite gagne toujours : `enabled: false` à côté du profil reste éteint. `guard` (risque élevé), `untrusted` et `compaction` (risque moyen) ne sont jamais impliqués par un profil et s'activent individuellement. L'expansion est une fonction pure (`ConfigJev.resolve`), appliquée au **seul chemin de lecture** de la config (`loadInstanceState`), donc les écritures (`update`) conservent le profil brut. Rappel : activer `intake` n'élague rien — `intakeApplies()` renvoie toujours `false` depuis `34a56c749`, les sorties d'outils traversent l'intake intactes.

### Fixed
- **Tests `intake-hooks` alignés sur le contrat « never prune »** : deux cas assertaient le comportement de fusion/élagage retiré par `34a56c749` ; ils vérifient désormais `kept === undefined` et l'absence de requête intake supplémentaire (une seule requête `post`). Suite JEV : 180 pass / 0 fail, `tsgo --noEmit` exit 0.

## [v2.2.38] - 2026-09-24

### Added
- **L'agent lean reçoit une orientation du workspace dès le premier tour** : `repo_overview` était enregistré uniquement sous `flags.experimentalScout` et refusé par défaut (`repo_overview: "deny"`), donc invisible pour l'agent lean qui devait le découvrir via `tool_search`. Il est désormais enregistré inconditionnellement dans le catalogue builtin, autorisé, et épinglé dans `LEAN_CORE_TOOLS` — donc présent dès le premier tour. Le niveau de détail suit une divulgation progressive (`depth` par défaut **1**, à escalader vers 2 puis 3 seulement si l'architecture reste ambiguë) et sa sortie est bornée par `lean-output-policy` (6 000 caractères / 200 lignes).

### Fixed
- **Un plafond d'outils Lean trop court rejetait le tour entier** : `src/session/tools.ts` calculait `requiredCount` (noyau obligatoire ∪ `always_tools`, restreint au catalogue visible) puis **échouait** (`Effect.fail(cap.reason)`) dès que `max_tools` ne couvrait pas `requiredCount + 6` (marge dynamique). Or ce noyau dépend de la session : un objectif actif épingle deux outils de cycle de vie, et la politique mémoire cinq outils MCP — le même `max_tools=28` suffisait donc à une session neuve et échouait sur une session vivante. Comme le handler transforme **toute** erreur en `BadRequest({})` vide, la cause restait invisible et la session devenait définitivement incapable d'envoyer un prompt. La garde journalise désormais les nombres (`configuredMax`, `requiredCount`, `minimum`, `core`) et **élève le plafond effectif au minimum** au lieu de rejeter le tour : le noyau obligatoire tient toujours, la marge dynamique est préservée.
- **`turn_plan` enregistré par la config mais jamais instruit** : `src/tool/registry.ts` acceptait `flags.experimentalTurnPlan || cfg.experimental?.turn_plan === true`, alors que les deux sites d'injection du prompt (`src/session/prompt.ts`) ne testaient que le **flag d'environnement**. Avec `experimental.turn_plan: true` et sans `OPENCODE_EXPERIMENTAL_TURN_PLAN`, l'outil était donc offert au modèle **sans** le bloc `<turn_plan_protocol>`, sans capsule de rappel et sans capsule de réconciliation : mesuré **0 appel `turn_plan` sur 1634 parts** dans `ses_f372ec0d6ffemLCCs1Z7DrXgxv`, et `declaredIntent` — seul signal du plan vers la décision de boucle — restait vide. Les sites partagent maintenant le prédicat unique `TurnPlan.enabled({ flag, config })`. L'instruction demande en outre un plan **à chaque tour** (et non plus seulement « avant de terminer un tour laissant du travail ouvert ») et interdit de le restituer dans la réponse visible : le plan reste dans le raisonnement, sans coût d'historique.
- **Un correctif déclaré mais jamais câblé** : le commit `76779719b` (v2.2.31) a introduit la constante `gitTimeout = Duration.seconds(60)` et son commentaire dans `src/snapshot/index.ts`, et son message affirmait « Every snapshot git call now passes timeout: 60s » — mais son diff n'ajoute **aucun** `timeout:` aux appels `appProcess.run`. Les commandes git du snapshot restaient donc **sans échéance** : le mode d'échec que v2.2.31 prétendait corriger (un enfant qui ne sort jamais parke le tour) était toujours possible.
- Les deux sites de spawn git du snapshot (le helper `git()` — qui couvre aussi `check-ignore` — et le lot `cat-file --batch`) passent désormais `timeout: gitTimeout`. `RunOptions.timeout` est honoré par `Effect.timeoutOrElse` (`packages/core/src/process.ts:168`), qui **tue** l'enfant ; l'appel échoue alors dans le chemin d'erreur déjà en place (résultat `code 1`) : la capture dégrade et se journalise au lieu de bloquer la phase pré-provider.
- **Le corps d'erreur ne jette plus la cause** : les handlers d'instance (`handlers/session.ts`, `handlers/workspace.ts`, `handlers/mcp.ts`) convertissaient **toute** erreur en `HttpApiError.BadRequest({})` / `HttpApiError.InternalServerError({})`. Or le payload de ces erreurs est `{ _tag }` **seulement** (vérifié dans `effect@4.0.0-beta.66`, `unstable/httpapi/HttpApiError.d.ts`) : la cause était structurellement inexpressible, côté client comme côté log — c'est précisément ce qui a rendu l'incident du plafond d'outils Lean (23/09) illisible. Les 13 sites passent par `ApiError.badRequest(cause)` / `ApiError.internalError(cause)` (`src/server/routes/instance/httpapi/errors.ts`), qui transportent `InvalidRequestError` (400) et `UnknownError` (500) — **statuts strictement inchangés**. La raison est **bornée** (300 caractères) et **masquée** : chemins absolus → `<path>`, affectations sensibles (`token=`, `apiKey:`, `authorization`…) → `<redacted>`. `InvalidRequestError` étant déjà déclaré sur tout endpoint d'instance par `SchemaErrorMiddleware`, seuls les deux 500 (`share`/`unshare`) ont dû être déclarés.
- **`SessionShare.share` échouait en *défaut*, donc le mapping ne s'exécutait jamais** : `src/share/session.ts` faisait `throw` au lieu de produire un échec typé. Le défaut était intercepté par `middleware/error.ts`, qui le remplaçait par « Unexpected server error (ref err_…). Check the server log for details. » — le message du service n'atteignait donc jamais le handler. Il échoue désormais typé (`yield* Effect.fail(...)`), conforme à son canal d'erreur déclaré (`Effect<…, unknown>`) : le mapping devient effectif **et** le `Effect.ignore` de l'auto-share (l. 45) devient réellement effectif, un défaut n'étant pas rattrapé par `Effect.ignore`.

### Fixed
- **`turn_plan` cadrait le tour comme *une* action, ce qui n'économisait aucun tour** : protocole (`src/session/turn-plan.ts`, `instruction()`), capsule de rappel (« Take that action now »), capsule de réconciliation et description de l'outil (`src/tool/turn-plan.ts`) demandaient « the **ONE** action you will take next ». Le tour est désormais cadré comme un **lot** — `intent` = l'objectif borné que le tour livre (les actions indépendantes à grouper/en parallèle), `expect` = la preuve que ce lot est livré — **sans** perdre l'exigence du plan **à chaque tour** acquise en v2.2.35. ⚠️ **Mesure honnête (n=6 par côté)** : sur un scénario à 3 écritures indépendantes + 1 listing, le nombre de tours est **identique** (médiane 5 vs 5 ; ancien 5,6,8,5,5,5 contre nouveau 5,5,6,5,6,5). La cause est ailleurs : le modèle **groupe déjà** les trois écritures dans le **même** tour 0 (3 résultats `← Write` sous un seul step), et les tours suivants se consomment **après** le travail — l'`expect` déclaré (« then list the directory ») n'étant jamais livré, `declaredIntent='execute'` maintient la boucle jusqu'au budget idle. Le cadrage « one action » n'était donc pas le facteur limitant de l'économie de tours.
- **L'exécution de `turn_plan` polluait la transcription TUI** : l'outil tombait dans le rendu générique (`GenericTool`) des deux renderers (`routes/session/index.tsx`, `feature-plugins/system/session-v2.tsx`), soit une ligne `# turn_plan …` à chaque tour. Un prédicat partagé `isHiddenTool` (`cli/cmd/tui/util/hidden-tools.ts`) l'exclut du rendu **et** des décomptes `hasTools` (qui gouvernent footer et durée) : via `shouldHide` côté v1, via une garde au montage d'`AssistantTool` côté v2, plus la liste d'outils du composant `Task`. La partie reste **en session** (le modèle garde son résultat) et `sync-v2.latestTool` n'est **pas** filtré — il met à jour l'état depuis le flux, il n'affiche rien.

### Tests
- `bun test --timeout 30000 src/session/turn-plan.test.ts src/cli/cmd/tui/util/hidden-tools.test.ts src/session/continuation.test.ts` : **37 pass / 0 fail** — le protocole nomme le lot (« BATCH this turn delivers », « parallel tool calls »), n'énonce plus « the ONE action » et **conserve** « On every turn » ; plus le prédicat `isHiddenTool` et une garde de câblage vérifiant que les deux renderers le consultent. `tsgo --noEmit` : **exit 0**.
- A/B mesuré sur binaires déployés, marqueurs d'octets à l'appui : ancien `E309A5BE…` (2.2.36, `the ONE action`) contre `F73D4298…` (2.2.37, `BATCH`) — 6 runs par côté (`opencodev2 run --print-logs --log-level INFO`), tours = `max(step)+1`, travail par tour = lignes de résultat d'outil par step. Limite : en mode `run` l'auto-continue est **désactivé** (`reason=autocontinue-disabled`), l'essai ne reproduit donc pas l'économie de la TUI interactive.
- `bun test src/session/turn-plan.test.ts` : **23 pass / 0 fail**, dont trois cas sur `TurnPlan.enabled` (chemin config-seule qui était cassé, flag seul, ni l'un ni l'autre) et deux sur le libellé du protocole (« On every turn » / « Keep the plan out of your visible answer »).
- `bun test src/session/tools-allowlist.test.ts src/tool/lean-output-policy.test.ts` : **19 pass / 0 fail** ; `tsgo --noEmit` : **exit 0**.
- Reproduction du défaut de cap : `opencodev2 run --format json --agent lean --session ses_f372ec0d6ffemLCCs1Z7DrXgxv` (2.2.34) → `{"type":"error","sessionID":"ses_f372ec0d6ffemLCCs1Z7DrXgxv","error":{"_tag":"BadRequest"}}`, `RUN_EXIT=1` en 16 s.
- `bun test --timeout 30000 test/server/httpapi-error-reason.test.ts` : **8 pass / 0 fail** — raison bornée (plafond de longueur), masquage chemin absolu + sentinelle secrète **absente** du résultat, préservation littérale des nombres du plafond (`configuredMax/requiredCount/minimum`), plus deux épreuves de bout en bout sur le vrai serveur : `GET /session/:id/message?before=abc` → **400** `{"_tag":"InvalidRequestError","message":"\"before\" requires \"limit\""}` (le handler produit l'erreur, pas le décodage du schéma) et `POST /session/:id/share` avec `share: "disabled"` → **500** `{"_tag":"UnknownError","message":"Sharing is disabled in configuration"}` (auparavant « Unexpected server error (ref …) »). Le fichier fixe `setDefaultTimeout(30_000)`, la commande canonique du paquet étant déjà `bun test --timeout 30000`.
- Note d'environnement : sans `--timeout`, le fichier échoue sur `afterEach hook timed out` (5 s) — le fichier voisin `httpapi-schema-error-body.test.ts`, **non modifié**, échoue à l'identique ; ce n'est donc pas un effet du correctif. `resetDatabase()` appelle déjà `disposeAllInstances()`, la double invocation doublait inutilement le travail de démontage.

### Contexte
- Symptôme : « Sending the prompt failed. Open console for more details. » sur l'agent Lean, après l'ajout de `turn_plan` à `experimental.hot_path.always_tools`.
- ⚠️ **Correction (v2.2.35) — la conclusion « la config n'est pas en cause » était fausse.** L'essai d'alors portait sur une **session neuve**, dont le `requiredCount` diffère de la session en cause : avec `environment_state: true`, un objectif actif et `{jev, turn_plan}` dans `always_tools`, `requiredCount` ≈ 23-24, donc `minimum = requiredCount + 6 = 30 > 28`. Le cap **est** atteint, et c'est bien l'ajout de `turn_plan` qui a fait franchir le seuil — exactement le diagnostic initial de l'utilisateur. La réfutation reposait sur une généralisation abusive d'un run sur session neuve ; elle est retirée.
- Cause réelle du blocage **pré-provider** (v2.2.34, distincte du cap) : session `ses_f33215a58ffeDPjknlXcYvigus`, log `service=snapshot … error launching git: Accès refusé` puis `service=session.prompt … step stalled before provider; releasing session` à +299355 ms (`src/session/prompt.ts:1779`). `snapshot.track()` est attendu **avant le stream LLM** (`src/session/processor.ts:144`) et un refus de lancement est rejoué par `retryTransientLaunch` (8 tentatives) : sur cet hôte un spawn refusé coûte des dizaines de secondes (`add()` mesuré à 153 s), donc `track()` peut dépasser le budget pré-provider et faire libérer la session.

## [v2.2.31] - 2026-09-22

### Fixed
- Une attente auxiliaire non bornée ne peut plus parquer un tour. Le helper `git()` du snapshot (`src/snapshot/index.ts`) appelait `appProcess.run` **sans délai** : un enfant qui ne se termine jamais — observé sur cet hôte, un `git check-ignore --no-index --stdin -z` resté vivant 17 minutes après la mort de son parent — laissait l'appel en attente indéfiniment, après le `step-finish`, sans erreur, sans ligne de log et sans watchdog pour le libérer. Toutes les commandes git du snapshot passent désormais un `timeout` de 60 s (option déjà honorée par `RunOptions.timeout`, `packages/core/src/process.ts`) : un enfant qui ne sort pas fait échouer l'appel dans le chemin d'erreur déjà en place (résultat `code 1`), donc la capture dégrade et se journalise au lieu de bloquer le tour.
- Preuve du défaut : session `ses_f3fcaddb3ffeNxfk9iqKZxqeN6`, dernier message `msg_0c86aab5d001H6ZSmyrWH1Qm0X` (09:20:29) resté coincé entre son `step-finish` (09:20:41) et l'itération suivante — aucune ligne `step=21 loop`, aucun part, aucun log pendant 16 minutes — et libéré **uniquement** par l'annulation manuelle de l'utilisateur à 09:36:25 (`service=session.prompt … cancel`, puis `error=Aborted process`, puis `cleanup` en 1,2 s avec `patchFiles=0`).

### Tests
- `packages/core/test/process/run-timeout.test.ts` : un enfant qui démarre et ne se termine jamais (spawner injecté, aucun processus réel) fait échouer `AppProcess.run` **et** est tué, pour qu'il ne s'accumule pas en orphelin ; sans le délai, bun tue le test sur son propre timeout, ce qui est le discriminant. Le test est déterministe (attente bornée du kill), contrairement à une assertion synchrone sur le finalizer.
- `bun test test/process` : **30 pass / 0 fail** (deux exécutions consécutives) ; `bun typecheck` (tsgo) `packages/core` et `packages/opencode` **exit 0**.

### Mesure
- Portée honnête : la correction borne l'attente **auxiliaire** prouvée (git de snapshot). L'évidence ne permet **pas** de trancher, pour le park observé, entre cette attente et celle du flux du modèle : la durée `duration=954338` du flux mesure la portée du `Stream.scoped` tenue ouverte par le consommateur (`src/session/llm.ts:442-501`), pas une attente du fournisseur. La cause amont du non-EOF du git n'est pas établie non plus. Binaire `2.2.31` installé (`%APPDATA%\npm\opencodev2.exe`, `--version` → 2.2.31, SHA-256 identique au build, écrit 09:36:22) ; l'hôte `PID 33408` exécute encore 2.2.30 jusqu'à son redémarrage.

## [v2.2.30] - 2026-09-22

### Fixed
- Le retour de l'`EPERM` après 2.2.29 n'est pas nié : la reprise par **site d'appel** avait un budget trop court. Mesure : l'ancien budget (`Effect.retry` `times: 4`, `Schedule.exponential(50 ms)`) autorisait **5 tentatives ≈ 750 ms**, alors que les refus arrivent **en rafales** — `git checkout` a été refusé **6 fois de suite** dans la session du constat, et un refus `pwsh` supplémentaire a été capturé pendant la vérification. La reprise vit désormais au **point de passage unique** du spawner (`packages/core/src/cross-spawn-spawner.ts`), traversé par **tout** appelant (`git`, `pwsh`, ripgrep, snapshot, worktree, provider), avec un budget de **8 tentatives ≈ 6,35 s** (`packages/core/src/launch-retry.ts` : 50/100/200/400/800/1600/3200 ms). Le refus n'est rejoué que si **rien n'a démarré** : un échec survenu après un vrai démarrage n'est jamais rejoué, l'enfant ayant pu agir.
- La capture de snapshot ne peut plus bloquer un tour. Dans `src/session/processor.ts`, `snapshot.track()` (capture initiale, `step-start`, `step-finish`) laissait remonter un refus de lancement git en **erreur de message** (`UnknownError {"message":"EPERM ... uv_spawn 'git'"}`), ce qui avortait le pas — c'est le chemin exact de l'erreur de 08:52:15. La capture est désormais non fatale et journalisée : un hôte qui la refuse perd le diff enregistré, pas la progression du tour.

### Tests
- `packages/core/test/process/spawner-launch-retry.test.ts` (2 verts) : le spawner reçoit un lanceur injecté qui refuse deux fois puis démarre ; un appelant **sans aucune reprise locale** (`AppProcess.run`) aboutit et compte 3 lancements ; un échec réel (`ENOENT`) n'est **pas** rejoué (1 lancement, échec restitué). Preuve par mutation : sans la reprise du point de passage, le premier refus fait échouer l'appelant. Aucun processus réel n'est lancé, donc le test reste déterministe sur cet hôte.
- `packages/core/test/process/git-launch-retry.test.ts` (6 verts) inchangé. `bun typecheck` (tsgo) : `packages/core` et `packages/opencode` exit 0.

### Mesure
- Budgets comparés à l'exécution : ancien **5 tentatives / 750 ms**, `BUDGET_OLD_COVERS_BURST6=False` ; nouveau **8 tentatives / 6350 ms**, couvre la rafale de 6. En direct : `pwsh: RAW launchRefusals=1/10 … RETRIED surfaced=0/10` — le refus capturé est absorbé par la reprise ; `git: RAW 0/40` (le refus est en rafales, pas en boucle serrée).
- Portée honnête : la cause du refus n'est **pas** identifiée avec certitude (protection temps réel de l'hôte, attribution non prouvée). Ce correctif rend le refus **surmontable et non bloquant**, il ne prétend pas supprimer la cause. Le binaire `2.2.30` est installé (`%APPDATA%\npm\opencodev2.exe`, `--version` → 2.2.30) ; les processus déjà lancés continuent d'exécuter l'ancien code jusqu'à leur redémarrage.

## [v2.2.29] - 2026-09-22

### Fixed
- La création de processus refusée par intermittence sur l'hôte (`EPERM: operation not permitted, uv_spawn 'git'` / `'pwsh.EXE'`, `error launching git: Accès refusé.`) n'atteint plus l'agent : la politique de reprise des lancements transitoires, déjà appliquée aux spawns git du snapshot/worktree/project, est branchée sur les chemins qui font face à l'utilisateur — le shell de l'agent (`src/tool/shell.ts`), la recherche ripgrep (`src/file/ripgrep.ts`) et le spawn du provider (`src/session/prompt.ts`) — et une variante synchrone (`retryTransientLaunchSync`) couvre les helpers `execSync` du démon (`src/daemon/auto-commit.ts`). Le classifieur (`isTransientLaunchFailure`, `packages/core/src/process.ts`) reconnaît le refus sous toutes ses formes observées : `EPERM|EACCES|EBUSY` sur `code`, tag `PermissionDenied`/`Busy` sur `_tag`, texte du wrapper git, et `reason`/`cause` d'un `PlatformError` même lorsque son propre message est vide. Une reprise consommée sans succès restitue l'échec réel, jamais un succès fabriqué.
- L'interruption « Sending the prompt failed. Open console for more details. » de la session « Intégration Pstudio authentification de société » (`ses_f3fcaddb3ffeNxfk9iqKZxqeN6`) est la face TUI du blocage pré-provider déjà corrigé (watchdog `6b0050546`) : cause commune = lancement de processus refusé/cassé, traitée par le même correctif.

### Tests
- `packages/core/test/process/git-launch-retry.test.ts` (6 verts) : classement des refus mesurés sur ce poste, y compris à travers `AppProcessError` (dont le message est vide) et un `PlatformError` de tag `Unknown` dont la cause porte `EPERM` ; reprise d'un effet refusé puis arrêt sur le premier échec réel ; reprise synchrone. Le test à spawn réel a été retiré : sur cet hôte il échoue de façon non déterministe (`Received: 5`).
- `packages/opencode/test/tool/shell-launch-retry.test.ts` (1 vert) : discrimination prouvée par mutation — le spawner injecté refuse le lancement et `starts.count` doit atteindre le budget de reprise ; sans le câblage de `shell.ts`, le test échoue (`Expected: >= 5, Received: 1`), avec lui il passe. Aucun processus réel n'est lancé, donc le test reste déterministe.

### Mesure
- Avant/après sur le spawner réel (`git` 40 itérations, `pwsh` 10) : aucun refus de lancement en boucle serrée (0/40, 0/10) — le refus est **en rafales** : `git checkout` refusé 6 fois de suite pendant la session, `pwsh.EXE` refusé via l'exécuteur, `node → git` refusé (`EPERM`, errno `-4048`). Le discriminant déterministe est donc le test de mutation ci-dessus, pas un comptage de spawns (impossible à garantir sur cet hôte).

## [v2.2.27] - 2026-09-21

### Added
- Allocation de contexte par cible, déterministe et active par défaut (désactivable par `experimental.hot_path.context_slots`) : `src/session/context-ledger.ts` alloue un slot canonique par fichier, URL, commande ou requête, rafraîchi sur place au lieu d'être recopié, de sorte qu'une longue session porte une ligne bornée par cible au lieu d'une série de copies. La fraîcheur est décidée et jamais devinée : tout appel classé mutant avance une époque de session, une observation reste valable tant que l'époque n'a pas bougé et que son TTL (120 s par défaut) n'a pas expiré, et le classement est conservateur — hors liste blanche de lecture seule, un appel est mutant ; `|`, `;`, `&`, backticks, `$(...)` et redirection disqualifient une commande, et un nom de lanceur ne prouve rien (`bun --version` observe, `bun add` installe). Un appel de lecture seule prouvé inchangé est désormais répondu depuis le slot par un avis `[present]` au lieu d'être exécuté : ni aller-retour d'outil, ni seconde copie dans le contexte. Les slots de fichier enregistrent l'union des plages de lignes déjà détenues. La capsule `<context_slots>` — une ligne canonique par cible courante, les cibles périmées étant nommées et non citées — est injectée au prompt à côté de la capsule de progression et reconstruite à chaque tour. Une compaction invalide tous les slots, car seule la synthèse peut avoir fait disparaître l'observation que l'avis promettait. `read` et `inspect_batch` sont exemptés et gardent leur propre compte rendu.
- Juge de pertinence JEV (`src/jev/relevance.ts`, `jev.relevance.enabled`, seuils `threshold` 0.25 et `ambiguous_threshold` 0.6) pour le seul cas que les octets ne tranchent pas : un appel de lecture seule qui ressemble à un quasi-doublon de ce qui est déjà détenu. Il ne refuse jamais un appel, ne demande jamais de permission et ne touche jamais un appel mutant ; sous `jev.shadow` il annote au lieu d'agir ; il est mémoïsé par (outil, arguments, surface observée, seuils) et fail-open.
- Sélecteur de prochaine action JEV (`src/jev/next-action.ts`, `jev.next_action.enabled`) : un choix fermé — continue, reobserve, switch_strategy, verify, answer, blocked — rendu comme une ligne de guidance à côté du résultat. La question est fusionnée dans la requête déjà émise pour la revue, donc un pas coûte au plus un aller-retour JEV quel que soit le nombre de hooks activés, et aucun quand les deux sont éteints.

### Fixed
- Le préfixe de prompt est de nouveau cachable sur toute sa longueur. `applyCaching()` (`src/provider/transform.ts`) ne posait ses deux points d'ancrage glissants que sur les deux derniers messages : le corps de l'historique, réécrit de tour en tour dans le segment `system` par les blocs volatils (working-state, environment_state, goal_reminder, progress_state, avis), était donc refacturé au plein tarif à chaque tour. Les blocs volatils sont désormais sortis du segment `system` et injectés en queue, marqués `<system-reminder>` — reconstruits, jamais persistés, jamais reproduits à l'octet près par le réseau — et le point d'ancrage couvre la fin du tour précédent plus les derniers messages réutilisables, dans la limite de quatre, le plafond du fournisseur. Mesuré sur la session auditée (`ses_f3fcaddb3ffeNxfk9iqKZxqeN6`, 876 pas, `deepseek/deepseek-v4.1-flash`, agent `lean`) : taux de lecture en cache 44,5 % → 90,7 %, coût prompt contrefactuel 1,4325 $ contre 8,2116 $ réellement facturés — environ 70 % du coût de session. Le bloc `skillsList`, stable pour tout le tour et potentiellement volumineux, avait suivi ce déplacement : il appartient au préfixe caché, à côté des instructions et de l'environnement stable, et reste donc dans le segment `system` — seuls les blocs reconstruits à chaque pas vont en queue.
- `Overflow.trigger()` (`src/session/overflow.ts`) devient la source unique du seuil de compaction, et `session_info` publie `limits` (context, usable, reserved, maxOutput, trigger) : la valeur rapportée est celle qui est appliquée, plus une valeur recalculée à côté. Le sondage de la passerelle tranche la question de la fenêtre : `GET /provider/v1/models` annonce `context_length: 1000000` pour `deepseek-v4.1-flash`, la config était donc déjà alignée, et le pivot observé à 160 000 vient de `compaction.absolute_trigger: 160000` (avec `threshold: 0.6` sur 968 000 utilisables), pas d'une fenêtre de 200 k. Le déclenchement anticipé `read_heavy_trigger` ne s'arme plus quand le fournisseur facture la lecture en cache (`cost.cache.read > 0`) : compacter plus tôt jette un préfixe déjà payé et coûte plus que les jetons qu'il économise ; une valeur explicite de l'opérateur reste prioritaire.
- Le harnais contraint le lotissement. Un appel de lecture seule répété dans la même étape est coalescé dans le premier (`ContextLedger.coalesces`, `src/session/context-ledger.ts`, branché dans `src/session/tools.ts` sur l'identifiant du message assistant) au lieu de payer un second aller-retour et d'ajouter une seconde copie des mêmes octets ; un appel mutant n'est jamais coalescé et une revendication ne survit pas à l'étape. Une lecture bornée dit désormais comment continuer : pointeur `offset=` **et** suggestion `grep` (`src/tool/read.ts`), parce que parcourir un long fichier séquentiellement est la façon coûteuse d'atteindre un symbole. Les écritures d'état, elles, sont déjà coalescées : le ledger rafraîchit le slot en place et une seule carte de working-state est ajoutée par étape.

### Tests
- `test/session/overflow.test.ts` (8 verts) : le pivot de la session auditée — contexte 1 000 000 sondé sur la passerelle, `threshold` 0,6, `absolute_trigger` 160 000 → `usable` 968 000, `proportional` 580 800, trigger **160 000**, exactement la valeur observée dans la session auditée (dernier pas sous le seuil 159 967, six pas au-dessus, maximum 161 715) ; bascule faux/vrai à la valeur près ; `read_heavy_trigger` inerte en présence de cache, armé sans cache, prioritaire lorsqu'il est explicite.
- `test/tool/session-info.test.ts` (2 verts) : sortie observée de l'outil — `limits.context` 1 000 000, `usable` 968 000, `trigger` 160 000 — et absence de `limits` lorsqu'aucun modèle ne se résout.
- `src/session/context-ledger.test.ts` (24 verts) : coalescence par étape — cible identique coalescée, cible distincte intacte, revendication jamais reportée à l'étape suivante, appel mutant jamais coalescé, avis `[coalesced]` sans recopie des octets.
- `test/tool/read.test.ts` (56 verts) : un fichier de 2 500 lignes rend `Showing lines 1-2000 of 2500`, `Use offset=2001 to continue` **et** la suggestion `grep`, la ligne 2 500 n'étant pas citée ; un petit fichier conserve `End of file`.
- `test/provider/cache-anchor.test.ts` (4 verts) : ancrage du point d'ancrage ([0,9,10,11]), guidance volatile non cachée ([0,6,7]), budget ≤ 4, préfixe stable quand seule la queue volatile change. `test/provider/transform.test.ts` (224 verts) et `src/session/working-state*.test.ts` inchangés au vert.
- `test/session/context-budget.test.ts` (2 verts) : la couche de test ne fournissait pas `FetchHttpClient` — même besoin non satisfait que dans `prompt.test.ts` (`Service not found: effect/HttpClient`, 0 vert et 2 rouges à HEAD, reproduit par stash puis `git stash pop`). Une fois la couche fournie, le test a désigné le défaut de cacheabilité du bloc `skillsList` décrit ci-dessus, désormais corrigé. Rouges préexistants restants, reproduits sans ces changements : `test/tool/registry.test.ts > hides task background parameter unless experimental background subagents are enabled` (`Received: undefined`, déjà rouge le 2026-09-12 dans le journal de pannes du fork) et les trois tests de références configurées de `test/session/prompt.test.ts`, échouant à l'identique dans l'état entièrement pré-P0 (`git checkout bc4b8df7a -- src/session/prompt.ts test/session/prompt.test.ts`). `bun typecheck` (tsgo) exit 0.
- `src/session/context-ledger.test.ts`, `test/jev/relevance.test.ts`, `test/jev/next-action.test.ts` : 37 tests au vert (classement lecture seule/mutant, fraîcheur par époque et TTL, fusion des plages de lignes, avis de présence, capsule, invalidation par compaction, bandes de pertinence, mémoïsation, fusion en un seul aller-retour). `src/session`, `src/tool` et `test/jev` dans leur ensemble : 356 tests au vert, `bun typecheck` (tsgo) exit 0.
- `test/session/prompt.test.ts` : la couche de test ne fournissait `FetchHttpClient` qu'au registre d'outils, alors que `SessionCompaction.layer` exige `HttpClient` (`src/session/compaction.ts`) ; le besoin non satisfait remontait jusqu'à l'environnement de `SessionPrompt`, et **toute** la suite échouait déjà à HEAD — 0 vert, 14 ignorés, 59 rouges, tous sur `Service not found: effect/HttpClient`. Le fournisseur est désormais passé aussi à la couche `SessionPrompt` : 52 verts mesurés à HEAD (production d'origine) et 53-54 avec ces changements, dont le nouveau test d'intégration « answers a repeated read-only call from the context slot ». Les 8 rouges restants (52 verts) sont préexistants : cinq dépassements de délais internes (3 s, 5 s, 30 s) sur les sous-tâches — `concurrent loop callers all receive same error result` dépasse son propre délai de 3 s à HEAD comme ici (`[3002.00ms] ^ this test timed out after 3000ms`) — et trois tests de références configurées (`Expected: 2, Received: 4` deux fois, `received value must be a non-null object` une fois), reproduits à l'identique avec `prompt.ts` **et** `prompt.test.ts` remis à l'état pré-P0 (`bc4b8df7a`), donc indépendants de ces changements.

## [v2.2.26] - 2026-09-19

### Changed
- Un verdict de garde-fou mémoïsé dont la décision est `allow` est désormais tracé (`jev guard memoised`) : le gain du cache était invisible en production, la décision `allow` — le cas majoritaire — n'émettant aucun log. Le log est additif ; la voie de refus est inchangée.

## [v2.2.25] - 2026-09-19

### Fixed
- Le plan JEV n'est plus tiré pour les requêtes utilitaires : l'agent de génération de titre (`small: true`) traversait le même chemin de préparation et écrasait le plan de la session, gaspillant un aller-retour JEV et injectant un plan calculé pour un prompt que le modèle ne reçoit jamais comme tâche. Mesuré en direct : deux décisions de plan par tour en 2.2.24, une seule en 2.2.25.

## [v2.2.24] - 2026-09-19

### Added
- Trois leviers JEV de réduction du contexte et du nombre de tours, tous additifs et fail-open : (1) compaction — les paires d'appels d'outil les plus lourdes de la tête de compaction sont soumises à JEV, un résultat réfuté est remplacé par un marqueur et un appel réfuté est retiré du transcript, et un échec de JEV renvoie la tête inchangée ; (2) garde-fou — le verdict d'un appel (outil + arguments) est mémoïsé par session et réutilisé sans nouvel appel JEV, invalidé par tout changement d'arguments, de tour, de seuil ou par un nouveau marqueur d'injection ; (3) plan — JEV rend une checklist typée (forme de la réponse attendue + phases requises) injectée dans le contexte de session.

### Tests
- `test/jev/` : 112 tests au vert (compaction, mémoïsation, plan, garde-fou, client, routage, revue).

## [v2.2.23] - 2026-09-19

### Fixed
- Un appel d'outil explicitement demandé par l'utilisateur n'est plus refusé sans recours : la branche `deny` du garde-fou se déclenchait sur le seul niveau de risque, sans consulter la demande utilisateur, contrairement à la branche `ask`. `deny` reste réservé aux appels non demandés ; un refus fondé sur une provenance non fiable reste absolu.

## [v2.2.19] - 2026-09-19

### Fixed
- Harnais d'évaluation : une commande de validation dont l'enfant n'a pas pu démarrer (refus de création de processus Windows — `uv_spawn` EPERM, `cmd.exe` tué sans statut, ou sortie `5` = `ERROR_ACCESS_DENIED`) était comptée comme un **échec de l'artefact**, transformant un démarrage d'enfant intermittent en régression fantôme. `validate()` ne retente désormais qu'une tentative qui n'a produit **aucun verdict** ; un code de sortie réellement émis par la commande est renvoyé tel quel et n'est jamais masqué.

### Tests
- `src/eval` : 86 tests au vert, aucune régression introduite ; les cas auparavant intermittents passent en isolation. Le refus de spawn résiduel qui remonte via `cmd.exe` (sortie `1`) reste hors du prédicat sûr et est documenté comme limite connue.

## [v2.2.18] - 2026-09-19

### Fixed
- Régression de l'auto-démarrage du démon : le démon étant lancé **détaché** (`detached: true` ⇒ `DETACHED_PROCESS`), il n'a plus de console ; ses enfants console (`git`, `bun typecheck`, `cmd`) allouaient donc chacun une **nouvelle fenêtre de terminal visible**, ouverte puis fermée en boucle par la patrouille d'inactivité — l'ordinateur devenait inutilisable. Les 6 sites de spawn non gardés passent désormais `windowsHide: true` (`idle.ts` ×2, `auto-commit.ts` ×2, `auto-pr.ts` ×2) ; les 4 sites déjà gardés (`autostart.ts`, `auto-executor.ts` ×3) le restent.

### Tests
- Nouvelle suite `test/daemon/console-visibility.test.ts` : échoue si un site de spawn de `src/daemon` cesse de déclarer `windowsHide: true` (garde-fou vérifié par mutation : le retrait d'un `windowsHide` fait échouer le test avec le fichier et la ligne fautifs).

## [v2.2.17] - 2026-09-18

### Added
- Auto-démarrage du démon `opencodev2` : toute commande **active** (`tui`, `attach`, `run`, `serve`, `web`) garantit désormais un démon unique en arrière-plan, lancé par une vraie voie de spawn détaché (`spawnDaemonDetached`) et non plus par un simple `daemon start`. Les commandes non actives (`models`, `tasks list`, …) ne démarrent aucun démon. Le démarrage est idempotent — un second appel constate le démon vivant et n'en crée pas un second —, non bloquant, et ne peut jamais faire échouer la commande appelante : `ensureDaemonStarted()` est enveloppé d'un try/catch. L'opt-out `OPENCODE_NO_DAEMON_AUTOSTART=1` est documenté dans `opencodev2 daemon --help`.

### Fixed
- Course au démarrage à froid entre commandes concurrentes : deux commandes actives lancées simultanément pouvaient créer **deux** démons, le contrôle par PID ne voyant rien pendant les plusieurs secondes que prend l'amorçage d'un processus froid. Le démarrage est désormais sérialisé par un verrou fichier (`acquireSpawnLock` : création exclusive `wx`, TTL 30 s, vol du verrou périmé, relâchement par l'enfant après l'écriture du PID) ; deux `serve` simultanés aboutissent à un démon unique, prouvé en exécution réelle.
- `opencodev2 daemon start --detach` est désormais réellement non bloquant (retour ~5 s) et **signale** l'échec de lancement par un code de sortie `1` lorsqu'aucun PID vivant n'apparaît dans les 20 s, au lieu de se terminer silencieusement avec succès.

### Tests
- Nouvelle suite `test/daemon/autostart.test.ts` (8 tests) : prédicat d'auto-démarrage, écriture/lecture du fichier PID, acquisition, expiration et relâchement du verrou de spawn.

## [v2.2.15] - 2026-09-18

### Fixed
- Le retry des lancements `git` refusés par le système (`EPERM`/`EACCES`) livré en v2.2.13 ne se déclenchait **jamais** en production : `AppProcessError` porte un `message` vide, si bien qu'un prédicat qui ne lisait que `error.message` ne reconnaissait jamais un refus réel — le refus ne survit que dans `cause`/`stderr`. Le prédicat (`isTransientLaunchFailure`) est désormais conscient de `cause`/`stderr`, et le retry (`retryTransientLaunch`) est centralisé dans `packages/core/src/process.ts` puis appliqué à **chaque** site de lancement git : snapshot (`git` et `cat-file --batch`), git, worktree, project et core git. Le retry reste limité à l'échec d'AMORÇAGE (processus jamais créé) : il ne peut ni dupliquer une opération ni masquer un code de sortie rendu par git.

## [v2.2.14] - 2026-09-18

### Fixed
- La carte `<working-state>` et le bloc `<task-contract>` injecté dans le prompt divergeaient sur un tour qui relance une mission (`new_topic`) : la carte exigeait que l'ancre du contrat (`anchorUserID`) soit l'utilisateur du tour, alors que l'injection dans le prompt n'applique pas ce filtre. Un contrat actif restait donc injecté dans le prompt tout en étant annoncé « unavailable or stale » sur la carte (`goal: ""`, todo « unanchored »). L'ancre ne filtre plus que les états terminaux : un contrat en cours est désormais visible sur tous les types de tour, tandis qu'un contrat terminé hors ancre (`completed`/`blocked`) et un contrat `skipped` restent masqués sur la carte.

## [v2.2.13] - 2026-09-18

### Fixed
- Un serveur MCP dont la connexion est perdue annonçait « it reconnects automatically in the background — retry shortly » alors que la reconnexion automatique était désactivée (`experimental.mcp_autoreconnect: false`) : le message promettait un retour qui ne pouvait pas se produire. Le texte dépend désormais de la politique réellement active, et distingue la perte survenue en cours d'appel d'outil (résultat perdu, à rejouer) d'un serveur simplement indisponible. Les outils de mémoire durable redeviennent visibles dès que la reconnexion est autorisée.
- Un lancement de `git` refusé par le système (`EPERM`/`EACCES`, « Accès refusé » sur le wrapper `cmd\git.exe`) faisait échouer la commande alors que le processus n'avait jamais démarré. Le lancement est maintenant retenté jusqu'à 4 fois avec une attente exponentielle jitterée. Le retry ne peut pas dupliquer une opération : il ne couvre que l'échec d'AMORÇAGE (le processus n'existe pas), jamais un code de sortie rendu par git.

## [v2.2.12] - 2026-09-18

### Added
- Déduplication des lectures par digest de contenu : un `read` qui redemande exactement les octets d'une lecture précédente de la session reçoit un stub `<duplicate>` au lieu du contenu. L'état est tenu par un ledger persistant par session (`src/tool/read-ledger.ts`), appliqué au moment de l'ÉCRITURE du résultat : aucun message passé n'est réécrit, le préfixe du prompt reste identique octet pour octet et le cache fournisseur n'est donc pas invalidé. Un même digest n'est retenu qu'une fois par époque de compaction — la demande suivante reçoit les octets — et le ledger est borné (512 lectures, 512 contenus, 64 sessions) avec écriture atomique (fichier temporaire puis renommage, `OPENCODE_READ_LEDGER_DIR` pour l'isolation).
- Troisième axe de déduplication, « produced » : un fichier qu'un `write`, `edit` ou `apply_patch` de la session vient d'écrire n'est pas renvoyé en entier par le `read` suivant, le modèle détenant déjà ces octets pour les avoir envoyés comme arguments de son propre appel d'outil. Un stub `<produced>` les remplace ; la preuve est la paire `(mtime, taille)` relevée après l'écriture. La retenue a lieu au plus une fois par version produite et par époque, elle est annulée dès que le fichier bouge ou que la session change, et un horodatage inexploitable (mtime nul) ne sert jamais de preuve.

### Changed
- Le versionnement devient obligatoire : tout changement de code cohérent et vérifié doit être commité, sans attendre une demande explicite de l'utilisateur. La nouvelle formulation est portée par les descriptions d'outils `src/tool/shell/shell.txt` et `src/tool/todowrite.txt`, ainsi que par le texte du todo `[CLOSE]` injecté dans `src/tool/todo.ts`. `push`, `amend` d'un commit déjà poussé, `rebase`, `force-push` et la création de PR restent subordonnés à une demande explicite, car ils engagent l'historique partagé.
- Enregistrer une écriture ajoute un `stat` au chemin de succès : coût mesuré à 0,08 ms en moyenne, contre une médiane de 4,65 ms pour l'exécution d'un `write`, soit environ 1,7 %.

> **Conséquence opérationnelle** — ces descriptions sont importées statiquement au build (`import DESCRIPTION from "./shell.txt"` dans `shell/prompt.ts`, `import DESCRIPTION_WRITE from "./todowrite.txt"` dans `todo.ts`) : elles sont donc **figées dans le binaire**. Après édition, la règle n'atteint le canal embarqué qu'après reconstruction et redéploiement du binaire. Le canal effectif immédiat, sans rebuild, reste `AGENTS.md` (global et projet) et les skills, relus à chaud. Un binaire installé portant encore l'ancienne règle doit être reconstruit avant d'être considéré à jour.

### Tests
- 40 tests unitaires du ledger (suites `produced` et `producedStub` incluses) et 5 tests de bout en bout `tool.read produced-content dedup` : stub après `write`, `edit` et `apply_patch`, octets rendus lorsque le fichier a changé depuis l'écriture, octets rendus après une compaction, et retenue non répétée à la demande suivante (anti-livelock).

## [v2.2.11] - 2026-09-16

> Première version publiée depuis `v2.2.3` : elle agrège les travaux non publiés des versions intermédiaires.

### Added
- Plans de travail de session : chaque modification de tâche persiste le plan complet dans `.opencode/plans/<session>.md` (ou le répertoire de données global hors dépôt git) et ne réinjecte à chaque tour qu'une référence virtuelle `AGENTS.md` compacte — compteurs de progression et phase active — le plan restant lisible sur disque sans consommer de contexte.
- Garde-fous QA pour les vérifications autonomes longues : budgets configurables (étapes, minutes, coût), disjoncteur navigateur, périmètre d'outils et diagnostic de fin, afin d'arrêter une dérive avec une raison observable au lieu d'un échec silencieux.
- Démarrage du worker TUI sous Bun 1.4.0 : le worker émet `worker.ready` après `Rpc.listen` et le parent attend cet événement (échec ou délai de 30 s → arrêt du worker), car une requête RPC émise avant l'installation de `onmessage` était définitivement perdue et `SyncProvider` attendait indéfiniment.
- Résumé de compaction replié par défaut dans le TUI, dépliable au clavier et à la souris.

### Fixed
- Supprime automatiquement un `index.lock` git obsolète (plus de 60 s) avant chaque opération de snapshot (`track`, `patch`, `diff`). Un lock laissé par un processus git tué bloquait encore toutes les captures suivantes (`fatal: Unable to create '.../index.lock': File exists`) et déclenchait des `EPIPE` en cascade (136 erreurs et 131 avertissements dans une seule session).
- Le smoke test de build n'échoue plus sur l'`EPERM` transitoire de spawn du binaire Windows fraîchement lié : retry borné au lieu d'un simple `sleep` fixe.

### Changed
- Réduit le bruit de journal : le `stderr` des serveurs MCP (health-checks du navigateur), les démarrages `tool.registry` et les publications du bus passent d'INFO à DEBUG. Environ 16 000 lignes de log par jour en moins sur une session de travail.

### Tests
- Deux tests de snapshot déterministes : un lock périmé est supprimé et la capture reprend ; un lock frais appartenant à un git concurrent est conservé.

## [v2.2.8] - 2026-09-14

### Changed
- Stabilise le préfixe du prompt système et conserve ses fragments afin d'améliorer la réutilisation du cache fournisseur.
- Impose la localisation préalable des zones pertinentes, les lectures et sorties bornées, ainsi que des critères explicites de délégation.
- Déclenche la compaction à 100 000 tokens, ou dès 80 000 lorsque les sorties de lecture accumulées deviennent importantes.
- Replie par défaut les résumés de compaction dans le TUI, avec expansion accessible au clavier et à la souris.

### Tests
- Couvre la stabilité du préfixe, la politique système, les seuils de compaction et le rendu replié du TUI.

## [v2.2.7] - 2026-09-14

### Fixed
- L’annulation d’un sous-agent attend désormais l’arrêt réel de son runner et de tous ses descendants avant d’afficher l’état terminal `cancelled`; l’état transitoire `cancelling` évite les faux arrêts.
- Corrige l'écran noir avec Bun 1.4.0 : attente explicite du worker après installation de son gestionnaire RPC, avant envoi des requêtes de démarrage. Les messages envoyés pendant ses imports asynchrones pouvaient être perdus.
- Erreur explicite et arrêt du worker en cas d'échec ou après 30 secondes sans confirmation.

### Tests
- Quatre tests avec de vrais workers : imports asynchrones, démarrage immédiat, timeout et erreur.

## [v2.2.6] - 2026-09-14

### Changed
- Reconstruction avec Bun 1.4.0 et alignement du runtime local sur le runtime épinglé. Cette version ne corrigeait pas l'écran noir au démarrage ; le correctif est en 2.2.7.

## [v2.2.5] - 2026-09-14

### Fixed
- Les binaires autonomes Windows sont désormais construits avec Bun 1.4.0 minimum, qui remplace le trampoline TinyCC de `bun:ffi` responsable des segmentation faults après une utilisation TUI prolongée (`oven-sh/bun#31941`, corrigé par `oven-sh/bun#35246`).
- Les recherches `glob` sont interrompues après 30 secondes au lieu de laisser un tour actif indéfiniment, et la réserve configurée déclenche correctement la compaction pour les modèles sans limite d'entrée explicite.

### Tests
- Le build refuse explicitement une cible Windows sous Bun 1.4.0 ; les régressions ciblées couvrent le timeout `glob` et la réserve de compaction.

## [v2.2.4] - 2026-09-14

### Changed
- La continuité autonome dépend désormais d'une prochaine action exécutable plutôt que de la seule présence d'un objectif ou de todos ouverts ; les attentes utilisateur et rapports terminaux ne relancent plus l'agent en boucle.
- Les travaux non triviaux disposent d'un plan de session persistant référencé de façon compacte dans le contexte AGENTS, avec une projection todo bornée autour de la phase active.

### Fixed
- Les questions identiques déjà pendantes sont coalescées afin d'éviter les demandes répétées sans changement d'état.

### Tests
- Couverture ciblée de la décision de continuation, de la persistance/référence du plan, de la projection compacte des todos et de la déduplication des questions.

## [v2.2.3] - 2026-09-13

### Added
- **Fiabilisation de `tool_search`** (`session/tool-catalog.ts`, `session/tools.ts`, `mcp/index.ts`) : la récupération d'outil passe par un ordre de correspondance explicite (`exact_id` > `normalized_id` > `id_token` > `lexical`), un `resolveExact` déterministe (id exact puis normalisé `[\s_-]+`/casse, ambiguïté signalée) et un mode `browse` paginé par id stable, filtrable par `source`/`server` (métadonnées `PreparedTool.source/server`, `MCP.sanitize` exporté).
- **`tool_search` à trois modes** (`search`/`browse`/`activate`) avec états structurés (`already_available`, `reserved`, `capacity_exceeded`, `not_available`, `ambiguous`) et capacité réelle (`max`/`mandatory`/`dynamic`). Les réservations sont plafonnées aux emplacements dynamiques effectivement exposables par la sélection suivante.

### Fixed
- Un identifiant exact contenant `_` (ex. `browser_snapshot`) n'est plus manqué : la normalisation était asymétrique (le `_` n'était réécrit que dans l'index, pas dans la requête). Le classement est désormais indépendant de l'ordre d'enregistrement du catalogue.
- `tool_search` ne sur-promet plus l'exposition : au-delà du budget dynamique réel, la réponse est `capacity_exceeded` au lieu d'un `reserved` voué à être évincé.

### Tests
- `test/session/tool-catalog-reliability.test.ts` : id exact `_`, `write` vs `write_file` (ordre du catalogue), ambiguïté normalisée, pagination/filtres `browse`.
- `test/session/tool-search-benchmark.test.ts` + `script/bench-tool-search.ts` : identity 8/8, lexical 10/10, plafond paraphrase mesuré.
- Suites impactées : 48 pass / 0 fail (catalogue + fournisseur + allowlist + lean policy), 3 pass MCP, `bun typecheck` = 0.
- Documentation : `docs/tool-search-reliability.md`.

## [v2.2.2] - 2026-09-12

### Fixed
- **Lot 6 inclus dans le binaire** : `formatGoalStatusBadge` accepte désormais `Pick<GoalState, "status">` et le test `src/session/goal-status-badge.test.ts` (les 7 états d'objectif, libellés distincts) est livré. Le binaire 2.2.1 avait été construit avant ce changement ; ce build réaligne source et artefact déployé.

## [v2.2.1] - 2026-09-12

### Fixed
- **Clôture pendant un travail asynchrone** (`tool/goal-contract.ts`, lot 5) : `complete_objective` refuse désormais de clôturer tant qu'un job `BackgroundJob` **démarré par cette session** est `running` (filtre `sessionRunningJobs` sur `metadata.parentSessionId`). Un sous-agent en arrière-plan est du travail non résolu, pas une mission terminée : il faut l'attendre (`task action=wait`), collecter son résultat ou l'annuler — ou déclarer `outcome: "blocked"` pour une tâche réellement bloquée. `BackgroundJob` est résolu via `Effect.serviceOption` afin de rester inerte dans les contextes (tests) qui ne le fournissent pas.
- Tests : `src/tool/goal-residual.test.ts` couvre la propriété du job (session étrangère, job fini, job sans métadonnées).

## [v2.2.0] - 2026-09-12

### Added
- **Contrôleur de fin de mission (lots 1–4 du plan)** :
  - `session/tools.ts` — `edit_objective` et `complete_objective` sont désormais **épinglés dans le noyau** dès qu'un objectif est actif, donc accessibles même quand `tool_search` ne trouve rien ou que le plafond d'outils est saturé. C'était la cause racine observée : le modèle ne pouvait clôturer qu'en prose (« complete_objective n'est pas exposé »), ce qui produisait des réponses finales répétées.
  - `session/goal-state.ts` — nouveau champ `deliverable` (`answer | audit | plan | implementation`) inféré par `inferDeliverable()` (verbes d'action vs plan vs audit), pour adapter les règles de clôture à la nature de la mission.
  - `tool/goal-contract.ts` — `blockingResidualFindings()` : pour un objectif `implementation`, un constat `high`/`critical` laissé `residual` **refuse la clôture** (il doit être fermé avec preuve, passé `out_of_scope` par décision explicite, ou l'objectif déclaré `blocked`). Les audits, plans et réponses restent libres de documenter un défaut, conformément au besoin métier.

### Tests
- `src/session/tools-allowlist.test.ts` : pinning des outils de cycle de vie + plafond.
- `src/session/goal-deliverable.test.ts` : inférence de livrable (FR/EN).
- `src/tool/goal-residual.test.ts` : règle residual (bloque en implémentation, jamais en audit/plan/réponse).
- Suites affectées : typecheck 0 ; les 3 échecs `create_objectif`/`edit_objectif` de `goal-contract` sont la baseline préexistante, inchangée.

## [v2.1.0] - 2026-09-12

### Added
- **Redémarrage des serveurs MCP distants** (`config/mcp.ts`, `mcp/index.ts`, `daemon/mcp-control.ts`) : un serveur `type: "remote"` peut déclarer une commande `restart` (tableau de chaînes). OpenCode ne lance pas les serveurs distants ; lorsque la configuration effective d'un serveur change, lors d'un `mcp_reload` forcé, ou via l'action `restart` de `mcp-control`, la commande est exécutée (spawn détaché du scope Effect, attente bornée à 30 s) avant la reconnexion. Une commande lente n'est jamais tuée : l'autoreconnect reprend le relais. L'action `restart` de `mcp-control` exécute désormais la commande au lieu d'un simple disconnect/connect.

### Fixed
- **Hot reload des skills** (`skill/index.ts`, `session/system.ts`, `session/prompt.ts`) : le watcher ne surveillait que le dossier de configuration global. Il couvre désormais toutes les racines de découverte — dossiers de configuration (projet/global/`OPENCODE_CONFIG_DIR`), `.claude`/`.agents` global et remontée projet, et `skills.paths` — avec debounce 300 ms, rechargement complet sur `filename` nul (débordement Windows) et fermeture des watchers au teardown de la couche. Une édition de même longueur n'est plus servie depuis un cache obsolète : le cache de classement est clé par hash du contenu, et le compteur `revision()` incrémenté à chaque reload invalide le cache d'injection du prompt pendant l'exécution.
- Tests : `test/skill/skill.test.ts` (révision + relecture de contenu) et `test/mcp/lifecycle.test.ts` (commande de redémarrage distante sur `restart` et sur reload forcé).

## [v2.0.1] - 2026-09-12

### Changed
- **TUI — erreurs d'outils masquées** : les erreurs d'exécution d'outils (arguments invalides, appel répété bloqué, échec de schéma…) ne sont plus imprimées dans la conversation. Un appel d'outil échoué est seulement marqué d'une croix rouge `✗` — sur la ligne inline (`InlineTool`), sur le titre du bloc (`BlockTool`) et par action dans l'arbre `inspect_batch` — sans exposer le texte destiné à l'agent. Les refus de permission conservent leur barré.

## [v2.0.0] - 2026-09-12

### Added
- **Mission continuity** (`session/turn-intent.ts`, `ensureGoalState`): a turn is now classified as `continuation`, `intervention` (steering) or `new_topic`. An active mission survives lots — a continuation ("ok", "lot 2", "étape suivante", "poursuis") or a steering message re-anchors the objective to the current turn instead of leaving it bound to an older message id, which is exactly what silently disabled auto-continue between lots. Only a substantial new prompt starts a new objective; a terminal objective (completed/skipped/blocked) is still never resurrected by a short reply. Classification is accent- and case-insensitive.
- **Unified stop decision** (`session/continuation.ts` `decideRunDecision`, wired in `session/prompt.ts`): the loop no longer decides to stop from the objective alone. One pure function crosses the objective state, the session todo list, pending tool calls, the step limit and the autocontinue gate, and returns `continue` / `wait` / `stop` with a named reason (`open-objective`, `pending-todos`, `objective-complete`, `objective-blocked`, `awaiting-user`, `mission-skipped`, `no-objective`, `idle-budget`, `step-limit`, `autocontinue-disabled`). Open todos can now keep an autonomous run alive even without a formal contract, and every exit is logged with its reason instead of a bare `exiting loop`.
- **Strict closure** (`tool/goal-contract.ts`): `complete_objective` now takes an `outcome` (`completed` default, or `blocked`). An `unverified` required DoD item no longer counts as done — it keeps the objective open, so a locally fixable gap is more work, not a silent success. A genuine external obstacle is recorded through `outcome: "blocked"`, which requires a reasoned blocker per unproven item and sets the new terminal `blocked` status (badge "bloqué"); a vague or undeclared blocker is refused. The goal reminder and the tool descriptions state the same rule.
- Tests: `session/turn-intent.test.ts` and the new `decideRunDecision` cases in `session/continuation.test.ts`; strict-closure and blocked tests in `test/tool/goal-contract.test.ts`; two end-to-end autonomy tests in `test/session/prompt.test.ts` (a mission kept alive across lots, and an immediate stop on a completed objective). The generated JS SDK was regenerated so the `GoalState` union includes `blocked`.

## [v1.19.30] - 2026-09-12

### Lot 1 — Observation d'environnement
- A per-session **environment observation ledger** (`session/environment.ts`) normalizes what the tools actually saw instead of asking the model to remember it. Every MCP result is recorded with its source, inferred scope (explicit `scope`/`url`/`window`/`tab`/`app` argument, otherwise the tool name), timestamp, attachment count and truth: `observed` for a payload, `error` for a clean MCP `isError`, and `unknown` for a thrown/disconnected call whose action may or may not have happened. Wired into the MCP path in `session/tools.ts`.
- New `environment` native tool: `state` returns the compact current state, `observe` records a structured observation derived from a screenshot or tool result, and `anchor` checks whether an earlier observation id is still current before acting on it. This covers the case where an MCP result is only an image.
- **Superseding and anchoring**: a newer observation of the same scope invalidates the older ones, so acting from a stale screen is detectable. The capsule marks old state `STALE` and reports `last action → truth`.
- A compact `<environment_state>` capsule is injected into the prompt, so a weak model never has to reconstruct where it is, what is fresh, or what is still unknown. Non-environment MCP calls (memory, search) are recorded but excluded from the capsule, while anomalies (`error`/`unknown`) always surface. The capsule is bounded by scope count and character budget.
- Gated by `experimental.hot_path.environment_state` (native tool + lean-core exposure) and `agent.environment_state` (capsule injection), default off, so existing behaviour and the shipped `max_tools` cap are unchanged. Unit tests live in `session/environment.test.ts`.

### Lot 2 — Contrôleur de progression
- New `session/progress.ts` controller: an expectation can be declared before an action (`expect`), the outcome after it is classified (`expected` / `progress` / `different` / `no-progress` / `failed` / `unknown`), an anti-repetition guard warns then blocks, recovery is bounded, and stagnation is counted. Deterministic bookkeeping stays in the harness; planning stays with the model.
- Wired into the MCP path in `session/tools.ts`: before each environment-relevant call the guard runs (`warn` on a repeat, `block` after `MAX_IDENTICAL_REPEATS` repeats with no progress), and after it the verdict is recorded from the normalized observation. A thrown call is recorded as `unknown`, so the next identical retry is warned instead of silently doubling the effect.
- Exposed to the model: `<progress_state>` is injected into the prompt and returned by the `environment` tool `state` action, alongside the Lot 1 capsule. The tool gains an `expect` action and now reports both states.
- Unit tests in `session/progress.test.ts`; end-to-end coverage in `test/tool/registry.test.ts` proves the `environment` tool is registered only when the gate is on, is absent by default, and returns a non-empty capsule after a normalized observation.

### Lot 3 — Adaptateurs et recettes
- New `session/adapters.ts`: explicit descriptors classify an environment call as `browser`, `desktop`, `mobile` or `generic`, replacing the Lot 1 single-regex heuristic. Built-ins cover the servers actually in use (`browser_*` / `web_browser_*` / `chrome-devtools`, Windows-MCP PascalCase plus `dump_ui` / `list_windows` / `press_key`, `mobile_*` / Android / iOS / Appium), and configuration can register overrides ahead of them. Each adapter exposes its own target keys (`url`, `window`, `device`), so scope inference is adapter-aware; observations carry their adapter kind and the capsule shows it.
- New `session/recipes.ts`: reusable recipes (objective, preconditions, steps, verification) with a `draft` / `validated` / `failed` verdict. A recipe is validated only after an observed success and is invalidated by a failure, so a broken path is not replayed. Matching selects the best recipe for the current objective, preferring the active adapter and validated recipes.
- Exposed through the existing gate: the `environment` tool gains `recipes`, `recipe_save` and `recipe_validate` actions, and its `state` now returns the environment, progress and recipe capsules. The prompt injects the recipe matched to the anchored objective and the most recent adapter.
- Unit tests in `session/adapters.test.ts` and `session/recipes.test.ts`; the end-to-end registry test also proves recipe exposure.

## [v1.19.29] - 2026-09-12

### Added
- The session run keeps working after a text-only assistant stop while its anchored objective is still open, instead of treating every reply as the end of the task. Enabled by `agent.autocontinue` (defaults to the lean profile) and bounded to 4 consecutive text-only stops without a tool call, so it cannot loop forever.
- A prompt submitted while a run is already active is delivered to that run at its next step (the TUI marks it `steer`), so the agent can answer the intervention and then resume its task without a new prompt. If the active run settled before consuming it, it falls back to a normal queued turn instead of being lost.

### Fixed
- Delegated subagent follow-ups (`task` action `check`/`wait`/`cancel`) carried no description and rendered as `~ Delegating...` or a bare spinner. They now get explicit labels ("Waiting for/Checking/Stopping subagent"), and the per-message "view subagents" hint is only shown for an actual launch instead of being repeated after every poll.
- `MemoryStore.search` crashed with SQLite `Expression tree is too large (maximum depth 1000)` on long prompts: it built one `LIKE` per word in a flat `OR` chain. Conditions are now deduplicated and folded into a balanced tree (depth O(log n)).
- A failed prompt submission was swallowed by `.catch(() => {})`, making a large or rejected prompt look like it silently "did not start". The error is now logged and surfaced in a toast.

## [v1.19.28] - 2026-09-11

### Fixed
- MCP `prompts()`/`resources()` asked every connected server for its prompts and resources, including servers that never advertised those capabilities. Those servers answer `-32601 Method not found`, which was logged as an error on every enumeration. The client now filters by the capabilities negotiated during `initialize`.

## [v1.19.27] - 2026-09-11

### Fixed
- A stream that emits an extra `reasoning-start` can persist a zero-length reasoning part. Replayed, it became an empty reasoning block, and DeepSeek thinking mode with tools rejected the whole request with HTTP 400 "The `reasoning_content` in the thinking mode must be passed back to the API". Empty reasoning parts without provider metadata are now dropped from replayed context; signed/encrypted reasoning (Anthropic signature, OpenAI item id) is preserved even when empty.

## [v1.19.26] - 2026-09-10

### Fixed
- The `attachment` model capability is honored again: it was stored but never read, so a model declaring image attachments (config or models.dev) was treated as text-only and every image went through the vision fallback, adding a full extra model round-trip of latency. Both the models.dev and config-merge mappings now derive image input from it.
- Multi-image vision fallback analyses run concurrently instead of one after another, so N images no longer cost N sequential model round-trips.

## [v1.19.25] - 2026-09-10

### Fixed
- Token speed no longer reports exaggerated values on tool-heavy turns. Tool-call argument generation is completion output that had no text/reasoning window, so it is now timed and counted, overlapping parallel tool windows are merged, tool execution gaps stay excluded, and an implausible buffered sample is hidden instead of shown.
- `inspect_batch` status icons sit immediately after each action's argument instead of floating in a far-right column, removing the large empty gap on short rows while still reserving the icon on narrow terminals.

## [v1.19.24] - 2026-09-10

### Added
- The lean catalog exposes the full memory lifecycle (store, update, delete, consolidate) next to retrieval, so durable memory is reachable instead of silently missing.

### Changed
- Collapsible "Details" labels in the Context (last call) and Task Contract sidebar sections use the section color instead of the muted tone for readability.

### Fixed
- Token speed is measured over the actual text/reasoning generation windows instead of the assistant turn wall-clock, which mixed in prefill, network, tool execution and permission waits and understated throughput.
- Reasoning replay is forced on for providers that round-trip `reasoning_content` (DeepSeek thinking mode), preventing the HTTP 400 "reasoning_content ... must be passed back to the API" when the measured rollout profile disables replay and the request carries tools.

## [v1.19.21] - 2026-09-09

### Added
- Sidebar distinguishes last-call context/cost, loaded processed tokens, cache ratios, selected-session cost and known descendant costs, with explicit partial-data indicators.
- Opt-in private cache-prefix diagnostics compare structural changes without logging prompt content or duplicating native request preparation.

### Changed
- Default inspection excerpts are bounded outside Lean too; duplicate actions share content and batch JSON is compact.
- Inspection and delegation guidance discourages redundant reads and overlapping parent/child audits while preserving targeted verification.

### Fixed
- Truncation markers fit within inspection excerpt limits without splitting Unicode surrogate pairs.

## [v1.19.20] - 2026-09-08

### Security
- Preserve permissions, ownership and access-control lists when updating existing files. New files are created exclusively with owner-only permissions by default. Existing-file writes deliberately preserve the inode rather than providing atomic replacement.

### Fixed
- Support empty file creation and truncation through the permission-preserving writer.

## [v1.19.19] - 2026-09-07

### Changed
- Compact inspect_batch rows show tool and target first, inline offset/limit/include and dependencies, and a trailing status icon; empty dependency notices and technical IDs are hidden.

### Fixed
- OpenAI/Azure Responses no longer confuse the local tool_search function with hosted tool search, preserving arguments and replay results through a provider-boundary alias.

## [v1.19.18] - 2026-09-07

### Added
- Bounded, request-local attention cards refresh current working state near the end of model requests without accumulating in session history.
- Readable inspect_batch action trees in both terminal session renderers.
- Parent-scoped background subagent cancellation with generation-safe cleanup and resume coordination.

### Changed
- Agent and shell instructions prefer decision-focused terminal output and targeted diagnostics instead of default stack-trace dumps.

## [v1.19.17] - 2026-09-05

### Changed
- Compact terminal results preserve failure evidence, operational controls and received-output journals; terminal polling and historical replay reduce repeated text.
- TODO updates return compact deltas, avoid repeated skill suggestions, and support revision-checked targeted updates while retaining full UI state.

### Fixed
- TODO replay respects serialized snapshot order for parallel calls and recognizes both CLOSE and CLOSURE markers.
- Terminal compaction never opens tool-supplied journal references or lets printed JSON override executor failure status.

## [v1.19.14] - 2026-09-04

### Fixed
- Agent MCP controls now return observed connection state and discovered tool counts, fail instead of reporting false connection success, and force a fresh reconnect/tool discovery on reload.
- MCP transport startup no longer performs a strict duplicate `tools/list` call before the tolerant tool-schema fallback can run.

## [v1.19.3] - 2026-08-27

### Added
- Lean-only dynamic tool catalogs with `off` / `shadow` / `enforce` modes, phase-aware compact cores, strict caps, permission-filtered deferred discovery, and sticky `tool_search` activation for the next model step.

### Changed
- Dynamic tool ranking no longer requires business-domain words to match tool descriptions in Lean enforce mode; non-Lean and legacy `jit_tools` behavior remains unchanged.

## [v1.19.2] - 2026-08-26

### Fixed
- `inspect_batch` now localizes defects emitted by wrapped read tools as well as typed failures, so offsets beyond EOF produce `status: empty` instead of failing the entire batch.

## [v1.19.1] - 2026-08-26

### Fixed
- TypeScript `.ts` files reported by Windows as `video/mp2t` are treated as text instead of being routed to `ffprobe`; video detection now uses an explicit MIME/container allowlist.

## [v1.19.0] - 2026-08-26

### Added
- Native `read` support for DOCX, text/scanned PDF and video: structured text, page provenance, embedded images, bounded keyframes, normalized audio and content-addressed artifacts.
- File and data-URL attachments use the same extraction pipeline; DOCX/video uploads are accepted by the web client with pre-base64 size limits.
- Artifact bytes are persisted by SHA-256 and hydrated only at the provider boundary, keeping binary payloads out of session SQLite rows.

### Security
- OOXML archive traversal/expanded-size limits, PDF page/asset limits, video size/duration/dimension/stream limits, absolute executable discovery, local-only FFmpeg protocols and process timeouts.

## [v1.18.110] - 2026-08-26

### Changed
- Lean `inspect_batch` waves accept up to 16 actions instead of 8 while retaining the 16k total context budget.

## [v1.18.109] - 2026-08-26

### Fixed
- `inspect_batch` classifies a read offset beyond EOF as an `empty` discovery result rather than an error; dependent inspections may continue while genuine read failures remain errors.

## [v1.18.108] - 2026-08-22

### Fixed
- GitHub Copilot streaming accepts models such as Claude Fable that update `reasoning_opaque` multiple times in one response; the latest continuation token is retained instead of failing the turn.

## [v1.18.107] - 2026-08-22

### Fixed
- Post-restart task follow-ups now recover the complete persisted child transcript instead of only the last three text blocks and 4,000 characters.

## [v1.18.106] - 2026-08-22

### Changed
- Subagent reports are no longer truncated for Lean or experimental bounded-result parents; foreground, background notifications, and task follow-ups return the complete child result.
- Lean child prompts still request proportional causal reports, but the runtime no longer discards report content.

## [v1.18.105] - 2026-08-21

### Security
- `workspace_handoff` requests external-directory approval before reading or creating a target outside the current worktree.

## [v1.18.104] - 2026-08-21

### Added
- `workspace_handoff` creates a new root session in another project directory and transfers a bounded redacted objective/findings capsule while preserving the source session.

### Security
- Workspace handoff rejects roots, `.git` and `node_modules`, requires edit/external-directory approval, reports dirty source/target worktrees, and is hidden in non-interactive eval mode.

## [v1.18.103] - 2026-08-21

### Fixed
- Lean mutation causality is scoped to the same artifact for `edit`/`write`, allowing independent evidence reports while still guarding repeated rewrites.
- Browser and integrated Git tool outputs are capped at 8k context characters with full output retained as an artifact.

## [v1.18.102] - 2026-08-20

### Fixed
- `inspect_batch` accepts positive numeric strings from less strict models and localizes synchronous action failures instead of aborting the whole batch.
- Lean mutation causality now covers `edit` and `write` in addition to `apply_patch`.
- Both TUI subagent panels size to their list and display at most five subagents before scrolling; page navigation follows the five-row viewport.

## [v1.18.101] - 2026-08-20

### Added
- Experimental Lean output budget: inspect waves are limited to 8 actions and 16k total; terminal outputs spill full logs and keep a 4k context tail.
- Evidence packets carry workspace fingerprints and report freshness for safe proof reuse.
- Subsequent Lean patches require `causedBy` with the failed check or new observation that justifies the correction.

### Fixed
- Delivery-only DoD wording such as a concise final report no longer causes repeated evidence-gate failures; real business report artifacts remain gated.

## [v1.18.100] - 2026-08-20

### Fixed
- TUI no longer shows a replied or aborted user message as QUEUED when the local time.completed event is stale; finish/error now close the pending marker consistently with the server queue.

## [v1.18.99] - 2026-08-20

### Fixed
- Expose the named 	asks workflow tool so qa:run and project workflows are actually callable by agents.

## [v1.18.98] - 2026-08-20

### Added
- Lean child contract with batching and bounded causal evidence.
- Per-agent step and wall-clock budgets with durable partial states.
- Bounded TaskTool evidence packets merged into parent sticky findings.
- Deterministic qa:run workflow with unconditional reset.
- Per-agent child cost and token metrics in session_info.

### Changed
- Lean prefers planning and workflows for independent read-only branches; writers remain sequential or isolated.

## [v1.18.97] - 2026-08-19

### Added
- Persistance monotone des preuves de completion et findings dans `GoalState`; un finding OPEN bloque la clôture, et sa fermeture exige une preuve indépendante. Les résiduels restent visibles après compaction et via le SDK.
- Advisories structurels du plan-engine pour dépendance optionnelle, fan-out et parallélisme mutatif sans scope; les plans de cache sont désormais revalidés.

### Fixed
- `inspect_batch` déduplique les opérations canoniquement identiques et est annoté read-only par le runtime natif.
- Les sessions DAG deny-all exposent maintenant une allowlist stricte : outils custom et MCP non autorisés disparaissent du catalogue.
- Les notifications terminales de sous-agents portent une clé stable et ne sont plus réinjectées après reprise/callback dupliqué; les résultats bornés restent récupérables dans le transcript enfant.

## [v1.18.96] - 2026-08-19

### Added
- Efficacité Lean opt-in et sûre : `inspect_batch` read-only avec DAG borné, dépendances explicites, permissions par action, sorties plafonnées et erreurs locales ; résumés causaux de sous-agents bornés avec findings sticky ; télémétrie `PhaseCapsule` shadow ; chemin QA et planificateur de risque advisory.

### Changed
- Les contrats goal identiques sont idempotents et ne réécrivent plus la session. Un flag peut masquer les alias français redondants tout en conservant leur compatibilité interne.
- L'orchestrateur DAG exige désormais deux opt-ins et reste strictement read-only ; les écritures sont indisponibles tant que les path locks n'existent pas, et les graphes invalides sont rejetés avant création de sessions.

## [v1.18.95] - 2026-08-19

### Fixed
- File FIFO des prompts : un run frais répond désormais toujours au vrai message utilisateur qui l'a ancré, même si des notifications internes de sous-agents plus récentes restent visibles dans le contexte. Les prompts envoyés pendant un run sont drainés dans l'ordre, chacun reçoit son propre assistant, et les messages suivants ne restent plus bloqués derrière un prompt orphelin.

## [v1.18.94] - 2026-08-18

### Fixed
- Résilience MCP : une session Streamable HTTP expirée (`-32600 Session not found`) déclenche désormais une reconnexion immédiate avant une unique nouvelle tentative, et le client ne capture plus une référence de transport périmée.
- Le health-check MCP exige trois échecs consécutifs avant de déclarer un serveur mort, remet le compteur à zéro après un succès et sérialise les reconnexions concurrentes. Cela évite qu’une pointe de latence de trois secondes coupe un serveur encore sain.

## [v1.18.91] - 2026-08-18

### Fixed
- Rétrocompatibilité des notifications de sous-agents : 1.18.90 marque les nouveaux rapports `background_notification`, mais une session existante peut contenir des rapports synthétiques créés par les versions antérieures sans métadonnée. `ses_feba0c26…` en contenait exactement 12 ; relancer un prompt a donc ressuscité la même file FIFO malgré le correctif, et chaque ancien rapport a de nouveau déclenché un tour. `PromptQueue` reconnaît désormais l’enveloppe synthétique historique `<task …><summary>Background task …` — uniquement quand `synthetic === true`, de sorte qu’un humain collant un texte ressemblant ne soit jamais ignoré — et la traite comme une notification interne visible mais non exécutable.

## [v1.18.90] - 2026-08-18

### Fixed
- Une fin de sous-agent arrière-plan ne réarme plus automatiquement la session parente. Chaque rapport était persisté comme un nouveau message utilisateur *et* lançait `SessionPrompt.loop` : avec 21 enfants, la session devait donc répondre séparément à toute la file FIFO, même des heures après avoir intégré le travail et clos son objectif. Mesuré sur `ses_feba0c26…` : 12 rapports synthétiques datés de 10:54–11:54 ont provoqué 12 nouveaux tours entre 13:21 et 13:22, retardant l’instruction humaine « lancer le Lot 0.4 » ; Stop n’annulait que le run courant, puis le rapport suivant le relançait. Les rapports sont désormais persistés avec `noReply: true` et le marqueur `background_notification` : ils restent visibles au run actif ou au prochain vrai tour, mais sont exclus de la file des prompts et ne déclenchent jamais un appel modèle à eux seuls.

## [v1.18.89] - 2026-08-18

### Changed
- Widget sous-agents : la liste dépliée est désormais scrollable (hauteur bornée) au lieu d'être tronquée par un « +N more », et trie les sous-agents en cours d'exécution en premier.

### Fixed
- Crash fatal du TUI (`TextNodeRenderable only accepts strings`). La cause : le modèle a recopié le marqueur d'élision structurel `{__elided: "string", head: "…"}` comme s'il s'agissait d'un vrai motif de `grep`, ce qui a produit un argument objet là où l'outil attend une chaîne — l'outil a échoué, puis le TUI a planté en insérant cet objet dans un nœud de texte. Double correctif : les entrées des outils en lecture seule ne sont plus du tout rejouées dans le contexte (aucun contenu partiel à recopier — c'est la deuxième fois que le modèle reproduit une élision, d'abord la chaîne tronquée, puis le marqueur lui-même) ; et le TUI affiche désormais les arguments non-chaîne via `JSON.stringify` au lieu de planter, de sorte qu'une entrée malformée ne puisse plus jamais faire tomber l'interface.

### Removed

## [v1.18.88] - 2026-08-17

### Added
- Widget « Subagents » dans le TUI, juste au-dessus du prompt dès qu'une session a des enfants. **Plié par défaut, il n'occupe qu'une seule ligne** : « ▸ Subagents · 2 working · 6 total ». Un clic sur l'en-tête le déplie et affiche une ligne par sous-agent — spinner s'il travaille, tâche, agent, durée et coût — puis **un clic sur une ligne ouvre la session du sous-agent**. L'état plié/déplié est mémorisé entre les redémarrages. Un sous-agent lancé en arrière-plan n'était jusqu'ici visible que par une ligne enfouie dans la transcription — donc facile à oublier et à relancer en double.
- `task` accepte deux actions de suivi sur un `task_id` existant : `action=check` rend compte de l'avancement et renvoie ce que le sous-agent a écrit jusqu'ici sans le déranger, `action=wait` bloque jusqu'à la fin et renvoie son résultat (`timeout_minutes` optionnel). L'agent principal n'a donc plus à choisir entre rester bloqué sur un enfant et l'abandonner : il lance en arrière-plan, continue son travail, consulte quand il veut et reste notifié à la fin.
- Le mode arrière-plan n'est plus derrière `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` : il est disponible par défaut, c'est lui qui rend l'indépendance possible.

### Removed
- Plafond de temps de 15 minutes sur les sous-agents. Il coupait du travail réel pour résoudre un problème d'attente — or le parent n'attend plus. `OPENCODE_TASK_BUDGET_MINUTES` permet de le rétablir si besoin.


### Changed
- Seuil de compaction automatique remonté de 85 % à **95 %** de la fenêtre utilisable. Le seuil bas avait été choisi en supposant que les tokens de contexte coûtent plein tarif — ce qui n'était vrai que parce que le cache du fournisseur était cassé par la synthèse glissante. Une compaction réécrit tout le préfixe (donc jette le cache) *et* dépense un appel de résumé qui relit le contexte entier : de l'ordre de 2,50 $ pour un contexte de 256 k, contre ~0,06 $/tour économisés en portant un contexte plus petit. Le retour sur investissement n'arrive qu'après une quarantaine de tours. `compaction.threshold` reste réglable pour les fournisseurs sans cache de prompt.

## [v1.18.85] - 2026-08-17

### Changed
- Synthèse figée : la frontière de résumé du contexte n'est plus glissante, elle avance par blocs de 20 tours d'outils. Un cache de prompt ne vaut que si le préfixe est identique octet pour octet, et les points de cache du fournisseur sont posés sur les derniers messages — exactement là où la fenêtre glissante réécrivait l'historique. Chaque tour invalidait donc le bloc que le tour précédent venait de mettre en cache. Mesuré sur une session réelle : 134 tours facturés à plus de 100 k tokens d'entrée fraîche pour **106,35 $**, avec seulement 54 046 tokens (le prompt système, invariant) touchant le cache ; les 15 tours qui ont réellement touché le cache ont coûté 1,67 $ à eux tous. Les mêmes 25 M de tokens lus en cache auraient coûté 19,80 $ au lieu de 132,50 $.
- Entre deux sauts de frontière, tout message se rend à l'identique : le préfixe mis en cache s'accumule, un tour sur 20 paie une réécriture, et une session plus courte que le bloc ne résume rien du tout. Même règle appliquée aux entrées d'outils, qui glissaient de la même façon.
- L'épinglage introduit en v1.18.84 ne pinne plus une copie déjà couverte en entier par la queue récente, et ne s'applique qu'au mode `summary` : le mode `off` reste un vrai `off`.

## [v1.18.84] - 2026-08-17

### Fixed
- Livelock de relecture : le rejeu résumé des sorties d'outils évinçait un fichier sur lequel le modèle travaillait encore, qui le redemandait aussitôt — ce qui évinçait le précédent. Mesuré sur un sous-agent `explore` : **167 appels d'outils en 15 minutes pour 57 sorties distinctes**, une même sortie rapatriée 74 fois, en cycle parfait sur 3 fichiers. Comme opencode écrit un message assistant par étape, la fenêtre « 2 derniers tours » valait en pratique « les 2 derniers appels », soit moins que l'ensemble de travail du modèle. La sortie la plus récente de chaque référence distincte (8 au maximum) est désormais conservée en entier quel que soit son âge ; l'économie est prise sur les copies périmées, qui sont précisément le gaspillage que le résumé visait.
- Le stub `<unchanged>` du registre de lecture affirmait « le contenu est déjà dans ton contexte, remonte » alors que le rejeu résumé venait de l'effacer. C'est ce mensonge qui a poussé le modèle à contourner `read` par `bash Get-Content` — hors de portée du registre comme du frein de répétition, qui exige des arguments byte-identiques (163 signatures distinctes pour 167 appels). L'épinglage rend la promesse vraie, et le stub indique désormais la sortie de secours : relire la plage précise avec `offset`/`limit` plutôt que le fichier entier par le shell.

## [v1.18.83] - 2026-08-17

Suite de l'audit de coût : le contexte rejoué ne doit ni mentir au modèle ni le brider.

### Changed
- Le plafond implicite de 50 étapes de la boucle d'agent est supprimé. Il coupait silencieusement un run autonome long alors que rien ne l'avait demandé ; seul un `agent.steps` explicitement configuré arrête désormais la boucle (`reachedStepLimit`). Un agent sans budget déclaré tourne jusqu'à ce que le modèle cesse d'appeler des outils.
- La compaction automatique se déclenche à 85 % de la fenêtre utilisable au lieu de 100 %, réglable via `compaction.threshold` (borné à [0.1, 1]). Compacter seulement à saturation fait payer plein tarif à chaque étape précédente pour un contexte déjà périmé.

### Fixed
- Rejeu du contexte : les arguments des outils porteurs de charge utile (`bash`, `apply_patch`, `edit`, `write`, `todowrite`, `task`, outils MCP) ne sont plus élidés dans l'historique renvoyé au modèle. Le modèle réémettait la troncature qu'il lisait de ses propres appels : sur une session mesurée, 31 des 48 erreurs d'outils venaient de là — 28 patchs `missing Begin/End markers`, 3 `todowrite` invalides, des commandes PowerShell coupées en plein milieu, et deux sous-agents démarrés sur un brief amputé de 96 %.
- Les élisions restantes (outils en lecture seule) sont émises comme objets structurels (`{ __elided: "string", chars: N, head }`) au lieu de chaînes ressemblant à un argument valide, donc inimitables comme corps de patch ou ligne de commande.
- `task` refuse un prompt terminé par un marqueur d'élision : un sous-agent ne voit que ce prompt et n'a aucun moyen de détecter qu'il en manque la majeure partie.
- Garde-fou de frontière dans `session/tools.ts` : tout appel d'outil, local ou MCP, dont un argument se termine par un marqueur d'élision est refusé avant exécution avec un message demandant la réémission complète, au lieu d'exécuter une commande ou un patch tronqué.

## [v1.18.81] - 2026-08-16

### Fixed
- Maintenance SQLite : le checkpoint ajouté en v1.18.80 ne s'exécutait jamais sur une commande courte. `storage/db.ts::close()` n'est appelé nulle part dans le code, et le timer de 5 min n'est pas atteint par un process CLI de quelques secondes — vérifié sur l'installation réelle : après un `debug info` complet en 1.18.80, le WAL restait à 4 621 Mo. Un checkpoint est désormais posé sur la sortie du process (`checkpointOnExit`), déclenché uniquement au-delà de 64 Mo de WAL pour ne pas ralentir les commandes courantes. Mécanisme mesuré sur la base réelle : 4 621 Mo → 0 Mo, sans perte.

## [v1.18.80] - 2026-08-16

Garde-fous issus de l'audit de coût mesuré (`AUDIT-opencodev2.md`) : un plafond, un frein, une sonnette.

### Added
- Frein de cycle sur les appels d'outils (`tool/repetition.ts`), branché dans le point de passage unique `Tool.wrap`. Refuse un appel déjà prouvé improductif : 3 échecs identiques (outil + arguments), ou 3 sorties byte-identiques consécutives. Un appel répété dont la sortie change n'est jamais bloqué. La session auditée avait enchaîné 129 `edit` identiques (127 en erreur) sur 98 tours pour zéro fichier modifié.
- Registre de lecture par session (`tool/read-ledger.ts`) : une relecture dont le contenu est prouvé identique (mtime + taille, ou digest) renvoie un résumé court au lieu du fichier. 71 % des 15 816 `read` mesurés étaient des relectures, soit 91,2 Mo réinjectés en contexte. Le registre est purgé à la compaction, sinon le résumé renverrait vers des octets disparus du contexte.
- Classement des skills piloté par l'usage réel (`skill/usage.ts`) + plafond inconditionnel du catalogue. La branche BM25 existante était contournée quand le tour ne portait pas de texte utilisateur : les 189 skills partaient alors en entier (~13 500 tokens/tour au lieu de ~2 200). 10 places sont réservées aux skills jamais chargés pour préserver la découverte.
- Test de budget de prompt en CI (`session/prompt-budget.test.ts`) : cliquet qui échoue si le catalogue redevient non borné (contrôle positif inclus — la version non plafonnée dépasse 10 000 tokens).
- Détection de régression eval persistante (`eval/regression.ts`), comparée à la médiane historique, et alarme visible dans `opencodev2 eval watch`.
- Budget de temps des sous-agents `task` (15 min par défaut, `OPENCODE_TASK_BUDGET_MINUTES`), en premier plan et en arrière-plan, avec restitution du travail partiel au lieu d'une perte sèche. Le p90 mesuré était de 56 minutes sans aucun timeout.
- Maintenance SQLite périodique (`storage/maintenance.ts`) : checkpoint WAL `TRUNCATE` toutes les 5 min et à la fermeture, étendu aux bases secondaires `memory` et `eval`. Rétention des `part` anciens optionnelle via `OPENCODE_PART_RETENTION_DAYS` (désactivée par défaut, limitée aux parts `tool`, throttlée à 6 h).
- Index `part_time_created_idx` sur `part(time_created)` (migration `20260816133346`), sans lequel une passe de rétention scanne toute la table.

### Fixed
- Régression eval invisible : `detectRegression` comparait chaque run au run *précédent*. Une suite uniformément cassée produit un delta nul, ce qui a laissé passer 36 runs consécutifs à 33 % pendant 58 h en affichant « No regression detected ».
- MCP : l'outil capturait le client par valeur, si bien qu'après une reconnexion automatique réussie il continuait d'appeler le transport mort (`Not connected`) jusqu'à la fin de la session. Le client est désormais résolu à chaque appel, avec une reprise unique sur coupure de transport (les timeouts ne sont pas rejoués).

## [v1.18.79] - 2026-08-15

### Fixed
- IDs: l'espace d'identifiants ascendants (timestamp * 0x1000 tronque a 48 bits) reboucle tous les 795 jours et a reboucle le 2026-08-14T11:19:55Z. Un id frappe apres ce rebouclage trie avant tous ceux ecrits avant : le message disparaissait de toute recherche du "plus recent" (filterCompacted, latest, prompts en file), et le run sortait sur le tour precedent deja clos sans jamais appeler le modele. Les messages sont desormais frappes au-dessus du plus grand id de leur session (`MessageV2.nextID`), ce qui repare les sessions anterieures au rebouclage et neutralise le prochain (2028-10-17).
- Signale en amont : https://github.com/anomalyco/opencode/issues/42798

## [v1.18.78] - 2026-08-15

### Fixed
- Session: un prompt mis en file qu'un run precedent n'a jamais servi est desormais traite par un run frais. Avant, la sortie de boucle le croyait deja repondu (il est plus ancien que les assistants ecrits ensuite par le tour precedent), le run frais sortait sans rien ecrire et l'appelant re-armait indefiniment : boucle serree relisant la session a chaque passe, statut busy/idle qui bascule en continu (TUI bloque sur "esc interrupt" avec spinner qui scintille, 13% de CPU pendant des heures) et tout prompt ulterieur affame derriere lui.

## [v1.18.77] - 2026-08-15

### Fixed
- Session: le run s'arrete a son budget de steps (defaut 50) au lieu de boucler sans fin ; un prompt mis en file n'est plus affame indefiniment.
- Session: un tour tronque par la limite de tokens (finish=length) ou avec une raison non mappee (finish=unknown) continue au lieu d'exiger un "continue" manuel ; un tour en erreur s'arrete toujours.
- Shell: le timeout demande par le modele est plafonne a 15 min (240 appels demandaient 10-30 min ; une commande a bloque une session 5h30).
- Tools: write/edit/apply_patch ne persistent plus toute la carte de diagnostics LSP du projet dans le metadata (parts jusqu'a 11 Mo observees).

## [v1.18.76] - 2026-08-14

### Added
- Daemon: generation auto de skills (24h).

### Fixed
- Daemon: evals reels actives (OPENCODE_DAEMON_EVAL_REAL).
- Eval: timeouts sanity 60s -> 180s (ETIMEDOUT).
- Eval: toolCalls exposent l'action write des diffs.

## [v1.18.73] - 2026-08-03

### Fixed
- **Reprise d'une base au schéma complet mais sans comptabilité de migrations (complète la v1.18.72)** : la v1.18.72 jugeait chaque migration isolément face au schéma final, or une migration ancienne peut avoir été défaite par une plus récente — seules 6 des 23 étaient reconnues et le démarrage échouait toujours. Le palier réellement atteint est désormais déterminé comme le fait un *baseline* : on cherche en partant de la fin la migration la plus récente que la base reflète entièrement (analyse instruction par instruction : `CREATE`, `DROP`, `ALTER ADD/DROP COLUMN`), et tout ce qui la précède est enregistré comme appliqué — les migrations étant appliquées dans l'ordre. Une migration purement destructive ne peut pas fixer ce palier à elle seule. Ce qui suit reste appliqué normalement par drizzle. Test sur le vrai jeu de 23 migrations : `test/storage/db-migrations.test.ts`.

## [v1.18.72] - 2026-08-03

### Fixed
- **Base de données au schéma complet mais sans comptabilité de migrations : démarrage impossible et définitif** — une première exécution interrompue en pleine migration, une copie prise sans son WAL ou une base importée depuis une autre installation laissent les tables en place alors que `__drizzle_migrations` a disparu. Drizzle rejouait alors la migration n°1, `CREATE TABLE \`project\`` échouait puisque la table existait déjà, et les quatre requêtes de démarrage répondaient « Unexpected server error » — à chaque lancement, sans jamais se rétablir. Les migrations dont tous les objets créés existent déjà sont désormais enregistrées comme appliquées (ce sont des non-opérations démontrables sur cette base) ; celles qui modifient ou suppriment restent confiées à drizzle, donc un changement réellement en attente s'applique toujours. Reproduit sous Linux avant/après. Tests : `test/storage/db-migrations.test.ts`.

## [v1.18.71] - 2026-08-03

### Fixed
- **Un `auth.json` illisible rendait le démarrage impossible** (cause la plus fréquente des `4 of 5 requests failed`) : `FileSystem.readJson` appelait `JSON.parse` en synchrone, donc un contenu corrompu devenait un *defect* Effect — et un defect traverse les gardes `Effect.orElseSucceed` / `Effect.option` des appelants. Un `auth.json` tronqué ou rempli d'espaces (écriture interrompue par Ctrl+C, fermeture du terminal, extinction) faisait donc échouer tout le bootstrap, sans issue possible puisque `auth login` exige que l'application démarre. `readJson` échoue désormais avec une erreur typée : un fichier illisible dégrade vers « aucune credential » au lieu de bloquer. Reproduit sous Linux (Docker) avant/après. Tests : `packages/core/test/filesystem` et `test/auth/auth.test.ts` (4 formes de corruption + récupération).
- **Écriture non atomique de `auth.json`** : `writeJson` écrivait directement dans le fichier cible, laissant un contenu partiel si le processus était tué pendant l'écriture — c'est l'origine même de la corruption ci-dessus. L'écriture passe maintenant par un fichier temporaire suivi d'un `rename` (atomique sous POSIX comme sous Windows) : une interruption laisse l'ancien fichier intact.
- **« Unexpected server error. Check server logs for details. » sans autre indication** : le message ne nommait ni l'erreur, ni le fichier, ni l'emplacement du log. Il porte désormais la cause réelle (`nom: message`) et le chemin du fichier de log.

## [v1.18.70] - 2026-08-03

### Fixed
- **Démarrage impossible à cause d'une clé de commentaire `"//"`** : JSON n'ayant pas de commentaires, `"//": "…"` est la convention usuelle (popularisée par package.json) et se retrouve naturellement dans `opencode.json`. Le schéma la traitait comme une clé inconnue et invalidait toute la configuration : le TUI ne démarrait plus (`4 of 5 requests failed`). Les clés préfixées `//` sont désormais ignorées à la validation (les vrais commentaires JSONC restaient déjà acceptés) ; toute autre clé inconnue est toujours signalée. Tests : `test/config/parse.test.ts`.
- **Erreur de configuration masquée par un 500 générique** : une configuration invalide remontait comme *defect* et le middleware HTTP la remplaçait par « Unexpected server error. Check server logs for details. », affiché par le TUI sur les 4 requêtes de démarrage — sans jamais nommer le fichier ni la clé fautive. `ConfigInvalidError` et `ConfigJsonError` sont maintenant renvoyées telles quelles en HTTP 400 ; les clients savent déjà les formater (`FormatError`), donc le TUI affiche désormais le chemin du fichier et la clé en cause.

## [v1.18.69] - 2026-08-03

### Added
- **Logo `opencodev2` dans les README** : nouveaux assets `logo-ornate-v2-light.svg` / `logo-ornate-v2-dark.svg` (mot-symbole `OPENCODEV2`, bichromie `OPEN` atténué + `CODEV2` accentué, V pleine hauteur et 2 segmenté conformes au logo TTY validé). Les 22 README (anglais + 21 traductions) pointent désormais dessus ; les assets `logo-ornate-*` d'origine restent inchangés pour l'UI console/stats.

### Fixed
- **Fallback vision ignoré pour les résultats d'outils** : une image retournée par un outil (`read`, `webfetch`) arrive comme pièce jointe de résultat d'outil, jamais comme part `file` de message — or seul ce second chemin était traité. Avec un modèle sans entrée image, `read` sur une image produisait donc « Image read successfully » et aucun contenu exploitable. L'analyse du modèle de vision configuré (`attachment.image.vision_model`) est maintenant repliée dans le texte de sortie de l'outil et le média inutilisable est retiré. Test de non-régression : `test/session/vision-fallback.test.ts`.
- **Paquet npm `@lux-tech/opencode-ai` incomplet** : le tarball publié ne contenait que 4 fichiers, sans README — la page npm s'affichait donc vide (`readmeFilename: ""`). `publish-fork.ts` copie désormais le README du dépôt dans le méta-paquet et génère un `package.json` complet (`description`, `keywords`, `homepage`, `repository`, `bugs`, `files`, `engines`).

## [v1.18.68] - 2026-08-02

### Changed
- `tui` : le contexte courant (ex. `128k/1.0M (13%)`) s'affiche désormais sur la ligne agent · modèle · fournisseur · variante ; la ligne de statut du prompt n'utilise plus de séparateurs ` . ` (remplacés par des espaces).

### Fixed
- `agent` : le rapport final du mode swarm ne liste plus les points non traités — seuls les vrais bloqueurs sont documentés, avec la raison et la prochaine étape exacte.

## [v1.18.67] - 2026-08-02

### Fixed
- **Logo terminal OPENCODEV2 lisible** : les glyphes officiels `OPEN|CODE` sont conservés strictement ; le suffixe validé utilise un V agrandi sur cinq colonnes et toute la hauteur, sans tronc central pouvant évoquer un Y, ainsi qu'un 2 segmenté. Les rendus TTY et non-TTY sont désormais dérivés d'une source unique et protégés par des tests ciblés.

## [v1.18.66] - 2026-08-02

### Added
- **File d'attente de prompts correcte** : un prompt soumis pendant qu'un agent travaille est désormais exécuté par un **run frais** après que le run courant s'est entièrement terminé (idle) — il n'est plus absorbé dans le tour suivant du même run. Chaque run s'ancre au plus ancien prompt non traité (FIFO) et ignore les prompts plus récents via une vue bornée (`src/session/prompt-queue.ts` : `pendingUserID`/`boundToRun`/`turnClosed`) ; la compaction auto et les subtasks restent fonctionnels. Tests unitaires + test d'intégration « the run settles idle before the queued prompt runs ».
- **Snapshot de contexte fidèle** (`OPENCODE_CONTEXT_FILE`) : le fichier reçoit le payload réellement envoyé au LLM — `system` et `messages` verbatim (parts texte tels quels, autres parts en JSON sans perte) **plus les définitions d'outils** (`prepared.tools`, `execute` exclu) — sans troncature (plafond de 2000 caractères supprimé) et avec un en-tête réduit à une ligne machine-parseable. Objectif : évaluer la qualité du context builder d'opencodev2.
- **Hot-reload des plugins serveur** : les plugins chargés depuis la config globale ou une origine `file://` sont re-initialisés automatiquement quand leur fichier change (watcher @parcel/watcher, debounce 300 ms, erreurs par étape install/compatibilité/entrée publiées via `publishPluginError`).
- **Logo OPENCODEV2** : le logo ASCII (`cli/logo.ts`) et le wordmark non-TTY (`cli/ui.ts`) passent de 8 à 10 glyphes et lisent désormais OPENCODEV2 (V et 2 dessinés dans le même style) ; les zones TUI affichant la version du binaire (home footer, sidebar footer, sidebar session, toast de mise à jour) affichent « OPENCODEV2 + version ».

### Changed
- **Références utilisateur → `opencodev2`** : le message Continue de sortie de session (`opencodev2 -s <id>`), les tips du TUI, l'aide yargs, les messages d'erreur et les prompts utilisateur référencent la commande `opencodev2` ; fixes fonctionnels des chemins d'auto-invocation (`cli/cmd/pr.ts`, `eval/real-runner.ts`, `temporary.ts`).
- **Mode swarm orchestré par l'outil `task`** : le mode agent `swarm` décompose désormais le but en appels `task` parallèles (vagues topologiques) au lieu de l'outil `swarm` dédié — chaque sous-agent s'affiche nativement dans le TUI.
- README traduits resynchronisés sur l'identité opencodev2 ; progression affichée pendant l'import du wizard de migration première-exécution.

### Fixed
- **Blocage indéfini de l'outil shell** : une commande lançant un processus d'arrière-plan long (ex. `opencodev2 serve`) ne terminait jamais — le spawner résolvait sur l'événement `close` (jamais émis quand un petit-fils hérite des handles via `Start-Process -RedirectStandardOutput`) ; il résout désormais sur `exit` (avec drain borné de 200 ms), aligné sur le comportement platform-node.

### Removed
- **Tool `swarm` supprimé** (`src/tool/swarm.ts`, enregistrement dans `tool/registry.ts`) : suringénierie et boîte noire côté TUI. Le mode agent `swarm` (`--agent swarm`, flag `OPENCODE_EXPERIMENTAL_SWARM`) reste et orchestre désormais via l'outil `task` existant — il décompose le but, émet des appels `task` parallèles (même message pour la vague 1, messages suivants pour les dépendances), puis synthétise les résultats `<task>`. Chaque sous-agent s'affiche nativement dans le TUI (footer tabs avec statut en direct, "view subagents", navigation Parent/Prev/Next) car ce sont de vrais appels `task`. Tests swarm du tool retirés ; le mode swarm est conservé dans `test/agent/agent.test.ts` (2 tests) ; `experimentalSwarm` reste dans runtime-flags.

## [v1.18.59] - 2026-08-01

### Added
- **Wizard de migration première-exécution** (`src/cli/migrate.ts`) : au premier lancement interactif, `opencodev2` détecte les données d'une installation opencode existante (config, `auth.json`, sessions) et propose de les importer — copie de `~/.config/opencode` et `~/.local/share/opencode` (DB + WAL/SHM + storage) vers les répertoires `opencodev2`, sans jamais modifier l'original. Options : Importer (recommandé) / Plus tard / Jamais ; marqueur `.migrate-state` (une seule demande) ; override headless `OPENCODEV2_MIGRATE=copy|skip` ; gardes TTY + commandes headless. Tests : `test/cli/migrate.test.ts` (5 tests).

### Changed
- **Identité du fork → `opencodev2`** : le binaire/commande npm est renommé `opencodev2` (clé `bin` de `publish-fork.ts`) et le fork utilise ses propres répertoires de données (`~/.local/share/opencodev2`, `~/.config/opencodev2`, `~/.local/state/opencodev2`, `~/.cache/opencodev2`, `%LOCALAPPDATA%\opencodev2`, `%ProgramData%\opencodev2`) — coexistence complète avec l'opencode officiel, sans conflit de binaire ni de base SQLite.
  - `packages/core/src/global.ts` : `app = "opencodev2"` (chemins Global.Path).
  - Chemins codés en dur renommés : memory/eval/self-improve (`opencodev2/memory.sqlite`, `eval.sqlite`), daemon (pid/log/service/tasks/learnings/notifications/reports/triggers), config managée (`/etc/opencodev2`, `ProgramData\opencodev2`).
  - Auto-invocation (attach, daemon, auto-executor, pr import) et uninstall (`@lux-tech/opencode-ai`) adaptés ; `scriptName("opencodev2")`.
- README racine : sections Installation + Coexistence réécrites pour la coexistence native et le wizard de migration.

### Fixed

### Removed

## [v1.18.58] - 2026-08-01

### Added
- **Agent Swarm mode (natif)** : nouveau mode agent qui décompose une mission en tâches indépendantes, les exécute en vagues parallèles in-process et agrège les résultats.
  - Outil `swarm` (`src/tool/swarm.ts`) : planification topologique des vagues (`planSwarm`), exécution concurrente (`concurrency`), dépendances `depends`, tâches `optional`, isolation des échecs (dépendants skipés avec raison), sessions enfants sous le parent, permissions dérivées du type de sous-agent, annulation des enfants à l'abort, rapport agrégé `<swarm>` échappé, événements bus `swarm.started`/`swarm.task`/`swarm.completed`, mode background (job + injection du rapport dans le parent).
  - Agent natif `swarm` (mode primary) avec prompt d'orchestration `src/agent/prompt/swarm.txt` (arbre de décision prompt → swarm → résultat, règles de décomposition/agrégation/sécurité).
  - Activation : `OPENCODE_EXPERIMENTAL_SWARM=true` (ou `OPENCODE_EXPERIMENTAL=true`) ; l'agent et l'outil sont masqués sans le flag.
  - Tests : `test/tool/swarm.test.ts` (21 tests : vagues, parallélisme prouvé par gates, échecs/skips, échappement, permissions, abort, background) + tests agent dans `test/agent/agent.test.ts`.
  - Doc : `docs/agent-swarm.md` documente le mode natif (recommandé) et l'implémentation config-level existante.
- **Budget de contexte instrumenté** : nouveau test `test/session/context-budget.test.ts` qui capture la requête LLM réelle (TestLLMServer), découpe le system prompt en sections (core/env/instructions/skills/goal/reminder) et mesure chaque point d'entrée du contexte avec budgets anti-régression
- **contextSummary honnête** : les fragments fixes du system prompt (PROMPT_CORE, env, instructions AGENTS.md) sont désormais tracés dans le log « prompt context summary » — le `totalSize` couvre le système complet au lieu des seules sections variables

### Changed
- **Skills list plus légère** : les descriptions des skills sont clippées à 200 chars dans la liste injectée (modes verbose/summary/caveman). Le texte complet reste utilisé pour le ranking BM25 et le tool `skill` — la découverte est inchangée. Mesure réelle : 13 362 → 8 724 chars (-35 %) par tour
- README réécrit pour le fork : installation/mise à jour/désinstallation via `@lux-tech/opencode-ai`, tableau des 12 binaires par plateforme, et section cohabitation avec l'opencode original (conflit de binaire `opencode`, options npx / renommage, vérification du binaire actif)
- 21 README traduits (ar, bn, br, bs, da, de, es, fr, gr, it, ja, ko, no, pl, ru, th, tr, uk, vi, zh, zht) resynchronisés sur la version fork : installation `@lux-tech/opencode-ai`, coexistence fork/original, badges du fork ; suppression des références à l'installation upstream (`opencode.ai/install`, `opencode-ai@latest`, section Desktop App, badge anomalyco)

### Fixed
- **config.instructions perdues silencieusement** : les patterns relatifs (`"./rules.md"`) déclarés dans le fichier de config global étaient résolus uniquement dans l'arbre projet et jamais trouvés. Fallback vers le répertoire de config — les instructions configurées sont maintenant injectées (3 fichiers récupérés dans la config réelle)
- **doublons skill** : avertissement `duplicate skill name` quand plusieurs SKILL.md partagent le même `name` (docx vs word-design-pro) — comportement conservé, uniquement observé

### Removed

## [v1.18.56] - 2026-08-01

### Added
- Auto-reconnexion MCP : un serveur MCP dont le processus meurt ou dont le transport se ferme est détecté (événements `onclose`/`onerror` + health-check périodique par ping JSON-RPC) puis reconnecté automatiquement avec backoff exponentiel (1s → 30s), au lieu de rester affiché « connected » avec des appels en échec
- Options `experimental.mcp_health_interval_ms` (intervalle du health-check, défaut 5000, 0 = désactivé) et `experimental.mcp_autoreconnect` (défaut true)
- Test d'intégration `src/mcp/reconnect.test.ts` + fixture `test/fixtures/dummy-mcp-server.mjs` : tue le processus serveur et vérifie la reconnexion automatique (nouveau pid + outils de nouveau disponibles)

### Fixed
- Le statut MCP restait figé à « connected » après la mort du processus serveur : `mcp_list` affiche désormais `failed` avec la raison dès la détection
- Événements `ToolsChanged` publiés lors d'une déconnexion/reconnexion pour que les clients attach voient les outils revenir

## [v1.18.55] - 2026-08-01

### Added
- Build CI multi-plateforme : workflow `.github/workflows/release-fork.yml` (workflow_dispatch, runner ubuntu, 12 cibles linux/darwin/windows) avec publication npm et création de la release GitHub automatiques
- Script `packages/opencode/script/publish-fork.ts` : publie uniquement les dossiers contenant un binaire et construit le wrapper méta `@lux-tech/opencode-ai`

### Changed
- Publication npm sous le scope `@lux-tech` : wrapper `@lux-tech/opencode-ai` + 12 binaires `@lux-tech/opencode-ai-<plateforme>-<arch>` (13 packages)

### Fixed
- `postinstall.mjs` : résolution du binaire par plateforme/architecture corrigée pour le scope `@lux-tech`
- `installation/index.ts` : `NPM_PACKAGE_NAME` pointe vers `@lux-tech/opencode-ai` (détection latest + upgrade npm/pnpm/bun)

## [v1.18.54] - 2026-07-31

### Changed
- Publication npm initiale du fork sous le scope `@lux-tech/opencode-ai`

### Fixed
- Binaire `dist/opencode-windows-x64/bin/opencode.exe` périmé (v1.15.13) détecté avant publication, remplacé par le build 1.18.54

## [v1.18.52] - 2026-07-30

### Added
- `opencode attach <url>` : démarrage automatique du serveur (`opencode serve`) s'il n'est pas joignable (`ensureServer()` dans `src/cli/cmd/tui/attach.ts`)

### Changed
- Optimisation multi-session : `serve` + `attach` au lieu de N sessions autonomes (RAM divisée par ~2,4 : 3,9 Go → ~1,6 Go)

## [v1.18.51] - 2026-07-28

### Added
- Fallback vision pour les pièces jointes d'images

[Unreleased]: https://github.com/menoxz/opencode/compare/v1.18.58...dev
[v1.18.58]: https://github.com/menoxz/opencode/compare/v1.18.56...v1.18.58
[v1.18.56]: https://github.com/menoxz/opencode/compare/v1.18.55...v1.18.56
[v1.18.55]: https://github.com/menoxz/opencode/compare/v1.18.54...v1.18.55
[v1.18.54]: https://github.com/menoxz/opencode/compare/v1.18.52...v1.18.54
[v1.18.52]: https://github.com/menoxz/opencode/compare/v1.18.51...v1.18.52
[v1.18.51]: https://github.com/menoxz/opencode/releases/tag/v1.18.51
