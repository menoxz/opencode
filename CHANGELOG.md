# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
