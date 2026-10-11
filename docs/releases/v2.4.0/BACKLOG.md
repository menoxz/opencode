# BACKLOG — 8 correctifs de performance (v2.4.0)

Source de vérité du **quoi**. Pour le statut, voir `PROGRESS.md` (seule autorité).
Chaque item = preuve ancrée + correctif + critère d'acceptation mesurable.

Légende effort : `XS | S | M | L`. Priorité : `1` = plus fort gain, `8` = plus faible.

---

## H1 — Un seul appel provider par round d'outils

- **Priorité / effort** : 1 · **L**
- **Preuve** : `packages/opencode/src/session/llm.ts:367-437` (`streamText({…})`) ne passe
  ni `stopWhen` ni `maxSteps` ; le SDK `ai` retombe sur `stopWhen = stepCountIs(1)`
  (`.bun/ai@6.0.168/.../ai/dist/index.js:4122`). La boucle externe (`session/processor.ts`)
  relance donc un appel complet à chaque round d'outil.
- **Correctif** : activer la continuation multi-step native (`stopWhen: stepCountIs(n)`)
  et laisser la boucle interne enchaîner les rounds d'un même tour, avec un plafond `n`
  borné et configurable.
- **Contrainte** : doit préserver `turn_plan`, `continuation`, `stall-watch`, la compaction et
  les événements `step-start`/`step-finish`. La fiche doit prouver mécanisme par mécanisme
  qu'aucun n'est court-circuité.
- **Critère d'acceptation** : sur un scénario à 5 rounds d'outils, le nombre d'appels
  provider passe de 5 à ≤ 2, et le total `cache_read`/tokens facturés baisse ; `turn_plan`
  reste déclenché et `continuation` s'exécute (journal `auto-continue` inchangé).

## H2 — Cache de prompt explicite sur le provider réellement utilisé

- **Priorité / effort** : 2 · **M**
- **Preuve** : `provider/transform.ts:367-393,475` — `applyCaching` (breakpoints
  `cache_control`) n'est appliqué que pour Anthropic/Claude/Alibaba. `transform.ts:1186-1193`
  — `promptCacheKey` posé seulement pour opencode/venice/openrouter. Le modèle en service
  est `opencode-go/deepseek-v4.1-flash` (openai-compatible) : aucun cachepoint émis.
- **Correctif** : émettre des points de cache explicites pour la famille openai-compatible
  servie (champ supporté par le provider ; à confirmer par fiche), et poser la clé de cache
  par session là où le provider l'accepte.
- **Dépendance** : H3 (le préfixe doit être stable).
- **Critère d'acceptation** : le total `cache_read` d'une session longue augmente et le coût
  facturé par tour baisse, à contexte équivalent ; aucun changement de réponse du provider.

## H3 — Retirer les éléments volatils du segment système mis en cache

- **Priorité / effort** : 3 · **S**
- **Preuve** : `session/system.ts:144` (`Today's date: ${new Date().toDateString()}`) et
  `session/prompt.ts:2307-2314` (`mcp.readiness()` → ligne « outils indisponibles »), tous deux
  poussés dans le préfixe système.
- **Correctif** : déplacer horodatage et état MCP vivant du segment système vers le segment
  `volatile` déjà existant (`prompt.ts:2258-2265`), qui est volontairement hors préfixe.
- **Critère d'acceptation** : le préfixe système est **octet-identique** entre deux tours tant
  qu'aucun fichier d'instruction ne change ; une bascule de santé MCP ne modifie plus le
  préfixe (test par mutation : simuler readiness↔unreadiness, comparer les octets).

## H4 — Un seul spawn git par étape (et non deux)

- **Priorité / effort** : 4 · **M**
- **Preuve** : `session/processor.ts:144` (`trackSnapshot` au pré-appel) et `:708,742-744`
  (`trackSnapshot` + `snapshot.patch` au `step-finish`), sérialisés par un sémaphore monoslot
  (`snapshot/index.ts:73-82`).
- **Correctif** : capturer une seule fois par tour (ou rendre le pré-appel paresseux) ;
  ne pas payer un `git` de plus quand l'étape n'a produit aucune mutation.
- **Critère d'acceptation** : sur un tour à N étapes, le nombre de processus `git` spawnés
  passe de ~2N à ≤ N+1 ; le revert/undo reste correct sur un test qui modifie puis annule.

## H5 — Mémoïser la découverte des fichiers d'instruction

- **Priorité / effort** : 5 · **S**
- **Preuve** : `session/prompt.ts:2201` (`instruction.system()`) appelé par step ;
  `session/instruction.ts:193-213` refait `discoverSystemPaths`/`findUp` (disque) à chaque
  appel ; seul le `read` de contenu est mémoïsé (`instruction.ts:158-166`).
- **Correctif** : mémoïser la liste des chemins découverts par (répertoire, worktree, mtime
  des ancêtres pertinents), et invalider sur changement de fichier d'instruction.
- **Critère d'acceptation** : sur 10 steps d'une même session, le nombre d'appels `fs.stat`/
  `findUp` pour la découverte tombe à 1 ; un `AGENTS.md` ajouté en cours de session est
  détecté au step suivant (test).

## H6 — Shell persistant (fin du spawn par commande)

- **Priorité / effort** : 6 · **M**
- **Preuve** : `tool/shell.ts:627` (`spawner.spawn(cmd(...))`) démarre un process neuf à chaque
  commande ; `tool/shell/shell.ts:101-109` choisit `pwsh` sur Windows. Le prompt de l'outil
  annonce pourtant « a persistent shell session » (`tool/shell/prompt.ts:278`).
- **Correctif** : session shell persistante par session d'agent (process gardé, commandes
  envoyées sur stdin), avec réinitialisation sur changement de `cwd`/`env` ou échec.
- **Risque** : état résiduel entre commandes (variables, `cd`). La fiche doit trancher : soit
  isolation par sous-shell, soit réinitialisation explicite documentée.
- **Critère d'acceptation** : le temps mur d'une rafale de 5 commandes triviales baisse de
  ≥ 40 % (élimination du coût de démarrage pwsh) ; aucune fuite d'état non documentée.

## H7 — Dédupliquer les injections de contexte par tour

- **Priorité / effort** : 7 · **S**
- **Preuve** : objectif/DoD injecté ~3× (`prompt.ts:2411`, `:2488-2502`,
  `working-state.ts:31-66`) ; deux capsules de réutilisation qui se recouvrent
  (`holdings-capsule.ts:24-42` + `context-ledger.ts:554-592`, poussées `prompt.ts:2331` et
  `:2468`) ; un même `AGENTS.md` payable deux fois (`instruction.ts:264-300` système +
  `:310-355` pièce jointe).
- **Correctif** : une seule injection par fait — l'objectif une fois, une capsule de
  réutilisation unique, pas de double `AGENTS.md`.
- **Critère d'acceptation** : le préfixe+queue d'un tour de référence perd les octets des
  copies redondantes (mesure `prompt-budget.test.ts`), sans perte d'information : un test
  vérifie que l'objectif et la DoD restent présents une fois.

## H8 — Retry non destructif et garde-fous

- **Priorité / effort** : 8 · **M**
- **Preuve** : retry session relance tout le stream depuis zéro (`processor.ts:976-1001`),
  le texte déjà streamé est jeté et refacturé ; doublon de couches retry
  (`packages/llm/src/route/executor.ts:35-36` + `session/retry.ts:25-27`) ; aucun timeout
  d'inactivité de stream par défaut (`llm.ts:523-529`).
- **Correctif** : borner/éviter le retry qui repart de zéro sur un stream partiellement
  consommé ; ajouter un timeout d'inactivité par défaut (configurable) ; aligner les deux
  couches de retry.
- **Critère d'acceptation** : sur une erreur transitoire simulée après le premier chunk, le
  travail déjà streamé n'est pas refacturé deux fois ; un stream qui cale est interrompu par
  le timeout au lieu de pendre.

---

## Hors périmètre (assumé)

- **Écritures SQLite par événement** (`sync/index.ts:154-169`, `projectors.ts:185-203`) :
  réel mais proportionnel au nombre d'événements, pas aux tokens. À rouvrir comme item H9
  seulement si les mesures de la phase 4 montrent un coût dominant. Voir `BASELINE.md`
  section I/O.
- **Stream/TUI SSE** (`server/routes/instance/httpapi/handlers/event.ts`) : hors chemin
  critique du tour ; à traiter séparément si le TUI devient le goulot.
