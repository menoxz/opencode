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

1. `src/dev/source.ts` résout la **racine du dépôt** (variable `OPENCODE_DEV_SOURCE`, sinon la position
   du module). Dans un binaire compilé, `import.meta.dir` est un chemin virtuel : la résolution échoue
   proprement et le runtime retombe sur le binaire installé.
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

## Vérifications de référence

- `dev up` → `bun.exe` exécutant `<racine>/packages/opencode/src/index.ts` écoute sur le port, `GET /global/health`
  répond `{"healthy":true,"version":"local"}` (une version numérique signalerait le binaire installé).
- `GET /plugin` renvoie `runtime.source = true`, `runtime.root`, `runtime.pid`, `runtime.upSince` :
  un client peut donc toujours vérifier **à chaud** s'il parle au code en cours d'édition.
- Modification d'un fichier de source → sans rebuild ni redéploiement, la réponse de l'API change
  (champ `runtime.pid` absent avant, présent après) et la session créée avant reste lisible.
