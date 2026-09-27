# Développement depuis les sources (serveur d'arrière-plan + rechargement)

Objectif : lancer `opencodev2` **depuis les sources du dépôt** — plus jamais le binaire installé — de
sorte qu'une modification de code soit prise en compte sans rebuild ni redéploiement.

## Commandes

| Commande | Effet |
|---|---|
| `bun run dev:tui` | démarre (si besoin) le serveur d'arrière-plan puis ouvre la TUI **issue des sources**, rattachée à ce serveur |
| `bun run dev:up` | démarre seulement le serveur d'arrière-plan |
| `bun run dev:status` | état : racine, entrée, port, PID enregistré, vivant ?, santé HTTP, log |
| `bun run dev:logs` | dernières lignes du log du produit |
| `bun run dev:down` | arrête le serveur d'arrière-plan |

Équivalents directs : `bun run --cwd packages/opencode --conditions=browser src/index.ts dev <action>`.

Options : `--port <n>` (défaut 4096, surchargeable par `OPENCODE_DEV_PORT`), `--watch` / `--no-watch`.

## Comment ça marche

1. `src/dev/source.ts` résout la **racine du dépôt** : soit `OPENCODE_DEV_SOURCE` (et l'entrée doit
   exister), soit — cas normal — le processus doit **réellement exécuter**
   `<racine>/packages/opencode/src/index.ts`, c'est-à-dire que `process.argv[1]` résolu doit être égal
   à l'entrée candidate. Dans un binaire compilé, `import.meta.dir` est un chemin virtuel et l'entrée
   ne correspond pas : la résolution échoue proprement et le runtime retombe sur le binaire installé.
   Exiger la correspondance sur l'entrée *réellement exécutée* — et non la simple présence du dépôt à
   côté du module — empêche les tests, scripts et outils importés depuis le dépôt de prendre
   silencieusement le chemin source.
2. `src/cli/cmd/dev.ts` lance le serveur **`bun --watch --conditions=browser <racine>/packages/opencode/src/index.ts serve --port <port>`**,
   détaché, stdio ignoré, `cwd` = racine du dépôt.
3. `src/cli/cmd/tui/attach.ts` et `src/daemon/autostart.ts` passent par le même resolveur : en mode
   source, ils ne peuvent plus spawner `opencodev2.exe`.

## Points de conception (mesurés, à ne pas « corriger » à l'aveugle)

- **Serveur détaché + stdio redirigé vers un fichier = mort immédiate.** Le serveur démarre puis
  s'arrête dès que le lanceur sort. La combinaison qui tient est `detached: true` + `stdio: "ignore"`
  (celle qu'utilise déjà le démon). Le log du serveur est celui du produit (voir `dev logs`).
- **Aucun état écrit dans le dépôt.** `bun --watch` surveille le `cwd`, donc un fichier d'état écrit
  dans le dépôt serait vu comme une modification de source et relancerait le serveur qui l'a écrit →
  boucle de redémarrage. Les fichiers d'état vivent donc sous `%LOCALAPPDATA%\opencodev2\dev\`.
- **`bun --watch` = redémarrage du serveur, pas HMR.** Une modification de source relance le serveur
  (nouveau PID). L'état vit côté serveur (sessions en base), donc **les sessions survivent** ; le
  client TUI, lui, est jetable : on le relance.
- **La TUI n'a pas de HMR intra-process.** Pour voir une modification de la TUI elle-même, il faut
  relancer `dev:tui`. Une modification du **serveur** est reprise automatiquement.
- **Le port est épinglé** (4096 par défaut) : le port `0` du `serve` par défaut rendrait le serveur
  d'arrière-plan introuvable par les clients.

## Périmètre client : TUI, CLI, puis les GUI

Le TUI et le CLI se rattachent au serveur d'arrière-plan (c'est le chemin couvert par `dev:tui`). Les
GUI se comportent différemment ; le sachoir avant de conclure à un bug :

- **`packages/desktop` (GUI Electron) ne se rattache pas.** `src/main/server.ts:75-81` fork son
  **propre sidecar** (`<dirname>/sidecar.js`) via `utilityProcess.fork`, et `src/main/index.ts:287-312`
  lui choisit son port (`OPENCODE_PORT`, sinon un port éphémère sur `127.0.0.1`). Il ne lance donc
  jamais `opencodev2.exe`, mais il n'utilise pas non plus le serveur source du 4096.
  `bun run dev:desktop` (`package.json:14-15`, `predev` puis `electron-vite dev`) reste un cas à part.
- L'accroche vers un serveur externe existe : `getDefaultServerUrl()` / `setDefaultServerUrl()`
  (`src/main/server.ts:35-47`), adossés à `DEFAULT_SERVER_URL_KEY = "defaultServerUrl"`
  (`src/main/constants.ts:8`) dans le store Electron. C'est la voie d'attache — au contraire,
  `OPENCODE_PORT` ne fait que déplacer le port de son propre sidecar.
- **`packages/app` (GUI web, `bun run dev:web`)** suit le même modèle client/serveur, mais **n'a pas
  été vérifié** dans ce travail : à confirmer avant de s'appuyer dessus.

## Vérifications de référence

- `dev up` → `bun.exe` exécutant `<racine>/packages/opencode/src/index.ts` écoute sur le port, `GET /global/health`
  répond `{"healthy":true,"version":"local"}` (une version numérique signalerait le binaire installé).
- `dev tui` → la table de process montre **simultanément** `… src/index.ts serve --port 4096` (serveur
  source) et `… src/index.ts attach http://127.0.0.1:4096` (client TUI), sans aucun processus
  `opencodev2.exe` supplémentaire.
- `GET /plugin` renvoie `runtime.source = true`, `runtime.root`, `runtime.pid`, `runtime.upSince` :
  un client peut donc toujours vérifier **à chaud** s'il parle au code en cours d'édition.
- Modification d'un fichier de source → sans rebuild ni redéploiement, la réponse de l'API change
  (champ `runtime.pid` absent avant, présent après) et la session créée avant reste lisible.
